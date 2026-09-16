import test from 'node:test';
import assert from 'node:assert/strict';
import { gerarLembretes, proximoPrazoBrucelose, severidade } from './sanityAlerts.js';
import { infoDoEstado } from './sanityRegion.js';

const HOJE = new Date('2026-09-16T12:00:00.000Z');
const diasAtras = (n) => new Date(HOJE.getTime() - n * 86400000);
const estado = infoDoEstado('BA');
const base = { rabiesRequired: 'NAO', clostridialEnabled: false, reproductiveEnabled: false, dewormEnabled: false, dewormMonths: [], tickEnabled: false, tickMonths: [] };
const femea = (id, dias) => ({ id, brinco: id, status: 'VIVO', sexo: 'FEMEA', dataNascimento: diasAtras(dias) });
const macho = (id, dias) => ({ id, brinco: id, status: 'VIVO', sexo: 'MACHO', dataNascimento: diasAtras(dias) });
const aplic = (animalId, dias, tags, category = 'VACINA') => ({ animalId, appliedAt: diasAtras(dias), tags: new Set(tags), category });
const gerar = (extra) => gerarLembretes({ hoje: HOJE, animais: [], aplicacoes: [], settings: base, estado, ...extra });
const achar = (lista, id) => lista.find((item) => item.id === id || item.id.startsWith(id));

test('severidade pela régua de dias', () => {
    assert.equal(severidade(-3), 'VERMELHO');
    assert.equal(severidade(0), 'VERMELHO');
    assert.equal(severidade(5), 'LARANJA');
    assert.equal(severidade(20), 'AMARELO');
    assert.equal(severidade(60), 'AZUL');
});

test('estado: órgão e meses sugeridos; estado desconhecido não inventa órgão', () => {
    assert.equal(estado.orgao, 'ADAB');
    assert.deepEqual(estado.vermifugo, [5, 7, 9]);
    assert.ok(estado.linkBusca.startsWith('https://www.google.com/search?q='));
    const desconhecido = infoDoEstado(null);
    assert.equal(desconhecido.regiaoConhecida, false);
    assert.equal(desconhecido.linkBusca, null);
});

test('B19: na idade, entrando, passou; ignora macho e vacinada', () => {
    const lista = gerar({
        animais: [femea('a', 120), femea('b', 235), femea('c', 70), femea('d', 300), macho('m', 120), femea('v', 120)],
        aplicacoes: [aplic('v', 5, ['BRUCELOSE_B19'])],
    });
    const naIdade = achar(lista, 'b19-na-idade');
    assert.deepEqual(naIdade.brincos.sort(), ['a', 'b']);
    assert.equal(naIdade.dias, 5);
    assert.equal(naIdade.severidade, 'LARANJA');
    assert.deepEqual(achar(lista, 'b19-entrando').brincos, ['c']);
    assert.deepEqual(achar(lista, 'b19-passou').brincos, ['d']);
});

test('B19: avisa quando o estoque não dá', () => {
    const lista = gerar({ animais: [femea('a', 120), femea('b', 130)], estoque: { BRUCELOSE_B19: 1 } });
    assert.match(achar(lista, 'b19-na-idade').descricao, /faltam 1 doses/);
});

test('prazo de brucelose: julho e janeiro', () => {
    assert.equal(proximoPrazoBrucelose(new Date('2026-06-20T00:00:00Z')).prazo.toISOString().slice(0, 10), '2026-07-10');
    assert.equal(proximoPrazoBrucelose(HOJE).prazo.toISOString().slice(0, 10), '2027-01-10');
    const perto = gerarLembretes({ hoje: new Date('2026-12-20T12:00:00Z'), animais: [], aplicacoes: [aplic('x', -60, ['BRUCELOSE_B19'])], settings: base, estado });
    const item = perto.find((l) => l.id.startsWith('brucelose-comprovacao'));
    assert.ok(item);
    assert.match(item.descricao, /ADAB/);
    assert.equal(gerar({}).some((l) => l.id.startsWith('brucelose-comprovacao')), false);
});

