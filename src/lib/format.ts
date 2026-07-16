export const fmtMoney = (n: number) => "$" + n.toLocaleString("ru-RU");

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

export const fmtDateFull = (d: Date | string) =>
  new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

// ─── Сроки (единственный источник истины) ───────────────────────
// Срок задачи — это календарный день, а не момент времени.
// Поэтому всё сравнивается по локальной полуночи.

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const isOverdue = (due: Date | null) => !!due && new Date(due) < startOfToday();

/** Русское склонение: 1 день, 2 дня, 5 дней */
const plural = (n: number, forms: [string, string, string]) => {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
};

/** Человеческий срок: «сегодня», «завтра», «просрочено на 3 дня» */
export const dueLabel = (due: Date | null) => {
  if (!due) return "без срока";
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  if (days < 0) return `просрочено на ${-days} ${plural(-days, ["день", "дня", "дней"])}`;
  if (days <= 7) return `через ${days} ${plural(days, ["день", "дня", "дней"])}`;
  return fmtDate(due);
};

// ─── Экономика авто (единственный источник истины) ──────────────
// Себестоимость = закупка + все расходы на подготовку.
// Ожидаемая маржа = цена продажи − себестоимость.
// Фактическая маржа = сумма сделки − себестоимость.

type CarCost = { purchasePrice: number; expenses: { amount: number }[] };

export const carCost = (car: CarCost) =>
  car.purchasePrice + car.expenses.reduce((s, e) => s + e.amount, 0);

export const carMargin = (car: CarCost & { listPrice: number }) =>
  car.listPrice - carCost(car);

export const dealMargin = (amount: number | null, car: CarCost | null) =>
  car && amount != null ? amount - carCost(car) : null;

/** Наценка к себестоимости в процентах */
export const markupPct = (car: CarCost & { listPrice: number }) => {
  const cost = carCost(car);
  return cost > 0 ? Math.round((carMargin(car) / cost) * 100) : 0;
};

// ─── Справочники ────────────────────────────────────────────────

export const TRANSMISSIONS = ["АКПП", "МКПП", "Робот", "Вариатор"];
export const FUELS = ["Бензин", "Дизель", "Гибрид", "Электро", "Газ/бензин"];
export const SOURCES = ["Авито", "Авто.ру", "Рекомендация", "Сайт", "Проходящий", "Другое"];

export const CAR_STATUS: Record<string, { label: string; cls: string }> = {
  PREP: { label: "Подготовка", cls: "chip-amber" },
  AVAILABLE: { label: "В наличии", cls: "chip-green" },
  RESERVED: { label: "Бронь", cls: "chip-blue" },
  SOLD: { label: "Продан", cls: "chip-muted" },
};

export const CAR_STATUS_ORDER = ["PREP", "AVAILABLE", "RESERVED", "SOLD"];

export const DEAL_STAGES: { key: string; label: string }[] = [
  { key: "NEW", label: "Новый лид" },
  { key: "CONTACT", label: "Контакт" },
  { key: "TEST_DRIVE", label: "Тест-драйв" },
  { key: "NEGOTIATION", label: "Торг" },
  { key: "CONTRACT", label: "Договор" },
  { key: "DONE", label: "Закрыта" },
];

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  [...DEAL_STAGES, { key: "LOST", label: "Потеряна" }].map((s) => [s.key, s.label])
);

export const CLIENT_TYPE: Record<string, string> = {
  BUYER: "Покупатель",
  SELLER: "Продавец",
  BOTH: "Покупатель и продавец",
};

export const DEAL_TYPE: Record<string, string> = {
  SALE: "Продажа",
  PURCHASE: "Закупка",
  TRADE_IN: "Трейд-ин",
};
