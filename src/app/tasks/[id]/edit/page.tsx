import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { updateTask } from "@/lib/actions";
import { TaskForm } from "@/components/task-form";
import { internalCode } from "@/lib/format";

export const dynamic = "force-dynamic";

const dstr = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "task.manage")) notFound();
  const { id } = await params;

  const [task, cars, users] = await Promise.all([
    prisma.task.findUnique({ where: { id } }),
    prisma.car.findMany({ where: { status: { not: "SOLD" } }, orderBy: [{ make: "asc" }], select: { id: true, make: true, model: true, mhNumber: true, parkingRow: true, parkingSpot: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!task) notFound();
  const carOptions = cars.map((c) => ({ id: c.id, label: `${internalCode(c)} ${c.make} ${c.model}` }));

  return (
    <div>
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Редактирование задачи</h1>
      </header>
      <TaskForm
        action={updateTask.bind(null, id)}
        submitLabel="Сохранить"
        cars={carOptions}
        users={users}
        defaults={{
          type: task.type,
          title: task.title,
          description: task.description ?? "",
          priority: task.priority,
          status: task.status,
          dueDate: dstr(task.dueDate),
          assignedToUserId: task.assignedToUserId ?? "",
          carId: task.carId ?? "",
        }}
      />
    </div>
  );
}
