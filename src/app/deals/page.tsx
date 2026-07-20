import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConfirmButton } from "@/components/confirm-button";
import { createDeal, moveDealStage, loseDeal, reopenDeal, deleteDeal } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { fmtMoney, fmtDate, sumMoney, dealMargin, DEAL_STAGES, DEAL_TYPE, CLIENT_TYPE } from "@/lib/format";

export const dynamic = "force-dynamic";

type DealFull = Prisma.DealGetPayload<{
  include: { client: true; car: { include: { expenses: true } } };
}>;

const ICON_BTN =
  "flex h-7 w-7 items-center justify-center rounded-md text-[13px] text-muted transition-colors disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted";

function DealCard({ deal, isLast }: { deal: DealFull; isLast: boolean }) {
  const margin = deal.stage === "DONE" ? dealMargin(deal.amount, deal.car) : null;

  return (
    <article className="panel panel-hover bg-surface-2 p-3">
      <Link href={`/clients/${deal.clientId}`} className="block text-[13px] font-bold leading-tight hover:text-accent">
        {deal.client.name}
      </Link>

      {deal.car ? (
        <Link
          href={`/cars/${deal.carId}`}
          className="mt-1 block truncate text-[12px] text-muted hover:text-ink"
        >
          {deal.car.make} {deal.car.model} · {deal.car.year}
        </Link>
      ) : (
        <div className="mt-1 text-[12px] text-muted">без авто</div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="mono text-[13px] font-bold">
          {deal.amount != null ? fmtMoney(deal.amount) : "—"}
        </span>
        {/* Продажа — норма, чип рисуем только для нетипичных сделок, чтобы не шуметь */}
        {deal.type !== "SALE" && (
          <span className="chip chip-blue !px-1.5 !text-[10px]">{DEAL_TYPE[deal.type]}</span>
        )}
      </div>

      {margin != null && (
        <div className={`mt-1.5 mono text-[12px] font-bold ${margin.gte(0) ? "text-green" : "text-red"}`}>
          маржа {fmtMoney(margin)}
        </div>
      )}
      {deal.stage === "DONE" && margin == null && (
        <div className="mt-1.5 text-[11px] text-muted">
          {deal.car ? "нет суммы сделки" : "нет авто — маржа не считается"}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1 border-t border-line pt-2">
        <form action={moveDealStage.bind(null, deal.id, -1)}>
          <button
            type="submit"
            title="Назад"
            disabled={deal.stage === DEAL_STAGES[0].key}
            className={`${ICON_BTN} hover:bg-surface hover:text-ink`}
          >
            ←
          </button>
        </form>
        <form action={moveDealStage.bind(null, deal.id, 1)}>
          <button
            type="submit"
            title={isLast ? "Дальше некуда" : "Вперёд"}
            disabled={isLast}
            className={`${ICON_BTN} hover:bg-surface hover:text-ink`}
          >
            →
          </button>
        </form>
        <div className="flex-1" />
        <form action={loseDeal.bind(null, deal.id)}>
          <ConfirmButton
            message={`Пометить сделку с «${deal.client.name}» как потерянную?${
              deal.stage === "DONE" ? " Авто вернётся на склад в статус «В наличии»." : ""
            }`}
            className={`${ICON_BTN} hover:bg-[var(--red-dim)] hover:text-red`}
            title="Потеряна"
          >
            ⚑
          </ConfirmButton>
        </form>
        <form action={deleteDeal.bind(null, deal.id)}>
          <ConfirmButton
            message={`Удалить сделку с «${deal.client.name}»? Действие необратимо.`}
            className={`${ICON_BTN} hover:bg-[var(--red-dim)] hover:text-red`}
            title="Удалить"
          >
            ✕
          </ConfirmButton>
        </form>
      </div>
    </article>
  );
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  // TECHNICAL не видит раздел сделок вовсе (roles-motorhof.md)
  if (!can(user, "see.deals")) redirect("/");
  const canSell = can(user, "sell");
  const { error } = await searchParams;

  const [deals, clients, cars] = await Promise.all([
    prisma.deal.findMany({
      include: { client: true, car: { include: { expenses: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.car.findMany({ where: { status: { not: "SOLD" } }, orderBy: [{ make: "asc" }, { model: "asc" }] }),
  ]);

  const lost = deals.filter((d) => d.stage === "LOST");
  const active = deals.filter((d) => !["DONE", "LOST"].includes(d.stage));
  const pipelineValue = sumMoney(active.map((d) => d.amount));
  const lastStage = DEAL_STAGES[DEAL_STAGES.length - 1].key;

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Сделки</h1>
        <p className="mt-1 text-sm text-muted">
          {active.length} в работе на {fmtMoney(pipelineValue)}
          {lost.length > 0 && ` · ${lost.length} потеряно`}
        </p>
      </header>

      {error === "below-min" && (
        <div className="animate-in mb-4 rounded-xl border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-4 py-3 text-[14px] text-red">
          Продажа ниже Mindestverkaufspreis заблокирована. Согласуйте цену с партнёром —
          закрыть такую сделку может только роль «Партнёр» или «Админ».
        </div>
      )}

      {canSell && (
      <details className="panel animate-in delay-1 mb-4 overflow-hidden [&[open]>summary]:border-b [&[open]>summary]:border-line">
        <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-bold transition-colors hover:text-accent">
          + Новая сделка
        </summary>
        {clients.length === 0 ? (
          <div className="p-5">
            <p className="text-sm text-muted">
              Сначала нужен клиент — сделка всегда привязана к человеку.
            </p>
            <Link href="/clients" className="btn btn-primary mt-4">К клиентам</Link>
          </div>
        ) : (
          <form action={createDeal} className="p-5">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="label" htmlFor="clientId">Клиент *</label>
                <select id="clientId" name="clientId" required className="field">
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {CLIENT_TYPE[c.type] ?? c.type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="carId">Автомобиль</label>
                <select id="carId" name="carId" className="field">
                  <option value="">— без авто —</option>
                  {cars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.make} {c.model} {c.year} · {fmtMoney(c.listPrice)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="type">Тип</label>
                <select id="type" name="type" defaultValue="SALE" className="field">
                  {Object.entries(DEAL_TYPE).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="amount">Сумма сделки</label>
                <input id="amount" name="amount" type="number" min={0} className="field mono" placeholder="15500" />
              </div>
              <div className="col-span-4">
                <label className="label" htmlFor="notes">Заметка</label>
                <input id="notes" name="notes" className="field" placeholder="Торгуется, готов взять до конца недели" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary mt-4">Создать сделку</button>
            {cars.length === 0 && (
              <p className="mt-3 text-[13px] text-muted">
                Свободных авто на складе нет — сделку можно создать без авто и привязать позже.
              </p>
            )}
          </form>
        )}
      </details>
      )}

      {deals.length === 0 ? (
        <div className="panel animate-in delay-2 px-5 py-14 text-center">
          <p className="text-[15px] font-semibold">Сделок пока нет</p>
          <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted">
            Создайте первую — она пройдёт путь от лида до закрытия, а при закрытии авто
            автоматически станет проданным и посчитается фактическая маржа.
          </p>
        </div>
      ) : (
        <div className="animate-in delay-2 overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {DEAL_STAGES.map((stage) => {
              const items = deals.filter((d) => d.stage === stage.key);
              const sum = sumMoney(items.map((d) => d.amount));
              return (
                <section key={stage.key} className="flex w-[212px] shrink-0 flex-col">
                  <div className="mb-2.5 flex items-baseline justify-between px-1">
                    <h2 className="text-[13px] font-bold">
                      {stage.label}
                      <span className="mono ml-1.5 text-muted">{items.length}</span>
                    </h2>
                    {sum.gt(0) && <span className="mono text-[11px] text-muted">{fmtMoney(sum)}</span>}
                  </div>
                  <div className="flex min-h-[80px] flex-col gap-2 rounded-xl border border-dashed border-line p-2">
                    {items.map((d) => (
                      <DealCard key={d.id} deal={d} isLast={stage.key === lastStage} />
                    ))}
                    {items.length === 0 && (
                      <div className="flex flex-1 items-center justify-center text-[12px] text-muted/50">
                        пусто
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {lost.length > 0 && (
        <details className="panel animate-in delay-3 mt-4 overflow-hidden">
          <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-bold transition-colors hover:text-accent">
            Потерянные <span className="mono ml-1 text-muted">{lost.length}</span>
          </summary>
          <div className="border-t border-line px-5 py-2">
            {lost.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between border-b border-line py-2.5 last:border-none"
              >
                <div>
                  <Link href={`/clients/${d.clientId}`} className="text-[14px] font-semibold hover:text-accent">
                    {d.client.name}
                  </Link>
                  <div className="text-[12px] text-muted">
                    {d.car ? `${d.car.make} ${d.car.model}` : DEAL_TYPE[d.type]}
                    {d.closedAt ? ` · потеряна ${fmtDate(d.closedAt)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {d.amount != null && <span className="mono text-[13px] text-muted">{fmtMoney(d.amount)}</span>}
                  <form action={reopenDeal.bind(null, d.id)}>
                    <button type="submit" className="btn btn-ghost !px-3 !py-1.5 !text-[12px]">
                      Вернуть в работу
                    </button>
                  </form>
                  <form action={deleteDeal.bind(null, d.id)}>
                    <ConfirmButton
                      message={`Удалить сделку с «${d.client.name}»? Действие необратимо.`}
                      className={`${ICON_BTN} hover:bg-[var(--red-dim)] hover:text-red`}
                      title="Удалить"
                    >
                      ✕
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
