"use client";

import { useFormStatus } from "react-dom";

/**
 * Кнопка отправки формы с pending-состоянием (§23). Пока Server Action выполняется,
 * кнопка блокируется и показывает спиннер + текст «…» — мгновенный отклик вместо
 * ощущения «ничего не происходит». Работает только внутри <form action={...}>.
 */
export function SubmitButton({
  children,
  pendingText,
  className = "btn btn-primary",
  disabled,
  title,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" title={title} disabled={pending || disabled} aria-busy={pending} className={className}>
      {pending && <span className="btn-spinner" aria-hidden="true" />}
      {pending ? pendingText ?? children : children}
    </button>
  );
}
