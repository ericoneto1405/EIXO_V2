import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPER_ADMIN_ALL_MODULES, serializeAuthUser, serializeManagedUser, buildAllowedModulesFromPlan, canAccessEixoCampo, canUpgradePlan, getPlanLimits, normalizePlanCode, resolveUserFarmAccess } from './saasContext.js';

test('normaliza os nomes equivalentes do plano gratuito', () => {
    assert.equal(normalizePlanCode('gratis'), 'GRATIS');
    assert.equal(normalizePlanCode('free'), 'GRATIS');
    assert.equal(normalizePlanCode('gratuito'), 'GRATIS');
});

test('aplica os limites prometidos para Essencial e Gestão', () => {
    assert.deepEqual(getPlanLimits('GRATIS'), {
        code: 'GRATIS',
        farms: 1,
        users: 3,
        label: 'plano EIXO Essencial',
    });
    assert.deepEqual(getPlanLimits('EIXO_GESTAO'), {
        code: 'EIXO_GESTAO',
        farms: 3,
        users: 5,
        label: 'plano EIXO Gestão',
    });
});

test('mantém o plano Performance sem limite de fazendas e usuários', () => {
    assert.deepEqual(getPlanLimits('EIXO_DECISAO'), {
        code: 'EIXO_DECISAO',
        farms: null,
        users: null,
        label: 'plano EIXO Performance',
    });
});

test('libera o App EIXO Campo somente no plano Performance', () => {
    assert.equal(canAccessEixoCampo({ planCode: 'GRATIS' }), false);
    assert.equal(canAccessEixoCampo({ planCode: 'EIXO_GESTAO' }), false);
    assert.equal(canAccessEixoCampo({ planCode: 'EIXO_DECISAO' }), true);
});

test('trata plano ausente ou desconhecido como gratuito', () => {
    assert.equal(getPlanLimits(null).code, 'GRATIS');
    assert.equal(getPlanLimits('PLANO_INEXISTENTE').code, 'GRATIS');
});

test('permite somente evolução para um plano superior conhecido', () => {
    assert.equal(canUpgradePlan('GRATIS', 'EIXO_GESTAO'), true);
    assert.equal(canUpgradePlan('GRATIS', 'EIXO_DECISAO'), true);
    assert.equal(canUpgradePlan('EIXO_GESTAO', 'EIXO_DECISAO'), true);
    assert.equal(canUpgradePlan('EIXO_GESTAO', 'GRATIS'), false);
    assert.equal(canUpgradePlan('EIXO_DECISAO', 'EIXO_DECISAO'), false);
    assert.equal(canUpgradePlan('GRATIS', 'PLANO_INEXISTENTE'), false);
});

const access = (planCode, membershipRole, modules) => buildAllowedModulesFromPlan(
    modules, ['EIXO_DECISAO'], ['user'], 'WEB', { planCode, membershipRole },
);

test('downgrade remove módulos pagos mesmo com permissões e entitlements antigos', () => {
    assert.deepEqual(access('GRATIS', 'ADMIN', ['Fazendas', 'Nutrição', 'Reprodução', 'Eixo Genetics', 'Gestão Comercial']), ['Fazendas']);
    assert.deepEqual(access('EIXO_GESTAO', 'ADMIN', ['Nutrição', 'Reprodução', 'Eixo Genetics']), ['Nutrição', 'Reprodução']);
});

test('contratar Performance não concede permissões individuais automaticamente', () => {
    assert.deepEqual(access('EIXO_DECISAO', 'ADMIN', ['Fazendas']), ['Fazendas']);
    assert.deepEqual(access('EIXO_DECISAO', 'ADMIN', []), []);
    assert.deepEqual(access('EIXO_DECISAO', 'MEMBER', ['Financeiro', 'Rebanho Comercial']), ['Rebanho Comercial']);
});

test('dono recebe os módulos contratados e perde os exclusivos após downgrade', () => {
    assert.ok(access('EIXO_DECISAO', 'OWNER', []).includes('Eixo Genetics'));
    assert.ok(access('EIXO_GESTAO', 'OWNER', []).includes('Reprodução'));
    assert.ok(access('GRATIS', 'OWNER', []).includes('Editar Animais'));
    assert.ok(access('EIXO_GESTAO', 'OWNER', []).includes('Editar Animais'));
    assert.ok(access('EIXO_DECISAO', 'OWNER', []).includes('Editar Animais'));
    assert.ok(!access('EIXO_GESTAO', 'OWNER', ['Eixo Genetics']).includes('Eixo Genetics'));
    assert.ok(!access('GRATIS', 'OWNER', []).includes('Nutrição'));
});

