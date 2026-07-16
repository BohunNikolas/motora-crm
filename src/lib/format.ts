export const fmtMoney = (n: number) => "$" + n.toLocaleString("ru-RU");

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

export const fmtDateFull = (d: Date | string) =>
  new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

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
