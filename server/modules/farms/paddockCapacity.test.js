import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getPaddockCapacityUa,
    summarizeActiveGrazingCapacity,
} from '../../../frontend/paddockCapacity.js';

test('capacidade gravada prevalece sobre área vezes lotação', () => {
    assert.equal(getPaddockCapacityUa({ capacity: 18, areaHa: 10, lotacaoUaHa: 1.2 }), 18);
});

test('sem UA gravada calcula área vezes lotação', () => {
    assert.equal(getPaddockCapacityUa({ capacity: null, areaHa: 10, lotacaoUaHa: 1.2 }), 12);
});

test('área sozinha não vira capacidade', () => {
    assert.equal(getPaddockCapacityUa({ capacity: null, areaHa: 10, lotacaoUaHa: null }), null);
});

test('resume capacidade como não informada, parcial ou completa', () => {
    const base = { active: true, divisionType: 'pasto' };

    assert.deepEqual(
        summarizeActiveGrazingCapacity([{ ...base, areaHa: 10 }]),
        { totalUa: 0, configuredCount: 0, eligibleCount: 1, state: 'not-informed' },
    );
    assert.deepEqual(
        summarizeActiveGrazingCapacity([
            { ...base, capacity: 8 },
            { ...base, areaHa: 10 },
        ]),
        { totalUa: 8, configuredCount: 1, eligibleCount: 2, state: 'partial' },
    );
    assert.deepEqual(
        summarizeActiveGrazingCapacity([
            { ...base, capacity: 8 },
            { ...base, areaHa: 10, lotacaoUaHa: 1.2 },
            { ...base, active: false, capacity: 50 },
            { ...base, divisionType: 'curral de manejo', capacity: 50 },
        ]),
        { totalUa: 20, configuredCount: 2, eligibleCount: 2, state: 'complete' },
    );
});
