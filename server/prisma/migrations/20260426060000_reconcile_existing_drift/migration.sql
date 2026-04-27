-- CreateEnum
CREATE TYPE "public"."AnimalTipoCadastro" AS ENUM ('PO', 'MESTICO');

-- CreateEnum
CREATE TYPE "public"."BillingAccessState" AS ENUM ('ACTIVE', 'TRIALING', 'GRACE', 'PAST_DUE', 'BLOCKED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."BillingEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."BillingProvider" AS ENUM ('INTERNAL', 'STRIPE', 'ASAAS', 'PAGARME', 'MERCADOPAGO');

-- CreateEnum
CREATE TYPE "public"."ExternalAllocationType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "public"."ExternalLedgerEntryType" AS ENUM ('FREIGHT', 'SANITARY_PROTOCOL', 'ADVANCE', 'MORTALITY', 'MORTALITY_COMPENSATION', 'MANUAL_DEBIT', 'MANUAL_CREDIT');

-- CreateEnum
CREATE TYPE "public"."ExternalOperationDocumentType" AS ENUM ('SIGNED_CONTRACT', 'WEIGHING_REPORT', 'GTA', 'NF', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ExternalOperationNature" AS ENUM ('SERVICE', 'GAIN_PARTNERSHIP', 'CUSTOM_OPERATION');

-- CreateEnum
CREATE TYPE "public"."ExternalOperationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ExternalPricingModel" AS ENUM ('ARROBA_PRODUCED', 'HEAD_PER_DAY', 'PERCENT_GAIN_SHARE', 'CUSTOM_RULE');

-- CreateEnum
CREATE TYPE "public"."ExternalResponsibilityParty" AS ENUM ('OWNER', 'OPERATOR', 'SHARED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."ExternalSettlementType" AS ENUM ('FINAL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "public"."FeedlotAttachmentType" AS ENUM ('WEIGHING_REPORT', 'GTA', 'NF', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."FeedlotContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PARTIALLY_SETTLED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."FeedlotContractType" AS ENUM ('BOITEL_ARROBA', 'PARCERIA_GANHO');

-- CreateEnum
CREATE TYPE "public"."FeedlotLedgerEntryType" AS ENUM ('FREIGHT', 'SANITARY_PROTOCOL', 'ADVANCE', 'MORTALITY', 'MORTALITY_COMPENSATION', 'MANUAL_DEBIT', 'MANUAL_CREDIT');

-- CreateEnum
CREATE TYPE "public"."FeedlotOperationAllocationType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "public"."FeedlotSettlementType" AS ENUM ('FINAL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "public"."FieldOccurrenceStatus" AS ENUM ('PENDENTE', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "public"."FieldOccurrenceType" AS ENUM ('COCHO', 'AGUA', 'DOENTE', 'AVARIA', 'NASCEU', 'MORREU');

-- CreateEnum
CREATE TYPE "public"."FinancialPayableStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."FinancialReceivableStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."ScaleIntegrationProvider" AS ENUM ('COIMMA');

-- CreateEnum
CREATE TYPE "public"."WeighingSource" AS ENUM ('MANUAL', 'COIMMA');

-- DropIndex
DROP INDEX "public"."Animal_farmId_brinco_key";

-- AlterTable
ALTER TABLE "public"."Animal" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "identityKey" TEXT NOT NULL,
ADD COLUMN     "registro" TEXT,
ADD COLUMN     "tipoCadastro" "public"."AnimalTipoCadastro" NOT NULL DEFAULT 'MESTICO',
ALTER COLUMN "raca" DROP NOT NULL,
ALTER COLUMN "sexo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Farm" ADD COLUMN     "mapAssetPath" TEXT,
ADD COLUMN     "mapData" JSONB;

-- AlterTable
ALTER TABLE "public"."NutritionAssignment" ADD COLUMN     "reviewStatus" "public"."ReviewStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "public"."NutritionPlan" ADD COLUMN     "reviewStatus" "public"."ReviewStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "public"."Organization" DROP COLUMN "billingProvider",
ADD COLUMN     "billingProvider" "public"."BillingProvider" NOT NULL DEFAULT 'INTERNAL',
DROP COLUMN "accessState",
ADD COLUMN     "accessState" "public"."BillingAccessState" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."OrganizationMembership" DROP COLUMN "role",
ADD COLUMN     "role" "public"."OrganizationRole" NOT NULL DEFAULT 'MEMBER',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Paddock" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "mapGeometry" JSONB;

-- AlterTable
ALTER TABLE "public"."Product" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "cnpjData" JSONB,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "public"."Weighing" ADD COLUMN     "provider" "public"."ScaleIntegrationProvider",
ADD COLUMN     "rawPayload" TEXT,
ADD COLUMN     "scaleSessionId" TEXT,
ADD COLUMN     "source" "public"."WeighingSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "public"."BillingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "provider" "public"."BillingProvider" NOT NULL DEFAULT 'INTERNAL',
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "public"."BillingEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillingSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "public"."BillingProvider" NOT NULL DEFAULT 'INTERNAL',
    "providerSubscriptionId" TEXT,
    "planCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CriaMortality" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT,
    "poAnimalId" TEXT,
    "category" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriaMortality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalOperation" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "partnerDocument" TEXT,
    "partnerRoleLabel" TEXT,
    "operationNature" "public"."ExternalOperationNature" NOT NULL,
    "pricingModel" "public"."ExternalPricingModel" NOT NULL,
    "allocationType" "public"."ExternalAllocationType" NOT NULL,
    "externalFarmName" TEXT,
    "externalFarmCity" TEXT,
    "externalFarmState" TEXT,
    "externalUnitName" TEXT,
    "status" "public"."ExternalOperationStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "minDays" INTEGER,
    "maxDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalOperationDocument" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "public"."ExternalOperationDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalOperationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalOperationLedgerEntry" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "public"."ExternalLedgerEntryType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "quantityHeads" INTEGER,
    "responsibility" "public"."ExternalResponsibilityParty",
    "evaluatedWeightKg" DOUBLE PRECISION,
    "evaluatedAmount" DOUBLE PRECISION,
    "offsetReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperationLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalOperationLot" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantityAnimals" INTEGER NOT NULL,
    "avgEntryWeightArroba" DOUBLE PRECISION NOT NULL,
    "entryDate" TIMESTAMP(3),
    "originFarmName" TEXT,
    "originCity" TEXT,
    "originState" TEXT,
    "gtaNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperationLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalOperationResponsibility" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "freightInboundResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "freightOutboundResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "gtaResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "nfResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "transportMortalityResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "postArrivalMortalityResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "sanitaryProtocolResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "extraordinaryCostResponsibility" "public"."ExternalResponsibilityParty" NOT NULL,
    "customNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperationResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalOperationRule" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "lockedArrobaValue" DOUBLE PRECISION,
    "dailyHeadValue" DOUBLE PRECISION,
    "partnerSharePct" DOUBLE PRECISION,
    "operatorSharePct" DOUBLE PRECISION,
    "returnEntryArroba" BOOLEAN NOT NULL DEFAULT false,
    "customRuleDescription" TEXT,
    "sanitaryCostPerHead" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalOperationSettlement" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "public"."ExternalSettlementType" NOT NULL,
    "exitDate" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "quantityAnimals" INTEGER NOT NULL,
    "avgExitWeightArroba" DOUBLE PRECISION NOT NULL,
    "allocatedEntryArroba" DOUBLE PRECISION NOT NULL,
    "totalExitArroba" DOUBLE PRECISION NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "creditAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "remainingAnimals" INTEGER NOT NULL,
    "remainingEntryArroba" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "commercialValue" DOUBLE PRECISION,
    "gtaNumber" TEXT,
    "paymentTerms" TEXT,
    "calcMemory" JSONB NOT NULL,
    "romaneio" JSONB NOT NULL,
    "addendumData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperationSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedlotContract" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "public"."FeedlotContractType" NOT NULL,
    "status" "public"."FeedlotContractStatus" NOT NULL DEFAULT 'DRAFT',
    "allocationType" "public"."FeedlotOperationAllocationType" NOT NULL,
    "allocationFarmName" TEXT,
    "partnerName" TEXT NOT NULL,
    "minDays" INTEGER,
    "maxDays" INTEGER,
    "lockedArrobaValue" DOUBLE PRECISION,
    "sharePartnerPct" DOUBLE PRECISION,
    "shareOperatorPct" DOUBLE PRECISION,
    "returnEntryArroba" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedlotContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedlotContractAttachment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "public"."FeedlotAttachmentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedlotContractAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedlotContractLot" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantityAnimals" INTEGER NOT NULL,
    "avgEntryWeightArroba" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedlotContractLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedlotLedgerEntry" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "public"."FeedlotLedgerEntryType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "quantityHeads" INTEGER,
    "responsibility" TEXT,
    "notes" TEXT,
    "evaluatedWeightKg" DOUBLE PRECISION,
    "evaluatedAmount" DOUBLE PRECISION,
    "offsetReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedlotLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedlotSettlement" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "public"."FeedlotSettlementType" NOT NULL,
    "exitDate" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "quantityAnimals" INTEGER NOT NULL,
    "avgExitWeightArroba" DOUBLE PRECISION NOT NULL,
    "allocatedEntryArroba" DOUBLE PRECISION NOT NULL,
    "totalExitArroba" DOUBLE PRECISION NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL,
    "creditAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "remainingAnimals" INTEGER NOT NULL,
    "remainingEntryArroba" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "commercialValue" DOUBLE PRECISION,
    "gtaNumber" TEXT,
    "paymentTerms" TEXT,
    "calcMemory" JSONB NOT NULL,
    "romaneio" JSONB NOT NULL,
    "addendumData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedlotSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FieldOccurrence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "public"."FieldOccurrenceType" NOT NULL,
    "status" "public"."FieldOccurrenceStatus" NOT NULL DEFAULT 'PENDENTE',
    "description" TEXT,
    "animalId" TEXT,
    "paddockId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "offlineCreatedAt" TIMESTAMP(3),
    "syncSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FieldOccurrenceAttachment" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldOccurrenceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialPayable" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "public"."FinancialPayableStatus" NOT NULL DEFAULT 'PENDING',
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialReceivable" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "status" "public"."FinancialReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GeneticsAnalysisRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT,
    "createdById" TEXT NOT NULL,
    "herdType" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "objective" TEXT,
    "inputFileName" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneticsAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GeneticsAnalysisTopResult" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "topBullName" TEXT NOT NULL,
    "central" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "trustSeal" TEXT,

    CONSTRAINT "GeneticsAnalysisTopResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HerdImportPending" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "herdType" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "cells" JSONB NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HerdImportPending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NutritionCostEntry" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "lotId" TEXT,
    "poLotId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "costType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "reviewStatus" "public"."ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionCostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserFarmAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFarmAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."repro_checkup_records" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "aptitude" TEXT NOT NULL,
    "diagnosis" TEXT,
    "notes" TEXT,
    "discard_light" TEXT,
    "discard_reason" TEXT,
    "calf_quality" TEXT,
    "veterinarian_decision" TEXT,
    "iatf_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repro_checkup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."repro_checkup_sessions" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "responsible_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repro_checkup_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingEvent_organizationId_createdAt_idx" ON "public"."BillingEvent"("organizationId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_provider_eventId_key" ON "public"."BillingEvent"("provider" ASC, "eventId" ASC);

-- CreateIndex
CREATE INDEX "BillingSubscription_organizationId_idx" ON "public"."BillingSubscription"("organizationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_provider_providerSubscriptionId_key" ON "public"."BillingSubscription"("provider" ASC, "providerSubscriptionId" ASC);

-- CreateIndex
CREATE INDEX "CriaMortality_animalId_idx" ON "public"."CriaMortality"("animalId" ASC);

-- CreateIndex
CREATE INDEX "CriaMortality_farmId_date_idx" ON "public"."CriaMortality"("farmId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "CriaMortality_poAnimalId_idx" ON "public"."CriaMortality"("poAnimalId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOperation_farmId_code_key" ON "public"."ExternalOperation"("farmId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "ExternalOperation_farmId_status_idx" ON "public"."ExternalOperation"("farmId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "ExternalOperationDocument_operationId_idx" ON "public"."ExternalOperationDocument"("operationId" ASC);

-- CreateIndex
CREATE INDEX "ExternalOperationLedgerEntry_operationId_occurredAt_idx" ON "public"."ExternalOperationLedgerEntry"("operationId" ASC, "occurredAt" ASC);

-- CreateIndex
CREATE INDEX "ExternalOperationLedgerEntry_operationId_type_idx" ON "public"."ExternalOperationLedgerEntry"("operationId" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "ExternalOperationLot_operationId_idx" ON "public"."ExternalOperationLot"("operationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOperationResponsibility_operationId_key" ON "public"."ExternalOperationResponsibility"("operationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOperationRule_operationId_key" ON "public"."ExternalOperationRule"("operationId" ASC);

-- CreateIndex
CREATE INDEX "ExternalOperationSettlement_operationId_exitDate_idx" ON "public"."ExternalOperationSettlement"("operationId" ASC, "exitDate" ASC);

-- CreateIndex
CREATE INDEX "ExternalOperationSettlement_operationId_type_idx" ON "public"."ExternalOperationSettlement"("operationId" ASC, "type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "FeedlotContract_farmId_code_key" ON "public"."FeedlotContract"("farmId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "FeedlotContract_farmId_status_idx" ON "public"."FeedlotContract"("farmId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "FeedlotContractAttachment_contractId_idx" ON "public"."FeedlotContractAttachment"("contractId" ASC);

-- CreateIndex
CREATE INDEX "FeedlotContractLot_contractId_idx" ON "public"."FeedlotContractLot"("contractId" ASC);

-- CreateIndex
CREATE INDEX "FeedlotLedgerEntry_contractId_occurredAt_idx" ON "public"."FeedlotLedgerEntry"("contractId" ASC, "occurredAt" ASC);

-- CreateIndex
CREATE INDEX "FeedlotLedgerEntry_contractId_type_idx" ON "public"."FeedlotLedgerEntry"("contractId" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "FeedlotSettlement_contractId_exitDate_idx" ON "public"."FeedlotSettlement"("contractId" ASC, "exitDate" ASC);

-- CreateIndex
CREATE INDEX "FeedlotSettlement_contractId_type_idx" ON "public"."FeedlotSettlement"("contractId" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "FieldOccurrence_animalId_idx" ON "public"."FieldOccurrence"("animalId" ASC);

-- CreateIndex
CREATE INDEX "FieldOccurrence_createdById_occurredAt_idx" ON "public"."FieldOccurrence"("createdById" ASC, "occurredAt" ASC);

-- CreateIndex
CREATE INDEX "FieldOccurrence_farmId_status_occurredAt_idx" ON "public"."FieldOccurrence"("farmId" ASC, "status" ASC, "occurredAt" ASC);

-- CreateIndex
CREATE INDEX "FieldOccurrence_organizationId_farmId_occurredAt_idx" ON "public"."FieldOccurrence"("organizationId" ASC, "farmId" ASC, "occurredAt" ASC);

-- CreateIndex
CREATE INDEX "FieldOccurrence_paddockId_idx" ON "public"."FieldOccurrence"("paddockId" ASC);

-- CreateIndex
CREATE INDEX "FieldOccurrenceAttachment_occurrenceId_idx" ON "public"."FieldOccurrenceAttachment"("occurrenceId" ASC);

-- CreateIndex
CREATE INDEX "FinancialPayable_farmId_dueDate_idx" ON "public"."FinancialPayable"("farmId" ASC, "dueDate" ASC);

-- CreateIndex
CREATE INDEX "FinancialPayable_farmId_status_idx" ON "public"."FinancialPayable"("farmId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "FinancialReceivable_farmId_dueDate_idx" ON "public"."FinancialReceivable"("farmId" ASC, "dueDate" ASC);

-- CreateIndex
CREATE INDEX "FinancialReceivable_farmId_status_idx" ON "public"."FinancialReceivable"("farmId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "GeneticsAnalysisRun_createdById_createdAt_idx" ON "public"."GeneticsAnalysisRun"("createdById" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "GeneticsAnalysisRun_farmId_createdAt_idx" ON "public"."GeneticsAnalysisRun"("farmId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "GeneticsAnalysisRun_organizationId_createdAt_idx" ON "public"."GeneticsAnalysisRun"("organizationId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "GeneticsAnalysisTopResult_analysisRunId_idx" ON "public"."GeneticsAnalysisTopResult"("analysisRunId" ASC);

-- CreateIndex
CREATE INDEX "HerdImportPending_farmId_batchId_idx" ON "public"."HerdImportPending"("farmId" ASC, "batchId" ASC);

-- CreateIndex
CREATE INDEX "HerdImportPending_farmId_herdType_createdAt_idx" ON "public"."HerdImportPending"("farmId" ASC, "herdType" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "NutritionCostEntry_farmId_date_idx" ON "public"."NutritionCostEntry"("farmId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "NutritionCostEntry_farmId_lotId_date_idx" ON "public"."NutritionCostEntry"("farmId" ASC, "lotId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "NutritionCostEntry_farmId_poLotId_date_idx" ON "public"."NutritionCostEntry"("farmId" ASC, "poLotId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "NutritionCostEntry_reviewStatus_idx" ON "public"."NutritionCostEntry"("reviewStatus" ASC);

-- CreateIndex
CREATE INDEX "UserFarmAccess_farmId_idx" ON "public"."UserFarmAccess"("farmId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserFarmAccess_userId_farmId_key" ON "public"."UserFarmAccess"("userId" ASC, "farmId" ASC);

-- CreateIndex
CREATE INDEX "UserFarmAccess_userId_idx" ON "public"."UserFarmAccess"("userId" ASC);

-- CreateIndex
CREATE INDEX "idx_repro_checkup_records_farm_animal" ON "public"."repro_checkup_records"("farm_id" ASC, "animal_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_repro_checkup_sessions_farm" ON "public"."repro_checkup_sessions"("farm_id" ASC, "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "Animal_farmId_brinco_idx" ON "public"."Animal"("farmId" ASC, "brinco" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Animal_farmId_identityKey_key" ON "public"."Animal"("farmId" ASC, "identityKey" ASC);

-- CreateIndex
CREATE INDEX "Animal_farmId_registro_idx" ON "public"."Animal"("farmId" ASC, "registro" ASC);

-- CreateIndex
CREATE INDEX "Organization_accessState_idx" ON "public"."Organization"("accessState" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Weighing_scaleSessionId_key" ON "public"."Weighing"("scaleSessionId" ASC);

-- AddForeignKey
ALTER TABLE "public"."BillingEvent" ADD CONSTRAINT "BillingEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingSubscription" ADD CONSTRAINT "BillingSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CriaMortality" ADD CONSTRAINT "CriaMortality_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "public"."Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CriaMortality" ADD CONSTRAINT "CriaMortality_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CriaMortality" ADD CONSTRAINT "CriaMortality_poAnimalId_fkey" FOREIGN KEY ("poAnimalId") REFERENCES "public"."PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperation" ADD CONSTRAINT "ExternalOperation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperation" ADD CONSTRAINT "ExternalOperation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationDocument" ADD CONSTRAINT "ExternalOperationDocument_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "public"."ExternalOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationLedgerEntry" ADD CONSTRAINT "ExternalOperationLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationLedgerEntry" ADD CONSTRAINT "ExternalOperationLedgerEntry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "public"."ExternalOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationLot" ADD CONSTRAINT "ExternalOperationLot_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "public"."ExternalOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationResponsibility" ADD CONSTRAINT "ExternalOperationResponsibility_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "public"."ExternalOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationRule" ADD CONSTRAINT "ExternalOperationRule_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "public"."ExternalOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationSettlement" ADD CONSTRAINT "ExternalOperationSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalOperationSettlement" ADD CONSTRAINT "ExternalOperationSettlement_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "public"."ExternalOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotContract" ADD CONSTRAINT "FeedlotContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotContract" ADD CONSTRAINT "FeedlotContract_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotContractAttachment" ADD CONSTRAINT "FeedlotContractAttachment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."FeedlotContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotContractLot" ADD CONSTRAINT "FeedlotContractLot_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."FeedlotContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotLedgerEntry" ADD CONSTRAINT "FeedlotLedgerEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."FeedlotContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotLedgerEntry" ADD CONSTRAINT "FeedlotLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotSettlement" ADD CONSTRAINT "FeedlotSettlement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."FeedlotContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedlotSettlement" ADD CONSTRAINT "FeedlotSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldOccurrence" ADD CONSTRAINT "FieldOccurrence_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "public"."Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldOccurrence" ADD CONSTRAINT "FieldOccurrence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldOccurrence" ADD CONSTRAINT "FieldOccurrence_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldOccurrence" ADD CONSTRAINT "FieldOccurrence_paddockId_fkey" FOREIGN KEY ("paddockId") REFERENCES "public"."Paddock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FieldOccurrenceAttachment" ADD CONSTRAINT "FieldOccurrenceAttachment_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "public"."FieldOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialPayable" ADD CONSTRAINT "FinancialPayable_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancialReceivable" ADD CONSTRAINT "FinancialReceivable_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneticsAnalysisRun" ADD CONSTRAINT "GeneticsAnalysisRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneticsAnalysisRun" ADD CONSTRAINT "GeneticsAnalysisRun_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneticsAnalysisRun" ADD CONSTRAINT "GeneticsAnalysisRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneticsAnalysisTopResult" ADD CONSTRAINT "GeneticsAnalysisTopResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "public"."GeneticsAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HerdImportPending" ADD CONSTRAINT "HerdImportPending_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NutritionCostEntry" ADD CONSTRAINT "NutritionCostEntry_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NutritionCostEntry" ADD CONSTRAINT "NutritionCostEntry_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "public"."Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NutritionCostEntry" ADD CONSTRAINT "NutritionCostEntry_poLotId_fkey" FOREIGN KEY ("poLotId") REFERENCES "public"."PoLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFarmAccess" ADD CONSTRAINT "UserFarmAccess_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFarmAccess" ADD CONSTRAINT "UserFarmAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."repro_checkup_records" ADD CONSTRAINT "repro_checkup_records_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "public"."Animal"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."repro_checkup_records" ADD CONSTRAINT "repro_checkup_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."repro_checkup_records" ADD CONSTRAINT "repro_checkup_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."repro_checkup_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."repro_checkup_sessions" ADD CONSTRAINT "repro_checkup_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."repro_checkup_sessions" ADD CONSTRAINT "repro_checkup_sessions_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "public"."Farm"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

