import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getSupportConversationState,
    SUPPORT_ACTION_ASSUME,
    SUPPORT_ACTION_RELEASE,
    SUPPORT_ACTION_REQUEST,
    SUPPORT_ACTION_RESOLVED,
} from './chatService.js';

const databaseWithLatest = (latest) => ({
    activityLog: { findFirst: async () => latest },
});
test('representa estados automáticos, aguardando, assumido e resolvido', async () => {
    assert.deepEqual(await getSupportConversationState('c1', databaseWithLatest(null)), {
        assumed: false, requested: false, resolved: false, assumedByUserId: null,
    });
    assert.equal((await getSupportConversationState('c1', databaseWithLatest({ action: SUPPORT_ACTION_REQUEST }))).requested, true);
    assert.equal((await getSupportConversationState('c1', databaseWithLatest({ action: SUPPORT_ACTION_ASSUME, userId: 'admin-1', requestMeta: {} }))).assumed, true);
    assert.equal((await getSupportConversationState('c1', databaseWithLatest({ action: SUPPORT_ACTION_RELEASE }))).resolved, false);
    assert.equal((await getSupportConversationState('c1', databaseWithLatest({ action: SUPPORT_ACTION_RESOLVED }))).resolved, true);
});
