-- Reprodução v3 — base (fêmeas aptas + ficha da vaca). Só acrescenta.
ALTER TYPE "ReproEventType" ADD VALUE IF NOT EXISTS 'LIBERACAO';
ALTER TYPE "ReproEventType" ADD VALUE IF NOT EXISTS 'PERDA';
ALTER TYPE "ReproEventType" ADD VALUE IF NOT EXISTS 'ECC';
ALTER TYPE "ReproEventType" ADD VALUE IF NOT EXISTS 'OBSERVACAO';
ALTER TYPE "ReproEventType" ADD VALUE IF NOT EXISTS 'DESCARTE';

ALTER TABLE "ReproEvent" ADD COLUMN "lotId" TEXT;
ALTER TABLE "ReproEvent" ADD COLUMN "createdById" TEXT;
ALTER TABLE "ReproEvent" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Animal" ADD COLUMN "bruceloseInformadaEm" TIMESTAMP(3);
ALTER TABLE "Animal" ADD COLUMN "bruceloseInformadaVacina" TEXT;

CREATE TABLE "ReproSettings" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "idadeMinMeses" INTEGER,
    "pesoMinKg" DOUBLE PRECISION,
    "eccMin" DOUBLE PRECISION,
    "gestacaoDias" INTEGER,
    "desmamaIdadeMeses" INTEGER,
    "desmamaPesoKg" DOUBLE PRECISION,
    "pesoNascerKg" DOUBLE PRECISION,
    "minVacasIndicador" INTEGER NOT NULL DEFAULT 10,
    "vaziasSeguidasLimite" INTEGER,
    "iepMaxMeses" INTEGER,
    "pesoMinDesmamaFarol" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReproSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReproSettings_farmId_key" ON "ReproSettings"("farmId");
ALTER TABLE "ReproSettings" ADD CONSTRAINT "ReproSettings_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
