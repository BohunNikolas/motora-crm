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
- Вход по общему паролю: `src/proxy.ts` + переменная `APP_PASSWORD`. Без переменной защита выключена — так удобно локально.

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
- **Миграции — только `prisma migrate`** (НЕ `db push`). Рабочий процесс на хостинге без shadow-базы: снять копию старой схемы → `migrate diff --from-schema-datamodel old --to-schema-datamodel new --script` → руками добавить backfill → `migrate deploy`. `_prisma_migrations` уже инициализирована, baseline `0_init` помечен applied. Прод и локаль — одна база, поэтому `migrate deploy` из локали обновляет и прод.
- Статусы и этапы — строковые enum-ы (наследие SQLite; менять на native enum сейчас незачем): значения см. в `format.ts` (CAR_STATUS, DEAL_STAGES, CLIENT_TYPE, DEAL_TYPE). Новые значения добавлять синхронно в схему-логику-словари.
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
