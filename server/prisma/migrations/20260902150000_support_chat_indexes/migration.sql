CREATE INDEX IF NOT EXISTS "ActivityLog_entity_entityId_createdAt_idx"
ON "ActivityLog"("entity", "entityId", "createdAt");

CREATE INDEX IF NOT EXISTS "ActivityLog_entity_action_createdAt_idx"
ON "ActivityLog"("entity", "action", "createdAt");

CREATE INDEX IF NOT EXISTS "ActivityLog_userId_entity_createdAt_idx"
ON "ActivityLog"("userId", "entity", "createdAt");
