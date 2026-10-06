import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistory, historyPreview, historyHash, saveHistory } from './sanityHistory.js';
import { loadSanitaryTimeline } from './sanityTimeline.js';
const now = new Date('2026-10-05T15:00:00Z');
const product = { id: 'p', farmId: 'f', active: true, category: 'VERMIFUGO', name: 'Produto', applicationUnit: 'ml', slaughterWithdrawalDays: 30 };
const animals = [{ id: 'a', farmId: 'f', brinco: '001', status: 'VIVO', sexo: 'MACHO', dataNascimento: new Date('2024-01-01') }];
const input = (extra = {}) => normalizeHistory({ productId: 'p', appliedAt: '2026-09-25', selecao: { animalIds: ['a'] }, ...extra }, now);
const selection = { animais: animals, naoEncontrados: [], repetidos: [] };
function database() {
    let requests = new Map(), applications = [], logs = [];
    let writes = 0;
    const db = {
        sanitaryHistoryRequest: { findUnique: async ({ where }) => requests.get(JSON.stringify(where.farmId_requestId)) || null },
        $transaction: async fn => {
            const pendingRequests = new Map(requests), pendingApplications = [...applications], pendingLogs = [...logs];
            const tx = {
                pharmacyProduct: { findFirst: async ({ where }) => where.farmId === 'f' && where.id === 'p' ? product : null },
                sanitaryHistoryRequest: { create: async ({ data }) => pendingRequests.set(JSON.stringify({ farmId: data.farmId, requestId: data.requestId }), data) },
                sanitaryApplication: { createMany: async ({ data }) => { writes++; pendingApplications.push(...data); } },
                $executeRawUnsafe: async (...args) => pendingLogs.push(args),
            };
            const result = await fn(tx);
            requests = pendingRequests; applications = pendingApplications; logs = pendingLogs;
            return result;
        },
        state: () => ({ applications, requests, logs, writes }),
    };
    return db;
}
const req = { sanityFarm: { id: 'f' }, user: { id: 'u', name: 'Usuário' } };
test('histórico aceita dose desconhecida e não calcula pelo peso atual', () => {
    const preview = historyPreview(input(), product, selection);
    assert.equal(preview.linhas[0].dose, null);
    assert.equal(preview.resumo.consumoEstoque, null);
    assert.equal(preview.resumo.doseTotal, null);
    assert.equal(preview.resumo.custoTotal, null);
    assert.equal(preview.resumo.carenciaAte.toISOString(), '2026-10-25T12:00:00.000Z');
});
test('datas inexistentes, futuras, vazias e doses inválidas são rejeitadas', () => {
    for (const appliedAt of ['', '2026-02-30', '2026-10-06']) assert.throws(() => input({ appliedAt }));
    for (const dose of [0, -1, 'texto', Infinity, true]) assert.throws(() => input({ dose }));
    assert.throws(() => historyPreview(input({ dose: 2, doseUnit: 'dose' }), product, selection));
});
test('sexo e idade são conferidos na data anterior', () => {
    const vaccine = { ...product, category: 'VACINA', name: 'B19' };
    assert.equal(historyPreview(input(), vaccine, selection).resumo.bloqueados, 1);
    const female = { ...animals[0], sexo: 'FEMEA', dataNascimento: new Date('2026-05-01') };
    assert.equal(historyPreview(input(), vaccine, { ...selection, animais: [female] }).resumo.bloqueados, 0);
});
test('seleções desconhecidas, repetidas e acima do limite bloqueiam o grupo', () => {
    for (const extra of [{ naoEncontrados: ['x'] }, { repetidos: ['001'] }, { animais: Array(2001).fill(animals[0]) }]) assert.ok(historyPreview(input(), product, { ...selection, ...extra }).bloqueiosGerais.length);
});
test('grava somente histórico e autoria, replay não duplica e conteúdo diferente conflita', async () => {
    const db = database();
    const result = await saveHistory(db, req, input(), 'request-001', async () => selection);
    assert.equal(db.state().applications[0].batchId, null);
    assert.equal(db.state().applications[0].unitCost, null);
    assert.equal(db.state().applications[0].origin, 'HISTORY');
    assert.equal(db.state().logs.length, 1);
    assert.deepEqual(await saveHistory(db, req, input(), 'request-001', async () => { throw new Error('Não deve reler seleção'); }), result);
    assert.equal(db.state().writes, 1);
    await assert.rejects(saveHistory(db, req, input({ notes: 'Mudou' }), 'request-001', async () => selection), /outro conteúdo/);
});
test('produto de outra fazenda e animal inválido impedem todas as gravações', async () => {
    const db = database();
    await assert.rejects(saveHistory(db, { ...req, sanityFarm: { id: 'outra' } }, input(), 'request-001', async () => selection), /Farmácia/);
    await assert.rejects(saveHistory(db, req, input(), 'request-002', async () => ({ ...selection, naoEncontrados: ['a'] })), /identificações/);
    assert.equal(db.state().applications.length, 0);
    assert.equal(db.state().requests.size, 0);
});
test('falha na autoria desfaz o grupo inteiro', async () => {
    const db = database();
    const transaction = db.$transaction;
    db.$transaction = fn => transaction(tx => fn({ ...tx, $executeRawUnsafe: async () => { throw new Error('Falha de autoria'); } }));
    await assert.rejects(saveHistory(db, req, input(), 'request-001', async () => selection), /Falha de autoria/);
    assert.equal(db.state().applications.length, 0);
    assert.equal(db.state().requests.size, 0);
});
test('hash normaliza seleção e replay concorrente recupera a operação confirmada', async () => {
    assert.equal(historyHash(input({ selecao: { animalIds: ['b', 'a', 'a'] } })), historyHash(input({ selecao: { animalIds: ['a', 'b'] } })));
    let reads = 0;
    const result = { groupId: 'g', aplicados: 1 };
    const db = { sanitaryHistoryRequest: { findUnique: async () => ++reads === 1 ? null : { payloadHash: historyHash(input()), result } }, $transaction: async () => { throw Object.assign(new Error(), { code: 'P2002' }); } };
    assert.deepEqual(await saveHistory(db, req, input(), 'request-001', async () => selection), result);
});
test('consulta reúne fontes, ordena, mantém escopo e não inventa autoria', async () => {
    const checks = [];
    const db = {
        sanitaryRecord: { findMany: async query => { checks.push(query.where); return [{ id: 'r', farmId: 'f', animalId: 'a', tipo: 'VACINA', produto: 'Texto antigo', date: new Date('2026-01-01'), createdAt: new Date() }]; } },
        sanitaryApplication: { findMany: async query => { checks.push(query.where); return [{ id: 's', farmId: 'f', animalId: 'a', groupId: 'g', origin: 'HISTORY', dose: null, appliedAt: new Date('2026-09-25'), createdAt: new Date(), product }]; } },
        activityLog: { findMany: async query => { assert.equal(query.where.farmId, 'f'); return [{ entityId: 'g', user: { name: 'Ana' } }]; } },
    };
    const records = await loadSanitaryTimeline(db, animals[0]);
    assert.deepEqual(checks, [{ farmId: 'f', animalId: 'a' }, { farmId: 'f', animalId: 'a' }]);
    assert.equal(records[0].registeredBy, 'Ana');
    assert.equal(records[1].registeredBy, null);
    assert.equal(records[0].dose, null);
    assert.equal(records[1].origin, 'INDIVIDUAL');
});
