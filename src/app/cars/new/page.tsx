import Link from "next/link";
import { CarForm } from "@/components/car-form";
import { createCar } from "@/lib/actions";

export default function NewCarPage() {
  return (
    <div>
      <header className="animate-in mb-6">
        <Link href="/cars" className="text-[13px] font-semibold text-muted hover:text-ink">
          ← Автомобили
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-unbounded)] text-[26px] font-bold">
          Новый автомобиль
        </h1>
      </header>
      <div className="animate-in delay-1">
        <CarForm action={createCar} submitLabel="Добавить авто" cancelHref="/cars" />
      </div>
    </div>
  );
}
