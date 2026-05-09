-- CreateEnum
CREATE TYPE "AcasalamentoSourceType" AS ENUM ('COMMERCIAL_CENTER', 'OFFICIAL_ASSOCIATION');

-- CreateEnum
CREATE TYPE "AcasalamentoSyncStatus" AS ENUM ('PENDING', 'OK', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AcasalamentoProofTrait" AS ENUM ('PRECOCIDADE', 'DESMAMA', 'CARCACA', 'MATERNAL', 'NASCIMENTO', 'INDICE_GERAL');

-- CreateEnum
CREATE TYPE "AcasalamentoProofStatus" AS ENUM ('VERIFIED', 'MISSING', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "AcasalamentoTargetMode" AS ENUM ('LOT', 'GROUP', 'INDIVIDUAL', 'UPLOAD');

-- CreateEnum
CREATE TYPE "AcasalamentoIssueSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "AcasalamentoSource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "AcasalamentoSourceType" NOT NULL,
    "breed" TEXT NOT NULL DEFAULT 'Nelore',
    "baseUrl" TEXT NOT NULL,
    "status" "AcasalamentoSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcasalamentoSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcasalamentoBull" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "registration" TEXT,
    "breed" TEXT NOT NULL DEFAULT 'Nelore',
    "central" TEXT NOT NULL,
    "commercialUrl" TEXT,
    "semenAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sourceStatus" "AcasalamentoSyncStatus" NOT NULL DEFAULT 'OK',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcasalamentoBull_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcasalamentoOfficialProof" (
    "id" TEXT NOT NULL,
    "bullId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "breed" TEXT NOT NULL DEFAULT 'Nelore',
    "registry" TEXT,
    "proofTrait" "AcasalamentoProofTrait" NOT NULL,
    "traitLabel" TEXT NOT NULL,
    "dep" DOUBLE PRECISION,
    "deca" INTEGER,
    "accuracy" DOUBLE PRECISION,
    "progenyCount" INTEGER,
    "proofStatus" "AcasalamentoProofStatus" NOT NULL DEFAULT 'INCONCLUSIVE',
    "referenceUrl" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcasalamentoOfficialProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcasalamentoSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "targetMode" "AcasalamentoTargetMode" NOT NULL,
    "objective" "AcasalamentoProofTrait" NOT NULL,
    "breed" TEXT NOT NULL DEFAULT 'Nelore',
    "inputSnapshot" JSONB NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcasalamentoSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcasalamentoRecommendationResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "bullId" TEXT NOT NULL,
    "rank" INTEGER,
    "score" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECOMMENDED',
    "reason" TEXT NOT NULL,
    "alerts" JSONB,
    "proofSnapshot" JSONB,
    "commercialSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcasalamentoRecommendationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcasalamentoCollectionIssue" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceCode" TEXT NOT NULL,
    "severity" "AcasalamentoIssueSeverity" NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "referenceUrl" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcasalamentoCollectionIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcasalamentoSource_code_key" ON "AcasalamentoSource"("code");

-- CreateIndex
CREATE INDEX "AcasalamentoSource_sourceType_breed_idx" ON "AcasalamentoSource"("sourceType", "breed");

-- CreateIndex
CREATE INDEX "AcasalamentoSource_status_lastSyncAt_idx" ON "AcasalamentoSource"("status", "lastSyncAt");

-- CreateIndex
CREATE INDEX "AcasalamentoBull_breed_normalizedName_idx" ON "AcasalamentoBull"("breed", "normalizedName");

-- CreateIndex
CREATE INDEX "AcasalamentoBull_central_semenAvailable_idx" ON "AcasalamentoBull"("central", "semenAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "AcasalamentoBull_sourceId_normalizedName_key" ON "AcasalamentoBull"("sourceId", "normalizedName");

-- CreateIndex
CREATE INDEX "AcasalamentoOfficialProof_proofTrait_proofStatus_idx" ON "AcasalamentoOfficialProof"("proofTrait", "proofStatus");

-- CreateIndex
CREATE INDEX "AcasalamentoOfficialProof_breed_registry_idx" ON "AcasalamentoOfficialProof"("breed", "registry");

-- CreateIndex
CREATE UNIQUE INDEX "AcasalamentoOfficialProof_bullId_sourceId_proofTrait_key" ON "AcasalamentoOfficialProof"("bullId", "sourceId", "proofTrait");

-- CreateIndex
CREATE INDEX "AcasalamentoSession_organizationId_createdAt_idx" ON "AcasalamentoSession"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AcasalamentoSession_farmId_createdAt_idx" ON "AcasalamentoSession"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "AcasalamentoSession_createdById_createdAt_idx" ON "AcasalamentoSession"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "AcasalamentoRecommendationResult_sessionId_rank_idx" ON "AcasalamentoRecommendationResult"("sessionId", "rank");

-- CreateIndex
CREATE INDEX "AcasalamentoRecommendationResult_bullId_idx" ON "AcasalamentoRecommendationResult"("bullId");

-- CreateIndex
CREATE INDEX "AcasalamentoCollectionIssue_sourceCode_createdAt_idx" ON "AcasalamentoCollectionIssue"("sourceCode", "createdAt");

-- CreateIndex
CREATE INDEX "AcasalamentoCollectionIssue_severity_resolvedAt_idx" ON "AcasalamentoCollectionIssue"("severity", "resolvedAt");

-- AddForeignKey
ALTER TABLE "AcasalamentoBull" ADD CONSTRAINT "AcasalamentoBull_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AcasalamentoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoOfficialProof" ADD CONSTRAINT "AcasalamentoOfficialProof_bullId_fkey" FOREIGN KEY ("bullId") REFERENCES "AcasalamentoBull"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoOfficialProof" ADD CONSTRAINT "AcasalamentoOfficialProof_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AcasalamentoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoSession" ADD CONSTRAINT "AcasalamentoSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoSession" ADD CONSTRAINT "AcasalamentoSession_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoSession" ADD CONSTRAINT "AcasalamentoSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoRecommendationResult" ADD CONSTRAINT "AcasalamentoRecommendationResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcasalamentoSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoRecommendationResult" ADD CONSTRAINT "AcasalamentoRecommendationResult_bullId_fkey" FOREIGN KEY ("bullId") REFERENCES "AcasalamentoBull"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoCollectionIssue" ADD CONSTRAINT "AcasalamentoCollectionIssue_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AcasalamentoSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
