@AGENTS.md

# MOTORA — CRM для автосалона б/у автомобилей

Русскоязычный интерфейс. MVP для команды салона, в перспективе — SaaS-продукт.
**Техническая карта разработки: см. `DEVPLAN.md` — сверяйся с ней перед каждым этапом и отмечай выполненное.**

## Окружение (ВАЖНО)

- Node.js установлен НЕ глобально, а в `~/.local/node`. Перед любой командой npm/npx/node:
  ```bash
  export PATH="$HOME/.local/node/bin:$PATH"
  ```
- Prisma зафиксирован на **v6** (`prisma@6`, `@prisma/client@6`). НЕ обновлять до 7 — там ломающая смена конфигурации.
- Next.js **16** (App Router, Turbopack): `params` и `searchParams` в страницах — асинхронные (`await params`). `revalidatePath` работает как раньше.
- База: **Postgres на Neon** (Frankfurt), и локально, и на проде — одна и та же. Строка подключения в `.env` (`DATABASE_URL`), файл в git не попадает, шаблон — в `.env.example`. SQLite был только на этапах 1–7, сейчас его нет.
- **Аутентификация (фаза 2): личные аккаунты**, БЕЗ Basic Auth/APP_PASSWORD. Сессии в Postgres + httpOnly-cookie `mh_session`; пароли scrypt (node:crypto, без зависимостей). `src/proxy.ts` — только редирект на /login при отсутствии cookie; настоящая валидация в `requireUser()`/`getSessionUser()` (`src/lib/auth.ts`). Пользователи создаются `node prisma/seed-users.mjs` (идемпотентен, паролей не сбрасывает).
- **Авторизация: капабилити-матрица `src/lib/authz.ts`** (спецификация: `docs/roles-motorhof.md`). Роли ADMIN/PARTNER/SALES/TECHNICAL/READ_ONLY, мульти-роль = union. В Server Actions — `requireCan(...)`; в страницах — `viewerFlags(user)`/`can(user, cap)` и УСЛОВНЫЙ РЕНДЕР запрещённых блоков (redaction: цифр нет в HTML, не «спрятано CSS»). НИКОГДА не проверять `if (role === ...)` по коду.
- **AuditLog** (`audit()` в auth.ts) — писать при каждой мутации Car/Expense/Deal/Client/Task с before/after; для override — reason.
- **Kostenvoranschlag:** `Expense.approvalStatus` PENDING/APPROVED; финансовые хелперы (`format.ts`) считают ТОЛЬКО APPROVED.
- **Файлы (§8.5):** модель `CarFile` (PHOTO|DOCUMENT), хранилище — S3-совместимое (`src/lib/storage.ts`, сейчас Cloudflare R2), переменные `S3_*`. Браузер НИКОГДА не ходит в R2 напрямую (блокировка домена R2 у провайдера + приватный бакет) — только через `/api/files/[id]` (auth + redaction финансовых документов). Загрузка через Server Action (лимит тела поднят в next.config до 15mb). **Локально до R2 не достучаться — загрузку проверять на проде.** На Vercel должны быть заданы те же `S3_*`.

## Стек

Next.js 16 + TypeScript + Tailwind v4 + Prisma 6 + SQLite. Без сторонних UI-библиотек — вся дизайн-система своя в `globals.css`.

## Архитектура и конвенции

