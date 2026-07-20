import { describe, it, expect } from "vitest";
import { can, viewerFlags, type AuthUser } from "./authz";

const u = (...roles: string[]): AuthUser => ({ id: "t", email: "t@t", name: "t", roles });

describe("Капабилити-матрица (roles-motorhof.md, §24.5)", () => {
  it("SALES видит Mindestverkaufspreis, но НЕ закупку/маржу/USt", () => {
    const sales = u("SALES");
    expect(can(sales, "see.minPrice")).toBe(true);
    expect(can(sales, "see.salePrice")).toBe(true);
    expect(can(sales, "see.taxScheme")).toBe(true); // название режима — да
    expect(can(sales, "see.acquisition")).toBe(false);
    expect(can(sales, "see.margin")).toBe(false); // маржа и Differenz-USt € — нет
  });

  it("SALES не может: минимум, владелец, налоговый режим, удаление, техчасть", () => {
    const sales = u("SALES");
    expect(can(sales, "edit.minPrice")).toBe(false);
    expect(can(sales, "sell.belowMin")).toBe(false);
    expect(can(sales, "owner.change")).toBe(false);
    expect(can(sales, "tax.change")).toBe(false);
    expect(can(sales, "delete.any")).toBe(false);
    expect(can(sales, "edit.tech")).toBe(false);
    expect(can(sales, "expense.add")).toBe(false);
  });

  it("TECHNICAL не получает финансы и не может продавать/бронировать", () => {
    const tech = u("TECHNICAL");
    expect(can(tech, "see.acquisition")).toBe(false);
    expect(can(tech, "see.margin")).toBe(false);
    expect(can(tech, "see.minPrice")).toBe(false);
    expect(can(tech, "see.salePrice")).toBe(false);
    expect(can(tech, "sell")).toBe(false);
    expect(can(tech, "owner.change")).toBe(false);
    expect(can(tech, "tax.change")).toBe(false);
    // но техчасть и смета — да
    expect(can(tech, "edit.tech")).toBe(true);
    expect(can(tech, "expense.addPending")).toBe(true);
    expect(can(tech, "expense.approve")).toBe(false); // подтверждает только PARTNER/ADMIN
    expect(can(tech, "status.tech")).toBe(true);
  });

  it("PARTNER видит финансы и подтверждает, но не управляет ролями и не удаляет историю", () => {
    const partner = u("PARTNER");
    expect(can(partner, "see.acquisition")).toBe(true);
    expect(can(partner, "see.margin")).toBe(true);
    expect(can(partner, "expense.approve")).toBe(true);
    expect(can(partner, "sell.belowMin")).toBe(true);
    expect(can(partner, "owner.change")).toBe(true);
    expect(can(partner, "users.manage")).toBe(false);
    expect(can(partner, "delete.any")).toBe(false);
    expect(can(partner, "edit.tech")).toBe(false); // решение 20.07: техчасть только TECHNICAL/ADMIN
  });

  it("READ_ONLY не может изменять ничего", () => {
    const ro = u("READ_ONLY");
    const mutating = [
      "edit.car", "edit.carDescription", "edit.salePrice", "edit.minPrice", "edit.tech",
      "sell", "sell.belowMin", "expense.add", "expense.addPending", "expense.approve",
      "task.manage", "client.manage", "status.sales", "status.tech",
      "owner.change", "tax.change", "delete.any", "users.manage",
    ] as const;
    for (const cap of mutating) expect(can(ro, cap), cap).toBe(false);
  });

  it("мульти-роль = union: PARTNER+TECHNICAL (Сергей) и финансы видит, и техчасть правит", () => {
    const sergey = u("PARTNER", "TECHNICAL");
    expect(can(sergey, "see.margin")).toBe(true); // от PARTNER
    expect(can(sergey, "edit.tech")).toBe(true); // от TECHNICAL
    expect(can(sergey, "expense.approve")).toBe(true); // от PARTNER
    expect(can(sergey, "users.manage")).toBe(false); // ни у одной роли
  });

  it("Иван (ADMIN+PARTNER+SALES) может всё, включая управление пользователями", () => {
    const ivan = u("ADMIN", "PARTNER", "SALES");
    expect(can(ivan, "users.manage")).toBe(true);
    expect(can(ivan, "delete.any")).toBe(true);
    expect(can(ivan, "edit.tech")).toBe(true); // через ADMIN
  });

  it("null-пользователь не может ничего", () => {
    expect(can(null, "see.salePrice")).toBe(false);
    expect(viewerFlags(null).seeSalePrice).toBe(false);
  });

  it("неизвестная роль в данных не даёт прав (защита от мусора в БД)", () => {
    expect(can(u("SUPERADMIN"), "users.manage")).toBe(false);
  });
});
