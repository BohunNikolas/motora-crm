import { Prisma } from "@prisma/client";
import {
  computeVehicleFinance,
  dec,
  round2,
  Decimal,
  type Dec,
  type TaxScheme,
  type VehicleFinanceResult,
} from "./finance";

type Num = Prisma.Decimal | number;

/** Сумма денег (Decimal), пропуская null. Единый способ складывать суммы в UI. */
export const sumMoney = (values: (Prisma.Decimal | number | null | undefined)[]): Dec =>
  values.reduce<Dec>((s, v) => (v == null ? s : s.plus(dec(v))), new Decimal(0));

// Валюта CRM — EUR, формат de-AT: «€ 12.500,00». Существующие числа НЕ
// конвертируются по курсу — просто отображаются как EUR (Требования §3.3).
const eurFmt = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
export const fmtMoney = (n: Num) =>
  eurFmt.format(typeof n === "number" ? n : n.toNumber());

// Даты — DD.MM.YYYY, часовой пояс Europe/Vienna.
const dateFmt = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Vienna",
});
export const fmtDate = (d: Date | string) => dateFmt.format(new Date(d));
export const fmtDateFull = fmtDate;

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
// Все расчёты делегируются в finance.ts (австрийские налоговые формулы §12).
// Здесь только адаптеры Prisma-модели → finance-вход и удобные обёртки.

export type CarExpenseLike = {
  amountGross: Prisma.Decimal;
  amountNet: Prisma.Decimal | null;
  deductibleInputVatAmount: Prisma.Decimal | null;
  alreadyIncludedInAcquisitionCost: boolean;
};

export type CarForFinance = {
  taxScheme: string;
  purchasePrice: Prisma.Decimal;
  listPrice: Prisma.Decimal;
  einkaufspreisGemaess24: Prisma.Decimal | null;
  plannedSalePriceGross: Prisma.Decimal | null;
  expenses: CarExpenseLike[];
};

const financeInput = (car: CarForFinance, salePriceGross: Num) => ({
  taxScheme: car.taxScheme as TaxScheme,
  totalCashAcquisitionCost: car.purchasePrice,
  einkaufspreisGemaess24: car.einkaufspreisGemaess24 ?? car.purchasePrice,
  salePriceGross,
  expenses: car.expenses.map((e) => ({
    amountGross: e.amountGross,
    amountNet: e.amountNet,
    deductibleInputVatAmount: e.deductibleInputVatAmount,
    alreadyIncludedInAcquisitionCost: e.alreadyIncludedInAcquisitionCost,
  })),
});

/** Себестоимость (кэш на входе): закупка + расходы, не входящие в неё. */
export const carCost = (car: CarForFinance): Dec =>
  round2(
    car.expenses
      .filter((e) => !e.alreadyIncludedInAcquisitionCost)
      .reduce((s, e) => s.plus(dec(e.amountGross)), dec(car.purchasePrice))
  );

/** Плановая финансовая картина: цена = plannedSalePriceGross ?? listPrice. */
export const carPlannedFinance = (car: CarForFinance): VehicleFinanceResult =>
  computeVehicleFinance(financeInput(car, car.plannedSalePriceGross ?? car.listPrice));

/** Фактическая по конкретной цене продажи (проданные авто, дашборд). */
export const carActualFinance = (car: CarForFinance, salePriceGross: Num): VehicleFinanceResult =>
  computeVehicleFinance(financeInput(car, salePriceGross));

/** Плановая финальная маржа (с учётом налога). */
export const carMargin = (car: CarForFinance): Dec => carPlannedFinance(car).finalMargin;

/** Фактическая финальная маржа по сумме сделки; null если авто/суммы нет. */
export const dealMargin = (
  amount: Prisma.Decimal | null,
  car: CarForFinance | null
): Dec | null => (car && amount != null ? carActualFinance(car, amount).finalMargin : null);

/** Наценка к себестоимости, %. */
export const markupPct = (car: CarForFinance): number => {
  const cost = carCost(car);
  return cost.gt(0) ? Math.round(carMargin(car).div(cost).times(100).toNumber()) : 0;
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

// ─── Австрийские справочники (§9, §10). Немецкие термины сохранены. ─────

export const TAX_SCHEME: Record<string, string> = {
  DIFFERENZBESTEUERUNG: "Differenzbesteuerung",
  REGELBESTEUERUNG: "Regelbesteuerung",
  UNGEKLAERT: "Не определён",
};
export const TAX_SCHEME_ORDER = ["DIFFERENZBESTEUERUNG", "REGELBESTEUERUNG", "UNGEKLAERT"];

export const PURCHASE_CHANNEL: Record<string, string> = {
  PRIVAT: "Privat",
  AUKTION: "Auktion",
  HAENDLER: "Händler",
  INZAHLUNGNAHME: "Inzahlungnahme (трейд-ин)",
  IMPORT: "Import",
};

export const CURRENT_OWNER: Record<string, string> = {
  MOTORHOF_OG: "MOTORHOF OG",
  MRIYA_MOTORS: "Mriya Motors",
  A_MOTORS: "A Motors",
  AUTOHUB: "AutoHub",
};
