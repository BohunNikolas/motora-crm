import Link from "next/link";
import type { Car } from "@prisma/client";
import { CAR_STATUS, CAR_STATUS_ORDER, TRANSMISSIONS, FUELS } from "@/lib/format";

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
            <label className="label" htmlFor="purchasePrice">Закупочная цена *</label>
            <input
              id="purchasePrice"
              name="purchasePrice"
              type="number"
              required
              min={0}
              defaultValue={car?.purchasePrice}
              className="field mono"
              placeholder="12000"
            />
          </div>
          <div>
            <label className="label" htmlFor="listPrice">Цена продажи *</label>
            <input
              id="listPrice"
              name="listPrice"
              type="number"
              required
              min={0}
              defaultValue={car?.listPrice}
              className="field mono"
              placeholder="15500"
            />
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
