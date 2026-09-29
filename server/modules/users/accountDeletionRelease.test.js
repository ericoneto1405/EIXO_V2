import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    isDeletionReleaseReady,
    isRealDeletionReleased,
} from './accountDeletionRelease.js';

const currentRelease = JSON.parse(readFileSync(new URL('./accountDeletionRelease.json', import.meta.url), 'utf8'));
const completedMigrations = [
    '20260921120000_repair_cross_organization_parent_links',
    '20260926120000_add_offline_idempotency_keys',
    '20260929100000_preserve_activity_on_user_delete',
    '20260929110000_preserve_business_data_on_user_delete',
    '20260929120000_move_animal_edits_to_activity_log',
    '20260929130000_move_record_authorship_to_activity_log',
];

function approvedRelease() {
    const release = structuredClone(currentRelease);
    release.releaseEnabled = true;
    for (const entry of Object.values(release.decisions)) {
        entry.status = 'APPROVED';
        entry.decision = 'Decisão registrada após revisão.';
        entry.evidence = 'Registro da revisão.';
        entry.decidedBy = 'Equipe EIXO';
        entry.decidedAt = '2026-09-29T12:00:00.000Z';
        entry.migrationRequired ??= false;
    }
    return release;
}

test('exclusão real permanece bloqueada enquanto há decisão pendente', async () => {
    const prisma = { $queryRaw: () => { throw new Error('Não deve consultar migrações'); } };
    assert.equal(await isRealDeletionReleased(prisma), false);
    const partialRelease = structuredClone(currentRelease);
    partialRelease.releaseEnabled = true;
    assert.equal(isDeletionReleaseReady(partialRelease, completedMigrations), false);
});

test('exclusão real exige decisões completas e todas as migrações aplicadas', () => {
    const release = approvedRelease();
    assert.equal(isDeletionReleaseReady(release, completedMigrations), true);

    assert.equal(isDeletionReleaseReady(release, completedMigrations.slice(0, -1)), false);

    release.decisions.legacyFarms.evidence = '';
    assert.equal(isDeletionReleaseReady(release, completedMigrations), false);
});

test('migração adicional exigida pela decisão também bloqueia até ser aplicada', () => {
    const release = approvedRelease();
    release.decisions.legacyFarms.migrationRequired = true;
    release.decisions.legacyFarms.migrationNames = ['20261001000000_resolve_legacy_farms'];
    assert.equal(isDeletionReleaseReady(release, completedMigrations), false);
    assert.equal(isDeletionReleaseReady(release, [...completedMigrations, '20261001000000_resolve_legacy_farms']), true);
});
