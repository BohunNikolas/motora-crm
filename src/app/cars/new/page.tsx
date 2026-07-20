import Link from "next/link";
import { redirect } from "next/navigation";
import { CarForm, CAR_FORM_ERRORS } from "@/components/car-form";
import { createCar } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function NewCarPage({
  searchParams,
}: {
  searchParams: Promise<{ ferror?: string }>;
}) {
  const user = await requireUser();
  // Полная форма содержит закупочные цены — только ADMIN/PARTNER
  if (!can(user, "edit.car")) redirect("/cars");
  const { ferror } = await searchParams;
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
      {ferror && CAR_FORM_ERRORS[ferror] && (
        <div className="animate-in mb-4 rounded-xl border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-4 py-3 text-[14px] text-red">
          {CAR_FORM_ERRORS[ferror]}
        </div>
      )}
      <div className="animate-in delay-1">
        <CarForm action={createCar} submitLabel="Добавить авто" cancelHref="/cars" />
      </div>
    </div>
  );
}
