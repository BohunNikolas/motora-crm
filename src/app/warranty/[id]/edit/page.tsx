import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { updateWarrantyCase } from "@/lib/actions";
import { WarrantyForm } from "@/components/warranty-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

const dateInput = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default async function EditWarrantyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "task.manage")) notFound();
  const { id } = await params;

  const [wc, clients, users] = await Promise.all([
    prisma.warrantyCase.findUnique({ where: { id }, include: { car: { select: { make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } } } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!wc) notFound();
  const carLabel = `${internalCode(wc.car)} ${wc.car.make} ${wc.car.model}`;

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Редактирование случая</h1>
      </header>
      <WarrantyForm
        action={updateWarrantyCase.bind(null, id)}
        submitLabel="Сохранить"
        cars={[{ id: wc.carId, label: carLabel }]}
        clients={clients}
        users={users}
        lockCar
        defaults={{
          carId: wc.carId,
          clientId: wc.clientId ?? "",
          complaintDescription: wc.complaintDescription,
          clientReportedAt: dateInput(wc.clientReportedAt),
          responsibleUserId: wc.responsibleUserId ?? "",
          workshop: wc.workshop ?? "",
          deadline: dateInput(wc.deadline),
          diagnosis: wc.diagnosis ?? "",
          decision: wc.decision ?? "",
          communicationNotes: wc.communicationNotes ?? "",
          finalCost: wc.finalCost != null ? String(wc.finalCost) : "",
        }}
      />
    </div>
  );
}
