import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Шлюз аутентификации (фаза 2): вход по личным аккаунтам вместо общего
 * Basic Auth пароля. Здесь проверяется только НАЛИЧИЕ cookie сессии —
 * дёшево, без БД. Настоящая валидация (сессия жива, пользователь активен)
 * происходит в requireUser()/getSessionUser() при рендере страницы.
 * Поддельная кука пройдёт proxy, но упрётся в лукап по БД и получит /login.
 */

const SESSION_COOKIE = "mh_session";
const PUBLIC_PATHS = ["/login", "/icon.svg"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
