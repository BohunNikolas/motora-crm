import { describe, it, expect } from "vitest";
import {
  differenzUst,
  round2,
  dec,
  computeVehicleFinance,
  type VehicleFinanceInput,
} from "./finance";

// Хелпер: деньги сравниваем как строку с двумя знаками, чтобы не зависеть от
// внутреннего представления Decimal.
const eur = (d: { toFixed: (n: number) => string }) => d.toFixed(2);

describe("Differenzbesteuerung (Требования §24.1)", () => {
  it("Privat 10 000 → продажа 12 000 → USt 333.33, маржа до расходов 1 666.67", () => {
    const input: VehicleFinanceInput = {
      taxScheme: "DIFFERENZBESTEUERUNG",
      totalCashAcquisitionCost: 10000,
      einkaufspreisGemaess24: 10000,
      salePriceGross: 12000,
    };
    const r = computeVehicleFinance(input);
    expect(eur(r.vatAmount)).toBe("333.33");
    expect(eur(r.marginBeforeExpenses)).toBe("1666.67");
    expect(eur(r.finalMargin)).toBe("1666.67");
    expect(r.isConfirmed).toBe(true);
  });

  it("Auktion: Fahrzeugpreis 10 000, счёт 10 800, продажа 12 000 → USt 333.33, маржа 866.67", () => {
    const input: VehicleFinanceInput = {
      taxScheme: "DIFFERENZBESTEUERUNG",
      totalCashAcquisitionCost: 10800, // Auktionsrechnung gesamt
      einkaufspreisGemaess24: 10000, // Fahrzeugpreis
      salePriceGross: 12000,
    };
    const r = computeVehicleFinance(input);
    expect(eur(r.vatAmount)).toBe("333.33");
    expect(eur(r.marginBeforeExpenses)).toBe("866.67");
  });

  it("продажа ниже Einkaufspreis §24 → USt 0, экономический убыток виден", () => {
    const r = computeVehicleFinance({
      taxScheme: "DIFFERENZBESTEUERUNG",
      totalCashAcquisitionCost: 10000,
      einkaufspreisGemaess24: 10000,
      salePriceGross: 9000,
    });
    expect(eur(r.vatAmount)).toBe("0.00");
    expect(eur(r.marginBeforeExpenses)).toBe("-1000.00");
    expect(r.finalMargin.lt(0)).toBe(true);
  });

  it("НЕ применяет наивную формулу (продажа − закупка) × 0.2", () => {
    // Наивно было бы (12000−10000)×0.2 = 400. Правильно: 333.33.
    const r = computeVehicleFinance({
      taxScheme: "DIFFERENZBESTEUERUNG",
      totalCashAcquisitionCost: 10000,
      einkaufspreisGemaess24: 10000,
      salePriceGross: 12000,
    });
    expect(eur(r.vatAmount)).not.toBe("400.00");
    expect(eur(r.vatAmount)).toBe("333.33");
  });
});

describe("Округление half-up (§24.1.4)", () => {
  it("round2 округляет .xx5 вверх", () => {
    expect(round2(dec("2.675")).toFixed(2)).toBe("2.68");
    expect(round2(dec("2.665")).toFixed(2)).toBe("2.67");
    expect(round2(dec("0.005")).toFixed(2)).toBe("0.01");
  });

  it("differenzUst округляет до цента", () => {
    // brutto-разница 0.03 → 0.03×20/120 = 0.005 → half-up → 0.01
    expect(differenzUst(10.03, 10).toFixed(2)).toBe("0.01");
    // 2000/6 = 333.3333… → 333.33
    expect(differenzUst(12000, 10000).toFixed(2)).toBe("333.33");
  });
});

