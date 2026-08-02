import { describe, it, expect } from "vitest";
import {
  mhCode,
  parkingLabel,
  internalCode,
  isActiveStatus,
  ACTIVE_STATUSES,
  pickerlNeedsAttention,
  requiredDocs,
  isFinancialDoc,
  isPartnerOwner,
  carFinalPurchase,
  carPricing,
  carMargin,
  carCost,
  auctionTotalBelowVehiclePrice,
  buildSaleSnapshot,
  reservationExpired,
  intervalsOverlap,
  viennaDayKey,
  isWarrantyOpen,
  WARRANTY_OPEN_STATUSES,
  carAgeDays,
} from "./format";
import { Decimal } from "./finance";

const D = (v: number) => new Decimal(v);

const NOW = new Date("2026-07-15T12:00:00"); // июль 2026
const pk = (vorhanden: string, month: number | null, year: number | null) => ({
  pickerlVorhanden: vorhanden,
  pickerlMonth: month,
  pickerlYear: year,
});

describe("Pickerl требует внимания (§24.2)", () => {
  it("отсутствующий / неизвестный Pickerl → внимание", () => {
    expect(pickerlNeedsAttention(pk("NEIN", null, null), NOW)).toBe(true);
    expect(pickerlNeedsAttention(pk("UNBEKANNT", null, null), NOW)).toBe(true);
    expect(pickerlNeedsAttention(pk("JA", null, null), NOW)).toBe(true); // Ja, но нет даты
  });

  it("Begutachtung в текущем месяце → внимание", () => {
    expect(pickerlNeedsAttention(pk("JA", 7, 2026), NOW)).toBe(true);
  });

  it("Begutachtung в следующем месяце → внимание", () => {
    expect(pickerlNeedsAttention(pk("JA", 8, 2026), NOW)).toBe(true);
  });

  it("срок уже наступил (прошлый месяц) → внимание", () => {
    expect(pickerlNeedsAttention(pk("JA", 6, 2026), NOW)).toBe(true);
    expect(pickerlNeedsAttention(pk("JA", 12, 2025), NOW)).toBe(true);
  });

  it("срок дальше одного месяца → НЕ требует внимания", () => {
    expect(pickerlNeedsAttention(pk("JA", 9, 2026), NOW)).toBe(false);
    expect(pickerlNeedsAttention(pk("JA", 3, 2027), NOW)).toBe(false);
  });
});

describe("Обязательные документы (§8.5)", () => {
  const car = (over = {}) => ({
    purchaseChannel: null as string | null,
    pickerlVorhanden: "NEIN",
    currentOwner: "MOTORHOF_OG",
    ...over,
  });

  it("базовый набор: Kaufvertrag/Ankaufsrechnung + Zulassung", () => {
    const reqs = requiredDocs(car(), new Set());
    expect(reqs.map((r) => r.label)).toEqual(["Kaufvertrag / Ankaufsrechnung", "Zulassungsschein"]);
    expect(reqs.every((r) => !r.present)).toBe(true);
  });

  it("Auktion добавляет Auktionsrechnung", () => {
    const reqs = requiredDocs(car({ purchaseChannel: "AUKTION" }), new Set());
    expect(reqs.some((r) => r.label === "Auktionsrechnung")).toBe(true);
  });

  it("Pickerl=Ja добавляет §57a-Gutachten; партнёрский владелец — Rechnung e.U.→OG", () => {
    const reqs = requiredDocs(car({ pickerlVorhanden: "JA", currentOwner: "AUTOHUB" }), new Set());
    expect(reqs.some((r) => r.label === "§57a-Gutachten")).toBe(true);
    expect(reqs.some((r) => r.label === "Rechnung e.U. → OG")).toBe(true);
  });

  it("требование удовлетворяется любым из типов (Ankaufsrechnung засчитывает Kaufvertrag-пункт)", () => {
    const reqs = requiredDocs(car(), new Set(["ANKAUFSRECHNUNG", "ZULASSUNG"]));
    expect(reqs.every((r) => r.present)).toBe(true);
  });

  it("financial-флаг: закупочные документы помечены как финансовые", () => {
    expect(isFinancialDoc("AUKTIONSRECHNUNG")).toBe(true);
    expect(isFinancialDoc("RECHNUNG_EU_OG")).toBe(true);
    expect(isFinancialDoc("ANKAUFSRECHNUNG")).toBe(true);
    expect(isFinancialDoc("KAUFVERTRAG")).toBe(false);
    expect(isFinancialDoc("ZULASSUNG")).toBe(false);
  });
});