test('raiva: só com "Sim"; "Não sei" pede confirmação; reforço e anual', () => {
    assert.equal(gerar({ animais: [macho('m', 400)] }).some((l) => l.id.startsWith('raiva')), false);
    const naoSei = gerar({ settings: { ...base, rabiesRequired: 'NAO_SEI' } });
    assert.equal(achar(naoSei, 'raiva-confirmar').acao, 'CONFIGURAR');
    const sim = gerar({
        settings: { ...base, rabiesRequired: 'SIM' },
        animais: [macho('r1', 200), macho('r2', 400), macho('r3', 400)],
        aplicacoes: [aplic('r1', 25, ['RAIVA']), aplic('r2', 700, ['RAIVA']), aplic('r2', 360, ['RAIVA'])],
    });
    const reforco = sim.find((l) => l.id.startsWith('raiva-reforco'));
    assert.deepEqual(reforco.brincos, ['r1']);
    assert.equal(reforco.dias, 5);
    const anual = sim.find((l) => l.id.startsWith('raiva-anual'));
    assert.deepEqual(anual.brincos, ['r2']);
    assert.deepEqual(achar(sim, 'raiva-nunca').brincos, ['r3']);
});

test('reprodutivas: só com estação cadastrada e fêmeas não vacinadas', () => {
    const settings = { ...base, reproductiveEnabled: true };
    const estacoes = [{ id: 'e1', name: 'EM 26/27', startAt: new Date('2026-11-15T00:00:00Z') }];
    const lista = gerar({ settings, estacoes, animais: [femea('f1', 900), femea('f2', 900), femea('bez', 100)], aplicacoes: [aplic('f2', 30, ['REPRODUTIVA'])] });
    const item = achar(lista, 'reprodutiva-e1');
    assert.deepEqual(item.brincos, ['f1']);
    assert.equal(item.data.slice(0, 10), '2026-10-16');
    assert.equal(gerar({ settings, animais: [femea('f1', 900)] }).some((l) => l.id.startsWith('reprodutiva')), false);
});

test('vermífugo por mês: some quando há aplicação no período', () => {
    const settings = { ...base, dewormEnabled: true, dewormMonths: [9] };
    const animais = [macho('m', 400)];
    const pendente = gerar({ settings, animais });
    const item = achar(pendente, 'vermifugo-2026-09');
    assert.ok(item);
    assert.equal(item.data.slice(0, 10), '2026-09-30');
    const feito = gerar({ settings, animais, aplicacoes: [aplic('m', 3, [], 'ANTIPARASITARIO')] });
    assert.equal(feito.some((l) => l.id.startsWith('vermifugo-2026-09')), false);
    const soCarrapato = gerar({ settings, animais, aplicacoes: [aplic('m', 3, ['CARRAPATICIDA'], 'ANTIPARASITARIO')] });
    assert.ok(achar(soCarrapato, 'vermifugo-2026-09'));
});

test('gestão: carência acabando e lote vencendo', () => {
    const lista = gerar({
        carencias: [{ animalId: 'x', brinco: 'X1', liberaEm: new Date('2026-09-18T00:00:00Z'), semCarencia: false }],
        lotes: [
            { id: 'l1', productName: 'Ivomec Gold', lotNumber: 'A', quantity: 2, unit: 'frasco', expiresAt: new Date('2026-10-01T00:00:00Z') },
            { id: 'l2', productName: 'Dectomax', lotNumber: 'B', quantity: 0, unit: 'frasco', expiresAt: new Date('2026-10-01T00:00:00Z') },
        ],
    });
    assert.deepEqual(achar(lista, 'carencia-').brincos, ['X1']);
    assert.ok(achar(lista, 'validade-l1'));
    assert.equal(lista.some((l) => l.id === 'validade-l2'), false);
});
