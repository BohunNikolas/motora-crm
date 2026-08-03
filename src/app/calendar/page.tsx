import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import {
  fmtTime,
  fmtDate,
  viennaDayKey,
  internalCode,
  APPOINTMENT_TYPE,
  APPOINTMENT_TYPE_ORDER,
  APPOINTMENT_STATUS,
  APPOINTMENT_STATUS_ORDER,
  WEEKDAYS_SHORT,
  MONTHS_RU,
} from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
type ApptFull = Prisma.AppointmentGetPayload<{
  include: { car: { select: { make: true; model: true; mhNumber: true } }; employee: { select: { name: true } } };
}>;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s?: string) => {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate());
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
// Понедельник недели, содержащей d (getDay: 0=вс).
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

const VIEWS: [string, string][] = [["month", "Месяц"], ["week", "Неделя"], ["day", "День"], ["list", "Список"]];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const canManage = can(user, "task.manage");
  const sp = await searchParams;
  const view = ["month", "week", "day", "list"].includes(sp.view ?? "") ? sp.view! : "week";
  const ref = parseYmd(sp.date);

  // Диапазон выборки по представлению.
  let rangeStart: Date, rangeEnd: Date;
  if (view === "day") { rangeStart = ref; rangeEnd = addDays(ref, 1); }
  else if (view === "week") { rangeStart = mondayOf(ref); rangeEnd = addDays(rangeStart, 7); }
  else if (view === "month") {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    rangeStart = mondayOf(first);
    rangeEnd = addDays(rangeStart, 42); // 6 недель сетки
  } else { rangeStart = ref; rangeEnd = addDays(ref, 60); } // список: 60 дней вперёд

  const where: Prisma.AppointmentWhereInput = { startAt: { gte: rangeStart, lt: rangeEnd } };
  if (sp.employeeId) where.employeeId = sp.employeeId;
  if (sp.carId) where.carId = sp.carId;
  if (sp.type) where.type = sp.type;
  if (sp.status) where.status = sp.status;

  const [appts, users, cars] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: { car: { select: { make: true, model: true, mhNumber: true } }, employee: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.car.findMany({ where: { status: { not: "SOLD" } }, orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
  ]);

  // Группировка терминов по календарному дню Вены.
  const byDay = new Map<string, ApptFull[]>();
  for (const a of appts) {
    const k = viennaDayKey(a.startAt);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(a);
  }

  // Ссылки с сохранением фильтров.
  const filters = { employeeId: sp.employeeId, carId: sp.carId, type: sp.type, status: sp.status };
  const link = (over: SP) => {
    const p = new URLSearchParams();
    const merged = { view, date: sp.date, ...filters, ...over } as SP;
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/calendar?${p.toString()}`;
  };
  const step = view === "month" ? 30 : view === "week" ? 7 : 1;
  const prevDate = view === "month" ? ymd(new Date(ref.getFullYear(), ref.getMonth() - 1, 1)) : ymd(addDays(ref, -step));
  const nextDate = view === "month" ? ymd(new Date(ref.getFullYear(), ref.getMonth() + 1, 1)) : ymd(addDays(ref, step));

  const periodLabel =
    view === "month" ? `${MONTHS_RU[ref.getMonth()]} ${ref.getFullYear()}`
    : view === "day" ? fmtDate(ref)
    : view === "week" ? `${fmtDate(mondayOf(ref))} — ${fmtDate(addDays(mondayOf(ref), 6))}`
    : `с ${fmtDate(ref)}`;

  const todayKey = viennaDayKey(new Date());
  const carLabel = (c: { make: string; model: string; mhNumber: number } | null) =>
    c ? `${c.make} ${c.model} · MH-${String(c.mhNumber).padStart(4, "0")}` : null;

  // Компактный элемент термина (для сеток).
  const Chip = ({ a }: { a: ApptFull }) => (
    <Link
      href={`/calendar/${a.id}/edit`}
      className={`block truncate rounded-[6px] border-l-2 px-1.5 py-0.5 text-[11px] leading-tight hover:bg-surface-2 ${
        a.status === "ABGESAGT" ? "border-[var(--muted)] text-muted line-through" : "border-[var(--accent)]"
      }`}
      title={`${fmtTime(a.startAt)} ${a.clientName} · ${APPOINTMENT_TYPE[a.type] ?? a.type}`}
    >
      <span className="mono">{fmtTime(a.startAt)}</span> {a.clientName}
    </Link>
  );

  return (
    <div>
      <header className="animate-in mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Календарь</h1>
          <p className="mt-1 text-sm text-muted">{appts.length} терминов · {periodLabel}</p>
        </div>
        {canManage && <Link href="/calendar/new" className="btn btn-primary">+ Термин</Link>}
      </header>

      {/* Переключатель вида + навигация периода */}
      <div className="animate-in mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {VIEWS.map(([v, l]) => (
            <Link key={v} href={link({ view: v })} className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${view === v ? "bg-accent text-bg" : "panel text-muted hover:text-ink"}`}>{l}</Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href={link({ date: prevDate })} className="btn btn-ghost px-3">‹</Link>
          <Link href={link({ date: ymd(new Date()) })} className="btn btn-ghost">Сегодня</Link>
          <Link href={link({ date: nextDate })} className="btn btn-ghost px-3">›</Link>
        </div>
      </div>

      {/* Фильтры */}
      <form className="panel animate-in mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        <input type="hidden" name="view" value={view} />
        {sp.date && <input type="hidden" name="date" value={sp.date} />}
        <div className="w-full sm:w-auto"><label className="label">Сотрудник</label>
          <select name="employeeId" defaultValue={sp.employeeId ?? ""} className="field w-full sm:w-[150px]">
            <option value="">все</option>{users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </select></div>
        <div className="w-full sm:w-auto"><label className="label">Авто</label>
          <select name="carId" defaultValue={sp.carId ?? ""} className="field w-full sm:w-[190px]">
            <option value="">все</option>{cars.map((c) => (<option key={c.id} value={c.id}>{internalCode(c)} {c.make} {c.model}</option>))}
          </select></div>
        <div className="w-full sm:w-auto"><label className="label">Тип</label>
          <select name="type" defaultValue={sp.type ?? ""} className="field w-full sm:w-[140px]">
            <option value="">все</option>{APPOINTMENT_TYPE_ORDER.map((k) => (<option key={k} value={k}>{APPOINTMENT_TYPE[k]}</option>))}
          </select></div>
        <div className="w-full sm:w-auto"><label className="label">Статус</label>
          <select name="status" defaultValue={sp.status ?? ""} className="field w-full sm:w-[150px]">
            <option value="">все</option>{APPOINTMENT_STATUS_ORDER.map((k) => (<option key={k} value={k}>{APPOINTMENT_STATUS[k].label}</option>))}
          </select></div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Фильтр</button>
          <Link href={link({ employeeId: "", carId: "", type: "", status: "" })} className="btn btn-ghost">Сброс</Link>
        </div>
      </form>

      {/* Представление */}
      {view === "month" && (
        <div className="panel animate-in overflow-x-auto p-0">
          <div className="grid min-w-[700px] grid-cols-7 border-b border-line">
            {WEEKDAYS_SHORT.map((w) => (<div key={w} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted">{w}</div>))}
          </div>
          <div className="grid min-w-[700px] grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => {
              const day = addDays(rangeStart, i);
              const k = ymd(day);
              const list = byDay.get(k) ?? [];
              const otherMonth = day.getMonth() !== ref.getMonth();
              return (
                <div key={k} className={`min-h-[92px] border-b border-r border-line p-1.5 ${otherMonth ? "bg-surface-2/40" : ""}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link href={link({ view: "day", date: k })} className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] ${k === todayKey ? "bg-accent font-bold text-bg" : otherMonth ? "text-faint" : "text-muted hover:text-ink"}`}>{day.getDate()}</Link>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {list.slice(0, 3).map((a) => (<Chip key={a.id} a={a} />))}
                    {list.length > 3 && <Link href={link({ view: "day", date: k })} className="px-1 text-[10px] text-muted hover:text-ink">+{list.length - 3} ещё</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="panel animate-in overflow-x-auto p-0">
          <div className="grid min-w-[840px] grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => {
              const day = addDays(rangeStart, i);
              const k = ymd(day);
              const list = byDay.get(k) ?? [];
              return (
                <div key={k} className="min-h-[300px] border-r border-line last:border-none">
                  <Link href={link({ view: "day", date: k })} className={`block border-b border-line px-2 py-2 text-center text-[12px] font-semibold hover:bg-surface-2 ${k === todayKey ? "text-accent" : ""}`}>
                    {WEEKDAYS_SHORT[i]} {day.getDate()}
                  </Link>
                  <div className="flex flex-col gap-1 p-1.5">
                    {list.length === 0 && <span className="px-1 py-2 text-center text-[11px] text-faint">—</span>}
                    {list.map((a) => (
                      <Link key={a.id} href={`/calendar/${a.id}/edit`} className={`rounded-[7px] border-l-2 bg-surface-2 px-2 py-1.5 transition-[filter] hover:brightness-125 ${a.status === "ABGESAGT" ? "border-[var(--muted)] opacity-60" : "border-[var(--accent)]"}`}>
                        <div className="mono text-[11px] font-semibold">{fmtTime(a.startAt)}–{fmtTime(a.endAt)}</div>
                        <div className={`truncate text-[12px] ${a.status === "ABGESAGT" ? "line-through" : ""}`}>{a.clientName}</div>
                        <div className="truncate text-[10.5px] text-muted">{APPOINTMENT_TYPE[a.type] ?? a.type}{a.employee ? ` · ${a.employee.name}` : ""}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(view === "day" || view === "list") && (
        <div className="panel animate-in overflow-x-auto p-0">
          {appts.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[15px] font-semibold">Терминов нет</p>
              <p className="mx-auto mt-1.5 max-w-[380px] text-sm text-muted">На выбранный период записей не найдено.</p>
            </div>
          ) : (
            <table className="table w-full min-w-[860px]">
              <thead><tr>
                <th className="text-left">Дата</th><th className="text-left">Время</th><th className="text-left">Клиент</th>
                <th className="text-left">Тип</th><th className="text-left">Авто</th><th className="text-left">Сотрудник</th><th className="text-left">Статус</th>
              </tr></thead>
              <tbody>
                {appts.map((a) => {
                  const st = APPOINTMENT_STATUS[a.status];
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap text-muted">{fmtDate(a.startAt)}</td>
                      <td className="mono whitespace-nowrap">{fmtTime(a.startAt)}–{fmtTime(a.endAt)}</td>
                      <td><Link href={`/calendar/${a.id}/edit`} className="font-medium hover:text-accent">{a.clientName}</Link>{a.phone && <div className="mono text-[12px] text-muted">{a.phone}</div>}</td>
                      <td className="text-[13px]">{APPOINTMENT_TYPE[a.type] ?? a.type}</td>
                      <td className="text-[13px]">{carLabel(a.car) ?? "—"}</td>
                      <td className="text-[13px]">{a.employee?.name ?? "—"}</td>
                      <td><span className={`chip ${st?.cls ?? "chip-muted"}`}>{st?.label ?? a.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
