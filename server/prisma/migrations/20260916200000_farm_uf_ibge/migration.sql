-- AlterTable
ALTER TABLE "Farm" ADD COLUMN "uf" CHAR(2),
ADD COLUMN "ibge_code" VARCHAR(7);

-- Preenche o estado das fazendas antigas a partir do texto "Cidade/UF"
UPDATE "Farm"
SET "uf" = UPPER(TRIM(SPLIT_PART("city", '/', 2)))
WHERE "uf" IS NULL
  AND UPPER(TRIM(SPLIT_PART("city", '/', 2))) IN ('RO','AC','AM','RR','PA','AP','TO','MA','PI','CE','RN','PB','PE','AL','SE','BA','MG','ES','RJ','SP','PR','SC','RS','MS','MT','GO','DF');

-- CreateIndex
CREATE INDEX "Farm_ibge_code_idx" ON "Farm"("ibge_code");
