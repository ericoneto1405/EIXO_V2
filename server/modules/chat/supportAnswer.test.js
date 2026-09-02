import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupportAnswerMetadata, buildSupportAuditContext } from './chatService.js';

test('gera metadados rastreáveis para uma resposta do suporte', () => {
    const metadata = buildSupportAnswerMetadata({
        matchedTopics: [{ id: 'pesagens', href: 'eixo:view:Rebanho%20Comercial?tab=weighings' }],
        confidence: 0.91,
        provider: 'gemini',
    });
    assert.equal(metadata.intent, 'pesagens');
    assert.deepEqual(metadata.topicIds, ['pesagens']);
    assert.equal(metadata.recommendedLink, 'eixo:view:Rebanho%20Comercial?tab=weighings');
    assert.equal(metadata.confidence, 0.91);
    assert.ok(metadata.knowledgeVersion);
});

test('explica uma recusa ou escalada sem inventar tópico', () => {
    const metadata = buildSupportAnswerMetadata({
        confidence: 1,
        responseType: 'refusal',
        intentOverride: 'refuse_cross_tenant',
    });
    assert.equal(metadata.intent, 'refuse_cross_tenant');
    assert.equal(metadata.recommendedLink, null);
    assert.equal(metadata.responseType, 'refusal');
});

test('registra apenas o contexto autorizado e necessário para auditoria', () => {
    const context = buildSupportAuditContext({
        user: {
            id: 'user-1',
            name: 'Pessoa Teste',
            email: 'pessoa@example.com',
            password: 'nao-deve-aparecer',
            modules: ['HERD', 'FINANCIAL'],
            roles: ['OWNER'],
            accessType: 'FULL',
        },
        saas: {
            organizationId: 'org-1',
            planCode: 'EIXO_GESTAO',
            billingAccessState: 'ACTIVE',
            entitlements: ['CORE', 'NUTRITION'],
        },
    }, {
        farmId: 'farm-1',
        currentPath: '/animals?farmId=farm-1',
    });

    assert.deepEqual(context, {
        organizationId: 'org-1',
        farmId: 'farm-1',
        currentPath: '/animals?farmId=farm-1',
        planCode: 'EIXO_GESTAO',
        billingAccessState: 'ACTIVE',
        accessType: 'FULL',
        allowedModules: ['HERD', 'FINANCIAL'],
        entitlements: ['CORE', 'NUTRITION'],
    });
    assert.equal(JSON.stringify(context).includes('pessoa@example.com'), false);
    assert.equal(JSON.stringify(context).includes('nao-deve-aparecer'), false);
});
