-- Фаза 5a: гарантийные случаи (§19). Сущность WarrantyCase по проданному
-- авто (несколько случаев на авто), 8 статусов, связи с задачами/расходами
-- (warrantyCaseId в Task/Expense, onDelete SetNull).

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "warrantyCaseId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "warrantyCaseId" TEXT;

-- CreateTable
CREATE TABLE "WarrantyCase" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "clientId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientReportedAt" TIMESTAMP(3),
    "complaintDescription" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "responsibleUserId" TEXT,
    "workshop" TEXT,
    "deadline" TIMESTAMP(3),
    "diagnosis" TEXT,
    "decision" TEXT,
    "communicationNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "finalCost" DECIMAL(12,2),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarrantyCase_status_idx" ON "WarrantyCase"("status");

-- CreateIndex
CREATE INDEX "WarrantyCase_carId_idx" ON "WarrantyCase"("carId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_warrantyCaseId_fkey" FOREIGN KEY ("warrantyCaseId") REFERENCES "WarrantyCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_warrantyCaseId_fkey" FOREIGN KEY ("warrantyCaseId") REFERENCES "WarrantyCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCase" ADD CONSTRAINT "WarrantyCase_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

