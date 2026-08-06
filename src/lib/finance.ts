/**
 * Финансовый сервис MOTORHOF — ЕДИНСТВЕННЫЙ источник истины для денежных расчётов.
 *
 * Модель ценообразования (правки партии 1, 31.07.2026 — batch-1-plan.md):
 *  - финальная закупочная цена зависит от канала (Приват/Аукцион/Хендлер)
 *    и владельца (у партнёрских компаний добавляется фиктивная наценка);
 *  - дифф. НДС = (база) × ставка/100 — 20% СВЕРХУ разницы (утверждено В1,
 *    заменяет прежнее правило 20/120 «изнутри»);
 *  - Аукцион: база НДС — «цена автомобиля», не финальная закупочная;
 *  - Regelbesteuerung: план вводится НЕТТО, НДС = нетто × 20%, брутто = нетто + НДС;
 *  - маржа (Diff)  = план − дифф.НДС − финальная закупочная − расходы;
 *    маржа (Regel) = брутто − финальная закупочная − расходы (В10).
 *
 * Правки партии 2 (docs/TZ-DUAL-DIFF-VAT.md): для партнёрских владельцев на
 * Differenzbesteuerung расчёт ДВУХСТУПЕНЧАТЫЙ — авто юридически продаётся дважды
 * (e.U. → OG → клиент), и Differenz-НДС возникает на каждой ступени:
 *    ступень 1: НДС e.U. = (финальная закупочная − стоимость автомобиля) × ставка;
 *               передаточная цена = финальная закупочная + НДС e.U.
 *               (НДС переложен в цену — чистый заработок e.U. равен наценке);
 *    ступень 2: НДС OG = max(0, продажа − передаточная) × ставка.
 * Экономика при этом СКВОЗНАЯ по группе: маржа одна, наценка в ней не участвует
 * (деньги перетекают внутри группы) и влияет на результат только через НДС.
 *
 * Правила (Требования §2.6–2.8):
 *  - все суммы — Decimal (decimal.js через Prisma.Decimal), НИКАКОГО JS-float;
 *  - округление до 2 знаков по единому правилу half-up;
 *  - в компонентах денежной арифметики быть НЕ должно — только вызовы этих функций;
 *  - формулы покрыты юнит-тестами (finance.test.ts).
 */
import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;
export type Dec = Prisma.Decimal;
export type Money = Prisma.Decimal | number | string;

/** Ставка НДС по умолчанию, % (хранение в настройке — позже). */
export const VAT_RATE_DEFAULT = 20;

/**
 * Автоподбор фиктивной наценки e.U. (правки-2): процент от реальной закупки,
 * но не ниже пола, с округлением вверх до шага. Процент — «трейдерский интерес»
 * между независимыми компаниями (Fremdvergleich), пол — чтобы на дешёвых лотах
 * наценка не выглядела символической. Значение подставляется в форму и остаётся
 * редактируемым.
 */
export const MARKUP_RATE_PCT = 5;
export const MARKUP_MIN = 250;
export const MARKUP_ROUND_STEP = 10;

export const dec = (v: Money): Dec => new Decimal(v);

/** Единое округление до цента: half-up (Требования §2.8). */
export const round2 = (v: Dec): Dec => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** UNGEKLAERT — легаси: удалён из UI (В11), в данных мигрируется в Differenz. */
export type TaxScheme = "DIFFERENZBESTEUERUNG" | "REGELBESTEUERUNG" | "UNGEKLAERT";

/** Каналы закупки: Трейд-ин и Импорт удалены (В8). */
export type PricingChannel = "PRIVAT" | "AUKTION" | "HAENDLER";

/** Экономический вклад одного расхода в маржу. */
export interface FinanceExpense {
  amountGross: Money;
  /** Уже учтён в финальной закупочной — второй раз вычитать НЕЛЬЗЯ (§12.1). */
  alreadyIncludedInAcquisitionCost: boolean;
}

/** Сумма расходов, не включённых в закупочную (brutto). Единая для Diff и Regel. */
export function additionalExpensesGross(expenses: FinanceExpense[] = []): Dec {
  return expenses
    .filter((e) => !e.alreadyIncludedInAcquisitionCost)
    .reduce((sum, e) => sum.plus(dec(e.amountGross)), new Decimal(0));
}

