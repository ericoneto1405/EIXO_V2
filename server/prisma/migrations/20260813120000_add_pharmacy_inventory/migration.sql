CREATE TYPE "PharmacyMovementType" AS ENUM ('ENTRY', 'EXIT', 'ADJUSTMENT');

CREATE TABLE "PharmacyProduct" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeIngredient" TEXT,
    "category" TEXT NOT NULL,
    "manufacturer" TEXT,
    "presentation" TEXT,
    "unit" TEXT NOT NULL,
    "applicationUnit" TEXT,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageLocation" TEXT,
    "refrigerated" BOOLEAN NOT NULL DEFAULT false,
    "slaughterWithdrawalDays" INTEGER,
    "milkWithdrawalDays" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PharmacyProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyBatch" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PharmacyBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyMovement" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "PharmacyMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PharmacyMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PharmacyProduct_farmId_name_key" ON "PharmacyProduct"("farmId", "name");
CREATE INDEX "PharmacyProduct_farmId_active_idx" ON "PharmacyProduct"("farmId", "active");
CREATE UNIQUE INDEX "PharmacyBatch_productId_lotNumber_key" ON "PharmacyBatch"("productId", "lotNumber");
CREATE INDEX "PharmacyBatch_farmId_expiresAt_idx" ON "PharmacyBatch"("farmId", "expiresAt");
CREATE INDEX "PharmacyBatch_productId_idx" ON "PharmacyBatch"("productId");
CREATE INDEX "PharmacyMovement_farmId_createdAt_idx" ON "PharmacyMovement"("farmId", "createdAt");
CREATE INDEX "PharmacyMovement_productId_createdAt_idx" ON "PharmacyMovement"("productId", "createdAt");
CREATE INDEX "PharmacyMovement_batchId_createdAt_idx" ON "PharmacyMovement"("batchId", "createdAt");

ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyBatch" ADD CONSTRAINT "PharmacyBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyMovement" ADD CONSTRAINT "PharmacyMovement_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyMovement" ADD CONSTRAINT "PharmacyMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyMovement" ADD CONSTRAINT "PharmacyMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
