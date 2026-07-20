import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConfirmButton } from "@/components/confirm-button";
import { addExpense, approveExpense, deleteExpense, deleteCar, setCarStatus } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import {
  fmtMoney,
  fmtDate,
  sumMoney,
  carCost,
  carPlannedFinance,
  markupPct,
  CAR_STATUS,
  CAR_STATUS_ORDER,
  STAGE_LABEL,
  DEAL_TYPE,
  TAX_SCHEME,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  // Redaction (roles-motorhof.md): запрещённые блоки НЕ рендерятся на сервере —
  // их цифр физически нет в HTML, который получает браузер.
  const seeMoney = can(user, "see.margin"); // экономика, расходы €, себестоимость
  const seeSalePrice = can(user, "see.salePrice");
  const seeExpenses = seeMoney || can(user, "edit.tech"); // TECHNICAL видит расходы по авто (свои сметы)
  const canAdd = can(user, "expense.add") || can(user, "expense.addPending");

  const car = await prisma.car.findUnique({
    where: { id },
    include: {
      expenses: { orderBy: { date: "desc" } },
      deals: { include: { client: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!car) notFound();

  const expensesTotal = sumMoney(car.expenses.map((e) => e.amountGross));
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
    ["Объём", car.engineVol ? `${car.engineVol} л` : "—"],
    ["Цвет", car.color ?? "—"],
  ];

  return (
    <div>
      <header className="animate-in mb-6">
        <Link href="/cars" className="text-[13px] font-semibold text-muted hover:text-ink">
          ← Автомобили
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
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
            <h2 className="mb-4 text-[15px] font-bold">Экономика</h2>
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
                <span className="text-muted">Закупка</span>
                <span className="mono">{fmtMoney(car.purchasePrice)}</span>
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

          <section className="panel animate-in delay-3 p-5">
            <h2 className="mb-1 text-[15px] font-bold">Статус</h2>
            <p className="mb-4 text-[13px] text-muted">Нажмите, чтобы изменить.</p>
            <div className="flex flex-wrap gap-2">
              {CAR_STATUS_ORDER.map((s) => {
                // Кнопки статусов — по правам роли (зеркалит проверку в setCarStatus):
                // SALES — продажные, TECHNICAL — подготовительные, ADMIN/PARTNER — все.
                const allowed =
                  (can(user, "status.sales") && ["RESERVED", "SOLD", "AVAILABLE"].includes(s)) ||
                  (can(user, "status.tech") && ["PREP", "AVAILABLE"].includes(s));
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
        </div>
      </div>
    </div>
  );
}
