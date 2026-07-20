import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { login } from "@/lib/actions-auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Уже вошёл — на дашборд.
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="animate-in w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--warm-white)] text-[var(--graphite)]">
            <svg width="32" height="32" viewBox="15 0 190 205" fill="none" stroke="currentColor" strokeWidth="21.75" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M 47 173 V 47 L 110 110 L 173 47 V 173" />
              <path d="M 47 123.5 H 173" />
            </svg>
          </div>
          <div className="text-center">
            <div className="font-[family-name:var(--font-unbounded)] text-[20px] font-bold tracking-wide">
              MOTORHOF
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              CRM автосалона
            </div>
          </div>
        </div>

        <form action={login} className="panel flex flex-col gap-4 p-6">
          {error && (
            <div className="rounded-lg border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-3 py-2.5 text-[13px] text-red">
              Неверный email или пароль.
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              className="field"
              placeholder="ivan@motorhof.local"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Пароль</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="field"
            />
          </div>
          <button type="submit" className="btn btn-primary mt-1 w-full">Войти</button>
        </form>
      </div>
    </div>
  );
}
