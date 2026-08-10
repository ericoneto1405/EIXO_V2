CREATE TYPE "FinancialCashFlowClass" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');
CREATE TYPE "FinancialResultClass" AS ENUM ('OPERATING_REVENUE', 'PRODUCTION_COST', 'OPERATING_EXPENSE', 'FINANCIAL_RESULT', 'OTHER_RESULT');
CREATE TYPE "FinancialRecognitionRule" AS ENUM ('IMMEDIATE', 'ON_NUTRITION_CONSUMPTION', 'ON_ANIMAL_SALE', 'NOT_IN_RESULT');
CREATE TYPE "FinancialResultStatus" AS ENUM ('ACTIVE', 'REVERSED');
CREATE TYPE "ProductionPhase" AS ENUM ('CRIA', 'RECRIA', 'ENGORDA', 'REPRODUCAO', 'OUTRA');
CREATE TYPE "AnimalPurchasePurpose" AS ENUM ('PRODUCTION', 'BREEDING');

ALTER TABLE "AccountCategory"
  ADD COLUMN "cashFlowClass" "FinancialCashFlowClass",
  ADD COLUMN "resultClass" "FinancialResultClass",
  ADD COLUMN "recognitionRule" "FinancialRecognitionRule",
  ADD COLUMN "isConfigured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deprecatedAt" TIMESTAMP(3);

ALTER TABLE "FinancialTransaction"
  ADD COLUMN "competenceDate" TIMESTAMP(3),
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "modelVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Lot" ADD COLUMN "productionPhase" "ProductionPhase";
ALTER TABLE "PoLot" ADD COLUMN "productionPhase" "ProductionPhase";
ALTER TABLE "HerdEvent" ADD COLUMN "purchasePurpose" "AnimalPurchasePurpose";

CREATE TABLE "OrganizationFinancialSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "analyticsStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modelVersion" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationFinancialSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialResultEntry" (
  "id" TEXT NOT NULL,
  "farmId" TEXT NOT NULL,
  "transactionId" TEXT,
  "accountCategoryId" TEXT,
  "sourceKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "herdEventId" TEXT,
  "sanitaryRecordId" TEXT,
  "nutritionExecutionId" TEXT,
  "resultClass" "FinancialResultClass" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "competenceDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT,
  "status" "FinancialResultStatus" NOT NULL DEFAULT 'ACTIVE',
  "modelVersion" INTEGER NOT NULL DEFAULT 2,
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialResultEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialResultAllocation" (
  "id" TEXT NOT NULL,
  "resultEntryId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "lotId" TEXT,
  "poLotId" TEXT,
  "paddockId" TEXT,
  "productionPhase" "ProductionPhase",
  "lotNameSnapshot" TEXT,
  "paddockNameSnapshot" TEXT,
  "phaseLabelSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialResultAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationFinancialSettings_organizationId_key" ON "OrganizationFinancialSettings"("organizationId");
CREATE UNIQUE INDEX "FinancialResultEntry_sourceKey_key" ON "FinancialResultEntry"("sourceKey");
CREATE INDEX "FinancialResultEntry_farmId_competenceDate_idx" ON "FinancialResultEntry"("farmId", "competenceDate");
CREATE INDEX "FinancialResultEntry_farmId_resultClass_idx" ON "FinancialResultEntry"("farmId", "resultClass");
CREATE INDEX "FinancialResultEntry_transactionId_idx" ON "FinancialResultEntry"("transactionId");
CREATE INDEX "FinancialResultEntry_herdEventId_idx" ON "FinancialResultEntry"("herdEventId");
CREATE INDEX "FinancialResultEntry_sanitaryRecordId_idx" ON "FinancialResultEntry"("sanitaryRecordId");
CREATE INDEX "FinancialResultEntry_nutritionExecutionId_idx" ON "FinancialResultEntry"("nutritionExecutionId");
CREATE INDEX "FinancialResultAllocation_resultEntryId_idx" ON "FinancialResultAllocation"("resultEntryId");
CREATE INDEX "FinancialResultAllocation_lotId_idx" ON "FinancialResultAllocation"("lotId");
CREATE INDEX "FinancialResultAllocation_poLotId_idx" ON "FinancialResultAllocation"("poLotId");
CREATE INDEX "FinancialResultAllocation_paddockId_idx" ON "FinancialResultAllocation"("paddockId");
CREATE INDEX "FinancialResultAllocation_productionPhase_idx" ON "FinancialResultAllocation"("productionPhase");

ALTER TABLE "OrganizationFinancialSettings" ADD CONSTRAINT "OrganizationFinancialSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialResultEntry" ADD CONSTRAINT "FinancialResultEntry_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialResultEntry" ADD CONSTRAINT "FinancialResultEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialResultEntry" ADD CONSTRAINT "FinancialResultEntry_accountCategoryId_fkey" FOREIGN KEY ("accountCategoryId") REFERENCES "AccountCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialResultAllocation" ADD CONSTRAINT "FinancialResultAllocation_resultEntryId_fkey" FOREIGN KEY ("resultEntryId") REFERENCES "FinancialResultEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialResultAllocation" ADD CONSTRAINT "FinancialResultAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialResultAllocation" ADD CONSTRAINT "FinancialResultAllocation_poLotId_fkey" FOREIGN KEY ("poLotId") REFERENCES "PoLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialResultAllocation" ADD CONSTRAINT "FinancialResultAllocation_paddockId_fkey" FOREIGN KEY ("paddockId") REFERENCES "Paddock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
