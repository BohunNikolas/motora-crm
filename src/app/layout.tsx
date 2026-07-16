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
  title: "MOTORA — CRM автосалона",
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
        <div className="flex min-h-screen">
          <aside className="fixed inset-y-0 left-0 z-20 flex w-[228px] flex-col border-r border-line bg-surface/60 backdrop-blur-xl px-4 py-6">
            <div className="mb-8 flex items-center gap-2.5 px-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-[#16130c]">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 11l1.8-4.5A2 2 0 0 1 8.7 5h6.6a2 2 0 0 1 1.9 1.5L19 11" />
                  <path d="M3 16v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
                  <circle cx="7" cy="16.5" r="1.7" /><circle cx="17" cy="16.5" r="1.7" />
                </svg>
              </div>
              <div>
                <div className="font-[family-name:var(--font-unbounded)] text-[15px] font-bold tracking-wide">
                  MOTORA
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  CRM автосалона
                </div>
              </div>
            </div>
            <Nav />
            <div className="mt-auto px-2 pt-6 text-[11px] leading-relaxed text-muted/70">
              MVP v0.1
            </div>
          </aside>
          <main className="ml-[228px] flex-1 px-8 py-8">
            <div className="mx-auto max-w-[1200px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
