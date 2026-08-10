-- Identificação provisória e matriz responsável do rebanho comercial
ALTER TABLE "Animal"
ADD COLUMN "identificacaoProvisoria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "identificacaoAnterior" TEXT,
ADD COLUMN "identificacaoMatrizSnapshot" TEXT,
ADD COLUMN "sequenciaMatriz" INTEGER,
ADD COLUMN "matrizResponsavelId" TEXT,
ADD COLUMN "ultimaSequenciaCria" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "origemNascimento" TEXT,
ADD COLUMN "identificacaoProvisoriaOriginal" TEXT,
ADD COLUMN "receptoraGestacionalId" TEXT,
ADD COLUMN "receptoraGestacionalSnapshot" TEXT,
ADD COLUMN "doadoraSnapshot" TEXT,
ADD COLUMN "touroSnapshot" TEXT,
ADD COLUMN "embryoTransferId" TEXT,
ADD COLUMN "desmamadoEm" TIMESTAMP(3),
ADD COLUMN "pesoDesmamaKg" DOUBLE PRECISION;

-- Genealogia, identificação provisória e tatuagem do Plantel P.O.
ALTER TABLE "PoAnimal"
ADD COLUMN "maeId" TEXT,
ADD COLUMN "maeNome" TEXT,
ADD COLUMN "paiId" TEXT,
ADD COLUMN "paiNome" TEXT,
ADD COLUMN "matrizResponsavelId" TEXT,
ADD COLUMN "identificacaoProvisoria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "identificacaoAnterior" TEXT,
ADD COLUMN "identificacaoMatrizSnapshot" TEXT,
ADD COLUMN "sequenciaMatriz" INTEGER,
ADD COLUMN "ultimaSequenciaCria" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tatuagemOrelhaEsquerda" TEXT,
ADD COLUMN "origemNascimento" TEXT,
ADD COLUMN "identificacaoProvisoriaOriginal" TEXT,
ADD COLUMN "receptoraGestacionalId" TEXT,
ADD COLUMN "receptoraGestacionalSnapshot" TEXT,
ADD COLUMN "doadoraSnapshot" TEXT,
ADD COLUMN "touroSnapshot" TEXT,
ADD COLUMN "embryoTransferId" TEXT,
ADD COLUMN "desmamadoEm" TIMESTAMP(3),
ADD COLUMN "pesoDesmamaKg" DOUBLE PRECISION;

