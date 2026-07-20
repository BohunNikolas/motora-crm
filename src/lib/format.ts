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
  // Kostenvoranschlag: PENDING-сметы НЕ входят в себестоимость и маржу,
  // пока PARTNER/ADMIN не подтвердит (roles-motorhof.md §2).
  approvalStatus: string;
};

const approvedOnly = (expenses: CarExpenseLike[]) =>
  expenses.filter((e) => e.approvalStatus === "APPROVED");

export type CarForFinance = {
  taxScheme: string;
  purchasePrice: Prisma.Decimal;
  listPrice: Prisma.Decimal;
  einkaufspreisGemaess24: Prisma.Decimal | null;
  plannedSalePriceGross: Prisma.Decimal | null;
  expenses: CarExpenseLike[];
  // §9: для партнёрских авто себестоимость MOTORHOF OG считается от внутреннего
  // Verkaufspreis e.U.→OG (actual ?? planned), а НЕ от purchasePrice.
  currentOwner: string;
  actualInternalTransferPrice: Prisma.Decimal | null;
  plannedInternalTransferPrice: Prisma.Decimal | null;
  // §11.2 Auktion: базой приобретения служит Auktionsrechnung gesamt,
  // §24-Einkaufspreis по умолчанию — Fahrzeugpreis (не invoiceTotal!).
  purchaseChannel: string | null;
  auctionInvoiceTotal: Prisma.Decimal | null;
  auctionVehiclePrice: Prisma.Decimal | null;
  // §11.4 Inzahlungnahme: базой приобретения служит зачётная стоимость.
  tradeInCreditValue: Prisma.Decimal | null;
};

/**
 * Базис приобретения MOTORHOF OG. Приоритет:
 *  1) партнёрское авто (§9) — внутренний Verkaufspreis e.U.→OG (факт ?? план);
 *  2) Auktion (§11.2) — Auktionsrechnung gesamt;
 *  3) Inzahlungnahme (§11.4) — зачётная стоимость;
 *  4) иначе (Privat/Händler/Import) — purchasePrice.
 * Это totalCashAcquisitionCost; §24-Einkaufspreis считается отдельно (см. financeInput).
 */
export const ogAcquisitionBasis = (car: CarForFinance): Dec => {
  if (isPartnerOwner(car.currentOwner)) {
    const internal = car.actualInternalTransferPrice ?? car.plannedInternalTransferPrice;
    if (internal != null) return dec(internal);
  }
  if (car.purchaseChannel === "AUKTION" && car.auctionInvoiceTotal != null) {
    return dec(car.auctionInvoiceTotal);
  }
  if (car.purchaseChannel === "INZAHLUNGNAHME" && car.tradeInCreditValue != null) {
    return dec(car.tradeInCreditValue);
  }
  return dec(car.purchasePrice);
};

/** §24-Einkaufspreis для расчётов OG (Differenzbesteuerung). */
const ogEinkauf24 = (car: CarForFinance, basis: Dec): Dec => {
  // Партнёрское авто: §24-база = внутренний счёт (совпадает с basis).
  if (isPartnerOwner(car.currentOwner)) return basis;
  // Auktion: §24 по умолчанию = Fahrzeugpreis, НЕ Auktionsrechnung gesamt (§11.2, §12.2).
  if (car.purchaseChannel === "AUKTION") {
    return dec(car.einkaufspreisGemaess24 ?? car.auctionVehiclePrice ?? basis);
  }
  return dec(car.einkaufspreisGemaess24 ?? basis);
};

const financeInput = (car: CarForFinance, salePriceGross: Num) => {
  const basis = ogAcquisitionBasis(car);
  return {
    taxScheme: car.taxScheme as TaxScheme,
    totalCashAcquisitionCost: basis,
    einkaufspreisGemaess24: ogEinkauf24(car, basis),
    salePriceGross,
    expenses: approvedOnly(car.expenses).map((e) => ({
      amountGross: e.amountGross,
      amountNet: e.amountNet,
      deductibleInputVatAmount: e.deductibleInputVatAmount,
      alreadyIncludedInAcquisitionCost: e.alreadyIncludedInAcquisitionCost,
    })),
  };
};

