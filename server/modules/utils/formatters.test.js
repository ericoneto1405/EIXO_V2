import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnimalIdentityKey } from './formatters.js';

test('preserva identificações numéricas e alfanuméricas como texto', () => {
    assert.equal(normalizeAnimalIdentityKey('123'), '123');
    assert.equal(normalizeAnimalIdentityKey('00123'), '00123');
    assert.equal(normalizeAnimalIdentityKey('ABC123'), 'ABC123');
    assert.equal(normalizeAnimalIdentityKey('A1'), 'A1');
    assert.equal(normalizeAnimalIdentityKey('B1'), 'B1');
    assert.equal(normalizeAnimalIdentityKey('AB-01'), 'AB-01');
});

test('remove somente espaços nas extremidades', () => {
    assert.equal(normalizeAnimalIdentityKey('  ABC 123  '), 'ABC 123');
});