CREATE TABLE "EmbryoTransfer" (
  "id" TEXT NOT NULL,
  "farmId" TEXT NOT NULL,
  "herdType" TEXT NOT NULL,
  "embryoBatchId" TEXT NOT NULL,
  "recipientAnimalId" TEXT,
  "recipientPoAnimalId" TEXT,
  "transferredAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "recipientSnapshot" TEXT NOT NULL,
  "donorKey" TEXT NOT NULL,
  "donorSnapshot" TEXT NOT NULL,
  "sireSnapshot" TEXT,
  "notes" TEXT,
  "birthAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmbryoTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmbryoPairSequence" (
  "id" TEXT NOT NULL,
  "farmId" TEXT NOT NULL,
  "herdType" TEXT NOT NULL,
  "recipientKey" TEXT NOT NULL,
  "donorKey" TEXT NOT NULL,
  "lastSequence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmbryoPairSequence_pkey" PRIMARY KEY ("id")
);

-- Permite que pesagens P.O. participem das sessões existentes.
ALTER TABLE "PoWeighing"
ADD COLUMN "weighingSessionId" TEXT;

ALTER TABLE "WeighingSession"
ADD COLUMN "herdType" TEXT NOT NULL DEFAULT 'COMMERCIAL';

ALTER TABLE "Animal"
ADD CONSTRAINT "Animal_matrizResponsavelId_fkey"
FOREIGN KEY ("matrizResponsavelId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PoAnimal"
ADD CONSTRAINT "PoAnimal_maeId_fkey"
FOREIGN KEY ("maeId") REFERENCES "PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PoAnimal_paiId_fkey"
FOREIGN KEY ("paiId") REFERENCES "PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PoAnimal_matrizResponsavelId_fkey"
FOREIGN KEY ("matrizResponsavelId") REFERENCES "PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PoWeighing"
ADD CONSTRAINT "PoWeighing_weighingSessionId_fkey"
FOREIGN KEY ("weighingSessionId") REFERENCES "WeighingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Animal"
ADD CONSTRAINT "Animal_receptoraGestacionalId_fkey" FOREIGN KEY ("receptoraGestacionalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "Animal_embryoTransferId_fkey" FOREIGN KEY ("embryoTransferId") REFERENCES "EmbryoTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PoAnimal"
ADD CONSTRAINT "PoAnimal_receptoraGestacionalId_fkey" FOREIGN KEY ("receptoraGestacionalId") REFERENCES "PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "PoAnimal_embryoTransferId_fkey" FOREIGN KEY ("embryoTransferId") REFERENCES "EmbryoTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmbryoTransfer"
ADD CONSTRAINT "EmbryoTransfer_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "EmbryoTransfer_embryoBatchId_fkey" FOREIGN KEY ("embryoBatchId") REFERENCES "EmbryoBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "EmbryoTransfer_recipientAnimalId_fkey" FOREIGN KEY ("recipientAnimalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "EmbryoTransfer_recipientPoAnimalId_fkey" FOREIGN KEY ("recipientPoAnimalId") REFERENCES "PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmbryoPairSequence"
ADD CONSTRAINT "EmbryoPairSequence_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Animal_matrizResponsavelId_idx" ON "Animal"("matrizResponsavelId");
CREATE INDEX "Animal_farmId_identificacaoProvisoria_idx" ON "Animal"("farmId", "identificacaoProvisoria");
CREATE INDEX "PoAnimal_maeId_idx" ON "PoAnimal"("maeId");
CREATE INDEX "PoAnimal_paiId_idx" ON "PoAnimal"("paiId");
CREATE INDEX "PoAnimal_matrizResponsavelId_idx" ON "PoAnimal"("matrizResponsavelId");
CREATE INDEX "PoAnimal_farmId_identificacaoProvisoria_idx" ON "PoAnimal"("farmId", "identificacaoProvisoria");
CREATE INDEX "PoWeighing_weighingSessionId_idx" ON "PoWeighing"("weighingSessionId");
CREATE INDEX "WeighingSession_farmId_herdType_idx" ON "WeighingSession"("farmId", "herdType");
CREATE UNIQUE INDEX "Animal_embryoTransferId_key" ON "Animal"("embryoTransferId");
CREATE UNIQUE INDEX "PoAnimal_embryoTransferId_key" ON "PoAnimal"("embryoTransferId");
CREATE INDEX "Animal_receptoraGestacionalId_idx" ON "Animal"("receptoraGestacionalId");
CREATE INDEX "Animal_desmamadoEm_idx" ON "Animal"("desmamadoEm");
CREATE INDEX "PoAnimal_receptoraGestacionalId_idx" ON "PoAnimal"("receptoraGestacionalId");
CREATE INDEX "PoAnimal_desmamadoEm_idx" ON "PoAnimal"("desmamadoEm");
CREATE INDEX "EmbryoTransfer_farmId_herdType_status_idx" ON "EmbryoTransfer"("farmId", "herdType", "status");
CREATE INDEX "EmbryoTransfer_embryoBatchId_idx" ON "EmbryoTransfer"("embryoBatchId");
CREATE INDEX "EmbryoTransfer_recipientAnimalId_idx" ON "EmbryoTransfer"("recipientAnimalId");
CREATE INDEX "EmbryoTransfer_recipientPoAnimalId_idx" ON "EmbryoTransfer"("recipientPoAnimalId");
CREATE UNIQUE INDEX "EmbryoPairSequence_farmId_herdType_recipientKey_donorKey_key" ON "EmbryoPairSequence"("farmId", "herdType", "recipientKey", "donorKey");
CREATE INDEX "EmbryoPairSequence_farmId_herdType_idx" ON "EmbryoPairSequence"("farmId", "herdType");
