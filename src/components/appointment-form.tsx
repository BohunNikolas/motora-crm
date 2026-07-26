"use client";

import Link from "next/link";
import { useState } from "react";
import { APPOINTMENT_TYPE, APPOINTMENT_TYPE_ORDER } from "@/lib/format";

// Термин календаря §16.1. Клиентский — для автоподстановки конца (+30 мин) при
// вводе начала и лёгкого предупреждения, если конец не позже начала.
export type AppointmentDefaults = {
  clientName: string;
  phone: string;
  clientId: string;
  carId: string;
  employeeId: string;
  startAt: string; // datetime-local «2026-07-26T14:30»
  endAt: string;
  type: string;
  reminderMinutesBefore: string;
  comment: string;
};

const REMINDERS: [string, string][] = [
  ["", "без напоминания"],
  ["15", "за 15 минут"],
  ["30", "за 30 минут"],
  ["60", "за час"],
  ["1440", "за сутки"],
];

// Прибавить минуты к datetime-local строке, сохранив формат (для автоконца).
function addMinutes(local: string, mins: number): string {
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + mins);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentForm({
  defaults,
  action,
  submitLabel,
  clients,
  cars,
  users,
}: {
  defaults: AppointmentDefaults;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  clients: { id: string; name: string; phone: string | null }[];
  cars: { id: string; label: string }[];
  users: { id: string; name: string }[];
}) {
  const [start, setStart] = useState(defaults.startAt);
  const [end, setEnd] = useState(defaults.endAt);
  const badRange = !!start && !!end && new Date(end).getTime() <= new Date(start).getTime();

  return (
    <form action={action} className="flex flex-col gap-5">
      <section className="panel p-5">
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className="label" htmlFor="clientName">Клиент *</label>
            <input id="clientName" name="clientName" required defaultValue={defaults.clientName} className="field" placeholder="Имя клиента" />
          </div>
          <div>
            <label className="label" htmlFor="phone">Телефон</label>
            <input id="phone" name="phone" defaultValue={defaults.phone} className="field mono" placeholder="+43…" />
          </div>
          <div>
            <label className="label" htmlFor="clientId">Из базы клиентов</label>
            <select id="clientId" name="clientId" defaultValue={defaults.clientId} className="field">
              <option value="">— необязательно —</option>
              {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="type">Тип *</label>
            <select id="type" name="type" defaultValue={defaults.type || "BESICHTIGUNG"} className="field">
              {APPOINTMENT_TYPE_ORDER.map((k) => (<option key={k} value={k}>{APPOINTMENT_TYPE[k]}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="carId">Автомобиль</label>
            <select id="carId" name="carId" defaultValue={defaults.carId} className="field">
              <option value="">— не выбран —</option>
              {cars.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="employeeId">Сотрудник</label>
            <select id="employeeId" name="employeeId" defaultValue={defaults.employeeId} className="field">
              <option value="">— не назначен —</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="startAt">Начало *</label>
            <input
              id="startAt" name="startAt" type="datetime-local" required value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (!end || new Date(end) <= new Date(e.target.value)) setEnd(addMinutes(e.target.value, 30));
              }}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="endAt">Конец *</label>
            <input id="endAt" name="endAt" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className="field" />
            {badRange && <p className="mt-1 text-[12px] text-red">Конец должен быть позже начала</p>}
          </div>
          <div>
            <label className="label" htmlFor="reminderMinutesBefore">Напоминание</label>
            <select id="reminderMinutesBefore" name="reminderMinutesBefore" defaultValue={defaults.reminderMinutesBefore} className="field">
              {REMINDERS.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="comment">Комментарий</label>
          <textarea id="comment" name="comment" rows={2} defaultValue={defaults.comment} className="field resize-y" placeholder="Детали встречи" />
        </div>
      </section>

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={badRange}>{submitLabel}</button>
        <Link href="/calendar" className="btn btn-ghost">Отмена</Link>
      </div>
    </form>
  );
}
