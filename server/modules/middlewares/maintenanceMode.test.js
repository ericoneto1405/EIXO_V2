import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaintenanceModeMiddleware } from './maintenanceMode.js';

function invoke(enabled, path) {
    const result = { nextCalled: false, status: null, retryAfter: null, body: null };
    const response = {
        set(name, value) {
            if (name === 'Retry-After') result.retryAfter = value;
            return this;
        },
        status(value) { result.status = value; return this; },
        json(value) { result.body = value; return this; },
    };
    createMaintenanceModeMiddleware(enabled)(
        { path }, response, () => { result.nextCalled = true; },
    );
    return result;
}

test('sem manutenção, as rotas seguem normalmente', () => {
    assert.equal(invoke(false, '/account-closure-requests').nextCalled, true);
});

test('em manutenção, apenas saúde e conferência interna seguem disponíveis', () => {
    assert.equal(invoke(true, '/health').nextCalled, true);
    assert.equal(invoke(true, '/api/chat/knowledge-status').nextCalled, true);

    for (const path of ['/auth/login', '/account-closure-requests', '/animals', '/health/check']) {
        const result = invoke(true, path);
        assert.equal(result.nextCalled, false);
        assert.equal(result.status, 503);
        assert.equal(result.retryAfter, '300');
        assert.equal(result.body.code, 'service_maintenance');
    }
});