/**
 * Разложение brutto-суммы на netto и USt по ставке (§14.1, форма расходов):
 * USt = gross × rate/(100+rate), net = gross − USt. Это арифметика брутто→нетто
 * для введённых брутто-сумм; к дифф. НДС отношения не имеет.
 */
export function splitGrossVat(amountGross: Money, vatRate: number = VAT_RATE_DEFAULT): { net: Dec; vat: Dec } {
  const gross = dec(amountGross);
  const vat = round2(gross.times(vatRate).div(100 + vatRate));
  return { net: round2(gross.minus(vat)), vat };
}

// ─── Ценообразование по каналу × владельцу ──────────────────────

export interface PricingInput {
  taxScheme: TaxScheme;
  channel: PricingChannel;
  /** Приват/Хендлер: закупочная цена. */
  purchasePrice?: Money | null;
  /** Аукцион: цена аукциона (общая стоимость). */
  auctionTotal?: Money | null;
  /** Аукцион: цена автомобиля — база для дифф. НДС. */
  auctionVehiclePrice?: Money | null;
  /** Аукцион: стоимость транспортировки. */
  transportCost?: Money | null;
  /** Фиктивная наценка — только партнёрские владельцы (AUTOHUB/A-MOTORS/MRIYA). */
  fictitiousMarkup?: Money | null;
  /**
   * Владелец — партнёрская компания e.U. (isPartnerOwner в format.ts).
   * Вместе с Differenzbesteuerung включает двухступенчатый расчёт НДС (правки-2).
   */
  isPartner?: boolean;
  /** Diff: плановая цена продажи (brutto). */
  plannedSalePriceGross?: Money | null;
  /** Regel: плановая цена продажи НЕТТО (брутто считается). */
  plannedSalePriceNet?: Money | null;
  vatRate?: number;
  expenses?: FinanceExpense[];
}

export interface PricingResult {
  taxScheme: TaxScheme;
  channel: PricingChannel;
  /** Финальная закупочная цена (по формуле канала, с фикт. наценкой у партнёров). */
  finalPurchasePrice: Dec;
  /** Реальные деньги, уплаченные за авто (закупка + транспорт), БЕЗ фикт. наценки. */
  realCost: Dec;
  /**
   * База себестоимости для сквозной экономики: у двухступенчатых — реальная
   * закупка (наценка внутри группы), иначе финальная закупочная.
   */
  costBasis: Dec;
  /** Аукционный сбор = цена аукциона − цена автомобиля (только AUKTION, иначе null). */
  auctionFee: Dec | null;
  /** Diff: дифф. НДС ((база)×ставка/100). Regel: НДС = нетто×ставка/100. У двухступенчатых — сумма ступеней. */
  vatAmount: Dec;
  /** Двухступенчатый расчёт (партнёрское авто на Differenz) — правки-2. */
  isTwoStage: boolean;
  /** Ступень 1: дифф. НДС e.U. с наценки и накладных (null у одноступенчатых). */
  vatEU: Dec | null;
  /** Ступень 2: дифф. НДС OG от передаточной цены (null у одноступенчатых). */
  vatOG: Dec | null;
  /** Цена внутреннего счёта e.U. → OG = финальная закупочная + НДС e.U. */
  transferPrice: Dec | null;
  /** Плановая цена продажи brutto (Diff — введена; Regel — нетто + НДС). */
  saleGross: Dec;
  /** Regel: нетто (введено). Diff: null. */
  saleNet: Dec | null;
  /** Сумма расходов, не входящих в закупочную. */
  additionalExpenses: Dec;
  /** Маржа: Diff = план − НДС − финальная − расходы; Regel = брутто − финальная − расходы. */
  finalMargin: Dec;
  /** Маржа до вычета расходов (для карточки). */
  marginBeforeExpenses: Dec;
  /** false для легаси UNGEKLAERT — сумму нельзя включать в подтверждённые итоги. */
  isConfirmed: boolean;
}

/** Аукционный сбор = цена аукциона − цена автомобиля (вычисляется, не вводится). */
export function auctionFee(auctionTotal: Money, vehiclePrice: Money): Dec {
  return round2(dec(auctionTotal).minus(dec(vehiclePrice)));
}

