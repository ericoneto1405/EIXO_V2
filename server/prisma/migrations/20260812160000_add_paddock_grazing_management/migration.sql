ALTER TABLE "Paddock"
ADD COLUMN "sistema_pastejo" TEXT,
ADD COLUMN "dias_descanso" INTEGER;

ALTER TABLE "Paddock"
ADD CONSTRAINT "Paddock_dias_descanso_positive_check"
CHECK ("dias_descanso" IS NULL OR "dias_descanso" > 0);
