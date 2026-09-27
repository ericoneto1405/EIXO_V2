import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
    MAX_IMPORT_COLUMNS,
    MAX_IMPORT_SHEET_ROWS,
    MAX_IMPORT_UNCOMPRESSED_BYTES,
    readBoundedSpreadsheet,
} from '../modules/herd/herdSpreadsheetLimits.js';

const workbookBuffer = (sheet) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Dados');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

test('aceita a dimensão física do modelo oficial', () => {
    const sheet = {
        A1: { t: 's', v: 'Cadastro de rebanho' },
        A4: { t: 's', v: 'Identificação' },
        A5: { t: 's', v: 'ANIMAL-1' },
        L1004: { t: 's', v: '' },
        '!ref': 'A1:L1004',
    };
    const parsed = readBoundedSpreadsheet(workbookBuffer(sheet));
    assert.ok(Array.isArray(parsed.rows));
});

test('rejeita planilha com linhas além do limite antes da expansão JSON', () => {
    const sheet = {
        A1: { t: 's', v: 'Identificação' },
        [`A${MAX_IMPORT_SHEET_ROWS + 1}`]: { t: 's', v: 'FORA-DO-LIMITE' },
        '!ref': `A1:A${MAX_IMPORT_SHEET_ROWS + 1}`,
    };
    assert.throws(
        () => readBoundedSpreadsheet(workbookBuffer(sheet)),
        /limite físico/,
    );
});

test('rejeita planilha com dimensão de colunas excessiva', () => {
    const lastColumn = XLSX.utils.encode_col(MAX_IMPORT_COLUMNS);
    const sheet = {
        A1: { t: 's', v: 'Identificação' },
        [`${lastColumn}1`]: { t: 's', v: 'FORA-DO-LIMITE' },
        '!ref': `A1:${lastColumn}1`,
    };
    assert.throws(
        () => readBoundedSpreadsheet(workbookBuffer(sheet)),
        /limite de 32 colunas/,
    );
});

test('rejeita arquivo compactado que anuncia expansão excessiva antes da leitura XLSX', () => {
    const buffer = workbookBuffer(XLSX.utils.aoa_to_sheet([['Identificação'], ['ANIMAL-1']]));
    const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    const centralOffset = buffer.indexOf(centralSignature);
    assert.ok(centralOffset >= 0);

    buffer.writeUInt32LE(MAX_IMPORT_UNCOMPRESSED_BYTES + 1, centralOffset + 24);
    assert.throws(
        () => readBoundedSpreadsheet(buffer),
        /limite de expansão|tamanhos internos inconsistentes/,
    );
});

test('rejeita XLSX que falsifica tamanhos internos para esconder a expansão real', () => {
    const largeRows = Array.from({ length: 900 }, () => ['A'.repeat(30_000)]);
    const buffer = workbookBuffer(XLSX.utils.aoa_to_sheet(largeRows));
    const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);

    let centralOffset = buffer.indexOf(centralSignature);
    let patchedEntries = 0;
    while (centralOffset >= 0) {
        const declaredSize = buffer.readUInt32LE(centralOffset + 24);
        if (declaredSize > 1024) {
            const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
            buffer.writeUInt32LE(1024, centralOffset + 24);
            buffer.writeUInt32LE(1024, localHeaderOffset + 22);
            patchedEntries += 1;
        }
        centralOffset = buffer.indexOf(centralSignature, centralOffset + 4);
    }
    assert.ok(patchedEntries > 0);

    assert.throws(
        () => readBoundedSpreadsheet(buffer),
        /limite de expansão|tamanhos internos inconsistentes/,
    );
});
