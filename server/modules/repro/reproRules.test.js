import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarCandidata, bloqueiosLiberacao, calcularSituacao, numerosDaVaca, validarEvento } from './reproRules.js';

const ref = new Date('2026-09-16T12:00:00Z');

test('sem brucelose bloqueia; macho bloqueia', () => {
    assert.deepEqual(bloqueiosLiberacao({ sexo: 'FEMEA', status: 'VIVO' }, { brucelose: false }), ['Sem registro de brucelose']);
    assert.ok(bloqueiosLiberacao({ sexo: 'MACHO', status: 'VIVO' }, { brucelose: true }).includes('Não é fêmea'));
    assert.deepEqual(bloqueiosLiberacao({ sexo: 'FEMEA', status: 'VIVO' }, { brucelose: true }), []);
});

test('sem critério do produtor não há farol', () => {
    assert.equal(avaliarCandidata({}, {}, ref).cor, null);
});

test('falta peso vira vermelho com motivo', () => {
    const r = avaliarCandidata({ pesoAtual: 255, pesadoEm: ref, dataNascimento: '2025-01-01' }, { pesoMinKg: 280, idadeMinMeses: 13 }, ref);
    assert.equal(r.cor, 'VERMELHO');
    assert.ok(r.motivos.includes('Falta 25 kg'));
});

test('pesagem antiga vira amarelo', () => {
    const r = avaliarCandidata({ pesoAtual: 300, pesadoEm: '2026-05-01' }, { pesoMinKg: 280 }, ref);
    assert.equal(r.cor, 'AMARELO');
});

test('situação: liberada, coberta, prenhe com previsão, perda, parto', () => {
    const lib = { type: 'LIBERACAO', date: '2026-01-01' };
    assert.equal(calcularSituacao([lib]).situacao, 'LIBERADA');
    const cob = { type: 'COBERTURA', date: '2026-02-01' };
    const diag = { type: 'DIAGNOSTICO_PRENHEZ', date: '2026-04-01', payload: { resultado: 'PRENHE', diasGestacao: 59 } };
    const s = calcularSituacao([lib, cob, diag], { gestacaoDias: 293 });
    assert.equal(s.situacao, 'PRENHE');
    assert.equal(s.previsaoParto.toISOString().slice(0, 10), '2026-11-21');
    assert.equal(calcularSituacao([lib, cob, diag, { type: 'PERDA', date: '2026-05-01' }]).situacao, 'LIBERADA');
    const p = calcularSituacao([lib, cob, diag, { type: 'PARTO', date: '2026-11-18' }]);
    assert.equal(p.situacao, 'PARIDA');
    assert.equal(p.categoria, 'Primípara');
});

test('apagar evento recalcula (sem o diagnóstico, volta a coberta)', () => {
    const s = calcularSituacao([{ type: 'LIBERACAO', date: '2026-01-01' }, { type: 'COBERTURA', date: '2026-02-01' }]);
    assert.equal(s.situacao, 'COBERTA');
});

test('descarte manda na situação', () => {
    assert.equal(calcularSituacao([{ type: 'LIBERACAO', date: '2026-01-01' }, { type: 'DESCARTE', date: '2026-03-01', payload: { motivo: 'Vazia' } }]).situacao, 'DESCARTE');
});

test('IEP só com 2 partos e fora do histórico desconhecido', () => {
    const base = [{ type: 'LIBERACAO', date: '2022-01-01' }, { type: 'PARTO', date: '2023-01-01' }];
    assert.equal(numerosDaVaca(base).iepMeses, null);
    assert.equal(numerosDaVaca([...base, { type: 'PARTO', date: '2024-01-01' }]).iepMeses, 12);
    const desc = [{ type: 'LIBERACAO', date: '2022-01-01', payload: { historicoDesconhecido: true } }, { type: 'PARTO', date: '2023-01-01' }, { type: 'PARTO', date: '2024-01-01' }];
    assert.equal(numerosDaVaca(desc).iepMeses, null);
});

