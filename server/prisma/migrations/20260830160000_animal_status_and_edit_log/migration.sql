-- Status do animal (vivo/vendido/morto) — o animal nunca é apagado, só some da
-- lista ativa quando venda ou morte é registrada. Histórico de edição com
-- justificativa obrigatória (quem editou, o quê e por quê).

CREATE TYPE "AnimalStatus" AS ENUM ('VIVO', 'VENDIDO', 'MORTO');

ALTER TABLE "Animal" ADD COLUMN "status" "AnimalStatus" NOT NULL DEFAULT 'VIVO';

CREATE INDEX "Animal_farmId_status_idx" ON "Animal"("farmId", "status");

-- Backfill: animais que já têm venda ou morte registrada no histórico de
-- eventos não devem nascer como "VIVO". Morte tem prioridade sobre venda.
UPDATE "Animal" a
SET "status" = 'MORTO'
WHERE EXISTS (
  SELECT 1 FROM "HerdEvent" he WHERE he."animalId" = a."id" AND he."type" = 'MORTE'
);

UPDATE "Animal" a
SET "status" = 'VENDIDO'
WHERE a."status" = 'VIVO'
  AND EXISTS (
    SELECT 1 FROM "HerdEvent" he WHERE he."animalId" = a."id" AND he."type" = 'VENDA'
  );

CREATE TABLE "AnimalEditLog" (
  "id" TEXT NOT NULL,
  "animalId" TEXT NOT NULL,
  "farmId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "justificativa" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnimalEditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AnimalEditLog"
ADD CONSTRAINT "AnimalEditLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AnimalEditLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AnimalEditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "AnimalEditLog_animalId_idx" ON "AnimalEditLog"("animalId");
CREATE INDEX "AnimalEditLog_farmId_idx" ON "AnimalEditLog"("farmId");
CREATE INDEX "AnimalEditLog_userId_idx" ON "AnimalEditLog"("userId");

-- Nova trava: só usuário liberado (checkbox "Editar Animais" em Equipe >
-- Permissões) pode editar um animal. Antes dessa feature, qualquer usuário
-- web da conta podia editar. Para não travar todo mundo no dia do deploy,
-- liberamos automaticamente quem já tinha acesso hoje (usuários web, fora do
-- aplicativo de campo). Times poderão restringir manualmente depois.
UPDATE "User"
SET "modules" = array_append("modules", 'Editar Animais')
WHERE NOT ('Editar Animais' = ANY("modules"))
  AND "accessType" <> 'APP_MANEJO';
