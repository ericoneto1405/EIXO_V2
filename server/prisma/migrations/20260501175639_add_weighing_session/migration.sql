-- AlterTable
ALTER TABLE "Weighing" ADD COLUMN     "weighingSessionId" TEXT;

-- CreateTable
CREATE TABLE "WeighingSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeighingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeighingSession_farmId_idx" ON "WeighingSession"("farmId");

-- CreateIndex
CREATE INDEX "Weighing_weighingSessionId_idx" ON "Weighing"("weighingSessionId");

-- AddForeignKey
ALTER TABLE "Weighing" ADD CONSTRAINT "Weighing_weighingSessionId_fkey" FOREIGN KEY ("weighingSessionId") REFERENCES "WeighingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeighingSession" ADD CONSTRAINT "WeighingSession_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
