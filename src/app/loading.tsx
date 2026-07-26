// Глобальное состояние загрузки (§23). Показывается при навигации между
// серверными страницами, пока грузятся данные.
export default function Loading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      <p className="text-[13px] text-muted">Загрузка…</p>
    </div>
  );
}
