-- CreateTable
CREATE TABLE "sanitary_settings" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "rabies_required" TEXT NOT NULL DEFAULT 'NAO_SEI',
    "clostridial_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reproductive_enabled" BOOLEAN NOT NULL DEFAULT true,
    "deworm_enabled" BOOLEAN NOT NULL DEFAULT true,
    "deworm_months" INTEGER[],
    "tick_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tick_months" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sanitary_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sanitary_settings_farmId_key" ON "sanitary_settings"("farmId");

-- AddForeignKey
ALTER TABLE "sanitary_settings" ADD CONSTRAINT "sanitary_settings_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
