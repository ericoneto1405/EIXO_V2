-- Reprodução v3 — Fase 2: toque/ultrassom em lote. Só acrescenta.
CREATE TABLE "ReproDiagnosisSession" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "clientId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "metodo" TEXT NOT NULL,
    "vetName" TEXT,
    "vetCrmv" TEXT,
    "lotId" TEXT,
    "seasonId" TEXT,
    "notes" TEXT,
    "pendencias" JSONB,
    "resumo" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReproDiagnosisSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReproDiagnosisSession_farmId_clientId_key" ON "ReproDiagnosisSession"("farmId", "clientId");
CREATE INDEX "ReproDiagnosisSession_farmId_date_idx" ON "ReproDiagnosisSession"("farmId", "date");
ALTER TABLE "ReproDiagnosisSession" ADD CONSTRAINT "ReproDiagnosisSession_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReproEvent" ADD COLUMN "diagnosisSessionId" TEXT;
CREATE INDEX "ReproEvent_diagnosisSessionId_idx" ON "ReproEvent"("diagnosisSessionId");
ALTER TABLE "ReproEvent" ADD CONSTRAINT "ReproEvent_diagnosisSessionId_fkey" FOREIGN KEY ("diagnosisSessionId") REFERENCES "ReproDiagnosisSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
