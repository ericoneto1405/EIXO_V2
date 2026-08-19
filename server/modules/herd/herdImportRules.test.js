import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSexoImport, normalizeTipoRacaImport, parseImportDate } from './herdImportRules.js';

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
