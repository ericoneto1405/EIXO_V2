import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { normalizeSpreadsheetDates } from './herdSpreadsheetDates.js';
import { parseNascimentoImport, parsePesagemImport } from './herdImportRules.js';

const keys = ['identificacao', 'data_nascimento', 'data_pesagem', 'previsao_parto', 'ultimo_peso_kg'];

function readFixture({ format = 'm/d/yy', serial = 46220, date1904 = false, bookType = 'xlsx', startRow = 0 } = {}) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(sheet, [keys, [7, serial, serial, serial, 350]], { origin: { r: startRow, c: 0 } });
  sheet['!ref'] = `A${startRow + 1}:E${startRow + 2}`;
  sheet[`A${startRow + 2}`].z = '00000';
  for (const column of ['B', 'C', 'D']) sheet[`${column}${startRow + 2}`].z = format;
  workbook.Workbook = { WBProps: { date1904 } };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Dados');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType });
  const read = XLSX.read(buffer, { type: 'buffer', cellNF: true });
  const readSheet = read.Sheets.Dados;
  const rows = XLSX.utils.sheet_to_json(readSheet, { header: 1, defval: null, raw: false });
  const before = structuredClone(rows);
  normalizeSpreadsheetDates(read, readSheet, rows, keys, 0, `rebanho.${bookType}`);
  return { rows, before, workbook: read, sheet: readSheet };
}

test('lê datas nativas em formatos brasileiro, americano e com horário nos três campos', () => {
  for (const format of ['dd/mm/yyyy', 'm/d/yy', 'mm/dd/yyyy', 'dd/mm/yyyy hh:mm:ss']) {
    const { rows, before } = readFixture({ format, serial: 46220.5 });
    assert.deepEqual(rows[1].slice(1, 4), Array(3).fill('2026-07-17'), format);
    assert.equal(parsePesagemImport(rows[1][2]).erro, false);
    assert.equal(rows[1][0], '00007');
    assert.equal(rows[1][4], before[1][4]);
  }
});

test('respeita calendário 1904 e suporta arquivo XLS', () => {
  for (const bookType of ['xlsx', 'xls']) {
    const { rows } = readFixture({ date1904: true, serial: 44758, bookType });
    assert.equal(rows[1][2], '2026-07-17');
  }
});

test('não troca dia e mês de uma data ambígua', () => {
  assert.equal(readFixture({ serial: 46241 }).rows[1][2], '2026-08-07');
});

test('localiza as células quando a área preenchida começa após a primeira linha', () => {
  assert.equal(readFixture({ startRow: 3 }).rows[1][2], '2026-07-17');
});

test('preserva CSV exatamente como lido anteriormente', () => {
  const { rows, before } = readFixture({ bookType: 'csv' });
  assert.deepEqual(rows, before);
});

test('localiza datas quando a área preenchida começa depois da coluna A', () => {
  const sheet = {
    '!ref': 'C4:D5',
    C4: { t: 's', v: 'data_pesagem' }, D4: { t: 's', v: 'identificacao' },
    C5: { t: 'n', v: 46220, z: 'm/d/yy' }, D5: { t: 's', v: '007' },
  };
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  normalizeSpreadsheetDates({}, sheet, rows, rows[0], 0, 'rebanho.xlsx');
  assert.deepEqual(rows[1], ['2026-07-17', '007']);
});

test('preserva textos, vazios e números sem formato de data, mantendo as validações', () => {
  const workbook = XLSX.utils.book_new();
  const values = ['17/07/2026', '07/08/2026', '7/17/26', '31/02/2026', '03/2024', null, '', 2023, 46220];
  const sheet = XLSX.utils.aoa_to_sheet([keys, ...values.map(value => ['00007', value, value, value, 350])]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Dados');
  const read = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
  const rows = XLSX.utils.sheet_to_json(read.Sheets.Dados, { header: 1, defval: null, raw: false });
  const before = structuredClone(rows);
  normalizeSpreadsheetDates(read, read.Sheets.Dados, rows, keys, 0, 'rebanho.xlsx');
  assert.deepEqual(rows, before);
  assert.equal(parsePesagemImport(rows[3][2]).erro, true);
  assert.equal(parsePesagemImport(rows[4][2]).erro, true);
  assert.equal(parsePesagemImport(rows[5][2]).diaEstimado, true);
  assert.equal(parseNascimentoImport(rows[8][1]).erro, true);
});
