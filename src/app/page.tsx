import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { viewerFlags } from "@/lib/authz";
import {
  fmtMoney,
  sumMoney,
  dueLabel,
  isOverdue,
  CAR_STATUS,
  CAR_STATUS_ORDER,
  TASK_OPEN_STATUSES,
} from "@/lib/format";

export const dynamic = "force-dynamic";

// §4: воронка/сделки убраны из UI. Продажи — по Sale (§18). Полный дашборд §5 — фаза 5d.
export default async function Dashboard() {
  const user = await requireUser();
  const flags = viewerFlags(user);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [cars, salesMonth, openTasks, tasksTotal] = await Promise.all([
    prisma.car.findMany({ include: { expenses: true } }),
    prisma.sale.findMany({ where: { stage: "COMPLETED", saleDate: { gte: monthStart } } }),
    prisma.task.findMany({ where: { status: { in: TASK_OPEN_STATUSES } }, include: { client: true, car: true } }),
    prisma.task.count(),
  ]);

  const hasTasks = tasksTotal > 0;

  const tasks = [...openTasks]
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 6);

  const inStock = cars.filter((c) => c.status !== "SOLD");
  const stockValue = sumMoney(inStock.map((c) => c.listPrice));

  // Выручка и маржа месяца — по Sale и её замороженному snapshot (§18.2).
  const revenue = sumMoney(salesMonth.map((s) => s.actualSalePriceGross));
  const margin = sumMoney(
    salesMonth.map((s) => {
      const snap = s.financialSnapshot as { finalMargin?: string } | null;
      return snap?.finalMargin != null ? Number(snap.finalMargin) : 0;
    })
  );

  const stats = [
    { label: "Авто в наличии", value: String(inStock.length), sub: flags.seeMargin ? `на ${fmtMoney(stockValue)}` : "на складе" },
    ...(flags.seeSalePrice
      ? [{ label: "Продано за месяц", value: String(salesMonth.length), sub: `выручка ${fmtMoney(revenue)}` }]
      : []),
    ...(flags.seeMargin
      ? [{
          label: "Маржа за месяц",
          value: fmtMoney(margin),
          sub: revenue.gt(0) ? `${Math.round(margin.div(revenue).times(100).toNumber())}% от выручки` : "нет продаж",
          accent: true,
        }]
      : []),
  ];

  return (
    <div>
      <header className="animate-in mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Дашборд</h1>
          <p className="mt-1 text-sm text-muted">
            {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Vienna" })}
          </p>
        </div>
        <div className="flex gap-2">
          {flags.canEditCar && <Link href="/cars/new" className="btn btn-primary">+ Авто</Link>}
        </div>
      </header>

      <div className={`mb-6 grid gap-4 ${stats.length === 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {stats.map((s, i) => (
          <div key={s.label} className={`panel panel-hover animate-in delay-${i + 1} p-5`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{s.label}</div>
            <div className={`mono mt-2 text-[28px] font-bold leading-none ${s.accent ? "text-accent" : ""}`}>{s.value}</div>
            <div className="mt-2 text-[13px] text-muted">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="panel animate-in delay-4 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Задачи</h2>
            <Link href="/tasks" className="text-[13px] font-semibold text-accent hover:underline">Все →</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2.5">
                <div className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${isOverdue(t.dueDate) ? "bg-red" : "bg-accent"}`} />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium">{t.title}</div>
                  <div className="text-[12px] text-muted">
                    <span className={isOverdue(t.dueDate) ? "font-semibold text-red" : ""}>{dueLabel(t.dueDate)}</span>
                    {t.client ? ` · ${t.client.name}` : ""}
                    {t.car ? ` · ${t.car.make} ${t.car.model}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div>
                <p className="text-sm text-muted">{hasTasks ? "Все задачи закрыты 🎉" : "Задач пока нет."}</p>
                <Link href="/tasks" className="mt-1.5 inline-block text-[13px] font-semibold text-accent hover:underline">{hasTasks ? "К задачам →" : "Завести напоминание →"}</Link>
              </div>
            )}
          </div>
        </div>

        <div className="panel animate-in delay-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Склад</h2>
            {cars.length > 0 && <Link href="/cars" className="text-[13px] font-semibold text-accent hover:underline">Все →</Link>}
          </div>
          {cars.length === 0 ? (
            <div>
              <p className="text-sm text-muted">На складе пока нет автомобилей.</p>
              <Link href="/cars/new" className="mt-1.5 inline-block text-[13px] font-semibold text-accent hover:underline">Добавить первое авто →</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {CAR_STATUS_ORDER.map((st) => {
                const n = cars.filter((c) => c.status === st).length;
                return (
                  <Link key={st} href={`/cars?status=${st}`} className="flex items-center justify-between rounded-md px-1 py-0.5 transition-colors hover:bg-white/[0.03]">
                    <span className={`chip ${CAR_STATUS[st].cls}`}>{CAR_STATUS[st].label}</span>
                    <span className={`mono text-[15px] font-bold ${n === 0 ? "text-muted/40" : ""}`}>{n}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
