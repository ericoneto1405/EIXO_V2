CREATE TABLE "AccountClosureRequest" (
    "protocol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requesterUserId" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AccountClosureRequest_pkey" PRIMARY KEY ("protocol"),
    CONSTRAINT "AccountClosureRequest_type_check" CHECK ("type" IN ('LOGIN', 'ORGANIZATION')),
    CONSTRAINT "AccountClosureRequest_status_check" CHECK ("status" IN ('OPEN', 'CLOSED'))
);

CREATE INDEX "AccountClosureRequest_requesterUserId_type_status_idx"
ON "AccountClosureRequest"("requesterUserId", "type", "status");
CREATE INDEX "AccountClosureRequest_organizationId_type_status_idx"
ON "AccountClosureRequest"("organizationId", "type", "status");

-- A unicidade no banco também protege contra dois pedidos simultâneos.
CREATE UNIQUE INDEX "AccountClosureRequest_open_login_key"
ON "AccountClosureRequest"("requesterUserId")
WHERE "type" = 'LOGIN' AND "status" = 'OPEN' AND "requesterUserId" IS NOT NULL;
CREATE UNIQUE INDEX "AccountClosureRequest_open_organization_key"
ON "AccountClosureRequest"("organizationId")
WHERE "type" = 'ORGANIZATION' AND "status" = 'OPEN' AND "organizationId" IS NOT NULL;

ALTER TABLE "AccountClosureRequest"
ADD CONSTRAINT "AccountClosureRequest_requesterUserId_fkey"
FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountClosureRequest"
ADD CONSTRAINT "AccountClosureRequest_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