test('vazias seguidas', () => {
    const v = (d) => ({ type: 'DIAGNOSTICO_PRENHEZ', date: d, payload: { resultado: 'VAZIA' } });
    assert.equal(numerosDaVaca([v('2025-01-01'), v('2026-01-01')]).vaziasSeguidas, 2);
});

test('evento: data futura e macho bloqueados; ECC fora da faixa', () => {
    assert.ok(validarEvento({ type: 'ECC', date: '2027-01-01', payload: { ecc: 3 } }, { sexo: 'FEMEA', hoje: ref }).erros.length);
    assert.ok(validarEvento({ type: 'ECC', date: '2026-09-01', payload: { ecc: 3 } }, { sexo: 'MACHO', hoje: ref }).erros.length);
    assert.ok(validarEvento({ type: 'ECC', date: '2026-09-01', payload: { ecc: 7 } }, { sexo: 'FEMEA', hoje: ref }).erros.length);
    assert.equal(validarEvento({ type: 'ECC', date: '2026-09-01', payload: { ecc: 3 } }, { sexo: 'FEMEA', hoje: ref }).erros.length, 0);
});

test('diagnóstico cedo demais gera aviso', () => {
    const r = validarEvento({ type: 'DIAGNOSTICO_PRENHEZ', date: '2026-02-20', payload: { resultado: 'PRENHE' } },
        { sexo: 'FEMEA', hoje: ref, eventos: [{ type: 'COBERTURA', date: '2026-02-01' }] });
    assert.equal(r.erros.length, 0);
    assert.equal(r.avisos.length, 1);
});

import { aguardaDecisao, processarToque } from './reproRules.js';

test('toque: pendências, duplicada e perda automática', () => {
    const vacas = new Map([
        ['A1', { id: 'a1', sexo: 'FEMEA', vivo: true, liberada: true }],
        ['A2', { id: 'a2', sexo: 'FEMEA', vivo: true, liberada: false }],
        ['A3', { id: 'a3', sexo: 'FEMEA', vivo: true, liberada: true }],
    ]);
    const eventosPorVaca = new Map([['a3', [{ type: 'DIAGNOSTICO_PRENHEZ', date: '2026-03-01', payload: { resultado: 'PRENHE' } }]]]);
    const r = processarToque([
        { brinco: 'a1', resultado: 'PRENHE', diasGestacao: 60 },
        { brinco: 'A1', resultado: 'VAZIA' },
        { brinco: 'A2', resultado: 'PRENHE' },
        { brinco: 'X9', resultado: 'VAZIA' },
        { brinco: 'A3', resultado: 'VAZIA' },
    ], { data: '2026-06-01', vacas, eventosPorVaca });
    assert.equal(r.resumo.prenhes, 1);
    assert.equal(r.resumo.vazias, 1);
    assert.equal(r.resumo.perdas, 1);
    assert.deepEqual(r.pendencias.map((p) => p.motivo), ['Lançada duas vezes neste toque', 'Fêmea não liberada para reprodução', 'Identificação não encontrada']);
});

test('decidir: vazia sem nada depois; some com decisão ou cobertura', () => {
    const vazia = { type: 'DIAGNOSTICO_PRENHEZ', date: '2026-06-01', payload: { resultado: 'VAZIA' } };
    assert.ok(aguardaDecisao([vazia]));
    assert.equal(aguardaDecisao([vazia, { type: 'OBSERVACAO', date: '2026-06-02', payload: { decisao: 'REPASSE' } }]), null);
    assert.equal(aguardaDecisao([vazia, { type: 'COBERTURA', date: '2026-06-10' }]), null);
    assert.ok(aguardaDecisao([vazia, { type: 'ECC', date: '2026-06-02', payload: { ecc: 3 } }]));
});

import { pesoAjustado205, prontoParaDesmama, statusPrevisao, validarParto } from './reproRules.js';

const lib = { type: 'LIBERACAO', date: '2024-01-01' };

