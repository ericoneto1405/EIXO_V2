BEGIN;

-- A chave de sincronização mantém a repetição segura de envios do EIXO Campo
-- sem usar a autoria como parte da consulta da ocorrência.
ALTER TABLE "FieldOccurrence" ADD COLUMN "syncKey" TEXT;
ALTER TABLE "AppActivationCode" ALTER COLUMN "createdById" DROP NOT NULL;
UPDATE "FieldOccurrence"
SET "syncKey" = md5("createdById" || ':' || "syncSource")
WHERE "createdById" IS NOT NULL AND "syncSource" IS NOT NULL;
CREATE INDEX "FieldOccurrence_farmId_syncKey_idx" ON "FieldOccurrence"("farmId", "syncKey");

-- Fazendas com organização pertencem à organização. O usuário que cadastrou
-- fica no histórico; o vínculo direto permanece apenas nas fazendas legadas.
INSERT INTO "ActivityLog" (
    id, "userId", "organizationId", "farmId", action, entity,
    "entityId", description, "requestMeta", "createdAt"
)
SELECT 'authorship:Farm:' || f.id, f."userId", f."organizationId", f.id,
       'AUTORIA_REGISTRADA', 'Farm', f.id, 'Autoria do cadastro da fazenda',
       '{"sourceField":"userId"}'::JSONB, f."createdAt"
FROM "Farm" f
WHERE f."organizationId" IS NOT NULL AND f."userId" IS NOT NULL
ON CONFLICT (id) DO NOTHING;
UPDATE "Farm" SET "userId" = NULL
WHERE "organizationId" IS NOT NULL AND "userId" IS NOT NULL;

CREATE FUNCTION eixo_move_farm_creator_to_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizationId" IS NOT NULL AND NEW."userId" IS NOT NULL THEN
        INSERT INTO "ActivityLog" (
            id, "userId", "organizationId", "farmId", action, entity,
            "entityId", description, "requestMeta", "createdAt"
        ) VALUES (
            gen_random_uuid()::TEXT, NEW."userId", NEW."organizationId", NEW.id,
            'AUTORIA_REGISTRADA', 'Farm', NEW.id, 'Autoria do cadastro da fazenda',
            '{"sourceField":"userId"}'::JSONB, COALESCE(NEW."createdAt", NOW())
        );
        NEW."userId" := NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER eixo_farm_creator_activity BEFORE INSERT OR UPDATE ON "Farm"
FOR EACH ROW EXECUTE FUNCTION eixo_move_farm_creator_to_activity();

CREATE FUNCTION eixo_activity_farm_id(table_name TEXT, row_data JSONB)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
    IF row_data->>'farmId' IS NOT NULL THEN
        RETURN row_data->>'farmId';
    END IF;
    IF table_name IN ('NutritionIngredientCostHistory', 'NutritionIngredientDryMatterHistory') THEN
        RETURN (SELECT "farmId" FROM "NutritionIngredient" WHERE id = row_data->>'ingredientId');
    END IF;
    IF table_name IN ('ExternalOperationLedgerEntry', 'ExternalOperationSettlement') THEN
        RETURN (SELECT "farmId" FROM "ExternalOperation" WHERE id = row_data->>'operationId');
    END IF;
    IF table_name IN ('FeedlotLedgerEntry', 'FeedlotSettlement') THEN
        RETURN (SELECT "farmId" FROM "FeedlotContract" WHERE id = row_data->>'contractId');
    END IF;
    IF table_name = 'SemenTankReading' THEN
        RETURN (SELECT "farmId" FROM "SemenTank" WHERE id = row_data->>'tankId');
    END IF;
    RETURN NULL;
END $$;

CREATE FUNCTION eixo_activity_organization_id(row_data JSONB, farm_id TEXT)
RETURNS TEXT LANGUAGE sql AS $$
    SELECT COALESCE(row_data->>'organizationId',
        (SELECT "organizationId" FROM "Farm" WHERE id = farm_id));
$$;