describe("Учётный код и парковка (§7)", () => {
  it("MH-код — 4 знака с ведущими нулями, неизменный формат", () => {
    expect(mhCode(1)).toBe("MH-0001");
    expect(mhCode(42)).toBe("MH-0042");
    expect(mhCode(12345)).toBe("MH-12345"); // >4 знаков не обрезаем
  });

  it("метка места: A-12 или прочерк, если места нет", () => {
    expect(parkingLabel("A", 12)).toBe("A-12");
    expect(parkingLabel(null, null)).toBe("—");
    expect(parkingLabel("A", null)).toBe("—"); // неполное место = нет места
    expect(parkingLabel(null, 12)).toBe("—");
  });

  it("internalCode: «A-12 / MH-0042» или «— / MH-0042» без места", () => {
    expect(internalCode({ mhNumber: 42, parkingRow: "A", parkingSpot: 12 })).toBe("A-12 / MH-0042");
    expect(internalCode({ mhNumber: 42, parkingRow: null, parkingSpot: null })).toBe("— / MH-0042");
  });
});

describe("Ценообразование по владельцу — фиктивная наценка (В9)", () => {
  // Модель авто для finance-адаптеров (новая модель, batch-1).
  const car = (over: Record<string, unknown> = {}) => ({
    taxScheme: "DIFFERENZBESTEUERUNG",
    purchasePrice: D(9000),
    listPrice: D(15000),
    plannedSalePriceGross: null,
    expenses: [],
    currentOwner: "MOTORHOF_OG",
    purchaseChannel: null,
    auctionInvoiceTotal: null,
    auctionVehiclePrice: null,
    auctionTransportCost: null,
    ...over,
  });

  it("isPartnerOwner: три партнёрские компании — да, MOTORHOF — нет", () => {
    expect(isPartnerOwner("MRIYA_MOTORS")).toBe(true);
    expect(isPartnerOwner("A_MOTORS")).toBe(true);
    expect(isPartnerOwner("AUTOHUB")).toBe(true);
    expect(isPartnerOwner("MOTORHOF_OG")).toBe(false);
  });

  it("финальная закупочная: без наценки = закупочная (и для партнёра тоже)", () => {
    expect(carFinalPurchase(car()).toString()).toBe("9000");
    expect(carFinalPurchase(car({ currentOwner: "AUTOHUB" })).toString()).toBe("9000");
  });

  it("финальная закупочная партнёра с наценкой = закупочная + наценка", () => {
    expect(
      carFinalPurchase(car({ currentOwner: "MRIYA_MOTORS", fictitiousMarkup: D(1000) })).toString()
    ).toBe("10000");
  });

  it("маржа партнёрского авто: наценка уменьшает и НДС-базу, и маржу", () => {
    // закупка 9000 + наценка 1000 = финальная 10000; план 15000
    // НДС = (15000−10000)×0.2 = 1000; маржа = 15000−1000−10000 = 4000
    const m = carMargin(car({ currentOwner: "MRIYA_MOTORS", fictitiousMarkup: D(1000) }));
    expect(m.toString()).toBe("4000");
  });
});

