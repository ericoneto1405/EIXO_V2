import test from 'node:test';
import assert from 'node:assert/strict';
import { runSupportProviderChain } from './chatService.js';

test('usa o provedor seguinte quando o principal falha', async () => {
    const attempts = [];
    const result = await runSupportProviderChain(['groq', 'gemini'], async (provider) => {
        attempts.push(provider);
        if (provider === 'groq') throw new Error('indisponível');
        return { text: 'Resposta segura', provider };
    });
    assert.deepEqual(attempts, ['groq', 'gemini']);
    assert.deepEqual(result, { text: 'Resposta segura', provider: 'gemini' });
});

test('falha de modo rastreável quando todos os provedores falham', async () => {
    await assert.rejects(
        runSupportProviderChain(['groq', 'gemini'], async (provider) => {
            throw new Error(`${provider} indisponível`);
        }),
        /Todos os provedores falharam/,
    );
});
