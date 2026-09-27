import test from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorHandler, asyncRoute } from '../modules/middlewares/errorHandler.js';
import { requireHerdWriteAccess, requireModule, requireNonFieldWorker, requireOrganizationOwner } from '../modules/middlewares/requireAuth.js';
import { buildFarmAccountFilter } from '../modules/middlewares/farmScope.js';

const response = () => ({
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
});

test('bulk delete permite continuar somente para OWNER', () => {
    let continued = false;
    const ownerResponse = response();
    requireOrganizationOwner({ saas: { membershipRole: 'OWNER' } }, ownerResponse, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(ownerResponse.statusCode, 200);

    for (const membershipRole of ['ADMIN', 'MEMBER', null]) {
        const denied = response();
        requireOrganizationOwner({ saas: { membershipRole } }, denied, () => assert.fail('não deveria continuar'));
        assert.equal(denied.statusCode, 403);
    }
});

test('asyncRoute encaminha rejeições ao tratamento central', async () => {
    const expected = new TypeError('entrada inválida');
    const forwarded = new Promise((resolve) => {
        asyncRoute(async () => { throw expected; })({}, {}, resolve);
    });
    assert.equal(await forwarded, expected);
});

test('JSON malformado recebe 400 no tratamento central', () => {
    const res = response();
    const error = Object.assign(new SyntaxError('JSON quebrado'), { status: 400, type: 'entity.parse.failed' });
    apiErrorHandler(error, {}, res, () => assert.fail('não deveria encaminhar novamente'));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.payload, { message: 'JSON inválido.' });
});

test('importação exige web e a permissão Editar Animais', () => {
    const fieldResponse = response();
    requireNonFieldWorker({ access: { appContext: { mode: 'field' } } }, fieldResponse, () => assert.fail('campo não deveria continuar'));
    assert.equal(fieldResponse.statusCode, 403);

    const withoutPermission = response();
    requireModule('Editar Animais')({
        user: { roles: ['user'], modules: [], accessType: 'WEB' },
        saas: { planCode: 'EIXO_DECISAO', membershipRole: 'MEMBER', entitlements: ['EIXO_DECISAO'] },
    }, withoutPermission, () => assert.fail('usuário sem permissão não deveria continuar'));
    assert.equal(withoutPermission.statusCode, 403);

    let continued = false;
    requireModule('Editar Animais')({
        user: { roles: ['user'], modules: ['Editar Animais'], accessType: 'WEB' },
        saas: { planCode: 'EIXO_DECISAO', membershipRole: 'MEMBER', entitlements: ['EIXO_DECISAO'] },
    }, response(), () => { continued = true; });
    assert.equal(continued, true);
});

test('alterações do rebanho exigem Editar Animais, mas consultas continuam liberadas', () => {
    const withoutPermission = {
        method: 'POST',
        user: { roles: ['user'], modules: [], accessType: 'WEB' },
        saas: { planCode: 'EIXO_DECISAO', membershipRole: 'MEMBER', entitlements: ['EIXO_DECISAO'] },
    };
    const denied = response();
    requireHerdWriteAccess(withoutPermission, denied, () => assert.fail('alteração não deveria continuar'));
    assert.equal(denied.statusCode, 403);

    let readContinued = false;
    requireHerdWriteAccess({ ...withoutPermission, method: 'GET' }, response(), () => { readContinued = true; });
    assert.equal(readContinued, true);

    let writeContinued = false;
    requireHerdWriteAccess({
        ...withoutPermission,
        user: { ...withoutPermission.user, modules: ['Editar Animais'] },
    }, response(), () => { writeContinued = true; });
    assert.equal(writeContinued, true);
});

test('escopo entre fazendas fica restrito à mesma conta', () => {
    assert.deepEqual(buildFarmAccountFilter({ organizationId: 'org-a', userId: 'user-a' }), { organizationId: 'org-a' });
    assert.deepEqual(buildFarmAccountFilter({ organizationId: null, userId: 'user-a' }), { organizationId: null, userId: 'user-a' });
});
