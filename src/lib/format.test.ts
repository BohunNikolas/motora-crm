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
  ogAcquisitionBasis,
  supplierFinance,
  internalInvoiceComplete,
  carMargin,
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

describe("Владелец и внутренняя продажа e.U. → OG (§9)", () => {
  // Полная модель авто для finance-адаптеров + владельца.
  const car = (over: Record<string, unknown> = {}) => ({
    taxScheme: "DIFFERENZBESTEUERUNG",
    purchasePrice: D(9000),
    listPrice: D(15000),
    einkaufspreisGemaess24: null,
    plannedSalePriceGross: null,
    expenses: [],
    currentOwner: "MOTORHOF_OG",
    actualInternalTransferPrice: null,
    plannedInternalTransferPrice: null,
    partnerPurchasePrice: null,
    partnerAcquisitionCost: null,
    internalInvoiceTaxScheme: null,
    internalInvoiceNumber: null,
    ...over,
  });

  it("isPartnerOwner: три партнёрские компании — да, MOTORHOF OG — нет", () => {
    expect(isPartnerOwner("MRIYA_MOTORS")).toBe(true);
    expect(isPartnerOwner("A_MOTORS")).toBe(true);
    expect(isPartnerOwner("AUTOHUB")).toBe(true);
    expect(isPartnerOwner("MOTORHOF_OG")).toBe(false);
  });

  it("база OG: собственное авто — purchasePrice; партнёрское — внутр. счёт (факт ?? план ?? fallback)", () => {
    // собственное авто OG → закупочная цена
    expect(ogAcquisitionBasis(car()).toString()).toBe("9000");
    // партнёрское с фактическим внутр. счётом → факт
    expect(
      ogAcquisitionBasis(
        car({ currentOwner: "MRIYA_MOTORS", plannedInternalTransferPrice: D(11000), actualInternalTransferPrice: D(12000) })
      ).toString()
    ).toBe("12000");
    // партнёрское только с плановым → план
    expect(
      ogAcquisitionBasis(car({ currentOwner: "MRIYA_MOTORS", plannedInternalTransferPrice: D(11000) })).toString()
    ).toBe("11000");
    // партнёрское без внутренней цены → fallback на purchasePrice
    expect(ogAcquisitionBasis(car({ currentOwner: "AUTOHUB" })).toString()).toBe("9000");
  });

  it("результат поставщика: Differenzbesteuerung по внутреннему счёту, не смешан с OG", () => {
    // поставщик: закупка 10000, общая стоимость 10500, внутр. продажа в OG 12000
    // Differenz-USt = max(0, 12000−10000)×20/120 = 333.33; результат = 12000−10500−333.33 = 1166.67
    const s = supplierFinance(
      car({
        currentOwner: "MRIYA_MOTORS",
        partnerPurchasePrice: D(10000),
        partnerAcquisitionCost: D(10500),
        actualInternalTransferPrice: D(12000),
        internalInvoiceTaxScheme: "DIFFERENZBESTEUERUNG",
      })
    );
    expect(s?.vatAmount.toString()).toBe("333.33");
    expect(s?.finalMargin.toString()).toBe("1166.67");
  });

  it("результат поставщика: нет партнёра или нет внутренней цены → null", () => {
    expect(supplierFinance(car())).toBeNull(); // MOTORHOF_OG
    expect(supplierFinance(car({ currentOwner: "AUTOHUB" }))).toBeNull(); // нет внутренней цены
  });

  it("результат OG партнёрского авто считается от внутреннего счёта, а не от purchasePrice", () => {
    // внутр. счёт 12000 (база OG), продажа 15000, Differenz → USt = (15000−12000)/6 = 500
    // маржа OG = 15000 − 12000 − 500 = 2500 (purchasePrice 9000 не участвует)
    const m = carMargin(
      car({ currentOwner: "MRIYA_MOTORS", actualInternalTransferPrice: D(12000), listPrice: D(15000) })
    );
    expect(m.toString()).toBe("2500");
  });

  it("внутренний счёт завершён только при наличии фактической цены И номера (§9)", () => {
    expect(internalInvoiceComplete({ actualInternalTransferPrice: D(12000), internalInvoiceNumber: "RE-1" })).toBe(true);
    expect(internalInvoiceComplete({ actualInternalTransferPrice: D(12000), internalInvoiceNumber: null })).toBe(false);
    expect(internalInvoiceComplete({ actualInternalTransferPrice: null, internalInvoiceNumber: "RE-1" })).toBe(false);
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
