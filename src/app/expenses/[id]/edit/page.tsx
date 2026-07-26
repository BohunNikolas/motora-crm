import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { updateExpense } from "@/lib/actions";
import { ExpenseForm } from "@/components/expense-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

const dstr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const m = (d: { toString: () => string } | null) => (d == null ? "" : d.toString());

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "expense.add")) notFound();
  const { id } = await params;

  const [expense, cars, users] = await Promise.all([
    prisma.expense.findUnique({ where: { id } }),
    prisma.car.findMany({ orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!expense) notFound();
  const carOptions = cars.map((c) => ({ id: c.id, label: `${internalCode(c)} ${c.make} ${c.model}` }));

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Редактирование расхода</h1>
      </header>
      <ExpenseForm
        action={updateExpense.bind(null, id)}
        submitLabel="Сохранить"
        cars={carOptions}
        users={users}
        defaults={{
          title: expense.title,
          category: expense.category,
          amountGross: m(expense.amountGross),
          vatRate: String(expense.vatRate),
          supplier: expense.supplier ?? "",
          invoiceNumber: expense.invoiceNumber ?? "",
          invoiceDate: dstr(expense.invoiceDate),
          paymentDate: dstr(expense.paymentDate),
          paymentMethod: expense.paymentMethod ?? "",
          paymentStatus: expense.paymentStatus,
          paidAmount: m(expense.paidAmount),
          ownerCompany: expense.ownerCompany ?? "",
          responsibleUserId: expense.responsibleUserId ?? "",
          carId: expense.carId ?? "",
          comment: expense.comment ?? "",
          alreadyIncludedInAcquisitionCost: expense.alreadyIncludedInAcquisitionCost,
        }}
      />
    </div>
  );
}
