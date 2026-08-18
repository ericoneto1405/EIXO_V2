import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPurchasePaymentSchedule, resolveAllocations, summarizeCashFlow, summarizeIncomeStatement, syncTransactionResult, upsertAutomaticResult } from './financialService.js';

test('compra paga gera um único lançamento realizado', () => {
    const schedule = buildPurchasePaymentSchedule({ amount: 1500, condition: 'PAGO', purchaseDate: '2026-08-18' });
    assert.equal(schedule.length, 1);
    assert.equal(schedule[0].amount, 1500);
    assert.equal(schedule[0].status, 'PAGO');
    assert.equal(schedule[0].dueDate, null);
});

test('compra parcelada preserva o total e vencimentos mensais', () => {
    const schedule = buildPurchasePaymentSchedule({ amount: 100, condition: 'PARCELADO', purchaseDate: '2026-08-18', dueDate: '2026-08-31', installments: 3 });
    assert.deepEqual(schedule.map((item) => item.amount), [33.34, 33.33, 33.33]);
    assert.deepEqual(schedule.map((item) => item.dueDate.toISOString().slice(0, 10)), ['2026-08-31', '2026-09-30', '2026-10-31']);
    assert.equal(schedule.reduce((sum, item) => sum + item.amount, 0), 100);
});

test('DRE separa receita, custo, despesa e resultados financeiros', () => {
    const result = summarizeIncomeStatement([
        { resultClass: 'OPERATING_REVENUE', amount: 1000, accountCategory: { type: 'ENTRADA' } },
        { resultClass: 'PRODUCTION_COST', amount: 400, accountCategory: { type: 'SAIDA' } },
        { resultClass: 'OPERATING_EXPENSE', amount: 100, accountCategory: { type: 'SAIDA' } },
        { resultClass: 'FINANCIAL_RESULT', amount: 20, accountCategory: { type: 'SAIDA' } },
    ]);
    assert.deepEqual(result, {
        operatingRevenue: 1000, productionCost: 400, operatingExpense: 100,
        financialResult: -20, otherResult: 0, grossMargin: 600,
        operatingResult: 500, managementResult: 480,
    });
});

test('rateio parcial preserva o valor não atribuído e bloqueia excesso', async () => {
    const db = {
        lot: { findFirst: async ({ where }) => ({ id: where.id, name: 'Lote A', productionPhase: 'ENGORDA' }) },
        poLot: { findFirst: async () => null },
        paddock: { findFirst: async () => null },
    };
    const allocations = await resolveAllocations(db, 'farm-1', 100, [{ lotId: 'lot-1', percent: 60 }]);
    assert.equal(allocations[0].amount, 60);
    assert.equal(allocations[0].productionPhase, 'ENGORDA');
    const total = await resolveAllocations(db, 'farm-1', 100, [{ lotId: 'lot-1', percent: 60 }, { lotId: 'lot-2', percent: 40 }]);
    assert.equal(total.reduce((sum, item) => sum + item.amount, 0), 100);
    const automatic = await resolveAllocations(db, 'farm-1', 100, [{ lotId: 'lot-1' }]);
    assert.equal(automatic[0].amount, 100);
    await assert.rejects(() => resolveAllocations(db, 'farm-1', 100, [{ lotId: 'lot-1', amount: 101 }]), /não pode superar/);
});

test('cancelamento reverte o resultado sem apagar o registro', async () => {
    let reversal = null;
    const db = { financialResultEntry: { updateMany: async (payload) => { reversal = payload; return { count: 1 }; } } };
    await syncTransactionResult(db, { id: 'tx-cancelada', modelVersion: 2, status: 'CANCELADO' }, null);
    assert.equal(reversal.where.sourceKey, 'TRANSACTION:tx-cancelada:RESULT');
    assert.equal(reversal.data.status, 'REVERSED');
    assert.ok(reversal.data.reversedAt instanceof Date);
});

test('consolidado é igual à soma das fazendas permitidas', () => {
    const farmA = [{ resultClass: 'OPERATING_REVENUE', amount: 500, accountCategory: { type: 'ENTRADA' } }];
    const farmB = [{ resultClass: 'PRODUCTION_COST', amount: 120, accountCategory: { type: 'SAIDA' } }];
    const consolidated = summarizeIncomeStatement([...farmA, ...farmB]);
    const a = summarizeIncomeStatement(farmA);
    const b = summarizeIncomeStatement(farmB);
    assert.equal(consolidated.managementResult, a.managementResult + b.managementResult);
});

