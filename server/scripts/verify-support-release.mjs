import { SUPPORT_KNOWLEDGE_VERSION } from '../modules/chat/supportKnowledge.js';
import { validateSupportReleaseStatus } from '../modules/chat/supportRelease.js';

const statusUrl = String(process.env.SUPPORT_STATUS_URL || '').trim();
const expectedReleaseSha = String(process.env.APP_RELEASE_SHA || '').trim();

if (!statusUrl || !expectedReleaseSha) {
    console.error('SUPPORT_STATUS_URL e APP_RELEASE_SHA são obrigatórios.');
    process.exit(1);
}

try {
    const response = await fetch(statusUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
        throw new Error(`status HTTP ${response.status}`);
    }
    const status = await response.json();
    const result = validateSupportReleaseStatus(status, {
        expectedKnowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
        expectedReleaseSha,
    });
    if (!result.valid) {
        throw new Error(result.reason);
    }
    console.log(`EIXO Suporte OK: ${status.knowledgeVersion} em ${status.releaseSha}`);
} catch (error) {
    console.error(`ERRO: versão do EIXO Suporte não confirmada (${error.message}).`);
    process.exit(1);
}
