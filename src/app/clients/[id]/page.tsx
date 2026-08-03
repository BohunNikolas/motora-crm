import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteClient } from "@/lib/actions";
import {
  fmtMoney, fmtDate, fmtDateTime, dueLabel, isOverdue,
  CLIENT_TYPE, clientSourceLabel, TASK_OPEN_STATUSES,
  APPOINTMENT_TYPE, APPOINTMENT_STATUS, WARRANTY_STATUS,
} from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { viewerFlags } from "@/lib/authz";

export const dynamic = "force-dynamic";

const TYPE_CLS: Record<string, string> = { BUYER: "chip-green", SELLER: "chip-blue", BOTH: "chip-amber" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const flags = viewerFlags(user);

  // §17: зависимости от Deal больше нет — связи строятся на Sale / Appointment / WarrantyCase.
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      sales: { where: { stage: { not: "CANCELLED" } }, include: { car: { select: { id: true, make: true, model: true, mhNumber: true } } }, orderBy: { createdAt: "desc" } },
      appointments: { include: { car: { select: { make: true, model: true } } }, orderBy: { startAt: "desc" } },
      warrantyCases: { include: { car: { select: { make: true, model: true } } }, orderBy: { openedAt: "desc" } },
      tasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
    },
  });
  if (!client) notFound();

  const purchases = client.sales.filter((s) => s.stage === "COMPLETED");
  const reservations = client.sales.filter((s) => s.stage === "RESERVED");
  const openTasks = client.tasks.filter((t) => TASK_OPEN_STATUSES.includes(t.status));
  const openWarranty = client.warrantyCases.filter((w) => !["RESOLVED", "REJECTED", "CLOSED"].includes(w.status));

  const summary = [
    purchases.length && `${purchases.length} покупок`,
    reservations.length && `${reservations.length} броней`,
    client.appointments.length && `${client.appointments.length} терминов`,
    openWarranty.length && `${openWarranty.length} гар. случаев`,
    openTasks.length && `${openTasks.length} задач`,
  ].filter(Boolean).join(" · ") || "связей пока нет";

  const contacts: [string, React.ReactNode][] = [
    ["Телефон", <a key="p" href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="mono hover:text-accent">{client.phone}</a>],
    ["Email", client.email ? <a key="e" href={`mailto:${client.email}`} className="hover:text-accent">{client.email}</a> : "—"],
    ["Источник", clientSourceLabel(client.source)],
    ["В базе с", fmtDate(client.createdAt)],
  ];

  const carLabel = (car: { make: string; model: string; mhNumber: number } | null) =>
    car ? `${car.make} ${car.model} · MH-${String(car.mhNumber).padStart(4, "0")}` : "—";

  return (
    <div>
      <header className="animate-in mb-6">
        <Link href="/clients" className="text-[13px] font-semibold text-muted hover:text-ink">← Клиенты</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">{client.name}</h1>
            <div className="mt-2 flex items-center gap-3">
              <span className={`chip ${TYPE_CLS[client.type] ?? "chip-muted"}`}>{CLIENT_TYPE[client.type] ?? client.type}</span>
              <span className="text-sm text-muted">{summary}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {flags.canManageClients && <Link href={`/clients/${client.id}/edit`} className="btn btn-ghost">Редактировать</Link>}
            {flags.canDelete && (
              <form action={deleteClient.bind(null, client.id)}>
                <ConfirmButton message={`Удалить клиента ${client.name}? Продажи, термины и гарантийные случаи сохранятся, но потеряют привязку к клиенту. Действие необратимо.`}>Удалить</ConfirmButton>
              </form>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="panel animate-in delay-1 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Контакты</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 xl:grid-cols-4">
              {contacts.map(([k, v]) => (<div key={k}><dt className="label mb-1">{k}</dt><dd className="text-[14px]">{v}</dd></div>))}
            </dl>
            {client.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="label mb-1.5">Заметки</div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{client.notes}</p>
              </div>
            )}
          </section>

          <section className="panel animate-in delay-2 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Автомобили</h2>
            {client.sales.length === 0 ? (
              <p className="text-[13px] text-muted">Покупок и броней пока нет.</p>
            ) : (
              <div className="flex flex-col">
                {reservations.map((s) => (
                  <Link key={s.id} href={`/cars/${s.car.id}`} className="flex items-center justify-between border-b border-line py-2.5 last:border-none hover:bg-white/[0.02]">
                    <div>
                      <div className="text-[14px] font-semibold">{carLabel(s.car)}</div>
                      <div className="text-[12px] text-muted">Бронь · {s.reservedAt ? fmtDate(s.reservedAt) : "—"}{s.anzahlung != null ? ` · задаток ${fmtMoney(s.anzahlung)}` : ""}</div>
                    </div>
                    <span className="chip chip-amber">Бронь</span>
                  </Link>
                ))}
                {purchases.map((s) => (
                  <Link key={s.id} href={`/cars/${s.car.id}`} className="flex items-center justify-between border-b border-line py-2.5 last:border-none hover:bg-white/[0.02]">
                    <div>
                      <div className="text-[14px] font-semibold">{carLabel(s.car)}</div>
                      <div className="text-[12px] text-muted">Покупка · {s.saleDate ? fmtDate(s.saleDate) : "—"}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.actualSalePriceGross != null && <span className="mono text-[13px]">{fmtMoney(s.actualSalePriceGross)}</span>}
                      <span className="chip chip-green">Продано</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {client.warrantyCases.length > 0 && (
            <section className="panel animate-in delay-3 p-5">
              <h2 className="mb-4 text-[15px] font-bold">Гарантийные случаи</h2>
              <div className="flex flex-col">
                {client.warrantyCases.map((w) => (
                  <Link key={w.id} href={`/warranty/${w.id}`} className="flex items-center justify-between border-b border-line py-2.5 last:border-none hover:bg-white/[0.02]">
                    <div>
                      <div className="text-[14px] font-semibold">{w.car.make} {w.car.model}</div>
                      <div className="max-w-[360px] truncate text-[12px] text-muted">{w.complaintDescription} · {fmtDate(w.openedAt)}</div>
                    </div>
                    <span className={`chip ${WARRANTY_STATUS[w.status]?.cls ?? "chip-muted"} shrink-0`}>{WARRANTY_STATUS[w.status]?.label ?? w.status}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel animate-in delay-2 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Термины</h2>
              <Link href="/calendar" className="text-[13px] font-semibold text-accent hover:underline">Календарь →</Link>
            </div>
            {client.appointments.length === 0 ? (
              <p className="text-[13px] text-muted">Терминов по клиенту нет.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {client.appointments.slice(0, 6).map((a) => (
                  <Link key={a.id} href={`/calendar/${a.id}/edit`} className="block">
                    <div className="text-[13px] font-medium">{fmtDateTime(a.startAt)}</div>
                    <div className="text-[12px] text-muted">{APPOINTMENT_TYPE[a.type] ?? a.type}{a.car ? ` · ${a.car.make} ${a.car.model}` : ""} · {APPOINTMENT_STATUS[a.status]?.label ?? a.status}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel animate-in delay-3 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Задачи</h2>
              <Link href="/tasks" className="text-[13px] font-semibold text-accent hover:underline">Все →</Link>
            </div>
            {client.tasks.length === 0 ? (
              <p className="text-[13px] text-muted">Задач по клиенту нет.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {client.tasks.map((t) => {
                  const isOpen = TASK_OPEN_STATUSES.includes(t.status);
                  return (
                    <div key={t.id} className="flex items-start gap-2.5">
                      <div className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${!isOpen ? "bg-[var(--muted)]" : isOverdue(t.dueDate) ? "bg-red" : "bg-accent"}`} />
                      <div className="min-w-0">
                        <div className={`text-[14px] ${!isOpen ? "text-muted line-through" : "font-medium"}`}>{t.title}</div>
                        <div className={`text-[12px] ${isOpen && isOverdue(t.dueDate) ? "font-semibold text-red" : "text-muted"}`}>{dueLabel(t.dueDate)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
