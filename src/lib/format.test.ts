import { describe, it, expect } from "vitest";
import {
  mhCode,
  parkingLabel,
  internalCode,
  isActiveStatus,
  ACTIVE_STATUSES,
  pickerlNeedsAttention,
} from "./format";

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
