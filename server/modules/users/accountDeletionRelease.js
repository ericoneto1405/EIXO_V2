import { readFileSync } from 'node:fs';

const DECISION_KEYS = ['priorMigrations', 'migrationVolume', 'legacyFarms'];
const REQUIRED_MIGRATIONS = [
    '20260921120000_repair_cross_organization_parent_links',
    '20260926120000_add_offline_idempotency_keys',
    '20260929100000_preserve_activity_on_user_delete',
    '20260929110000_preserve_business_data_on_user_delete',
    '20260929120000_move_animal_edits_to_activity_log',
    '20260929130000_move_record_authorship_to_activity_log',
];

export function hasRecordedDeletionDecisions(release) {
    if (release?.releaseEnabled !== true) return false;

    return DECISION_KEYS.every((key) => {
        const entry = release.decisions?.[key];
        return entry?.status === 'APPROVED'
            && typeof entry.decision === 'string' && entry.decision.trim().length > 0
            && typeof entry.evidence === 'string' && entry.evidence.trim().length > 0
            && typeof entry.decidedBy === 'string' && entry.decidedBy.trim().length > 0
            && typeof entry.decidedAt === 'string' && !Number.isNaN(Date.parse(entry.decidedAt))
            && typeof entry.migrationRequired === 'boolean'
            && Array.isArray(entry.migrationNames)
            && entry.migrationNames.every((name) => typeof name === 'string' && name.trim().length > 0)
            && (!entry.migrationRequired || entry.migrationNames.length > 0);
    });
}

export function isDeletionReleaseReady(release, completedMigrations) {
    if (!hasRecordedDeletionDecisions(release) || !Array.isArray(completedMigrations)) return false;

    const completed = new Set(completedMigrations);
    const required = [
        ...REQUIRED_MIGRATIONS,
        ...DECISION_KEYS.flatMap((key) => release.decisions[key].migrationNames),
    ];
    return required.every((name) => completed.has(name));
}

export async function isRealDeletionReleased(prisma) {
    try {
        const release = JSON.parse(readFileSync(new URL('./accountDeletionRelease.json', import.meta.url), 'utf8'));
        if (!hasRecordedDeletionDecisions(release)) return false;

        const migrations = await prisma.$queryRaw`
            SELECT migration_name FROM "_prisma_migrations"
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        `;
        return isDeletionReleaseReady(release, migrations.map((row) => row.migration_name));
    } catch {
        return false;
    }
}
