import type { Client } from "@prisma/client";
import { CLIENT_TYPE, SOURCES } from "@/lib/format";

/** Поля клиента. Используется и в инлайн-форме на /clients, и на странице редактирования. */
export function ClientFields({ client }: { client?: Client }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div>
        <label className="label" htmlFor="name">Имя *</label>
        <input id="name" name="name" required defaultValue={client?.name} className="field" placeholder="Андрей Петров" />
      </div>
      <div>
        <label className="label" htmlFor="phone">Телефон *</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={client?.phone}
          className="field mono"
          placeholder="+7 900 123-45-67"
        />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={client?.email ?? ""} className="field" placeholder="a.petrov@mail.ru" />
      </div>
      <div>
        <label className="label" htmlFor="type">Тип</label>
        <select id="type" name="type" defaultValue={client?.type ?? "BUYER"} className="field">
          {Object.entries(CLIENT_TYPE).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="source">Источник</label>
        <select id="source" name="source" defaultValue={client?.source ?? ""} className="field">
          <option value="">—</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="col-span-3">
        <label className="label" htmlFor="notes">Заметки</label>
        <input
          id="notes"
          name="notes"
          defaultValue={client?.notes ?? ""}
          className="field"
          placeholder="Ищет седан до € 15.000, готов на трейд-ин"
        />
      </div>
    </div>
  );
}
