"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  verifyPassword,
  sessionCookieOptions,
  audit,
} from "./auth";

export async function login(fd: FormData) {
  const email = (fd.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const password = (fd.get("password") as string | null) ?? "";

  const user = await prisma.user.findUnique({ where: { email } });
  // Единый ответ для «нет пользователя» и «неверный пароль» — не раскрываем, что именно не так.
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=1");
  }

  const token = await createSession(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, await sessionCookieOptions());
  await audit(user.id, "User", user.id, "login");
  redirect(user.mustChangePassword ? "/account" : "/");
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(fd: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const current = (fd.get("current") as string | null) ?? "";
  const next = (fd.get("next") as string | null) ?? "";
  const repeat = (fd.get("repeat") as string | null) ?? "";

  if (next.length < 10) redirect("/account?error=short");
  if (next !== repeat) redirect("/account?error=mismatch");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser || !verifyPassword(current, dbUser.passwordHash)) {
    redirect("/account?error=wrong");
  }
  if (verifyPassword(next, dbUser.passwordHash)) redirect("/account?error=same");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next), mustChangePassword: false },
  });
  // Сменили пароль — гасим все ДРУГИЕ сессии пользователя (украденная кука умрёт).
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await prisma.session.deleteMany({ where: { userId: user.id, NOT: { token: token ?? "" } } });
  await audit(user.id, "User", user.id, "password-change");
  redirect("/?pw=changed");
}
