export const SUPPORT_METRIC_ACTIONS = {
    USER: 'chat_message_user',
    AI: 'chat_message_ai',
    ADMIN: 'chat_message_admin',
    REQUEST: 'chat_human_requested',
    FEEDBACK_RESOLVED: 'chat_feedback_resolved',
    FEEDBACK_UNRESOLVED: 'chat_feedback_unresolved',
    SATISFACTION: 'chat_satisfaction_rated',
    SHADOW: 'chat_shadow_answer',
};

const toPercentage = (value, total) => total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;
const EXCLUDED_ESCALATION_REASONS = new Set([
    'escalate_security',
    'escalate_billing',
    'escalate_privacy',
    'ai_unavailable',
    'rollout_shadow',
    'rollout_pilot_control',
]);

export const calculateSupportMetrics = (logs, {
    targetHumanRate = 1,
    evaluationAccuracy = 100,
    linkValidityRate = 100,
} = {}) => {
    const conversations = new Map();

    for (const log of Array.isArray(logs) ? logs : []) {
        const conversationId = String(log?.entityId || '').trim();
        if (!conversationId) continue;
        if (!conversations.has(conversationId)) {
            conversations.set(conversationId, {
                hasUserMessage: false,
                hasHumanRequest: false,
                hasHumanReply: false,
                hasFallback: false,
                resolvedFeedback: false,
                unresolvedFeedback: false,
                userMessageCount: 0,
                satisfactionRating: null,
                uncovered: false,
                excludedReason: null,
            });
        }
        const item = conversations.get(conversationId);
        if (log.action === SUPPORT_METRIC_ACTIONS.USER) {
            item.hasUserMessage = true;
            item.userMessageCount += 1;
        }
        if (log.action === SUPPORT_METRIC_ACTIONS.REQUEST) item.hasHumanRequest = true;
        if (log.action === SUPPORT_METRIC_ACTIONS.ADMIN) item.hasHumanReply = true;
        if (log.action === SUPPORT_METRIC_ACTIONS.FEEDBACK_RESOLVED) {
            item.resolvedFeedback = true;
            item.unresolvedFeedback = false;
        }
        if (log.action === SUPPORT_METRIC_ACTIONS.FEEDBACK_UNRESOLVED) {
            item.resolvedFeedback = false;
            item.unresolvedFeedback = true;
        }
        if (log.action === SUPPORT_METRIC_ACTIONS.SATISFACTION) {
            const rating = Number(log.requestMeta?.rating);
            if (Number.isInteger(rating) && rating >= 1 && rating <= 5) item.satisfactionRating = rating;
        }
        if ([SUPPORT_METRIC_ACTIONS.AI, SUPPORT_METRIC_ACTIONS.SHADOW].includes(log.action)) {
            if (log.requestMeta?.fallbackReason) item.hasFallback = true;
            if (log.requestMeta?.responseType === 'clarification') item.uncovered = true;
            if (EXCLUDED_ESCALATION_REASONS.has(log.requestMeta?.escalationReason)) {
                item.excludedReason = log.requestMeta.escalationReason;
            }
        }
    }

    const rawConversations = Array.from(conversations.values()).filter((item) => item.hasUserMessage);
    const eligible = rawConversations.filter((item) => !item.excludedReason);
    const rawHuman = rawConversations.filter((item) => item.hasHumanRequest || item.hasHumanReply).length;
    const human = eligible.filter((item) => item.hasHumanRequest || item.hasHumanReply).length;
    const fallback = eligible.filter((item) => item.hasFallback).length;
    const resolved = eligible.filter((item) => item.resolvedFeedback).length;
    const unresolved = eligible.filter((item) => item.unresolvedFeedback).length;
    const repeated = eligible.filter((item) => item.userMessageCount > 1).length;
    const uncovered = eligible.filter((item) => item.uncovered).length;
    const satisfactionRatings = eligible
        .map((item) => item.satisfactionRating)
        .filter((rating) => Number.isInteger(rating));
    const satisfactionAverage = satisfactionRatings.length
        ? Number((satisfactionRatings.reduce((total, rating) => total + rating, 0) / satisfactionRatings.length).toFixed(2))
        : 0;
    const humanRate = toPercentage(human, eligible.length);
    const fallbackRate = toPercentage(fallback, eligible.length);
    const minimumSampleReached = eligible.length >= 500;
    const satisfactionSampleReached = satisfactionRatings.length >= 100;

    return {
        rawTotalConversations: rawConversations.length,
        rawHumanConversations: rawHuman,
        rawHumanRate: toPercentage(rawHuman, rawConversations.length),
        excludedConversations: rawConversations.length - eligible.length,
        totalConversations: eligible.length,
        humanConversations: human,
        humanRate,
        automationRate: eligible.length > 0 ? Number((100 - humanRate).toFixed(2)) : 0,
        fallbackConversations: fallback,
        fallbackRate,
        resolvedFeedback: resolved,
        unresolvedFeedback: unresolved,
        feedbackResolutionRate: toPercentage(resolved, resolved + unresolved),
        repeatedConversations: repeated,
        repeatRate: toPercentage(repeated, eligible.length),
        uncoveredConversations: uncovered,
        uncoveredRate: toPercentage(uncovered, eligible.length),
        satisfactionResponses: satisfactionRatings.length,
        satisfactionAverage,
        satisfactionSampleReached,
        evaluationAccuracy,
        linkValidityRate,
        targetHumanRate,
        targetReached: minimumSampleReached
            && satisfactionSampleReached
            && humanRate <= targetHumanRate
            && fallbackRate <= 1
            && evaluationAccuracy >= 98
            && linkValidityRate >= 99
            && satisfactionAverage >= 4.5,
        minimumSampleReached,
    };
};
