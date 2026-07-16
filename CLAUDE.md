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
- База: SQLite (`prisma/dev.db`) для разработки. При деплое — Postgres (Neon), меняется только `datasource` в схеме.

## Стек

Next.js 16 + TypeScript + Tailwind v4 + Prisma 6 + SQLite. Без сторонних UI-библиотек — вся дизайн-система своя в `globals.css`.

## Архитектура и конвенции

- **Server Components по умолчанию.** Данные читаются напрямую через Prisma в серверных компонентах страниц. `"use client"` — только там, где нужна интерактивность (сейчас: `src/components/nav.tsx`).
- **Мутации — только через Server Actions** в `src/lib/actions.ts` (`"use server"`). После мутации — `revalidatePath`. Формы — нативные `<form action={...}>`, без клиентского состояния, где можно.
- На всех страницах с данными: `export const dynamic = "force-dynamic"`.
- Хелперы форматирования и словари статусов — в `src/lib/format.ts`. Все подписи статусов/этапов брать ТОЛЬКО оттуда, не хардкодить в компонентах.
- Prisma-клиент — только через синглтон `src/lib/prisma.ts`.
- Деньги хранятся в **целых долларах** (Int), форматируются `fmtMoney`.
- Статусы и этапы — строковые enum-ы (SQLite не умеет native enum): значения см. в `format.ts` (CAR_STATUS, DEAL_STAGES, CLIENT_TYPE, DEAL_TYPE). Новые значения добавлять синхронно в схему-логику-словари.
- Себестоимость авто = `purchasePrice + sum(expenses)`. Маржа = `deal.amount − себестоимость`. Эта логика должна считаться одинаково везде (дашборд, карточка авто, сделки) — при изменении выноси в общий хелпер.

## Дизайн-система (не отступать)

- **КРИТИЧНО: любой новый CSS-класс писать внутри `@layer base` или `@layer components`.** Tailwind v4 держит утилиты в слое `utilities`, а неслоёный CSS перебивает любой слой. Класс `.field { width: 100% }` вне слоя молча ломает `w-[130px]`, `px-*`, `text-*` на том же элементе — баг незаметный, ловится только замером в браузере.
- Тёмная тема, фон `#0a0b0d`, акцент — янтарный `#f2a33c`. Все токены — CSS-переменные в `globals.css`.
- Шрифты через `next/font`: Manrope (текст), Unbounded (заголовки/лого, класс `font-[family-name:var(--font-unbounded)]`), JetBrains Mono (числа/VIN/деньги, класс `mono`).
- Готовые классы: `.panel`, `.panel-hover`, `.chip chip-green|amber|blue|red|muted`, `.field`, `.label`, `.btn btn-primary|ghost|danger`, `.table`, `.animate-in delay-1..5`.
- Все суммы и числовые колонки — классом `mono`. Статусы — только чипами.
- Язык интерфейса — русский, даты `ru-RU`.

## Проверка качества (перед каждым коммитом)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npx tsc --noEmit && npm run lint && npm run build
```

Плюс ручная проверка затронутого сценария в браузере (dev-сервер: `npm run dev`, порт 3000).

## Git

Коммит после каждого завершённого этапа DEVPLAN. Сообщения на русском: `этап 2: учёт автомобилей`.
