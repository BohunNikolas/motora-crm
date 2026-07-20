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
  DEAL_STAGES,
  STAGE_LABEL,
  DEAL_TYPE,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const flags = viewerFlags(user);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [cars, activeDeals, salesMonth, openTasks, dealsTotal, tasksTotal] = await Promise.all([
    prisma.car.findMany({ include: { expenses: true } }),
    prisma.deal.findMany({
      where: { stage: { notIn: ["DONE", "LOST"] } },
      include: { client: true, car: true },
      orderBy: { createdAt: "desc" },
    }),
    // §18/§5: продажи и маржа месяца — по Sale (источник истины), не по Deal.
    prisma.sale.findMany({
      where: { stage: "COMPLETED", saleDate: { gte: monthStart } },
    }),
    // Без take/orderBy по dueDate: SQLite ставит NULL первыми, и бессрочные задачи
    // вытеснили бы просроченные из списка. Сортируем в JS — срочное наверх, «без срока» вниз.
    prisma.task.findMany({
      where: { done: false },
      include: { client: true, car: true },
    }),
    // Счётчики нужны, чтобы отличить «ничего не заведено» от «всё закрыто»:
    // тексты и подсказки в пустых блоках должны быть разными.
    prisma.deal.count(),
    prisma.task.count(),
  ]);

  const hasDeals = dealsTotal > 0;
  const hasTasks = tasksTotal > 0;

  // Сначала задачи со сроком (по возрастанию — просроченные первыми), затем бессрочные.
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

  // Выручка и маржа месяца — по фактической цене продажи Sale и её замороженному
  // financial snapshot (§18.2): исторические продажи не меняются от настроек ставки.
  const revenue = sumMoney(salesMonth.map((s) => s.actualSalePriceGross));
  const margin = sumMoney(
    salesMonth.map((s) => {
      const snap = s.financialSnapshot as { finalMargin?: string } | null;
      return snap?.finalMargin != null ? Number(snap.finalMargin) : 0;
    })
  );

  const pipelineValue = sumMoney(activeDeals.map((d) => d.amount));

  const stageCounts = DEAL_STAGES.filter((s) => s.key !== "DONE").map((s) => ({
    ...s,
    count: activeDeals.filter((d) => d.stage === s.key).length,
  }));
  const maxCount = Math.max(1, ...stageCounts.map((s) => s.count));

  // Redaction: карточки с запрещёнными суммами не попадают в массив вообще —
  // их цифр нет в HTML для этой роли (SALES: без маржи и стоимости склада;
  // TECHNICAL: только количество авто).
  const stats = [
    {
      label: "Авто в наличии",
      value: String(inStock.length),
      sub: flags.seeMargin ? `на ${fmtMoney(stockValue)}` : "на складе",
    },
    ...(flags.seeDeals && flags.seeSalePrice
      ? [
          {
            label: "Сделки в работе",
            value: String(activeDeals.length),
            sub: `потенциал ${fmtMoney(pipelineValue)}`,
          },
          {
            label: "Продано за месяц",
            value: String(salesMonth.length),
            sub: `выручка ${fmtMoney(revenue)}`,
          },
        ]
      : []),
    ...(flags.seeMargin
      ? [
          {
            label: "Маржа за месяц",
            value: fmtMoney(margin),
            sub: revenue.gt(0)
              ? `${Math.round(margin.div(revenue).times(100).toNumber())}% от выручки`
              : "нет продаж",
            accent: true,
          },
        ]
      : []),
  ];

  return (
    <div>
      <header className="animate-in mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">
            Дашборд
          </h1>
          <p className="mt-1 text-sm text-muted">
            {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Vienna" })}
          </p>
        </div>
        <div className="flex gap-2">
          {flags.canEditCar && <Link href="/cars/new" className="btn btn-primary">+ Авто</Link>}
          {flags.seeDeals && <Link href="/deals" className="btn btn-ghost">Сделки</Link>}
        </div>
      </header>

      <div className={`mb-6 grid gap-4 ${stats.length === 4 ? "grid-cols-4" : stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {stats.map((s, i) => (
          <div key={s.label} className={`panel panel-hover animate-in delay-${i + 1} p-5`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              {s.label}
            </div>
            <div className={`mono mt-2 text-[28px] font-bold leading-none ${s.accent ? "text-accent" : ""}`}>
              {s.value}
            </div>
            <div className="mt-2 text-[13px] text-muted">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className={`grid gap-4 ${flags.seeDeals ? "grid-cols-5" : "grid-cols-2"}`}>
        {flags.seeDeals && (
        <div className="panel animate-in delay-3 col-span-3 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Воронка продаж</h2>
            <Link href="/deals" className="text-[13px] font-semibold text-accent hover:underline">
              Все сделки →
            </Link>
          </div>
          {activeDeals.length === 0 && (
            <p className="mb-3 text-[13px] text-muted">
              {hasDeals
                ? "Сейчас в воронке пусто — активных сделок нет."
                : "Воронка заполнится, когда появятся первые сделки."}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {stageCounts.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-[92px] shrink-0 text-[13px] text-muted">{s.label}</div>
                <div className="h-[26px] flex-1 overflow-hidden rounded-md bg-surface-2">
                  <div
                    className="h-full rounded-md bg-[rgba(246,243,242,0.28)] transition-all"
                    style={{ width: s.count ? `${(s.count / maxCount) * 100}%` : "0%" }}
                  />
                </div>
                <div className="mono w-6 text-right text-[14px] font-bold">{s.count}</div>
              </div>
            ))}
          </div>

          <h2 className="mb-3 mt-7 text-[15px] font-bold">Последние сделки</h2>
          <div className="flex flex-col">
            {activeDeals.slice(0, 5).map((d) => (
              <Link
                key={d.id}
                href="/deals"
                className="flex items-center justify-between border-b border-line py-2.5 last:border-none hover:bg-white/[0.02]"
              >
                <div>
                  <span className="text-[14px] font-semibold">{d.client.name}</span>
                  <span className="ml-2 text-[13px] text-muted">
                    {d.car ? `${d.car.make} ${d.car.model}` : DEAL_TYPE[d.type]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {d.amount ? <span className="mono text-[13px]">{fmtMoney(d.amount)}</span> : null}
                  <span className="chip chip-blue">{STAGE_LABEL[d.stage]}</span>
                </div>
              </Link>
            ))}
            {activeDeals.length === 0 && (
              <div className="py-3">
                <p className="text-sm text-muted">
                  {hasDeals
                    ? "Активных сделок нет — все закрыты или потеряны."
                    : "Сделок пока нет."}
                </p>
                <Link
                  href="/deals"
                  className="mt-1.5 inline-block text-[13px] font-semibold text-accent hover:underline"
                >
                  Создать сделку →
                </Link>
              </div>
            )}
          </div>
        </div>
        )}

        <div className={`flex flex-col gap-4 ${flags.seeDeals ? "col-span-2" : "col-span-2"}`}>
          <div className="panel animate-in delay-4 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Задачи</h2>
              <Link href="/tasks" className="text-[13px] font-semibold text-accent hover:underline">
                Все →
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5">
                  <div
                    className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${
                      isOverdue(t.dueDate) ? "bg-red" : "bg-accent"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{t.title}</div>
                    <div className="text-[12px] text-muted">
                      <span className={isOverdue(t.dueDate) ? "font-semibold text-red" : ""}>
                        {dueLabel(t.dueDate)}
                      </span>
                      {t.client ? ` · ${t.client.name}` : ""}
                      {t.car ? ` · ${t.car.make} ${t.car.model}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && (
                <div>
                  <p className="text-sm text-muted">
                    {hasTasks ? "Все задачи закрыты 🎉" : "Задач пока нет."}
                  </p>
                  <Link
                    href="/tasks"
                    className="mt-1.5 inline-block text-[13px] font-semibold text-accent hover:underline"
                  >
                    {hasTasks ? "К задачам →" : "Завести напоминание →"}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="panel animate-in delay-5 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Склад</h2>
              {cars.length > 0 && (
                <Link href="/cars" className="text-[13px] font-semibold text-accent hover:underline">
                  Все →
                </Link>
              )}
            </div>
            {cars.length === 0 ? (
              <div>
                <p className="text-sm text-muted">На складе пока нет автомобилей.</p>
                <Link
                  href="/cars/new"
                  className="mt-1.5 inline-block text-[13px] font-semibold text-accent hover:underline"
                >
                  Добавить первое авто →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {CAR_STATUS_ORDER.map((st) => {
                  const n = cars.filter((c) => c.status === st).length;
                  return (
                    <Link
                      key={st}
                      href={`/cars?status=${st}`}
                      className="flex items-center justify-between rounded-md px-1 py-0.5 transition-colors hover:bg-white/[0.03]"
                    >
                      <span className={`chip ${CAR_STATUS[st].cls}`}>{CAR_STATUS[st].label}</span>
                      <span className={`mono text-[15px] font-bold ${n === 0 ? "text-muted/40" : ""}`}>
                        {n}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
