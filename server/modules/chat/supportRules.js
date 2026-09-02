export const MAX_SUPPORT_MESSAGE_CHARS = 1000;
export const MAX_SUPPORT_PATH_CHARS = 160;

const SAFE_CONVERSATION_ID = /^[A-Za-z0-9_-]{8,128}$/;

export const normalizeSupportConversationId = (value) => {
    const normalized = String(value || '').trim();
    return SAFE_CONVERSATION_ID.test(normalized) ? normalized : null;
};
export const normalizeSupportMessage = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length > MAX_SUPPORT_MESSAGE_CHARS) return null;
    return normalized;
};

export const normalizeSupportPath = (value) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || !normalized.startsWith('/')) return null;
    return normalized.slice(0, MAX_SUPPORT_PATH_CHARS);
};

export const supportOwnerMatches = (owner, { userId, organizationId }) => {
    if (!owner) return true;
    if (owner.userId !== userId) return false;
    return (owner.organizationId || null) === (organizationId || null);
};
