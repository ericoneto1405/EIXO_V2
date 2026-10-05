import test from 'node:test';
import assert from 'node:assert/strict';
import { registerFieldRoutes } from './fieldRoutes.js';

const occurrences = [
    { id: 'a', farmId: 'farm-a', organizationId: 'org-a', status: 'PENDENTE', type: 'AGUA', occurredAt: new Date(), attachments: [] },
    { id: 'b', farmId: 'farm-b', organizationId: 'org-a', status: 'CONFIRMADO', type: 'COCHO', occurredAt: new Date(), attachments: [] },
    { id: 'c', farmId: 'farm-c', organizationId: 'org-a', status: 'PENDENTE', type: 'AGUA', occurredAt: new Date(), attachments: [] },
    { id: 'd', farmId: 'farm-a', organizationId: 'org-b', status: 'PENDENTE', type: 'AGUA', occurredAt: new Date(), attachments: [] },
];

function fixture() {
    const routes = new Map();
    const calls = [];
    const database = {
        fieldOccurrence: { findMany: async (query) => {
            calls.push(query);
            return occurrences.filter((item) => Object.entries(query.where).every(([key, value]) =>
                typeof value === 'object' ? value.in.includes(item[key]) : item[key] === value,
            )).slice(query.skip, query.skip + query.take);
        } },
        activityLog: { findMany: async () => [] },
    };
    const app = Object.fromEntries(['get', 'post', 'patch', 'delete'].map((method) => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers)]));
    registerFieldRoutes(app, { database });
    const request = async (query = {}, restrictToFarmIds = ['farm-a', 'farm-b']) => {
        const req = { query, saas: { organizationId: 'org-a' }, access: { restrictToFarmIds } };
        const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        // Exercita o handler real com acesso já autenticado, sem banco ou sessão reais.
        await routes.get('get /field-occurrences').at(-1)(req, res);
        return res;
    };
    return { request, calls };
}

test('fazenda selecionada não é substituída por todas as fazendas permitidas', async () => {
    const { request, calls } = fixture();
    const res = await request({ farmId: 'farm-b', limit: 1 });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.occurrences.map((item) => item.farmId), ['farm-b']);
    assert.equal(calls[0].where.farmId, 'farm-b');
    assert.equal(res.body.total, 1);
});

test('fazenda proibida é recusada antes da consulta', async () => {
    const { request, calls } = fixture();
    assert.equal((await request({ farmId: 'farm-c' })).statusCode, 403);
    assert.equal(calls.length, 0);
});

test('sem seleção lista somente as fazendas permitidas da organização', async () => {
    const { request } = fixture();
    const res = await request();
    assert.deepEqual(res.body.occurrences.map((item) => item.id), ['a', 'b']);
});

test('sem restrição específica preserva organização, seleção e filtros', async () => {
    const { request } = fixture();
    assert.deepEqual((await request({ farmId: 'farm-a' }, null)).body.occurrences.map((item) => item.id), ['a']);
    assert.deepEqual((await request({ status: 'CONFIRMADO', type: 'COCHO' })).body.occurrences.map((item) => item.id), ['b']);
});

test('paginação e formato da resposta permanecem compatíveis', async () => {
    const { request } = fixture();
    const res = await request({ limit: 1, offset: 1 });
    assert.deepEqual(Object.keys(res.body).sort(), ['occurrences', 'total']);
    assert.deepEqual(res.body.occurrences.map((item) => item.id), ['b']);
    assert.equal(res.body.total, 1);
});
