import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { createAppointment } from "@/lib/actions";
import { AppointmentForm } from "@/components/appointment-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

// ?date=YYYY-MM-DD и ?carId — предзаполнение при заходе из ячейки дня / карточки авто.
export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ date?: string; carId?: string }> }) {
  const user = await requireUser();
  if (!can(user, "task.manage")) notFound();
  const { date, carId } = await searchParams;

  const [clients, cars, users] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    prisma.car.findMany({ where: { status: { not: "SOLD" } }, orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const carOptions = cars.map((c) => ({ id: c.id, label: `${internalCode(c)} ${c.make} ${c.model}` }));
  // Предзаполнение начала: выбранный день в 10:00, конец 10:30.
  const startAt = date ? `${date}T10:00` : "";
  const endAt = date ? `${date}T10:30` : "";

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Новый термин</h1>
      </header>
      <AppointmentForm
        action={createAppointment}
        submitLabel="Создать термин"
        clients={clients}
        cars={carOptions}
        users={users}
        defaults={{
          clientName: "", phone: "", clientId: "", carId: carId ?? "", employeeId: user.id,
          startAt, endAt, type: "BESICHTIGUNG", reminderMinutesBefore: "", comment: "",
        }}
      />
    </div>
  );
}
