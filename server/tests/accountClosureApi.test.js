import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.EIXO_CLOSURE_TEST_URL;
const ownerId = '11111111-1111-4111-8111-111111111111';
const managerId = '22222222-2222-4222-8222-222222222222';

test('pedido logado gera protocolo único por tipo e não libera exclusão real', { skip: !base }, async () => {
    assert.equal(base, 'http://127.0.0.1:3023');
    const request = async (userId, method, path, body) => {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(userId ? { 'x-user-id': userId } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, data: await response.json().catch(() => ({})) };
    };

    assert.equal((await request(null, 'GET', '/account-closure-requests')).status, 401);
    assert.equal((await request(managerId, 'POST', '/account-closure-requests', {
        type: 'ORGANIZATION', confirmationEmail: 'manager-closure@example.invalid',
    })).status, 403);
    assert.equal((await request(ownerId, 'POST', '/account-closure-requests', {
        type: 'LOGIN', confirmationEmail: 'incorreto@example.invalid',
    })).status, 400);

    const loginBody = { type: 'LOGIN', confirmationEmail: 'manager-closure@example.invalid' };
    const simultaneous = await Promise.all([
        request(managerId, 'POST', '/account-closure-requests', loginBody),
        request(managerId, 'POST', '/account-closure-requests', loginBody),
    ]);
    assert.deepEqual(simultaneous.map((item) => item.status).sort(), [200, 201]);
    assert.equal(simultaneous[0].data.request.protocol, simultaneous[1].data.request.protocol);
    assert.match(simultaneous[0].data.request.protocol, /^ENC-\d{8}-[A-F0-9]{16}$/);

    const organizationBody = { type: 'ORGANIZATION', confirmationEmail: 'owner-closure@example.invalid' };
    const organization = await request(ownerId, 'POST', '/account-closure-requests', organizationBody);
    assert.equal(organization.status, 201);
    const repeated = await request(ownerId, 'POST', '/account-closure-requests', organizationBody);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.request.protocol, organization.data.request.protocol);

    const ownerLogin = await request(ownerId, 'POST', '/account-closure-requests', {
        type: 'LOGIN', confirmationEmail: 'owner-closure@example.invalid',
    });
    assert.equal(ownerLogin.status, 201);
    assert.notEqual(ownerLogin.data.request.protocol, organization.data.request.protocol);

    const ownerList = await request(ownerId, 'GET', '/account-closure-requests');
    assert.equal(ownerList.status, 200);
    assert.deepEqual(new Set(ownerList.data.requests.map((item) => item.protocol)), new Set([
        ownerLogin.data.request.protocol, organization.data.request.protocol,
    ]));
    const managerList = await request(managerId, 'GET', '/account-closure-requests');
    assert.equal(managerList.status, 200);
    assert.deepEqual(managerList.data.requests.map((item) => item.protocol), [simultaneous[0].data.request.protocol]);

    const deletion = await request(ownerId, 'DELETE', `/users/${managerId}`);
    assert.equal(deletion.status, 503);
});