test('lançamento imediato pendente entra uma única vez na DRE pela competência', async () => {
    const sourceKeys = new Set();
    const db = {
        financialResultEntry: {
            updateMany: async () => ({ count: 0 }),
            upsert: async ({ where, create }) => {
                sourceKeys.add(where.sourceKey);
                return { id: 'entry-1', ...create };
            },
        },
        financialResultAllocation: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 0 }) },
    };
    const transaction = { id: 'tx-1', farmId: 'farm-1', modelVersion: 2, status: 'PENDENTE', valor: 200, data: new Date('2026-07-20'), competenceDate: new Date('2026-07-10') };
    const category = { id: 'cat-1', isConfigured: true, recognitionRule: 'IMMEDIATE', resultClass: 'PRODUCTION_COST' };
    await syncTransactionResult(db, transaction, category, []);
    await syncTransactionResult(db, transaction, category, []);
    assert.deepEqual([...sourceKeys], ['TRANSACTION:tx-1:RESULT']);
});

test('movimentação fora da DRE não cria resultado', async () => {
    let created = false;
    const db = {
        financialResultEntry: { updateMany: async () => ({ count: 0 }), upsert: async () => { created = true; } },
    };
    await syncTransactionResult(db, { id: 'tx-2', modelVersion: 2, status: 'PAGO' }, {
        isConfigured: true, recognitionRule: 'NOT_IN_RESULT', resultClass: null,
    });
    assert.equal(created, false);
});

test('transação da versão 1 permanece fora da nova DRE', async () => {
    let created = false;
    const db = { financialResultEntry: { updateMany: async () => ({ count: 0 }), upsert: async () => { created = true; } } };
    await syncTransactionResult(db, { id: 'legacy', modelVersion: 1, status: 'PAGO' }, {
        isConfigured: true, recognitionRule: 'IMMEDIATE', resultClass: 'OPERATING_REVENUE',
    });
    assert.equal(created, false);
});

test('caixa usa liquidação no realizado e vencimento no projetado', () => {
    const realized = summarizeCashFlow([
        { type: 'ENTRADA', valor: 100, settledAt: new Date('2026-07-10'), accountCategory: { cashFlowClass: 'FINANCING' } },
        { type: 'SAIDA', valor: 30, settledAt: new Date('2026-07-11'), accountCategory: { cashFlowClass: 'INVESTING' } },
    ], 'settledAt');
    const projected = summarizeCashFlow([{ type: 'SAIDA', valor: 25, vencimento: new Date('2026-08-05'), accountCategory: { cashFlowClass: 'OPERATING' } }], 'vencimento');
    assert.deepEqual(realized.totals, { incoming: 100, outgoing: 30, net: 70 });
    assert.equal(realized.byActivity.find((item) => item.activity === 'FINANCING').incoming, 100);
    assert.equal(projected.byMonth[0].month, '2026-08');
});

test('resultado automático usa sourceKey idempotente', async () => {
    const sourceKeys = new Set();
    const db = {
        farm: { findUnique: async () => ({ organizationId: 'org-1' }) },
        organizationFinancialSettings: { upsert: async () => ({ organizationId: 'org-1' }) },
        accountCategory: { findUnique: async () => ({ id: 'sys-racao' }) },
        financialResultEntry: { upsert: async ({ where, create }) => { sourceKeys.add(where.sourceKey); return { id: 'entry-1', ...create }; } },
        financialResultAllocation: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 0 }) },
    };
    const payload = { farmId: 'farm-1', accountCategoryId: 'sys-racao', sourceKey: 'NUTRITION_EXECUTION:1:CONSUMPTION', sourceType: 'NUTRITION_CONSUMPTION', resultClass: 'PRODUCTION_COST', amount: 80, competenceDate: new Date(), allocations: [] };
    await upsertAutomaticResult(db, payload);
    await upsertAutomaticResult(db, payload);
    assert.deepEqual([...sourceKeys], ['NUTRITION_EXECUTION:1:CONSUMPTION']);
});
