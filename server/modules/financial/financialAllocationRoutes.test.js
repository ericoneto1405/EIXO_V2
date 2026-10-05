import test from 'node:test';
import assert from 'node:assert/strict';
import { registerFinancialAllocationRoutes, canEditTransactionAllocations } from './financialAllocationRoutes.js';
import { requireAuth, requireBillingAccess } from '../middlewares/requireAuth.js';

const category = { isConfigured: true, recognitionRule: 'IMMEDIATE', resultClass: 'OPERATING_EXPENSE' };
const transaction = { id: 'tx-a', farmId: 'farm-a', modelVersion: 2, status: 'PENDENTE', accountCategory: category };
const allocations = [{ id: 'division-a', amount: '33.33', lotId: 'lot-a', paddockId: null, animalId: 'animal-a', productionPhase: 'RECRIA', lotNameSnapshot: 'Lote histórico', animalLabelSnapshot: 'Animal histórico', paddockNameSnapshot: null }];
function fixture({ current = transaction, entries = [{ id: 'direct', sourceKey: 'TRANSACTION:tx-a:RESULT', allocations }] } = {}) {
    const calls = [];
    let handlers;
    const database = {
        financialTransaction: { findFirst: async (query) => { calls.push(['transaction', query]); const clauses = query.where.farm.AND || [query.where.farm]; const farm = { id: 'farm-a', organizationId: 'org-a', userId: 'user-a' }; const authorized = clauses.every((clause) => Object.entries(clause).every(([key, value]) => typeof value === 'object' ? value.in.includes(farm[key]) : value === farm[key])); return authorized && query.where.id === 'tx-a' ? current : null; } },
        financialResultEntry: { findMany: async (query) => { calls.push(['entries', query]); return entries; } },
    };
    registerFinancialAllocationRoutes({ get: (path, ...registered) => { assert.equal(path, '/financial/transactions/:id/allocations'); handlers = registered; } }, { database });
    const request = async (organizationId = 'org-a', restrictToFarmIds = ['farm-a'], userId = 'user-a') => {
        const req = { params: { id: 'tx-a' }, saas: { organizationId }, access: { restrictToFarmIds }, user: { id: userId } };
        const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers.at(-1)(req, res); return res;
    };
    return { calls, request, get handlers() { return handlers; } };
}
test('consulta exige autenticação e acesso de assinatura', () => {
    const { handlers } = fixture(); assert.equal(handlers[0], requireAuth); assert.equal(handlers[1], requireBillingAccess);
});
test('consulta preserva centavos, destinos e fase e limita resultados ao lançamento ativo', async () => {
    const { request, calls } = fixture(); const res = await request();
    assert.equal(res.statusCode, 200); assert.equal(res.body.editable, true);
    assert.equal(res.body.allocations[0].amount, 33.33); assert.equal(res.body.allocations[0].productionPhase, 'RECRIA'); assert.equal(res.body.allocations[0].animalLabel, 'Animal histórico');
    assert.deepEqual(calls[1][1].where, { transactionId: 'tx-a', farmId: 'farm-a', status: 'ACTIVE' });
});
test('outra organização não consulta destinos', async () => {
    const { request, calls } = fixture(); assert.equal((await request('org-b')).statusCode, 404); assert.equal(calls.length, 1);
});
test('restrição de fazenda impede consulta mesmo dentro da organização', async () => {
    const { request, calls } = fixture(); assert.equal((await request('org-a', ['farm-b'])).statusCode, 404); assert.equal(calls.length, 1);
});
test('conta legada continua limitada ao proprietário', async () => {
    const { request } = fixture(); assert.equal((await request(null, [], 'user-a')).statusCode, 200); assert.equal((await request(null, [], 'user-b')).statusCode, 404);
});
test('distribuição vazia é explícita e resultados indiretos ficam separados', async () => {
    const { request } = fixture({ entries: [{ id: 'cost', sourceKey: 'HERD_SALE:event:COST', description: 'Custo reconhecido', amount: '75.00', allocations }] });
    const res = await request(); assert.deepEqual(res.body.allocations, []); assert.equal(res.body.relatedResults[0].amount, 75);
});
test('vínculos automáticos, legado, cancelamento e reconhecimento indireto são somente consulta', async () => {
    for (const override of [{ herdEventId: 'event-a' }, { sanitaryRecordId: 'record-a' }, { modelVersion: 1 }, { status: 'CANCELADO' }, { accountCategory: { ...category, recognitionRule: 'ON_NUTRITION_CONSUMPTION' } }, { accountCategory: { ...category, deprecatedAt: new Date() } }]) {
        const current = { ...transaction, ...override };
        assert.equal(canEditTransactionAllocations(current), false);
        const res = await fixture({ current }).request(); assert.equal(res.body.editable, false); assert.ok(res.body.reason); assert.equal(res.body.allocations[0].amount, 33.33);
    }
});