/**
 * Финальная закупочная цена:
 *  - Приват/Хендлер: закупочная (+ фикт. наценка у партнёров);
 *  - Аукцион: цена аукциона + транспортировка (+ фикт. наценка у партнёров).
 */
export function finalPurchasePrice(input: {
  channel: PricingChannel;
  purchasePrice?: Money | null;
  auctionTotal?: Money | null;
  transportCost?: Money | null;
  fictitiousMarkup?: Money | null;
}): Dec {
  const markup = dec(input.fictitiousMarkup ?? 0);
  if (input.channel === "AUKTION") {
    return round2(dec(input.auctionTotal ?? 0).plus(dec(input.transportCost ?? 0)).plus(markup));
  }
  return round2(dec(input.purchasePrice ?? 0).plus(markup));
}

/**
 * Реальная закупка — деньги, фактически уплаченные за авто, без фиктивной
 * наценки: Приват/Хендлер — закупочная; Аукцион — счёт аукциона + транспорт.
 */
export function realAcquisitionCost(input: {
  channel: PricingChannel;
  purchasePrice?: Money | null;
  auctionTotal?: Money | null;
  transportCost?: Money | null;
}): Dec {
  if (input.channel === "AUKTION") {
    return round2(dec(input.auctionTotal ?? 0).plus(dec(input.transportCost ?? 0)));
  }
  return round2(dec(input.purchasePrice ?? 0));
}

/**
 * Стоимость самого автомобиля — база, от которой считается дифф. НДС ступени 1:
 * Аукцион — цена автомобиля из инвойса (сбор и транспорт в неё не входят),
 * Приват/Хендлер — закупочная цена.
 */
export function vehicleBasePrice(input: {
  channel: PricingChannel;
  purchasePrice?: Money | null;
  auctionVehiclePrice?: Money | null;
}): Dec {
  return round2(
    dec((input.channel === "AUKTION" ? input.auctionVehiclePrice : input.purchasePrice) ?? 0)
  );
}

/** Автоподбор фиктивной наценки: % от реальной закупки, не ниже пола, вверх до шага. */
export function suggestedMarkup(realCost: Money): Dec {
  const pct = dec(realCost).times(MARKUP_RATE_PCT).div(100);
  const stepped = pct.div(MARKUP_ROUND_STEP).ceil().times(MARKUP_ROUND_STEP);
  return round2(Decimal.max(MARKUP_MIN, stepped));
}

/**
 * Дифф. НДС = max(0, база) × ставка/100 (В1: 20% СВЕРХУ разницы).
 * База: Приват/Хендлер — план − финальная закупочная; Аукцион — план − цена автомобиля.
 * Отрицательная база даёт 0 (НДС не бывает отрицательным — прежняя конвенция).
 */
export function differenzUst(
  plannedSaleGross: Money,
  vatBase: Money,
  vatRate: number = VAT_RATE_DEFAULT
): Dec {
  const diff = Decimal.max(0, dec(plannedSaleGross).minus(dec(vatBase)));
  return round2(diff.times(vatRate).div(100));
}

/** Regel: НДС = нетто × ставка/100; брутто = нетто + НДС (В10). */
export function regelVat(saleNet: Money, vatRate: number = VAT_RATE_DEFAULT): { vat: Dec; gross: Dec } {
  const net = dec(saleNet);
  const vat = round2(net.times(vatRate).div(100));
  return { vat, gross: round2(net.plus(vat)) };
}

