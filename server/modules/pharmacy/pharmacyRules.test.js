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

import { normalizePharmacyPayment, pharmacyPurchaseAccount } from './pharmacyRules.js';
import { buildPurchasePaymentSchedule } from '../financial/financialService.js';

test('compra vira custo na conta da categoria do produto', () => {
    assert.equal(pharmacyPurchaseAccount('VACINA'), 'sys-vacinas');
    assert.equal(pharmacyPurchaseAccount('ANTIPARASITARIO'), 'sys-vermifugos');
    assert.equal(pharmacyPurchaseAccount('ANTIBIOTICO'), 'sys-tratamentos');
});

test('compra da farmácia: cartão parcelado vence na data da fatura, mês a mês', () => {
    const { schedule, isCard } = normalizePharmacyPayment({ condition: 'CARTAO', dueDate: '2026-10-10', installments: 3 });
    assert.equal(isCard, true);
    const parcelas = buildPurchasePaymentSchedule({ amount: 300, purchaseDate: new Date('2026-09-16T12:00:00Z'), ...schedule });
    assert.deepEqual(parcelas.map((p) => p.dueDate.toISOString().slice(0, 10)), ['2026-10-10', '2026-11-10', '2026-12-10']);
    assert.ok(parcelas.every((p) => p.status === 'PENDENTE' && p.amount === 100));
});

test('compra da farmácia: cartão à vista vira uma conta na data da fatura', () => {
    const { schedule } = normalizePharmacyPayment({ condition: 'CARTAO', dueDate: '2026-10-10' });
    const parcelas = buildPurchasePaymentSchedule({ amount: 80, purchaseDate: new Date('2026-09-16T12:00:00Z'), ...schedule });
    assert.equal(parcelas.length, 1);
    assert.equal(parcelas[0].dueDate.toISOString().slice(0, 10), '2026-10-10');
});

test('compra da farmácia: validações de pagamento', () => {
    assert.ok(normalizePharmacyPayment({ condition: 'CARTAO' }).error);
    assert.ok(normalizePharmacyPayment({ condition: 'CARTAO', dueDate: '2026-10-10', installments: 30 }).error);
    assert.ok(normalizePharmacyPayment({ condition: 'BOLETO' }).error);
    assert.ok(normalizePharmacyPayment({ condition: 'A_PAGAR' }).error);
    assert.deepEqual(normalizePharmacyPayment({ condition: 'PAGO' }).schedule, { condition: 'PAGO' });
});
