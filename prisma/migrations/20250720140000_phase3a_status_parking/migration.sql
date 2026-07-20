-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "mhNumber" SERIAL NOT NULL,
ADD COLUMN     "parkingRow" TEXT,
ADD COLUMN     "parkingSpot" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'PURCHASED';

-- CreateTable
CREATE TABLE "ParkingMove" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "fromRow" TEXT,
    "fromSpot" INTEGER,
    "toRow" TEXT,
    "toSpot" INTEGER,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "ParkingMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParkingMove_carId_idx" ON "ParkingMove"("carId");

-- CreateIndex
CREATE UNIQUE INDEX "Car_mhNumber_key" ON "Car"("mhNumber");

-- AddForeignKey
ALTER TABLE "ParkingMove" ADD CONSTRAINT "ParkingMove_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Миграция старых статусов на 8-статусную модель (Требования §22)
UPDATE "Car" SET "status" = 'IN_PREPARATION' WHERE "status" = 'PREP';
UPDATE "Car" SET "status" = 'READY_FOR_SALE' WHERE "status" = 'AVAILABLE';
-- RESERVED и SOLD переносятся как есть.

-- Одно активное парковочное место нельзя назначить двум непроданным авто (§7).
-- Частичный уникальный индекс: действует только для авто с местом и не проданных/архивных.
CREATE UNIQUE INDEX "Car_active_parking_key" ON "Car" ("parkingRow", "parkingSpot")
  WHERE "parkingRow" IS NOT NULL AND "parkingSpot" IS NOT NULL AND "status" NOT IN ('SOLD', 'ARCHIVED');

