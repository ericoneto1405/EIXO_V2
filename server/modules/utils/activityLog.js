import crypto from 'node:crypto';

// ─── Log de Atividades ─────────────────────────────────────────────────────────

export async function ensureActivityLogColumns(prisma) {
    const stmts = [
        `ALTER TABLE "ActivityLog" ALTER COLUMN "method" DROP NOT NULL`,
        `ALTER TABLE "ActivityLog" ALTER COLUMN "path"   DROP NOT NULL`,
        `ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "action"      TEXT`,
        `ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entity"      TEXT`,
        `ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "entityId"    TEXT`,
        `ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "description" TEXT`,
        `ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "farmId"      TEXT`,
        `CREATE INDEX IF NOT EXISTS "ActivityLog_farmId_createdAt_idx" ON "ActivityLog"("farmId","createdAt")`,
    ];
    for (const sql of stmts) {
        try { await prisma.$executeRawUnsafe(sql); } catch { /* já existe */ }
    }
}

export async function logActivity(prisma, req, { action, entity, entityId, description, farmId } = {}) {
    try {
        const userId = req.user?.id;
        const organizationId = req.saas?.organizationId || null;
        if (!userId) return;
        const id = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
            `INSERT INTO "ActivityLog" (id,"userId","organizationId","farmId",action,entity,"entityId",description,"createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
            id, userId, organizationId, farmId ?? null,
            action ?? null, entity ?? null, entityId ?? null, description ?? null,
        );
    } catch { /* log nunca deve quebrar a operação principal */ }
}

export async function recordActivityLog(prisma, req, { statusCode = null, requestMeta = null } = {}) {
    if (!req?.user?.id) {
        return;
    }
    try {
        await prisma.activityLog.create({
            data: {
                id: crypto.randomUUID(),
                userId: req.user.id,
                organizationId: req.saas?.organizationId || null,
                method: req.method,
                path: req.originalUrl || req.path || '',
                statusCode,
                ip: req.ip || null,
                userAgent: req.get('user-agent') || null,
                requestMeta,
            },
        });
    } catch (error) {
        console.error('Erro ao registrar ActivityLog:', error);
    }
}
