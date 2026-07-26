# MOTORHOF CRM — отчёт о перестройке (§26)

Итог перестройки MOTORA MVP → MOTORHOF по `docs/TZ-MOTORHOF.md`. Рынок — Австрия
(EUR/de-AT, Differenzbesteuerung, Pickerl, Gewährleistung, e.U./OG).

## Что сделано по фазам

- **Ф0** — бренд MOTORA→MOTORHOF, палитра, EUR de-AT, даты DD.MM.YYYY.
- **Ф1** — финансовый фундамент (`finance.ts`: Differenzbesteuerung/Regelbesteuerung, Decimal, half-up).
- **Ф2** — личные аккаунты, 5 ролей (мульти-роль), капабилити-матрица, redaction, AuditLog.
- **Ф3** — автомобили глубоко (3a–3e): 8 статусов + парковка, форма §8, файлы R2, владельцы §9, каналы закупки §11, Sale/бронь/продажа §18.
- **Ф4** — расходы §14 (4a), задачи §15 (4b), календарь §16 с конфликт-чеком (4c).
- **Ф5** — Gewährleistung §19 (5a), клиенты §17 без Deal (5b), навигация §4 + снос Deal UI (5c), дашборд §5 (5d), UX-проход §23 + DoD (5e).

## Definition of Done (§25)

| Критерий | Статус |
|---|---|
| Сборка без TypeScript/build errors | ✅ `tsc --noEmit` + `next build` чисто |
| Lint проходит | ✅ `eslint` без ошибок |
| Миграции на чистой и существующей БД | ✅ проверено (чистая БД → 14 таблиц) |
| Данные сохраняются после reload | ✅ Postgres, `force-dynamic` |
| Новые страницы доступны из sidebar | ✅ Календарь, Гарантия, Настройки в навигации §4 |
| Кнопки и фильтры работают | ✅ KPI-клики, фильтры в URL, пагинация |
| Суммы в EUR | ✅ `fmtMoney` (de-AT) везде |
| MOTORA заменена на MOTORHOF | ✅ в UI (`src/`) остатков нет |
| Deal UI удалён | ✅ страница/воронка/actions убраны, модель — legacy |
| Sale сохранён как история авто | ✅ сущность `Sale` (§18), источник истины по продажам |
| Финансовые формулы покрыты тестами | ✅ `finance.test.ts` + `format.test.ts` (67 тестов) |
| Server-side permissions | ✅ `requireCan` в actions, `viewerFlags`/redaction на страницах |
| Uploads не зависят от временного диска | ✅ Cloudflare R2 через `src/lib/storage.ts` |
| Нет mock-only функций как готовых | ✅ всё на реальных данных Prisma |
| Файл с описанием миграции и env | ✅ этот файл + `.env.example` |

## Миграции (`prisma/migrations/`)

Применять: `npx prisma migrate deploy`. Порядок фиксирован именами. Ключевые:

- `phase1_finance` — деньги Int→Decimal, налоговые поля.
- `phase2_auth` — User/Session, роли.
- `phase3a…3e` — статусы+парковка, поля §8, CarFile, владельцы §9, каналы §11, Sale (+data-миграция `migrate-deals-to-sales.mjs`).
- `phase4a_expenses` — полная модель Expense (§14).
- `phase4b_tasks` — Task: type/priority/status (backfill из `done`), assignedTo/createdBy.
- `phase4c_appointments` — Appointment (§16).
- `phase5a_warranty` — WarrantyCase (§19) + `warrantyCaseId` в Task/Expense.

## Переменные окружения (`.env.example`)

- `DATABASE_URL` — Postgres (Neon), с `?sslmode=require`.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — Cloudflare R2 (файлы §8.5). Те же значения задать на хостинге.

## Известные ограничения

Собраны в `docs/BACKLOG-MVP.md` — сознательные упрощения MVP (вложения к расходам/
задачам/гарантии, строгая Vienna-TZ при вводе, inline-ошибки форм, UI управления
пользователями, server-side пагинация запросов, разбивка склада по владельцу и др.).
