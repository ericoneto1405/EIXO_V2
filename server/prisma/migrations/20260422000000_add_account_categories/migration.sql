-- CreateEnum (guard: skip if already exists)
DO $$ BEGIN
    CREATE TYPE "FinancialTransactionType" AS ENUM ('ENTRADA', 'SAIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "FinancialTransactionCategoria" AS ENUM (
        'VENDA_ANIMAIS', 'COMPRA_ANIMAIS', 'MEDICAMENTOS', 'ALIMENTACAO', 'MAO_DE_OBRA', 'OUTROS'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AccountCategoryType" AS ENUM ('ENTRADA', 'SAIDA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable FinancialTransaction (IF NOT EXISTS — may already exist in main DB)
CREATE TABLE IF NOT EXISTS "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "type" "FinancialTransactionType" NOT NULL,
    "categoria" "FinancialTransactionCategoria" NOT NULL DEFAULT 'OUTROS',
    "valor" DECIMAL(12,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "herdEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- Indexes for base FinancialTransaction (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "FinancialTransaction_farmId_data_idx" ON "FinancialTransaction"("farmId", "data");
CREATE INDEX IF NOT EXISTS "FinancialTransaction_farmId_type_idx" ON "FinancialTransaction"("farmId", "type");
CREATE INDEX IF NOT EXISTS "FinancialTransaction_herdEventId_idx" ON "FinancialTransaction"("herdEventId");

-- FK: FinancialTransaction → Farm
DO $$ BEGIN
    ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_farmId_fkey"
        FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK: FinancialTransaction → HerdEvent
DO $$ BEGIN
    ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_herdEventId_fkey"
        FOREIGN KEY ("herdEventId") REFERENCES "HerdEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum: make categoria have a default (safe on existing DB)
ALTER TABLE "FinancialTransaction" ALTER COLUMN "categoria" SET DEFAULT 'OUTROS';

-- CreateTable AccountCategory
CREATE TABLE "AccountCategory" (
    "id" TEXT NOT NULL,
    "farmId" TEXT,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "type" "AccountCategoryType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable FinancialTransaction: add new columns (IF NOT EXISTS guard)
DO $$ BEGIN ALTER TABLE "FinancialTransaction" ADD COLUMN "accountCategoryId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "FinancialTransaction" ADD COLUMN "sanitaryRecordId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "FinancialTransaction" ADD COLUMN "vencimento" TIMESTAMP(3); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "FinancialTransaction" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PAGO'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- AlterTable SanitaryRecord: add valorUnitario (IF NOT EXISTS guard)
DO $$ BEGIN ALTER TABLE "SanitaryRecord" ADD COLUMN "valorUnitario" DECIMAL(12,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- CreateIndex (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "AccountCategory_farmId_idx" ON "AccountCategory"("farmId");
CREATE INDEX IF NOT EXISTS "AccountCategory_type_idx" ON "AccountCategory"("type");
CREATE INDEX IF NOT EXISTS "AccountCategory_isSystem_idx" ON "AccountCategory"("isSystem");
CREATE INDEX IF NOT EXISTS "FinancialTransaction_farmId_status_idx" ON "FinancialTransaction"("farmId", "status");
CREATE INDEX IF NOT EXISTS "FinancialTransaction_sanitaryRecordId_idx" ON "FinancialTransaction"("sanitaryRecordId");
CREATE INDEX IF NOT EXISTS "FinancialTransaction_accountCategoryId_idx" ON "FinancialTransaction"("accountCategoryId");

-- AddForeignKey (guard against duplicate constraint)
DO $$ BEGIN
    ALTER TABLE "AccountCategory" ADD CONSTRAINT "AccountCategory_farmId_fkey"
        FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_accountCategoryId_fkey"
        FOREIGN KEY ("accountCategoryId") REFERENCES "AccountCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_sanitaryRecordId_fkey"
        FOREIGN KEY ("sanitaryRecordId") REFERENCES "SanitaryRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed: categorias padrão do sistema (farmId = NULL, isSystem = TRUE)
INSERT INTO "AccountCategory" ("id","farmId","name","group","type","isSystem","isActive","createdAt","updatedAt") VALUES
-- ENTRADAS
('sys-venda-animais',      NULL, 'Venda de Animais',          'Rebanho',        'ENTRADA', true, true, NOW(), NOW()),
('sys-venda-reprodutores', NULL, 'Venda de Reprodutores',     'Rebanho',        'ENTRADA', true, true, NOW(), NOW()),
('sys-outras-receitas',    NULL, 'Outras Receitas',           'Administrativo', 'ENTRADA', true, true, NOW(), NOW()),
-- SAÍDAS - Rebanho
('sys-compra-animais',     NULL, 'Compra de Animais',         'Rebanho',        'SAIDA',   true, true, NOW(), NOW()),
('sys-compra-reprodutores',NULL, 'Compra de Reprodutores',    'Rebanho',        'SAIDA',   true, true, NOW(), NOW()),
-- SAÍDAS - Sanidade
('sys-vacinas',            NULL, 'Vacinas',                   'Sanidade',       'SAIDA',   true, true, NOW(), NOW()),
('sys-vermifugos',         NULL, 'Vermífugos',                'Sanidade',       'SAIDA',   true, true, NOW(), NOW()),
('sys-tratamentos',        NULL, 'Tratamentos Veterinários',  'Sanidade',       'SAIDA',   true, true, NOW(), NOW()),
-- SAÍDAS - Nutrição
('sys-racao',              NULL, 'Ração / Concentrado',       'Nutrição',       'SAIDA',   true, true, NOW(), NOW()),
('sys-suplementacao',      NULL, 'Suplementação Mineral',     'Nutrição',       'SAIDA',   true, true, NOW(), NOW()),
('sys-pastagem',           NULL, 'Pastagem e Forragem',       'Nutrição',       'SAIDA',   true, true, NOW(), NOW()),
-- SAÍDAS - Equipamentos
('sys-equip-aquis',        NULL, 'Aquisição de Equipamentos', 'Equipamentos',   'SAIDA',   true, true, NOW(), NOW()),
('sys-equip-manut',        NULL, 'Manutenção de Equipamentos','Equipamentos',   'SAIDA',   true, true, NOW(), NOW()),
-- SAÍDAS - Mão de Obra
('sys-salarios',           NULL, 'Salários',                  'Mão de Obra',    'SAIDA',   true, true, NOW(), NOW()),
('sys-servicos-terc',      NULL, 'Serviços Terceirizados',    'Mão de Obra',    'SAIDA',   true, true, NOW(), NOW()),
-- SAÍDAS - Infraestrutura
('sys-energia',            NULL, 'Energia Elétrica',          'Infraestrutura', 'SAIDA',   true, true, NOW(), NOW()),
('sys-combustivel',        NULL, 'Combustível',               'Infraestrutura', 'SAIDA',   true, true, NOW(), NOW()),
('sys-infra-manut',        NULL, 'Manutenção Geral',          'Infraestrutura', 'SAIDA',   true, true, NOW(), NOW()),
-- SAÍDAS - Administrativo
('sys-despesas-gerais',    NULL, 'Despesas Gerais',           'Administrativo', 'SAIDA',   true, true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
