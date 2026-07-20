/**
 * Финансовый сервис MOTORHOF — ЕДИНСТВЕННЫЙ источник истины для денежных расчётов.
 *
 * Правила (Требования §2.6–2.8, §12):
 *  - все суммы — Decimal (decimal.js через Prisma.Decimal), НИКАКОГО JS-float;
 *  - округление до 2 знаков по единому правилу half-up;
 *  - в компонентах денежной арифметики быть НЕ должно — только вызовы этих функций;
 *  - формулы покрыты юнит-тестами (finance.test.ts) кейсами Требований §24.1.
 *
 * CRM не заменяет Steuerberater — это управленческий расчёт, но он обязан быть
 * математически корректным и проверяемым.
 */
import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;
export type Dec = Prisma.Decimal;
export type Money = Prisma.Decimal | number | string;

/** Ставка НДС по умолчанию, % (Требования §12.1; хранение в настройке — позже). */
export const VAT_RATE_DEFAULT = 20;

export const dec = (v: Money): Dec => new Decimal(v);

/** Единое округление до цента: half-up (Требования §2.8). */
export const round2 = (v: Dec): Dec => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export type TaxScheme = "DIFFERENZBESTEUERUNG" | "REGELBESTEUERUNG" | "UNGEKLAERT";

/** Экономический вклад одного расхода в маржу. */
export interface FinanceExpense {
  amountGross: Money;
  amountNet?: Money | null;
  /** Уже учтён в totalCashAcquisitionCost — второй раз вычитать НЕЛЬЗЯ (§12.1). */
  alreadyIncludedInAcquisitionCost: boolean;
  /** Подтверждённая вычитаемая Vorsteuer (только Regelbesteuerung). */
  deductibleInputVatAmount?: Money | null;
}

export interface VehicleFinanceInput {
  taxScheme: TaxScheme;
  vatRate?: number;
  /** Фактическая полная стоимость приобретения (Privat: цена; Auktion: сумма счёта). */
  totalCashAcquisitionCost: Money;
  /** §24 — Einkaufspreis для Differenzbesteuerung. */
  einkaufspreisGemaess24: Money;
  /** Brutto-цена покупки (для Regelbesteuerung). */
  purchaseGross?: Money;
  /** Подтверждённая вычитаемая входная Vorsteuer (Regelbesteuerung). */
  confirmedDeductibleInputVat?: Money;
  /** Цена продажи brutto: фактическая (продано) или плановая (в наличии). */
  salePriceGross: Money;
  expenses?: FinanceExpense[];
}

export interface VehicleFinanceResult {
  taxScheme: TaxScheme;
  /** Differenz-USt или Ausgangs-USt в зависимости от режима. */
  vatAmount: Dec;
  /** Только Regelbesteuerung. */
  saleNet: Dec | null;
  marginBeforeExpenses: Dec;
  additionalExpenses: Dec;
  finalMargin: Dec;
  /** false для UNGEKLAERT — сумму нельзя включать в подтверждённые итоги (§10.2). */
  isConfirmed: boolean;
}

/**
 * Differenz-USt = max(0, saleGross − einkaufspreis24) × rate / (100 + rate).
 * При 20%: brutto-разница / 6. USt уже СИДИТ в положительной brutto-разнице,
 * поэтому наивное (продажа − закупка) × 0.2 запрещено (§12.2).
 */
export function differenzUst(
  salePriceGross: Money,
  einkaufspreisGemaess24: Money,
  vatRate: number = VAT_RATE_DEFAULT
): Dec {
  const diff = Decimal.max(0, dec(salePriceGross).minus(dec(einkaufspreisGemaess24)));
  return round2(diff.times(vatRate).div(100 + vatRate));
}

/** Сумма расходов, не включённых в стоимость приобретения (brutto). */
function additionalExpensesGross(expenses: FinanceExpense[] = []): Dec {
  return expenses
    .filter((e) => !e.alreadyIncludedInAcquisitionCost)
    .reduce((sum, e) => sum.plus(dec(e.amountGross)), new Decimal(0));
}

function computeDifferenz(input: VehicleFinanceInput): VehicleFinanceResult {
  const rate = input.vatRate ?? VAT_RATE_DEFAULT;
  const ust = differenzUst(input.salePriceGross, input.einkaufspreisGemaess24, rate);

  const marginBeforeExpenses = round2(
    dec(input.salePriceGross).minus(dec(input.totalCashAcquisitionCost)).minus(ust)
  );
  const additional = round2(additionalExpensesGross(input.expenses));
  const finalMargin = round2(marginBeforeExpenses.minus(additional));

  return {
    taxScheme: "DIFFERENZBESTEUERUNG",
    vatAmount: ust,
    saleNet: null,
    marginBeforeExpenses,
    additionalExpenses: additional,
    finalMargin,
    isConfirmed: true,
  };
}

/**
 * Regelbesteuerung (§12.3): outputVat = saleGross × rate/(100+rate); saleNet = saleGross − outputVat.
 * Экономическая стоимость покупки = purchaseGross − подтверждённая вычитаемая Vorsteuer.
 * Vorsteuer НЕ выводится автоматически из ставки — берётся подтверждённое значение.
 */
function computeRegel(input: VehicleFinanceInput): VehicleFinanceResult {
  const rate = input.vatRate ?? VAT_RATE_DEFAULT;
  const outputVat = round2(dec(input.salePriceGross).times(rate).div(100 + rate));
  const saleNet = round2(dec(input.salePriceGross).minus(outputVat));

  const purchaseGross = dec(input.purchaseGross ?? input.totalCashAcquisitionCost);
  const deductible = dec(input.confirmedDeductibleInputVat ?? 0);
  const economicPurchaseCost = purchaseGross.minus(deductible);

  const marginBeforeExpenses = round2(saleNet.minus(economicPurchaseCost));

  // Экономическая величина расхода: netto, если по нему есть вычитаемая Vorsteuer, иначе brutto.
  const additional = round2(
    (input.expenses ?? [])
      .filter((e) => !e.alreadyIncludedInAcquisitionCost)
      .reduce((sum, e) => {
        const deductibleVat = dec(e.deductibleInputVatAmount ?? 0);
        const economic =
          e.amountNet != null && deductibleVat.gt(0)
            ? dec(e.amountNet)
            : dec(e.amountGross).minus(deductibleVat);
        return sum.plus(economic);
      }, new Decimal(0))
  );

  const finalMargin = round2(marginBeforeExpenses.minus(additional));

  return {
    taxScheme: "REGELBESTEUERUNG",
    vatAmount: outputVat,
    saleNet,
    marginBeforeExpenses,
    additionalExpenses: additional,
    finalMargin,
    isConfirmed: true,
  };
}

/** Диспетчер по налоговому режиму. UNGEKLAERT считается как Differenz, но помечается неподтверждённым. */
export function computeVehicleFinance(input: VehicleFinanceInput): VehicleFinanceResult {
  if (input.taxScheme === "REGELBESTEUERUNG") return computeRegel(input);
  const base = computeDifferenz(input);
  if (input.taxScheme === "UNGEKLAERT") {
    return { ...base, taxScheme: "UNGEKLAERT", isConfirmed: false };
  }
  return base;
}
