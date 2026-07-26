import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { viewerFlags } from "@/lib/authz";
import { fmtDate, ROLE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

// §4: раздел «Настройки» доступен только разрешённым ролям (ADMIN).
export default async function SettingsPage() {
  const user = await requireUser();
  const flags = viewerFlags(user);
  if (!flags.isAdmin) notFound();

  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-in">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">Настройки</h1>
        <p className="mt-1 text-sm text-muted">Доступно администраторам</p>
      </header>

      <section className="panel animate-in delay-1 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Пользователи и роли</h2>
          <span className="text-[13px] text-muted">{users.filter((u) => u.active).length} активных</span>
        </div>
        <table className="table w-full">
          <thead><tr><th className="text-left">Имя</th><th className="text-left">Email</th><th className="text-left">Роли</th><th className="text-left">Статус</th><th className="text-left">Создан</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="mono text-[13px] text-muted">{u.email}</td>
                <td className="text-[13px]">{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(" + ")}</td>
                <td>{u.active ? <span className="chip chip-green">Активен</span> : <span className="chip chip-muted">Отключён</span>}{u.mustChangePassword && <span className="ml-1.5 chip chip-amber">сменит пароль</span>}</td>
                <td className="text-[13px] text-muted">{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[12px] text-muted">Создание и изменение пользователей выполняется скриптом <span className="mono">prisma/seed-users.mjs</span>. UI управления учётными записями — в бэклоге.</p>
      </section>

      <section className="panel animate-in delay-2 p-5">
        <h2 className="mb-4 text-[15px] font-bold">Параметры (в разработке)</h2>
        <ul className="flex flex-col gap-2.5 text-[13px] text-muted">
          <li>· Обязательность документов по авто (§8.5) — сейчас зашита в коде, будет настраиваемой.</li>
          <li>· Напоминания по терминам (§16) — доставка in-app.</li>
          <li>· Управление учётными записями и ролями из интерфейса.</li>
        </ul>
      </section>
    </div>
  );
}
