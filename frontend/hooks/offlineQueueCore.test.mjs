import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildOfflineQueueStorageKey,
    createSingleFlight,
    getOfflineRejection,
    readOfflineQueue,
    removeOfflineQueueItem,
    runWithOfflineQueueLock,
    writeOfflineQueue,
} from './offlineQueueCore.mjs';

const item = (tempId) => ({
    tempId,
    queuedAt: '2026-09-21T00:00:00.000Z',
    value: tempId,
});

test('remove somente o item confirmado e preserva inclusões mais recentes', () => {
    const current = [item('enviando'), item('incluido-durante-sync')];
    assert.deepEqual(
        removeOfflineQueueItem(current, 'enviando').map((entry) => entry.tempId),
        ['incluido-durante-sync'],
    );
});

test('serializa duas sincronizações concorrentes', async () => {
    const singleFlight = createSingleFlight();
    let executions = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const run = async () => {
        executions += 1;
        await gate;
        return executions;
    };

    const first = singleFlight(run);
    const second = singleFlight(run);
    assert.equal(first, second);
    release();
    assert.equal(await first, 1);
    assert.equal(executions, 1);
});

test('informa falha quando o armazenamento local recusa a gravação', () => {
    const storage = { setItem: () => { throw new Error('quota'); } };
    assert.equal(writeOfflineQueue(storage, 'queue', [item('a')]), false);
});

test('separa a fila por usuário e fazenda', () => {
    const firstUser = buildOfflineQueueStorageKey('eixo:fila:', 'usuario-a', 'fazenda-1');
    const secondUser = buildOfflineQueueStorageKey('eixo:fila:', 'usuario-b', 'fazenda-1');
    assert.notEqual(firstUser, secondUser);
    assert.equal(firstUser, 'eixo:fila:usuario-a:fazenda-1');
});

test('lê sempre a versão mais recente da fila compartilhada', () => {
    let stored = JSON.stringify([item('primeiro')]);
    const storage = { getItem: () => stored };
    assert.deepEqual(readOfflineQueue(storage, 'queue').map((entry) => entry.tempId), ['primeiro']);
    stored = JSON.stringify([item('primeiro'), item('outra-aba')]);
    assert.deepEqual(readOfflineQueue(storage, 'queue').map((entry) => entry.tempId), ['primeiro', 'outra-aba']);
});

test('usa o bloqueio do navegador durante a sincronização', async () => {
    const calls = [];
    const lockManager = {
        request: async (name, run) => {
            calls.push(name);
            return run();
        },
    };
    const result = await runWithOfflineQueueLock(lockManager, 'fila-1', async () => 'ok');
    assert.equal(result, 'ok');
    assert.deepEqual(calls, ['fila-1']);
});

test('separa recusa definitiva de falha temporária', () => {
    assert.deepEqual(getOfflineRejection({ status: 400, message: 'Peso inválido.' }), {
        status: 400,
        message: 'Peso inválido.',
    });
    assert.equal(getOfflineRejection({ status: 401, message: 'Sessão expirada.' }), null);
    assert.equal(getOfflineRejection(new TypeError('sem internet')), null);
});
