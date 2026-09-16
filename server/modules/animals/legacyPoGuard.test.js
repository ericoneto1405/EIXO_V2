import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLegacyPoReference, rejectLegacyPoReference } from './legacyPoGuard.js';

test('classificação P.O. permanece válida no cadastro único', () => {
    assert.equal(hasLegacyPoReference({ tipoCadastro: 'PO', animalId: 'a', herdType: 'COMMERCIAL' }), false);
    assert.equal(hasLegacyPoReference({ bullAnimalId: 'a', bullPoAnimalId: null }), false);
});
test('rejeita IDs legados inclusive em rateios sem reinterpretá-los', () => {
    for (const key of ['poAnimalId','poLotId','bullPoAnimalId','donorPoAnimalId','sirePoAnimalId','recipientPoAnimalId']) {
        assert.equal(hasLegacyPoReference({ [key]: 'old-id' }), true);
    }
    assert.equal(hasLegacyPoReference({ allocations: [{ poLotId: 'old-id' }] }), true);
    assert.equal(hasLegacyPoReference({ herdType: 'PO' }), true);
});
test('middleware encerra requisição legada antes de executar operação', () => {
    let called = false; let status; let body;
    const res = { status(code) { status=code; return this; }, json(value) { body=value; } };
    rejectLegacyPoReference({ body: { bullPoAnimalId:'old' } }, res, () => { called=true; });
    assert.equal(called, false); assert.equal(status, 400); assert.equal(body.code, 'LEGACY_PO_REFERENCE');
    rejectLegacyPoReference({ body: { tipoCadastro:'PO' } }, res, () => { called=true; });
    assert.equal(called, true);
});
