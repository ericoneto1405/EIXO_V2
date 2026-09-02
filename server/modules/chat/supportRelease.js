export const validateSupportReleaseStatus = (status, {
    expectedKnowledgeVersion,
    expectedReleaseSha,
} = {}) => {
    if (!status || status.ok !== true) {
        return { valid: false, reason: 'status_invalid' };
    }
    if (!expectedKnowledgeVersion || status.knowledgeVersion !== expectedKnowledgeVersion) {
        return { valid: false, reason: 'knowledge_version_mismatch' };
    }
    if (!expectedReleaseSha || status.releaseSha !== expectedReleaseSha) {
        return { valid: false, reason: 'release_sha_mismatch' };
    }
    return { valid: true, reason: null };
};
