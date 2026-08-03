import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import {
  fmtDate, internalCode, isWarrantyOpen,
  WARRANTY_STATUS, WARRANTY_STATUS_ORDER, WARRANTY_OPEN_STATUSES,
} from "@/lib/format";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const PAGE_SIZE = 25;

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const canManage = can(user, "task.manage");
  const sp = await searchParams;

  const where: Prisma.WarrantyCaseWhereInput = {};
  if (sp.status) where.status = sp.status;
  else if (sp.open === "1") where.status = { in: WARRANTY_OPEN_STATUSES };
  if (sp.responsibleUserId) where.responsibleUserId = sp.responsibleUserId;
  if (sp.carId) where.carId = sp.carId;

  const [cases, openCount, users, soldCars] = await Promise.all([
    prisma.warrantyCase.findMany({
      where,
      include: {
        car: { select: { make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } },
        client: { select: { name: true } },
        responsible: { select: { name: true } },
        _count: { select: { tasks: true, expenses: true } },
      },
      orderBy: { openedAt: "desc" },
    }),
    prisma.warrantyCase.count({ where: { status: { in: WARRANTY_OPEN_STATUSES } } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.car.findMany({ where: { status: "SOLD" }, orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);
  const pageCases = cases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const link = (over: SP) => {
    const p = new URLSearchParams();
    const merged = { status: sp.status, open: sp.open, responsibleUserId: sp.responsibleUserId, carId: sp.carId, ...over } as SP;
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/warranty${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <header className="animate-in mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Гарантийные случаи</h1>
          <p className="mt-1 text-sm text-muted">{cases.length} показано · <span className={openCount > 0 ? "text-amber" : ""}>{openCount} в работе</span></p>
        </div>
        {canManage && <Link href="/warranty/new" className="btn btn-primary">+ Случай</Link>}
      </header>

      {/* Быстрые срезы + фильтры */}
      <div className="animate-in mb-3 flex flex-wrap gap-1.5">
        <Link href="/warranty" className={`chip ${!sp.status && !sp.open ? "chip-blue" : "chip-muted"}`}>Все</Link>
        <Link href={link({ open: "1", status: "" })} className={`chip ${sp.open === "1" ? "chip-blue" : "chip-muted"}`}>В работе · {openCount}</Link>
        {WARRANTY_STATUS_ORDER.map((k) => (
          <Link key={k} href={link({ status: k, open: "" })} className={`chip ${sp.status === k ? "chip-blue" : "chip-muted"}`}>{WARRANTY_STATUS[k].label}</Link>
        ))}
      </div>

      <form className="panel animate-in mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        {sp.open && <input type="hidden" name="open" value={sp.open} />}
        <div className="w-full sm:w-auto"><label className="label">Ответственный</label>
          <select name="responsibleUserId" defaultValue={sp.responsibleUserId ?? ""} className="field w-full sm:w-[160px]">
            <option value="">все</option>{users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </select></div>
        <div className="w-full sm:w-auto"><label className="label">Авто</label>
          <select name="carId" defaultValue={sp.carId ?? ""} className="field w-full sm:w-[210px]">
            <option value="">все</option>{soldCars.map((c) => (<option key={c.id} value={c.id}>{internalCode(c)} {c.make} {c.model}</option>))}
          </select></div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Фильтр</button>
          <Link href="/warranty" className="btn btn-ghost">Сброс</Link>
        </div>
      </form>

      <div className="panel animate-in overflow-x-auto p-0">
        {cases.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[15px] font-semibold">Случаев нет</p>
            <p className="mx-auto mt-1.5 max-w-[380px] text-sm text-muted">По выбранным условиям гарантийных случаев не найдено.</p>
          </div>
        ) : (
          <table className="table w-full min-w-[980px]">
            <thead><tr>
              <th className="text-left">Открыт</th><th className="text-left">Автомобиль</th><th className="text-left">Жалоба</th>
              <th className="text-left">Клиент</th><th className="text-left">Ответственный</th><th className="text-left">Задачи/Расходы</th><th className="text-left">Статус</th>
            </tr></thead>
            <tbody>
              {pageCases.map((wc) => {
                const st = WARRANTY_STATUS[wc.status];
                return (
                  <tr key={wc.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(wc.openedAt)}</td>
                    <td className="whitespace-nowrap"><Link href={`/warranty/${wc.id}`} className="font-medium hover:text-accent">{wc.car.make} {wc.car.model}</Link><div className="mono text-[12px] text-muted">MH-{String(wc.car.mhNumber).padStart(4, "0")}</div></td>
                    <td className="max-w-[280px] truncate text-[13px]" title={wc.complaintDescription}>{wc.complaintDescription}</td>
                    <td className="text-[13px]">{wc.client?.name ?? "—"}</td>
                    <td className="text-[13px]">{wc.responsible?.name ?? "—"}</td>
                    <td className="mono text-[12px] text-muted">{wc._count.tasks} / {wc._count.expenses}</td>
                    <td><span className={`chip ${st?.cls ?? "chip-muted"}`}>{st?.label ?? wc.status}{isWarrantyOpen(wc.status) && wc.deadline && new Date(wc.deadline) < new Date() ? " · просрочен" : ""}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} basePath="/warranty" params={{ status: sp.status, open: sp.open, responsibleUserId: sp.responsibleUserId, carId: sp.carId }} />
    </div>
  );
}