/** Полный расчёт ценообразования и маржи авто. Единственная точка входа. */
export function computePricing(input: PricingInput): PricingResult {
  const rate = input.vatRate ?? VAT_RATE_DEFAULT;
  const fp = finalPurchasePrice(input);
  const real = realAcquisitionCost(input);
  const fee =
    input.channel === "AUKTION" && input.auctionTotal != null && input.auctionVehiclePrice != null
      ? auctionFee(input.auctionTotal, input.auctionVehiclePrice)
      : null;
  const additional = round2(additionalExpensesGross(input.expenses));

  if (input.taxScheme === "REGELBESTEUERUNG") {
    const net = dec(input.plannedSalePriceNet ?? 0);
    const { vat, gross } = regelVat(net, rate);
    // Маржа (Regel) = брутто − финальная закупочная − расходы (В10, НДС не вычитается).
    const before = round2(gross.minus(fp));
    return {
      taxScheme: input.taxScheme,
      channel: input.channel,
      finalPurchasePrice: fp,
      realCost: real,
      costBasis: fp,
      auctionFee: fee,
      vatAmount: vat,
      isTwoStage: false,
      vatEU: null,
      vatOG: null,
      transferPrice: null,
      saleGross: gross,
      saleNet: round2(net),
      additionalExpenses: additional,
      marginBeforeExpenses: before,
      finalMargin: round2(before.minus(additional)),
      isConfirmed: true,
    };
  }

  // Differenzbesteuerung (UNGEKLAERT — легаси, считается так же, но не подтверждён).
  const plan = dec(input.plannedSalePriceGross ?? 0);

  // ── Партнёрское авто: две продажи, два дифф. НДС (правки-2) ──
  if (input.isPartner) {
    const vehicleBase = vehicleBasePrice(input);
    // Ступень 1: база = наценка + накладные (сбор аукциона, транспорт),
    // т.е. всё, на что финальная закупочная превышает стоимость автомобиля.
    const vatEU = round2(Decimal.max(0, fp.minus(vehicleBase)).times(rate).div(100));
    // НДС ступени 1 переложен в цену внутреннего счёта — e.U. остаётся с наценкой.
    const transfer = round2(fp.plus(vatEU));
    // Ступень 2: OG «купила» у e.U. по передаточной цене — она и есть база.
    const vatOG = differenzUst(plan, transfer, rate);
    const vatTotal = round2(vatEU.plus(vatOG));
    // Маржа группы: наценка не вычитается — деньги остались внутри группы.
    const before = round2(plan.minus(vatTotal).minus(real));
    return {
      taxScheme: input.taxScheme,
      channel: input.channel,
      finalPurchasePrice: fp,
      realCost: real,
      costBasis: real,
      auctionFee: fee,
      vatAmount: vatTotal,
      isTwoStage: true,
      vatEU,
      vatOG,
      transferPrice: transfer,
      saleGross: round2(plan),
      saleNet: null,
      additionalExpenses: additional,
      marginBeforeExpenses: before,
      finalMargin: round2(before.minus(additional)),
      isConfirmed: input.taxScheme !== "UNGEKLAERT",
    };
  }

  const vatBase = input.channel === "AUKTION" ? dec(input.auctionVehiclePrice ?? 0) : fp;
  const ust = differenzUst(plan, vatBase, rate);
  const before = round2(plan.minus(ust).minus(fp));
  return {
    taxScheme: input.taxScheme,
    channel: input.channel,
    finalPurchasePrice: fp,
    realCost: real,
    costBasis: fp,
    auctionFee: fee,
    vatAmount: ust,
    isTwoStage: false,
    vatEU: null,
    vatOG: null,
    transferPrice: null,
    saleGross: round2(plan),
    saleNet: null,
    additionalExpenses: additional,
    marginBeforeExpenses: before,
    finalMargin: round2(before.minus(additional)),
    isConfirmed: input.taxScheme !== "UNGEKLAERT",
  };
}

// ─── Совместимость (легаси-интерфейс для адаптеров format.ts) ───
// VehicleFinanceResult — прежняя форма результата, на неё завязаны карточка,
// снапшот продажи и дашборд. computeVehicleFinance теперь тонкая обёртка
// над computePricing; полностью уйдёт в Э4 при перестройке карточки.

export interface VehicleFinanceResult {
  taxScheme: TaxScheme;
  vatAmount: Dec;
  saleNet: Dec | null;
  marginBeforeExpenses: Dec;
  additionalExpenses: Dec;
  finalMargin: Dec;
  isConfirmed: boolean;
}

export function toVehicleFinanceResult(p: PricingResult): VehicleFinanceResult {
  return {
    taxScheme: p.taxScheme,
    vatAmount: p.vatAmount,
    saleNet: p.saleNet,
    marginBeforeExpenses: p.marginBeforeExpenses,
    additionalExpenses: p.additionalExpenses,
    finalMargin: p.finalMargin,
    isConfirmed: p.isConfirmed,
  };
}
