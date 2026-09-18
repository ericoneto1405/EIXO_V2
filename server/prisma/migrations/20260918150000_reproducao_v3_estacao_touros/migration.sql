-- Reprodução v3 — Fase 6: estação de monta e touros. Só acrescenta.
ALTER TABLE "BreedingSeason" ADD COLUMN "tipo" TEXT;
ALTER TABLE "BreedingSeason" ADD COLUMN "lotIds" JSONB;
ALTER TABLE "BreedingSeason" ADD COLUMN "notes" TEXT;

CREATE TABLE "BullExam" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "resultado" TEXT NOT NULL,
    "libido" TEXT,
    "perimetroCm" DOUBLE PRECISION,
    "vetName" TEXT,
    "vetCrmv" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BullExam_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BullExam_farmId_date_idx" ON "BullExam"("farmId", "date");
CREATE INDEX "BullExam_animalId_date_idx" ON "BullExam"("animalId", "date");
ALTER TABLE "BullExam" ADD CONSTRAINT "BullExam_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BullExam" ADD CONSTRAINT "BullExam_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BullLotAssignment" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "seasonId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "repasse" BOOLEAN NOT NULL DEFAULT false,
    "ajustePct" INTEGER,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BullLotAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BullLotAssignment_farmId_startAt_idx" ON "BullLotAssignment"("farmId", "startAt");
CREATE INDEX "BullLotAssignment_lotId_startAt_idx" ON "BullLotAssignment"("lotId", "startAt");
CREATE INDEX "BullLotAssignment_animalId_idx" ON "BullLotAssignment"("animalId");
ALTER TABLE "BullLotAssignment" ADD CONSTRAINT "BullLotAssignment_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BullLotAssignment" ADD CONSTRAINT "BullLotAssignment_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BullLotAssignment" ADD CONSTRAINT "BullLotAssignment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BullLotAssignment" ADD CONSTRAINT "BullLotAssignment_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "BreedingSeason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
