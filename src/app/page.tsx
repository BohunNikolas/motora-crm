import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { viewerFlags } from "@/lib/authz";
import {
  fmtMoney, fmtDate, fmtTime, sumMoney, carCost, carMargin, dueLabel, isOverdue,
  carAttention, nowMs,
  CAR_STATUS, CAR_STATUS_ORDER, NOT_FOR_SALE_STATUSES, WARRANTY_OPEN_STATUSES, APPOINTMENT_TYPE, TASK_OPEN_STATUSES,
} from "@/lib/format";

export const dynamic = "force-dynamic";

// Полный дашборд §5: KPI, строка статусов, ближайшие просмотры + задачи, «Требует внимания».
export default async function Dashboard() {
  const user = await requireUser();
  const flags = viewerFlags(user);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 8);

  const [cars, salesMonth, expensesMonth, appts, openTasks, tasksTotal, warrantyOpenCount] = await Promise.all([
    prisma.car.findMany({ include: { expenses: true, files: { select: { kind: true, docType: true } } } }),
    prisma.sale.findMany({ where: { stage: "COMPLETED", saleDate: { gte: monthStart } } }),
    prisma.expense.findMany({ where: { cancelled: false, invoiceDate: { gte: monthStart } } }),
    prisma.appointment.findMany({
      where: { status: { not: "ABGESAGT" }, startAt: { gte: todayStart, lt: weekEnd } },
      include: { car: { select: { make: true, model: true } } },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
    prisma.task.findMany({ where: { status: { in: TASK_OPEN_STATUSES } }, include: { assignedTo: { select: { name: true } }, car: { select: { make: true, model: true } } } }),
    prisma.task.count(),
    prisma.warrantyCase.count({ where: { status: { in: WARRANTY_OPEN_STATUSES } } }),
  ]);

  const NOW = nowMs();
  const inStock = cars.filter((c) => c.status !== "SOLD" && c.status !== "ARCHIVED");
  const stockValue = sumMoney(inStock.map((c) => carCost(c)));
  // П2/П3: «В продаже» (READY_FOR_SALE) и «Не в продаже» (активные, ещё не выставленные).
  const forSale = cars.filter((c) => c.status === "READY_FOR_SALE");
  const notForSale = cars.filter((c) => NOT_FOR_SALE_STATUSES.includes(c.status));
  // П4: подпись карточки «В продаже» — общая сумма плановой маржи этих авто.
  const forSaleMargin = sumMoney(forSale.map((c) => carMargin(c)));

  const revenue = sumMoney(salesMonth.map((s) => s.actualSalePriceGross));
  const margin = sumMoney(salesMonth.map((s) => {
    const snap = s.financialSnapshot as { finalMargin?: string } | null;
    return snap?.finalMargin != null ? Number(snap.finalMargin) : 0;
  }));
  const expenseGross = sumMoney(expensesMonth.map((e) => e.amountGross));
  const expensePaid = sumMoney(expensesMonth.filter((e) => e.paymentStatus === "PAID").map((e) => e.amountGross));

  // Требует внимания (§5.5).
  const attn = cars.map((c) => carAttention(c, NOW));
  const cnt = {
    pickerl: attn.filter((a) => a.pickerl).length,
    nophoto: attn.filter((a) => a.noPhoto).length,
    nodocs: attn.filter((a) => a.noDocs).length,
    age30: attn.filter((a) => a.age >= 30).length,
    age60: attn.filter((a) => a.age >= 60).length,
    age90: attn.filter((a) => a.age >= 90).length,
  };

  const tasks = [...openTasks]
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 7);
  const hasTasks = tasksTotal > 0;

  // KPI-карточки (§5.2), по ролям.
  const stats: { label: string; value: string; sub: string; href?: string; accent?: boolean }[] = [
    { label: "Склад", value: String(inStock.length), sub: flags.seeMargin ? fmtMoney(stockValue) : "непроданных", href: "/cars?stock=active" },
    {
      label: "В продаже",
      value: String(forSale.length),
      // П4: вместо служебного READY_FOR_SALE — сумма плановой маржи (только тем, кто видит маржу).
      sub: flags.seeMargin ? `плановая маржа ${fmtMoney(forSaleMargin)}` : "готовы к продаже",
      href: "/cars?status=READY_FOR_SALE",
    },
    { label: "Не в продаже", value: String(notForSale.length), sub: "в подготовке и в пути", href: "/cars?stock=notforsale" },
    ...(flags.seeSalePrice ? [{ label: "Продано за месяц", value: String(salesMonth.length), sub: `выручка ${fmtMoney(revenue)}` }] : []),
    ...(flags.seeMargin ? [{ label: "Маржа за месяц", value: fmtMoney(margin), sub: revenue.gt(0) ? `${Math.round(margin.div(revenue).times(100).toNumber())}% от выручки` : "нет продаж", accent: true }] : []),
    ...(flags.canAddExpense ? [{ label: "Расходы за месяц", value: fmtMoney(expenseGross), sub: `оплачено ${fmtMoney(expensePaid)}`, href: "/expenses" }] : []),
  ];

  const attnCards = [
    { label: "Pickerl требуют внимания", n: cnt.pickerl, href: "/cars?attention=pickerl" },
    { label: "Без фотографий", n: cnt.nophoto, href: "/cars?attention=nophoto" },
    { label: "Без обязательных документов", n: cnt.nodocs, href: "/cars?attention=nodocs" },
    { label: "На складе > 30 дней", n: cnt.age30, href: "/cars?attention=age30" },
    { label: "На складе > 60 дней", n: cnt.age60, href: "/cars?attention=age60" },
    { label: "На складе > 90 дней", n: cnt.age90, href: "/cars?attention=age90" },
    { label: "Открытые Gewährleistung", n: warrantyOpenCount, href: "/warranty?open=1" },
  ];

  return (
    <div>
      <header className="animate-in mb-7 flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Обзор</h1>
          <p className="mt-1 text-sm text-muted">{new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Vienna" })}</p>
        </div>
        <div className="flex gap-2">
          {flags.canEditCar && <Link href="/cars/new" className="btn btn-primary">+ Автомобиль</Link>}
          {flags.canAddExpense && <Link href="/expenses/new" className="btn btn-ghost">+ Расход</Link>}
        </div>
      </header>

      {/* §5.2 KPI */}
      <div className={`mb-4 grid gap-4 ${stats.length >= 5 ? "grid-cols-5" : stats.length === 4 ? "grid-cols-4" : stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {stats.map((s, i) => {
          const inner = (
            <>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{s.label}</div>
              <div className={`mono mt-2 text-[26px] font-bold leading-none ${s.accent ? "text-accent" : ""}`}>{s.value}</div>
              <div className="mt-2 text-[13px] text-muted">{s.sub}</div>
            </>
          );
          return s.href
            ? <Link key={s.label} href={s.href} className={`panel panel-hover animate-in delay-${i + 1} block p-5`}>{inner}</Link>
            : <div key={s.label} className={`panel animate-in delay-${i + 1} p-5`}>{inner}</div>;
        })}
      </div>

      {/* §5.3 строка статусов */}
      <div className="animate-in delay-2 mb-6 overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max">
          {CAR_STATUS_ORDER.map((st) => {
            const n = cars.filter((c) => c.status === st).length;
            return (
              <Link key={st} href={`/cars?status=${st}`} className="flex shrink-0 items-center gap-2 rounded-full border border-line px-2.5 py-1.5 transition-colors hover:border-line-strong">
                <span className={`chip ${CAR_STATUS[st].cls}`}>{CAR_STATUS[st].label}</span>
                <span className={`mono text-[13px] font-bold ${n === 0 ? "text-muted/50" : ""}`}>{n}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* §5.4 просмотры + задачи */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <section className="panel animate-in delay-3 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Ближайшие просмотры</h2>
            <Link href="/calendar" className="text-[13px] font-semibold text-accent hover:underline">Календарь →</Link>
          </div>
          {appts.length === 0 ? (
            <p className="text-[13px] text-muted">На ближайшую неделю терминов нет.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {appts.map((a) => (
                <Link key={a.id} href={`/calendar/${a.id}/edit`} className="flex items-center justify-between gap-3 border-b border-line pb-2.5 last:border-none">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{a.clientName}</div>
                    <div className="text-[12px] text-muted">{APPOINTMENT_TYPE[a.type] ?? a.type}{a.car ? ` · ${a.car.make} ${a.car.model}` : ""}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-semibold">{fmtDate(a.startAt)}</div>
                    <div className="mono text-[12px] text-muted">{fmtTime(a.startAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel animate-in delay-4 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Задачи</h2>
            <Link href="/tasks" className="text-[13px] font-semibold text-accent hover:underline">Все →</Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-[13px] text-muted">{hasTasks ? "Все задачи закрыты 🎉" : "Задач пока нет."}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5">
                  <div className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${isOverdue(t.dueDate) ? "bg-red" : "bg-accent"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{t.title}</div>
                    <div className="text-[12px] text-muted">
                      <span className={isOverdue(t.dueDate) ? "font-semibold text-red" : ""}>{dueLabel(t.dueDate)}</span>
                      {t.assignedTo ? ` · ${t.assignedTo.name}` : ""}
                      {t.car ? ` · ${t.car.make} ${t.car.model}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* §5.5 требует внимания */}
      <section className="animate-in delay-5">
        <h2 className="mb-3 text-[15px] font-bold">Требует внимания</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {attnCards.map((c) => (
            <Link key={c.label} href={c.href} className={`panel panel-hover flex items-center justify-between gap-3 p-4 ${c.n > 0 ? "" : "opacity-55"}`}>
              <span className="text-[13px] leading-snug">{c.label}</span>
              <span className={`mono text-[22px] font-bold ${c.n > 0 ? "text-accent" : "text-muted"}`}>{c.n}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
