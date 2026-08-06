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
  suggestedMarkup,
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

// ─── Правки-2: двухступенчатый дифф. НДС партнёрских авто ───────
// Контрольные примеры из docs/TZ-DUAL-DIFF-VAT.md, проверенные вручную
// с владельцем. Ступень 1 не зависит от цены продажи, ступень 2 считается
// от передаточной цены, маржа — сквозная по группе (наценка в ней не участвует).

const auktion = (over: Partial<PricingInput> = {}): PricingInput => ({
  taxScheme: "DIFFERENZBESTEUERUNG",
  channel: "AUKTION",
  isPartner: true,
  ...over,
});

describe("Двухступенчатый НДС — кейс A (Fiat 500, аукцион с транспортом)", () => {
  const fiat = (saleGross: number, expenses = 750) =>
    computePricing(
      auktion({
        auctionTotal: D("2740.00"),
        auctionVehiclePrice: D("2272.00"),
        transportCost: D("186.65"),
        fictitiousMarkup: D(300),
        plannedSalePriceGross: D(saleGross),
        expenses: [{ amountGross: expenses, alreadyIncludedInAcquisitionCost: false }],
      })
    );

  it("ступень 1: НДС e.U. 190,93 и передаточная 3417,58", () => {
    const p = fiat(4990);
    expect(p.isTwoStage).toBe(true);
    expect(p.finalPurchasePrice.toString()).toBe("3226.65"); // 2740+186.65+300
    expect(p.realCost.toString()).toBe("2926.65"); // без наценки
    expect(p.vatEU?.toString()).toBe("190.93"); // (3226.65−2272)×0.2
    expect(p.transferPrice?.toString()).toBe("3417.58");
  });

  it("продажа 4990 → НДС OG 314,48, всего 505,41, маржа группы 807,94", () => {
    const p = fiat(4990);
    expect(p.vatOG?.toString()).toBe("314.48");
    expect(p.vatAmount.toString()).toBe("505.41");
    expect(p.finalMargin.toString()).toBe("807.94"); // 4990−505.41−2926.65−750
  });

  it("продажа 5490 → маржа 1207,94; продажа 4490 → маржа 407,94", () => {
    expect(fiat(5490).vatOG?.toString()).toBe("414.48");
    expect(fiat(5490).finalMargin.toString()).toBe("1207.94");
    expect(fiat(4490).vatOG?.toString()).toBe("214.48");
    expect(fiat(4490).finalMargin.toString()).toBe("407.94");
  });

  it("ступень 1 не зависит от цены продажи", () => {
    expect(fiat(5490).vatEU?.toString()).toBe(fiat(4490).vatEU?.toString());
  });

  it("suggestedMarkup(2926.65) = 250 (5% ниже пола)", () => {
    expect(suggestedMarkup(D("2926.65")).toString()).toBe("250");
  });
});

describe("Двухступенчатый НДС — кейс B (аукцион без транспорта)", () => {
  const car = (saleGross: number) =>
    computePricing(
      auktion({
        auctionTotal: D("5596.00"),
        auctionVehiclePrice: D("5099.00"),
        transportCost: D(0),
        fictitiousMarkup: D(300),
        plannedSalePriceGross: D(saleGross),
        expenses: [{ amountGross: 500, alreadyIncludedInAcquisitionCost: false }],
      })
    );

  it("ступень 1: НДС e.U. 159,40, передаточная 6055,40", () => {
    const p = car(9290);
    expect(p.finalPurchasePrice.toString()).toBe("5896");
    expect(p.vatEU?.toString()).toBe("159.4");
    expect(p.transferPrice?.toString()).toBe("6055.4");
  });

  it("продажа 9290 → НДС всего 806,32, маржа 2387,68", () => {
    const p = car(9290);
    expect(p.vatOG?.toString()).toBe("646.92");
    expect(p.vatAmount.toString()).toBe("806.32");
    expect(p.finalMargin.toString()).toBe("2387.68");
  });

  it("продажа 8590 → маржа 1827,68", () => {
    expect(car(8590).finalMargin.toString()).toBe("1827.68");
  });

  it("suggestedMarkup(5596) = 280 (5% = 279,80 → вверх до 10)", () => {
    expect(suggestedMarkup(D(5596)).toString()).toBe("280");
  });
});

describe("Двухступенчатый НДС — кейс C (Приват, партнёр)", () => {
  it("наценка 500 → НДС e.U. 100, передаточная 10600, маржа 2420", () => {
    const p = computePricing({
      taxScheme: "DIFFERENZBESTEUERUNG",
      channel: "PRIVAT",
      isPartner: true,
      purchasePrice: D(10000),
      fictitiousMarkup: D(500),
      plannedSalePriceGross: D(13000),
    });
    expect(p.vatEU?.toString()).toBe("100"); // (10500−10000)×0.2
    expect(p.transferPrice?.toString()).toBe("10600");
    expect(p.vatOG?.toString()).toBe("480"); // (13000−10600)×0.2
    expect(p.vatAmount.toString()).toBe("580");
    expect(p.finalMargin.toString()).toBe("2420"); // 13000−580−10000
  });
});

describe("Одноступенчатые случаи не изменились", () => {
  it("кейс D — MOTORHOF (не партнёр) на аукционе: база НДС — цена автомобиля", () => {
    const p = computePricing(
      auktion({
        isPartner: false,
        auctionTotal: D("5596.00"),
        auctionVehiclePrice: D("5099.00"),
        transportCost: D(0),
        plannedSalePriceGross: D(9290),
      })
    );
    expect(p.isTwoStage).toBe(false);
    expect(p.vatEU).toBeNull();
    expect(p.transferPrice).toBeNull();
    expect(p.vatAmount.toString()).toBe("838.2"); // (9290−5099)×0.2
    expect(p.finalMargin.toString()).toBe("2855.8"); // 9290−838.2−5596
  });

  it("кейс E — партнёр на Regelbesteuerung считается по-старому", () => {
    const p = computePricing({
      taxScheme: "REGELBESTEUERUNG",
      channel: "PRIVAT",
      isPartner: true,
      purchasePrice: D(10000),
      fictitiousMarkup: D(500),
      plannedSalePriceNet: D(12500),
    });
    expect(p.isTwoStage).toBe(false);
    expect(p.vatAmount.toString()).toBe("2500");
    expect(p.finalMargin.toString()).toBe("4500"); // 15000−10500 (финальная закупочная)
  });
});

describe("Каскадный эффект двух ступеней", () => {
  it("сумма ступеней меньше одноступенчатого НДС ровно на 20% от НДС e.U.", () => {
    const two = computePricing(
      auktion({
        auctionTotal: D(5596),
        auctionVehiclePrice: D(5099),
        transportCost: D(0),
        fictitiousMarkup: D(300),
        plannedSalePriceGross: D(9290),
      })
    );
    const one = computePricing(
      auktion({
        isPartner: false,
        auctionTotal: D(5596),
        auctionVehiclePrice: D(5099),
        transportCost: D(0),
        plannedSalePriceGross: D(9290),
      })
    );
    const saved = one.vatAmount.minus(two.vatAmount);
    expect(saved.toString()).toBe(round2(two.vatEU!.times(0.2)).toString()); // 31.88
  });
});
