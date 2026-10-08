import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeProtocol,
    consumption,
    initialRules,
    validateRules,
    matrixTraffic,
    ids,
    date,
} from './reproWorkflowRules.js';
const animal = { id: 'a', dataNascimento: new Date('2020-01-01') };
const event = (type, date, payload = {}, seasonId = null) => ({
    type,
    date,
    payload,
    seasonId,
    createdAt: date,
});
const seasons = [1, 2].map((i) => ({
    id: `s${i}`,
    name: `Estação ${i}`,
    endAt: `202${i}-12-31`,
    exposures: [{ animalId: 'a' }],
}));
const events = seasons.flatMap((s, i) => [
    event('COBERTURA', `202${i + 1}-10-01`, {}, s.id),
    event('DIAGNOSTICO_PRENHEZ', `202${i + 2}-01-10`, { resultado: 'VAZIA', finalEstacao: true }, s.id),
]);
const rules = { ...initialRules('COMERCIAL'), ativo: true, funcional: false };
test('protocolo aceita vários procedimentos por etapa e exige D0', () => {
    const p = normalizeProtocol({
        nome: 'Protocolo veterinário',
        passos: [
            {
                dia: 0,
                titulo: 'D0',
                procedimentos: [
                    { titulo: 'Dispositivo' },
                    {
                        titulo: 'Aplicação',
                        produtoId: 'p',
                        dose: 2,
                        unidade: 'mL',
                    },
                ],
            },
        ],
    });
    assert.equal(p.passos[0].procedimentos.length, 2);
    assert.throws(
        () =>
            normalizeProtocol({
                nome: 'X',
                passos: [
                    {
                        dia: 8,
                        titulo: 'D8',
                        procedimentos: [{ titulo: 'Retirar' }],
                    },
                ],
            }),
        /D0/,
    );
});
test('conversão usa a unidade da Farmácia e rejeita conversão ausente', () => {
    const p = {
        name: 'Produto',
        unit: 'FRASCO',
        applicationUnit: 'mL',
        applicationPerUnit: 50,
    };
    assert.equal(consumption(p, 2, 'mL', 25), 1);
    assert.equal(consumption(p, 1, 'FRASCO', 2), 2);
    assert.throws(() => consumption({ ...p, applicationPerUnit: null }, 2, 'mL', 25), /conversão/);
    assert.throws(() => consumption(p, 2, 'mg', 25), /incompatível/);
});
test('modelos são inativos e Comercial não exige racial', () => {
    assert.equal(initialRules('COMERCIAL').ativo, false);
    assert.equal(initialRules('COMERCIAL').racial, false);
    assert.equal(initialRules('PO').racial, true);
    assert.throws(() => validateRules({ ...rules, estacoesVazias: 0 }), /Limite/);
});
test('diagnósticos repetidos da mesma estação não multiplicam falhas', () => {
    const s = seasons.slice(0, 1);
    const e = [
        ...events.slice(0, 2),
        event('DIAGNOSTICO_PRENHEZ', '2022-02-01', { resultado: 'VAZIA', finalEstacao: true }, 's1'),
    ];
    const result = matrixTraffic(animal, e, s, [], rules);
    assert.equal(result.cor, 'AMARELO');
    assert.ok(!result.motivos.some((m) => m.includes('2 estações')));
});
test('duas estações finalizadas vazia exigem revisão', () => {
    assert.equal(matrixTraffic(animal, events, seasons, [], rules).cor, 'VERMELHO');
});
test('diagnóstico pendente não significa vazia nem verde', () => {
    const result = matrixTraffic(
        animal,
        events.filter((e) => e.seasonId !== 's2' || e.type === 'COBERTURA'),
        seasons,
        [],
        rules,
    );
    assert.equal(result.cor, 'CINZA');
    assert.match(result.motivos.join(), /pendente/);
});
test('participação sem cobertura não comprova exposição', () => {
    const result = matrixTraffic(
        animal,
        events.filter((e) => e.type !== 'COBERTURA'),
        seasons,
        [],
        rules,
    );
    assert.equal(result.cor, 'CINZA');
});
test('critério crítico prevalece sobre dados insuficientes', () => {
    const e = [event('PERDA', '2024-01-01'), event('PERDA', '2025-01-01')];
    const result = matrixTraffic(animal, e, [], [], {
        ...rules,
        funcional: true,
    });
    assert.equal(result.cor, 'VERMELHO');
    assert.ok(result.motivos.some((m) => m.includes('funcional')));
});
test('avaliações mostram evolução e não usam raça como nota automática', () => {
    const assessments = [
        {
            data: {
                dimensao: 'racial',
                date: '2024-01-01',
                resultado: 'REVISAR',
                motivo: 'Avaliação A',
            },
        },
        {
            data: {
                dimensao: 'racial',
                date: '2025-01-01',
                resultado: 'DENTRO',
                motivo: 'Avaliação B',
            },
        },
    ];
    const result = matrixTraffic({ ...animal, raca: null }, [], [], assessments, { ...rules, racial: true });
    assert.equal(result.dimensoes.find((d) => d.nome === 'racial').evolucao, 'Melhorou');
    assert.ok(!result.motivos.some((m) => m.includes('Avaliação A')));
});
test('baixo peso só é comparado com grupo de manejo e safra igual', () => {
    const e = ['g1', 'g2'].map((group, i) =>
        event('DESMAME', `202${i + 3}-01-01`, {
            pesoAjustado205: 150,
            grupoComparacao: group,
        }),
    );
    assert.notEqual(matrixTraffic(animal, e, [], [], { ...rules, desmamaKg: 180 }).cor, 'VERMELHO');
    e[1].payload.grupoComparacao = 'g1';
    assert.equal(matrixTraffic(animal, e, [], [], { ...rules, desmamaKg: 180 }).cor, 'VERMELHO');
});
test('descarte é decisão explícita e modelo inativo não calcula farol', () => {
    assert.equal(matrixTraffic(animal, [event('DESCARTE', '2025-01-01')], [], [], null).cor, 'DESCARTE');
    assert.equal(matrixTraffic(animal, events, seasons, [], initialRules('COMERCIAL')).cor, 'CINZA');
});
test('seleção e datas inválidas são rejeitadas', () => {
    assert.throws(() => ids(['a', 'a']), /repetidos/);
    assert.throws(() => ids([]), /Selecione/);
    assert.throws(() => date('inválida'), /data/);
    assert.throws(() => date('2099-01-01'), /futura/);
});
test('manejo contínuo avalia diagnóstico sem inventar estações', () => {
    const r = { ...rules, usarEstacoes: false };
    const e = [
        event('COBERTURA', '2025-01-01', { tentativaId: 'attempt' }),
        event('DIAGNOSTICO_PRENHEZ', '2025-03-01', {
            tentativaId: 'attempt',
            resultado: 'PRENHE',
        }),
    ];
    assert.equal(matrixTraffic(animal, e, [], [], r).cor, 'VERDE');
    e[1].payload.resultado = 'VAZIA';
    assert.equal(matrixTraffic(animal, e, [], [], r).cor, 'AMARELO');
    assert.equal(matrixTraffic(animal, e.slice(0, 1), [], [], r).cor, 'CINZA');
});
test('números existentes contam somente o último diagnóstico de cada tentativa vinculada', async () => {
    const { numerosDaVaca } = await import('./reproRules.js');
    const e = [
        event('DIAGNOSTICO_PRENHEZ', '2025-01-01', {
            tentativaId: 't1',
            resultado: 'VAZIA',
        }),
        event('DIAGNOSTICO_PRENHEZ', '2025-02-01', {
            tentativaId: 't1',
            resultado: 'VAZIA',
        }),
    ];
    assert.equal(numerosDaVaca(e).vaziasSeguidas, 1);
    e.push(
        event('DIAGNOSTICO_PRENHEZ', '2025-03-01', {
            tentativaId: 't2',
            resultado: 'VAZIA',
        }),
    );
    assert.equal(numerosDaVaca(e).vaziasSeguidas, 2);
});
