/**
 * Data-миграция §22: завершённые Deal (DONE) → Sale (COMPLETED) с financial snapshot.
 * Незавершённые Deal НЕ трогаем — остаются legacy до ручной проверки/фазы 5.
 *
 * Идемпотентно: Sale.legacyDealId @unique — повторный запуск пропускает уже
 * перенесённые сделки. Без orphan (только Deal с carId и amount).
 *
 * Запуск: node prisma/migrate-deals-to-sales.mjs
 */
import { Prisma, PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const D = (v) => new Prisma.Decimal(v);
const round2 = (d) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const PARTNER = ["MRIYA_MOTORS", "A_MOTORS", "AUTOHUB"];

// База приобретения OG — зеркалит ogAcquisitionBasis (format.ts).
function basis(car) {
  if (PARTNER.includes(car.currentOwner)) {
    const i = car.actualInternalTransferPrice ?? car.plannedInternalTransferPrice;
    if (i != null) return D(i);
  }
  if (car.purchaseChannel === "AUKTION" && car.auctionInvoiceTotal != null) return D(car.auctionInvoiceTotal);
  if (car.purchaseChannel === "INZAHLUNGNAHME" && car.tradeInCreditValue != null) return D(car.tradeInCreditValue);
  return D(car.purchasePrice);
}
function einkauf24(car, b) {
  if (PARTNER.includes(car.currentOwner)) return b;
  if (car.purchaseChannel === "AUKTION") return D(car.einkaufspreisGemaess24 ?? car.auctionVehiclePrice ?? b);
  return D(car.einkaufspreisGemaess24 ?? b);
}

// Зеркалит buildSaleSnapshot/finance.ts (Differenz точно; Regel — приближённо,
// без подтверждённой Vorsteuer: исторические тестовые данные — Differenzbesteuerung).
function snapshot(car, saleAmount) {
  const b = basis(car);
  const e24 = einkauf24(car, b);
  const approved = car.expenses.filter((e) => e.approvalStatus === "APPROVED" && !e.alreadyIncludedInAcquisitionCost);
  const additional = round2(approved.reduce((s, e) => s.plus(D(e.amountGross)), new Prisma.Decimal(0)));
  const cost = round2(approved.reduce((s, e) => s.plus(D(e.amountGross)), b));
  const sale = D(saleAmount);
  let vat, marginBefore, vatLabel, isConfirmed = true;
  if (car.taxScheme === "REGELBESTEUERUNG") {
    vat = round2(sale.times(20).div(120));
    marginBefore = round2(round2(sale.minus(vat)).minus(b));
    vatLabel = "Ausgangs-USt";
  } else {
    const diff = Prisma.Decimal.max(0, sale.minus(e24));
    vat = round2(diff.times(20).div(120));
    marginBefore = round2(sale.minus(b).minus(vat));
    vatLabel = "Differenz-USt";
    if (car.taxScheme === "UNGEKLAERT") isConfirmed = false;
  }
  const finalMargin = round2(marginBefore.minus(additional));
  return {
    taxScheme: car.taxScheme,
    vatLabel,
    acquisitionBasis: b.toString(),
    salePriceGross: sale.toString(),
    vatAmount: vat.toString(),
    cost: cost.toString(),
    marginBeforeExpenses: marginBefore.toString(),
    finalMargin: finalMargin.toString(),
    isConfirmed,
  };
}

const deals = await p.deal.findMany({
  where: { stage: "DONE", type: { not: "PURCHASE" }, carId: { not: null }, amount: { not: null } },
  include: { car: { include: { expenses: true } } },
});

let created = 0, skipped = 0;
for (const d of deals) {
  const exists = await p.sale.findUnique({ where: { legacyDealId: d.id } });
  if (exists) { skipped++; continue; }
  if (!d.car) { skipped++; continue; } // защита от orphan
  await p.sale.create({
    data: {
      carId: d.carId,
      clientId: d.clientId,
      stage: "COMPLETED",
      actualSalePriceGross: d.amount,
      saleDate: d.closedAt ?? d.createdAt,
      paymentStatus: "PAID",
      taxSchemeSnapshot: d.car.taxScheme,
      mileageAtSale: d.car.mileage,
      financialSnapshot: snapshot(d.car, d.amount),
      legacyDealId: d.id,
    },
  });
  created++;
}

// Незавершённые сделки остаются legacy — считаем для отчёта.
const legacy = await p.deal.count({ where: { stage: { notIn: ["DONE"] } } });
console.log(JSON.stringify({ doneDealsFound: deals.length, salesCreated: created, alreadyMigrated: skipped, legacyDealsKept: legacy }));
await p.$disconnect();