describe("Каналы закупки (новая модель: Приват/Аукцион/Хендлер)", () => {
  const car = (over: Record<string, unknown> = {}) => ({
    taxScheme: "DIFFERENZBESTEUERUNG",
    purchasePrice: D(9000),
    listPrice: D(12000),
    plannedSalePriceGross: null,
    expenses: [],
    currentOwner: "MOTORHOF_OG",
    purchaseChannel: null,
    auctionInvoiceTotal: null,
    auctionVehiclePrice: null,
    auctionTransportCost: null,
    ...over,
  });

  it("финальная закупочная: Аукцион = цена аукциона + транспортировка", () => {
    expect(carFinalPurchase(car()).toString()).toBe("9000"); // без канала → закупочная
    expect(
      carFinalPurchase(
        car({ purchaseChannel: "AUKTION", auctionInvoiceTotal: D(10800), auctionTransportCost: D(200) })
      ).toString()
    ).toBe("11000");
  });

  it("легаси-каналы (Трейд-ин/Импорт, В8) считаются как Приват — от закупочной", () => {
    expect(carFinalPurchase(car({ purchaseChannel: "INZAHLUNGNAHME" })).toString()).toBe("9000");
    expect(carFinalPurchase(car({ purchaseChannel: "IMPORT" })).toString()).toBe("9000");
  });

  it("Аукцион: авто 10000 / total 10800 / план 12000 → сбор 800, НДС 400 (от цены авто), маржа 800", () => {
    const c = car({
      purchaseChannel: "AUKTION",
      auctionVehiclePrice: D(10000),
      auctionInvoiceTotal: D(10800),
      listPrice: D(12000),
    });
    const p = carPricing(c);
    expect(p.auctionFee?.toString()).toBe("800"); // 10800−10000
    expect(p.finalPurchasePrice.toString()).toBe("10800"); // транспорт null
    expect(p.vatAmount.toString()).toBe("400"); // (12000−10000)×0.2 — от цены автомобиля
    expect(p.finalMargin.toString()).toBe("800"); // 12000−400−10800
    expect(carCost(c).toString()).toBe("10800"); // себестоимость = финальная закупочная
  });

  it("проверка §11.2: gesamt < цены автомобиля → нарушение (нужен override)", () => {
    expect(auctionTotalBelowVehiclePrice({ auctionInvoiceTotal: D(9500), auctionVehiclePrice: D(10000) })).toBe(true);
    expect(auctionTotalBelowVehiclePrice({ auctionInvoiceTotal: D(10800), auctionVehiclePrice: D(10000) })).toBe(false);
    expect(auctionTotalBelowVehiclePrice({ auctionInvoiceTotal: null, auctionVehiclePrice: D(10000) })).toBe(false);
  });
});

describe("Бронь и продажа §18 (snapshot и просрочка брони)", () => {
  const car = (over: Record<string, unknown> = {}) => ({
    taxScheme: "DIFFERENZBESTEUERUNG",
    purchasePrice: D(10000),
    listPrice: D(12000),
    plannedSalePriceGross: null,
    expenses: [],
    currentOwner: "MOTORHOF_OG",
    purchaseChannel: null,
    auctionInvoiceTotal: null,
    auctionVehiclePrice: null,
    auctionTransportCost: null,
    ...over,
  });

  it("financial snapshot замораживает расчёт продажи (новые формулы)", () => {
    // закупка 10000, продажа 12000 → НДС = 2000×0.2 = 400, маржа = 12000−400−10000 = 1600
    const s = buildSaleSnapshot(car(), D(12000));
    expect(s.finalMargin).toBe("1600");
    expect(s.vatAmount).toBe("400");
    expect(s.vatLabel).toBe("Differenz-USt");
    expect(s.acquisitionBasis).toBe("10000");
    expect(s.cost).toBe("10000");
    expect(s.isConfirmed).toBe(true);
  });

  it("snapshot Аукциона: финальная = total (+транспорт), НДС от цены автомобиля", () => {
    const s = buildSaleSnapshot(
      car({ purchaseChannel: "AUKTION", auctionVehiclePrice: D(10000), auctionInvoiceTotal: D(10800) }),
      D(12000)
    );
    expect(s.acquisitionBasis).toBe("10800");
    expect(s.vatAmount).toBe("400"); // (12000−10000)×0.2
    expect(s.finalMargin).toBe("800"); // 12000−400−10800
  });

  it("snapshot: Regelbesteuerung помечает Ausgangs-USt", () => {
    const s = buildSaleSnapshot(car({ taxScheme: "REGELBESTEUERUNG" }), D(12000));
    expect(s.vatLabel).toBe("Ausgangs-USt");
  });

  it("бронь просрочена только для активной RESERVED с истёкшим сроком", () => {
    const now = new Date("2026-07-20T12:00:00");
    expect(reservationExpired({ stage: "RESERVED", reservationExpiresAt: new Date("2026-07-10") }, now)).toBe(true);
    expect(reservationExpired({ stage: "RESERVED", reservationExpiresAt: new Date("2026-07-30") }, now)).toBe(false);
    expect(reservationExpired({ stage: "COMPLETED", reservationExpiresAt: new Date("2026-07-10") }, now)).toBe(false);
    expect(reservationExpired({ stage: "RESERVED", reservationExpiresAt: null }, now)).toBe(false);
  });
});

