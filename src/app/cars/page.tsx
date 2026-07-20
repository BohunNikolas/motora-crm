import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Cell } from "@/components/cell-link";
import { requireUser } from "@/lib/auth";
import { viewerFlags } from "@/lib/authz";
import { fmtMoney, sumMoney, carCost, carMargin, CAR_STATUS, CAR_STATUS_ORDER } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CarsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const user = await requireUser();
  const flags = viewerFlags(user);

  const all = await prisma.car.findMany({
    where: status && CAR_STATUS[status] ? { status } : undefined,
    include: { expenses: true },
    orderBy: { createdAt: "desc" },
  });

  // Поиск в JS, а не в БД: SQLite не умеет регистронезависимый LIKE для кириллицы.
  // После переезда на Postgres (этап 8) можно заменить на contains + mode: "insensitive".
  const needle = q?.trim().toLowerCase();
  const cars = needle
    ? all.filter((c) =>
        [c.make, c.model, c.vin ?? "", String(c.year)].some((f) => f.toLowerCase().includes(needle))
      )
    : all;

  const counts = await prisma.car.groupBy({ by: ["status"], _count: true });
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  // Всего авто в базе — считаем по groupBy, а не по `all`: `all` уже отфильтрован по статусу.
  const total = counts.reduce((s, c) => s + c._count, 0);
  const filtered = Boolean(status) || Boolean(needle);

  const totalCost = sumMoney(cars.map((c) => carCost(c)));
  const totalMargin = sumMoney(cars.map((c) => carMargin(c)));

  const linkFor = (s?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (s) p.set("status", s);
    const qs = p.toString();
    return qs ? `/cars?${qs}` : "/cars";
  };

  return (
    <div>
      <header className="animate-in mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Автомобили</h1>
          <p className="mt-1 text-sm text-muted">
            {filtered ? `найдено ${cars.length} из ${total}` : `${total} в базе`}
            {flags.seeMargin && cars.length > 0 &&
              ` · себестоимость ${fmtMoney(totalCost)} · маржа ${fmtMoney(totalMargin)}`}
          </p>
        </div>
        {flags.canEditCar && (
          <Link href="/cars/new" className="btn btn-primary">+ Добавить авто</Link>
        )}
      </header>

      <div className="animate-in delay-1 mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Link href={linkFor()} className={`chip ${!status ? "chip-amber" : "chip-muted"}`}>
            Все · {total}
          </Link>
          {CAR_STATUS_ORDER.map((s) => (
            <Link
              key={s}
              href={linkFor(s)}
              className={`chip ${status === s ? CAR_STATUS[s].cls : "chip-muted"}`}
            >
              {CAR_STATUS[s].label} · {countOf(s)}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q ?? ""}
            className="field w-[240px]"
            placeholder="Марка, модель, VIN, год…"
          />
          <button type="submit" className="btn btn-ghost">Найти</button>
          {q && (
            <Link href={linkFor(status)} className="btn btn-ghost" title="Сбросить поиск">
              ✕
            </Link>
          )}
        </form>
      </div>

      <div className="panel animate-in delay-2 overflow-hidden">
        {cars.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[15px] font-semibold">
              {total === 0 ? "На складе пока нет автомобилей" : "Ничего не найдено"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[380px] text-sm text-muted">
              {total === 0
                ? "Добавьте первое авто — себестоимость и маржа посчитаются автоматически."
                : "Под текущий фильтр и запрос ничего не подошло."}
            </p>
            {total === 0 ? (
              <Link href="/cars/new" className="btn btn-primary mt-5">+ Добавить авто</Link>
            ) : (
              <Link href="/cars" className="btn btn-ghost mt-5">Сбросить фильтры</Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* min-w: без него width:100% сплющивает колонки на узком окне —
                названия переносятся, строки раздуваются. Лучше честный скролл. */}
            <table className={`table ${flags.seeAcquisition ? "min-w-[900px]" : "min-w-[640px]"}`}>
              {/* Redaction: закупка/расходы/себестоимость/маржа рендерятся ТОЛЬКО
                  для ролей с see.acquisition/see.margin — в HTML других ролей их нет.
                  Цена продажи — только с see.salePrice (TECHNICAL не видит и её). */}
              <thead>
                <tr>
                  <th>Автомобиль</th>
                  <th className="text-right">Пробег</th>
                  {flags.seeAcquisition && <th className="text-right">Закупка</th>}
                  {flags.seeAcquisition && <th className="text-right">Расходы</th>}
                  {flags.seeAcquisition && <th className="text-right">Себестоимость</th>}
                  {flags.seeSalePrice && <th className="text-right">Цена</th>}
                  {flags.seeMargin && <th className="text-right">Маржа</th>}
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cars.map((c) => {
                  const expenses = sumMoney(c.expenses.map((e) => e.amountGross));
                  const margin = carMargin(c);
                  const href = `/cars/${c.id}`;
                  return (
                    <tr key={c.id}>
                      <Cell href={href}>
                        <div className="font-semibold">
                          {c.make} {c.model}
                        </div>
                        <div className="text-[12px] text-muted">
                          {c.year} · {[c.transmission, c.fuel, c.color].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </Cell>
                      <Cell href={href} className="mono text-right text-muted">
                        {c.mileage.toLocaleString("ru-RU")}
                      </Cell>
                      {flags.seeAcquisition && (
                        <Cell href={href} className="mono text-right">
                          {fmtMoney(c.purchasePrice)}
                        </Cell>
                      )}
                      {flags.seeAcquisition && (
                        <Cell href={href} className="mono text-right text-muted">
                          {expenses.gt(0) ? fmtMoney(expenses) : "—"}
                        </Cell>
                      )}
                      {flags.seeAcquisition && (
                        <Cell href={href} className="mono text-right">
                          {fmtMoney(carCost(c))}
                        </Cell>
                      )}
                      {flags.seeSalePrice && (
                        <Cell href={href} className="mono text-right">
                          {fmtMoney(c.listPrice)}
                        </Cell>
                      )}
                      {flags.seeMargin && (
                        <Cell
                          href={href}
                          className={`mono text-right font-bold ${margin.gte(0) ? "text-green" : "text-red"}`}
                        >
                          {fmtMoney(margin)}
                        </Cell>
                      )}
                      <Cell href={href}>
                        <span className={`chip ${CAR_STATUS[c.status]?.cls ?? "chip-muted"}`}>
                          {CAR_STATUS[c.status]?.label ?? c.status}
                        </span>
                      </Cell>
                      <td className="w-px whitespace-nowrap">
                        {flags.canEditCar && (
                          <Link
                            href={`${href}/edit`}
                            title={`Редактировать ${c.make} ${c.model}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
