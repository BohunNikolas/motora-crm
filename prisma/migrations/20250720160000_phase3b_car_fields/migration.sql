-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "erstzulassung" TIMESTAMP(3),
ADD COLUMN     "keysCount" INTEGER,
ADD COLUMN     "lastServiceDate" TIMESTAMP(3),
ADD COLUMN     "lastServiceMileage" INTEGER,
ADD COLUMN     "leistung" INTEGER,
ADD COLUMN     "nachlackierungen" TEXT NOT NULL DEFAULT 'UNBEKANNT',
ADD COLUMN     "nachlackierungenComment" TEXT,
ADD COLUMN     "nachlackierungenParts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pickerlComment" TEXT,
ADD COLUMN     "pickerlMonth" INTEGER,
ADD COLUMN     "pickerlVorhanden" TEXT NOT NULL DEFAULT 'UNBEKANNT',
ADD COLUMN     "pickerlYear" INTEGER,
ADD COLUMN     "purchaseDate" TIMESTAMP(3),
ADD COLUMN     "serviceComment" TEXT,
ADD COLUMN     "serviceheft" TEXT NOT NULL DEFAULT 'UNBEKANNT',
ADD COLUMN     "voranmeldungen" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Car_vin_key" ON "Car"("vin");

