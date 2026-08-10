import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProvisionalIdentification, buildTeProvisionalIdentification, isReadyForWeaning } from './herdIntegrityService.js';

test('gera sequências independentes e crescentes para a matriz', () => {
    assert.equal(buildProvisionalIdentification('042', 1), 'Mãe 042-1');
    assert.equal(buildProvisionalIdentification('042', 2), 'Mãe 042-2');
});

test('gera identificação TE com sequência de dois dígitos', () => {
    assert.equal(buildTeProvisionalIdentification('042', '018', 1), 'TE-042-01 | DO-018');
    assert.equal(buildTeProvisionalIdentification('TE-042', 'DO-018', 2), 'TE-042-02 | DO-018');
});

test('rejeita identificação TE sem receptora, doadora ou sequência válida', () => {
    assert.throws(() => buildTeProvisionalIdentification('', '018', 1));
    assert.throws(() => buildTeProvisionalIdentification('042', '', 1));
    assert.throws(() => buildTeProvisionalIdentification('042', '018', 0));
});

test('alerta desmame por idade ou peso conforme o sexo', () => {
    const now = new Date('2026-08-09T12:00:00Z');
    assert.equal(isReadyForWeaning({ provisional: true, birthDate: '2026-01-01', sex: 'FEMEA', weightKg: 100, now }), true);
    assert.equal(isReadyForWeaning({ provisional: true, birthDate: '2026-07-01', sex: 'FEMEA', weightKg: 180, now }), true);
    assert.equal(isReadyForWeaning({ provisional: true, birthDate: '2026-07-01', sex: 'MACHO', weightKg: 200, now }), true);
    assert.equal(isReadyForWeaning({ provisional: true, birthDate: '2026-07-01', sex: 'MACHO', weightKg: 199, now }), false);
    assert.equal(isReadyForWeaning({ provisional: false, birthDate: '2025-01-01', sex: 'MACHO', weightKg: 300, now }), false);
});
