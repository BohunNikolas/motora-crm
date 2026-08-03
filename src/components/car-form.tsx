"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { Car, Prisma } from "@prisma/client";
import type { CarFormState } from "@/lib/actions";
import {
  CAR_STATUS,
  CAR_STATUS_ORDER,
  TRANSMISSIONS,
  FUELS,
  SERVICEHEFT,
  SERVICEHEFT_ORDER,
  JA_NEIN_UNBEKANNT,
  BODY_PARTS,
} from "@/lib/format";
import { CarPricingBlock } from "./car-pricing-block";

// Decimal → строка для value; Date → YYYY-MM-DD; число → строка (пусто = Unbekannt).
const m = (d?: Prisma.Decimal | null) => (d == null ? "" : d.toString());
const dstr = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const nstr = (n?: number | null) => (n == null ? "" : String(n));

// Сервисная книга «есть» — детальные поля видимы и обязательны (В7).
const HEFT_PRESENT = ["VOLLSTAENDIG", "TEILWEISE", "DIGITAL"];

/**
 * Форма авто (правки-1, Э3): все поля обязательны, кроме заметок, комментариев
 * и даты поступления (В4). Год удалён — главная дата Erstzulassung (В5).
 * При ошибке сервера значения полей сохраняются (useActionState, П9).
 */