/** Себестоимость OG: базис приобретения + подтверждённые расходы OG, не входящие в него. */
export const carCost = (car: CarForFinance): Dec =>
  round2(
    approvedOnly(car.expenses)
      .filter((e) => !e.alreadyIncludedInAcquisitionCost)
      .reduce((s, e) => s.plus(dec(e.amountGross)), ogAcquisitionBasis(car))
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

// ─── Владелец и внутренняя продажа e.U. → OG (§9) ────────────────
// Три партнёрские компании поставляют авто в MOTORHOF OG через внутренний счёт.
// Результаты поставщика и OG считаются РАЗДЕЛЬНО и не смешиваются.

export const PARTNER_OWNERS = ["MRIYA_MOTORS", "A_MOTORS", "AUTOHUB"] as const;
export const isPartnerOwner = (owner: string): boolean =>
  (PARTNER_OWNERS as readonly string[]).includes(owner);

export const INTERNAL_INVOICE_PAYMENT: Record<string, string> = {
  OPEN: "Не оплачен",
  PAID: "Оплачен",
};

export type CarForOwner = {
  currentOwner: string;
  partnerPurchasePrice: Prisma.Decimal | null;
  partnerAcquisitionCost: Prisma.Decimal | null;
  plannedInternalTransferPrice: Prisma.Decimal | null;
  actualInternalTransferPrice: Prisma.Decimal | null;
  internalInvoiceTaxScheme: string | null;
};

/**
 * Результат поставляющей компании (e.U./AutoHub) по внутренней продаже в OG (§9).
 * Продажа поставщика = внутренний Verkaufspreis (фактический, иначе плановый);
 * себестоимость поставщика = partnerAcquisitionCost; §24-база = partnerPurchasePrice;
 * налоговый режим — режим ВНУТРЕННЕГО счёта (не путать с режимом продажи OG клиенту).
 * null — если авто не партнёрское или внутренняя цена ещё не задана.
 */
export const supplierFinance = (car: CarForOwner): VehicleFinanceResult | null => {
  if (!isPartnerOwner(car.currentOwner)) return null;
  const internalSale = car.actualInternalTransferPrice ?? car.plannedInternalTransferPrice;
  if (internalSale == null) return null;
  const acqCost = car.partnerAcquisitionCost ?? car.partnerPurchasePrice ?? new Decimal(0);
  const einkauf24 = car.partnerPurchasePrice ?? car.partnerAcquisitionCost ?? new Decimal(0);
  return computeVehicleFinance({
    taxScheme: (car.internalInvoiceTaxScheme as TaxScheme) ?? "UNGEKLAERT",
    totalCashAcquisitionCost: acqCost,
    einkaufspreisGemaess24: einkauf24,
    salePriceGross: internalSale,
    expenses: [],
  });
};

/**
 * Внутренний счёт e.U.→OG «завершён» — есть фактический внутренний Verkaufspreis
 * и номер счёта (§9). От этого зависит блокировка/пометка при переводе в SOLD.
 */
export const internalInvoiceComplete = (car: {
  actualInternalTransferPrice: Prisma.Decimal | null;
  internalInvoiceNumber: string | null;
}): boolean => car.actualInternalTransferPrice != null && !!car.internalInvoiceNumber;

// ─── Financial snapshot продажи (§18.2) ─────────────────────────
// Замораживает финрасчёт на момент продажи: смена настроек ставки/цен позже
// НЕ меняет историческую маржу. Деньги — строки (JSON-стабильно, без float).

export type SaleSnapshot = {
  taxScheme: string;
  vatLabel: string;
  acquisitionBasis: string;
  salePriceGross: string;
  vatAmount: string;
  cost: string;
  marginBeforeExpenses: string;
  finalMargin: string;
  isConfirmed: boolean;
};

export function buildSaleSnapshot(car: CarForFinance, salePriceGross: Num): SaleSnapshot {
  const fin = carActualFinance(car, salePriceGross);
  return {
    taxScheme: fin.taxScheme,
    vatLabel: car.taxScheme === "REGELBESTEUERUNG" ? "Ausgangs-USt" : "Differenz-USt",
    acquisitionBasis: ogAcquisitionBasis(car).toString(),
    salePriceGross: dec(salePriceGross).toString(),
    vatAmount: fin.vatAmount.toString(),
    cost: carCost(car).toString(),
    marginBeforeExpenses: fin.marginBeforeExpenses.toString(),
    finalMargin: fin.finalMargin.toString(),
    isConfirmed: fin.isConfirmed,
  };
}

// ─── Справочники ────────────────────────────────────────────────

export const TRANSMISSIONS = ["АКПП", "МКПП", "Робот", "Вариатор"];
export const FUELS = ["Бензин", "Дизель", "Гибрид", "Электро", "Газ/бензин"];
export const SOURCES = ["Авито", "Авто.ру", "Рекомендация", "Сайт", "Проходящий", "Другое"];

// 8 складских статусов (§6.1). Порядок = жизненный цикл авто.
export const CAR_STATUS: Record<string, { label: string; cls: string }> = {
  PURCHASED: { label: "Куплен", cls: "chip-muted" },
  IN_TRANSIT: { label: "В дороге", cls: "chip-blue" },
  IN_PREPARATION: { label: "В подготовке", cls: "chip-amber" },
  IN_SERVICE: { label: "В сервисе", cls: "chip-amber" },
  WAITING_FOR_PHOTOS: { label: "Ожидает фото", cls: "chip-amber" },
  READY_FOR_SALE: { label: "Готов к продаже", cls: "chip-green" },
  RESERVED: { label: "Бронь", cls: "chip-blue" },
  SOLD: { label: "Продан", cls: "chip-muted" },
  ARCHIVED: { label: "Архив", cls: "chip-muted" },
};

export const CAR_STATUS_ORDER = [
  "PURCHASED", "IN_TRANSIT", "IN_PREPARATION", "IN_SERVICE",
  "WAITING_FOR_PHOTOS", "READY_FOR_SALE", "RESERVED", "SOLD",
];

/** Статусы, при которых авто «на складе» (не продано, не архив). */
export const ACTIVE_STATUSES = CAR_STATUS_ORDER.filter((s) => s !== "SOLD");
export const isActiveStatus = (s: string) => s !== "SOLD" && s !== "ARCHIVED";

// Статусы по ролям (roles-motorhof.md) — единый источник для сервера (actions)
// и UI (кнопки статусов). ADMIN/PARTNER (edit.car) получают все из CAR_STATUS_ORDER.
export const SALES_STATUS_SET = ["WAITING_FOR_PHOTOS", "READY_FOR_SALE", "RESERVED", "SOLD"];
export const TECH_STATUS_SET = ["IN_PREPARATION", "IN_SERVICE", "WAITING_FOR_PHOTOS", "READY_FOR_SALE"];

/** Учётный код: «A-12 / MH-0042» или «— / MH-0042», если места ещё нет (§7). */
export const mhCode = (mhNumber: number) => `MH-${String(mhNumber).padStart(4, "0")}`;
export const parkingLabel = (row: string | null, spot: number | null) =>
  row && spot != null ? `${row}-${spot}` : "—";
export const internalCode = (car: { mhNumber: number; parkingRow: string | null; parkingSpot: number | null }) =>
  `${parkingLabel(car.parkingRow, car.parkingSpot)} / ${mhCode(car.mhNumber)}`;

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
export const PURCHASE_CHANNEL_ORDER = ["PRIVAT", "AUKTION", "HAENDLER", "INZAHLUNGNAHME", "IMPORT"];

// Import (§11.5)
export const IMPORT_ZONE: Record<string, string> = { EU: "EU", DRITTLAND: "Drittland" };
// Inzahlungnahme (§11.4): кто доплачивает разницу
export const SURCHARGE_BY: Record<string, string> = {
  CLIENT: "Доплачивает клиент",
  MOTORHOF: "Доплачивает MOTORHOF",
};

// ─── Бронь и продажа (§18) ──────────────────────────────────────

// Статусы, которые ставятся ТОЛЬКО через поток брони/продажи (§18), а не прямой
// кнопкой статуса — источник истины для UI и серверного guard в setCarStatus.
export const SALE_FLOW_STATUSES = ["RESERVED", "SOLD"];

export const SALE_STAGE: Record<string, { label: string; cls: string }> = {
  RESERVED: { label: "Бронь", cls: "chip-blue" },
  COMPLETED: { label: "Продано", cls: "chip-green" },
  CANCELLED: { label: "Отменена", cls: "chip-muted" },
};
export const PAYMENT_STATUS: Record<string, string> = {
  OPEN: "Не оплачено",
  PARTIAL: "Частично",
  PAID: "Оплачено",
};
export const PAYMENT_METHOD: Record<string, string> = {
  CASH: "Наличные",
  TRANSFER: "Перевод",
  FINANCING: "Финансирование",
  CARD: "Карта",
};
export const SALE_CATEGORY: Record<string, string> = {
  B2C: "B2C (частному лицу)",
  B2B: "B2B (юрлицу)",
  EXPORT: "Export",
};

/** Бронь просрочена: активна (RESERVED) и срок действия истёк (§18.1). */
export const reservationExpired = (
  sale: { stage: string; reservationExpiresAt: Date | null },
  now: Date = new Date()
): boolean =>
  sale.stage === "RESERVED" && sale.reservationExpiresAt != null && new Date(sale.reservationExpiresAt) < now;

/** Auktionsgebühr brutto = netto + USt (§11.2), справочно для отображения. */
export const auctionFeeGross = (car: {
  auctionFeeNet: Prisma.Decimal | null;
  auctionFeeVat: Prisma.Decimal | null;
}): Dec | null =>
  car.auctionFeeNet == null && car.auctionFeeVat == null
    ? null
    : sumMoney([car.auctionFeeNet, car.auctionFeeVat]);

/**
 * Проверка §11.2: Auktionsrechnung gesamt не может быть меньше Fahrzeugpreis
 * без admin override. true → нарушение (нужен override с причиной).
 */
export const auctionTotalBelowVehiclePrice = (car: {
  auctionInvoiceTotal: Prisma.Decimal | null;
  auctionVehiclePrice: Prisma.Decimal | null;
}): boolean =>
  car.auctionInvoiceTotal != null &&
  car.auctionVehiclePrice != null &&
  dec(car.auctionInvoiceTotal).lt(dec(car.auctionVehiclePrice));

export const CURRENT_OWNER: Record<string, string> = {
  MOTORHOF_OG: "MOTORHOF OG",
  MRIYA_MOTORS: "Mriya Motors",
  A_MOTORS: "A Motors",
  AUTOHUB: "AutoHub",
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Админ",
  PARTNER: "Партнёр",
  SALES: "Продажи",
  TECHNICAL: "Техника",
  READ_ONLY: "Просмотр",
};

// ─── Техническая карточка авто (§8) ─────────────────────────────

export const JA_NEIN_UNBEKANNT: Record<string, string> = {
  JA: "Да",
  NEIN: "Нет",
  UNBEKANNT: "Неизвестно",
};

export const SERVICEHEFT: Record<string, string> = {
  VOLLSTAENDIG: "Полная",
  TEILWEISE: "Частичная",
  DIGITAL: "Цифровая",
  NICHT_VORHANDEN: "Нет",
  UNBEKANNT: "Неизвестно",
};
export const SERVICEHEFT_ORDER = ["VOLLSTAENDIG", "TEILWEISE", "DIGITAL", "NICHT_VORHANDEN", "UNBEKANNT"];

// Части кузова для перекрасов (§8.3), структурно.
export const BODY_PARTS: { key: string; label: string }[] = [
  { key: "MOTORHAUBE", label: "Капот" },
  { key: "DACH", label: "Крыша" },
  { key: "HECKKLAPPE", label: "Крышка багажника" },
  { key: "STOSSFAENGER_V", label: "Бампер перед." },
  { key: "STOSSFAENGER_H", label: "Бампер задн." },
  { key: "KOTFLUEGEL_VL", label: "Крыло ПЛ" },
  { key: "KOTFLUEGEL_VR", label: "Крыло ПП" },
  { key: "KOTFLUEGEL_HL", label: "Крыло ЗЛ" },
  { key: "KOTFLUEGEL_HR", label: "Крыло ЗП" },
  { key: "TUER_VL", label: "Дверь ПЛ" },
  { key: "TUER_VR", label: "Дверь ПП" },
  { key: "TUER_HL", label: "Дверь ЗЛ" },
  { key: "TUER_HR", label: "Дверь ЗП" },
  { key: "SEITENTEIL_L", label: "Боковина Л" },
  { key: "SEITENTEIL_R", label: "Боковина П" },
  { key: "SONSTIGES", label: "Прочее" },
];
export const BODY_PART_LABEL: Record<string, string> = Object.fromEntries(
  BODY_PARTS.map((p) => [p.key, p.label])
);

// ─── Документы авто (§8.5) ──────────────────────────────────────

// financial: true → закупочный/внутренний документ, НЕ виден SALES/TECHNICAL (redaction).
export const DOC_TYPES: { key: string; label: string; financial: boolean }[] = [
  { key: "KAUFVERTRAG", label: "Kaufvertrag", financial: false },
  { key: "ANKAUFSRECHNUNG", label: "Ankaufsrechnung (закупочный счёт)", financial: true },
  { key: "ZULASSUNG", label: "Zulassungsschein", financial: false },
  { key: "GUTACHTEN_57A", label: "§57a-Gutachten", financial: false },
  { key: "AUKTIONSRECHNUNG", label: "Auktionsrechnung", financial: true },
  { key: "RECHNUNG_EU_OG", label: "Rechnung e.U. → OG", financial: true },
  { key: "UEBERGABE", label: "Документы выдачи", financial: false },
  { key: "SONSTIGES", label: "Прочее", financial: false },
];
export const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.key, d.label])
);
export const isFinancialDoc = (docType: string | null) =>
  DOC_TYPES.find((d) => d.key === docType)?.financial ?? false;

