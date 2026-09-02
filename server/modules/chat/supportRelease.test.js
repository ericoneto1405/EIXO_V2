import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSupportReleaseStatus } from './supportRelease.js';

const expected = {
    expectedKnowledgeVersion: '2026-09-02.1-abc123',
    expectedReleaseSha: 'release-123',
};

test('aprova quando aplicação e conhecimento são da versão esperada', () => {
    const result = validateSupportReleaseStatus({
        ok: true,
        knowledgeVersion: expected.expectedKnowledgeVersion,
        releaseSha: expected.expectedReleaseSha,
    }, expected);
    assert.deepEqual(result, { valid: true, reason: null });
});

test('reprova versão antiga do conhecimento', () => {
    const result = validateSupportReleaseStatus({
        ok: true,
        knowledgeVersion: 'versao-antiga',
        releaseSha: expected.expectedReleaseSha,
    }, expected);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'knowledge_version_mismatch');
});

test('reprova processo que não reiniciou com a versão publicada', () => {
    const result = validateSupportReleaseStatus({
        ok: true,
        knowledgeVersion: expected.expectedKnowledgeVersion,
        releaseSha: 'release-antigo',
    }, expected);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'release_sha_mismatch');
});
