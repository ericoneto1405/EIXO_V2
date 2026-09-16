-- CreateEnum
CREATE TYPE "AnimalDocumentType" AS ENUM ('REGISTRO_ABCZ', 'CONTRATO', 'NOTA', 'CATALOGO', 'EXAME', 'OUTRO');

-- CreateEnum
CREATE TYPE "AnimalValuationSource" AS ENUM ('LEILAO', 'AVALIACAO', 'OFERTA');

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "FinancialResultAllocation" ADD COLUMN "animalId" TEXT,
ADD COLUMN "animalLabelSnapshot" TEXT;

-- CreateTable
CREATE TABLE "AnimalPartner" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "sharePct" DECIMAL(5,2) NOT NULL,
    "isOwnFarm" BOOLEAN NOT NULL DEFAULT false,
    "since" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimalPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalDocument" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "type" "AnimalDocumentType" NOT NULL,
    "title" TEXT,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalValuation" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "source" "AnimalValuationSource" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalValuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialResultAllocation_animalId_idx" ON "FinancialResultAllocation"("animalId");
CREATE INDEX "AnimalPartner_farmId_idx" ON "AnimalPartner"("farmId");
CREATE INDEX "AnimalPartner_animalId_idx" ON "AnimalPartner"("animalId");
CREATE INDEX "AnimalDocument_farmId_idx" ON "AnimalDocument"("farmId");
CREATE INDEX "AnimalDocument_animalId_idx" ON "AnimalDocument"("animalId");
CREATE INDEX "AnimalValuation_farmId_idx" ON "AnimalValuation"("farmId");
CREATE INDEX "AnimalValuation_animalId_date_idx" ON "AnimalValuation"("animalId", "date");

-- AddForeignKey
ALTER TABLE "FinancialResultAllocation" ADD CONSTRAINT "FinancialResultAllocation_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnimalPartner" ADD CONSTRAINT "AnimalPartner_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalPartner" ADD CONSTRAINT "AnimalPartner_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalDocument" ADD CONSTRAINT "AnimalDocument_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalDocument" ADD CONSTRAINT "AnimalDocument_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalValuation" ADD CONSTRAINT "AnimalValuation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnimalValuation" ADD CONSTRAINT "AnimalValuation_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
