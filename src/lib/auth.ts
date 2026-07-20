import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import type { AuthUser } from "./authz";

/**
 * Аутентификация MOTORHOF: сессии в Postgres + httpOnly-cookie.
 * Пароли — scrypt из node:crypto (без внешних зависимостей и native-модулей).
 * Cookie не подписывается: значение — случайный токен, который валидируется
 * лукапом в БД; подделать его можно только угадав 256 бит.
 */

export const SESSION_COOKIE = "mh_session";
const SESSION_DAYS = 30;

// ── Пароли ──────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ── Сессии ──────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  return token;
}

export async function destroySession(token: string) {
  await prisma.session.deleteMany({ where: { token } });
}

export async function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  };
}

/**
 * Текущий пользователь по cookie. cache() — один запрос к БД на рендер,
 * сколько бы компонентов ни спросили.
 */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const { id, email, name, roles } = session.user;
  return { id, email, name, roles };
});

/** Флаг «нужно сменить пароль» — отдельным запросом только там, где нужен. */
export const getMustChangePassword = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user) return false;
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true },
  });
  return u?.mustChangePassword ?? false;
});

/**
 * Обязательный вход для страницы. Незалогиненных уводит на /login,
 * пользователей с временным паролем — на /account (кроме самой /account).
 */
export async function requireUser(opts?: { skipPasswordCheck?: boolean }): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!opts?.skipPasswordCheck && (await getMustChangePassword())) redirect("/account");
  return user;
}

// ── Аудит (§21) ─────────────────────────────────────────────────

type Jsonish = Record<string, unknown> | null | undefined;

/** Запись в AuditLog. Не бросает: сбой аудита не должен ронять операцию. */
export async function audit(
  userId: string | null,
  entityType: string,
  entityId: string,
  action: string,
  data?: { before?: Jsonish; after?: Jsonish; reason?: string }
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        entityType,
        entityId,
        action,
        before: (data?.before ?? undefined) as never,
        after: (data?.after ?? undefined) as never,
        reason: data?.reason,
      },
    });
  } catch (e) {
    console.error("audit failed:", e);
  }
}