test('parto: bloqueia intervalo curto e sem liberação; avisa vazia no toque', () => {
    const base = { data: '2026-09-01', tipoParto: 'NORMAL', crias: [{ sexo: 'MACHO' }] };
    assert.ok(validarParto(base, { sexo: 'FEMEA', eventos: [], hoje: ref }).erros.length);
    const curto = validarParto(base, { sexo: 'FEMEA', eventos: [lib, { type: 'PARTO', date: '2026-02-01' }], hoje: ref });
    assert.ok(curto.erros[0].includes('impossível'));
    const vazia = validarParto(base, { sexo: 'FEMEA', eventos: [lib, { type: 'DIAGNOSTICO_PRENHEZ', date: '2026-03-01', payload: { resultado: 'VAZIA' } }], hoje: ref });
    assert.equal(vazia.erros.length, 0);
    assert.equal(vazia.avisos.length, 1);
});

test('parto: gêmeos ok, três crias não', () => {
    const e = [lib];
    assert.equal(validarParto({ data: '2026-09-01', tipoParto: 'NORMAL', crias: [{ sexo: 'MACHO' }, { sexo: 'FEMEA' }] }, { sexo: 'FEMEA', eventos: e, hoje: ref }).erros.length, 0);
    assert.ok(validarParto({ data: '2026-09-01', tipoParto: 'NORMAL', crias: [{ sexo: 'MACHO' }, { sexo: 'MACHO' }, { sexo: 'MACHO' }] }, { sexo: 'FEMEA', eventos: e, hoje: ref }).erros.length);
});

test('peso ajustado 205 dias', () => {
    assert.equal(pesoAjustado205({ peso: 210, idadeDias: 225, pesoNascer: 30 }), 194);
    assert.equal(pesoAjustado205({ peso: 210, idadeDias: 225, pesoNascer: null }), null);
});

test('previsão: atrasado e próximo', () => {
    assert.equal(statusPrevisao('2026-08-20', ref), 'ATRASADO');
    assert.equal(statusPrevisao('2026-10-01', ref), 'PROXIMO');
    assert.equal(statusPrevisao('2027-01-01', ref), null);
});

test('pronto para desmama: idade ou peso do produtor', () => {
    assert.equal(prontoParaDesmama({ idadeDias: 200, peso: 150 }, {}), null);
    assert.equal(prontoParaDesmama({ idadeDias: 220, peso: 150 }, { desmamaIdadeMeses: 7 }), true);
    assert.equal(prontoParaDesmama({ idadeDias: 150, peso: 190 }, { desmamaIdadeMeses: 7, desmamaPesoKg: 180 }), true);
    assert.equal(prontoParaDesmama({ idadeDias: 150, peso: 150 }, { desmamaIdadeMeses: 7, desmamaPesoKg: 180 }), false);
});

import { calcularIndicadores, farolVaca, mantidaAteProximoToque } from './reproRules.js';

const vacaTeste = (i, { prenhe = true, parto = false, desmama = false } = {}) => ({
    id: `v${i}`,
    dataNascimento: '2022-01-01',
    eventos: [
        { type: 'LIBERACAO', date: '2024-01-01' },
        { type: 'DIAGNOSTICO_PRENHEZ', date: '2026-01-10', payload: { resultado: prenhe ? 'PRENHE' : 'VAZIA' } },
        ...(parto ? [{ type: 'PARTO', date: '2026-06-01', payload: { tipoParto: 'NORMAL', crias: [{ vivo: true }] } }] : []),
        ...(desmama ? [{ type: 'DESMAME', date: '2026-08-01', payload: { peso: 200, pesoAjustado205: 190 } }] : []),
    ],
});

test('indicadores: menos de 10 vacas = dados insuficientes', () => {
    const r = calcularIndicadores([vacaTeste(1)], {}, ref);
    assert.equal(r.find((i) => i.chave === 'prenhez').valor, null);
});

test('indicadores: prenhez, natalidade e meta', () => {
    const vacas = Array.from({ length: 10 }, (_, i) => vacaTeste(i, { prenhe: i < 8, parto: i < 5, desmama: i < 5 }));
    const r = calcularIndicadores(vacas, { metaPrenhez: 85 }, ref);
    const prenhez = r.find((i) => i.chave === 'prenhez');
    assert.equal(prenhez.valor, 80);
    assert.equal(prenhez.cor, 'VERMELHO');
    assert.equal(r.find((i) => i.chave === 'natalidade').valor, 50);
    assert.equal(r.find((i) => i.chave === 'kgPorVaca').valor, 100);
    assert.equal(r.find((i) => i.chave === 'idadePrimeiroParto').valor, null);
});

