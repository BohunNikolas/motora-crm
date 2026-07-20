import Link from "next/link";
import type { Car, Prisma } from "@prisma/client";
import {
  CAR_STATUS,
  CAR_STATUS_ORDER,
  TRANSMISSIONS,
  FUELS,
  TAX_SCHEME,
  TAX_SCHEME_ORDER,
  SERVICEHEFT,
  SERVICEHEFT_ORDER,
  JA_NEIN_UNBEKANNT,
  BODY_PARTS,
} from "@/lib/format";
import { CarOwnerFields } from "./car-owner-fields";
import { CarChannelFields } from "./car-channel-fields";

export const CAR_FORM_ERRORS: Record<string, string> = {
  "pickerl-date": "Pickerl отмечен как «Да» — укажите Begutachtungsmonat и Begutachtungsjahr.",
  "date-order":
    "Дата поступления раньше даты покупки. Поставьте галочку override и укажите причину в секции «Основные данные».",
  "auction-below":
    "Auktionsrechnung gesamt меньше Fahrzeugpreis. Поставьте галочку override и укажите причину в секции «Auktion».",
  "sold-locked":
    "Авто уже продано — правка финансовых полей задним числом требует admin override. Поставьте галочку и укажите причину в секции «Деньги».",
};

// Decimal → строка для value; Date → YYYY-MM-DD; число → строка (пусто = Unbekannt).
const m = (d?: Prisma.Decimal | null) => (d == null ? "" : d.toString());
const dstr = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const nstr = (n?: number | null) => (n == null ? "" : String(n));

