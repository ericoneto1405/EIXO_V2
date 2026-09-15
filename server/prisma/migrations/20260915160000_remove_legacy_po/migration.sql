BEGIN;
-- Executar o preflight separadamente antes de aprovar a aplicação no banco alvo.
-- Material genético é compartilhado: preservar a referência externa do genitor.
UPDATE "SemenBatch" b SET
 "bullName" = COALESCE(NULLIF(b."bullName", ''), p.nome, p.brinco),
 "bullRegistry" = COALESCE(NULLIF(b."bullRegistry", ''), p."registrationNumber", p.registro)
FROM "PoAnimal" p WHERE b."bullPoAnimalId" = p.id;
UPDATE "EmbryoBatch" b SET
 "donorName" = COALESCE(NULLIF(b."donorName", ''), p.nome, p.brinco),
 "donorRegistry" = COALESCE(NULLIF(b."donorRegistry", ''), p."registrationNumber", p.registro)
FROM "PoAnimal" p WHERE b."donorPoAnimalId" = p.id;
UPDATE "EmbryoBatch" b SET
 "sireName" = COALESCE(NULLIF(b."sireName", ''), p.nome, p.brinco),
 "sireRegistry" = COALESCE(NULLIF(b."sireRegistry", ''), p."registrationNumber", p.registro)
FROM "PoAnimal" p WHERE b."sirePoAnimalId" = p.id;
UPDATE "FinancialResultAllocation" a SET
 "lotNameSnapshot" = COALESCE(a."lotNameSnapshot", p.name),
 "phaseLabelSnapshot" = COALESCE(a."phaseLabelSnapshot", p."productionPhase"::text)
FROM "PoLot" p WHERE a."poLotId" = p.id;

-- Identificar exclusividade antes de retirar chaves estrangeiras.
CREATE TEMP TABLE removed_herd_events ON COMMIT DROP AS
 SELECT id FROM "HerdEvent" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL;
CREATE TEMP TABLE removed_sanitary_records ON COMMIT DROP AS
 SELECT id FROM "SanitaryRecord" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL;
CREATE TEMP TABLE removed_nutrition_executions ON COMMIT DROP AS
 SELECT id FROM "NutritionExecution" WHERE "poLotId" IS NOT NULL AND "lotId" IS NULL AND "unitId" IS NULL;
-- Caixa, DRE, valores e snapshots permanecem intactos.
UPDATE "FinancialTransaction" SET "herdEventId" = NULL WHERE "herdEventId" IN (SELECT id FROM removed_herd_events);
UPDATE "FinancialTransaction" SET "sanitaryRecordId" = NULL WHERE "sanitaryRecordId" IN (SELECT id FROM removed_sanitary_records);
UPDATE "FinancialResultEntry" SET "herdEventId" = NULL WHERE "herdEventId" IN (SELECT id FROM removed_herd_events);
UPDATE "FinancialResultEntry" SET "sanitaryRecordId" = NULL WHERE "sanitaryRecordId" IN (SELECT id FROM removed_sanitary_records);
UPDATE "FinancialResultEntry" SET "nutritionExecutionId" = NULL WHERE "nutritionExecutionId" IN (SELECT id FROM removed_nutrition_executions);
DELETE FROM "HerdEvent" WHERE id IN (SELECT id FROM removed_herd_events);
DELETE FROM "SanitaryRecord" WHERE id IN (SELECT id FROM removed_sanitary_records);
DELETE FROM "NutritionExecution" WHERE id IN (SELECT id FROM removed_nutrition_executions);
DELETE FROM "NutritionCostEntry" WHERE "poLotId" IS NOT NULL AND "lotId" IS NULL;
DELETE FROM "NutritionAssignment" WHERE ("poLotId" IS NOT NULL OR "poAnimalId" IS NOT NULL) AND "lotId" IS NULL AND "animalId" IS NULL;
DELETE FROM "PaddockMove" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL;
DELETE FROM "CriaMortality" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL;
DELETE FROM "PoWeighing";
DELETE FROM "WeighingSession" s WHERE s."herdType" = 'PO' AND NOT EXISTS (SELECT 1 FROM "Weighing" w WHERE w."weighingSessionId" = s.id);
UPDATE "WeighingSession" SET "herdType" = 'COMMERCIAL' WHERE "herdType" = 'PO';
-- Nascimentos do cadastro único mantêm suas transferências e snapshots.
DELETE FROM "EmbryoTransfer" t WHERE t."recipientPoAnimalId" IS NOT NULL AND t."recipientAnimalId" IS NULL
 AND NOT EXISTS (SELECT 1 FROM "Animal" a WHERE a."embryoTransferId" = t.id);
UPDATE "EmbryoTransfer" SET "herdType" = 'COMMERCIAL' WHERE "herdType" = 'PO';
DELETE FROM "EmbryoPairSequence" WHERE "herdType" = 'PO';

