-- Reconciliação: alinhar migrations com o schema (avatarUrl + índice de phone).
-- IF NOT EXISTS torna idempotente: pula onde já existe (dev), cria onde falta (produção).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

CREATE INDEX IF NOT EXISTS "User_phone_idx" ON "User"("phone");
