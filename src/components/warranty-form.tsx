import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";

// Форма гарантийного случая (§19). Статус в форме не задаётся — меняется кнопками
// на странице случая. Здесь — фактические данные: жалоба, обработка, исполнение.
export type WarrantyDefaults = {
  carId: string;
  clientId: string;
  complaintDescription: string;
  clientReportedAt: string;
  responsibleUserId: string;
  workshop: string;
  deadline: string;
  diagnosis: string;
  decision: string;
  communicationNotes: string;
  finalCost: string;
};

export function WarrantyForm({
  defaults,
  action,
  submitLabel,
  cars,
  clients,
  users,
  lockCar = false,
}: {
  defaults: WarrantyDefaults;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  cars: { id: string; label: string }[];
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  lockCar?: boolean;
}) {
  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Жалоба</h2>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="carId">Проданный автомобиль *</label>
            {lockCar ? (
              <>
                <div className="field flex items-center bg-surface-2 text-muted">{cars[0]?.label ?? "—"}</div>
                <input type="hidden" name="carId" value={defaults.carId} />
              </>
            ) : (
              <select id="carId" name="carId" required defaultValue={defaults.carId} className="field">
                <option value="">— выберите авто —</option>
                {cars.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
              </select>
            )}
          </div>
          <div>
            <label className="label" htmlFor="clientId">Клиент</label>
            <select id="clientId" name="clientId" defaultValue={defaults.clientId} className="field">
              <option value="">— не выбран —</option>
              {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="clientReportedAt">Дата обращения</label>
            <input id="clientReportedAt" name="clientReportedAt" type="date" defaultValue={defaults.clientReportedAt} className="field" />
          </div>
          <div className="sm:col-span-2 xl:col-span-4">
            <label className="label" htmlFor="complaintDescription">Описание жалобы *</label>
            <textarea id="complaintDescription" name="complaintDescription" required rows={2} defaultValue={defaults.complaintDescription} className="field resize-y" placeholder="Что не так с автомобилем со слов клиента" />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-4 text-[15px] font-bold">Обработка</h2>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="responsibleUserId">Ответственный</label>
            <select id="responsibleUserId" name="responsibleUserId" defaultValue={defaults.responsibleUserId} className="field">
              <option value="">— не назначен —</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="workshop">Мастерская / поставщик</label>
            <input id="workshop" name="workshop" defaultValue={defaults.workshop} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="deadline">Срок</label>
            <input id="deadline" name="deadline" type="date" defaultValue={defaults.deadline} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="diagnosis">Диагноз</label>
            <textarea id="diagnosis" name="diagnosis" rows={2} defaultValue={defaults.diagnosis} className="field resize-y" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="decision">Решение</label>
            <textarea id="decision" name="decision" rows={2} defaultValue={defaults.decision} className="field resize-y" placeholder="Ремонт по гарантии / частично / отказ и т.п." />
          </div>
          <div>
            <label className="label" htmlFor="finalCost">Итоговая стоимость €</label>
            <input id="finalCost" name="finalCost" type="number" step="0.01" min={0} defaultValue={defaults.finalCost} className="field mono" />
          </div>
          <div className="sm:col-span-2 xl:col-span-3">
            <label className="label" htmlFor="communicationNotes">Заметки по коммуникации</label>
            <textarea id="communicationNotes" name="communicationNotes" rows={2} defaultValue={defaults.communicationNotes} className="field resize-y" placeholder="Договорённости с клиентом, звонки" />
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <SubmitButton pendingText="Сохранение…">{submitLabel}</SubmitButton>
        <Link href="/warranty" className="btn btn-ghost">Отмена</Link>
      </div>
    </form>
  );
}
