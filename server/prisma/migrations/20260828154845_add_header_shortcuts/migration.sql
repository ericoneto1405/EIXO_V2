-- Guarda os atalhos que o usuário escolheu fixar no header (até 5, por enquanto).
-- Mesmo padrão do herdTableColumns: preferência por usuário, não por fazenda.
ALTER TABLE "public"."User" ADD COLUMN "headerShortcuts" JSONB;
