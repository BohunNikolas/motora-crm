"use client";
import { SubmitButton } from "@/components/submit-button";

import Link from "next/link";
import { useState } from "react";
import {
  TASK_TYPE,
  TASK_TYPE_ORDER,
  TASK_PRIORITY,
  TASK_PRIORITY_ORDER,
  TASK_STATUS,
  TASK_STATUS_ORDER,
} from "@/lib/format";

// Задача §15.1. Клиентский компонент — тип FAHRZEUG требует выбор авто (§15.1),
// поэтому поле «Автомобиль» показывается и становится обязательным условно.
export type TaskDefaults = {
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  dueDate: string;
  assignedToUserId: string;
  carId: string;
};

export function TaskForm({
  defaults,
  action,
  submitLabel,
  cars,
  users,
  warrantyCaseId,
}: {
  defaults: TaskDefaults;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  cars: { id: string; label: string }[];
  users: { id: string; name: string }[];
  warrantyCaseId?: string;
}) {
  const [type, setType] = useState(defaults.type || "ALLGEMEIN");
  const isFahrzeug = type === "FAHRZEUG";

  return (
    <form action={action} className="flex flex-col gap-5">
      {warrantyCaseId && <input type="hidden" name="warrantyCaseId" value={warrantyCaseId} />}
      <section className="panel p-5">
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className="label" htmlFor="title">Название *</label>
            <input id="title" name="title" required defaultValue={defaults.title} className="field" placeholder="Перезвонить Thomas по Golf" />
          </div>
          <div>
            <label className="label" htmlFor="type">Тип *</label>
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} className="field">
              {TASK_TYPE_ORDER.map((k) => (<option key={k} value={k}>{TASK_TYPE[k]}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="priority">Приоритет</label>
            <select id="priority" name="priority" defaultValue={defaults.priority || "MEDIUM"} className="field">
              {TASK_PRIORITY_ORDER.map((k) => (<option key={k} value={k}>{TASK_PRIORITY[k].label}</option>))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="status">Статус</label>
            <select id="status" name="status" defaultValue={defaults.status || "OPEN"} className="field">
              {TASK_STATUS_ORDER.map((k) => (<option key={k} value={k}>{TASK_STATUS[k].label}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="dueDate">Срок</label>
            <input id="dueDate" name="dueDate" type="date" defaultValue={defaults.dueDate} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="assignedToUserId">Ответственный</label>
            <select id="assignedToUserId" name="assignedToUserId" defaultValue={defaults.assignedToUserId} className="field">
              <option value="">—</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
          </div>
          {/* Авто: для FAHRZEUG обязательно (§15.1), для ALLGEMEIN не показываем. */}
          {isFahrzeug && (
            <div>
              <label className="label" htmlFor="carId">Автомобиль *</label>
              <select id="carId" name="carId" required defaultValue={defaults.carId} className="field">
                <option value="">— выбрать —</option>
                {cars.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
              </select>
            </div>
          )}
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="description">Описание</label>
          <textarea id="description" name="description" rows={3} defaultValue={defaults.description} className="field resize-y" placeholder="Детали задачи" />
        </div>
      </section>

      <div className="flex gap-3">
        <SubmitButton pendingText="Сохранение…">{submitLabel}</SubmitButton>
        <Link href="/tasks" className="btn btn-ghost">Отмена</Link>
      </div>
    </form>
  );
}
