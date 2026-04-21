CREATE TABLE "HerdEvent" (
  "id" TEXT NOT NULL,
  "farmId" TEXT NOT NULL,
  "animalId" TEXT,
  "poAnimalId" TEXT,
  "type" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "peso" DOUBLE PRECISION,
  "valor" DOUBLE PRECISION,
  "origem" TEXT,
  "destino" TEXT,
  "observacoes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HerdEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SanitaryRecord" (
  "id" TEXT NOT NULL,
  "farmId" TEXT NOT NULL,
  "animalId" TEXT,
  "poAnimalId" TEXT,
  "tipo" TEXT NOT NULL,
  "produto" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "dose" TEXT,
  "proximaAplicacao" TIMESTAMP(3),
  "observacoes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SanitaryRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HerdEvent_farmId_idx" ON "HerdEvent"("farmId");
CREATE INDEX "HerdEvent_animalId_idx" ON "HerdEvent"("animalId");
CREATE INDEX "HerdEvent_poAnimalId_idx" ON "HerdEvent"("poAnimalId");
CREATE INDEX "SanitaryRecord_farmId_idx" ON "SanitaryRecord"("farmId");
CREATE INDEX "SanitaryRecord_animalId_idx" ON "SanitaryRecord"("animalId");
CREATE INDEX "SanitaryRecord_poAnimalId_idx" ON "SanitaryRecord"("poAnimalId");

ALTER TABLE "HerdEvent" ADD CONSTRAINT "HerdEvent_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HerdEvent" ADD CONSTRAINT "HerdEvent_animalId_fkey"
  FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HerdEvent" ADD CONSTRAINT "HerdEvent_poAnimalId_fkey"
  FOREIGN KEY ("poAnimalId") REFERENCES "PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SanitaryRecord" ADD CONSTRAINT "SanitaryRecord_farmId_fkey"
  FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SanitaryRecord" ADD CONSTRAINT "SanitaryRecord_animalId_fkey"
  FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SanitaryRecord" ADD CONSTRAINT "SanitaryRecord_poAnimalId_fkey"
  FOREIGN KEY ("poAnimalId") REFERENCES "PoAnimal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
