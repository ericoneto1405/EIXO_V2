-- AlterTable
ALTER TABLE "MarketSource"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "trustScore" INTEGER NOT NULL DEFAULT 70,
  ADD COLUMN "autoPublishMinConfidence" INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isAutomationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "MarketCaptureMethod" AS ENUM ('MANUAL_IMPORT', 'API', 'SCRAPER', 'RSS', 'CSV', 'HTML', 'OUTRO');
CREATE TYPE "MarketCaptureStatus" AS ENUM ('CAPTURED', 'NORMALIZED', 'FAILED', 'IGNORED');
CREATE TYPE "MarketValidationStatus" AS ENUM ('VALID', 'NEEDS_REVIEW', 'REJECTED');
CREATE TYPE "MarketJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');
CREATE TYPE "MarketNormalizedStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "MarketMacroRegion" AS ENUM ('NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL');

-- AlterTable
ALTER TABLE "MarketRegion"
  ADD COLUMN "macroRegion" "MarketMacroRegion";

-- CreateTable
CREATE TABLE "MarketRawCapture" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referenceDate" TIMESTAMP(3),
  "rawTitle" TEXT,
  "rawText" TEXT,
  "rawUrl" TEXT,
  "rawPayload" JSONB,
  "captureMethod" "MarketCaptureMethod" NOT NULL,
  "status" "MarketCaptureStatus" NOT NULL DEFAULT 'CAPTURED',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketRawCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketNormalizedPrice" (
  "id" TEXT NOT NULL,
  "rawCaptureId" TEXT,
  "sourceId" TEXT NOT NULL,
  "regionId" TEXT,
  "productType" "MarketProductType" NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "unit" "MarketUnit" NOT NULL,
  "paymentType" "MarketPaymentType" NOT NULL DEFAULT 'NAO_INFORMADO',
  "referenceDate" TIMESTAMP(3) NOT NULL,
  "referenceWeightArrobas" DOUBLE PRECISION,
  "confidenceScore" INTEGER NOT NULL,
  "validationStatus" "MarketValidationStatus" NOT NULL,
  "validationReasons" JSONB,
  "normalizedPayload" JSONB,
  "status" "MarketNormalizedStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketNormalizedPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketValidationRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "productType" "MarketProductType",
  "state" TEXT,
  "minPrice" DECIMAL(12,2),
  "maxPrice" DECIMAL(12,2),
  "maxDailyVariationPercent" DOUBLE PRECISION,
  "maxAgeDays" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPublishJob" (
  "id" TEXT NOT NULL,
  "status" "MarketJobStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "sourceId" TEXT,
  "summary" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketPublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketRawCapture_sourceId_capturedAt_idx" ON "MarketRawCapture"("sourceId", "capturedAt");
CREATE INDEX "MarketRawCapture_status_idx" ON "MarketRawCapture"("status");
CREATE INDEX "MarketNormalizedPrice_sourceId_referenceDate_productType_idx" ON "MarketNormalizedPrice"("sourceId", "referenceDate", "productType");
CREATE INDEX "MarketNormalizedPrice_validationStatus_confidenceScore_idx" ON "MarketNormalizedPrice"("validationStatus", "confidenceScore");
CREATE INDEX "MarketNormalizedPrice_status_createdAt_idx" ON "MarketNormalizedPrice"("status", "createdAt");
CREATE INDEX "MarketValidationRule_isActive_idx" ON "MarketValidationRule"("isActive");
CREATE INDEX "MarketValidationRule_productType_state_idx" ON "MarketValidationRule"("productType", "state");
CREATE INDEX "MarketPublishJob_status_createdAt_idx" ON "MarketPublishJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketRawCapture" ADD CONSTRAINT "MarketRawCapture_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketNormalizedPrice" ADD CONSTRAINT "MarketNormalizedPrice_rawCaptureId_fkey" FOREIGN KEY ("rawCaptureId") REFERENCES "MarketRawCapture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketNormalizedPrice" ADD CONSTRAINT "MarketNormalizedPrice_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketNormalizedPrice" ADD CONSTRAINT "MarketNormalizedPrice_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "MarketRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketPublishJob" ADD CONSTRAINT "MarketPublishJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