export function CarForm({
  car,
  action,
  submitLabel,
  cancelHref,
}: {
  car?: Car;
  action: (prev: CarFormState, fd: FormData) => Promise<CarFormState>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, { error: null });
  // Приоритет значений: введённое пользователем (после ошибки) → данные авто → пусто.
  const v = (name: string, fallback: string) => state.values?.[name] ?? fallback;

  const [heft, setHeft] = useState(v("serviceheft", car?.serviceheft ?? "UNBEKANNT"));
  const [nach, setNach] = useState(v("nachlackierungen", car?.nachlackierungen ?? "UNBEKANNT"));
  const [pickerl, setPickerl] = useState(v("pickerlVorhanden", car?.pickerlVorhanden ?? "UNBEKANNT"));
  const parts: string[] = state.values
    ? (state.values["nachlackierungenParts"]?.split(",") ?? [])
    : (car?.nachlackierungenParts ?? []);

  const heftPresent = HEFT_PRESENT.includes(heft);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <div className="rounded-xl border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-[13.5px] text-red">
          {state.error}
        </div>
      )}

      {/* ── Основные данные (§8.1) ─────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Основные данные</h2>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label" htmlFor="make">Marke *</label>
            <input id="make" name="make" required defaultValue={v("make", car?.make ?? "")} className="field" placeholder="Volkswagen" />
          </div>
          <div>
            <label className="label" htmlFor="model">Modell *</label>
            <input id="model" name="model" required defaultValue={v("model", car?.model ?? "")} className="field" placeholder="Golf" />
          </div>
          <div>
            {/* Подпись как у соседей — немецкий термин: длинное «Постановка на учёт
                (Erstzulassung)» ломалось на две строки и рвало ряд полей. */}
            <label className="label" htmlFor="erstzulassung" title="Дата первой постановки на учёт">Erstzulassung *</label>
            <input id="erstzulassung" name="erstzulassung" type="date" required defaultValue={v("erstzulassung", dstr(car?.erstzulassung))} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="vin">VIN *</label>
            <input id="vin" name="vin" required defaultValue={v("vin", car?.vin ?? "")} className="field mono uppercase" placeholder="WVWZZZ1KZAW123456" />
          </div>

          <div>
            <label className="label" htmlFor="mileage">Kilometerstand *</label>
            <input id="mileage" name="mileage" type="number" required min={0} defaultValue={v("mileage", nstr(car?.mileage))} className="field" placeholder="85000" />
          </div>
          <div>
            <label className="label" htmlFor="leistung">Leistung, кВт *</label>
            <input id="leistung" name="leistung" type="number" required min={1} defaultValue={v("leistung", nstr(car?.leistung))} className="field" placeholder="110" />
          </div>
          <div>
            <label className="label" htmlFor="transmission">Getriebe *</label>
            <select id="transmission" name="transmission" required defaultValue={v("transmission", car?.transmission ?? "")} className="field">
              <option value="">— выберите —</option>
              {TRANSMISSIONS.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fuel">Kraftstoff *</label>
            <select id="fuel" name="fuel" required defaultValue={v("fuel", car?.fuel ?? "")} className="field">
              <option value="">— выберите —</option>
              {FUELS.map((f) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="color">Farbe *</label>
            <input id="color" name="color" required defaultValue={v("color", car?.color ?? "")} className="field" placeholder="Чёрный" />
          </div>
          <div>
            <label className="label" htmlFor="voranmeldungen">Voranmeldungen *</label>
            <input id="voranmeldungen" name="voranmeldungen" type="number" required min={0} defaultValue={v("voranmeldungen", nstr(car?.voranmeldungen))} className="field" placeholder="1" />
          </div>
          <div>
            <label className="label" htmlFor="keysCount">Ключей (0–10) *</label>
            <input id="keysCount" name="keysCount" type="number" required min={0} max={10} defaultValue={v("keysCount", nstr(car?.keysCount))} className="field" placeholder="2" />
          </div>
          <div>
            <label className="label" htmlFor="status">Статус</label>
            <select id="status" name="status" defaultValue={v("status", car?.status ?? "PURCHASED")} className="field">
              {CAR_STATUS_ORDER.map((s) => (<option key={s} value={s}>{CAR_STATUS[s].label}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="arrivalDate">Дата поступления</label>
            <input id="arrivalDate" name="arrivalDate" type="date" defaultValue={v("arrivalDate", dstr(car?.arrivalDate))} className="field" />
          </div>
        </div>
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

      {/* ── Владелец, налоги и цены (правки-1, П14) ────────── */}
      <CarPricingBlock
        defaults={{
          currentOwner: v("currentOwner", car?.currentOwner ?? "MOTORHOF_OG"),
          taxScheme: v("taxScheme", car?.taxScheme === "REGELBESTEUERUNG" ? "REGELBESTEUERUNG" : "DIFFERENZBESTEUERUNG"),
          purchaseChannel: v("purchaseChannel", car?.purchaseChannel ?? "PRIVAT"),
          purchaseDate: v("purchaseDate", dstr(car?.purchaseDate)),
          purchasePrice: v("purchasePrice", m(car?.purchasePrice)),
          auctionInvoiceTotal: v("auctionInvoiceTotal", m(car?.auctionInvoiceTotal)),
          auctionVehiclePrice: v("auctionVehiclePrice", m(car?.auctionVehiclePrice)),
          auctionTransportCost: v("auctionTransportCost", m(car?.auctionTransportCost)),
          supplier: v("auctionSupplier", car?.auctionSupplier ?? "") || v("haendlerSupplier", car?.haendlerSupplier ?? ""),
          fictitiousMarkup: v("fictitiousMarkup", m(car?.fictitiousMarkup)),
          plannedSalePriceGross: v("plannedSalePriceGross", m(car?.plannedSalePriceGross ?? car?.listPrice)),
          plannedSalePriceNet: v("plannedSalePriceNet", m(car?.plannedSalePriceNet)),
          minimumSalePriceGross: v("minimumSalePriceGross", m(car?.minimumSalePriceGross)),
        }}
      />

      {/* ── Serviceheft (§8.2): детальные поля только когда книга есть (В7) ── */}
      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Serviceheft</h2>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label" htmlFor="serviceheft">Сервисная книга *</label>
            <select id="serviceheft" name="serviceheft" value={heft} onChange={(e) => setHeft(e.target.value)} className="field">
              {SERVICEHEFT_ORDER.map((k) => (<option key={k} value={k}>{SERVICEHEFT[k]}</option>))}
            </select>
          </div>
          {heftPresent && (
            <>
              <div>
                <label className="label" htmlFor="lastServiceDate">Последний сервис *</label>
                <input id="lastServiceDate" name="lastServiceDate" type="date" required defaultValue={v("lastServiceDate", dstr(car?.lastServiceDate))} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="lastServiceMileage">Пробег на сервисе *</label>
                <input id="lastServiceMileage" name="lastServiceMileage" type="number" required min={0} defaultValue={v("lastServiceMileage", nstr(car?.lastServiceMileage))} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="serviceComment">Комментарий</label>
                <input id="serviceComment" name="serviceComment" defaultValue={v("serviceComment", car?.serviceComment ?? "")} className="field" />
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Nachlackierungen (§8.3): чекбоксы активны только при «Да» (В7) ── */}
      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div className="w-full sm:w-[280px]">
            <label className="label" htmlFor="nachlackierungen">Nachlackierungen (перекрасы) *</label>
            <select id="nachlackierungen" name="nachlackierungen" value={nach} onChange={(e) => setNach(e.target.value)} className="field">
              {Object.entries(JA_NEIN_UNBEKANNT).map(([k, val]) => (<option key={k} value={k}>{val}</option>))}
            </select>
          </div>
          <p className="text-[12px] text-muted">
            {nach === "JA" ? "Отметьте перекрашенные части." : "Части доступны только при «Да»."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {BODY_PARTS.map((p) => (
            <label key={p.key} className={`flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] ${nach !== "JA" ? "opacity-45" : ""}`}>
              <input type="checkbox" name="nachlackierungenParts" value={p.key} disabled={nach !== "JA"} defaultChecked={parts.includes(p.key)} />
              {p.label}
            </label>
          ))}
        </div>
        <input name="nachlackierungenComment" defaultValue={v("nachlackierungenComment", car?.nachlackierungenComment ?? "")} className="field mt-3" placeholder="Комментарий по покраске / толщине ЛКП" />
      </section>

      {/* ── Pickerl / §57a (§8.4) ──────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-1 text-[15px] font-bold">Pickerl (§57a)</h2>
        <p className="mb-4 text-[13px] text-muted">Если Pickerl есть — месяц и год Begutachtung обязательны.</p>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label" htmlFor="pickerlVorhanden">Pickerl vorhanden *</label>
            <select id="pickerlVorhanden" name="pickerlVorhanden" value={pickerl} onChange={(e) => setPickerl(e.target.value)} className="field">
              {Object.entries(JA_NEIN_UNBEKANNT).map(([k, val]) => (<option key={k} value={k}>{val}</option>))}
            </select>
          </div>
          {pickerl === "JA" && (
            <>
              <div>
                <label className="label" htmlFor="pickerlMonth">Begutachtungsmonat *</label>
                <input id="pickerlMonth" name="pickerlMonth" type="number" required min={1} max={12} defaultValue={v("pickerlMonth", nstr(car?.pickerlMonth))} className="field" placeholder="1–12" />
              </div>
              <div>
                <label className="label" htmlFor="pickerlYear">Begutachtungsjahr *</label>
                <input id="pickerlYear" name="pickerlYear" type="number" required min={2020} max={2040} defaultValue={v("pickerlYear", nstr(car?.pickerlYear))} className="field" placeholder="2026" />
              </div>
            </>
          )}
          <div>
            <label className="label" htmlFor="pickerlComment">Недостатки / комментарий</label>
            <input id="pickerlComment" name="pickerlComment" defaultValue={v("pickerlComment", car?.pickerlComment ?? "")} className="field" />
          </div>
        </div>
      </section>

      {/* ── Заметки (не обязательны, В4) ───────────────────── */}
      <section className="panel p-5">
        <label className="label" htmlFor="notes">Заметки</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={v("notes", car?.notes ?? "")} className="field resize-y" placeholder="Один владелец, сервисная книжка, нужна замена колодок" />
      </section>

      <div className="flex gap-3">
        <SubmitButton pendingText="Сохранение…">{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn btn-ghost">Отмена</Link>
      </div>
    </form>
  );
}
