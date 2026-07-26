import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { createExpense } from "@/lib/actions";
import { ExpenseForm } from "@/components/expense-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ carId?: string }> }) {
  const user = await requireUser();
  if (!can(user, "expense.add")) notFound();
  const { carId } = await searchParams;

  const [cars, users] = await Promise.all([
    prisma.car.findMany({ orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const carOptions = cars.map((c) => ({ id: c.id, label: `${internalCode(c)} ${c.make} ${c.model}` }));

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Новый расход</h1>
      </header>
      <ExpenseForm
        action={createExpense}
        submitLabel="Создать расход"
        cars={carOptions}
        users={users}
        defaults={{
          title: "", category: "SONSTIGES", amountGross: "", vatRate: "20", supplier: "", invoiceNumber: "",
          invoiceDate: "", paymentDate: "", paymentMethod: "", paymentStatus: "UNPAID", paidAmount: "",
          ownerCompany: "", responsibleUserId: user.id, carId: carId ?? "", comment: "", alreadyIncludedInAcquisitionCost: false,
        }}
      />
    </div>
  );
}
