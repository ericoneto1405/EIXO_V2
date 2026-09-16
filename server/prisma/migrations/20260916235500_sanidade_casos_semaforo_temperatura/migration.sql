-- AlterTable
ALTER TABLE "HerdEvent" ADD COLUMN "sale_type" TEXT;
ALTER TABLE "PharmacyProduct" ADD COLUMN "storage_min_temp" DOUBLE PRECISION,
ADD COLUMN "storage_max_temp" DOUBLE PRECISION;
ALTER TABLE "sanitary_applications" ADD COLUMN "cooler_temp_c" DOUBLE PRECISION;

-- Produtos já marcados como refrigerados recebem a faixa padrão 2 a 8 °C
UPDATE "PharmacyProduct" SET "storage_min_temp" = 2, "storage_max_temp" = 8
WHERE "refrigerated" = true AND "storage_min_temp" IS NULL AND "storage_max_temp" IS NULL;

-- CreateTable
CREATE TABLE "sanitary_compliances" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL,
    "protocol" TEXT,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sanitary_compliances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sanitary_cases" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "disease" TEXT NOT NULL,
    "symptoms" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "necropsy" BOOLEAN NOT NULL DEFAULT false,
    "diagnosed_by" TEXT,
    "notes" TEXT,
    "closed_at" TIMESTAMP(3),
    "notifiable" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sanitary_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_temperature_logs" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "temp_c" DOUBLE PRECISION NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "measured_by_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pharmacy_temperature_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sanitary_compliances_farmId_kind_period_key" ON "sanitary_compliances"("farmId", "kind", "period");
CREATE INDEX "sanitary_cases_farmId_started_at_idx" ON "sanitary_cases"("farmId", "started_at");
CREATE INDEX "sanitary_cases_farmId_status_idx" ON "sanitary_cases"("farmId", "status");
CREATE INDEX "sanitary_cases_animalId_idx" ON "sanitary_cases"("animalId");
CREATE INDEX "pharmacy_temperature_logs_farmId_measured_at_idx" ON "pharmacy_temperature_logs"("farmId", "measured_at");

-- AddForeignKey
ALTER TABLE "sanitary_compliances" ADD CONSTRAINT "sanitary_compliances_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sanitary_cases" ADD CONSTRAINT "sanitary_cases_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sanitary_cases" ADD CONSTRAINT "sanitary_cases_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pharmacy_temperature_logs" ADD CONSTRAINT "pharmacy_temperature_logs_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
