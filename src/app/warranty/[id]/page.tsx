import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { setWarrantyStatus } from "@/lib/actions";
import {
  fmtDate, fmtMoney, isWarrantyOpen,
  WARRANTY_STATUS, WARRANTY_STATUS_ORDER, TASK_STATUS, EXPENSE_CATEGORY,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WarrantyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const canManage = can(user, "task.manage");
  const { id } = await params;

  const wc = await prisma.warrantyCase.findUnique({
    where: { id },
    include: {
      car: { select: { id: true, make: true, model: true, year: true, vin: true, mhNumber: true, parkingRow: true, parkingSpot: true } },
      client: { select: { id: true, name: true, phone: true } },
      responsible: { select: { name: true } },
      tasks: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true } },
      expenses: { where: { cancelled: false }, orderBy: { date: "desc" }, select: { id: true, title: true, category: true, amountGross: true } },
    },
  });
  if (!wc) notFound();
  const st = WARRANTY_STATUS[wc.status];
  const field = (label: string, value: React.ReactNode) => (
    <div><div className="label">{label}</div><div className="mt-0.5 text-[14px]">{value || "—"}</div></div>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-in flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/warranty" className="text-[13px] text-muted hover:text-ink">← Гарантийные случаи</Link>
          <h1 className="mt-1 font-[family-name:var(--font-unbounded)] text-[24px] font-bold">
            {wc.car.make} {wc.car.model} <span className="mono text-[16px] text-muted">MH-{String(wc.car.mhNumber).padStart(4, "0")}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Открыт {fmtDate(wc.openedAt)} · <span className={`chip ${st?.cls ?? "chip-muted"}`}>{st?.label ?? wc.status}</span></p>
        </div>
        <div className="flex gap-2">
          <Link href={`/cars/${wc.car.id}`} className="btn btn-ghost">Карточка авто</Link>
          {canManage && <Link href={`/warranty/${wc.id}/edit`} className="btn btn-ghost">Редактировать</Link>}
        </div>
      </header>

      {/* Смена статуса */}
      {canManage && (
        <section className="panel animate-in p-5">
          <h2 className="mb-3 text-[15px] font-bold">Статус</h2>
          <div className="flex flex-wrap gap-2">
            {WARRANTY_STATUS_ORDER.map((k) => (
              <form key={k} action={setWarrantyStatus.bind(null, wc.id, k)}>
                <button type="submit" disabled={k === wc.status} className={`chip ${k === wc.status ? WARRANTY_STATUS[k].cls : "chip-muted"} ${k === wc.status ? "" : "cursor-pointer hover:text-ink"}`}>
                  {WARRANTY_STATUS[k].label}
                </button>
              </form>
            ))}
          </div>
          {wc.resolvedAt && <p className="mt-3 text-[13px] text-muted">Завершён {fmtDate(wc.resolvedAt)}</p>}
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="panel animate-in p-5">
          <h2 className="mb-4 text-[15px] font-bold">Жалоба и обработка</h2>
          <div className="flex flex-col gap-4">
            {field("Описание жалобы", wc.complaintDescription)}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field("Дата обращения", wc.clientReportedAt ? fmtDate(wc.clientReportedAt) : "—")}
              {field("Срок", wc.deadline ? <span className={isWarrantyOpen(wc.status) && new Date(wc.deadline) < new Date() ? "text-red" : ""}>{fmtDate(wc.deadline)}</span> : "—")}
              {field("Ответственный", wc.responsible?.name)}
              {field("Мастерская / поставщик", wc.workshop)}
            </div>
            {field("Диагноз", wc.diagnosis)}
            {field("Решение", wc.decision)}
            {field("Итоговая стоимость", wc.finalCost != null ? fmtMoney(wc.finalCost) : "—")}
            {field("Заметки по коммуникации", wc.communicationNotes)}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className="panel animate-in p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Клиент</h2>
            </div>
            {wc.client ? (
              <div className="text-[14px]"><Link href={`/clients/${wc.client.id}`} className="font-medium hover:text-accent">{wc.client.name}</Link>{wc.client.phone && <div className="mono text-[13px] text-muted">{wc.client.phone}</div>}</div>
            ) : <p className="text-sm text-muted">Клиент не указан</p>}
          </section>

          <section className="panel animate-in p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Связанные задачи</h2>
              {canManage && <Link href={`/tasks/new?warrantyCaseId=${wc.id}&carId=${wc.car.id}`} className="text-[13px] text-accent hover:underline">+ задача</Link>}
            </div>
            {wc.tasks.length === 0 ? <p className="text-sm text-muted">Задач нет</p> : (
              <ul className="flex flex-col gap-1.5">
                {wc.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <Link href={`/tasks/${t.id}/edit`} className="truncate hover:text-accent">{t.title}</Link>
                    <span className={`chip ${TASK_STATUS[t.status]?.cls ?? "chip-muted"} shrink-0`}>{TASK_STATUS[t.status]?.label ?? t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel animate-in p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Связанные расходы</h2>
              {canManage && <Link href={`/expenses/new?warrantyCaseId=${wc.id}&carId=${wc.car.id}`} className="text-[13px] text-accent hover:underline">+ расход</Link>}
            </div>
            {wc.expenses.length === 0 ? <p className="text-sm text-muted">Расходов нет</p> : (
              <ul className="flex flex-col gap-1.5">
                {wc.expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <Link href={`/expenses/${e.id}/edit`} className="truncate hover:text-accent">{e.title} <span className="text-muted">· {EXPENSE_CATEGORY[e.category] ?? e.category}</span></Link>
                    <span className="mono shrink-0">{fmtMoney(e.amountGross)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