describe("Двойной вычет комиссии (§24.1.5)", () => {
  it("расход с флагом alreadyIncludedInAcquisitionCost НЕ вычитается второй раз", () => {
    // Auktion: комиссия 800 уже в totalCash 10800
    const r = computeVehicleFinance({
      taxScheme: "DIFFERENZBESTEUERUNG",
      totalCashAcquisitionCost: 10800,
      einkaufspreisGemaess24: 10000,
      salePriceGross: 12000,
      expenses: [{ amountGross: 800, alreadyIncludedInAcquisitionCost: true }],
    });
    expect(eur(r.additionalExpenses)).toBe("0.00");
    expect(eur(r.finalMargin)).toBe("866.67");
  });

  it("расход БЕЗ флага уменьшает маржу", () => {
    const r = computeVehicleFinance({
      taxScheme: "DIFFERENZBESTEUERUNG",
      totalCashAcquisitionCost: 10800,
      einkaufspreisGemaess24: 10000,
      salePriceGross: 12000,
      expenses: [{ amountGross: 200, alreadyIncludedInAcquisitionCost: false }],
    });
    expect(eur(r.additionalExpenses)).toBe("200.00");
    expect(eur(r.finalMargin)).toBe("666.67"); // 866.67 − 200
  });
});

describe("Regelbesteuerung (§12.3, §24.1.6)", () => {
  it("явно заданная вычитаемая Vorsteuer", () => {
    const r = computeVehicleFinance({
      taxScheme: "REGELBESTEUERUNG",
      totalCashAcquisitionCost: 9600,
      einkaufspreisGemaess24: 9600,
      purchaseGross: 9600,
      confirmedDeductibleInputVat: 1600,
      salePriceGross: 12000,
    });
    expect(eur(r.vatAmount)).toBe("2000.00"); // outputVat 12000×20/120
    expect(eur(r.saleNet!)).toBe("10000.00");
    expect(eur(r.marginBeforeExpenses)).toBe("2000.00"); // 10000 − (9600−1600)
    expect(eur(r.finalMargin)).toBe("2000.00");
  });

  it("расход с вычитаемой Vorsteuer учитывается по netto", () => {
    const r = computeVehicleFinance({
      taxScheme: "REGELBESTEUERUNG",
      totalCashAcquisitionCost: 9600,
      einkaufspreisGemaess24: 9600,
      purchaseGross: 9600,
      confirmedDeductibleInputVat: 1600,
      salePriceGross: 12000,
      expenses: [
        { amountGross: 600, amountNet: 500, deductibleInputVatAmount: 100, alreadyIncludedInAcquisitionCost: false },
      ],
    });
    expect(eur(r.additionalExpenses)).toBe("500.00"); // netto, т.к. есть вычитаемая Vorsteuer
    expect(eur(r.finalMargin)).toBe("1500.00"); // 2000 − 500
  });
});

describe("UNGEKLAERT (§10.2)", () => {
  it("считается как Differenz, но помечается неподтверждённым", () => {
    const r = computeVehicleFinance({
      taxScheme: "UNGEKLAERT",
      totalCashAcquisitionCost: 10000,
      einkaufspreisGemaess24: 10000,
      salePriceGross: 12000,
    });
    expect(eur(r.finalMargin)).toBe("1666.67");
    expect(r.isConfirmed).toBe(false);
  });
});

describe("План/факт (§24.1.7)", () => {
  it("плановая и фактическая цена дают разную маржу", () => {
    const base = {
      taxScheme: "DIFFERENZBESTEUERUNG" as const,
      totalCashAcquisitionCost: 10000,
      einkaufspreisGemaess24: 10000,
    };
    const planned = computeVehicleFinance({ ...base, salePriceGross: 13000 });
    const actual = computeVehicleFinance({ ...base, salePriceGross: 12000 });
    expect(eur(planned.finalMargin)).toBe("2500.00"); // 13000−10000−500
    expect(eur(actual.finalMargin)).toBe("1666.67");
    expect(planned.finalMargin.gt(actual.finalMargin)).toBe(true);
  });
});
