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
