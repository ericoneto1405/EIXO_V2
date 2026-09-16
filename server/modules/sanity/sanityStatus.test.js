import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ultimoPeriodoVencido, periodoAtual, calcularSemaforo, avaliarVenda, avisoNotificacao,
    indicadoresCasos, avaliarTemperatura, situacaoTemperaturas,
} from './sanityStatus.js';
import { infoDoEstado } from './sanityRegion.js';

const HOJE = new Date('2026-09-16T12:00:00Z');
const estado = infoDoEstado('MS');
const settings = (rabiesRequired) => ({ rabiesRequired });

test('períodos de comprovação da brucelose', () => {
    assert.equal(ultimoPeriodoVencido(HOJE).period, '2026-S1');
    assert.equal(ultimoPeriodoVencido(new Date('2027-01-05T12:00:00Z')).period, '2026-S1');
    assert.equal(ultimoPeriodoVencido(new Date('2027-02-01T12:00:00Z')).period, '2026-S2');
    assert.equal(ultimoPeriodoVencido(new Date('2026-07-10T15:00:00Z')).period, '2025-S2');
    assert.equal(periodoAtual(HOJE).period, '2026-S2');
    assert.equal(periodoAtual(new Date('2026-03-01T00:00:00Z')).period, '2026-S1');
});

test('semáforo: comprovação vencida deixa vermelho; entregue deixa verde', () => {
    const vermelho = calcularSemaforo({ hoje: HOJE, lembretes: [], comprovacoes: [], settings: settings('NAO'), estado, temFemeas: true });
    assert.equal(vermelho.brucelose.status, 'VERMELHO');
    assert.equal(vermelho.geral, 'VERMELHO');
    assert.match(vermelho.mensagem, /IAGRO/);
    const verde = calcularSemaforo({ hoje: HOJE, lembretes: [], comprovacoes: [{ kind: 'BRUCELOSE', period: '2026-S1' }], settings: settings('NAO'), estado, temFemeas: true });
    assert.equal(verde.brucelose.status, 'VERDE');
    assert.equal(verde.raiva.status, 'CINZA');
    assert.equal(verde.geral, 'VERDE');
    const semFemeas = calcularSemaforo({ hoje: HOJE, lembretes: [], comprovacoes: [], settings: settings('NAO'), estado, temFemeas: false });
    assert.equal(semFemeas.brucelose.status, 'VERDE');
});

test('semáforo: prazo do semestre em até 30 dias e bezerras saindo da idade deixam amarelo', () => {
    const hoje = new Date('2026-12-20T12:00:00Z');
    const r = calcularSemaforo({
        hoje,
        lembretes: [{ id: 'b19-na-idade', dias: 3, totalAnimais: 2, data: '2026-12-23T00:00:00Z' }],
        comprovacoes: [{ kind: 'BRUCELOSE', period: '2026-S1' }],
        settings: settings('NAO'), estado, temFemeas: true,
    });
    assert.equal(r.brucelose.status, 'AMARELO');
    assert.equal(r.brucelose.motivos.length, 2);
});

test('semáforo: raiva', () => {
    const base = { hoje: HOJE, comprovacoes: [{ kind: 'BRUCELOSE', period: '2026-S1' }], estado, temFemeas: true };
    assert.equal(calcularSemaforo({ ...base, lembretes: [], settings: settings('NAO_SEI') }).raiva.status, 'AMARELO');
    assert.equal(calcularSemaforo({ ...base, lembretes: [], settings: settings('SIM') }).raiva.status, 'VERDE');
    const atrasado = calcularSemaforo({ ...base, lembretes: [{ id: 'raiva-anual-2026-09-01', dias: -15, totalAnimais: 40 }], settings: settings('SIM') });
    assert.equal(atrasado.raiva.status, 'VERMELHO');
    assert.equal(atrasado.geral, 'VERMELHO');
    const proximo = calcularSemaforo({ ...base, lembretes: [{ id: 'raiva-reforco-2026-09-20', dias: 4, totalAnimais: 5 }], settings: settings('SIM') });
    assert.equal(proximo.raiva.status, 'AMARELO');
});

