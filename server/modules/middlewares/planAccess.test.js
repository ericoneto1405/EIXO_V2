import test from 'node:test';
import assert from 'node:assert/strict';
import { requireBillingAccess, requireModule, requireEntitlement } from './requireAuth.js';

const request = (planCode, membershipRole, modules) => ({
    user: { roles: ['user'], accessType: 'WEB', modules },
    saas: { organizationId: 'test-org', planCode, membershipRole, entitlements: ['EIXO_DECISAO'] },
});
const run = async (guard, req) => {
    let result = 'allowed';
    await guard(req, { status(code) { result = code; return this; }, json() {} }, () => {});
    return result;
};

test('API bloqueia permissão comercial antiga no Essencial', async () => {
    assert.equal(await run(requireModule('Gestão Comercial'), request('GRATIS', 'ADMIN', ['Gestão Comercial'])), 403);
});
test('API exige permissão individual mesmo no Performance', async () => {
    assert.equal(await run(requireModule('Nutrição'), request('EIXO_DECISAO', 'ADMIN', ['Fazendas'])), 403);
    assert.equal(await run(requireModule('Nutrição'), request('EIXO_DECISAO', 'ADMIN', ['Nutrição'])), 'allowed');
});
test('API libera dono dentro do plano e mantém restrição financeira do operador', async () => {
    assert.equal(await run(requireModule('Reprodução'), request('EIXO_GESTAO', 'OWNER', [])), 'allowed');
    assert.equal(await run(requireModule('Financeiro'), request('EIXO_DECISAO', 'MEMBER', ['Financeiro'])), 403);
});
test('produto legado não libera relatórios ou genética fora do plano contratado', async () => {
    assert.equal(await run(requireEntitlement('EIXO_GESTAO', 'EIXO_DECISAO'), request('GRATIS', 'OWNER', [])), 403);
    assert.equal(await run(requireEntitlement('GENETICS', 'EIXO_DECISAO'), request('EIXO_GESTAO', 'OWNER', [])), 403);
    assert.equal(await run(requireEntitlement('GENETICS', 'EIXO_DECISAO'), request('EIXO_DECISAO', 'OWNER', [])), 'allowed');
});


test('Acasalamento exige Performance mesmo com produto GENETICS e permissão antiga', async () => {
    for (const planCode of ['GRATIS', 'EIXO_GESTAO', 'EIXO_DECISAO']) {
        const req = request(planCode, 'ADMIN', ['Eixo Genetics']);
        req.saas.entitlements = ['GENETICS', 'EIXO_DECISAO'];
        assert.equal(await run(requireEntitlement('EIXO_DECISAO'), req), planCode === 'EIXO_DECISAO' ? 'allowed' : 403);
    }
});


test('SUPER_ADMIN ignora bloqueios de módulo, plano e assinatura', async () => {
    const req = request('GRATIS', 'MEMBER', []);
    req.user.roles = ['SUPER_ADMIN'];
    req.saas.billingAccessState = 'BLOCKED';
    for (const module of ['Financeiro', 'Eixo Genetics', 'Reprodução', 'Nutrição', 'Gestão Comercial', 'Confinamento e Contratos', 'Estoque e Equipamentos']) {
        assert.equal(await run(requireModule(module), req), 'allowed');
    }
    assert.equal(await run(requireBillingAccess, req), 'allowed');
    req.saas.organizationId = null;
    assert.equal(await run(requireEntitlement('EIXO_DECISAO'), req), 'allowed');
});

test('assinatura bloqueada continua restringindo usuários comuns', async () => {
    const req = request('EIXO_DECISAO', 'OWNER', []);
    req.saas.billingAccessState = 'BLOCKED';
    assert.equal(await run(requireBillingAccess, req), 402);
});