test('editar animais continua sendo permissão individual para quem não é dono', () => {
    assert.ok(!access('GRATIS', 'ADMIN', []).includes('Editar Animais'));
    assert.ok(access('GRATIS', 'ADMIN', ['Editar Animais']).includes('Editar Animais'));
});

test('lista de usuários mostra editar animais para o proprietário, mas não concede ao membro', () => {
    const user = { id: 'user-1', name: 'Usuário', email: 'usuario@eixo.local', modules: ['Fazendas'], roles: ['user'] };
    assert.ok(serializeManagedUser(user, 'OWNER').modules.includes('Editar Animais'));
    assert.ok(!serializeManagedUser(user, 'MEMBER').modules.includes('Editar Animais'));
});

test('usuário web sem vínculos acessa todas as fazendas', () => {
    const accessContext = resolveUserFarmAccess({ roles: ['user'], accessType: 'WEB', lastFarmId: 'farm-1' }, []);
    assert.deepEqual(accessContext.allowedFarmIds, []);
    assert.equal(accessContext.defaultFarmId, 'farm-1');
    assert.equal(accessContext.restrictToFarmIds, null);
});

test('usuário web com vínculos fica restrito às fazendas selecionadas', () => {
    const accessContext = resolveUserFarmAccess(
        { roles: ['user'], accessType: 'WEB', lastFarmId: 'farm-2' },
        [
            { farmId: 'farm-1', isDefault: true },
            { farmId: 'farm-2', isDefault: false },
        ],
    );
    assert.deepEqual(accessContext.allowedFarmIds, ['farm-1', 'farm-2']);
    assert.equal(accessContext.defaultFarmId, 'farm-1');
    assert.deepEqual(accessContext.restrictToFarmIds, ['farm-1', 'farm-2']);
});

test('acesso do App Campo continua exigindo exatamente uma fazenda', () => {
    const fieldUser = { roles: ['user', 'field_worker'], accessType: 'APP_MANEJO' };
    assert.throws(() => resolveUserFarmAccess(fieldUser, []), /sem fazenda válida/);
    assert.throws(
        () => resolveUserFarmAccess(fieldUser, [{ farmId: 'farm-1' }, { farmId: 'farm-2' }]),
        /sem fazenda válida/,
    );
    assert.deepEqual(
        resolveUserFarmAccess(fieldUser, [{ farmId: 'farm-1', isDefault: true }]).restrictToFarmIds,
        ['farm-1'],
    );
});

test('aliases antigos também respeitam o plano e perfil', () => {
    assert.deepEqual(access('GRATIS', 'ADMIN', ['Rebanho Genética']), []);
    assert.deepEqual(access('EIXO_DECISAO', 'MEMBER', ['DRE']), []);
});


test('SUPER_ADMIN recebe todos os módulos mesmo sem permissões e com vínculo MEMBER', () => {
    const context = { planCode: 'GRATIS', membershipRole: 'MEMBER' };
    const user = { roles: ['SUPER_ADMIN'], modules: [], accessType: 'WEB' };
    const modules = buildAllowedModulesFromPlan([], [], user.roles, 'WEB', context);
    for (const module of ['Financeiro', 'Eixo Genetics', 'Reprodução', 'Gestão Comercial', 'Plantel P.O.', 'Estoque e Equipamentos', 'Editar Animais', 'Ver Atividades de Todos']) {
        assert.ok(modules.includes(module), module);
    }
    assert.deepEqual(serializeAuthUser(user, context).allowedModules, SUPER_ADMIN_ALL_MODULES);
});

 test('SUPER_ADMIN acessa EIXO Campo independentemente do plano', () => {
    assert.equal(canAccessEixoCampo({ planCode: 'GRATIS' }, ['SUPER_ADMIN']), true);
    assert.equal(canAccessEixoCampo({ planCode: 'GRATIS' }, ['user']), false);
});
