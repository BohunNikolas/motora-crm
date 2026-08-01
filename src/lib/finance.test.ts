import { describe, it, expect } from "vitest";
import {
  Decimal,
  dec,
  round2,
  splitGrossVat,
  additionalExpensesGross,
  auctionFee,
  finalPurchasePrice,
  differenzUst,
  regelVat,
  computePricing,
  type PricingInput,
} from "./finance";

const D = (v: number | string) => new Decimal(v);

// Базовый вход: Приват, Differenz, MOTORHOF (без наценки).
const base = (over: Partial<PricingInput> = {}): PricingInput => ({
  taxScheme: "DIFFERENZBESTEUERUNG",
  channel: "PRIVAT",
  purchasePrice: D(10000),
  plannedSalePriceGross: D(15000),
  ...over,
});

describe("Округление и разложение брутто (не менялись)", () => {
  it("round2 — half-up до цента", () => {
    expect(round2(dec("10.005")).toString()).toBe("10.01");
    expect(round2(dec("10.004")).toString()).toBe("10");
  });

  it("splitGrossVat: 360 брутто при 20% → нетто 300 + USt 60", () => {
    const { net, vat } = splitGrossVat(360);
    expect(net.toString()).toBe("300");
    expect(vat.toString()).toBe("60");
  });

  it("additionalExpensesGross: считаются только не включённые в закупочную", () => {
    const sum = additionalExpensesGross([
      { amountGross: 250, alreadyIncludedInAcquisitionCost: false },
      { amountGross: 300, alreadyIncludedInAcquisitionCost: true },
    ]);
    expect(sum.toString()).toBe("250");
  });
});

describe("Дифф. НДС — 20% СВЕРХУ разницы (В1)", () => {
  it("(15000 − 12000) × 0.2 = 600 (НЕ 500 по старой 20/120)", () => {
    expect(differenzUst(15000, 12000).toString()).toBe("600");
  });

  it("отрицательная база → 0 (НДС не бывает отрицательным)", () => {
    expect(differenzUst(8000, 10000).toString()).toBe("0");
  });

  it("копейки, half-up: база 0.05 → 0.01", () => {
    expect(differenzUst("10000.05", 10000).toString()).toBe("0.01");
  });
});

describe("Финальная закупочная цена и аукционный сбор", () => {
  it("Приват/Хендлер MOTORHOF: финальная = закупочная", () => {
    expect(finalPurchasePrice({ channel: "PRIVAT", purchasePrice: 10000 }).toString()).toBe("10000");
    expect(finalPurchasePrice({ channel: "HAENDLER", purchasePrice: 9000 }).toString()).toBe("9000");
  });

  it("Приват партнёр: финальная = закупочная + фиктивная наценка", () => {
    expect(
      finalPurchasePrice({ channel: "PRIVAT", purchasePrice: 10000, fictitiousMarkup: 1000 }).toString()
    ).toBe("11000");
  });

  it("Аукцион: финальная = цена аукциона + транспортировка (+ наценка)", () => {
    expect(
      finalPurchasePrice({ channel: "AUKTION", auctionTotal: 12000, transportCost: 300 }).toString()
    ).toBe("12300");
    expect(
      finalPurchasePrice({
        channel: "AUKTION", auctionTotal: 12000, transportCost: 300, fictitiousMarkup: 700,
      }).toString()
    ).toBe("13000");
  });

  it("аукционный сбор = цена аукциона − цена автомобиля", () => {
    expect(auctionFee(12000, 11000).toString()).toBe("1000");
  });
});

