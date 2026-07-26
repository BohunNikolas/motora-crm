-- Полная модель расхода (§14.1, §14.2). vehicleId (carId) становится необязательным:
-- расход может быть не привязан к авто. Новые колонки nullable либо с DEFAULT —
-- существующие расходы сохраняются (paymentStatus=UNPAID, category=SONSTIGES).

-- vehicleId необязателен
ALTER TABLE "Expense" ALTER COLUMN "carId" DROP NOT NULL;

-- Новые поля §14.1
ALTER TABLE "Expense"
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'SONSTIGES',
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "paymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "paidAmount" DECIMAL(12,2),
ADD COLUMN     "ownerCompany" TEXT,
ADD COLUMN     "comment" TEXT,
ADD COLUMN     "cancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "responsibleUserId" TEXT;

-- Ответственный (§14.1) — при удалении пользователя обнуляем.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_responsibleUserId_fkey"
  FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
