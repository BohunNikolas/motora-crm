import Link from "next/link";

// 404 (§23): страница не найдена — например удалённая запись или неверный URL.
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="panel max-w-[420px] p-7 text-center">
        <div className="mono text-[34px] font-bold text-muted">404</div>
        <h2 className="mt-2 text-[16px] font-bold">Страница не найдена</h2>
        <p className="mx-auto mt-2 max-w-[320px] text-[13px] text-muted">
          Записи не существует или у вас нет к ней доступа.
        </p>
        <Link href="/" className="btn btn-primary mt-5">На дашборд</Link>
      </div>
    </div>
  );
}
