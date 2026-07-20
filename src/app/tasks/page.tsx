import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTask, toggleTask, deleteTask } from "@/lib/actions";
import { dueLabel, isOverdue, startOfToday } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { viewerFlags, type ViewerFlags } from "@/lib/authz";

export const dynamic = "force-dynamic";

type TaskFull = Prisma.TaskGetPayload<{ include: { client: true; car: true } }>;

function TaskRow({ task, flags }: { task: TaskFull; flags: ViewerFlags }) {
  const overdue = !task.done && isOverdue(task.dueDate);

  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-none">
      <form action={toggleTask.bind(null, task.id)} className="flex">
        <button
          type="submit"
          title={task.done ? "Вернуть в работу" : "Выполнено"}
          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] transition-colors ${
            task.done
              ? "border-transparent bg-[var(--muted)] text-bg"
              : "border-line-strong text-transparent hover:border-accent hover:text-accent/40"
          }`}
        >
          ✓
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <div className={`text-[14px] ${task.done ? "text-muted line-through" : "font-medium"}`}>
          {task.title}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          <span className={overdue ? "font-semibold text-red" : ""}>{dueLabel(task.dueDate)}</span>
          {task.client && (
            <>
              <span>·</span>
              <Link href={`/clients/${task.clientId}`} className="hover:text-ink">
                {task.client.name}
              </Link>
            </>
          )}
          {task.car && (
            <>
              <span>·</span>
              <Link href={`/cars/${task.carId}`} className="hover:text-ink">
                {task.car.make} {task.car.model}
              </Link>
            </>
          )}
        </div>
      </div>

      {flags.canDelete && (
        <form action={deleteTask.bind(null, task.id)} className="flex">
          <button
            type="submit"
            title="Удалить задачу"
            className="rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:bg-[var(--red-dim)] hover:text-red"
          >
            ✕
          </button>
        </form>
      )}
    </div>
  );
}

function Group({
  title,
  tasks,
  tone,
  flags,
}: {
  title: string;
  tasks: TaskFull[];
  tone?: "red" | "amber";
  flags: ViewerFlags;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="panel p-5">
      <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-bold">
        <span className={tone === "red" ? "text-red" : tone === "amber" ? "text-accent" : ""}>
          {title}
        </span>
        <span className="mono text-[13px] font-normal text-muted">{tasks.length}</span>
      </h2>
      <div className="flex flex-col">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} flags={flags} />
        ))}
      </div>
    </section>
  );
}

export default async function TasksPage() {
  const user = await requireUser();
  const flags = viewerFlags(user);
  const [tasks, clients, cars] = await Promise.all([
    prisma.task.findMany({
      include: { client: true, car: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.car.findMany({ where: { status: { not: "SOLD" } }, orderBy: [{ make: "asc" }, { model: "asc" }] }),
  ]);

  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate) < today);
  const dueToday = open.filter(
    (t) => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) < tomorrow
  );
  const upcoming = open.filter((t) => t.dueDate && new Date(t.dueDate) >= tomorrow);
  const noDate = open.filter((t) => !t.dueDate);
  const done = tasks.filter((t) => t.done);

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Задачи</h1>
        <p className="mt-1 text-sm text-muted">
          {open.length === 0
            ? "открытых задач нет"
            : `${open.length} открытых${overdue.length ? ` · ${overdue.length} просрочено` : ""}${
                dueToday.length ? ` · ${dueToday.length} на сегодня` : ""
              }`}
        </p>
      </header>

      {flags.canManageTasks && (
      <form action={createTask} className="panel animate-in delay-1 mb-4 flex flex-wrap gap-2 p-4">
        <input name="title" required className="field min-w-[240px] flex-1" placeholder="Перезвонить по Camry" />
        <input name="dueDate" type="date" className="field w-[150px]" />
        <select name="clientId" className="field w-[180px]" defaultValue="">
          <option value="">— клиент —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="carId" className="field w-[180px]" defaultValue="">
          <option value="">— авто —</option>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.make} {c.model} {c.year}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">+ Задача</button>
      </form>
      )}

      {tasks.length === 0 ? (
        <div className="panel animate-in delay-2 px-5 py-14 text-center">
          <p className="text-[15px] font-semibold">Задач пока нет</p>
          <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted">
            Заведите первую — «перезвонить Андрею по Camry в четверг». Просроченные
            подсветятся здесь и на дашборде.
          </p>
        </div>
      ) : (
        <div className="animate-in delay-2 flex flex-col gap-4">
          <Group title="Просрочено" tasks={overdue} tone="red" flags={flags} />
          <Group title="Сегодня" tasks={dueToday} tone="amber" flags={flags} />
          <Group title="Предстоящие" tasks={upcoming} flags={flags} />
          <Group title="Без срока" tasks={noDate} flags={flags} />

          {open.length === 0 && (
            <div className="panel px-5 py-10 text-center">
              <p className="text-[15px] font-semibold">Все задачи закрыты 🎉</p>
              <p className="mt-1.5 text-sm text-muted">Открытых задач не осталось.</p>
            </div>
          )}

          {done.length > 0 && (
            <details className="panel overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-bold transition-colors hover:text-accent">
                Выполненные <span className="mono ml-1 font-normal text-muted">{done.length}</span>
              </summary>
              <div className="border-t border-line px-5 py-2">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} flags={flags} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
