import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePharmacyMovement } from './pharmacyRules.js';

test('soma uma entrada ao saldo atual', () => {
    assert.deepEqual(calculatePharmacyMovement({ currentStock: 10, type: 'ENTRY', quantity: 4 }), {
        nextStock: 14,
        movementQuantity: 4,
    });
});

test('impede saída maior que o estoque', () => {
    assert.throws(
        () => calculatePharmacyMovement({ currentStock: 3, type: 'EXIT', quantity: 4 }),
        /Estoque insuficiente/,
    );
});

test('registra a diferença ao ajustar o saldo', () => {
    assert.deepEqual(calculatePharmacyMovement({ currentStock: 10, type: 'ADJUSTMENT', quantity: 7 }), {
        nextStock: 7,
        movementQuantity: -3,
    });
});
