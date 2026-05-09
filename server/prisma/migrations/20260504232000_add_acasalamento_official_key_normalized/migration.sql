-- Add normalized official key used to deduplicate bulls across commercial sources.
ALTER TABLE "AcasalamentoBull" ADD COLUMN "officialKeyNormalized" TEXT;

CREATE UNIQUE INDEX "AcasalamentoBull_breed_officialKeyNormalized_key"
ON "AcasalamentoBull"("breed", "officialKeyNormalized");
