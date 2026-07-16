import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ClientFields } from "@/components/client-form";
import { createClient } from "@/lib/actions";
import { fmtDate, CLIENT_TYPE } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_CLS: Record<string, string> = {
  BUYER: "chip-green",
  SELLER: "chip-blue",
  BOTH: "chip-amber",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;

  const all = await prisma.client.findMany({
    where: type && CLIENT_TYPE[type] ? { type } : undefined,
    include: { _count: { select: { deals: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Поиск в JS: SQLite не умеет регистронезависимый LIKE для кириллицы (см. DEVPLAN).
  const needle = q?.trim().toLowerCase();
  const clients = needle
    ? all.filter((c) =>
        [c.name, c.phone, c.email ?? ""].some((f) => f.toLowerCase().includes(needle))
      )
    : all;

  const counts = await prisma.client.groupBy({ by: ["type"], _count: true });
  const countOf = (t: string) => counts.find((c) => c.type === t)?._count ?? 0;
  const total = counts.reduce((s, c) => s + c._count, 0);
  const filtered = Boolean(type) || Boolean(needle);

  const linkFor = (t?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (t) p.set("type", t);
    const qs = p.toString();
    return qs ? `/clients?${qs}` : "/clients";
  };

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Клиенты</h1>
        <p className="mt-1 text-sm text-muted">
          {filtered ? `найдено ${clients.length} из ${total}` : `${total} в базе`}
        </p>
      </header>

      <details className="panel animate-in delay-1 mb-4 overflow-hidden [&[open]>summary]:border-b [&[open]>summary]:border-line">
        <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-bold transition-colors hover:text-accent">
          + Добавить клиента
        </summary>
        <form action={createClient} className="p-5">
          <ClientFields />
          <button type="submit" className="btn btn-primary mt-4">Добавить</button>
        </form>
      </details>

      <div className="animate-in delay-2 mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <Link href={linkFor()} className={`chip ${!type ? "chip-amber" : "chip-muted"}`}>
            Все · {total}
          </Link>
          {Object.entries(CLIENT_TYPE).map(([k, v]) => (
            <Link key={k} href={linkFor(k)} className={`chip ${type === k ? TYPE_CLS[k] : "chip-muted"}`}>
              {v} · {countOf(k)}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <input name="q" defaultValue={q ?? ""} className="field w-[240px]" placeholder="Имя, телефон, email…" />
          <button type="submit" className="btn btn-ghost">Найти</button>
          {q && (
            <Link href={linkFor(type)} className="btn btn-ghost" title="Сбросить поиск">✕</Link>
          )}
        </form>
      </div>

      <div className="panel animate-in delay-3 overflow-hidden">
        {clients.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[15px] font-semibold">
              {total === 0 ? "Клиентов пока нет" : "Ничего не найдено"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[400px] text-sm text-muted">
              {total === 0
                ? "Добавьте первого клиента — источник обращения поможет понять, какая реклама реально приводит покупателей."
                : "Под текущий фильтр и запрос ничего не подошло."}
            </p>
            {total > 0 && (
              <Link href="/clients" className="btn btn-ghost mt-5">Сбросить фильтры</Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Тип</th>
                  <th>Источник</th>
                  <th className="text-right">Сделок</th>
                  <th className="text-right">Добавлен</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.id}`} className="block">
                        <div className="font-semibold">{c.name}</div>
                        {c.notes && (
                          <div className="max-w-[320px] truncate text-[12px] text-muted">{c.notes}</div>
                        )}
                      </Link>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="hover:text-accent">
                        {c.phone}
                      </a>
                    </td>
                    <td>
                      <span className={`chip ${TYPE_CLS[c.type] ?? "chip-muted"}`}>
                        {CLIENT_TYPE[c.type] ?? c.type}
                      </span>
                    </td>
                    <td className="text-[13px] text-muted">{c.source ?? "—"}</td>
                    <td className="mono text-right">{c._count.deals || "—"}</td>
                    <td className="text-right text-[13px] text-muted">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
