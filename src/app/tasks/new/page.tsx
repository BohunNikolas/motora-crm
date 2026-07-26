import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { createTask } from "@/lib/actions";
import { TaskForm } from "@/components/task-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

// carId/type в query — предзаполнение при заходе из карточки авто (§15.3 «дополнительные поля»).
export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ carId?: string; type?: string; warrantyCaseId?: string }> }) {
  const user = await requireUser();
  if (!can(user, "task.manage")) notFound();
  const { carId, type, warrantyCaseId } = await searchParams;

  const [cars, users] = await Promise.all([
    // Обычно на витрине непроданные авто; но если пришли из гарантии (§19) с
    // конкретным проданным авто — включаем и его.
    prisma.car.findMany({ where: carId ? { OR: [{ status: { not: "SOLD" } }, { id: carId }] } : { status: { not: "SOLD" } }, orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const carOptions = cars.map((c) => ({ id: c.id, label: `${internalCode(c)} ${c.make} ${c.model}` }));

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Новая задача</h1>
      </header>
      <TaskForm
        action={createTask}
        submitLabel="Создать задачу"
        cars={carOptions}
        users={users}
        warrantyCaseId={warrantyCaseId}
        defaults={{
          type: carId ? "FAHRZEUG" : type ?? "ALLGEMEIN",
          title: "",
          description: "",
          priority: "MEDIUM",
          status: "OPEN",
          dueDate: "",
          assignedToUserId: user.id,
          carId: carId ?? "",
        }}
      />
    </div>
  );
}
