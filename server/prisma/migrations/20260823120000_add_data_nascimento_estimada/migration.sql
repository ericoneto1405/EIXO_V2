-- Marca nascimentos que vieram de safra informada na importação, e não de uma
-- data anotada. Permite a tela exibir "estimado" em vez de fingir precisão.
ALTER TABLE "public"."Animal" ADD COLUMN "dataNascimentoEstimada" BOOLEAN NOT NULL DEFAULT false;
