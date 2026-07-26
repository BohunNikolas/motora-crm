import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setTaskStatus, cancelTask } from "@/lib/actions";
import { ConfirmButton } from "@/components/confirm-button";
import {
  dueLabel,
  isOverdue,
  startOfToday,
  internalCode,
  TASK_TYPE,
  TASK_TYPE_ORDER,
  TASK_PRIORITY,
  TASK_PRIORITY_ORDER,
  TASK_STATUS,
  TASK_STATUS_ORDER,
  TASK_OPEN_STATUSES,
} from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
type TaskFull = Prisma.TaskGetPayload<{
  include: { client: true; car: true; assignedTo: { select: { name: true } } };
}>;

const carLabel = (
  c: { mhNumber: number; parkingRow: string | null; parkingSpot: number | null } | null,
  make?: string,
  model?: string
) => (c ? `${internalCode(c)} ${make ?? ""} ${model ?? ""}`.trim() : "—");

function TaskRow({ task, canManage }: { task: TaskFull; canManage: boolean }) {
  const isOpen = TASK_OPEN_STATUSES.includes(task.status);
  const overdue = isOpen && isOverdue(task.dueDate);
  const pr = TASK_PRIORITY[task.priority];
  const st = TASK_STATUS[task.status];

  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-none">
      {/* Быстрое переключение выполнено/в работу (детальные статусы — в форме правки). */}
      {canManage && (
        <form action={setTaskStatus.bind(null, task.id, task.status === "DONE" ? "OPEN" : "DONE")} className="flex">
          <button
            type="submit"
            title={task.status === "DONE" ? "Вернуть в работу" : "Отметить выполненной"}
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] transition-colors ${
              task.status === "DONE"
                ? "border-transparent bg-[var(--done)] text-bg"
                : "border-line-strong text-transparent hover:border-accent hover:text-accent/40"
            }`}
          >
            ✓
          </button>
        </form>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/tasks/${task.id}/edit`}
            className={`text-[14px] hover:text-accent ${task.status === "DONE" || task.status === "CANCELLED" ? "text-muted line-through" : "font-medium"}`}
          >
            {task.title}
          </Link>
          <span className={`chip ${pr?.cls ?? "chip-muted"}`}>{pr?.label ?? task.priority}</span>
          {task.status !== "OPEN" && (
            <span className={`chip ${st?.cls ?? "chip-muted"}`}>{st?.label ?? task.status}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          <span className={overdue ? "font-semibold text-red" : ""}>{dueLabel(task.dueDate)}</span>
          <span>·</span>
          <span>{TASK_TYPE[task.type] ?? task.type}</span>
          {task.assignedTo && (<><span>·</span><span>{task.assignedTo.name}</span></>)}
          {task.car && (
            <><span>·</span>
              <Link href={`/cars/${task.carId}`} className="hover:text-ink">
                {carLabel(task.car, task.car.make, task.car.model)}
              </Link>
            </>
          )}
          {task.client && (
            <><span>·</span>
              <Link href={`/clients/${task.clientId}`} className="hover:text-ink">{task.client.name}</Link>
            </>
          )}
        </div>
      </div>

      {canManage && task.status !== "CANCELLED" && (
        <form action={cancelTask.bind(null, task.id)} className="flex">
          <ConfirmButton
            message={`Отменить задачу «${task.title}»? Она сохранится в истории со статусом «Отменена».`}
            className="rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:bg-[var(--red-dim)] hover:text-red"
          >
            ✕
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const canManage = can(user, "task.manage");
  const sp = await searchParams;

  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const where: Prisma.TaskWhereInput = {};
  // Быстрые срезы §15.2 (мои / просроченные / сегодня); «все» — без ограничения.
  if (sp.scope === "mine") where.assignedToUserId = user.id;
  else if (sp.scope === "overdue") { where.status = { in: TASK_OPEN_STATUSES }; where.dueDate = { lt: today }; }
  else if (sp.scope === "today") { where.status = { in: TASK_OPEN_STATUSES }; where.dueDate = { gte: today, lt: tomorrow }; }

  // Явные фильтры перекрывают быстрый срез по тем же полям.
  if (sp.status) where.status = sp.status;
  else if (!where.status) where.status = { not: "CANCELLED" }; // по умолчанию отменённые скрыты
  if (sp.priority) where.priority = sp.priority;
  if (sp.type) where.type = sp.type;
  if (sp.assignedToUserId) where.assignedToUserId = sp.assignedToUserId;
  if (sp.carId) where.carId = sp.carId;

  const [tasks, cars, users] = await Promise.all([
    prisma.task.findMany({
      where,
      include: { client: true, car: true, assignedTo: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
    }),
    prisma.car.findMany({
      where: { status: { not: "SOLD" } },
      orderBy: [{ make: "asc" }],
      select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const openCount = tasks.filter((t) => TASK_OPEN_STATUSES.includes(t.status)).length;
  const overdueCount = tasks.filter((t) => TASK_OPEN_STATUSES.includes(t.status) && isOverdue(t.dueDate)).length;

  const scopes = [
    { key: "", label: "Все" },
    { key: "mine", label: "Мои" },
    { key: "overdue", label: "Просроченные" },
    { key: "today", label: "Сегодня" },
  ];

  return (
    <div>
      <header className="animate-in mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Задачи</h1>
          <p className="mt-1 text-sm text-muted">
            {tasks.length} по фильтру · {openCount} открытых
            {overdueCount ? ` · ${overdueCount} просрочено` : ""}
          </p>
        </div>
        {canManage && <Link href="/tasks/new" className="btn btn-primary">+ Задача</Link>}
      </header>

      {/* Быстрые срезы */}
      <div className="animate-in mb-3 flex flex-wrap gap-2">
        {scopes.map((s) => {
          const active = (sp.scope ?? "") === s.key;
          const qs = s.key ? `?scope=${s.key}` : "";
          return (
            <Link
              key={s.key}
              href={`/tasks${qs}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                active ? "bg-accent text-bg" : "panel text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* Фильтры (в URL, §23) */}
      <form className="panel animate-in mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        {sp.scope && <input type="hidden" name="scope" value={sp.scope} />}
        <div><label className="label">Статус</label>
          <select name="status" defaultValue={sp.status ?? ""} className="field w-[150px]">
            <option value="">активные</option>
            {TASK_STATUS_ORDER.map((k) => (<option key={k} value={k}>{TASK_STATUS[k].label}</option>))}
          </select></div>
        <div><label className="label">Приоритет</label>
          <select name="priority" defaultValue={sp.priority ?? ""} className="field w-[130px]">
            <option value="">все</option>
            {TASK_PRIORITY_ORDER.map((k) => (<option key={k} value={k}>{TASK_PRIORITY[k].label}</option>))}
          </select></div>
        <div><label className="label">Тип</label>
          <select name="type" defaultValue={sp.type ?? ""} className="field w-[150px]">
            <option value="">все</option>
            {TASK_TYPE_ORDER.map((k) => (<option key={k} value={k}>{TASK_TYPE[k]}</option>))}
          </select></div>
        <div><label className="label">Ответственный</label>
          <select name="assignedToUserId" defaultValue={sp.assignedToUserId ?? ""} className="field w-[150px]">
            <option value="">все</option>
            {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </select></div>
        <div><label className="label">Авто</label>
          <select name="carId" defaultValue={sp.carId ?? ""} className="field w-[190px]">
            <option value="">все</option>
            {cars.map((c) => (<option key={c.id} value={c.id}>{carLabel(c, c.make, c.model)}</option>))}
          </select></div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Фильтр</button>
          <Link href="/tasks" className="btn btn-ghost">Сброс</Link>
        </div>
      </form>

      {/* Список */}
      <div className="panel animate-in p-5">
        {tasks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[15px] font-semibold">Задач по фильтру нет</p>
            <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted">
              Сбросьте фильтры или заведите новую задачу.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {tasks.map((t) => (<TaskRow key={t.id} task={t} canManage={canManage} />))}
          </div>
        )}
      </div>
    </div>
  );
}
