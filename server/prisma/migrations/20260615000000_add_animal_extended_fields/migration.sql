-- AlterTable: Adicionar campos estendidos ao model Animal
ALTER TABLE "Animal" ADD COLUMN "nome" TEXT,
ADD COLUMN "brincoEletronico" TEXT,
ADD COLUMN "padraoRacial" TEXT,
ADD COLUMN "funcaoReprodutiva" TEXT,
ADD COLUMN "statusReprodutivo" TEXT,
ADD COLUMN "previsaoParto" TIMESTAMP(3),
ADD COLUMN "observacoes" TEXT;
