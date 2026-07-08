-- AlterTable: Preferência de colunas visíveis na tela de Animais (por usuário)
ALTER TABLE "User" ADD COLUMN "herdTableColumns" JSONB;
