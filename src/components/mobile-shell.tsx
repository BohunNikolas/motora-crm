"use client";

import { useState } from "react";

/**
 * Мобильная обвязка (<lg): верхняя шапка с бургером + выезжающая панель
 * навигации. Содержимое панели (nav, профиль, выход) рендерится сервером
 * и передаётся слотами — здесь только открытие/закрытие.
 */
export function MobileShell({
  logo,
  nav,
  footer,
}: {
  logo: React.ReactNode;
  nav: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        {logo}
        <button
          type="button"
          aria-label="Открыть меню"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-line text-ink transition-colors hover:bg-surface-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Бекдроп: клик закрывает */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-surface px-4 py-5">
            <div className="mb-6 flex items-center justify-between">
              {logo}
              <button
                type="button"
                aria-label="Закрыть меню"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Клик по любой ссылке навигации закрывает панель (всплытие). */}
            <div onClick={() => setOpen(false)}>{nav}</div>
            <div className="mt-auto border-t border-line pt-4">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
}
