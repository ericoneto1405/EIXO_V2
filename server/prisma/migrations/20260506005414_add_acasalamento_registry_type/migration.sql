-- CreateEnum
CREATE TYPE "AcasalamentoRegistryType" AS ENUM ('RGN', 'RGD', 'UNKNOWN');

-- AlterTable
ALTER TABLE "AcasalamentoBull" ADD COLUMN     "officialRegistryType" "AcasalamentoRegistryType" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "maeId" TEXT,
ADD COLUMN     "maeNome" TEXT,
ADD COLUMN     "paiId" TEXT,
ADD COLUMN     "paiNome" TEXT,
ADD COLUMN     "sisbov" TEXT,
ADD COLUMN     "tatuagem" TEXT;

-- CreateIndex
CREATE INDEX "Animal_maeId_idx" ON "Animal"("maeId");

-- CreateIndex
CREATE INDEX "Animal_paiId_idx" ON "Animal"("paiId");

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_maeId_fkey" FOREIGN KEY ("maeId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
