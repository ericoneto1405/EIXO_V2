import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateActivePaddockArea,
    hasActivePaddock,
    hasDuplicatePaddockNames,
} from './farmRules.js';

test('soma somente a área dos pastos ativos', () => {
    const area = calculateActivePaddockArea([
        { areaHa: 12.5, active: true },
        { areaHa: 7.5, active: false },
        { areaHa: 2, active: true },
    ]);
    assert.equal(area, 14.5);
});

test('identifica nomes repetidos sem diferenciar maiúsculas e espaços', () => {
    assert.equal(hasDuplicatePaddockNames([
        { name: ' Pasto Norte ' },
        { name: 'pasto norte' },
    ]), true);
});

test('exige pelo menos um pasto ativo', () => {
    assert.equal(hasActivePaddock([{ active: false }, { active: false }]), false);
    assert.equal(hasActivePaddock([{ active: false }, { active: true }]), true);
});