describe("computePricing — Differenzbesteuerung", () => {
  it("Приват MOTORHOF: закупка 10000, план 15000 → НДС 1000, маржа 4000", () => {
    const p = computePricing(base());
    expect(p.finalPurchasePrice.toString()).toBe("10000");
    expect(p.vatAmount.toString()).toBe("1000"); // (15000−10000)×0.2
    expect(p.finalMargin.toString()).toBe("4000"); // 15000−1000−10000
    expect(p.auctionFee).toBeNull();
    expect(p.saleNet).toBeNull();
    expect(p.isConfirmed).toBe(true);
  });

  it("Приват партнёр: наценка 1000 → финальная 11000, НДС 800, маржа 3200", () => {
    const p = computePricing(base({ fictitiousMarkup: D(1000) }));
    expect(p.finalPurchasePrice.toString()).toBe("11000");
    expect(p.vatAmount.toString()).toBe("800"); // (15000−11000)×0.2
    expect(p.finalMargin.toString()).toBe("3200"); // 15000−800−11000
  });

  it("Аукцион MOTORHOF: total 12000 / авто 11000 / транспорт 300 → сбор 1000, финальная 12300, НДС 800, маржа 1900", () => {
    const p = computePricing(
      base({ channel: "AUKTION", purchasePrice: null, auctionTotal: D(12000), auctionVehiclePrice: D(11000), transportCost: D(300) })
    );
    expect(p.auctionFee?.toString()).toBe("1000");
    expect(p.finalPurchasePrice.toString()).toBe("12300");
    // НДС от ЦЕНЫ АВТОМОБИЛЯ, не от финальной закупочной:
    expect(p.vatAmount.toString()).toBe("800"); // (15000−11000)×0.2
    expect(p.finalMargin.toString()).toBe("1900"); // 15000−800−12300
  });

  it("Аукцион партнёр: + наценка 700 → финальная 13000, НДС тот же 800, маржа 1200", () => {
    const p = computePricing(
      base({
        channel: "AUKTION", purchasePrice: null,
        auctionTotal: D(12000), auctionVehiclePrice: D(11000), transportCost: D(300), fictitiousMarkup: D(700),
      })
    );
    expect(p.finalPurchasePrice.toString()).toBe("13000");
    expect(p.vatAmount.toString()).toBe("800"); // база — цена автомобиля, наценка не влияет
    expect(p.finalMargin.toString()).toBe("1200"); // 15000−800−13000
  });

  it("Хендлер: формулы как у привата", () => {
    const p = computePricing(base({ channel: "HAENDLER", purchasePrice: D(9000), plannedSalePriceGross: D(12000) }));
    expect(p.vatAmount.toString()).toBe("600"); // (12000−9000)×0.2
    expect(p.finalMargin.toString()).toBe("2400"); // 12000−600−9000
  });

  it("расходы вычитаются из маржи", () => {
    const p = computePricing(
      base({ expenses: [
        { amountGross: 500, alreadyIncludedInAcquisitionCost: false },
        { amountGross: 999, alreadyIncludedInAcquisitionCost: true }, // не вычитается второй раз
      ]})
    );
    expect(p.additionalExpenses.toString()).toBe("500");
    expect(p.finalMargin.toString()).toBe("3500"); // 4000−500
  });

  it("план ниже закупки: НДС 0, маржа отрицательная", () => {
    const p = computePricing(base({ plannedSalePriceGross: D(8000) }));
    expect(p.vatAmount.toString()).toBe("0");
    expect(p.finalMargin.toString()).toBe("-2000"); // 8000−0−10000
  });
});

describe("computePricing — Regelbesteuerung (В10)", () => {
  it("нетто 12500 → НДС 2500, брутто 15000; маржа = брутто − финальная − расходы", () => {
    const p = computePricing(
      base({
        taxScheme: "REGELBESTEUERUNG",
        plannedSalePriceGross: null,
        plannedSalePriceNet: D(12500),
        expenses: [{ amountGross: 500, alreadyIncludedInAcquisitionCost: false }],
      })
    );
    expect(p.saleNet?.toString()).toBe("12500");
    expect(p.vatAmount.toString()).toBe("2500"); // 12500×0.2
    expect(p.saleGross.toString()).toBe("15000"); // 12500+2500
    expect(p.finalMargin.toString()).toBe("4500"); // 15000−10000−500 (НДС не вычитается, В10)
  });

  it("regelVat: нетто 100 → НДС 20, брутто 120", () => {
    const { vat, gross } = regelVat(100);
    expect(vat.toString()).toBe("20");
    expect(gross.toString()).toBe("120");
  });
});

describe("Легаси UNGEKLAERT (до миграции Э2)", () => {
  it("считается как Differenz, но isConfirmed=false", () => {
    const p = computePricing(base({ taxScheme: "UNGEKLAERT" }));
    expect(p.finalMargin.toString()).toBe("4000");
    expect(p.isConfirmed).toBe(false);
  });
});
