-- CreateTable
CREATE TABLE "CarFile" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "docType" TEXT,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarFile_carId_idx" ON "CarFile"("carId");

-- AddForeignKey
ALTER TABLE "CarFile" ADD CONSTRAINT "CarFile_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

