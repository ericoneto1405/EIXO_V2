-- Núcleo do módulo Reprodução: campos aditivos (nada removido, nada alterado)

-- Sessão de avaliação: vínculo opcional com a estação de monta
ALTER TABLE "repro_checkup_sessions" ADD COLUMN "season_id" TEXT;

CREATE INDEX "idx_repro_checkup_sessions_season" ON "repro_checkup_sessions"("season_id");

ALTER TABLE "repro_checkup_sessions"
  ADD CONSTRAINT "repro_checkup_sessions_season_id_fkey"
  FOREIGN KEY ("season_id") REFERENCES "BreedingSeason"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Ficha por vaca avaliada: prenhez, previsão de parto, touro/sêmen e protocolo
ALTER TABLE "repro_checkup_records" ADD COLUMN "pregnant" BOOLEAN,
  ADD COLUMN "previsao_parto" TIMESTAMP(3),
  ADD COLUMN "bull_id" TEXT,
  ADD COLUMN "protocol" TEXT;
