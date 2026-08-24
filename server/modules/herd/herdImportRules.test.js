import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSexoImport, normalizeTipoRacaImport, parseImportDate, parseNascimentoImport } from './herdImportRules.js';

test('normaliza as quatro formas de composição racial para dois valores internos', () => {
  assert.equal(normalizeTipoRacaImport('Pura'), 'Pura');
  assert.equal(normalizeTipoRacaImport('Puro'), 'Pura');
  assert.equal(normalizeTipoRacaImport('Mestiça'), 'Mestiça');
  assert.equal(normalizeTipoRacaImport('Mestiço'), 'Mestiça');
});

test('aceita texto copiado com acento decomposto, espaços e caracteres invisíveis', () => {
  assert.equal(normalizeTipoRacaImport('  Mestic\u0327a\u200B '), 'Mestiça');
  assert.equal(normalizeSexoImport(' FÊMEA\uFEFF '), 'FEMEA');
});

test('rejeita composição racial desconhecida', () => {
  assert.equal(normalizeTipoRacaImport('Cruzada'), null);
});

test('rejeita dias inexistentes e aceita datas reais, inclusive ano bissexto', () => {
  assert.equal(parseImportDate('31/02/2026'), null);
  assert.equal(parseImportDate('2026-02-31'), null);
  assert.equal(parseImportDate('data-invalida'), null);
  assert.equal(parseImportDate('29/02/2024')?.toISOString().slice(0, 10), '2024-02-29');
});

test('aceita sinônimos de Sexo em português e inglês, e corrige erro de digitação pela primeira letra', () => {
  assert.equal(normalizeSexoImport('Masculino'), 'MACHO');
  assert.equal(normalizeSexoImport('Male'), 'MACHO');
  assert.equal(normalizeSexoImport('Feminino'), 'FEMEA');
  assert.equal(normalizeSexoImport('Female'), 'FEMEA');
  assert.equal(normalizeSexoImport('masculiono'), 'MACHO');
  assert.equal(normalizeSexoImport('fem'), 'FEMEA');
  assert.equal(normalizeSexoImport(''), null);
  assert.equal(normalizeSexoImport(null), null);
});

// ─── Nascimento por safra ─────────────────────────────────────────────────────

test('parseNascimentoImport aceita data exata e não marca como estimada', () => {
  const r = parseNascimentoImport('15/03/2021');
  assert.equal(r.estimada, false);
  assert.equal(r.erro, false);
  assert.equal(r.data.getFullYear(), 2021);
  assert.equal(r.data.getMonth(), 2);
  assert.equal(r.data.getDate(), 15);
});

test('parseNascimentoImport aceita ISO', () => {
  const r = parseNascimentoImport('2021-03-15');
  assert.equal(r.estimada, false);
  assert.equal(r.data.getFullYear(), 2021);
});

test('safra com a palavra vira 1º de outubro e marca estimada', () => {
  for (const entrada of ['safra 2023', 'Safra 2023', 'SAFRA 2023', 'safra: 2023', 'safra2023']) {
    const r = parseNascimentoImport(entrada);
    assert.equal(r.estimada, true, entrada);
    assert.equal(r.erro, false, entrada);
    assert.equal(r.data.getFullYear(), 2023, entrada);
    assert.equal(r.data.getMonth(), 9, entrada);
    assert.equal(r.data.getDate(), 1, entrada);
  }
});

test('safra com ano de dois dígitos', () => {
  const r = parseNascimentoImport('safra 23');
  assert.equal(r.data.getFullYear(), 2023);
  assert.equal(r.estimada, true);
});

test('safra com intervalo usa o primeiro ano', () => {
  assert.equal(parseNascimentoImport('safra 2023/2024').data.getFullYear(), 2023);
  assert.equal(parseNascimentoImport('2023/24').data.getFullYear(), 2023);
  assert.equal(parseNascimentoImport('safra 2022-2023').data.getFullYear(), 2022);
});

test('ano solto de quatro dígitos é tratado como safra', () => {
  const r = parseNascimentoImport('2023');
  assert.equal(r.estimada, true);
  assert.equal(r.data.getFullYear(), 2023);
  assert.equal(r.data.getMonth(), 9);
});

test('número inteiro na faixa de anos é safra, não serial do Excel', () => {
  const r = parseNascimentoImport(2023);
  assert.equal(r.estimada, true);
  assert.equal(r.data.getFullYear(), 2023);
});

test('número fora da faixa de anos continua sendo serial do Excel', () => {
  const r = parseNascimentoImport(44000); // serial de 2020
  assert.equal(r.estimada, false);
  assert.equal(r.data.getFullYear(), 2020);
});

test('vazio não é erro', () => {
  for (const entrada of [null, undefined, '', '   ']) {
    const r = parseNascimentoImport(entrada);
    assert.equal(r.data, null);
    assert.equal(r.estimada, false);
    assert.equal(r.erro, false);
  }
});

test('texto que não dá para entender vira erro', () => {
  const r = parseNascimentoImport('mais ou menos 3 anos');
  assert.equal(r.data, null);
  assert.equal(r.erro, true);
});

test('data impossível vira erro', () => {
  const r = parseNascimentoImport('31/02/2021');
  assert.equal(r.data, null);
  assert.equal(r.erro, true);
});

test('safra fora da faixa plausível vira erro', () => {
  assert.equal(parseNascimentoImport('safra 1200').erro, true);
  assert.equal(parseNascimentoImport('3050').erro, true);
});

// ─── Casos que a revisão adversarial pegou ────────────────────────────────────

test('mês em ISO não é confundido com safra', () => {
  const r = parseNascimentoImport('2023-03');
  assert.equal(r.estimada, false, 'não pode virar safra');
  assert.equal(r.erro, true, 'sem dia, não dá para gravar como data');
});

test('texto que o JS consegue parsear não vira data exata por acidente', () => {
  for (const entrada of ['março de 2023', 'March 2023', 'Jan 5 2021']) {
    const r = parseNascimentoImport(entrada);
    assert.equal(r.data, null, entrada);
    assert.equal(r.erro, true, entrada);
  }
});

test('safra de dois dígitos é sempre deste século', () => {
  assert.equal(parseNascimentoImport('safra 24').data.getFullYear(), 2024);
});

test('safra futura vira erro em vez de entrar em silêncio', () => {
  // "safra 87" seria 2087: erro de digitação, não dado. Se entrasse, a idade de
  // uma data futura é nula e o animal ficaria sem categoria, sem aviso nenhum.
  assert.equal(parseNascimentoImport('safra 87').erro, true);
  const anoQueVem = new Date().getFullYear() + 1;
  assert.equal(parseNascimentoImport(`safra ${anoQueVem}`).erro, false, 'o ano que vem ainda vale');
  assert.equal(parseNascimentoImport(`safra ${anoQueVem + 1}`).erro, true, 'depois disso, não');
});
