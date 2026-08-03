import type { Metadata } from "next";
import { Manrope, Unbounded, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { MobileShell } from "@/components/mobile-shell";
import { getSessionUser } from "@/lib/auth";
import { viewerFlags } from "@/lib/authz";
import { logout } from "@/lib/actions-auth";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABEL } from "@/lib/format";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "700"],
});

const jbmono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "MOTORHOF — CRM",
  description: "Учёт автомобилей, клиентов и сделок для салона б/у автомобилей",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  const flags = viewerFlags(user);

  // Лого-блок и низ панели (профиль + выход) рендерятся сервером один раз
  // и используются и в десктопном сайдбаре, и в мобильной панели.
  const logo = (
    <div className="flex items-center gap-2.5">
      {/* Монограмма MOTORHOF (официальный SVG-символ, не перерисован). */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--warm-white)] text-[var(--graphite)]">
        <svg width="21" height="21" viewBox="15 0 190 205" fill="none" stroke="currentColor" strokeWidth="21.75" strokeLinecap="square" strokeLinejoin="miter">
          <path d="M 47 173 V 47 L 110 110 L 173 47 V 173" />
          <path d="M 47 123.5 H 173" />
        </svg>
      </div>
      <div>
        <div className="font-[family-name:var(--font-unbounded)] text-[15px] font-bold tracking-wide">
          MOTORHOF
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          CRM
        </div>
      </div>
    </div>
  );

  const profile = user ? (
    <div className="px-2">
      <a href="/account" className="block hover:opacity-80">
        <div className="truncate text-[13px] font-semibold">{user.name}</div>
        <div className="truncate text-[11px] text-muted">
          {user.roles.map((r) => ROLE_LABEL[r] ?? r).join(" + ")}
        </div>
      </a>
      <form action={logout} className="mt-2.5">
        <SubmitButton
          className="inline-flex items-center gap-2 text-[12px] font-semibold text-muted transition-colors hover:text-red disabled:opacity-60"
          pendingText="Выход…"
        >
          Выйти →
        </SubmitButton>
      </form>
    </div>
  ) : null;

  const nav = user ? <Nav showExpenses={flags.seeAcquisition} showSettings={flags.isAdmin} /> : null;

  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${unbounded.variable} ${jbmono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {!user ? (
          // Незалогинен — без сайдбара (страница /login)
          children
        ) : (
          <div className="min-h-screen">
            {/* Десктоп (lg+): фиксированный сайдбар. Мобайл: скрыт — вместо него шапка с бургером. */}
            <aside className="fixed inset-y-0 left-0 z-20 hidden w-[228px] flex-col border-r border-line bg-surface/60 px-4 py-6 backdrop-blur-xl lg:flex">
              <div className="mb-8 px-2">{logo}</div>
              {nav}
              <div className="mt-auto border-t border-line pt-4">{profile}</div>
            </aside>

            {/* Мобайл (<lg): sticky-шапка + off-canvas панель с той же навигацией. */}
            <MobileShell logo={logo} nav={nav} footer={profile} />

            <main className="px-4 py-5 sm:px-6 lg:ml-[228px] lg:px-8 lg:py-8">
              <div className="mx-auto max-w-[1200px]">{children}</div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
