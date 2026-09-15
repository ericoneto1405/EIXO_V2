import * as XLSX from 'xlsx';

const DATE_KEYS = new Set(['data_nascimento', 'data_pesagem', 'previsao_parto']);

// Mantém o texto formatado das demais células. Só datas nativas do Excel
// usam o serial original, evitando interpretar mês/dia como dia/mês.
export function normalizeSpreadsheetDates(workbook, sheet, rows, keys, headerRowIndex, originalName) {
  if (!/\.xlsx?$/i.test(originalName || '') || !sheet['!ref']) return;
  const firstCell = XLSX.utils.decode_range(sheet['!ref']).s;
  const date1904 = workbook.Workbook?.WBProps?.date1904 === true;

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    if (!Array.isArray(rows[rowIndex])) continue;
    keys.forEach((key, columnIndex) => {
      if (!DATE_KEYS.has(key)) return;
      const cell = sheet[XLSX.utils.encode_cell({ r: firstCell.r + rowIndex, c: firstCell.c + columnIndex })];
      if (cell?.t !== 'n' || !Number.isFinite(cell.v) || !XLSX.SSF.is_date(cell.z || '')) return;
      const date = XLSX.SSF.parse_date_code(cell.v, { date1904 });
      if (!date) return;
      // Monta a data civil diretamente: o fuso do servidor não desloca o dia.
      rows[rowIndex][columnIndex] = `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    });
  }
}
