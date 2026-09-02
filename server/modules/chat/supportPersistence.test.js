import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportLog } from './chatService.js';

const request = {
    user: { id: 'user-1' },
    saas: { organizationId: 'org-1' },
    method: 'POST',
    originalUrl: '/api/chat/send-message',
    ip: '127.0.0.1',
    get: () => 'test-agent',
};

test('persiste conversa com organização, fazenda e versão do conhecimento', async () => {
    let persisted = null;
    const db = {
        activityLog: {
            create: async (input) => {
                persisted = input.data;
                return input.data;
            },
        },
    };
    const result = await createSupportLog(request, {
        conversationId: 'conversation-1',
        action: 'chat_message_user',
        message: 'Como registrar uma pesagem?',
        farmId: 'farm-1',
        db,
    });
    assert.ok(result?.id);
    assert.equal(persisted.organizationId, 'org-1');
    assert.equal(persisted.farmId, 'farm-1');
    assert.ok(persisted.requestMeta.knowledgeVersion);
});
test('não confirma persistência quando o banco falha', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        const result = await createSupportLog(request, {
            conversationId: 'conversation-1',
            action: 'chat_message_user',
            db: { activityLog: { create: async () => { throw new Error('database unavailable'); } } },
        });
        assert.equal(result, null);
    } finally {
        console.error = originalConsoleError;
    }
});
