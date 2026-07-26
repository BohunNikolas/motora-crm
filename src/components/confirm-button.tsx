"use client";

import { useFormStatus } from "react-dom";

/**
 * Кнопка необратимого действия: сначала подтверждение, затем — pending-состояние
 * (§23), пока Server Action выполняется. Блокирует повторный клик и показывает спиннер.
 */
export function ConfirmButton({
  children,
  message,
  className = "btn btn-danger",
  title,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      title={title}
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {pending && <span className="btn-spinner" aria-hidden="true" />}
      {pending ? "…" : children}
    </button>
  );
}
