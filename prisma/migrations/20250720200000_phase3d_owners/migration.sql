-- Партнёрский владелец и внутренняя продажа e.U. → OG (§9).
-- Все колонки nullable либо с DEFAULT — backfill не нужен: у существующих
-- (все MOTORHOF_OG) партнёрские поля остаются NULL, статус оплаты OPEN не
-- влияет, awaitingInternalInvoice = false.
-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "partnerPurchasePrice" DECIMAL(12,2),
ADD COLUMN     "partnerAcquisitionCost" DECIMAL(12,2),
ADD COLUMN     "plannedInternalTransferPrice" DECIMAL(12,2),
ADD COLUMN     "actualInternalTransferPrice" DECIMAL(12,2),
ADD COLUMN     "internalInvoiceNumber" TEXT,
ADD COLUMN     "internalInvoiceDate" TIMESTAMP(3),
ADD COLUMN     "internalInvoiceTaxScheme" TEXT,
ADD COLUMN     "internalInvoicePaymentStatus" TEXT NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "awaitingInternalInvoice" BOOLEAN NOT NULL DEFAULT false;
