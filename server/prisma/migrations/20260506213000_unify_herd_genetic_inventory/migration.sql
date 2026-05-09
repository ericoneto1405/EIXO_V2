-- AlterTable
ALTER TABLE "SemenBatch" ADD COLUMN "bullAnimalId" TEXT;

-- AlterTable
ALTER TABLE "EmbryoBatch" ADD COLUMN "donorAnimalId" TEXT;
ALTER TABLE "EmbryoBatch" ADD COLUMN "sireAnimalId" TEXT;

-- CreateIndex
CREATE INDEX "SemenBatch_bullAnimalId_idx" ON "SemenBatch"("bullAnimalId");

-- CreateIndex
CREATE INDEX "EmbryoBatch_donorAnimalId_idx" ON "EmbryoBatch"("donorAnimalId");

-- CreateIndex
CREATE INDEX "EmbryoBatch_sireAnimalId_idx" ON "EmbryoBatch"("sireAnimalId");

-- AddForeignKey
ALTER TABLE "SemenBatch" ADD CONSTRAINT "SemenBatch_bullAnimalId_fkey" FOREIGN KEY ("bullAnimalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbryoBatch" ADD CONSTRAINT "EmbryoBatch_donorAnimalId_fkey" FOREIGN KEY ("donorAnimalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmbryoBatch" ADD CONSTRAINT "EmbryoBatch_sireAnimalId_fkey" FOREIGN KEY ("sireAnimalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
