import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Общий вход по паролю для команды (MVP-заглушка вместо личных аккаунтов).
 *
 * Включается переменной окружения APP_PASSWORD. Если её нет — защита выключена,
 * поэтому локальная разработка не требует пароля, а прод без переменной просто
 * останется открытым (не сломается).
 *
 * Логин любой, пароль — значение APP_PASSWORD.
 *
 * ВНИМАНИЕ: Basic Auth передаёт пароль в каждом запросе и не имеет кнопки «выйти».
 * Это временное решение на период обкатки. Личные аккаунты и роли — этап после MVP,
 * до продажи продукта их нужно сделать обязательно.
 */
export function proxy(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.next();

  const header = request.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    // Пароль может содержать «:», поэтому режем только по первому разделителю
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (safeEqual(password, expected)) return NextResponse.next();
  }

  return new NextResponse("Требуется авторизация", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MOTORA CRM", charset="UTF-8"' },
  });
}

/** Сравнение за постоянное время — чтобы пароль нельзя было подобрать по скорости ответа */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Статику и картинки не проверяем — они и так не содержат данных,
  // а лишние проверки только замедляют загрузку.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
