import test from 'node:test';
import assert from 'node:assert/strict';
import { canUpgradePlan, getPlanLimits, normalizePlanCode } from './saasContext.js';

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
        label: 'plano gratuito',
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
