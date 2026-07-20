import { describe, it, expect } from "vitest";
import { mhCode, parkingLabel, internalCode, isActiveStatus, ACTIVE_STATUSES } from "./format";

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
