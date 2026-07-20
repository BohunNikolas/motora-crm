import { requireUser, getMustChangePassword } from "@/lib/auth";
import { changePassword } from "@/lib/actions-auth";
import { ROLE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  short: "Новый пароль должен быть не короче 10 символов.",
  mismatch: "Пароли не совпадают.",
  wrong: "Текущий пароль неверен.",
  same: "Новый пароль совпадает с текущим — придумайте другой.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser({ skipPasswordCheck: true });
  const mustChange = await getMustChangePassword();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-[520px]">
      <header className="animate-in mb-6">
        <h1 className="font-[family-name:var(--font-unbounded)] text-[26px] font-bold">
          Мой аккаунт
        </h1>
        <p className="mt-1 text-sm text-muted">
          {user.name} · {user.email} ·{" "}
          {user.roles.map((r) => ROLE_LABEL[r] ?? r).join(" + ")}
        </p>
      </header>

      {mustChange && (
        <div className="panel animate-in delay-1 mb-4 border-[rgba(246,243,242,0.25)] p-4 text-[14px]">
          Вы вошли с временным паролем — придумайте собственный, чтобы продолжить
          работу. Минимум 10 символов.
        </div>
      )}

      <form action={changePassword} className="panel animate-in delay-2 flex flex-col gap-4 p-6">
        <h2 className="text-[15px] font-bold">Смена пароля</h2>
        {error && ERRORS[error] && (
          <div className="rounded-lg border border-[rgba(248,113,113,0.3)] bg-[var(--red-dim)] px-3 py-2.5 text-[13px] text-red">
            {ERRORS[error]}
          </div>
        )}
        <div>
          <label className="label" htmlFor="current">Текущий пароль</label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="next">Новый пароль (мин. 10 символов)</label>
          <input id="next" name="next" type="password" required minLength={10} autoComplete="new-password" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="repeat">Новый пароль ещё раз</label>
          <input id="repeat" name="repeat" type="password" required minLength={10} autoComplete="new-password" className="field" />
        </div>
        <button type="submit" className="btn btn-primary mt-1">Сменить пароль</button>
      </form>
    </div>
  );
}
