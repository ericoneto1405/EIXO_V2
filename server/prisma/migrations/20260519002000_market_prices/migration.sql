-- CreateEnum
CREATE TYPE "MarketSourceType" AS ENUM ('MANUAL', 'SITE_NOTICIAS', 'CONSULTORIA', 'API', 'B3', 'OUTRO');

-- CreateEnum
CREATE TYPE "MarketProductType" AS ENUM ('BOI_GORDO', 'VACA_GORDA', 'NOVILHA_GORDA', 'BEZERRO_DESMAMA', 'BEZERRO_12M', 'GARROTE', 'BOI_MAGRO');

-- CreateEnum
CREATE TYPE "MarketUnit" AS ENUM ('ARROBA', 'CABECA', 'KG');

-- CreateEnum
CREATE TYPE "MarketPaymentType" AS ENUM ('A_VISTA', 'TRINTA_DIAS', 'NAO_INFORMADO');

-- CreateEnum
CREATE TYPE "MarketPriceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "MarketSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MarketSourceType" NOT NULL,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRegion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT,
    "marketPlaceName" TEXT,
    "sourceRegionName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "productType" "MarketProductType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "unit" "MarketUnit" NOT NULL,
    "paymentType" "MarketPaymentType" NOT NULL DEFAULT 'NAO_INFORMADO',
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "referenceWeightArrobas" DOUBLE PRECISION,
    "sourceBase" TEXT,
    "notes" TEXT,
    "status" "MarketPriceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketSource_isActive_idx" ON "MarketSource"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSource_name_key" ON "MarketSource"("name");

-- CreateIndex
CREATE INDEX "MarketRegion_state_isActive_idx" ON "MarketRegion"("state", "isActive");

-- CreateIndex
CREATE INDEX "MarketRegion_name_state_idx" ON "MarketRegion"("name", "state");

-- CreateIndex
CREATE INDEX "MarketPrice_regionId_productType_status_referenceDate_idx" ON "MarketPrice"("regionId", "productType", "status", "referenceDate");

-- CreateIndex
CREATE INDEX "MarketPrice_sourceId_status_referenceDate_idx" ON "MarketPrice"("sourceId", "status", "referenceDate");

-- CreateIndex
CREATE INDEX "MarketPrice_productType_status_idx" ON "MarketPrice"("productType", "status");

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "MarketRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