export function CarForm({
  car,
  action,
  submitLabel,
  cancelHref,
}: {
  car?: Car;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  cancelHref: string;
}) {
  const parts: string[] = car?.nachlackierungenParts ?? [];
  return (
    <form action={action} className="flex flex-col gap-5">
      {/* ── Основные данные (§8.1) ─────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Основные данные</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="make">Marke *</label>
            <input id="make" name="make" required defaultValue={car?.make} className="field" placeholder="Toyota" />
          </div>
          <div>
            <label className="label" htmlFor="model">Modell *</label>
            <input id="model" name="model" required defaultValue={car?.model} className="field" placeholder="Camry" />
          </div>
          <div>
            <label className="label" htmlFor="year">Год *</label>
            <input id="year" name="year" type="number" required min={1950} max={new Date().getFullYear() + 1} defaultValue={car?.year} className="field" placeholder="2018" />
          </div>
          <div>
            <label className="label" htmlFor="erstzulassung">Erstzulassung</label>
            <input id="erstzulassung" name="erstzulassung" type="date" defaultValue={dstr(car?.erstzulassung)} className="field" />
          </div>

          <div className="col-span-2">
            <label className="label" htmlFor="vin">VIN</label>
            <input id="vin" name="vin" defaultValue={car?.vin ?? ""} className="field mono uppercase" placeholder="JTNBE46K473012345" />
          </div>
          <div>
            <label className="label" htmlFor="mileage">Kilometerstand *</label>
            <input id="mileage" name="mileage" type="number" required min={0} defaultValue={car?.mileage} className="field" placeholder="85000" />
          </div>
          <div>
            <label className="label" htmlFor="leistung">Leistung, кВт</label>
            <input id="leistung" name="leistung" type="number" min={0} defaultValue={nstr(car?.leistung)} className="field" placeholder="110" />
          </div>

          <div>
            <label className="label" htmlFor="transmission">Getriebe</label>
            <select id="transmission" name="transmission" defaultValue={car?.transmission ?? ""} className="field">
              <option value="">—</option>
              {TRANSMISSIONS.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fuel">Kraftstoff</label>
            <select id="fuel" name="fuel" defaultValue={car?.fuel ?? ""} className="field">
              <option value="">—</option>
              {FUELS.map((f) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="color">Farbe</label>
            <input id="color" name="color" defaultValue={car?.color ?? ""} className="field" placeholder="Чёрный" />
          </div>
          <div>
            <label className="label" htmlFor="status">Статус</label>
            <select id="status" name="status" defaultValue={car?.status ?? "PURCHASED"} className="field">
              {CAR_STATUS_ORDER.map((s) => (<option key={s} value={s}>{CAR_STATUS[s].label}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="voranmeldungen">Voranmeldungen</label>
            <input id="voranmeldungen" name="voranmeldungen" type="number" min={0} defaultValue={nstr(car?.voranmeldungen)} className="field" placeholder="Unbekannt" />
          </div>
          <div>
            <label className="label" htmlFor="keysCount">Ключей (0–10)</label>
            <input id="keysCount" name="keysCount" type="number" min={0} max={10} defaultValue={nstr(car?.keysCount)} className="field" placeholder="Unbekannt" />
          </div>
          <div>
            <label className="label" htmlFor="purchaseDate">Дата покупки</label>
            <input id="purchaseDate" name="purchaseDate" type="date" defaultValue={dstr(car?.purchaseDate)} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="arrivalDate">Дата поступления</label>
            <input id="arrivalDate" name="arrivalDate" type="date" defaultValue={dstr(car?.arrivalDate)} className="field" />
          </div>
        </div>
        <p className="mt-2 text-[12px] text-muted">Пустые «Voranmeldungen» и «Ключей» означают Unbekannt.</p>
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" name="dateOverride" value="1" className="mt-0.5" />
            <span className="text-muted">
              Разрешить сохранение, если дата поступления раньше даты покупки (нужна причина ниже).
            </span>
          </label>
          <input name="dateOverrideReason" className="field mt-2" placeholder="Причина override (если ставите галочку)" />
        </div>
      </section>

      {/* ── Serviceheft (§8.2) ─────────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Serviceheft</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="serviceheft">Сервисная книга</label>
            <select id="serviceheft" name="serviceheft" defaultValue={car?.serviceheft ?? "UNBEKANNT"} className="field">
              {SERVICEHEFT_ORDER.map((k) => (<option key={k} value={k}>{SERVICEHEFT[k]}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lastServiceDate">Последний сервис</label>
            <input id="lastServiceDate" name="lastServiceDate" type="date" defaultValue={dstr(car?.lastServiceDate)} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="lastServiceMileage">Пробег на сервисе</label>
            <input id="lastServiceMileage" name="lastServiceMileage" type="number" min={0} defaultValue={nstr(car?.lastServiceMileage)} className="field" placeholder="—" />
          </div>
          <div>
            <label className="label" htmlFor="serviceComment">Комментарий</label>
            <input id="serviceComment" name="serviceComment" defaultValue={car?.serviceComment ?? ""} className="field" />
          </div>
        </div>
      </section>

      {/* ── Nachlackierungen (§8.3) ────────────────────────── */}
      <section className="panel p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="w-[220px]">
            <label className="label" htmlFor="nachlackierungen">Nachlackierungen (перекрасы)</label>
            <select id="nachlackierungen" name="nachlackierungen" defaultValue={car?.nachlackierungen ?? "UNBEKANNT"} className="field">
              {Object.entries(JA_NEIN_UNBEKANNT).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
          <p className="text-[12px] text-muted">Если «Да» — отметьте перекрашенные части.</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BODY_PARTS.map((p) => (
            <label key={p.key} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px]">
              <input type="checkbox" name="nachlackierungenParts" value={p.key} defaultChecked={parts.includes(p.key)} />
              {p.label}
            </label>
          ))}
        </div>
        <input name="nachlackierungenComment" defaultValue={car?.nachlackierungenComment ?? ""} className="field mt-3" placeholder="Комментарий по покраске / толщине ЛКП" />
      </section>

      {/* ── Pickerl / §57a (§8.4) ──────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-1 text-[15px] font-bold">Pickerl (§57a)</h2>
        <p className="mb-4 text-[13px] text-muted">Если Pickerl есть — месяц и год Begutachtung обязательны.</p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="pickerlVorhanden">Pickerl vorhanden</label>
            <select id="pickerlVorhanden" name="pickerlVorhanden" defaultValue={car?.pickerlVorhanden ?? "UNBEKANNT"} className="field">
              {Object.entries(JA_NEIN_UNBEKANNT).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pickerlMonth">Begutachtungsmonat</label>
            <input id="pickerlMonth" name="pickerlMonth" type="number" min={1} max={12} defaultValue={nstr(car?.pickerlMonth)} className="field" placeholder="1–12" />
          </div>
          <div>
            <label className="label" htmlFor="pickerlYear">Begutachtungsjahr</label>
            <input id="pickerlYear" name="pickerlYear" type="number" min={2020} max={2040} defaultValue={nstr(car?.pickerlYear)} className="field" placeholder="2026" />
          </div>
          <div>
            <label className="label" htmlFor="pickerlComment">Недостатки / комментарий</label>
            <input id="pickerlComment" name="pickerlComment" defaultValue={car?.pickerlComment ?? ""} className="field" />
          </div>
        </div>
      </section>

      {/* ── Деньги ─────────────────────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-1 text-[15px] font-bold">Деньги</h2>
        <p className="mb-4 text-[13px] text-muted">
          Расходы на подготовку добавляются в карточке авто — они автоматически войдут в себестоимость.
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="purchasePrice">Закупочная цена * €</label>
            <input id="purchasePrice" name="purchasePrice" type="number" step="0.01" required min={0} defaultValue={m(car?.purchasePrice)} className="field mono" placeholder="12000" />
          </div>
          <div>
            <label className="label" htmlFor="listPrice">Цена продажи * €</label>
            <input id="listPrice" name="listPrice" type="number" step="0.01" required min={0} defaultValue={m(car?.listPrice)} className="field mono" placeholder="15500" />
          </div>
        </div>
        {/* §18.2: правка финансов уже проданного авто — только admin override с причиной. */}
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" name="soldOverride" value="1" className="mt-0.5" />
            <span className="text-muted">
              Разрешить правку финансовых полей у уже проданного авто (admin override — нужна причина).
            </span>
          </label>
          <input name="soldOverrideReason" className="field mt-2" placeholder="Причина override (если ставите галочку)" />
        </div>
      </section>

      {/* ── Налоги и закупка (§10) ─────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-1 text-[15px] font-bold">Налоги и закупка</h2>
        <p className="mb-4 text-[13px] text-muted">
          Если не заполнить: Einkaufspreis §24 = закупочной цене, плановая цена = цене продажи.
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="taxScheme">Налоговый режим</label>
            <select id="taxScheme" name="taxScheme" defaultValue={car?.taxScheme ?? "DIFFERENZBESTEUERUNG"} className="field">
              {TAX_SCHEME_ORDER.map((k) => (<option key={k} value={k}>{TAX_SCHEME[k]}</option>))}
            </select>
          </div>
          <CarChannelFields
            defaults={{
              purchaseChannel: car?.purchaseChannel ?? "",
              auctionVehiclePrice: m(car?.auctionVehiclePrice),
              auctionFeeNet: m(car?.auctionFeeNet),
              auctionFeeVat: m(car?.auctionFeeVat),
              auctionTransportCost: m(car?.auctionTransportCost),
              auctionOtherFees: m(car?.auctionOtherFees),
              auctionInvoiceTotal: m(car?.auctionInvoiceTotal),
              auctionInvoiceNumber: car?.auctionInvoiceNumber ?? "",
              auctionSupplier: car?.auctionSupplier ?? "",
              auctionCountry: car?.auctionCountry ?? "",
              haendlerSupplier: car?.haendlerSupplier ?? "",
              haendlerInvoiceNumber: car?.haendlerInvoiceNumber ?? "",
              haendlerInvoiceDate: dstr(car?.haendlerInvoiceDate),
              haendlerPurchaseNet: m(car?.haendlerPurchaseNet),
              haendlerPurchaseVat: m(car?.haendlerPurchaseVat),
              haendlerPurchaseGross: m(car?.haendlerPurchaseGross),
              haendlerVorsteuerAusgewiesen: car?.haendlerVorsteuerAusgewiesen ?? false,
              tradeInEstimatedValue: m(car?.tradeInEstimatedValue),
              tradeInCreditValue: m(car?.tradeInCreditValue),
              tradeInSurcharge: m(car?.tradeInSurcharge),
              tradeInSurchargeBy: car?.tradeInSurchargeBy ?? "",
              importCountry: car?.importCountry ?? "",
              importZone: car?.importZone ?? "",
              importCurrency: car?.importCurrency ?? "",
              importExchangeRate: m(car?.importExchangeRate),
              importInvoiceAmount: m(car?.importInvoiceAmount),
              importTransportCost: m(car?.importTransportCost),
              importZoll: m(car?.importZoll),
              importEust: m(car?.importEust),
              importNova: m(car?.importNova),
              importOtherCosts: m(car?.importOtherCosts),
            }}
          />
          <CarOwnerFields
            defaults={{
              currentOwner: car?.currentOwner ?? "MOTORHOF_OG",
              partnerPurchasePrice: m(car?.partnerPurchasePrice),
              partnerAcquisitionCost: m(car?.partnerAcquisitionCost),
              plannedInternalTransferPrice: m(car?.plannedInternalTransferPrice),
              actualInternalTransferPrice: m(car?.actualInternalTransferPrice),
              internalInvoiceNumber: car?.internalInvoiceNumber ?? "",
              internalInvoiceDate: dstr(car?.internalInvoiceDate),
              internalInvoiceTaxScheme: car?.internalInvoiceTaxScheme ?? "",
              internalInvoicePaymentStatus: car?.internalInvoicePaymentStatus ?? "OPEN",
            }}
          />
          <div>
            <label className="label" htmlFor="einkaufspreisGemaess24">Einkaufspreis §24 €</label>
            <input id="einkaufspreisGemaess24" name="einkaufspreisGemaess24" type="number" step="0.01" min={0} defaultValue={m(car?.einkaufspreisGemaess24)} className="field mono" placeholder="= закупке" />
          </div>
          <div>
            <label className="label" htmlFor="plannedSalePriceGross">Плановая цена €</label>
            <input id="plannedSalePriceGross" name="plannedSalePriceGross" type="number" step="0.01" min={0} defaultValue={m(car?.plannedSalePriceGross)} className="field mono" placeholder="= цене продажи" />
          </div>
          <div>
            <label className="label" htmlFor="minimumSalePriceGross">Мин. цена €</label>
            <input id="minimumSalePriceGross" name="minimumSalePriceGross" type="number" step="0.01" min={0} defaultValue={m(car?.minimumSalePriceGross)} className="field mono" placeholder="—" />
          </div>
        </div>
      </section>

      {/* ── Заметки ────────────────────────────────────────── */}
      <section className="panel p-5">
        <label className="label" htmlFor="notes">Заметки</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={car?.notes ?? ""} className="field resize-y" placeholder="Один владелец, сервисная книжка, нужна замена колодок" />
      </section>

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary">{submitLabel}</button>
        <Link href={cancelHref} className="btn btn-ghost">Отмена</Link>
      </div>
    </form>
  );
}
