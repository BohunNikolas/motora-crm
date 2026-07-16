"use client";

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
  return (
    <button
      type="submit"
      title={title}
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
