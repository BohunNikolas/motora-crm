import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { updateAppointment } from "@/lib/actions";
import { AppointmentForm } from "@/components/appointment-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

// Date → «YYYY-MM-DDTHH:MM» в поясе Вены (согласовано с показом времени в списке).
function dtLocalVienna(d: Date | null): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(d));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "task.manage")) notFound();
  const { id } = await params;

  const [appt, clients, cars, users] = await Promise.all([
    prisma.appointment.findUnique({ where: { id } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    prisma.car.findMany({ where: { status: { not: "SOLD" } }, orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!appt) notFound();
  const carOptions = cars.map((c) => ({ id: c.id, label: `${internalCode(c)} ${c.make} ${c.model}` }));

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Редактирование термина</h1>
      </header>
      <AppointmentForm
        action={updateAppointment.bind(null, id)}
        submitLabel="Сохранить"
        clients={clients}
        cars={carOptions}
        users={users}
        defaults={{
          clientName: appt.clientName,
          phone: appt.phone ?? "",
          clientId: appt.clientId ?? "",
          carId: appt.carId ?? "",
          employeeId: appt.employeeId ?? "",
          startAt: dtLocalVienna(appt.startAt),
          endAt: dtLocalVienna(appt.endAt),
          type: appt.type,
          reminderMinutesBefore: appt.reminderMinutesBefore != null ? String(appt.reminderMinutesBefore) : "",
          comment: appt.comment ?? "",
        }}
      />
    </div>
  );
}
