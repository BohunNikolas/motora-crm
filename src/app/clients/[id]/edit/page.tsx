import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { ClientFields } from "@/components/client-form";
import { updateClient } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "client.manage")) redirect(`/clients/${id}`);
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <div>
      <header className="animate-in mb-6">
        <Link href={`/clients/${client.id}`} className="text-[13px] font-semibold text-muted hover:text-ink">
          ← {client.name}
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-unbounded)] text-[26px] font-bold">
          Редактирование
        </h1>
      </header>

      <form action={updateClient.bind(null, client.id)} className="animate-in delay-1 flex flex-col gap-5">
        <section className="panel p-5">
          <ClientFields client={client} />
        </section>
        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary">Сохранить</button>
          <Link href={`/clients/${client.id}`} className="btn btn-ghost">Отмена</Link>
        </div>
      </form>
    </div>
  );
}
