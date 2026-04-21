-- CreateEnum
CREATE TYPE "NutritionOperationContext" AS ENUM ('CONFINAMENTO', 'PASTO', 'SEMI_CONFINAMENTO');

-- CreateEnum
CREATE TYPE "NutritionAdjustmentMode" AS ENUM ('SUGESTAO', 'REVISAO_OBRIGATORIA', 'AUTOMATICO');

-- CreateEnum
CREATE TYPE "NutritionUnitType" AS ENUM ('BAIA', 'LOTE', 'PONTO_TRATO');

-- CreateEnum
CREATE TYPE "NutritionPreparedFeedStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "NutritionPlanLifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NutritionFabricationStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELED', 'REVERSED');

-- CreateEnum
CREATE TYPE "NutritionReadingType" AS ENUM ('DIURNA', 'NOTURNA');

-- CreateEnum
CREATE TYPE "NutritionAnimalBehavior" AS ENUM ('RUMINANDO', 'NORMAL', 'INQUIETO', 'APATICO', 'OUTRO');

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewStatus') THEN
        CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED');
    END IF;
END $$;







-- Ensure legacy nutrition tables exist for shadow database replay
CREATE TABLE IF NOT EXISTS "NutritionPlan" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fase" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "metaGmd" DOUBLE PRECISION,
    "observacoes" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NutritionAssignment" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "lotId" TEXT,
    "animalId" TEXT,
    "poAnimalId" TEXT,
    "poLotId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NutritionPlan_farmId_idx" ON "NutritionPlan"("farmId");