test('farol: primípara vazia amarela; vazias seguidas só com limite do produtor', () => {
    const base = [{ type: 'LIBERACAO', date: '2023-01-01' }, { type: 'PARTO', date: '2025-01-01' }];
    const v = (d) => ({ type: 'DIAGNOSTICO_PRENHEZ', date: d, payload: { resultado: 'VAZIA' } });
    const f1 = farolVaca([...base, v('2026-06-01')], {}, ref);
    assert.equal(f1.cor, 'AMARELO');
    assert.deepEqual(f1.motivos, ['Primípara vazia']);
    const duas = [...base, v('2025-06-01'), v('2026-06-01')];
    assert.equal(farolVaca(duas, {}, ref).cor, 'AMARELO');
    const f2 = farolVaca(duas, { vaziasSeguidasLimite: 2 }, ref);
    assert.equal(f2.cor, 'VERMELHO');
    assert.ok(f2.motivos[0].includes('2 vezes'));
});

test('farol: prenhe em dia é verde; manter some até o próximo toque', () => {
    const ev = [{ type: 'LIBERACAO', date: '2026-01-01' }, { type: 'DIAGNOSTICO_PRENHEZ', date: '2026-06-01', payload: { resultado: 'PRENHE' } }];
    assert.equal(farolVaca(ev, {}, ref).cor, 'VERDE');
    const manter = [...ev, { type: 'OBSERVACAO', date: '2026-07-01', payload: { manter: true } }];
    assert.equal(mantidaAteProximoToque(manter), true);
    assert.equal(mantidaAteProximoToque([...manter, { type: 'DIAGNOSTICO_PRENHEZ', date: '2026-08-01', payload: { resultado: 'VAZIA' } }]), false);
});

import { agendaDoProtocolo, alertasBotijao, faltaDose, origemDaPrenhez, podeEntrarNoProtocolo, validarProtocolo } from './reproRules.js';

test('protocolo: exige nome, passos e dias diferentes', () => {
    assert.ok(validarProtocolo({ nome: '', passos: [] }).erros.length);
    assert.ok(validarProtocolo({ nome: 'P1', passos: [{ dia: 0, titulo: 'Implante' }, { dia: 0, titulo: 'Outro' }] }).erros.some((e) => e.includes('mesmo dia')));
    assert.equal(validarProtocolo({ nome: 'P1', passos: [{ dia: 0, titulo: 'Implante' }, { dia: 8, titulo: 'Retirada' }] }).erros.length, 0);
});

test('agenda: hoje, amanhã e atrasado', () => {
    const a = agendaDoProtocolo([{ dia: 0, titulo: 'Implante' }, { dia: 8, titulo: 'Retirada' }], '2026-09-16', ref);
    assert.equal(a[0].quando, 'HOJE');
    assert.equal(a[1].quando, 'FUTURO');
    assert.equal(agendaDoProtocolo([{ dia: 0, titulo: 'x' }], '2026-09-10', ref)[0].quando, 'ATRASADO');
});

test('protocolo: vaca prenhe bloqueada; parida recente só avisa', () => {
    const lib = { type: 'LIBERACAO', date: '2026-01-01' };
    const prenhe = podeEntrarNoProtocolo([lib, { type: 'DIAGNOSTICO_PRENHEZ', date: '2026-08-01', payload: { resultado: 'PRENHE' } }], {}, ref);
    assert.equal(prenhe.ok, false);
    assert.ok(prenhe.motivo.includes('aborto'));
    const parida = podeEntrarNoProtocolo([lib, { type: 'PARTO', date: '2026-09-05' }], {}, ref);
    assert.equal(parida.ok, true);
    assert.equal(parida.avisos.length, 1);
});

