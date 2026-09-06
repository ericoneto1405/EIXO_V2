import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const requireFromExpress = createRequire(require.resolve('express/package.json'));
const qs = requireFromExpress('qs');

test('qs preserva queries legítimas e bloqueia o bypass do limite de arrays', () => {
  const query = qs.parse('filtro[status]=ATIVO&ids[]=1&ids[]=2');
  assert.deepEqual(query, {
    filtro: { status: 'ATIVO' },
    ids: ['1', '2'],
  });

  assert.throws(
    () => qs.parse('ids[]=1,2,3,4', {
      comma: true,
      arrayLimit: 3,
      throwOnLimitExceeded: true,
    }),
    RangeError,
  );
});

test('qs não altera o protótipo global com chaves especiais', () => {
  qs.parse('__proto__[eixoPolluted]=sim&constructor[prototype][eixoPolluted]=sim', {
    allowPrototypes: true,
  });

  assert.equal(Object.prototype.eixoPolluted, undefined);
});

test('SheetJS 0.20.3 lê XLSX, XLS e CSV sem perder dados de domínio', () => {
  assert.equal(XLSX.version, '0.20.3');

  const rows = [
    ['Brinco', 'Nascimento', 'Peso'],
    ['BÊ-001', '15/03/2021', 432.5],
  ];
  const sourceSheet = XLSX.utils.aoa_to_sheet(rows);
  const sourceWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(sourceWorkbook, sourceSheet, 'Animais');

  for (const bookType of ['xlsx', 'xls']) {
    const buffer = XLSX.write(sourceWorkbook, { bookType, type: 'buffer' });
    const parsed = XLSX.read(buffer, { type: 'buffer' });
    const parsedRows = XLSX.utils.sheet_to_json(parsed.Sheets.Animais, {
      header: 1,
      raw: true,
    });
    assert.deepEqual(parsedRows, rows, bookType);
  }

  const csv = Buffer.from('\uFEFFBrinco;Categoria\nBÊ-001;Vaca\n', 'utf8');
  const parsedCsv = XLSX.read(csv, { type: 'buffer' });
  assert.deepEqual(
    XLSX.utils.sheet_to_json(parsedCsv.Sheets[parsedCsv.SheetNames[0]], { raw: true }),
    [{ Brinco: 'BÊ-001', Categoria: 'Vaca' }],
  );
});

test('ExcelJS gera e reabre planilha com validação e formatação condicional', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Dados');
  sheet.addRows([['Peso'], [320], [450]]);
  sheet.getCell('A2').dataValidation = {
    type: 'decimal',
    operator: 'greaterThan',
    formulae: [0],
  };
  sheet.addConditionalFormatting({
    ref: 'A2:A3',
    rules: [{
      type: 'dataBar',
      cfvo: [{ type: 'min' }, { type: 'max' }],
      color: 'FF638EC6',
    }],
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);

  assert.equal(reopened.getWorksheet('Dados').getCell('A3').value, 450);
});