-- Captura a autoria na mesma transação do registro e limpa as colunas antigas.
CREATE FUNCTION eixo_move_creator_to_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    row_data JSONB := to_jsonb(NEW);
    actor_column TEXT := TG_ARGV[1];
    name_column TEXT := TG_ARGV[2];
    actor_id TEXT;
    actor_name TEXT;
    valid_user_id TEXT;
    farm_id TEXT;
BEGIN
    actor_id := NULLIF(row_data->>actor_column, '');
    IF name_column <> '' THEN
        actor_name := NULLIF(row_data->>name_column, '');
    END IF;

    IF actor_id IS NOT NULL OR actor_name IS NOT NULL THEN
        SELECT id INTO valid_user_id FROM "User" WHERE id = actor_id;
        farm_id := eixo_activity_farm_id(TG_ARGV[0], row_data);
        INSERT INTO "ActivityLog" (
            id, "userId", "organizationId", "farmId", action, entity,
            "entityId", description, "requestMeta", "createdAt"
        ) VALUES (
            gen_random_uuid()::TEXT, valid_user_id,
            eixo_activity_organization_id(row_data, farm_id), farm_id,
            'AUTORIA_REGISTRADA', TG_ARGV[0], row_data->>'id',
            'Autoria do registro',
            jsonb_strip_nulls(jsonb_build_object('sourceField', actor_column, 'actorName', actor_name)),
            COALESCE(NULLIF(row_data->>TG_ARGV[3], '')::TIMESTAMPTZ, NOW())
        );
    END IF;

    NEW := jsonb_populate_record(NEW, jsonb_build_object(actor_column, NULL));
    IF name_column <> '' THEN
        NEW := jsonb_populate_record(NEW, jsonb_build_object(name_column, NULL));
    END IF;
    RETURN NEW;
END $$;

DO $$
DECLARE
    link RECORD;
    farm_id TEXT;
    actor_id TEXT;
    actor_name TEXT;
    valid_user_id TEXT;
    row_data JSONB;
    source_row RECORD;
