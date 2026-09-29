BEGIN;

-- Preserva alterações e justificativas antes de remover o histórico separado.
INSERT INTO "ActivityLog" (
    id, "userId", "organizationId", "farmId", action, entity,
    "entityId", description, "requestMeta", "createdAt"
)
SELECT
    'animal-edit-' || edit.id,
    edit."userId",
    farm."organizationId",
    edit."farmId",
    'ANIMAL_DADOS_EDITADOS',
    'Animal',
    edit."animalId",
    'Editou os dados do animal',
    jsonb_build_object('changes', edit.changes, 'justificativa', edit.justificativa),
    edit."createdAt"
FROM "AnimalEditLog" AS edit
JOIN "Farm" AS farm ON farm.id = edit."farmId";

DROP TABLE "AnimalEditLog";

COMMIT;
