-- Make dataNascimento and pesoAtual nullable on Animal
-- These fields are already marked as optional in schema.prisma (DateTime?, Float?)
-- but the original migration created them as NOT NULL.
-- The batch entry route (POST /animals/batch) sends null for both when not provided.

ALTER TABLE "Animal" ALTER COLUMN "dataNascimento" DROP NOT NULL;
ALTER TABLE "Animal" ALTER COLUMN "pesoAtual" DROP NOT NULL;
