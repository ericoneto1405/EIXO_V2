import test from 'node:test';
import assert from 'node:assert/strict';
import { registerReproWorkflowRoutes } from './reproWorkflowRoutes.js';
const clone = (value) => structuredClone(value);
const matches = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => {
        if (k === 'OR') return v.some((x) => matches(row, x));
        if (k === 'farmId_clientId') return matches(row, v);
        if (v && typeof v === 'object' && !(v instanceof Date))
            return Object.entries(v).every(([op, x]) =>
                op === 'in'
                    ? x.includes(row[k])
                    : op === 'gt'
                      ? row[k] > x
                      : op === 'gte'
                        ? row[k] >= x
                        : op === 'lt'
                          ? row[k] < x
                          : op === 'not'
                            ? row[k] !== x
                            : false,
            );
        return row[k] === v;
    });
function fixture(overrides = {}) {
    const steps = [
        {
            id: 'd0',
            dia: 0,
            titulo: 'D0',
            procedimentos: [
                {
                    id: 'proc-0',
                    titulo: 'Produto',
                    produtoId: 'p1',
                    dose: 2,
                    unidade: 'mL',
                },
                { id: 'proc-1', titulo: 'Dispositivo', produtoId: null },
            ],
        },
    ];
    let state = {
        animal: ['a1', 'a2'].map((id) => ({
            id,
            farmId: 'f1',
            brinco: id,
            status: 'VIVO',
            sexo: 'FEMEA',
            lotId: 'old-lot',
            reproEvents: [{ type: 'LIBERACAO', date: new Date('2020-01-01') }],
        })),
        iatfSession: [
            {
                id: 'r1',
                farmId: 'f1',
                dia0: new Date('2025-01-01'),
                status: 'ABERTO',
                seasonId: null,
                vacas: ['a1', 'a2'].map((animalId) => ({
                    animalId,
                    brinco: animalId,
                })),
                resumo: {
                    workflowVersion: 1,
                    protocolSnapshot: { nome: 'Teste', passos: steps },
                },
            },
        ],
        pharmacyProduct: [
            {
                id: 'p1',
                farmId: 'f1',
                active: true,
                name: 'Produto',
                unit: 'mL',
                applicationUnit: 'mL',
            },
        ],
        pharmacyBatch: [
            {
                id: 'b1',
                farmId: 'f1',
                productId: 'p1',
                quantity: 20,
                expiresAt: null,
                unitCost: 1,
            },
        ],
        semenBatch: ['t1', 't2'].map((id) => ({
            id,
            farmId: 'f1',
            dosesDisponiveis: 10,
            bullName: id,
        })),
        reproProtocol: [],
        reproWorkflowRecord: [],
        reproEvent: [],
        herdEvent: [],
        weighing: [],
        pharmacyMovement: [],
        semenMove: [],
        breedingSeason: [],
        reproSettings: [],
        ...clone(overrides),
    };
    const models = (db) =>
        Object.fromEntries(
            Object.keys(db).map((name) => [
                name,
                {
                    findMany: async ({ where } = {}) => db[name].filter((r) => matches(r, where)),
                    findFirst: async ({ where } = {}) => db[name].find((r) => matches(r, where)) || null,
                    findUnique: async ({ where } = {}) => db[name].find((r) => matches(r, where)) || null,
                    create: async ({ data }) => {
                        const r = {
                            id: `${name}-${db[name].length}`,
                            createdAt: new Date(),
                            ...clone(data),
                        };
                        if (name === 'breedingSeason' && r.exposures?.create) r.exposures = r.exposures.create;
                        db[name].push(r);
                        return r;
                    },
                    update: async ({ where, data }) => {
                        const r = db[name].find((r) => matches(r, where));
                        assert.ok(r);
                        for (const [key, val] of Object.entries(data))
                            r[key] =
                                val && typeof val === 'object' && ('increment' in val || 'decrement' in val)
                                    ? r[key] + (val.increment || -val.decrement)
                                    : clone(val);
                        return r;
                    },
                    updateMany: async ({ where, data }) => {
                        const rows = db[name].filter((r) => matches(r, where));
                        for (const r of rows)
                            for (const [key, val] of Object.entries(data))
                                r[key] = typeof val === 'object' ? r[key] + (val.increment || -val.decrement) : val;
                        return { count: rows.length };
                    },
                },
            ]),
        );
    const prisma = {
        ...models(state),
        $transaction: async (fn, options) => {
            assert.equal(options.isolationLevel, 'Serializable');
            const transaction = clone(state);
            const result = await fn({
                ...models(transaction),
                $queryRaw: async () => [],
            });
            state = transaction;
            return result;
        },
    };
    let handler;
    registerReproWorkflowRoutes(
        {
            get() {},
            post(path, fn) {
                handler = fn;
            },
        },
        { prisma, temPerformance: () => false, recalcularVaca: async () => {} },
    );
    return {
        state: () => state,
        post: async (action, body, farmId = 'f1') => {
            let status = 200,
                output;
            await handler(
                {
                    reproFarm: { id: farmId },
                    params: { action },
                    user: { id: 'user' },
                    body,
                },
                {
                    status(code) {
                        status = code;
                        return this;
                    },
                    json(value) {
                        output = value;
                    },
                },
            );
            return { status, output };
        },
    };
}
const step = {
    clientId: 'one',
    sessionId: 'r1',
    stepId: 'd0',
    animalIds: ['a1'],
    date: '2025-01-02T12:00:00Z',
    responsavel: 'Veterinário',
};
test('aplicação individual baixa somente participantes confirmadas e registra procedimentos', async () => {
    const f = fixture();
    const r = await f.post('ETAPA', step);
    assert.equal(r.status, 200);
    assert.equal(f.state().pharmacyBatch[0].quantity, 18);
    assert.equal(f.state().pharmacyMovement.length, 1);
    assert.equal(r.output.procedimentos.length, 2);
    assert.deepEqual(f.state().reproWorkflowRecord[0].data.body.animalIds, ['a1']);
});
test('reenvio idempotente inclusive com ordem de propriedades JSONB diferente', async () => {
    const f = fixture();
    await f.post('ETAPA', step);
    const r = await f.post('ETAPA', Object.fromEntries(Object.entries(step).reverse()));
    assert.equal(r.status, 200);
    assert.equal(r.output.repetido, true);
    assert.equal(f.state().pharmacyBatch[0].quantity, 18);
    const conflict = await f.post('ETAPA', { ...step, animalIds: ['a2'] });
    assert.equal(conflict.status, 409);
});
test('falta de estoque não confirma execução nem consome parcialmente', async () => {
    const f = fixture({
        pharmacyBatch: [
            {
                id: 'b1',
                farmId: 'f1',
                productId: 'p1',
                quantity: 1,
                expiresAt: null,
            },
        ],
    });
    const r = await f.post('ETAPA', step);
    assert.equal(r.status, 400);
    assert.equal(f.state().pharmacyBatch[0].quantity, 1);
    assert.equal(f.state().reproWorkflowRecord.length, 0);
});
test('animal e sessão de outra fazenda são recusados', async () => {
    const f = fixture();
    assert.equal((await f.post('ETAPA', { ...step, animalIds: ['foreign'] })).status, 400);
    assert.equal((await f.post('ETAPA', step, 'f2')).status, 400);
    assert.equal(f.state().pharmacyMovement.length, 0);
});
test('etapa já executada não baixa estoque com outra chave', async () => {
    const f = fixture();
    await f.post('ETAPA', step);
    const r = await f.post('ETAPA', { ...step, clientId: 'two' });
    assert.equal(r.status, 400);
    assert.equal(f.state().pharmacyBatch[0].quantity, 18);
});
test('inseminação exige etapas e aceita touro diferente por fêmea', async () => {
    const f = fixture();
    const b = {
        clientId: 'insemination',
        sessionId: 'r1',
        animalIds: ['a1', 'a2'],
        date: '2025-01-03T12:00:00Z',
        responsavel: 'Inseminador',
        semen: [
            { animalId: 'a1', batchId: 't1' },
            { animalId: 'a2', batchId: 't2' },
        ],
    };
    assert.equal((await f.post('INSEMINAR', b)).status, 400);
    await f.post('ETAPA', { ...step, animalIds: ['a1', 'a2'] });
    const r = await f.post('INSEMINAR', b);
    assert.equal(r.status, 200);
    assert.deepEqual(
        f.state().semenBatch.map((s) => s.dosesDisponiveis),
        [9, 9],
    );
    assert.equal(f.state().reproEvent[0].payload.touro, 't1');
    assert.equal(f.state().reproEvent[1].payload.touro, 't2');
    assert.equal(f.state().iatfSession[0].status, 'INSEMINADO');
});
test('falta de sêmen de uma fêmea reverte tudo', async () => {
    const f = fixture({
        semenBatch: [
            {
                id: 't1',
                farmId: 'f1',
                dosesDisponiveis: 1,
                bullName: 'Touro 1',
            },
        ],
    });
    await f.post('ETAPA', { ...step, animalIds: ['a1', 'a2'] });
    const r = await f.post('INSEMINAR', {
        clientId: 'i',
        sessionId: 'r1',
        animalIds: ['a1', 'a2'],
        date: '2025-01-03T12:00:00Z',
        responsavel: 'I',
        semen: [
            { animalId: 'a1', batchId: 't1' },
            { animalId: 'a2', batchId: 't1' },
        ],
    });
    assert.equal(r.status, 400);
    assert.equal(f.state().semenBatch[0].dosesDisponiveis, 1);
    assert.equal(f.state().reproEvent.length, 0);
});
test('retirada não registra descarte e preserva participantes históricos', async () => {
    const f = fixture();
    const r = await f.post('RETIRAR', {
        clientId: 'retirar',
        sessionId: 'r1',
        animalIds: ['a1'],
        motivo: 'Não compareceu',
    });
    assert.equal(r.status, 200);
    assert.equal(f.state().iatfSession[0].vacas.length, 2);
    assert.equal(f.state().reproEvent.length, 0);
    assert.equal((await f.post('ETAPA', step)).status, 400);
});
test('reversão devolve estoque e mantém o original na auditoria', async () => {
    const f = fixture();
    const original = await f.post('ETAPA', step);
    const r = await f.post('REVERTER', {
        clientId: 'reverse',
        recordId: original.output.recordId,
        motivo: 'Lançamento incorreto',
    });
    assert.equal(r.status, 200);
    assert.equal(f.state().pharmacyBatch[0].quantity, 20);
    assert.equal(f.state().pharmacyMovement.length, 2);
    assert.equal(f.state().reproWorkflowRecord.length, 2);
    assert.equal(
        (
            await f.post('REVERTER', {
                clientId: 'reverse2',
                recordId: original.output.recordId,
                motivo: 'Repetição',
            })
        ).status,
        400,
    );
});
test('regras e avaliações exigem Performance no servidor', async () => {
    const f = fixture();
    assert.equal((await f.post('REGRAS', { clientId: 'rules' })).status, 403);
    assert.equal(f.state().reproWorkflowRecord.length, 0);
});
test('parto vincula cria existente e nunca cria novo animal', async () => {
    const mother = {
        id: 'mother',
        farmId: 'f1',
        brinco: 'Mãe',
        status: 'VIVO',
        sexo: 'FEMEA',
        reproEvents: [{ type: 'LIBERACAO', date: new Date('2020-01-01') }],
    };
    const calf = {
        id: 'calf',
        farmId: 'f1',
        brinco: 'Cria',
        status: 'VIVO',
        sexo: 'MACHO',
        dataNascimento: new Date('2025-01-03T12:00:00Z'),
        maeId: null,
        reproEvents: [],
    };
    const f = fixture({ animal: [mother, calf] });
    const b = {
        clientId: 'birth',
        animalId: 'mother',
        date: '2025-01-03',
        tipoParto: 'NORMAL',
        crias: [{ animalId: 'calf', vivo: true, sexo: 'MACHO', peso: 30 }],
    };
    assert.equal((await f.post('PARTO', b)).status, 200);
    assert.equal(f.state().animal.length, 2);
    assert.equal(f.state().animal[1].maeId, 'mother');
    assert.equal(f.state().reproEvent[0].payload.crias[0].calfAnimalId, 'calf');
    assert.equal((await f.post('PARTO', { ...b, clientId: 'birth-again' })).status, 400);
});
test('parto rejeita cria de outra fazenda e vínculo materno incompatível', async () => {
    const mother = {
        id: 'mother',
        farmId: 'f1',
        brinco: 'Mãe',
        status: 'VIVO',
        sexo: 'FEMEA',
        reproEvents: [{ type: 'LIBERACAO', date: new Date('2020-01-01') }],
    };
    const calf = {
        id: 'calf',
        farmId: 'f2',
        brinco: 'Cria',
        status: 'VIVO',
        sexo: 'MACHO',
        dataNascimento: new Date('2025-01-03'),
        maeId: 'other',
        reproEvents: [],
    };
    const b = {
        clientId: 'birth',
        animalId: 'mother',
        date: '2025-01-03',
        tipoParto: 'NORMAL',
        crias: [{ animalId: 'calf', vivo: true, sexo: 'MACHO', peso: 30 }],
    };
    const f = fixture({ animal: [mother, calf] });
    assert.equal((await f.post('PARTO', b)).status, 400);
    assert.equal(f.state().reproEvent.length, 0);
    const f2 = fixture({
        animal: [
            mother,
            {
                ...calf,
                farmId: 'f1',
                dataNascimento: new Date('2025-01-03T12:00:00Z'),
            },
        ],
    });
    assert.equal((await f2.post('PARTO', b)).status, 400);
});
test('dose efetiva diverge do previsto sem modificar o protocolo da rodada', async () => {
    const f = fixture();
    const procedures = clone(f.state().iatfSession[0].resumo.protocolSnapshot.passos[0].procedimentos);
    procedures[0].dose = 3;
    const r = await f.post('ETAPA', { ...step, procedimentos: procedures });
    assert.equal(r.status, 200);
    assert.equal(f.state().pharmacyBatch[0].quantity, 17);
    assert.equal(f.state().iatfSession[0].resumo.protocolSnapshot.passos[0].procedimentos[0].dose, 2);
});
test('rodada mantém cópia do protocolo após edição do modelo', async () => {
    const original = {
        id: 'p',
        farmId: 'f1',
        nome: 'Original',
        ativo: true,
        passos: [
            {
                id: 'd0',
                dia: 0,
                titulo: 'D0',
                procedimentos: [{ id: 'pr0', titulo: 'Procedimento sem produto', produtoId: null }],
            },
        ],
    };
    const f = fixture({ iatfSession: [], reproProtocol: [original] });
    const opened = await f.post('RODADA', {
        clientId: 'round',
        animalIds: ['a1'],
        protocolId: 'p',
        dia0: '2025-01-01',
        responsavel: 'Veterinário',
    });
    assert.equal(opened.status, 200);
    const edited = await f.post('PROTOCOLO', {
        clientId: 'edit-protocol',
        id: 'p',
        nome: 'Revisado',
        passos: [{ dia: 0, titulo: 'Novo D0', procedimentos: [{ titulo: 'Novo procedimento' }] }],
    });
    assert.equal(edited.status, 200);
    assert.equal(f.state().reproProtocol[0].nome, 'Revisado');
    assert.equal(f.state().iatfSession[0].resumo.protocolSnapshot.nome, 'Original');
    assert.equal(f.state().iatfSession[0].resumo.protocolSnapshot.passos[0].titulo, 'D0');
});
test('participante da estação permanece após mudar de lote; não participante é recusada', async () => {
    const f = fixture({
        iatfSession: [],
        reproProtocol: [
            {
                id: 'p',
                farmId: 'f1',
                nome: 'Protocolo',
                ativo: true,
                passos: [{ id: 'd0', dia: 0, procedimentos: [{ id: 'pr0', titulo: 'Procedimento' }] }],
            },
        ],
    });
    const created = await f.post('ESTACAO', {
        clientId: 'season',
        nome: 'Estação',
        inicio: '2025-01-01',
        fim: '2025-03-31',
        tipo: 'MISTA',
        animalIds: ['a1'],
    });
    assert.equal(created.status, 200);
    const seasonId = f.state().breedingSeason[0].id;
    f.state().animal[0].lotId = 'new-lot';
    const body = {
        clientId: 'round',
        protocolId: 'p',
        dia0: '2025-01-02',
        responsavel: 'Veterinário',
        seasonId,
        animalIds: ['a2'],
    };
    assert.equal((await f.post('RODADA', body)).status, 400);
    assert.equal((await f.post('RODADA', { ...body, animalIds: ['a1'] })).status, 200);
    assert.equal(f.state().breedingSeason[0].exposures[0].animalId, 'a1');
});
test('desmama reutiliza pesagem compatível e registra desempenho na mãe', async () => {
    const mother = { id: 'mother', farmId: 'f1', brinco: 'Mãe', status: 'VIVO', sexo: 'FEMEA', reproEvents: [] };
    const calf = {
        id: 'calf',
        farmId: 'f1',
        brinco: 'Cria',
        status: 'VIVO',
        sexo: 'MACHO',
        dataNascimento: new Date('2025-01-01T12:00:00Z'),
        maeId: 'mother',
        desmamadoEm: null,
        reproEvents: [],
    };
    const f = fixture({
        animal: [mother, calf],
        weighing: [{ id: 'weight', animalId: 'calf', data: new Date('2025-08-01T12:00:00Z'), peso: 200, gmd: 0 }],
        herdEvent: [
            {
                id: 'birth',
                farmId: 'f1',
                animalId: 'calf',
                type: 'NASCIMENTO',
                date: new Date('2025-01-01T12:00:00Z'),
                peso: 30,
            },
        ],
    });
    const r = await f.post('DESMAMA', {
        clientId: 'wean',
        animalId: 'calf',
        date: '2025-08-01',
        peso: 200,
        grupoComparacao: 'Safra 2025, machos Nelore a pasto',
    });
    assert.equal(r.status, 200);
    assert.equal(f.state().weighing.length, 1);
    assert.equal(f.state().reproEvent[0].animalId, 'mother');
    assert.ok(f.state().reproEvent[0].payload.pesoAjustado205 > 0);
    assert.equal(f.state().animal[1].pesoDesmamaKg, 200);
});
