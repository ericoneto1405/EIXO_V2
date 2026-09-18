-- Reprodução v3 — Fase 5: IATF e botijão. Só acrescenta; o estoque de sêmen continua o mesmo do Acasalamento.
CREATE TABLE "SemenTank" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canecas" INTEGER,
    "nivelMinCm" DOUBLE PRECISION,
    "intervaloMedicaoDias" INTEGER,
    "ultimaRecargaEm" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SemenTank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SemenTank_farmId_name_key" ON "SemenTank"("farmId", "name");
CREATE INDEX "SemenTank_farmId_idx" ON "SemenTank"("farmId");
ALTER TABLE "SemenTank" ADD CONSTRAINT "SemenTank_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SemenTankReading" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "nivelCm" DOUBLE PRECISION,
    "recarregado" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SemenTankReading_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SemenTankReading_tankId_date_idx" ON "SemenTankReading"("tankId", "date");
ALTER TABLE "SemenTankReading" ADD CONSTRAINT "SemenTankReading_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "SemenTank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SemenBatch" ADD COLUMN "tankId" TEXT;
ALTER TABLE "SemenBatch" ADD COLUMN "caneca" TEXT;
ALTER TABLE "SemenBatch" ADD COLUMN "custoDose" DOUBLE PRECISION;
ALTER TABLE "SemenBatch" ADD CONSTRAINT "SemenBatch_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "SemenTank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReproProtocol" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "passos" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReproProtocol_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReproProtocol_farmId_nome_key" ON "ReproProtocol"("farmId", "nome");
ALTER TABLE "ReproProtocol" ADD CONSTRAINT "ReproProtocol_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IatfSession" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "clientId" TEXT,
    "protocolId" TEXT,
    "dia0" TIMESTAMP(3) NOT NULL,
    "lotId" TEXT,
    "seasonId" TEXT,
    "responsavel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "vacas" JSONB,
    "passosFeitos" JSONB,
    "resumo" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IatfSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IatfSession_farmId_clientId_key" ON "IatfSession"("farmId", "clientId");
CREATE INDEX "IatfSession_farmId_dia0_idx" ON "IatfSession"("farmId", "dia0");
ALTER TABLE "IatfSession" ADD CONSTRAINT "IatfSession_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IatfSession" ADD CONSTRAINT "IatfSession_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ReproProtocol"("id") ON DELETE SET NULL ON UPDATE CASCADE;