describe("Активные статусы склада (§6.1)", () => {
  it("SOLD и ARCHIVED не активны, остальные — да", () => {
    expect(isActiveStatus("READY_FOR_SALE")).toBe(true);
    expect(isActiveStatus("RESERVED")).toBe(true);
    expect(isActiveStatus("IN_PREPARATION")).toBe(true);
    expect(isActiveStatus("SOLD")).toBe(false);
    expect(isActiveStatus("ARCHIVED")).toBe(false);
  });

  it("ACTIVE_STATUSES содержит 7 статусов (8 минус SOLD)", () => {
    expect(ACTIVE_STATUSES).toHaveLength(7);
    expect(ACTIVE_STATUSES).not.toContain("SOLD");
  });
});

describe("Пересечение интервалов календаря (§16.3, §24.4)", () => {
  const d = (s: string) => new Date(`2026-07-26T${s}:00`);

  it("частичное пересечение — конфликт", () => {
    expect(intervalsOverlap(d("14:00"), d("15:00"), d("14:30"), d("15:30"))).toBe(true);
  });
  it("один интервал внутри другого — конфликт", () => {
    expect(intervalsOverlap(d("14:00"), d("16:00"), d("14:30"), d("15:00"))).toBe(true);
  });
  it("полное совпадение — конфликт", () => {
    expect(intervalsOverlap(d("14:00"), d("15:00"), d("14:00"), d("15:00"))).toBe(true);
  });
  it("касание границами (конец = начало) — НЕ конфликт", () => {
    expect(intervalsOverlap(d("14:00"), d("15:00"), d("15:00"), d("16:00"))).toBe(false);
    expect(intervalsOverlap(d("15:00"), d("16:00"), d("14:00"), d("15:00"))).toBe(false);
  });
  it("полностью раздельные — НЕ конфликт", () => {
    expect(intervalsOverlap(d("14:00"), d("15:00"), d("16:00"), d("17:00"))).toBe(false);
  });
});

describe("Ключ календарного дня в Вене (§16.2)", () => {
  it("группирует по календарному дню Вены", () => {
    // 26.07.2026 12:00 UTC = 14:00 Вена (CEST) — тот же день.
    expect(viennaDayKey(new Date("2026-07-26T12:00:00Z"))).toBe("2026-07-26");
  });
  it("поздний вечер UTC уже следующий день в Вене летом", () => {
    // 26.07 22:30 UTC = 27.07 00:30 Вена (CEST +2).
    expect(viennaDayKey(new Date("2026-07-26T22:30:00Z"))).toBe("2026-07-27");
  });
});

describe("Открытые гарантийные случаи (§19)", () => {
  it("в работе — OPEN..WAITING_PARTS, терминальные — нет", () => {
    expect(isWarrantyOpen("OPEN")).toBe(true);
    expect(isWarrantyOpen("IN_REPAIR")).toBe(true);
    expect(isWarrantyOpen("WAITING_PARTS")).toBe(true);
    expect(isWarrantyOpen("RESOLVED")).toBe(false);
    expect(isWarrantyOpen("REJECTED")).toBe(false);
    expect(isWarrantyOpen("CLOSED")).toBe(false);
  });
  it("WARRANTY_OPEN_STATUSES — 5 рабочих статусов", () => {
    expect(WARRANTY_OPEN_STATUSES).toHaveLength(5);
  });
});

describe("Возраст авто на складе (§5.5)", () => {
  const NOW = new Date("2026-07-26T12:00:00").getTime();
  const base = (o: { arrivalDate?: Date | null; purchaseDate?: Date | null }) => ({ arrivalDate: null, purchaseDate: null, createdAt: new Date("2026-07-26T12:00:00"), ...o });
  it("считает от arrivalDate в первую очередь", () => {
    expect(carAgeDays(base({ arrivalDate: new Date("2026-06-26T12:00:00"), purchaseDate: new Date("2026-01-01") }), NOW)).toBe(30);
  });
  it("без arrivalDate — от purchaseDate", () => {
    expect(carAgeDays(base({ purchaseDate: new Date("2026-05-27T12:00:00") }), NOW)).toBe(60);
  });
  it("без обеих — от createdAt (0 дней)", () => {
    expect(carAgeDays(base({}), NOW)).toBe(0);
  });
});