type CarForDocs = {
  purchaseChannel: string | null;
  pickerlVorhanden: string;
  currentOwner: string;
};

/**
 * Обязательные документы для авто (§8.5), с учётом канала/Pickerl/владельца.
 * Каждый пункт удовлетворяется любым из docTypes. `present` — есть ли такой
 * документ среди загруженных. Конфигурируемость (админ меняет обязательность) —
 * фаза 5 (Настройки); здесь — дефолтный набор.
 */
export function requiredDocs(car: CarForDocs, presentTypes: Set<string>) {
  const reqs: { label: string; satisfiedBy: string[] }[] = [
    { label: "Kaufvertrag / Ankaufsrechnung", satisfiedBy: ["KAUFVERTRAG", "ANKAUFSRECHNUNG"] },
    { label: "Zulassungsschein", satisfiedBy: ["ZULASSUNG"] },
  ];
  if (car.purchaseChannel === "AUKTION") {
    reqs.push({ label: "Auktionsrechnung", satisfiedBy: ["AUKTIONSRECHNUNG"] });
  }
  if (car.pickerlVorhanden === "JA") {
    reqs.push({ label: "§57a-Gutachten", satisfiedBy: ["GUTACHTEN_57A"] });
  }
  if (["MRIYA_MOTORS", "A_MOTORS", "AUTOHUB"].includes(car.currentOwner)) {
    reqs.push({ label: "Rechnung e.U. → OG", satisfiedBy: ["RECHNUNG_EU_OG"] });
  }
  return reqs.map((r) => ({
    label: r.label,
    present: r.satisfiedBy.some((t) => presentTypes.has(t)),
  }));
}

/**
 * «Pickerl требует внимания» (§8.4): нет Pickerl, срок уже наступил, либо
 * Begutachtungsmonat в текущем или следующем календарном месяце.
 * `now` параметром — для тестируемости.
 */
export function pickerlNeedsAttention(
  car: { pickerlVorhanden: string; pickerlMonth: number | null; pickerlYear: number | null },
  now: Date = new Date()
): boolean {
  if (car.pickerlVorhanden !== "JA") return true; // нет или неизвестно — внимание
  if (car.pickerlMonth == null || car.pickerlYear == null) return true;
  // индекс месяца: год*12 + (месяц-1)
  const target = car.pickerlYear * 12 + (car.pickerlMonth - 1);
  const cur = now.getFullYear() * 12 + now.getMonth();
  return target <= cur + 1; // прошло, текущий или следующий месяц
}
