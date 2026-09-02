import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_SUPPORT_MESSAGE_CHARS,
    normalizeSupportConversationId,
    normalizeSupportMessage,
    normalizeSupportPath,
    supportOwnerMatches,
} from './supportRules.js';

test('valida identificador e mensagem da conversa', () => {
    assert.equal(normalizeSupportConversationId('550e8400-e29b-41d4-a716-446655440000'), '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(normalizeSupportConversationId('../invalido'), null);
    assert.equal(normalizeSupportMessage('  Preciso de ajuda  '), 'Preciso de ajuda');
    assert.equal(normalizeSupportMessage('a'.repeat(MAX_SUPPORT_MESSAGE_CHARS + 1)), null);
    assert.equal(normalizeSupportPath('https://fora.example'), null);
    assert.equal(normalizeSupportPath('/animals'), '/animals');
});
test('exige o mesmo usuário e a mesma organização', () => {
    const owner = { userId: 'user-1', organizationId: 'org-1' };
    assert.equal(supportOwnerMatches(owner, { userId: 'user-1', organizationId: 'org-1' }), true);
    assert.equal(supportOwnerMatches(owner, { userId: 'user-2', organizationId: 'org-1' }), false);
    assert.equal(supportOwnerMatches(owner, { userId: 'user-1', organizationId: 'org-2' }), false);
});
