-- AlterTable: Adicionar campos da nova estrutura de raça (Pura/Mestiça)
ALTER TABLE "Animal" ADD COLUMN "tipoRaca" TEXT,
ADD COLUMN "composicaoMestica" TEXT,
ADD COLUMN "racaPredominante" TEXT;
