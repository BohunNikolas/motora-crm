import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConfirmButton } from "@/components/confirm-button";
import { addExpense, approveExpense, deleteExpense, deleteCar, setCarStatus, assignParking, createPickerlTask, uploadCarFile, deleteCarFile, reserveCar, completeSale, cancelSale } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { storageConfigured } from "@/lib/storage";
import {
  fmtMoney,
  fmtDate,
  sumMoney,
  carCost,
  carPlannedFinance,
  ogAcquisitionBasis,
  markupPct,
  mhCode,
  internalCode,
  pickerlNeedsAttention,
  requiredDocs,
  isFinancialDoc,
  isPartnerOwner,
  supplierFinance,
  auctionFeeGross,
  auctionTotalBelowVehiclePrice,
  DOC_TYPES,
  DOC_TYPE_LABEL,
  CAR_STATUS,
  CAR_STATUS_ORDER,
  SALES_STATUS_SET,
  TECH_STATUS_SET,
  SALE_FLOW_STATUSES,
  SALE_STAGE,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  SALE_CATEGORY,
  reservationExpired,
  STAGE_LABEL,
  DEAL_TYPE,
  TAX_SCHEME,
  CURRENT_OWNER,
  PURCHASE_CHANNEL,
  IMPORT_ZONE,
  SURCHARGE_BY,
  INTERNAL_INVOICE_PAYMENT,
  SERVICEHEFT,
  JA_NEIN_UNBEKANNT,
  BODY_PART_LABEL,
  type SaleSnapshot,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ perror?: string; pickerl?: string; ferror?: string; serror?: string }>;
}) {
  const { id } = await params;
  const { perror, pickerl, ferror, serror } = await searchParams;
  const user = await requireUser();

  // Redaction (roles-motorhof.md): запрещённые блоки НЕ рендерятся на сервере —
  // их цифр физически нет в HTML, который получает браузер.
  const seeMoney = can(user, "see.margin"); // экономика, расходы €, себестоимость
  const seeAcq = can(user, "see.acquisition"); // закупочные цены/счета (§11)
  const seeInternal = can(user, "see.internalPrice"); // внутренняя продажа e.U.→OG (§9)
  const seeSalePrice = can(user, "see.salePrice");
  const seeExpenses = seeMoney || can(user, "edit.tech"); // TECHNICAL видит расходы по авто (свои сметы)
  const canAdd = can(user, "expense.add") || can(user, "expense.addPending");

  const car = await prisma.car.findUnique({
    where: { id },
    include: {
      expenses: { orderBy: { date: "desc" } },
      deals: { include: { client: true }, orderBy: { createdAt: "desc" } },
      parkingMoves: { orderBy: { movedAt: "desc" }, take: 6 },
      files: { orderBy: { createdAt: "asc" } },
      sales: { include: { client: true, employee: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!car) notFound();

  // Бронь и продажа (§18). Активная бронь / завершённая продажа + справочники для форм.
  const canSell = can(user, "sell");
  const reservedSale = car.sales.find((s) => s.stage === "RESERVED") ?? null;
  const completedSale = car.sales.find((s) => s.stage === "COMPLETED") ?? null;
  const [clients, employees] = canSell
    ? await Promise.all([
        prisma.client.findMany({ orderBy: { name: "asc" } }),
        prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [[], []];

  // Файлы (§8.5). Финансовые документы прячем от SALES/TECHNICAL.
  const seeFinDocs = can(user, "see.acquisition");
  const photos = car.files.filter((f) => f.kind === "PHOTO");
  const documents = car.files.filter(
    (f) => f.kind === "DOCUMENT" && (seeFinDocs || !isFinancialDoc(f.docType))
  );
  const presentDocTypes = new Set(
    car.files.filter((f) => f.kind === "DOCUMENT" && f.docType).map((f) => f.docType as string)
  );
  const docChecklist = requiredDocs(car, presentDocTypes);
  const canUploadPhoto = can(user, "edit.carDescription") || can(user, "edit.tech");
  const canUploadDoc = can(user, "edit.car") || can(user, "sell");
  const canDeleteFile = can(user, "edit.car");
  const storageOk = storageConfigured();

  const canPark = can(user, "edit.car") || can(user, "status.sales") || can(user, "status.tech");
  const PARK_ERRORS: Record<string, string> = {
    row: "Ряд — одна латинская буква A–Z.",
    spot: "Номер места — положительное число.",
    incomplete: "Укажите и ряд, и номер места (или очистите оба).",
    taken: "Это место уже занято другим непроданным авто.",
  };

  const expensesTotal = sumMoney(car.expenses.map((e) => e.amountGross));
  const ogBasis = ogAcquisitionBasis(car); // §9: для партнёрских авто = внутр. счёт
  const cost = carCost(car);
  const fin = carPlannedFinance(car);
  const margin = fin.finalMargin;
  const markup = markupPct(car);

  const specs: [string, string][] = [
    ["VIN", car.vin ?? "—"],
    ["Год", String(car.year)],
    ["Пробег", `${car.mileage.toLocaleString("ru-RU")} км`],
    ["КПП", car.transmission ?? "—"],
    ["Топливо", car.fuel ?? "—"],
    ["Мощность", car.leistung ? `${car.leistung} кВт` : "—"],
    ["Цвет", car.color ?? "—"],
    ["Владельцев", car.voranmeldungen != null ? String(car.voranmeldungen) : "неизв."],
    ["Ключей", car.keysCount != null ? String(car.keysCount) : "неизв."],
    ["Владелец", CURRENT_OWNER[car.currentOwner] ?? car.currentOwner],
    ["Канал закупки", car.purchaseChannel ? PURCHASE_CHANNEL[car.purchaseChannel] ?? car.purchaseChannel : "—"],
  ];
  const nachParts = car.nachlackierungenParts.map((p) => BODY_PART_LABEL[p] ?? p).join(", ");
  const pickerlAlert = pickerlNeedsAttention(car);

  // Владелец и внутренняя продажа e.U. → OG (§9).
  const isPartner = isPartnerOwner(car.currentOwner);
  const supplierFin = seeInternal && isPartner ? supplierFinance(car) : null;

  // Бронь/продажа (§18) — производные для форм и сводки.
  const seeMinPrice = can(user, "see.minPrice");
  const today = new Date().toISOString().slice(0, 10);
  const defaultSalePrice = (car.plannedSalePriceGross ?? car.listPrice).toString();
  const saleSnap = (completedSale?.financialSnapshot ?? null) as SaleSnapshot | null;
  const reservationIsExpired = reservedSale ? reservationExpired(reservedSale) : false;

  // Форма продажи (§18.2), переиспользуется для «продать сразу» и «продать из брони».
  const sellForm = (defaultClientId: string | null) => (
    <form action={completeSale.bind(null, car.id)} className="mt-3 flex flex-col gap-2.5">
      <select name="clientId" required className="field text-[13px]" defaultValue={defaultClientId ?? ""}>
        <option value="" disabled>Покупатель *</option>
        {clients.map((c) => (<option key={c.id} value={c.id}>{c.name} · {c.phone}</option>))}
      </select>
      <div className="flex gap-2">
        <label className="flex-1"><span className="label">Цена продажи * €</span>
          <input type="number" step="0.01" min={0} name="actualSalePriceGross" required defaultValue={defaultSalePrice} className="field mono" /></label>
        <label className="flex-1"><span className="label">Пробег при продаже</span>
          <input type="number" min={0} name="mileageAtSale" defaultValue={car.mileage} className="field mono" /></label>
      </div>
      <div className="flex gap-2">
        <label className="flex-1"><span className="label">Дата продажи</span>
          <input type="date" name="saleDate" defaultValue={today} className="field" /></label>
        <label className="flex-1"><span className="label">Выдача *</span>
          <input type="date" name="deliveryDate" required defaultValue={today} className="field" /></label>
      </div>
      <div className="flex gap-2">
        <label className="flex-1"><span className="label">Статус оплаты *</span>
          <select name="paymentStatus" required className="field" defaultValue="">
            <option value="" disabled>—</option>
            {Object.entries(PAYMENT_STATUS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select></label>
        <label className="flex-1"><span className="label">Способ оплаты *</span>
          <select name="paymentMethod" required className="field" defaultValue="">
            <option value="" disabled>—</option>
            {Object.entries(PAYMENT_METHOD).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select></label>
      </div>
      <div className="flex gap-2">
        <label className="flex-1"><span className="label">Категория *</span>
          <select name="saleCategory" required className="field" defaultValue="">
            <option value="" disabled>—</option>
            {Object.entries(SALE_CATEGORY).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select></label>
        <label className="flex-1"><span className="label">Менеджер</span>
          <select name="employeeUserId" className="field" defaultValue={user.id}>
            {employees.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </select></label>
      </div>
      {car.minimumSalePriceGross && seeMinPrice && (
        <p className="text-[12px] text-muted">Mindestpreis {fmtMoney(car.minimumSalePriceGross)} — продажа ниже требует override PARTNER/ADMIN.</p>
      )}
      <button type="submit" className="btn btn-primary">Оформить продажу</button>
    </form>
  );

  // Канал закупки (§11) — детали видны под see.acquisition.
  const feeGross = auctionFeeGross(car);
  const auctionBelow = auctionTotalBelowVehiclePrice(car);
  const acqRow = (label: string, value: string | null) =>
    value ? (
      <div className="flex justify-between gap-3">
        <dt className="text-muted">{label}</dt>
        <dd className="mono">{value}</dd>
      </div>
    ) : null;

  return (
    <div>
      <header className="animate-in mb-6">
        <Link href="/cars" className="text-[13px] font-semibold text-muted hover:text-ink">
          ← Автомобили
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <div className="mono mb-1 text-[13px] font-bold text-muted">{internalCode(car)}</div>
            <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">
              {car.make} {car.model}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <span className={`chip ${CAR_STATUS[car.status]?.cls ?? "chip-muted"}`}>
                {CAR_STATUS[car.status]?.label ?? car.status}
              </span>
              <span className="text-sm text-muted">
                {car.year} · {car.mileage.toLocaleString("ru-RU")} км · в базе с {fmtDate(car.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {can(user, "edit.car") && (
              <Link href={`/cars/${car.id}/edit`} className="btn btn-ghost">Редактировать</Link>
            )}
            {can(user, "delete.any") && (
              <form action={deleteCar.bind(null, car.id)}>
                <ConfirmButton
                  message={`Удалить ${car.make} ${car.model}? Расходы по авто удалятся вместе с ним. Действие необратимо.`}
                >
                  Удалить
                </ConfirmButton>
              </form>
            )}
          </div>
        </div>
      </header>

      {ferror && (
        <div className="animate-in mb-4 rounded-xl border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-4 py-3 text-[14px] text-red">
          {ferror === "filetype"
            ? "Формат не поддерживается — только JPG, PNG, WEBP или PDF."
            : ferror === "filesize"
              ? "Файл слишком большой (максимум 12 МБ)."
              : "Не удалось загрузить файл — выберите файл и повторите."}
        </div>
      )}

      {serror && (
        <div className="animate-in mb-4 rounded-xl border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-4 py-3 text-[14px] text-red">
          {serror === "reserve-fields"
            ? "Для брони укажите клиента и срок действия брони."
            : serror === "already-reserved"
              ? "Авто уже забронировано — сначала отмените текущую бронь."
              : serror === "sale-fields"
                ? "Заполните обязательные поля продажи: клиент, цена, дата поставки, статус и способ оплаты, категория."
                : serror === "below-min"
                  ? "Цена ниже Mindestverkaufspreis — нужен override роли PARTNER/ADMIN."
                  : "Не удалось выполнить действие."}
        </div>
      )}

      {/* §9: партнёрское авто продано без внутреннего счёта e.U.→OG — незавершённость видна всем. */}
      {car.awaitingInternalInvoice && (
        <div className="animate-in mb-4 rounded-xl border border-[rgba(242,163,60,0.4)] bg-[var(--accent-dim)] px-4 py-3 text-[14px]">
          <b>Ожидает внутренний счёт e.U. → OG.</b> Авто продано, но фактический внутренний
          Verkaufspreis и данные счёта ещё не подтверждены (§9). Внесите их в форме
          редактирования, чтобы завершить внутреннюю продажу.
        </div>
      )}

      {/* Модалка предложения создать Pickerl-задачу (§8.4) — только сразу после
          сохранения (по query-параметру), не при каждом рендере. */}
      {pickerl === "ask" && can(user, "task.manage") && (
        <div className="animate-in mb-4 flex items-center justify-between gap-4 rounded-xl border border-[rgba(242,163,60,0.3)] bg-[var(--accent-dim)] p-4">
          <p className="text-[14px]">
            Для <b>{internalCode(car)} {car.make} {car.model}</b> требуется Pickerl (§57a). Создать задачу по прохождению?
          </p>
          <div className="flex shrink-0 gap-2">
            <form action={createPickerlTask.bind(null, car.id)}>
              <button type="submit" className="btn btn-primary !py-1.5">Создать задачу</button>
            </form>
            <Link href={`/cars/${car.id}`} className="btn btn-ghost !py-1.5">Не сейчас</Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 flex flex-col gap-4">
          <section className="panel animate-in delay-1 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Характеристики</h2>
            <dl className="grid grid-cols-4 gap-y-4">
              {specs.map(([k, v]) => (
                <div key={k}>
                  <dt className="label mb-1">{k}</dt>
                  <dd className={`text-[14px] ${k === "VIN" ? "mono text-[13px]" : ""}`}>{v}</dd>
                </div>
              ))}
            </dl>
            {car.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="label mb-1.5">Заметки</div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{car.notes}</p>
              </div>
            )}
          </section>

          {/* Владелец и внутренняя продажа e.U. → OG (§9) — только see.internalPrice. */}
          {seeInternal && isPartner && (
            <section className="panel animate-in delay-1 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-bold">Внутренняя продажа e.U. → OG</h2>
                <div className="flex items-center gap-2">
                  <span className="chip chip-muted">{CURRENT_OWNER[car.currentOwner] ?? car.currentOwner}</span>
                  <span className={`chip ${car.internalInvoicePaymentStatus === "PAID" ? "chip-green" : "chip-amber"}`}>
                    {INTERNAL_INVOICE_PAYMENT[car.internalInvoicePaymentStatus] ?? car.internalInvoicePaymentStatus}
                  </span>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Закупка поставщика</dt>
                  <dd className="mono">{car.partnerPurchasePrice ? fmtMoney(car.partnerPurchasePrice) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Общая стоимость приобр.</dt>
                  <dd className="mono">{car.partnerAcquisitionCost ? fmtMoney(car.partnerAcquisitionCost) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Внутр. Verkaufspreis (план)</dt>
                  <dd className="mono">{car.plannedInternalTransferPrice ? fmtMoney(car.plannedInternalTransferPrice) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Внутр. Verkaufspreis (факт)</dt>
                  <dd className="mono font-bold">{car.actualInternalTransferPrice ? fmtMoney(car.actualInternalTransferPrice) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">№ внутр. счёта</dt>
                  <dd className="mono">{car.internalInvoiceNumber ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Дата счёта</dt>
                  <dd>{car.internalInvoiceDate ? fmtDate(car.internalInvoiceDate) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Режим внутр. счёта</dt>
                  <dd>{car.internalInvoiceTaxScheme ? TAX_SCHEME[car.internalInvoiceTaxScheme] ?? car.internalInvoiceTaxScheme : "—"}</dd>
                </div>
              </dl>

              {/* Два независимых результата — не смешивать (§9). */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="label mb-1">Результат поставляющей компании</div>
                  {supplierFin ? (
                    <>
                      <div className={`mono text-[20px] font-bold leading-none ${supplierFin.finalMargin.gte(0) ? "text-green" : "text-red"}`}>
                        {fmtMoney(supplierFin.finalMargin)}
                      </div>
                      <div className="mt-1.5 text-[12px] text-muted">
                        {supplierFin.taxScheme === "REGELBESTEUERUNG" ? "Ausgangs-USt" : "Differenz-USt"} {fmtMoney(supplierFin.vatAmount)}
                        {!supplierFin.isConfirmed && " · режим не определён"}
                      </div>
                    </>
                  ) : (
                    <div className="text-[13px] text-muted">Нет внутренней цены — результат не рассчитан.</div>
                  )}
                </div>
                <div className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="label mb-1">Результат MOTORHOF OG</div>
                  <div className={`mono text-[20px] font-bold leading-none ${margin.gte(0) ? "text-green" : "text-red"}`}>
                    {fmtMoney(margin)}
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted">
                    себестоимость от внутр. счёта · наценка {markup}%
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Закупка по каналу (§11) — детали под see.acquisition (закупочные цены/счета). */}
          {seeAcq && car.purchaseChannel && car.purchaseChannel !== "PRIVAT" && (
            <section className="panel animate-in delay-1 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-bold">Закупка · {PURCHASE_CHANNEL[car.purchaseChannel] ?? car.purchaseChannel}</h2>
                {car.purchaseChannel === "AUKTION" && auctionBelow && (
                  <span className="chip chip-amber">gesamt &lt; Fahrzeugpreis (override)</span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
                {car.purchaseChannel === "AUKTION" && (<>
                  {acqRow("Fahrzeugpreis", car.auctionVehiclePrice ? fmtMoney(car.auctionVehiclePrice) : null)}
                  {acqRow("Auktionsgebühr netto", car.auctionFeeNet ? fmtMoney(car.auctionFeeNet) : null)}
                  {acqRow("USt на комиссию", car.auctionFeeVat ? fmtMoney(car.auctionFeeVat) : null)}
                  {acqRow("Auktionsgebühr brutto", feeGross ? fmtMoney(feeGross) : null)}
                  {acqRow("Transportkosten", car.auctionTransportCost ? fmtMoney(car.auctionTransportCost) : null)}
                  {acqRow("Sonstige Gebühren", car.auctionOtherFees ? fmtMoney(car.auctionOtherFees) : null)}
                  <div className="col-span-2 flex justify-between gap-3 border-t border-line pt-2.5 font-bold">
                    <dt>Auktionsrechnung gesamt</dt>
                    <dd className="mono">{car.auctionInvoiceTotal ? fmtMoney(car.auctionInvoiceTotal) : "—"}</dd>
                  </div>
                  {acqRow("№ счёта", car.auctionInvoiceNumber)}
                  {acqRow("Поставщик", car.auctionSupplier)}
                  {acqRow("Страна", car.auctionCountry)}
                </>)}
                {car.purchaseChannel === "HAENDLER" && (<>
                  {acqRow("Поставщик", car.haendlerSupplier)}
                  {acqRow("№ счёта", car.haendlerInvoiceNumber)}
                  {acqRow("Дата счёта", car.haendlerInvoiceDate ? fmtDate(car.haendlerInvoiceDate) : null)}
                  {acqRow("Purchase netto", car.haendlerPurchaseNet ? fmtMoney(car.haendlerPurchaseNet) : null)}
                  {acqRow("Purchase USt", car.haendlerPurchaseVat ? fmtMoney(car.haendlerPurchaseVat) : null)}
                  {acqRow("Purchase brutto", car.haendlerPurchaseGross ? fmtMoney(car.haendlerPurchaseGross) : null)}
                  {acqRow("Vorsteuer выделена", car.haendlerVorsteuerAusgewiesen ? "Ja" : "Nein")}
                </>)}
                {car.purchaseChannel === "INZAHLUNGNAHME" && (<>
                  {acqRow("Оценочная стоимость", car.tradeInEstimatedValue ? fmtMoney(car.tradeInEstimatedValue) : null)}
                  {acqRow("Зачётная стоимость", car.tradeInCreditValue ? fmtMoney(car.tradeInCreditValue) : null)}
                  {acqRow("Доплата", car.tradeInSurcharge ? fmtMoney(car.tradeInSurcharge) : null)}
                  {acqRow("Кто доплачивает", car.tradeInSurchargeBy ? SURCHARGE_BY[car.tradeInSurchargeBy] ?? car.tradeInSurchargeBy : null)}
                </>)}
                {car.purchaseChannel === "IMPORT" && (<>
                  {acqRow("Страна", car.importCountry)}
                  {acqRow("Зона", car.importZone ? IMPORT_ZONE[car.importZone] ?? car.importZone : null)}
                  {acqRow("Валюта счёта", car.importCurrency)}
                  {acqRow("Курс к EUR", car.importExchangeRate ? car.importExchangeRate.toString() : null)}
                  {acqRow("Сумма счёта", car.importInvoiceAmount ? car.importInvoiceAmount.toString() : null)}
                  {acqRow("Транспорт", car.importTransportCost ? fmtMoney(car.importTransportCost) : null)}
                  {acqRow("Zoll", car.importZoll ? fmtMoney(car.importZoll) : null)}
                  {acqRow("Einfuhrumsatzsteuer", car.importEust ? fmtMoney(car.importEust) : null)}
                  {acqRow("NoVA", car.importNova ? fmtMoney(car.importNova) : null)}
                  {acqRow("Прочие расходы", car.importOtherCosts ? fmtMoney(car.importOtherCosts) : null)}
                </>)}
              </dl>
            </section>
          )}

          {/* Техническая карта (§8.2–8.4) — видна всем вошедшим (техчасть). */}
          <section className="panel animate-in delay-2 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Техническая карта</h2>
            <dl className="grid grid-cols-3 gap-y-4">
              <div>
                <dt className="label mb-1">Serviceheft</dt>
                <dd className="text-[14px]">{SERVICEHEFT[car.serviceheft] ?? car.serviceheft}</dd>
              </div>
              <div>
                <dt className="label mb-1">Nachlackierungen</dt>
                <dd className="text-[14px]">{JA_NEIN_UNBEKANNT[car.nachlackierungen] ?? car.nachlackierungen}</dd>
              </div>
              <div>
                <dt className="label mb-1">Pickerl</dt>
                <dd className="flex items-center gap-2 text-[14px]">
                  {JA_NEIN_UNBEKANNT[car.pickerlVorhanden] ?? car.pickerlVorhanden}
                  {car.pickerlVorhanden === "JA" && car.pickerlMonth && car.pickerlYear && (
                    <span className="text-muted">
                      · {String(car.pickerlMonth).padStart(2, "0")}.{car.pickerlYear}
                    </span>
                  )}
                  {pickerlAlert && <span className="chip chip-red !px-1.5 !text-[10px]">внимание</span>}
                </dd>
              </div>
            </dl>
            {car.nachlackierungen === "JA" && nachParts && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="label mb-1">Перекрашенные части</div>
                <p className="text-[13px]">{nachParts}</p>
              </div>
            )}
            {(car.serviceComment || car.pickerlComment || car.nachlackierungenComment) && (
              <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-[13px] text-muted">
                {car.serviceComment && <div>Сервис: {car.serviceComment}</div>}
                {car.nachlackierungenComment && <div>Покраска: {car.nachlackierungenComment}</div>}
                {car.pickerlComment && <div>Pickerl: {car.pickerlComment}</div>}
              </div>
            )}
          </section>

          {/* Фотографии (§8.5) */}
          <section className="panel animate-in delay-2 p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">Фотографии</h2>
              {photos.length === 0 ? (
                <span className="chip chip-amber !text-[10px]">без фото</span>
              ) : (
                <span className="text-[13px] text-muted">{photos.length}</span>
              )}
            </div>
            {photos.length > 0 && (
              <div className="mb-4 grid grid-cols-4 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${p.id}`} alt={p.filename} className="h-full w-full object-cover" />
                    {canDeleteFile && (
                      <form action={deleteCarFile.bind(null, p.id, car.id)} className="absolute right-1 top-1">
                        <button type="submit" title="Удалить фото" className="rounded-md bg-black/60 px-1.5 py-0.5 text-[12px] text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--red)]">
                          ✕
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canUploadPhoto && storageOk && (
              <form action={uploadCarFile.bind(null, car.id, "PHOTO")} className="flex items-center gap-2">
                <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="field flex-1 !py-1.5 text-[13px]" />
                <button type="submit" className="btn btn-ghost">Загрузить</button>
              </form>
            )}
            {!storageOk && (
              <p className="text-[12px] text-muted">Хранилище файлов не настроено (S3_* переменные).</p>
            )}
          </section>

          {/* Документы (§8.5) */}
          <section className="panel animate-in delay-3 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Документы</h2>

            <div className="mb-4 flex flex-col gap-1.5">
              {docChecklist.map((d) => (
                <div key={d.label} className="flex items-center gap-2 text-[13px]">
                  <span className={d.present ? "text-green" : "text-red"}>{d.present ? "✓" : "✗"}</span>
                  <span className={d.present ? "" : "text-muted"}>{d.label}</span>
                  {!d.present && <span className="text-[11px] text-red">не загружен</span>}
                </div>
              ))}
            </div>

            {documents.length > 0 && (
              <div className="mb-4 flex flex-col border-t border-line pt-2">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between border-b border-line py-2 last:border-none">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium">
                        {DOC_TYPE_LABEL[d.docType ?? ""] ?? "Документ"}
                      </div>
                      <div className="truncate text-[12px] text-muted">{d.filename}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <a href={`/api/files/${d.id}?download=1`} className="btn btn-ghost !px-3 !py-1 !text-[12px]">Скачать</a>
                      {canDeleteFile && (
                        <form action={deleteCarFile.bind(null, d.id, car.id)}>
                          <button type="submit" title="Удалить" className="rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:bg-[var(--red-dim)] hover:text-red">✕</button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canUploadDoc && storageOk && (
              <form action={uploadCarFile.bind(null, car.id, "DOCUMENT")} className="flex flex-wrap items-center gap-2">
                <select name="docType" className="field w-[220px] !py-1.5 text-[13px]" defaultValue="KAUFVERTRAG">
                  {DOC_TYPES.filter((t) => seeFinDocs || !t.financial).map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="field flex-1 !py-1.5 text-[13px]" />
                <button type="submit" className="btn btn-ghost">Загрузить</button>
              </form>
            )}
          </section>

          {seeExpenses && (
          <section className="panel animate-in delay-2 p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">Расходы на подготовку</h2>
              <span className="mono text-[14px] font-bold">
                {expensesTotal.gt(0) ? fmtMoney(expensesTotal) : "—"}
              </span>
            </div>

            {car.expenses.length > 0 && (
              <div className="mb-4 flex flex-col">
                {car.expenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between border-b border-line py-2.5 last:border-none"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-[14px] font-medium">
                        {e.title}
                        {e.approvalStatus === "PENDING" && (
                          <span className="chip chip-blue !px-1.5 !text-[10px]">на подтверждении</span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted">{fmtDate(e.date)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="mono text-[14px]">{fmtMoney(e.amountGross)}</span>
                      {e.approvalStatus === "PENDING" && can(user, "expense.approve") && (
                        <form action={approveExpense.bind(null, e.id, car.id)}>
                          <button type="submit" className="btn btn-ghost !px-3 !py-1 !text-[12px]">
                            Подтвердить
                          </button>
                        </form>
                      )}
                      {can(user, "delete.any") && (
                        <form action={deleteExpense.bind(null, e.id, car.id)}>
                          <button
                            type="submit"
                            title="Удалить расход"
                            className="rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:bg-[var(--red-dim)] hover:text-red"
                          >
                            ✕
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canAdd && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="label mb-2.5">
                  {can(user, "expense.add") ? "Добавить расход" : "Смета (Kostenvoranschlag)"}
                </div>
                <form action={addExpense.bind(null, car.id)} className="flex gap-2">
                  <input
                    name="title"
                    required
                    className="field flex-1 bg-surface"
                    placeholder="Замена колодок"
                  />
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    required
                    min={0}
                    className="field mono w-[130px] bg-surface"
                    placeholder="250"
                  />
                  <button type="submit" className="btn btn-primary">Добавить</button>
                </form>
                <p className="mt-2.5 text-[12px] text-muted">
                  {can(user, "expense.add")
                    ? "Попадёт в себестоимость и пересчитает маржу."
                    : "Смета уйдёт на подтверждение партнёру — в расходы попадёт после одобрения."}
                </p>
              </div>
            )}
          </section>
          )}

          {can(user, "see.deals") && (
          <section className="panel animate-in delay-3 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Сделки по этому авто</h2>
            {car.deals.length === 0 ? (
              <p className="text-[13px] text-muted">Сделок пока нет.</p>
            ) : (
              <div className="flex flex-col">
                {car.deals.map((d) => (
                  <Link
                    key={d.id}
                    href="/deals"
                    className="flex items-center justify-between border-b border-line py-2.5 last:border-none hover:bg-white/[0.02]"
                  >
                    <div>
                      <div className="text-[14px] font-semibold">{d.client.name}</div>
                      <div className="text-[12px] text-muted">
                        {DEAL_TYPE[d.type]} · {fmtDate(d.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {d.amount != null && <span className="mono text-[13px]">{fmtMoney(d.amount)}</span>}
                      <span className={`chip ${d.stage === "LOST" ? "chip-red" : d.stage === "DONE" ? "chip-green" : "chip-blue"}`}>
                        {STAGE_LABEL[d.stage] ?? d.stage}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {!seeMoney && seeSalePrice && (
            <section className="panel animate-in delay-2 p-5">
              <h2 className="mb-4 text-[15px] font-bold">Цены</h2>
              <div className="flex flex-col gap-2.5 text-[14px]">
                <div className="flex justify-between gap-3">
                  <span className="shrink-0 text-muted">Verkaufspreis</span>
                  <span className="mono font-bold">{fmtMoney(car.plannedSalePriceGross ?? car.listPrice)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="shrink-0 text-muted">Mindestpreis</span>
                  <span className="mono">
                    {car.minimumSalePriceGross ? fmtMoney(car.minimumSalePriceGross) : "не задан"}
                  </span>
                </div>
                {car.minimumSalePriceGross && (
                  <div className="flex justify-between gap-3">
                    <span className="shrink-0 text-muted">Допустимая скидка</span>
                    <span className="mono">
                      {fmtMoney((car.plannedSalePriceGross ?? car.listPrice).minus(car.minimumSalePriceGross))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-line pt-2.5 text-[13px]">
                  <span className="shrink-0 text-muted">Режим</span>
                  <span className="text-right">{TAX_SCHEME[car.taxScheme] ?? car.taxScheme}</span>
                </div>
              </div>
            </section>
          )}

          {seeMoney && (
          <section className="panel animate-in delay-2 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Экономика{isPartner ? " · MOTORHOF OG" : ""}</h2>
            <div className="mb-3 flex items-center justify-between text-[13px]">
              <span className="text-muted">Налоговый режим</span>
              <span className={fin.isConfirmed ? "" : "text-red"}>{TAX_SCHEME[car.taxScheme] ?? car.taxScheme}</span>
            </div>
            {!fin.isConfirmed && (
              <div className="mb-3 rounded-lg border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-3 py-2 text-[12px] text-red">
                Налоговый режим не определён — расчёт USt и маржа предварительные и не входят
                в подтверждённые итоги.
              </div>
            )}
            <div className="flex flex-col gap-2.5 text-[14px]">
              <div className="flex justify-between">
                <span className="text-muted">{isPartner ? "Внутр. счёт (база OG)" : "Закупка"}</span>
                <span className="mono">{fmtMoney(ogBasis)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Расходы</span>
                <span className="mono">{expensesTotal.gt(0) ? `+ ${fmtMoney(expensesTotal)}` : "—"}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2.5 font-bold">
                <span>Себестоимость</span>
                <span className="mono">{fmtMoney(cost)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted">Цена продажи (план)</span>
                <span className="mono">{fmtMoney(car.plannedSalePriceGross ?? car.listPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {car.taxScheme === "REGELBESTEUERUNG" ? "Ausgangs-USt" : "Differenz-USt"}
                </span>
                <span className="mono">− {fmtMoney(fin.vatAmount)}</span>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
              <div className="label mb-1">
                {car.status === "SOLD" ? "Маржа (плановая)" : "Ожидаемая маржа"}
              </div>
              <div className={`mono text-[26px] font-bold leading-none ${margin.gte(0) ? "text-green" : "text-red"}`}>
                {fmtMoney(margin)}
              </div>
              <div className="mt-1.5 text-[13px] text-muted">наценка {markup}% к себестоимости</div>
            </div>
          </section>
          )}

          {/* Продажа и бронь (§18) */}
          {(canSell || completedSale || reservedSale) && (
            <section className="panel animate-in delay-2 p-5">
              <h2 className="mb-4 text-[15px] font-bold">Продажа и бронь</h2>

              {completedSale ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`chip ${SALE_STAGE.COMPLETED.cls}`}>{SALE_STAGE.COMPLETED.label}</span>
                    {car.awaitingInternalInvoice && <span className="chip chip-amber">ожидает внутр. счёт</span>}
                  </div>
                  <dl className="flex flex-col gap-2 text-[14px]">
                    <div className="flex justify-between gap-3"><dt className="text-muted">Покупатель</dt><dd>{completedSale.client?.name ?? "—"}</dd></div>
                    {seeSalePrice && completedSale.actualSalePriceGross && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Цена продажи</dt><dd className="mono font-bold">{fmtMoney(completedSale.actualSalePriceGross)}</dd></div>
                    )}
                    {completedSale.saleDate && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Дата продажи</dt><dd>{fmtDate(completedSale.saleDate)}</dd></div>
                    )}
                    {completedSale.deliveryDate && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Выдача</dt><dd>{fmtDate(completedSale.deliveryDate)}</dd></div>
                    )}
                    {completedSale.saleCategory && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Категория</dt><dd>{SALE_CATEGORY[completedSale.saleCategory] ?? completedSale.saleCategory}</dd></div>
                    )}
                    <div className="flex justify-between gap-3"><dt className="text-muted">Оплата</dt><dd>{[completedSale.paymentStatus && PAYMENT_STATUS[completedSale.paymentStatus], completedSale.paymentMethod && PAYMENT_METHOD[completedSale.paymentMethod]].filter(Boolean).join(" · ") || "—"}</dd></div>
                    {completedSale.mileageAtSale != null && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Пробег при продаже</dt><dd className="mono">{completedSale.mileageAtSale.toLocaleString("ru-RU")} км</dd></div>
                    )}
                    {completedSale.employee && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Менеджер</dt><dd>{completedSale.employee.name}</dd></div>
                    )}
                  </dl>
                  {seeMoney && saleSnap && (
                    <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
                      <div className="label mb-1">Маржа (снимок на момент продажи)</div>
                      <div className={`mono text-[22px] font-bold leading-none ${Number(saleSnap.finalMargin) >= 0 ? "text-green" : "text-red"}`}>
                        {fmtMoney(Number(saleSnap.finalMargin))}
                      </div>
                      <div className="mt-1.5 text-[12px] text-muted">{saleSnap.vatLabel} {fmtMoney(Number(saleSnap.vatAmount))} · заморожено</div>
                    </div>
                  )}
                </div>
              ) : reservedSale ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`chip ${SALE_STAGE.RESERVED.cls}`}>{SALE_STAGE.RESERVED.label}</span>
                    {reservationIsExpired && <span className="chip chip-red">срок брони истёк</span>}
                  </div>
                  <dl className="flex flex-col gap-2 text-[14px]">
                    <div className="flex justify-between gap-3"><dt className="text-muted">Клиент</dt><dd>{reservedSale.client?.name ?? "—"}</dd></div>
                    {reservedSale.reservationExpiresAt && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Действует до</dt><dd className={reservationIsExpired ? "text-red" : ""}>{fmtDate(reservedSale.reservationExpiresAt)}</dd></div>
                    )}
                    {seeSalePrice && reservedSale.anzahlung && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Anzahlung</dt><dd className="mono">{fmtMoney(reservedSale.anzahlung)}</dd></div>
                    )}
                    {reservedSale.reservationComment && (
                      <div className="flex justify-between gap-3"><dt className="text-muted">Комментарий</dt><dd className="text-right">{reservedSale.reservationComment}</dd></div>
                    )}
                  </dl>
                  {canSell && (
                    <div className="mt-4 flex flex-col gap-2">
                      <details className="rounded-xl border border-line bg-surface-2 p-3">
                        <summary className="cursor-pointer text-[13px] font-semibold">Оформить продажу</summary>
                        {sellForm(reservedSale.clientId)}
                      </details>
                      <form action={cancelSale.bind(null, reservedSale.id, car.id)}>
                        <button type="submit" className="btn btn-ghost w-full !text-[13px]">Отменить бронь</button>
                      </form>
                    </div>
                  )}
                </div>
              ) : canSell && car.status !== "SOLD" && car.status !== "ARCHIVED" ? (
                <div className="flex flex-col gap-2">
                  <details className="rounded-xl border border-line bg-surface-2 p-3">
                    <summary className="cursor-pointer text-[13px] font-semibold">Забронировать</summary>
                    <form action={reserveCar.bind(null, car.id)} className="mt-3 flex flex-col gap-2.5">
                      <select name="clientId" required className="field text-[13px]" defaultValue="">
                        <option value="" disabled>Клиент *</option>
                        {clients.map((c) => (<option key={c.id} value={c.id}>{c.name} · {c.phone}</option>))}
                      </select>
                      <div className="flex gap-2">
                        <label className="flex-1"><span className="label">Дата брони</span>
                          <input type="date" name="reservedAt" defaultValue={today} className="field" /></label>
                        <label className="flex-1"><span className="label">Действует до *</span>
                          <input type="date" name="reservationExpiresAt" required className="field" /></label>
                      </div>
                      <div className="flex gap-2">
                        <label className="flex-1"><span className="label">Anzahlung €</span>
                          <input type="number" step="0.01" min={0} name="anzahlung" className="field mono" /></label>
                        <label className="flex-1"><span className="label">Способ оплаты</span>
                          <select name="reservationPaymentMethod" className="field" defaultValue="">
                            <option value="">—</option>
                            {Object.entries(PAYMENT_METHOD).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                          </select></label>
                      </div>
                      <input name="reservationComment" className="field" placeholder="Комментарий" />
                      <button type="submit" className="btn btn-primary">Забронировать</button>
                    </form>
                  </details>
                  <details className="rounded-xl border border-line bg-surface-2 p-3">
                    <summary className="cursor-pointer text-[13px] font-semibold">Оформить продажу</summary>
                    {sellForm(null)}
                  </details>
                </div>
              ) : (
                <p className="text-[13px] text-muted">Нет активной брони или продажи.</p>
              )}
            </section>
          )}

          <section className="panel animate-in delay-3 p-5">
            <h2 className="mb-1 text-[15px] font-bold">Статус</h2>
            <p className="mb-4 text-[13px] text-muted">Нажмите, чтобы изменить.</p>
            <div className="flex flex-wrap gap-2">
              {CAR_STATUS_ORDER.map((s) => {
                // RESERVED/SOLD ставятся только через раздел «Продажа и бронь» (§18) —
                // прямой кнопкой не переключаем (показываем лишь как текущий статус).
                if (SALE_FLOW_STATUSES.includes(s) && s !== car.status) return null;
                // Кнопки статусов зеркалят серверную проверку setCarStatus:
                // ADMIN/PARTNER — все; SALES — фото; TECHNICAL — подготовка/сервис.
                const allowed =
                  !SALE_FLOW_STATUSES.includes(s) &&
                  (can(user, "edit.car") ||
                    (can(user, "status.sales") && SALES_STATUS_SET.includes(s)) ||
                    (can(user, "status.tech") && TECH_STATUS_SET.includes(s)));
                if (!allowed && s !== car.status) return null;
                return (
                  <form key={s} action={setCarStatus.bind(null, car.id, s)}>
                    <button
                      type="submit"
                      disabled={s === car.status || !allowed}
                      className={`chip ${s === car.status ? CAR_STATUS[s].cls : "chip-muted"} ${
                        s === car.status ? "cursor-default ring-1 ring-[var(--border-strong)]" : "cursor-pointer opacity-70 hover:opacity-100"
                      }`}
                    >
                      {CAR_STATUS[s].label}
                    </button>
                  </form>
                );
              })}
            </div>
          </section>

          <section className="panel animate-in delay-4 p-5">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold">Парковка</h2>
              <span className="mono text-[13px] text-muted">{mhCode(car.mhNumber)}</span>
            </div>
            <p className="mb-3 text-[13px] text-muted">
              {car.parkingRow && car.parkingSpot != null
                ? `Место: ${car.parkingRow}-${car.parkingSpot}`
                : "Место не назначено (авто в дороге / на приёмке)."}
            </p>
            {perror && PARK_ERRORS[perror] && (
              <div className="mb-3 rounded-lg border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-3 py-2 text-[12px] text-red">
                {PARK_ERRORS[perror]}
              </div>
            )}
            {canPark && car.status !== "SOLD" && (
              <form action={assignParking.bind(null, car.id)} className="flex gap-2">
                <input
                  name="parkingRow"
                  maxLength={1}
                  defaultValue={car.parkingRow ?? ""}
                  className="field mono w-[56px] text-center uppercase"
                  placeholder="A"
                />
                <input
                  name="parkingSpot"
                  type="number"
                  min={1}
                  defaultValue={car.parkingSpot ?? ""}
                  className="field mono w-[80px]"
                  placeholder="12"
                />
                <button type="submit" className="btn btn-ghost">Сохранить</button>
              </form>
            )}
            {car.parkingMoves.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="label mb-2">История перемещений</div>
                <div className="flex flex-col gap-1.5 text-[12px] text-muted">
                  {car.parkingMoves.map((m) => (
                    <div key={m.id} className="flex justify-between gap-2">
                      <span className="mono">
                        {m.fromRow && m.fromSpot != null ? `${m.fromRow}-${m.fromSpot}` : "—"}
                        {" → "}
                        {m.toRow && m.toSpot != null ? `${m.toRow}-${m.toSpot}` : "—"}
                      </span>
                      <span>{fmtDate(m.movedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