BEGIN
    FOR link IN
        SELECT * FROM (VALUES
            ('MarketPrice', 'MarketPrice', 'createdByUserId', '', 'createdAt', TRUE),
            ('ReproEvent', 'ReproEvent', 'createdById', '', 'createdAt', FALSE),
            ('ReproDiagnosisSession', 'ReproDiagnosisSession', 'createdById', '', 'createdAt', FALSE),
            ('BullExam', 'BullExam', 'createdById', '', 'createdAt', FALSE),
            ('BullLotAssignment', 'BullLotAssignment', 'createdById', '', 'createdAt', FALSE),
            ('NutritionIngredientCostHistory', 'NutritionIngredientCostHistory', 'createdByUserId', 'createdByName', 'recordedAt', FALSE),
            ('NutritionIngredientDryMatterHistory', 'NutritionIngredientDryMatterHistory', 'createdByUserId', 'createdByName', 'recordedAt', FALSE),
            ('NutritionFabrication', 'NutritionFabrication', 'createdByUserId', 'createdByName', 'createdAt', FALSE),
            ('NutritionExecution', 'NutritionExecution', 'createdByUserId', 'createdByName', 'createdAt', FALSE),
            ('NutritionTroughReading', 'NutritionTroughReading', 'createdByUserId', 'createdByName', 'createdAt', FALSE),
            ('SemenTankReading', 'SemenTankReading', 'createdById', '', 'createdAt', FALSE),
            ('IatfSession', 'IatfSession', 'createdById', '', 'createdAt', FALSE),
            ('AppActivationCode', 'AppActivationCode', 'createdById', '', 'createdAt', FALSE),
            ('FieldOccurrence', 'FieldOccurrence', 'createdById', '', 'createdAt', TRUE),
            ('GeneticsAnalysisRun', 'GeneticsAnalysisRun', 'createdById', '', 'createdAt', TRUE),
            ('AcasalamentoSession', 'AcasalamentoSession', 'createdById', '', 'createdAt', TRUE),
            ('ExternalOperation', 'ExternalOperation', 'createdById', '', 'createdAt', TRUE),
            ('ExternalOperationLedgerEntry', 'ExternalOperationLedgerEntry', 'createdById', '', 'createdAt', TRUE),
            ('ExternalOperationSettlement', 'ExternalOperationSettlement', 'createdById', '', 'createdAt', TRUE),
            ('CommercialClient', 'CommercialClient', 'createdById', '', 'createdAt', TRUE),
            ('CommercialDeal', 'CommercialDeal', 'createdById', '', 'createdAt', TRUE),
            ('CommercialContract', 'CommercialContract', 'createdById', '', 'createdAt', TRUE),
            ('CommercialReminder', 'CommercialReminder', 'createdById', '', 'createdAt', TRUE),
            ('FeedlotContract', 'FeedlotContract', 'createdById', '', 'createdAt', TRUE),
            ('FeedlotLedgerEntry', 'FeedlotLedgerEntry', 'createdById', '', 'createdAt', TRUE),
            ('FeedlotSettlement', 'FeedlotSettlement', 'createdById', '', 'createdAt', TRUE),
            ('sanitary_compliances', 'SanitaryCompliance', 'created_by_user_id', '', 'created_at', FALSE),
            ('sanitary_cases', 'SanitaryCase', 'created_by_user_id', '', 'created_at', FALSE),
            ('sanitary_applications', 'SanitaryApplication', 'created_by_user_id', '', 'created_at', FALSE)
        ) AS links(table_name, entity_name, actor_column, name_column, time_column, has_user_fk)
    LOOP
        FOR source_row IN EXECUTE CASE WHEN link.name_column <> ''
            THEN format('SELECT to_jsonb(t) AS data FROM %I t WHERE %I IS NOT NULL OR %I IS NOT NULL',
                link.table_name, link.actor_column, link.name_column)
            ELSE format('SELECT to_jsonb(t) AS data FROM %I t WHERE %I IS NOT NULL',
                link.table_name, link.actor_column)
        END
        LOOP
            row_data := source_row.data;
            actor_id := NULLIF(row_data->>link.actor_column, '');
            actor_name := CASE WHEN link.name_column <> '' THEN NULLIF(row_data->>link.name_column, '') ELSE NULL END;
            SELECT id INTO valid_user_id FROM "User" WHERE id = actor_id;
            farm_id := eixo_activity_farm_id(link.entity_name, row_data);
            INSERT INTO "ActivityLog" (
                id, "userId", "organizationId", "farmId", action, entity,
                "entityId", description, "requestMeta", "createdAt"
            ) VALUES (
                'authorship:' || link.entity_name || ':' || (row_data->>'id'), valid_user_id,
                eixo_activity_organization_id(row_data, farm_id), farm_id,
                'AUTORIA_REGISTRADA', link.entity_name, row_data->>'id',
                'Autoria do registro',
                jsonb_strip_nulls(jsonb_build_object('sourceField', link.actor_column, 'actorName', actor_name)),
                COALESCE(NULLIF(row_data->>link.time_column, '')::TIMESTAMPTZ, NOW())
            ) ON CONFLICT (id) DO NOTHING;
        END LOOP;

        IF link.has_user_fk THEN
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',
                link.table_name, link.table_name || '_' || link.actor_column || '_fkey');
        END IF;

        IF link.name_column <> '' THEN
            EXECUTE format('UPDATE %I SET %I = NULL, %I = NULL WHERE %I IS NOT NULL OR %I IS NOT NULL',
                link.table_name, link.actor_column, link.name_column, link.actor_column, link.name_column);
        ELSE
            EXECUTE format('UPDATE %I SET %I = NULL WHERE %I IS NOT NULL',
                link.table_name, link.actor_column, link.actor_column);
        END IF;

        EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION eixo_move_creator_to_activity(%L, %L, %L, %L)',
            'eixo_creator_activity', link.table_name, link.entity_name,
            link.actor_column, link.name_column, link.time_column);
    END LOOP;
END $$;

COMMIT;
