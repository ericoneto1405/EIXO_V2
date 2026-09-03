-- CreateEnum
CREATE TYPE "CommercialClientType" AS ENUM ('FRIGORIFICO', 'PECUARISTA', 'LEILAO_CORRETOR');

-- CreateEnum
CREATE TYPE "CommercialDealStage" AS ENUM ('PROSPECCAO', 'CONTATO', 'NEGOCIANDO', 'PROPOSTA', 'GANHO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "CommercialReminderType" AS ENUM ('BIRTHDAY', 'INACTIVITY', 'CUSTOM');

-- CreateTable
CREATE TABLE "CommercialClient" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommercialClientType" NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "birthDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialDeal" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "CommercialDealStage" NOT NULL DEFAULT 'PROSPECCAO',
    "lotLabel" TEXT,
    "quantityAnimals" INTEGER,
    "estimatedValue" DOUBLE PRECISION,
    "closedValue" DOUBLE PRECISION,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialContract" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "commissionPct" DOUBLE PRECISION,
    "commissionAmount" DOUBLE PRECISION,
    "paymentTerms" TEXT,
    "fileName" TEXT,
    "storagePath" TEXT,
    "signedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialReminder" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "CommercialReminderType" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialClient_farmId_idx" ON "CommercialClient"("farmId");

-- CreateIndex
CREATE INDEX "CommercialClient_farmId_type_idx" ON "CommercialClient"("farmId", "type");

-- CreateIndex
CREATE INDEX "CommercialDeal_farmId_stage_idx" ON "CommercialDeal"("farmId", "stage");

-- CreateIndex
CREATE INDEX "CommercialDeal_clientId_idx" ON "CommercialDeal"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialContract_dealId_key" ON "CommercialContract"("dealId");

-- CreateIndex
CREATE INDEX "CommercialContract_farmId_idx" ON "CommercialContract"("farmId");

-- CreateIndex
CREATE INDEX "CommercialReminder_farmId_dueDate_idx" ON "CommercialReminder"("farmId", "dueDate");

-- CreateIndex
CREATE INDEX "CommercialReminder_clientId_idx" ON "CommercialReminder"("clientId");

-- AddForeignKey
ALTER TABLE "CommercialClient" ADD CONSTRAINT "CommercialClient_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialClient" ADD CONSTRAINT "CommercialClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialDeal" ADD CONSTRAINT "CommercialDeal_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialDeal" ADD CONSTRAINT "CommercialDeal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CommercialClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialDeal" ADD CONSTRAINT "CommercialDeal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CommercialDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialContract" ADD CONSTRAINT "CommercialContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialReminder" ADD CONSTRAINT "CommercialReminder_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialReminder" ADD CONSTRAINT "CommercialReminder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CommercialClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialReminder" ADD CONSTRAINT "CommercialReminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

