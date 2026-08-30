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

// ─── Nascimento: data exata ou mês/ano ───────────────────────────────────────

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

test('parseNascimentoImport aceita DD-MM-AAAA com hífen igual à barra', () => {
  const r = parseNascimentoImport('15-03-2021');
  assert.equal(r.estimada, false);
  assert.equal(r.erro, false);
  assert.equal(r.data.getFullYear(), 2021);
  assert.equal(r.data.getMonth(), 2);
  assert.equal(r.data.getDate(), 15);
});

test('mês/ano vira dia 15 do mês e marca estimada', () => {
  for (const entrada of ['03/2021', '3/2021', '03-2021', '03.2021']) {
    const r = parseNascimentoImport(entrada);
    assert.equal(r.estimada, true, entrada);
    assert.equal(r.erro, false, entrada);
    assert.equal(r.data.getFullYear(), 2021, entrada);
    assert.equal(r.data.getMonth(), 2, entrada);
    assert.equal(r.data.getDate(), 15, entrada);
  }
});

test('mês/ano com ano de dois dígitos', () => {
  const r = parseNascimentoImport('03/21');
  assert.equal(r.data.getFullYear(), 2021);
  assert.equal(r.estimada, true);
});

test('mês/ano com mês inválido vira erro', () => {
  assert.equal(parseNascimentoImport('13/2021').erro, true);
  assert.equal(parseNascimentoImport('00/2021').erro, true);
});

test('ano solto de quatro dígitos não é mais aceito (safra removida)', () => {
  const r = parseNascimentoImport('2023');
  assert.equal(r.estimada, false);
  assert.equal(r.erro, true);
  assert.equal(r.data, null);
});

test('número inteiro na faixa de anos plausíveis vira erro, não é lido como serial do Excel', () => {
  const r = parseNascimentoImport(2023);
  assert.equal(r.erro, true);
  assert.equal(r.data, null);
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

test('"safra 2023" e variações não são mais aceitas', () => {
  for (const entrada of ['safra 2023', 'Safra 2023', 'safra 23', 'safra 2023/2024']) {
    const r = parseNascimentoImport(entrada);
    assert.equal(r.erro, true, entrada);
    assert.equal(r.data, null, entrada);
  }
});

// ─── Casos que a revisão adversarial pegou ────────────────────────────────────

test('mês em ISO (2023-03) continua sem dia suficiente para virar data', () => {
  const r = parseNascimentoImport('2023-03');
  assert.equal(r.estimada, false);
  assert.equal(r.erro, true, 'ordem ISO sem dia não bate com o padrão de mês/ano (que é mês primeiro)');
});

test('texto que o JS consegue parsear não vira data exata por acidente', () => {
  for (const entrada of ['março de 2023', 'March 2023', 'Jan 5 2021']) {
    const r = parseNascimentoImport(entrada);
    assert.equal(r.data, null, entrada);
    assert.equal(r.erro, true, entrada);
  }
});

test('ano fora da faixa plausível vira erro (e não é lido como safra nem serial)', () => {
  assert.equal(parseNascimentoImport('1200').erro, true);
  assert.equal(parseNascimentoImport('3050').erro, true);
});
