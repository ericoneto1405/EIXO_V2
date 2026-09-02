import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getSupportRolloutDecision,
    parseSupportPilotOrganizationIds,
} from './supportRollout.js';
import { SUPPORT_ACTION_SHADOW, SUPPORT_CUSTOMER_VISIBLE_ACTIONS } from './chatService.js';

test('normaliza organizações do piloto sem duplicar valores', () => {
    assert.deepEqual(parseSupportPilotOrganizationIds(' org-1,org-2, org-1, '), ['org-1', 'org-2']);
});

test('mantém comparação silenciosa fora da resposta do cliente', () => {
    assert.deepEqual(getSupportRolloutDecision({ mode: 'shadow', organizationId: 'org-1' }), {
        mode: 'shadow',
        live: false,
        reason: 'rollout_shadow',
    });
    assert.equal(SUPPORT_CUSTOMER_VISIBLE_ACTIONS.includes(SUPPORT_ACTION_SHADOW), false);
});

test('libera piloto somente para organizações selecionadas', () => {
    const pilotOrganizationIds = ['org-pilot'];
    assert.equal(getSupportRolloutDecision({ mode: 'pilot', organizationId: 'org-pilot', pilotOrganizationIds }).live, true);
    assert.equal(getSupportRolloutDecision({ mode: 'pilot', organizationId: 'org-other', pilotOrganizationIds }).live, false);
});

test('libera atendimento automático para todos no modo completo', () => {
    assert.equal(getSupportRolloutDecision({ mode: 'full' }).live, true);
});
