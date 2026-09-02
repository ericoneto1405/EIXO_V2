import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSupportMetrics } from './supportMetrics.js';

test('calcula automação, fallback e feedback por conversa', () => {
    const metrics = calculateSupportMetrics([
        { entityId: 'c1', action: 'chat_message_user' },
        { entityId: 'c1', action: 'chat_message_ai', requestMeta: {} },
        { entityId: 'c1', action: 'chat_feedback_resolved' },
        { entityId: 'c1', action: 'chat_satisfaction_rated', requestMeta: { rating: 5 } },
        { entityId: 'c2', action: 'chat_message_user' },
        { entityId: 'c2', action: 'chat_message_user' },
        { entityId: 'c2', action: 'chat_message_ai', requestMeta: { fallbackReason: 'low_confidence' } },
        { entityId: 'c2', action: 'chat_human_requested' },
        { entityId: 'c2', action: 'chat_message_admin' },
        { entityId: 'c2', action: 'chat_feedback_unresolved' },
    ]);

    assert.equal(metrics.totalConversations, 2);
    assert.equal(metrics.humanRate, 50);
    assert.equal(metrics.automationRate, 50);
    assert.equal(metrics.fallbackRate, 50);
    assert.equal(metrics.feedbackResolutionRate, 50);
    assert.equal(metrics.repeatRate, 50);
    assert.equal(metrics.satisfactionAverage, 5);
    assert.equal(metrics.targetReached, false);
});

test('considera apenas a avaliação mais recente e não mostra 100% sem amostra', () => {
    const emptyMetrics = calculateSupportMetrics([]);
    assert.equal(emptyMetrics.automationRate, 0);

    const metrics = calculateSupportMetrics([
        { entityId: 'c1', action: 'chat_message_user' },
        { entityId: 'c1', action: 'chat_feedback_unresolved' },
        { entityId: 'c1', action: 'chat_feedback_resolved' },
    ]);
    assert.equal(metrics.resolvedFeedback, 1);
    assert.equal(metrics.unresolvedFeedback, 0);
    assert.equal(metrics.feedbackResolutionRate, 100);
});

test('mede dúvidas sem cobertura e exige amostra de satisfação para a meta', () => {
    const logs = [];
    for (let index = 0; index < 500; index += 1) {
        const entityId = `c${index}`;
        logs.push({ entityId, action: 'chat_message_user' });
        logs.push({ entityId, action: 'chat_message_ai', requestMeta: index === 0 ? { responseType: 'clarification' } : {} });
        if (index < 100) logs.push({ entityId, action: 'chat_satisfaction_rated', requestMeta: { rating: 5 } });
    }
    const metrics = calculateSupportMetrics(logs);
    assert.equal(metrics.uncoveredConversations, 1);
    assert.equal(metrics.uncoveredRate, 0.2);
    assert.equal(metrics.satisfactionSampleReached, true);
    assert.equal(metrics.targetReached, true);
});

test('separa incidentes e indisponibilidade da meta sem esconder o volume bruto', () => {
    const metrics = calculateSupportMetrics([
        { entityId: 'normal', action: 'chat_message_user' },
        { entityId: 'normal', action: 'chat_message_ai', requestMeta: {} },
        { entityId: 'incident', action: 'chat_message_user' },
        { entityId: 'incident', action: 'chat_message_ai', requestMeta: { escalationReason: 'escalate_security' } },
        { entityId: 'incident', action: 'chat_human_requested' },
    ]);
    assert.equal(metrics.rawTotalConversations, 2);
    assert.equal(metrics.rawHumanRate, 50);
    assert.equal(metrics.excludedConversations, 1);
    assert.equal(metrics.totalConversations, 1);
    assert.equal(metrics.humanRate, 0);
});

test('separa conversas do modo de comparação da meta oficial', () => {
    const metrics = calculateSupportMetrics([
        { entityId: 'shadow', action: 'chat_message_user' },
        { entityId: 'shadow', action: 'chat_shadow_answer', requestMeta: { escalationReason: 'rollout_shadow' } },
        { entityId: 'shadow', action: 'chat_human_requested' },
    ]);
    assert.equal(metrics.rawTotalConversations, 1);
    assert.equal(metrics.rawHumanRate, 100);
    assert.equal(metrics.excludedConversations, 1);
    assert.equal(metrics.totalConversations, 0);
});