test('venda: carência bloqueia abate e só avisa recria', () => {
    const carencia = { liberaEm: '2026-10-01T00:00:00Z', semCarencia: false, produtos: ['Ivomec Gold'] };
    const abate = avaliarVenda({ saleType: 'ABATE', dataVenda: HOJE, carencia });
    assert.equal(abate.permitido, false);
    assert.match(abate.mensagem, /01\/10\/2026/);
    assert.equal(avaliarVenda({ saleType: undefined, dataVenda: HOJE, carencia }).permitido, false);
    const recria = avaliarVenda({ saleType: 'RECRIA', dataVenda: HOJE, carencia });
    assert.equal(recria.permitido, true);
    assert.match(recria.aviso, /Informe o comprador/);
    assert.equal(avaliarVenda({ saleType: 'ABATE', dataVenda: new Date('2026-10-02T00:00:00Z'), carencia }).permitido, true);
    assert.equal(avaliarVenda({ saleType: 'ABATE', dataVenda: HOJE, carencia: null }).permitido, true);
    const sem = avaliarVenda({ saleType: 'ABATE', dataVenda: HOJE, carencia: { semCarencia: true, produtos: ['X'] } });
    assert.equal(sem.permitido, false);
    assert.match(sem.mensagem, /Farmácia/);
});

test('doenças: notificação obrigatória', () => {
    assert.match(avisoNotificacao('DOENCA', 'RAIVA', 'IAGRO'), /IAGRO/);
    assert.ok(avisoNotificacao('MORTE', 'DESCONHECIDA', 'IAGRO'));
    assert.equal(avisoNotificacao('DOENCA', 'PNEUMONIA', 'IAGRO'), null);
});

test('indicadores: mortalidade de 12 meses e casos por causa', () => {
    const casos = [
        { kind: 'DOENCA', disease: 'PNEUMONIA', status: 'CURADO', startedAt: '2026-05-01T00:00:00Z' },
        { kind: 'DOENCA', disease: 'PNEUMONIA', status: 'MORTO', startedAt: '2026-06-01T00:00:00Z' },
        { kind: 'MORTE', disease: 'RAIO', status: 'MORTO', startedAt: '2026-07-01T00:00:00Z' },
        { kind: 'DOENCA', disease: 'DIARREIA', status: 'EM_TRATAMENTO', startedAt: '2026-09-10T00:00:00Z' },
        { kind: 'MORTE', disease: 'RAIO', status: 'MORTO', startedAt: '2025-01-01T00:00:00Z' },
    ];
    const r = indicadoresCasos({ hoje: HOJE, casos, vivos: 98 });
    assert.equal(r.mortes12m, 2);
    assert.equal(r.mortalidade12m, 2);
    assert.equal(r.emTratamento, 1);
    assert.equal(r.casos12m, 3);
    assert.equal(r.porCausa[0].causa, 'Pneumonia / doença respiratória');
    assert.equal(r.porCausa[0].mortes, 1);
});

test('temperatura: faixa do produto e leituras', () => {
    const vacina = { refrigerated: true };
    assert.ok(avaliarTemperatura(vacina, null).aviso);
    assert.ok(avaliarTemperatura(vacina, 12).bloqueio);
    assert.equal(avaliarTemperatura(vacina, 5).bloqueio, null);
    assert.deepEqual(avaliarTemperatura({ refrigerated: false }, 30), { bloqueio: null, aviso: null });
    assert.ok(avaliarTemperatura({ storageMinTemp: 15, storageMaxTemp: 30 }, 35).bloqueio);
    const s = situacaoTemperaturas({
        hoje: HOJE,
        temRefrigerado: true,
        leituras: [
            { location: 'Geladeira 1', tempC: 5, measuredAt: '2026-09-01T00:00:00Z' },
            { location: 'Geladeira 1', tempC: 11, measuredAt: '2026-09-15T00:00:00Z' },
            { location: 'Geladeira 2', tempC: 4, measuredAt: '2026-09-01T00:00:00Z' },
        ],
    });
    assert.equal(s.alertas.length, 2);
    assert.equal(s.alertas[0].tipo, 'FORA_DA_FAIXA');
    assert.equal(s.alertas[1].tipo, 'SEM_LEITURA');
    assert.equal(situacaoTemperaturas({ hoje: HOJE, temRefrigerado: true, leituras: [] }).alertas.length, 1);
});
