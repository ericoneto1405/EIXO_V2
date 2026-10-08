CREATE TABLE "ReproWorkflowRecord" (
 "id" TEXT NOT NULL,
 "farmId" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "clientId" TEXT NOT NULL,
 "animalId" TEXT,
 "sessionId" TEXT,
 "data" JSONB NOT NULL,
 "createdById" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ReproWorkflowRecord_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ReproWorkflowRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReproWorkflowRecord_farmId_clientId_key" ON "ReproWorkflowRecord"("farmId", "clientId");
CREATE INDEX "ReproWorkflowRecord_farmId_kind_createdAt_idx" ON "ReproWorkflowRecord"("farmId", "kind", "createdAt");
CREATE INDEX "ReproWorkflowRecord_farmId_sessionId_idx" ON "ReproWorkflowRecord"("farmId", "sessionId");
CREATE INDEX "ReproWorkflowRecord_farmId_animalId_idx" ON "ReproWorkflowRecord"("farmId", "animalId");
