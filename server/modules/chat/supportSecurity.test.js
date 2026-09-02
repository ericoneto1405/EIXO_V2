import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import {
    getWindowRetryAfterSeconds,
    isWindowRateLimited,
    registerWindowAttempt,
} from '../middlewares/rateLimiter.js';

test('monta escopo com organização e fazendas autorizadas', () => {
    const filter = buildFarmScopeFilter({
        user: { id: 'user-1' },
        saas: { organizationId: 'org-1' },
        access: { restrictToFarmIds: ['farm-1'] },
    }, { id: 'farm-1' });
    assert.deepEqual(filter, {
        AND: [
            { organizationId: 'org-1' },
            { id: { in: ['farm-1'] } },
            { id: 'farm-1' },
        ],
    });
});
test('limita rajadas e informa quando tentar novamente', () => {
    const store = new Map();
    registerWindowAttempt(store, 'user:user-1', 10_000);
    registerWindowAttempt(store, 'user:user-1', 10_000);
    assert.equal(isWindowRateLimited(store, 'user:user-1', 2, 10_000), true);
    assert.ok(getWindowRetryAfterSeconds(store, 'user:user-1', 10_000) >= 1);
});
