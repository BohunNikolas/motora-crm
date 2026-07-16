import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CarForm } from "@/components/car-form";
import { updateCar } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function EditCarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const car = await prisma.car.findUnique({ where: { id } });
  if (!car) notFound();

  return (
    <div>
      <header className="animate-in mb-6">
        <Link href={`/cars/${car.id}`} className="text-[13px] font-semibold text-muted hover:text-ink">
          ← {car.make} {car.model}
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-unbounded)] text-[26px] font-bold">
          Редактирование
        </h1>
      </header>
      <div className="animate-in delay-1">
        <CarForm
          car={car}
          action={updateCar.bind(null, car.id)}
          submitLabel="Сохранить"
          cancelHref={`/cars/${car.id}`}
        />
      </div>
    </div>
  );
}
