import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtMoney, carCost, carMargin, CAR_STATUS, CAR_STATUS_ORDER } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CarsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;

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

  const totalCost = cars.reduce((s, c) => s + carCost(c), 0);
  const totalMargin = cars.reduce((s, c) => s + carMargin(c), 0);

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
            {cars.length > 0 && ` · себестоимость ${fmtMoney(totalCost)} · маржа ${fmtMoney(totalMargin)}`}
          </p>
        </div>
        <Link href="/cars/new" className="btn btn-primary">+ Добавить авто</Link>
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
            <table className="table">
              <thead>
                <tr>
                  <th>Автомобиль</th>
                  <th className="text-right">Пробег</th>
                  <th className="text-right">Закупка</th>
                  <th className="text-right">Расходы</th>
                  <th className="text-right">Себестоимость</th>
                  <th className="text-right">Цена</th>
                  <th className="text-right">Маржа</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {cars.map((c) => {
                  const expenses = c.expenses.reduce((s, e) => s + e.amount, 0);
                  const margin = carMargin(c);
                  return (
                    <tr key={c.id} className="cursor-pointer">
                      <td>
                        <Link href={`/cars/${c.id}`} className="block">
                          <div className="font-semibold">
                            {c.make} {c.model}
                          </div>
                          <div className="text-[12px] text-muted">
                            {c.year} · {[c.transmission, c.fuel, c.color].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </Link>
                      </td>
                      <td className="mono text-right text-muted">{c.mileage.toLocaleString("ru-RU")}</td>
                      <td className="mono text-right">{fmtMoney(c.purchasePrice)}</td>
                      <td className="mono text-right text-muted">
                        {expenses ? fmtMoney(expenses) : "—"}
                      </td>
                      <td className="mono text-right">{fmtMoney(carCost(c))}</td>
                      <td className="mono text-right">{fmtMoney(c.listPrice)}</td>
                      <td className={`mono text-right font-bold ${margin >= 0 ? "text-green" : "text-red"}`}>
                        {fmtMoney(margin)}
                      </td>
                      <td>
                        <span className={`chip ${CAR_STATUS[c.status]?.cls ?? "chip-muted"}`}>
                          {CAR_STATUS[c.status]?.label ?? c.status}
                        </span>
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
