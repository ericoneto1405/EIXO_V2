import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SUPPORT_KNOWLEDGE_VERSION,
    SUPPORT_EVALUATION_CASES,
    SUPPORT_MODULE_CATALOG,
    SUPPORT_KNOWLEDGE_QUALITY,
    SUPPORT_SAFETY_EVALUATION_CASES,
    SUPPORT_TONE_RULES,
    SUPPORT_TOPICS,
    buildSupportKnowledgeText,
    classifySupportSafety,
    findUnsupportedSupportLinks,
    selectSupportTopics,
} from './supportKnowledge.js';

test('seleciona o tópico de pesagens com link correto', () => {
    const [topic] = selectSupportTopics('Como registrar uma pesagem do meu animal?');
    assert.equal(topic.id, 'pesagens');
    assert.equal(topic.href, 'eixo:view:Rebanho%20Comercial?tab=weighings');
});

test('gera contexto com versão rastreável', () => {
    const context = buildSupportKnowledgeText('Quero importar uma planilha');
    assert.match(context, new RegExp(SUPPORT_KNOWLEDGE_VERSION.replaceAll('.', '\\.')));
    assert.match(context, /animais-importacao/);
});

test('todos os tópicos têm campos obrigatórios e identificadores únicos', () => {
    const ids = new Set();
    for (const topic of SUPPORT_TOPICS) {
        assert.ok(topic.id);
        assert.ok(topic.title);
        assert.ok(topic.href);
        assert.ok(topic.keywords.length > 0);
        assert.ok(topic.guidance.length > 0);
        assert.ok(topic.intent);
        assert.ok(topic.requiredModules.length > 0);
        assert.ok(topic.prerequisites.length > 0);
        assert.deepEqual(topic.acceptedLinks, [topic.href]);
        assert.ok(topic.forbiddenElements.length > 0);
        assert.equal(ids.has(topic.id), false);
        ids.add(topic.id);
    }
});

test('recusa link que não pertence ao catálogo', () => {
    assert.deepEqual(findUnsupportedSupportLinks('Abra [site](https://example.com).'), ['https://example.com']);
    assert.deepEqual(findUnsupportedSupportLinks('Abra [Financeiro](eixo:view:Financeiro).'), []);
});

test('avalia pelo menos 100 perguntas de referência sem perder o tópico esperado', () => {
    assert.ok(SUPPORT_EVALUATION_CASES.length >= 100);
    for (const evaluationCase of SUPPORT_EVALUATION_CASES) {
        const [topic] = selectSupportTopics(evaluationCase.question, 1);
        assert.equal(topic?.id, evaluationCase.expectedTopicId, evaluationCase.id);
        assert.equal(topic?.href, evaluationCase.expectedHref, evaluationCase.id);
        assert.ok(evaluationCase.intent);
        assert.ok(evaluationCase.requiredElements.length > 0);
        assert.ok(evaluationCase.forbiddenElements.length > 0);
        assert.deepEqual(evaluationCase.acceptedLinks, [evaluationCase.expectedHref]);
    }
});

test('reconhece pedidos sensíveis, entre clientes e casos que exigem equipe', () => {
    for (const evaluationCase of SUPPORT_SAFETY_EVALUATION_CASES) {
        const decision = classifySupportSafety(evaluationCase.question);
        assert.equal(decision?.policy, evaluationCase.expectedPolicy, evaluationCase.id);
        assert.ok(['refuse', 'escalate'].includes(decision?.action));
    }
    assert.equal(classifySupportSafety('Como trocar minha senha?'), null);
});

test('mantém regras de atendimento cordial e seguro no contexto', () => {
    const context = buildSupportKnowledgeText('Como cadastrar uma fazenda?');
    assert.ok(SUPPORT_TONE_RULES.length >= 4);
    assert.match(context, /cordial, solícito, positivo e direto/);
    assert.match(context, /Nunca solicite senha/);
});

test('todo módulo comercial possui tópico de suporte com o mesmo destino', () => {
    for (const module of SUPPORT_MODULE_CATALOG) {
        assert.ok(SUPPORT_TOPICS.some((topic) => topic.href === module.href || topic.href.startsWith(`${module.href}?`)), module.name);
    }
});

test('publica os indicadores da avaliação automática', () => {
    assert.ok(SUPPORT_KNOWLEDGE_QUALITY.evaluationCases >= 100);
    assert.equal(SUPPORT_KNOWLEDGE_QUALITY.evaluationAccuracy, 100);
    assert.equal(SUPPORT_KNOWLEDGE_QUALITY.linkValidityRate, 100);
});
