-- AlterTable
ALTER TABLE "PharmacyProduct" ADD COLUMN "application_per_unit" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "sanitary_applications" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL,
    "dose" DOUBLE PRECISION NOT NULL,
    "dose_unit" TEXT NOT NULL,
    "route" TEXT,
    "applied_by_name" TEXT,
    "vet_name" TEXT,
    "vet_crmv" TEXT,
    "slaughter_withdrawal_until" TIMESTAMP(3),
    "withdrawal_unknown" BOOLEAN NOT NULL DEFAULT false,
    "unit_cost" DOUBLE PRECISION,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanitary_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sanitary_applications_farmId_applied_at_idx" ON "sanitary_applications"("farmId", "applied_at");
CREATE INDEX "sanitary_applications_animalId_applied_at_idx" ON "sanitary_applications"("animalId", "applied_at");
CREATE INDEX "sanitary_applications_farmId_slaughter_withdrawal_until_idx" ON "sanitary_applications"("farmId", "slaughter_withdrawal_until");
CREATE INDEX "sanitary_applications_group_id_idx" ON "sanitary_applications"("group_id");

-- AddForeignKey
ALTER TABLE "sanitary_applications" ADD CONSTRAINT "sanitary_applications_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sanitary_applications" ADD CONSTRAINT "sanitary_applications_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sanitary_applications" ADD CONSTRAINT "sanitary_applications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "sanitary_applications" ADD CONSTRAINT "sanitary_applications_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
