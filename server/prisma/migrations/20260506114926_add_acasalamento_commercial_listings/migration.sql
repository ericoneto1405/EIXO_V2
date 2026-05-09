-- CreateTable
CREATE TABLE "AcasalamentoCommercialListing" (
    "id" TEXT NOT NULL,
    "bullId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "central" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "registration" TEXT,
    "commercialUrl" TEXT,
    "semenAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sourceStatus" "AcasalamentoSyncStatus" NOT NULL DEFAULT 'OK',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcasalamentoCommercialListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcasalamentoCommercialListing_bullId_idx" ON "AcasalamentoCommercialListing"("bullId");

-- CreateIndex
CREATE INDEX "AcasalamentoCommercialListing_sourceId_semenAvailable_idx" ON "AcasalamentoCommercialListing"("sourceId", "semenAvailable");

-- CreateIndex
CREATE INDEX "AcasalamentoCommercialListing_central_semenAvailable_idx" ON "AcasalamentoCommercialListing"("central", "semenAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "AcasalamentoCommercialListing_sourceId_normalizedName_key" ON "AcasalamentoCommercialListing"("sourceId", "normalizedName");

-- AddForeignKey
ALTER TABLE "AcasalamentoCommercialListing" ADD CONSTRAINT "AcasalamentoCommercialListing_bullId_fkey" FOREIGN KEY ("bullId") REFERENCES "AcasalamentoBull"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcasalamentoCommercialListing" ADD CONSTRAINT "AcasalamentoCommercialListing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AcasalamentoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
