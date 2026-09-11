import test from 'node:test';
import assert from 'node:assert/strict';
import { requireEixoCampoPlan } from './requireEixoCampoPlan.js';

for (const planCode of ['GRATIS', 'EIXO_GESTAO', undefined]) {
    test(`bloqueia EIXO Campo para plano ${planCode}`, () => {
        let status;
        let payload;
        const res = { status(value) { status = value; return this; }, json(value) { payload = value; } };
        requireEixoCampoPlan({ saas: { planCode }, user: { roles: ['ADMIN'] } }, res, () => assert.fail('Acesso indevido'));
        assert.equal(status, 403);
        assert.equal(payload.code, 'eixo_campo_plan_required');
    });
}

for (const [planCode, roles] of [['EIXO_DECISAO', ['user']], ['GRATIS', ['SUPER_ADMIN']]]) {
    test(`permite EIXO Campo para ${planCode} e ${roles}`, () => {
        let called = false;
        requireEixoCampoPlan({ saas: { planCode }, user: { roles } }, {}, () => { called = true; });
        assert.equal(called, true);
    });
}
