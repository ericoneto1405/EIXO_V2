-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcasalamentoProofStatus" ADD VALUE 'PENDING';
ALTER TYPE "AcasalamentoProofStatus" ADD VALUE 'NOT_FOUND';

-- AlterTable
ALTER TABLE "AcasalamentoBull" ADD COLUMN     "officialRgn" TEXT,
ADD COLUMN     "officialSeries" TEXT;

-- CreateIndex
CREATE INDEX "AcasalamentoBull_breed_officialSeries_officialRgn_idx" ON "AcasalamentoBull"("breed", "officialSeries", "officialRgn");
