"use client";

import Link from "next/link";

// Глобальный error boundary (§23): вместо browser alert / дефолтного оверлея —
// аккуратная панель с сообщением и повтором. Ожидаемые ошибки Server Actions
// (конфликт термина §16.3, нехватка прав) в dev видны по message; в prod Next
// отдаёт generic — детальные inline-ошибки форм вынесены в бэклог (useActionState).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="panel max-w-[440px] p-7 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--red-dim,rgba(220,80,80,0.14))]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red">
            <path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <h2 className="text-[16px] font-bold">Что-то пошло не так</h2>
        <p className="mx-auto mt-2 max-w-[360px] text-[13px] text-muted">
          {error.message || "Произошла ошибка при выполнении действия."}
        </p>
        <div className="mt-5 flex justify-center gap-2.5">
          <button onClick={reset} className="btn btn-primary">Повторить</button>
          <Link href="/" className="btn btn-ghost">На главную</Link>
        </div>
      </div>
    </div>
  );
}
