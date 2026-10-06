ALTER TABLE "sanitary_applications" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'STOCK';
ALTER TABLE "sanitary_applications" ALTER COLUMN "batchId" DROP NOT NULL;
ALTER TABLE "sanitary_applications" ALTER COLUMN "dose" DROP NOT NULL;
CREATE TABLE "sanitary_history_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "farmId" TEXT NOT NULL REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "sanitary_history_requests_farmId_requestId_key" ON "sanitary_history_requests"("farmId", "requestId");

ALTER TABLE "sanitary_applications" ADD CONSTRAINT "sanitary_applications_origin_fields_check"
CHECK ("origin" IN ('STOCK', 'HISTORY') AND
       ("origin" = 'HISTORY' OR ("batchId" IS NOT NULL AND "dose" IS NOT NULL)));
