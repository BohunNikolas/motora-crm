import Link from "next/link";

// Пагинация списков (§23). Server-friendly: страница в URL (?page=N), фильтры
// сохраняются. Рендерится только когда страниц больше одной.
export function Pagination({
  page,
  totalPages,
  basePath,
  params = {},
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // Компактный набор номеров: первая, последняя, соседи текущей, с многоточиями.
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }

  return (
    <nav className="mt-4 flex items-center justify-center gap-1.5" aria-label="Страницы">
      {page > 1 && <Link href={href(page - 1)} className="btn btn-ghost px-3">‹</Link>}
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1.5 text-muted">…</span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            className={`min-w-9 rounded-lg px-3 py-1.5 text-center text-[13px] font-medium transition-colors ${
              n === page ? "bg-accent text-bg" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {n}
          </Link>
        )
      )}
      {page < totalPages && <Link href={href(page + 1)} className="btn btn-ghost px-3">›</Link>}
    </nav>
  );
}
