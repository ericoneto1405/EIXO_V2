-- Backfill existing commercial data into the new listing table.
INSERT INTO "AcasalamentoCommercialListing" (
    "id",
    "bullId",
    "sourceId",
    "central",
    "name",
    "normalizedName",
    "registration",
    "commercialUrl",
    "semenAvailable",
    "sourceStatus",
    "lastSeenAt",
    "rawData",
    "createdAt",
    "updatedAt"
)
SELECT
    md5("sourceId" || ':' || "normalizedName"),
    "id",
    "sourceId",
    "central",
    "name",
    "normalizedName",
    "registration",
    "commercialUrl",
    "semenAvailable",
    "sourceStatus",
    "lastSeenAt",
    "rawData",
    "createdAt",
    "updatedAt"
FROM "AcasalamentoBull"
ON CONFLICT ("sourceId", "normalizedName") DO NOTHING;
