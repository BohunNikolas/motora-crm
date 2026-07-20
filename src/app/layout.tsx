import type { Metadata } from "next";
import { Manrope, Unbounded, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { getSessionUser } from "@/lib/auth";
import { viewerFlags } from "@/lib/authz";
import { logout } from "@/lib/actions-auth";
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
  title: "MOTORHOF — CRM автосалона",
  description: "Учёт автомобилей, клиентов и сделок для салона б/у автомобилей",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  const flags = viewerFlags(user);

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
          /* Сайдбар fixed — он вне потока, поэтому обёртке flex не нужен:
             с ним main получал min-width:auto, не мог сжаться и распирал страницу вбок. */
          <div className="min-h-screen">
            <aside className="fixed inset-y-0 left-0 z-20 flex w-[228px] flex-col border-r border-line bg-surface/60 backdrop-blur-xl px-4 py-6">
              <div className="mb-8 flex items-center gap-2.5 px-2">
                {/* Монограмма MOTORHOF (официальный SVG-символ, не перерисован).
                    Графитовый штрих на warm-white плитке — фирменный lockup. */}
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--warm-white)] text-[var(--graphite)]">
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
                    CRM автосалона
                  </div>
                </div>
              </div>
              <Nav showDeals={flags.seeDeals} />
              <div className="mt-auto border-t border-line px-2 pt-4">
                <a href="/account" className="block hover:opacity-80">
                  <div className="truncate text-[13px] font-semibold">{user.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {user.roles.map((r) => ROLE_LABEL[r] ?? r).join(" + ")}
                  </div>
                </a>
                <form action={logout} className="mt-2.5">
                  <button
                    type="submit"
                    className="text-[12px] font-semibold text-muted transition-colors hover:text-red"
                  >
                    Выйти →
                  </button>
                </form>
              </div>
            </aside>
            <main className="ml-[228px] px-8 py-8">
              <div className="mx-auto max-w-[1200px]">{children}</div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
