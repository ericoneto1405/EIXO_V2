ALTER TABLE "PoAnimal"
ADD COLUMN "identityKey" TEXT,
ADD COLUMN "registrationEntity" TEXT,
ADD COLUMN "registrationNumber" TEXT,
ADD COLUMN "registrationType" TEXT,
ADD COLUMN "registrationCategory" TEXT,
ADD COLUMN "statusReprodutivo" TEXT,
ADD COLUMN "previsaoParto" TIMESTAMP(3),
ADD COLUMN "emTransferenciaEmbriao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marcadoDescarte" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "motivoDescarte" TEXT;

UPDATE "PoAnimal"
SET "identityKey" = BTRIM("brinco")
WHERE "brinco" IS NOT NULL AND BTRIM("brinco") <> '';

CREATE INDEX "PoAnimal_identityKey_idx" ON "PoAnimal"("identityKey");
CREATE INDEX "PoAnimal_registrationEntity_registrationNumber_idx"
ON "PoAnimal"("registrationEntity", "registrationNumber");
