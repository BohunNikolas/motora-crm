import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteClient } from "@/lib/actions";
import { fmtMoney, fmtDate, dueLabel, isOverdue, CLIENT_TYPE, STAGE_LABEL, DEAL_TYPE } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_CLS: Record<string, string> = {
  BUYER: "chip-green",
  SELLER: "chip-blue",
  BOTH: "chip-amber",
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      deals: { include: { car: true }, orderBy: { createdAt: "desc" } },
      tasks: { orderBy: [{ done: "asc" }, { dueDate: "asc" }] },
    },
  });

  if (!client) notFound();

  const activeDeals = client.deals.filter((d) => !["DONE", "LOST"].includes(d.stage));
  const openTasks = client.tasks.filter((t) => !t.done);

  const contacts: [string, React.ReactNode][] = [
    ["Телефон", <a key="p" href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="mono hover:text-accent">{client.phone}</a>],
    ["Email", client.email ? <a key="e" href={`mailto:${client.email}`} className="hover:text-accent">{client.email}</a> : "—"],
    ["Источник", client.source ?? "—"],
    ["В базе с", fmtDate(client.createdAt)],
  ];

  return (
    <div>
      <header className="animate-in mb-6">
        <Link href="/clients" className="text-[13px] font-semibold text-muted hover:text-ink">
          ← Клиенты
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">
              {client.name}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <span className={`chip ${TYPE_CLS[client.type] ?? "chip-muted"}`}>
                {CLIENT_TYPE[client.type] ?? client.type}
              </span>
              <span className="text-sm text-muted">
                {client.deals.length
                  ? `${client.deals.length} сделок · ${activeDeals.length} в работе`
                  : "сделок пока нет"}
                {openTasks.length ? ` · ${openTasks.length} задач` : ""}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/clients/${client.id}/edit`} className="btn btn-ghost">Редактировать</Link>
            <form action={deleteClient.bind(null, client.id)}>
              <ConfirmButton
                message={
                  client.deals.length
                    ? `Удалить клиента ${client.name}? Вместе с ним удалятся его сделки (${client.deals.length}). Задачи останутся, но потеряют привязку. Действие необратимо.`
                    : `Удалить клиента ${client.name}? Действие необратимо.`
                }
              >
                Удалить
              </ConfirmButton>
            </form>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 flex flex-col gap-4">
          <section className="panel animate-in delay-1 p-5">
            <h2 className="mb-4 text-[15px] font-bold">Контакты</h2>
            <dl className="grid grid-cols-4 gap-y-4">
              {contacts.map(([k, v]) => (
                <div key={k}>
                  <dt className="label mb-1">{k}</dt>
                  <dd className="text-[14px]">{v}</dd>
                </div>
              ))}
            </dl>
            {client.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="label mb-1.5">Заметки</div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{client.notes}</p>
              </div>
            )}
          </section>

          <section className="panel animate-in delay-2 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Сделки</h2>
              <Link href="/deals" className="text-[13px] font-semibold text-accent hover:underline">
                К воронке →
              </Link>
            </div>
            {client.deals.length === 0 ? (
              <p className="text-[13px] text-muted">Сделок пока нет.</p>
            ) : (
              <div className="flex flex-col">
                {client.deals.map((d) => (
                  <Link
                    key={d.id}
                    href="/deals"
                    className="flex items-center justify-between border-b border-line py-2.5 last:border-none hover:bg-white/[0.02]"
                  >
                    <div>
                      <div className="text-[14px] font-semibold">
                        {d.car ? `${d.car.make} ${d.car.model}` : DEAL_TYPE[d.type]}
                      </div>
                      <div className="text-[12px] text-muted">
                        {DEAL_TYPE[d.type]} · {fmtDate(d.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {d.amount != null && <span className="mono text-[13px]">{fmtMoney(d.amount)}</span>}
                      <span
                        className={`chip ${
                          d.stage === "LOST" ? "chip-red" : d.stage === "DONE" ? "chip-green" : "chip-blue"
                        }`}
                      >
                        {STAGE_LABEL[d.stage] ?? d.stage}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="panel animate-in delay-3 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Задачи</h2>
            <Link href="/tasks" className="text-[13px] font-semibold text-accent hover:underline">
              Все →
            </Link>
          </div>
          {client.tasks.length === 0 ? (
            <p className="text-[13px] text-muted">Задач по клиенту нет.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {client.tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5">
                  <div
                    className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${
                      t.done ? "bg-[var(--muted)]" : isOverdue(t.dueDate) ? "bg-red" : "bg-accent"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className={`text-[14px] ${t.done ? "text-muted line-through" : "font-medium"}`}>
                      {t.title}
                    </div>
                    <div
                      className={`text-[12px] ${
                        !t.done && isOverdue(t.dueDate) ? "font-semibold text-red" : "text-muted"
                      }`}
                    >
                      {dueLabel(t.dueDate)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
