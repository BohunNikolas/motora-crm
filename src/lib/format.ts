export const fmtMoney = (n: number) => "$" + n.toLocaleString("ru-RU");

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

export const fmtDateFull = (d: Date | string) =>
  new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

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
