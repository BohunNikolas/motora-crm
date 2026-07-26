import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { cancelExpense } from "@/lib/actions";
import { ConfirmButton } from "@/components/confirm-button";
import {
  fmtMoney,
  fmtDate,
  sumMoney,
  internalCode,
  EXPENSE_CATEGORY,
  EXPENSE_CATEGORY_ORDER,
  EXPENSE_PAYMENT_STATUS,
  CURRENT_OWNER,
  expenseNet,
  expenseVat,
  expensePaid,
} from "@/lib/format";
import { Prisma } from "@prisma/client";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const PAGE_SIZE = 25;

// Границы месяца YYYY-MM → [начало, начало след. месяца).
function monthRange(ym?: string): { gte: Date; lt: Date } | null {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  // Страница расходов — финансовая (§14, §20): только роли с видимостью закупки/маржи.
  if (!can(user, "see.acquisition")) notFound();
  const sp = await searchParams;

  const mr = monthRange(sp.month);
  const where: Prisma.ExpenseWhereInput = { cancelled: false };
  if (mr) where.date = { gte: mr.gte, lt: mr.lt };
  if (sp.category) where.category = sp.category;
  if (sp.carId) where.carId = sp.carId;
  if (sp.ownerCompany) where.ownerCompany = sp.ownerCompany;
  if (sp.responsibleUserId) where.responsibleUserId = sp.responsibleUserId;
  if (sp.paymentStatus) where.paymentStatus = sp.paymentStatus;
  if (sp.supplier) where.supplier = { contains: sp.supplier, mode: "insensitive" };
  const amt: Prisma.DecimalFilter = {};
  if (sp.minAmount) amt.gte = sp.minAmount;
  if (sp.maxAmount) amt.lte = sp.maxAmount;
  if (Object.keys(amt).length) where.amountGross = amt;

  const [expenses, cars, users] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { car: true, responsible: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 500,
    }),
    prisma.car.findMany({ orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Итоги net/USt/gross и оплачено/не оплачено (§14.3). net/USt считаются из gross+ставки,
  // если не сохранены (legacy) — см. expenseNet/expenseVat.
  const totalGross = sumMoney(expenses.map((e) => e.amountGross));
  const totalNet = sumMoney(expenses.map((e) => expenseNet(e)));
  const totalVat = sumMoney(expenses.map((e) => expenseVat(e)));
  const totalPaid = sumMoney(expenses.map((e) => expensePaid(e)));
  const totalUnpaid = totalGross.minus(totalPaid);

  // Пагинация (§23). Итоги — по всей выборке, в таблице — текущая страница.
  const totalPages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);
  const pageExpenses = expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const carLabel = (c: { mhNumber: number; parkingRow: string | null; parkingSpot: number | null } | null, make?: string, model?: string) =>
    c ? `${internalCode(c)} ${make ?? ""} ${model ?? ""}`.trim() : "—";

  const totals = [
    { label: "Netto", value: fmtMoney(totalNet) },
    { label: "USt", value: fmtMoney(totalVat) },
    { label: "Brutto", value: fmtMoney(totalGross), accent: true },
    { label: "Оплачено", value: fmtMoney(totalPaid) },
    { label: "Не оплачено", value: fmtMoney(totalUnpaid) },
  ];

  return (
    <div>
      <header className="animate-in mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Расходы</h1>
          <p className="mt-1 text-sm text-muted">{expenses.length} записей{sp.month ? ` · ${sp.month}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/expenses/export${qs ? `?${qs}` : ""}`} className="btn btn-ghost">Экспорт CSV</a>
          {can(user, "expense.add") && <Link href="/expenses/new" className="btn btn-primary">+ Расход</Link>}
        </div>
      </header>

      {/* Итоги */}
      <div className="animate-in mb-5 grid grid-cols-5 gap-3">
        {totals.map((t) => (
          <div key={t.label} className="panel p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{t.label}</div>
            <div className={`mono mt-1.5 text-[19px] font-bold leading-none ${t.accent ? "text-accent" : ""}`}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* Фильтры (в URL, §23) */}
      <form className="panel animate-in mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        <div><label className="label">Месяц</label><input type="month" name="month" defaultValue={sp.month} className="field w-[150px]" /></div>
        <div><label className="label">Категория</label>
          <select name="category" defaultValue={sp.category ?? ""} className="field w-[180px]">
            <option value="">все</option>
            {EXPENSE_CATEGORY_ORDER.map((k) => (<option key={k} value={k}>{EXPENSE_CATEGORY[k]}</option>))}
          </select></div>
        <div><label className="label">Авто</label>
          <select name="carId" defaultValue={sp.carId ?? ""} className="field w-[190px]">
            <option value="">все</option>
            {cars.map((c) => (<option key={c.id} value={c.id}>{carLabel(c, c.make, c.model)}</option>))}
          </select></div>
        <div><label className="label">Владелец</label>
          <select name="ownerCompany" defaultValue={sp.ownerCompany ?? ""} className="field w-[140px]">
            <option value="">все</option>
            {Object.entries(CURRENT_OWNER).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
          </select></div>
        <div><label className="label">Ответственный</label>
          <select name="responsibleUserId" defaultValue={sp.responsibleUserId ?? ""} className="field w-[150px]">
            <option value="">все</option>
            {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </select></div>
        <div><label className="label">Оплата</label>
          <select name="paymentStatus" defaultValue={sp.paymentStatus ?? ""} className="field w-[130px]">
            <option value="">все</option>
            {Object.entries(EXPENSE_PAYMENT_STATUS).map(([k, v]) => (<option key={k} value={k}>{v.label}</option>))}
          </select></div>
        <div><label className="label">Поставщик</label><input name="supplier" defaultValue={sp.supplier} className="field w-[140px]" placeholder="поиск" /></div>
        <div><label className="label">Сумма €</label>
          <div className="flex gap-1">
            <input name="minAmount" type="number" defaultValue={sp.minAmount} className="field mono w-[80px]" placeholder="от" />
            <input name="maxAmount" type="number" defaultValue={sp.maxAmount} className="field mono w-[80px]" placeholder="до" />
          </div></div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Фильтр</button>
          <Link href="/expenses" className="btn btn-ghost">Сброс</Link>
        </div>
      </form>

      {/* Таблица */}
      <div className="panel animate-in overflow-x-auto p-0">
        <table className="table w-full">
          <thead>
            <tr>
              <th className="text-left">Дата</th>
              <th className="text-left">Расход</th>
              <th className="text-left">Категория</th>
              <th className="text-left">Авто</th>
              <th className="text-right">Netto</th>
              <th className="text-right">USt</th>
              <th className="text-right">Brutto</th>
              <th className="text-left">Оплата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageExpenses.map((e) => {
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted">{fmtDate(e.date)}</td>
                  <td>
                    <Link href={`/expenses/${e.id}/edit`} className="font-medium hover:text-accent">{e.title}</Link>
                    {e.supplier && <div className="text-[12px] text-muted">{e.supplier}</div>}
                  </td>
                  <td className="text-[13px]">{EXPENSE_CATEGORY[e.category] ?? e.category}</td>
                  <td className="text-[13px]">
                    {e.car ? <Link href={`/cars/${e.carId}`} className="hover:text-accent">{carLabel(e.car, e.car.make, e.car.model)}</Link> : "—"}
                  </td>
                  <td className="mono text-right">{fmtMoney(expenseNet(e))}</td>
                  <td className="mono text-right text-muted">{fmtMoney(expenseVat(e))}</td>
                  <td className="mono text-right font-bold">{fmtMoney(e.amountGross)}</td>
                  <td><span className={`chip ${EXPENSE_PAYMENT_STATUS[e.paymentStatus]?.cls ?? "chip-muted"}`}>{EXPENSE_PAYMENT_STATUS[e.paymentStatus]?.label ?? e.paymentStatus}</span></td>
                  <td className="text-right">
                    {can(user, "expense.add") && (
                      <form action={cancelExpense.bind(null, e.id)}>
                        <ConfirmButton message={`Отменить расход «${e.title}»? Он сохранится в истории (soft-delete).`} className="rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:bg-[var(--red-dim)] hover:text-red">✕</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {expenses.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-sm text-muted">Расходов по фильтру нет.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} basePath="/expenses" params={sp} />
    </div>
  );
}
