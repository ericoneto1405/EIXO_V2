ALTER TABLE "HerdEvent" ADD COLUMN "client_request_id" TEXT;
ALTER TABLE "SanitaryRecord" ADD COLUMN "client_request_id" TEXT;
ALTER TABLE "Weighing" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "HerdEvent_client_request_id_key" ON "HerdEvent"("client_request_id");
CREATE UNIQUE INDEX "SanitaryRecord_client_request_id_key" ON "SanitaryRecord"("client_request_id");
CREATE UNIQUE INDEX "Weighing_clientRequestId_key" ON "Weighing"("clientRequestId");