CREATE INDEX IF NOT EXISTS "NutritionAssignment_farmId_idx" ON "NutritionAssignment"("farmId");
CREATE INDEX IF NOT EXISTS "NutritionAssignment_planId_idx" ON "NutritionAssignment"("planId");
CREATE INDEX IF NOT EXISTS "NutritionAssignment_lotId_idx" ON "NutritionAssignment"("lotId");
CREATE INDEX IF NOT EXISTS "NutritionAssignment_animalId_idx" ON "NutritionAssignment"("animalId");
CREATE INDEX IF NOT EXISTS "NutritionAssignment_poAnimalId_idx" ON "NutritionAssignment"("poAnimalId");
CREATE INDEX IF NOT EXISTS "NutritionAssignment_poLotId_idx" ON "NutritionAssignment"("poLotId");
CREATE INDEX IF NOT EXISTS "NutritionAssignment_farmId_startAt_idx" ON "NutritionAssignment"("farmId", "startAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NutritionPlan_farmId_fkey') THEN
        ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_farmId_fkey"
        FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NutritionAssignment_farmId_fkey') THEN
        ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_farmId_fkey"
        FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NutritionAssignment_planId_fkey') THEN
        ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_planId_fkey"
        FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NutritionAssignment_lotId_fkey') THEN
        ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_lotId_fkey"
        FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NutritionAssignment_animalId_fkey') THEN
        ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_animalId_fkey"
        FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NutritionAssignment_poAnimalId_fkey') THEN
        ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_poAnimalId_fkey"
        FOREIGN KEY ("poAnimalId") REFERENCES "PoAnimal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NutritionAssignment_poLotId_fkey') THEN
        ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_poLotId_fkey"
        FOREIGN KEY ("poLotId") REFERENCES "PoLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AlterTable
ALTER TABLE "NutritionAssignment" ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "NutritionExecution" ADD COLUMN     "actualNaturalKg" DOUBLE PRECISION,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByName" TEXT,
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "canceledByName" TEXT,
ADD COLUMN     "canceledByUserId" TEXT,
ADD COLUMN     "costPerHeadDay" DOUBLE PRECISION,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "fabricationId" TEXT,
ADD COLUMN     "feedingSlot" TEXT,
ADD COLUMN     "headCountSnapshot" INTEGER,
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "plannedNaturalKg" DOUBLE PRECISION,
ADD COLUMN     "preparedFeedId" TEXT,
ADD COLUMN     "refusalNaturalKg" DOUBLE PRECISION,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedByName" TEXT,
ADD COLUMN     "rejectedByUserId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "totalCost" DOUBLE PRECISION,
ADD COLUMN     "unitId" TEXT;

-- AlterTable
ALTER TABLE "NutritionPlan" ADD COLUMN     "estimatedCostPerHeadDay" DOUBLE PRECISION,
ADD COLUMN     "feedingSlot" TEXT,
ADD COLUMN     "objetivo" TEXT,
ADD COLUMN     "phaseId" TEXT,
ADD COLUMN     "plannedIntakeDryKgPerHead" DOUBLE PRECISION,
ADD COLUMN     "plannedIntakeDryKgTotal" DOUBLE PRECISION,
ADD COLUMN     "plannedIntakeNaturalKgPerHead" DOUBLE PRECISION,
ADD COLUMN     "plannedIntakeNaturalKgTotal" DOUBLE PRECISION,
ADD COLUMN     "preparedFeedId" TEXT,
ADD COLUMN     "previousVersionId" TEXT,
ADD COLUMN     "status" "NutritionPlanLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "versionNumber" INTEGER NOT NULL DEFAULT 1;








-- CreateTable
CREATE TABLE "NutritionSettings" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "operationContext" "NutritionOperationContext" NOT NULL DEFAULT 'PASTO',
    "adjustmentMode" "NutritionAdjustmentMode" NOT NULL DEFAULT 'SUGESTAO',
    "indicatorsApprovedOnly" BOOLEAN NOT NULL DEFAULT false,
    "requireFabricationApproval" BOOLEAN NOT NULL DEFAULT true,
    "requireExecutionApproval" BOOLEAN NOT NULL DEFAULT true,
    "requireTroughApproval" BOOLEAN NOT NULL DEFAULT true,
    "predictiveSafeDays" INTEGER NOT NULL DEFAULT 7,
    "predictiveWarningDays" INTEGER NOT NULL DEFAULT 3,
    "diffWarningPercent" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "diffCriticalPercent" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "manualReviewThresholdPercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPhase" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "primaryPlanId" TEXT,
    "targetIntakeDryKgHead" DOUBLE PRECISION,
    "targetGmd" DOUBLE PRECISION,
    "targetFeedConversion" DOUBLE PRECISION,
    "targetCostPerHeadDay" DOUBLE PRECISION,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionUnit" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "lotId" TEXT,
    "phaseId" TEXT,
    "type" "NutritionUnitType" NOT NULL,
    "name" TEXT NOT NULL,
    "currentHeadCount" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionIngredient" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentCost" DOUBLE PRECISION NOT NULL,
    "supplier" TEXT,
    "currentDryMatterPercent" DOUBLE PRECISION NOT NULL,
    "dryMatterUpdatedAt" TIMESTAMP(3),
    "currentStockNatural" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStockNatural" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionIngredientCostHistory" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,

    CONSTRAINT "NutritionIngredientCostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionIngredientDryMatterHistory" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "dryMatterPercent" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,

    CONSTRAINT "NutritionIngredientDryMatterHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPreparedFeed" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expectedYieldNaturalKg" DOUBLE PRECISION NOT NULL,
    "expectedYieldDryKg" DOUBLE PRECISION,
    "currentDryMatterPercent" DOUBLE PRECISION NOT NULL,
    "currentTotalCost" DOUBLE PRECISION NOT NULL,
    "currentCostPerNaturalKg" DOUBLE PRECISION NOT NULL,
    "currentCostPerDryKg" DOUBLE PRECISION,
    "currentStockNatural" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStockDry" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "NutritionPreparedFeedStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPreparedFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPreparedFeedItem" (
    "id" TEXT NOT NULL,
    "preparedFeedId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "proportionPercent" DOUBLE PRECISION NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPreparedFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionFabrication" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "preparedFeedId" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL,
    "outputNaturalKg" DOUBLE PRECISION NOT NULL,
    "outputDryKg" DOUBLE PRECISION NOT NULL,
    "remainingNaturalKg" DOUBLE PRECISION NOT NULL,
    "remainingDryKg" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "costPerNaturalKg" DOUBLE PRECISION NOT NULL,
    "costPerDryKg" DOUBLE PRECISION,
    "status" "NutritionFabricationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledByUserId" TEXT,
    "canceledByName" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionFabrication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionFabricationItem" (
    "id" TEXT NOT NULL,
    "fabricationId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "quantityNaturalKg" DOUBLE PRECISION NOT NULL,
    "quantityDryKg" DOUBLE PRECISION NOT NULL,
    "dryMatterPercent" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "lineCost" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "NutritionFabricationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionExecution" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "lotId" TEXT,
    "poLotId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "plannedDryMatterKg" DOUBLE PRECISION,
    "actualDryMatterKg" DOUBLE PRECISION NOT NULL,
    "refusalDryMatterKg" DOUBLE PRECISION,
    "notes" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionTroughReading" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "readingType" "NutritionReadingType" NOT NULL,
    "score" INTEGER NOT NULL,
    "supplyObservation" TEXT,
    "observedDryMatterPercent" DOUBLE PRECISION,
    "animalBehavior" "NutritionAnimalBehavior" NOT NULL,
    "notes" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedAdjustmentPercent" DOUBLE PRECISION,
    "suggestedNextNaturalKg" DOUBLE PRECISION,
    "suggestedNextDryKg" DOUBLE PRECISION,
    "syncSource" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectedByName" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionTroughReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionSettings_farmId_key" ON "NutritionSettings"("farmId");

-- CreateIndex
CREATE INDEX "NutritionPhase_farmId_idx" ON "NutritionPhase"("farmId");

-- CreateIndex
CREATE INDEX "NutritionPhase_active_idx" ON "NutritionPhase"("active");

-- CreateIndex
CREATE INDEX "NutritionUnit_farmId_idx" ON "NutritionUnit"("farmId");

-- CreateIndex
CREATE INDEX "NutritionUnit_lotId_idx" ON "NutritionUnit"("lotId");

-- CreateIndex
CREATE INDEX "NutritionUnit_phaseId_idx" ON "NutritionUnit"("phaseId");

-- CreateIndex
CREATE INDEX "NutritionUnit_type_idx" ON "NutritionUnit"("type");

-- CreateIndex
CREATE INDEX "NutritionIngredient_farmId_idx" ON "NutritionIngredient"("farmId");

-- CreateIndex
CREATE INDEX "NutritionIngredient_active_idx" ON "NutritionIngredient"("active");

-- CreateIndex
CREATE INDEX "NutritionIngredientCostHistory_ingredientId_idx" ON "NutritionIngredientCostHistory"("ingredientId");

-- CreateIndex
CREATE INDEX "NutritionIngredientCostHistory_recordedAt_idx" ON "NutritionIngredientCostHistory"("recordedAt");

-- CreateIndex
CREATE INDEX "NutritionIngredientDryMatterHistory_ingredientId_idx" ON "NutritionIngredientDryMatterHistory"("ingredientId");

-- CreateIndex
CREATE INDEX "NutritionIngredientDryMatterHistory_recordedAt_idx" ON "NutritionIngredientDryMatterHistory"("recordedAt");

-- CreateIndex
CREATE INDEX "NutritionPreparedFeed_farmId_idx" ON "NutritionPreparedFeed"("farmId");

-- CreateIndex
CREATE INDEX "NutritionPreparedFeed_status_idx" ON "NutritionPreparedFeed"("status");

-- CreateIndex
CREATE INDEX "NutritionPreparedFeedItem_ingredientId_idx" ON "NutritionPreparedFeedItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionPreparedFeedItem_preparedFeedId_ingredientId_key" ON "NutritionPreparedFeedItem"("preparedFeedId", "ingredientId");

-- CreateIndex
CREATE INDEX "NutritionFabrication_farmId_idx" ON "NutritionFabrication"("farmId");

-- CreateIndex
CREATE INDEX "NutritionFabrication_preparedFeedId_idx" ON "NutritionFabrication"("preparedFeedId");

-- CreateIndex
CREATE INDEX "NutritionFabrication_producedAt_idx" ON "NutritionFabrication"("producedAt");

-- CreateIndex
CREATE INDEX "NutritionFabrication_status_idx" ON "NutritionFabrication"("status");

-- CreateIndex
CREATE INDEX "NutritionFabricationItem_fabricationId_idx" ON "NutritionFabricationItem"("fabricationId");

-- CreateIndex
CREATE INDEX "NutritionFabricationItem_ingredientId_idx" ON "NutritionFabricationItem"("ingredientId");

-- CreateIndex
CREATE INDEX "NutritionExecution_farmId_date_idx" ON "NutritionExecution"("farmId", "date");

-- CreateIndex
CREATE INDEX "NutritionExecution_farmId_lotId_date_idx" ON "NutritionExecution"("farmId", "lotId", "date");

-- CreateIndex
CREATE INDEX "NutritionExecution_farmId_poLotId_date_idx" ON "NutritionExecution"("farmId", "poLotId", "date");

-- CreateIndex
CREATE INDEX "NutritionExecution_reviewStatus_idx" ON "NutritionExecution"("reviewStatus");

-- CreateIndex
CREATE INDEX "NutritionTroughReading_farmId_date_idx" ON "NutritionTroughReading"("farmId", "date");

-- CreateIndex
CREATE INDEX "NutritionTroughReading_unitId_idx" ON "NutritionTroughReading"("unitId");

-- CreateIndex
CREATE INDEX "NutritionTroughReading_reviewStatus_idx" ON "NutritionTroughReading"("reviewStatus");

-- CreateIndex
CREATE INDEX "NutritionAssignment_unitId_idx" ON "NutritionAssignment"("unitId");

-- CreateIndex
CREATE INDEX "NutritionExecution_unitId_idx" ON "NutritionExecution"("unitId");

-- CreateIndex
CREATE INDEX "NutritionExecution_planId_idx" ON "NutritionExecution"("planId");

-- CreateIndex
CREATE INDEX "NutritionExecution_preparedFeedId_idx" ON "NutritionExecution"("preparedFeedId");

-- CreateIndex
CREATE INDEX "NutritionExecution_fabricationId_idx" ON "NutritionExecution"("fabricationId");

-- CreateIndex
CREATE INDEX "NutritionPlan_preparedFeedId_idx" ON "NutritionPlan"("preparedFeedId");

-- CreateIndex
CREATE INDEX "NutritionPlan_phaseId_idx" ON "NutritionPlan"("phaseId");

-- CreateIndex
CREATE INDEX "NutritionPlan_status_idx" ON "NutritionPlan"("status");

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_preparedFeedId_fkey" FOREIGN KEY ("preparedFeedId") REFERENCES "NutritionPreparedFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "NutritionPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionAssignment" ADD CONSTRAINT "NutritionAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "NutritionUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionSettings" ADD CONSTRAINT "NutritionSettings_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPhase" ADD CONSTRAINT "NutritionPhase_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionUnit" ADD CONSTRAINT "NutritionUnit_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionUnit" ADD CONSTRAINT "NutritionUnit_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionUnit" ADD CONSTRAINT "NutritionUnit_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "NutritionPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionIngredient" ADD CONSTRAINT "NutritionIngredient_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionIngredientCostHistory" ADD CONSTRAINT "NutritionIngredientCostHistory_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "NutritionIngredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionIngredientDryMatterHistory" ADD CONSTRAINT "NutritionIngredientDryMatterHistory_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "NutritionIngredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPreparedFeed" ADD CONSTRAINT "NutritionPreparedFeed_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPreparedFeedItem" ADD CONSTRAINT "NutritionPreparedFeedItem_preparedFeedId_fkey" FOREIGN KEY ("preparedFeedId") REFERENCES "NutritionPreparedFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionPreparedFeedItem" ADD CONSTRAINT "NutritionPreparedFeedItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "NutritionIngredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionFabrication" ADD CONSTRAINT "NutritionFabrication_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionFabrication" ADD CONSTRAINT "NutritionFabrication_preparedFeedId_fkey" FOREIGN KEY ("preparedFeedId") REFERENCES "NutritionPreparedFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionFabricationItem" ADD CONSTRAINT "NutritionFabricationItem_fabricationId_fkey" FOREIGN KEY ("fabricationId") REFERENCES "NutritionFabrication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionFabricationItem" ADD CONSTRAINT "NutritionFabricationItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "NutritionIngredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionExecution" ADD CONSTRAINT "NutritionExecution_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionExecution" ADD CONSTRAINT "NutritionExecution_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionExecution" ADD CONSTRAINT "NutritionExecution_poLotId_fkey" FOREIGN KEY ("poLotId") REFERENCES "PoLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionExecution" ADD CONSTRAINT "NutritionExecution_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "NutritionUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionExecution" ADD CONSTRAINT "NutritionExecution_planId_fkey" FOREIGN KEY ("planId") REFERENCES "NutritionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionExecution" ADD CONSTRAINT "NutritionExecution_preparedFeedId_fkey" FOREIGN KEY ("preparedFeedId") REFERENCES "NutritionPreparedFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionExecution" ADD CONSTRAINT "NutritionExecution_fabricationId_fkey" FOREIGN KEY ("fabricationId") REFERENCES "NutritionFabrication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionTroughReading" ADD CONSTRAINT "NutritionTroughReading_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionTroughReading" ADD CONSTRAINT "NutritionTroughReading_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "NutritionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
