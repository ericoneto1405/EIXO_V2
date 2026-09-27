-- Remove somente vínculos genealógicos que atravessam contas.
-- Animais e referências textuais existentes são preservados.

UPDATE "Animal" AS child
SET "maeId" = NULL
FROM "Animal" AS parent,
     "Farm" AS child_farm,
     "Farm" AS parent_farm
WHERE child."maeId" = parent.id
  AND child."farmId" = child_farm.id
  AND parent."farmId" = parent_farm.id
  AND NOT (
    (
      child_farm."organizationId" IS NOT NULL
      AND parent_farm."organizationId" IS NOT NULL
      AND child_farm."organizationId" = parent_farm."organizationId"
    )
    OR (
      child_farm."organizationId" IS NULL
      AND parent_farm."organizationId" IS NULL
      AND child_farm."userId" = parent_farm."userId"
    )
  );

UPDATE "Animal" AS child
SET "paiId" = NULL
FROM "Animal" AS parent,
     "Farm" AS child_farm,
     "Farm" AS parent_farm
WHERE child."paiId" = parent.id
  AND child."farmId" = child_farm.id
  AND parent."farmId" = parent_farm.id
  AND NOT (
    (
      child_farm."organizationId" IS NOT NULL
      AND parent_farm."organizationId" IS NOT NULL
      AND child_farm."organizationId" = parent_farm."organizationId"
    )
    OR (
      child_farm."organizationId" IS NULL
      AND parent_farm."organizationId" IS NULL
      AND child_farm."userId" = parent_farm."userId"
    )
  );
