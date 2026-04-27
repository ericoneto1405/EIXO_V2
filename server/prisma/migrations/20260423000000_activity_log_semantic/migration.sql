CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "farmId" TEXT,
    "action" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "description" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ActivityLog_organizationId_createdAt_idx" ON "ActivityLog"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- Tornar method e path opcionais
ALTER TABLE "ActivityLog" ALTER COLUMN "method" DROP NOT NULL;
ALTER TABLE "ActivityLog" ALTER COLUMN "path" DROP NOT NULL;

-- Adicionar campos semânticos
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "action"      TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entity"      TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entityId"    TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "farmId"      TEXT;

-- Índice por fazenda
CREATE INDEX IF NOT EXISTS "ActivityLog_farmId_createdAt_idx" ON "ActivityLog"("farmId", "createdAt");
