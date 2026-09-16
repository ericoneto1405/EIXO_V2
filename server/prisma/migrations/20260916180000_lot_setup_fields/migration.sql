-- AlterEnum
ALTER TYPE "ProductionPhase" ADD VALUE 'CONFINAMENTO';

-- AlterTable
ALTER TABLE "Lot" ADD COLUMN "categoria" TEXT,
ADD COLUMN "paddockId" TEXT,
ADD COLUMN "entryHeadcount" INTEGER,
ADD COLUMN "entryWeightAvg" DOUBLE PRECISION,
ADD COLUMN "targetGmd" DOUBLE PRECISION,
ADD COLUMN "targetExitWeight" DOUBLE PRECISION,
ADD COLUMN "weighIntervalDays" INTEGER;

-- CreateIndex
CREATE INDEX "Lot_paddockId_idx" ON "Lot"("paddockId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_paddockId_fkey" FOREIGN KEY ("paddockId") REFERENCES "Paddock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
