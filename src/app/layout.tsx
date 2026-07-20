import type { Metadata } from "next";
import { Manrope, Unbounded, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${unbounded.variable} ${jbmono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Сайдбар fixed — он вне потока, поэтому обёртке flex не нужен:
            с ним main получал min-width:auto, не мог сжаться и распирал страницу вбок. */}
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
            <Nav />
          </aside>
          <main className="ml-[228px] px-8 py-8">
            <div className="mx-auto max-w-[1200px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