-- DropForeignKey
ALTER TABLE "CriaMortality" DROP CONSTRAINT "CriaMortality_poAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_currentPaddockId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_farmId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_lotId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_maeId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_paiId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_matrizResponsavelId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_receptoraGestacionalId_fkey";

-- DropForeignKey
ALTER TABLE "PoAnimal" DROP CONSTRAINT "PoAnimal_embryoTransferId_fkey";

-- DropForeignKey
ALTER TABLE "PoLot" DROP CONSTRAINT "PoLot_farmId_fkey";

-- DropForeignKey
ALTER TABLE "PoWeighing" DROP CONSTRAINT "PoWeighing_farmId_fkey";

-- DropForeignKey
ALTER TABLE "PoWeighing" DROP CONSTRAINT "PoWeighing_poAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "PoWeighing" DROP CONSTRAINT "PoWeighing_weighingSessionId_fkey";

-- DropForeignKey
ALTER TABLE "NutritionAssignment" DROP CONSTRAINT "NutritionAssignment_poAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "NutritionAssignment" DROP CONSTRAINT "NutritionAssignment_poLotId_fkey";

-- DropForeignKey
ALTER TABLE "NutritionCostEntry" DROP CONSTRAINT "NutritionCostEntry_poLotId_fkey";

-- DropForeignKey
ALTER TABLE "NutritionExecution" DROP CONSTRAINT "NutritionExecution_poLotId_fkey";

-- DropForeignKey
ALTER TABLE "SemenBatch" DROP CONSTRAINT "SemenBatch_bullPoAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "EmbryoBatch" DROP CONSTRAINT "EmbryoBatch_donorPoAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "EmbryoBatch" DROP CONSTRAINT "EmbryoBatch_sirePoAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "EmbryoTransfer" DROP CONSTRAINT "EmbryoTransfer_recipientPoAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "PaddockMove" DROP CONSTRAINT "PaddockMove_poAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialResultAllocation" DROP CONSTRAINT "FinancialResultAllocation_poLotId_fkey";

-- DropForeignKey
ALTER TABLE "HerdEvent" DROP CONSTRAINT "HerdEvent_poAnimalId_fkey";

-- DropForeignKey
ALTER TABLE "SanitaryRecord" DROP CONSTRAINT "SanitaryRecord_poAnimalId_fkey";

-- DropIndex
DROP INDEX "CriaMortality_poAnimalId_idx";

-- DropIndex
DROP INDEX "NutritionAssignment_poLotId_idx";

-- DropIndex
DROP INDEX "NutritionAssignment_poAnimalId_idx";

-- DropIndex
DROP INDEX "NutritionCostEntry_farmId_poLotId_date_idx";

-- DropIndex
DROP INDEX "NutritionExecution_farmId_poLotId_date_idx";

-- DropIndex
DROP INDEX "SemenBatch_bullPoAnimalId_idx";

-- DropIndex
DROP INDEX "EmbryoBatch_donorPoAnimalId_idx";

-- DropIndex
DROP INDEX "EmbryoBatch_sirePoAnimalId_idx";

-- DropIndex
DROP INDEX "EmbryoTransfer_recipientPoAnimalId_idx";

-- DropIndex
DROP INDEX "PaddockMove_poAnimalId_idx";

-- DropIndex
DROP INDEX "FinancialResultAllocation_poLotId_idx";

-- DropIndex
DROP INDEX "HerdEvent_poAnimalId_idx";

-- DropIndex
DROP INDEX "SanitaryRecord_poAnimalId_idx";

-- AlterTable
ALTER TABLE "CriaMortality" DROP COLUMN "poAnimalId";

-- AlterTable
ALTER TABLE "NutritionAssignment" DROP COLUMN "poAnimalId",
DROP COLUMN "poLotId";

-- AlterTable
ALTER TABLE "NutritionCostEntry" DROP COLUMN "poLotId";

-- AlterTable
ALTER TABLE "NutritionExecution" DROP COLUMN "poLotId";

-- AlterTable
ALTER TABLE "SemenBatch" DROP COLUMN "bullPoAnimalId";

-- AlterTable
ALTER TABLE "EmbryoBatch" DROP COLUMN "donorPoAnimalId",
DROP COLUMN "sirePoAnimalId";

-- AlterTable
ALTER TABLE "EmbryoTransfer" DROP COLUMN "recipientPoAnimalId";

-- AlterTable
ALTER TABLE "PaddockMove" DROP COLUMN "poAnimalId";

-- AlterTable
ALTER TABLE "FinancialResultAllocation" DROP COLUMN "poLotId";

-- AlterTable
ALTER TABLE "HerdEvent" DROP COLUMN "poAnimalId";

-- AlterTable
ALTER TABLE "SanitaryRecord" DROP COLUMN "poAnimalId";

-- DropTable
DROP TABLE "PoAnimal";

-- DropTable
DROP TABLE "PoLot";

-- DropTable
DROP TABLE "PoWeighing";

COMMIT;