test('origem da prenhez: IATF quando a conta bate, senão repasse', () => {
    assert.equal(origemDaPrenhez({ dataDiagnostico: '2026-09-16', diasGestacao: 60, dataIatf: '2026-07-18' }), 'IATF');
    assert.equal(origemDaPrenhez({ dataDiagnostico: '2026-09-16', diasGestacao: 30, dataIatf: '2026-07-18' }), 'REPASSE');
    assert.equal(origemDaPrenhez({ dataDiagnostico: '2026-09-16', diasGestacao: null, dataIatf: '2026-07-18' }), 'INCERTA');
});

test('botijão: alerta de medição e nível baixo; falta de dose', () => {
    const t = { id: 't1', name: 'B1', intervaloMedicaoDias: 7, nivelMinCm: 10, readings: [{ date: '2026-09-01', nivelCm: 8 }] };
    const a = alertasBotijao([t], ref);
    assert.equal(a.length, 2);
    assert.equal(a[1].cor, 'VERMELHO');
    assert.equal(faltaDose({ dosesDisponiveis: 30, vacas: 42 }), 12);
    assert.equal(faltaDose({ dosesDisponiveis: 50, vacas: 42 }), 0);
});

import { avaliarLotacao, capacidadeDoTouro, ciclicidadeDoLote, exameValido, fatorIdadeTouro } from './reproRules.js';

const exame = (resultado, date = '2026-06-01') => ({ type: 'EXAME', date, resultado });

test('capacidade: apto adulto em lote de paridas dá 52 vacas', () => {
    const r = capacidadeDoTouro({ exames: [exame('APTO')], idadeMeses: 60, ciclicidade: 0.8, duracaoEstacao: 90 }, ref);
    assert.equal(r.vacas, 52);
    assert.equal(r.motivos.length, 0);
});

test('capacidade: sem exame e touro jovem cai para 16 e explica', () => {
    const r = capacidadeDoTouro({ exames: [], idadeMeses: 30, ciclicidade: 0.8, duracaoEstacao: 90 }, ref);
    assert.equal(r.vacas, 15);
    assert.deepEqual(r.motivos, ['sem exame de fertilidade', 'é touro jovem']);
});

test('capacidade: inapto e menor de 2 anos ficam bloqueados; teto de 60', () => {
    assert.equal(capacidadeDoTouro({ exames: [exame('INAPTO')], idadeMeses: 60 }, ref).bloqueado, true);
    assert.equal(capacidadeDoTouro({ exames: [exame('APTO')], idadeMeses: 20 }, ref).bloqueado, true);
    assert.equal(capacidadeDoTouro({ exames: [exame('SUPERIOR')], idadeMeses: 48, ciclicidade: 0.5 }, ref).vacas, 60);
});

test('exame vencido volta para a capacidade conservadora', () => {
    const r = capacidadeDoTouro({ exames: [exame('SUPERIOR', '2024-01-01')], idadeMeses: 60, ciclicidade: 0.8 }, ref);
    assert.ok(r.motivos.includes('exame de fertilidade vencido'));
    assert.equal(r.vacas, 26);
    assert.equal(exameValido([exame('APTO', '2026-06-01')], ref).valido, true);
});

test('ciclicidade e idade', () => {
    assert.equal(ciclicidadeDoLote([{ categoria: 'Primípara', situacao: 'PARIDA' }, { categoria: 'Multípara', situacao: 'PARIDA' }]), 0.65);
    assert.equal(fatorIdadeTouro(120), 0.7);
});

test('lotação: frase pronta, sem número de fórmula', () => {
    const vacas = Array.from({ length: 55 }, () => ({ categoria: 'Multípara', situacao: 'PARIDA' }));
    const r = avaliarLotacao({ lote: '2', vacas, touros: [{ brinco: 'T1', exames: [exame('APTO')], idadeMeses: 60 }], duracaoEstacao: 90 }, ref);
    assert.equal(r.cor, 'AMARELO');
    assert.ok(r.texto.startsWith('Lote 2: 1 touro(s) para 55 vaca(s).'));
    assert.ok(!/0,8|×|21/.test(r.texto));
    const semTouro = avaliarLotacao({ lote: '3', vacas, touros: [] }, ref);
    assert.equal(semTouro.cor, 'AMARELO');
});