- **Server Components по умолчанию.** Данные читаются напрямую через Prisma в серверных компонентах страниц. `"use client"` — только там, где нужна интерактивность (сейчас: `src/components/nav.tsx`).
- **Мутации — только через Server Actions** в `src/lib/actions.ts` (`"use server"`). После мутации — `revalidatePath`. Формы — нативные `<form action={...}>`, без клиентского состояния, где можно.
- На всех страницах с данными: `export const dynamic = "force-dynamic"`.
- Хелперы форматирования и словари статусов — в `src/lib/format.ts`. Все подписи статусов/этапов брать ТОЛЬКО оттуда, не хардкодить в компонентах.
- Prisma-клиент — только через синглтон `src/lib/prisma.ts`.
- Деньги — **Prisma `Decimal` / Postgres `NUMERIC(12,2)`**, читаются как `Prisma.Decimal`. НИКАКОГО JS-float для денег. Сравнения — `.gte(0)`/`.gt(0)`, суммирование — хелпер `sumMoney` из `format.ts`. Форматирование — `fmtMoney` (принимает Decimal|number) → `€ 12.500,00`.
- **Вся денежная арифметика — только в `src/lib/finance.ts`** (австрийские налоги: Differenzbesteuerung `USt = max(0, продажа−einkauf24)×20/120`, Regelbesteuerung, план/факт). Округление half-up до цента. В компонентах арифметики денег быть НЕ должно. Формулы покрыты `finance.test.ts` (vitest, кейсы §24.1). `format.ts` (carCost/carMargin/dealMargin/carPlannedFinance) — тонкие адаптеры Prisma→finance.
- **Владелец e.U.→OG (§9):** `currentOwner` = MOTORHOF_OG | MRIYA_MOTORS | A_MOTORS | AUTOHUB (`isPartnerOwner`). Для партнёрских авто себестоимость MOTORHOF OG считается от ВНУТРЕННЕГО Verkaufspreis (`actualInternalTransferPrice ?? plannedInternalTransferPrice`), НЕ от `purchasePrice` — единая точка `ogAcquisitionBasis` в `format.ts` (её же использует и §24-база OG). Результат поставщика (`supplierFinance`) и результат OG считаются РАЗДЕЛЬНО, не смешиваются. Внутренние цифры (внутр. Verkaufspreis, результаты компаний, № счёта) — под капабилити `see.internalPrice` (ADMIN/PARTNER), redaction server-side как обычно. Партнёрские поля значимы только для партнёрских владельцев; для MOTORHOF_OG зануляются в `ownerDataFromForm`. Продажа партнёрского авто без завершённого внутр. счёта (факт. цена + номер, `internalInvoiceComplete`) → `awaitingInternalInvoice=true` + баннер, статус остаётся SOLD (без нового статуса).
- **Миграции — только `prisma migrate`** (НЕ `db push`). Рабочий процесс на хостинге без shadow-базы: снять копию старой схемы → `migrate diff --from-schema-datamodel old --to-schema-datamodel new --script` → руками добавить backfill → `migrate deploy`. `_prisma_migrations` уже инициализирована, baseline `0_init` помечен applied. Прод и локаль — одна база, поэтому `migrate deploy` из локали обновляет и прод.
- Статусы и этапы — строковые enum-ы: значения см. в `format.ts` (CAR_STATUS — 8 складских статусов §6.1, DEAL_STAGES, CLIENT_TYPE, DEAL_TYPE, TAX_SCHEME…). Наборы статусов по ролям — `SALES_STATUS_SET`/`TECH_STATUS_SET` (единый источник для actions и UI). Новые значения добавлять синхронно в схему-логику-словари.
- **Учётный код авто:** `mhNumber` (autoincrement, НЕИЗМЕНЯЕМ) + `parkingRow`/`parkingSpot`; форматтеры `mhCode`/`internalCode` (`A-12 / MH-0042`). Уникальность активного места — частичный уникальный индекс в миграции (Prisma его не выражает; при изменении править SQL руками). История мест — `ParkingMove`.
- Себестоимость авто = `purchasePrice + sum(expenses)`. Маржа = `deal.amount − себестоимость`. Эта логика должна считаться одинаково везде (дашборд, карточка авто, сделки) — при изменении выноси в общий хелпер.

## Дизайн-система (не отступать)

- **КРИТИЧНО: любой новый CSS-класс писать внутри `@layer base` или `@layer components`.** Tailwind v4 держит утилиты в слое `utilities`, а неслоёный CSS перебивает любой слой. Класс `.field { width: 100% }` вне слоя молча ломает `w-[130px]`, `px-*`, `text-*` на том же элементе — баг незаметный, ловится только замером в браузере.
- Бренд **MOTORHOF**: тёмная тема, фон `#0a0b0d`, первичный акцент — warm white `#f6f3f2` (кнопки, активный пункт, фокус, ссылки). Графит `#3b3f42` — текст на светлых плитках (логотип). Янтаря НЕТ. Зелёный/синий/красный — только функциональные статусы (маржа, чипы). Без градиентов, тяжёлых теней, декоративных подсветок. Все токены — CSS-переменные в `globals.css`.
- Шрифты через `next/font`: Manrope (текст), Unbounded (заголовки/лого, класс `font-[family-name:var(--font-unbounded)]`), JetBrains Mono (числа/VIN/деньги, класс `mono`).
- Готовые классы: `.panel`, `.panel-hover`, `.chip chip-green|amber|blue|red|muted`, `.field`, `.label`, `.btn btn-primary|ghost|danger`, `.table`, `.animate-in delay-1..5`.
- Все суммы и числовые колонки — классом `mono`. Статусы — только чипами.
- Язык интерфейса — русский; валюта EUR (`de-AT`), даты `DD.MM.YYYY` (`de-AT`), часовой пояс `Europe/Vienna`. Австрийские термины — по-немецки (Pickerl, Differenzbesteuerung, Gewährleistung…).

## Проверка качества (перед каждым коммитом)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Плюс ручная проверка затронутого сценария в браузере (dev-сервер: `npm run dev`, порт 3000).

## Git

Коммит после каждого завершённого этапа DEVPLAN. Сообщения на русском: `этап 2: учёт автомобилей`.
