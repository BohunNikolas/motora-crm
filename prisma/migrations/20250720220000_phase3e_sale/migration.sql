-- Бронь и продажа автомобиля (§18): сущность Sale с единым жизненным циклом
-- RESERVED → COMPLETED | CANCELLED. Data-миграция завершённых Deal → Sale
-- выполняется отдельным идемпотентным скриптом (prisma/migrate-deals-to-sales.mjs).
-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "clientId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3),
    "reservationExpiresAt" TIMESTAMP(3),
    "anzahlung" DECIMAL(12,2),
    "reservationPaymentMethod" TEXT,
    "reservationComment" TEXT,
    "actualSalePriceGross" DECIMAL(12,2),
    "saleDate" TIMESTAMP(3),
    "paymentStatus" TEXT,
    "paymentMethod" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "mileageAtSale" INTEGER,
    "saleCategory" TEXT,
    "taxSchemeSnapshot" TEXT,
    "employeeUserId" TEXT,
    "financialSnapshot" JSONB,
    "legacyDealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_legacyDealId_key" ON "Sale"("legacyDealId");

-- CreateIndex
CREATE INDEX "Sale_carId_idx" ON "Sale"("carId");

-- CreateIndex
CREATE INDEX "Sale_stage_idx" ON "Sale"("stage");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_employeeUserId_fkey" FOREIGN KEY ("employeeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
