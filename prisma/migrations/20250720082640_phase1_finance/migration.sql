-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "arrivalDate" TIMESTAMP(3),
ADD COLUMN     "currentOwner" TEXT NOT NULL DEFAULT 'MOTORHOF_OG',
ADD COLUMN     "einkaufspreisGemaess24" DECIMAL(12,2),
ADD COLUMN     "minimumSalePriceGross" DECIMAL(12,2),
ADD COLUMN     "plannedSalePriceGross" DECIMAL(12,2),
ADD COLUMN     "purchaseChannel" TEXT,
ADD COLUMN     "taxScheme" TEXT NOT NULL DEFAULT 'DIFFERENZBESTEUERUNG',
ALTER COLUMN "purchasePrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "listPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "alreadyIncludedInAcquisitionCost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "amountNet" DECIMAL(12,2),
ADD COLUMN     "deductibleInputVatAmount" DECIMAL(12,2),
ADD COLUMN     "vatRate" INTEGER NOT NULL DEFAULT 20,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Deal" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- Backfill существующих авто (Требования §22): для Differenzbesteuerung
-- Einkaufspreis §24 = закупочная цена; плановая цена продажи = listPrice.
UPDATE "Car" SET "einkaufspreisGemaess24" = "purchasePrice" WHERE "einkaufspreisGemaess24" IS NULL;
UPDATE "Car" SET "plannedSalePriceGross" = "listPrice" WHERE "plannedSalePriceGross" IS NULL;

