import Link from "next/link";
import type { Car, Prisma } from "@prisma/client";
import {
  CAR_STATUS,
  CAR_STATUS_ORDER,
  TRANSMISSIONS,
  FUELS,
  TAX_SCHEME,
  TAX_SCHEME_ORDER,
  PURCHASE_CHANNEL,
  CURRENT_OWNER,
} from "@/lib/format";

// Decimal → строка для value поля; Date → YYYY-MM-DD для input[type=date].
const m = (d?: Prisma.Decimal | null) => (d == null ? "" : d.toString());
const dstr = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

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
  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Автомобиль</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-1">
            <label className="label" htmlFor="make">Марка *</label>
            <input id="make" name="make" required defaultValue={car?.make} className="field" placeholder="Toyota" />
          </div>
          <div className="col-span-1">
            <label className="label" htmlFor="model">Модель *</label>
            <input id="model" name="model" required defaultValue={car?.model} className="field" placeholder="Camry" />
          </div>
          <div>
            <label className="label" htmlFor="year">Год *</label>
            <input
              id="year"
              name="year"
              type="number"
              required
              min={1950}
              max={new Date().getFullYear() + 1}
              defaultValue={car?.year}
              className="field"
              placeholder="2018"
            />
          </div>
          <div>
            <label className="label" htmlFor="mileage">Пробег, км *</label>
            <input id="mileage" name="mileage" type="number" required min={0} defaultValue={car?.mileage} className="field" placeholder="85000" />
          </div>

          <div className="col-span-2">
            <label className="label" htmlFor="vin">VIN</label>
            <input id="vin" name="vin" defaultValue={car?.vin ?? ""} className="field mono uppercase" placeholder="JTNBE46K473012345" />
          </div>
          <div>
            <label className="label" htmlFor="color">Цвет</label>
            <input id="color" name="color" defaultValue={car?.color ?? ""} className="field" placeholder="Чёрный" />
          </div>
          <div>
            <label className="label" htmlFor="engineVol">Объём, л</label>
            <input id="engineVol" name="engineVol" defaultValue={car?.engineVol ?? ""} className="field" placeholder="2.5" />
          </div>

          <div>
            <label className="label" htmlFor="transmission">КПП</label>
            <select id="transmission" name="transmission" defaultValue={car?.transmission ?? ""} className="field">
              <option value="">—</option>
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fuel">Топливо</label>
            <select id="fuel" name="fuel" defaultValue={car?.fuel ?? ""} className="field">
              <option value="">—</option>
              {FUELS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="status">Статус</label>
            <select id="status" name="status" defaultValue={car?.status ?? "PREP"} className="field">
              {CAR_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{CAR_STATUS[s].label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-1 text-[15px] font-bold">Деньги</h2>
        <p className="mb-4 text-[13px] text-muted">
          Расходы на подготовку добавляются в карточке авто — они автоматически войдут в себестоимость.
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="purchasePrice">Закупочная цена * €</label>
            <input
              id="purchasePrice"
              name="purchasePrice"
              type="number"
              step="0.01"
              required
              min={0}
              defaultValue={m(car?.purchasePrice)}
              className="field mono"
              placeholder="12000"
            />
          </div>
          <div>
            <label className="label" htmlFor="listPrice">Цена продажи * €</label>
            <input
              id="listPrice"
              name="listPrice"
              type="number"
              step="0.01"
              required
              min={0}
              defaultValue={m(car?.listPrice)}
              className="field mono"
              placeholder="15500"
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-1 text-[15px] font-bold">Налоги и закупка</h2>
        <p className="mb-4 text-[13px] text-muted">
          Если не заполнить: Einkaufspreis §24 = закупочной цене, плановая цена = цене продажи.
          Условные поля по каналам появятся в следующем обновлении.
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="taxScheme">Налоговый режим</label>
            <select id="taxScheme" name="taxScheme" defaultValue={car?.taxScheme ?? "DIFFERENZBESTEUERUNG"} className="field">
              {TAX_SCHEME_ORDER.map((k) => (
                <option key={k} value={k}>{TAX_SCHEME[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="purchaseChannel">Канал закупки</label>
            <select id="purchaseChannel" name="purchaseChannel" defaultValue={car?.purchaseChannel ?? ""} className="field">
              <option value="">—</option>
              {Object.entries(PURCHASE_CHANNEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="currentOwner">Владелец</label>
            <select id="currentOwner" name="currentOwner" defaultValue={car?.currentOwner ?? "MOTORHOF_OG"} className="field">
              {Object.entries(CURRENT_OWNER).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="arrivalDate">Дата поступления</label>
            <input id="arrivalDate" name="arrivalDate" type="date" defaultValue={dstr(car?.arrivalDate)} className="field" />
          </div>
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

      <section className="panel p-5">
        <label className="label" htmlFor="notes">Заметки</label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={car?.notes ?? ""}
          className="field resize-y"
          placeholder="Один владелец, сервисная книжка, нужна замена колодок"
        />
      </section>

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary">{submitLabel}</button>
        <Link href={cancelHref} className="btn btn-ghost">Отмена</Link>
      </div>
    </form>
  );
}
