import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSexoImport, normalizeTipoRacaImport } from './herdImportRules.js';

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
