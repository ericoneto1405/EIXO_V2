import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHQAccountClosureReadRoutes } from './accountClosureReadRoutes.js';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth.js';

const protocol = 'ENC-20261001-0123456789ABCDEF';
const item = { protocol, type: 'LOGIN', status: 'OPEN', requesterEmail: 'original@example.invalid', createdAt: new Date(), closedAt: null, organization: null };
function fixture(db = {}) {
    const routes = new Map();
    const calls = [];
    const prisma = { accountClosureRequest: {
        findMany: async (query) => { calls.push(query); return db.rows || [item]; },
        findUnique: async (query) => { calls.push(query); return db.missing ? null : item; },
    } };
    registerHQAccountClosureReadRoutes({ get: (path, ...handlers) => routes.set(path, handlers) }, prisma);
    async function request({ detail = false, query = {}, roles = ['SUPER_ADMIN'], anonymous = false, target = protocol } = {}) {
        const handlers = routes.get(`/api/hq/encerramentos${detail ? '/:protocol' : ''}`);
        // Authenticated fixtures exercise the real role guard. Anonymous calls also exercise requireAuth.
        assert.equal(handlers[1], requireAuth);
        assert.equal(handlers[2], requireSuperAdmin);
        const req = { query, params: { protocol: target }, user: anonymous ? undefined : { roles }, get: () => '', header: () => undefined };
        const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        for (const handler of handlers) {
            if (handler === requireAuth && !anonymous) continue;
            let nextCalled = false;
            await handler(req, res, () => { nextCalled = true; });
            if (!nextCalled) break;
        }
        return res;
    }
    return { request, calls, routes };
}

test('lista e detalhes exigem autenticação e superadministrador antes de consultar dados', async () => {
    for (const detail of [false, true]) {
        const { request, calls } = fixture();
        assert.equal((await request({ detail, anonymous: true })).statusCode, 401);
        for (const roles of [[], ['OWNER'], ['ADMIN'], ['MEMBER']]) {
            const res = await request({ detail, roles });
            assert.equal(res.statusCode, 403);
            assert.equal(res.headers['Cache-Control'], 'no-store');
        }
        assert.equal(calls.length, 0);
        assert.equal((await request({ detail })).statusCode, 200);
    }
});

test('padrão aberto, ordenação estável e projeção mínima sem credenciais', async () => {
    const { request, calls, routes } = fixture();
    const res = await request();
    assert.equal(routes.size, 2);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(calls[0].where, { status: 'OPEN' });
    assert.deepEqual(calls[0].orderBy, [{ createdAt: 'asc' }, { protocol: 'asc' }]);
    assert.deepEqual(Object.keys(calls[0].select).sort(), ['closedAt', 'createdAt', 'organization', 'protocol', 'requesterEmail', 'status', 'type']);
    assert.deepEqual(calls[0].select.organization, { select: { id: true, name: true } });
    assert.equal(res.body.requests[0].requesterEmail, 'original@example.invalid');
});

test('busca parametrizada por e-mail/protocolo, filtros e paginação limitada a 25', async () => {
    const { request, calls } = fixture({ rows: Array.from({ length: 26 }, (_, i) => ({ ...item, protocol: `${protocol}-${i}` })) });
    const res = await request({ query: { search: '  ENC-%  ', type: 'ORGANIZATION', status: 'CLOSED', page: '2', limit: '999999' } });
    assert.deepEqual(calls[0].where, { type: 'ORGANIZATION', status: 'CLOSED', OR: [
        { requesterEmail: { contains: 'ENC-%', mode: 'insensitive' } },
        { protocol: { contains: 'ENC-%', mode: 'insensitive' } },
    ] });
    assert.equal(calls[0].skip, 25);
    assert.equal(calls[0].take, 26);
    assert.equal(res.body.requests.length, 25);
    assert.deepEqual(res.body.pagination, { page: 2, pageSize: 25, hasMore: true });
});

test('filtros inválidos e valores estruturados não chegam ao banco', async () => {
    const { request, calls } = fixture();
    for (const query of [{ status: 'DELETED' }, { type: 'USER' }, { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1000000' }, { page: ['1'] }, { search: {} }, { search: 'a'.repeat(255) }, { status: ['OPEN'] }]) {
        assert.equal((await request({ query })).statusCode, 400);
    }
    assert.equal(calls.length, 0);
});

test('visão global autorizada não inventa organização para login e aceita vínculo ausente', async () => {
    const rows = [item, { ...item, type: 'ORGANIZATION', organization: { id: 'org-a', name: 'A' } }, { ...item, type: 'ORGANIZATION', organization: { id: 'org-b', name: 'B' } }, { ...item, type: 'ORGANIZATION', organization: null }];
    const { request, calls } = fixture({ rows });
    const res = await request({ query: { status: 'ALL' } });
    assert.deepEqual(calls[0].where, {});
    assert.deepEqual(res.body.requests, rows);
    assert.equal((await request({ detail: true })).body.request.organization, null);
});

test('detalhe é vinculado ao protocolo exato e retorna 404 sem revelar dados de outro pedido', async () => {
    const { request, calls } = fixture({ missing: true });
    const other = 'ENC-20261001-FEDCBA9876543210';
    assert.equal((await request({ detail: true, target: other })).statusCode, 404);
    assert.deepEqual(calls[0].where, { protocol: other });
    assert.equal((await request({ detail: true, target: '../users' })).statusCode, 400);
    assert.equal(calls.length, 1);
});

test('lista vazia mantém paginação coerente', async () => {
    const { request } = fixture({ rows: [] });
    assert.deepEqual((await request()).body, { requests: [], pagination: { page: 1, pageSize: 25, hasMore: false } });
});
