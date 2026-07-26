import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { createWarrantyCase } from "@/lib/actions";
import { WarrantyForm } from "@/components/warranty-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

// ?carId — предзаполнение при заходе из карточки проданного авто.
export default async function NewWarrantyPage({ searchParams }: { searchParams: Promise<{ carId?: string }> }) {
  const user = await requireUser();
  if (!can(user, "task.manage")) notFound();
  const { carId } = await searchParams;

  const [cars, clients, users] = await Promise.all([
    prisma.car.findMany({ where: { status: "SOLD" }, orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const carOptions = cars.map((c) => ({ id: c.id, label: `${internalCode(c)} ${c.make} ${c.model}` }));

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Новый гарантийный случай</h1>
      </header>
      <WarrantyForm
        action={createWarrantyCase}
        submitLabel="Создать случай"
        cars={carOptions}
        clients={clients}
        users={users}
        defaults={{
          carId: carId ?? "", clientId: "", complaintDescription: "", clientReportedAt: "", responsibleUserId: "",
          workshop: "", deadline: "", diagnosis: "", decision: "", communicationNotes: "", finalCost: "",
        }}
      />
    </div>
  );
}
