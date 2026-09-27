import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHerdAllocation } from '../../../frontend/herdAllocation.js';

test('fecha total ativo entre alocados e sem pasto', () => {
    const animals = Array.from({ length: 309 }, (_, index) => ({
        id: String(index + 1),
        currentPaddockId: index < 4 ? 'pasto-2' : null,
    }));
    const summary = summarizeHerdAllocation(animals, [
        { id: 'pasto-2', active: true },
        { id: 'maternidade', active: true },
    ]);

    assert.equal(summary.paddockCounts.get('pasto-2'), 4);
    assert.equal(summary.paddockCounts.get('maternidade') || 0, 0);
    assert.equal(summary.allocatedCount, 4);
    assert.equal(summary.withoutPaddockCount, 305);
    assert.equal(summary.allocatedCount + summary.withoutPaddockCount, summary.totalActive);
});

test('mostra inativo ocupado e oculta inativo vazio', () => {
    const summary = summarizeHerdAllocation(
        [{ id: '1', currentPaddockId: 'inativo-ocupado' }],
        [
            { id: 'ativo', active: true },
            { id: 'inativo-ocupado', active: false },
            { id: 'inativo-vazio', active: false },
        ],
    );

    assert.deepEqual(summary.visiblePaddocks.map((paddock) => paddock.id), ['ativo', 'inativo-ocupado']);
});
