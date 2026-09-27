import * as XLSX from 'xlsx';
import { inflateRawSync } from 'node:zlib';

export const MAX_IMPORT_ANIMALS = 1000;
export const MAX_IMPORT_COLUMNS = 32;
export const MAX_IMPORT_HEADER_ROWS = 5;
export const MAX_IMPORT_SHEET_ROWS = MAX_IMPORT_ANIMALS + MAX_IMPORT_HEADER_ROWS;
export const MAX_IMPORT_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_ZIP_ENTRIES = 256;

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;

function inspectZipBudget(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        return;
    }

    const minimumEocdSize = 22;
    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocdOffset = -1;
    for (let offset = buffer.length - minimumEocdSize; offset >= searchStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset < 0) throw new Error('Arquivo compactado inválido.');

    const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
    const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
    const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralSize = buffer.readUInt32LE(eocdOffset + 12);
    const centralOffset = buffer.readUInt32LE(eocdOffset + 16);

    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
        throw new Error('Planilhas compactadas em vários volumes não são permitidas.');
    }
    if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
        throw new Error('Planilhas ZIP64 não são permitidas.');
    }
    if (totalEntries > MAX_IMPORT_ZIP_ENTRIES || centralOffset + centralSize > eocdOffset) {
        throw new Error('Estrutura compactada fora do limite permitido.');
    }

    let offset = centralOffset;
    let totalUncompressed = 0;
    for (let index = 0; index < totalEntries; index += 1) {
        if (offset + 46 > eocdOffset || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
            throw new Error('Estrutura compactada inválida.');
        }
        const flags = buffer.readUInt16LE(offset + 8);
        const compressionMethod = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);

        if ((flags & 0x1) !== 0) throw new Error('Planilhas protegidas por senha não são permitidas.');
        if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
            throw new Error('Planilhas ZIP64 não são permitidas.');
        }

        if (localHeaderOffset + 30 > centralOffset
            || buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_SIGNATURE) {
            throw new Error('Estrutura compactada inválida.');
        }
        const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
        const localCompressionMethod = buffer.readUInt16LE(localHeaderOffset + 8);
        const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
        const dataEnd = dataOffset + compressedSize;
        if (localFlags !== flags || localCompressionMethod !== compressionMethod || dataEnd > centralOffset) {
            throw new Error('Estrutura compactada inválida.');
        }

        const centralName = buffer.subarray(offset + 46, offset + 46 + fileNameLength);
        const localName = buffer.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localFileNameLength);
        if (!centralName.equals(localName)) throw new Error('Estrutura compactada inválida.');

        const compressedData = buffer.subarray(dataOffset, dataEnd);
        let actualUncompressedSize;
        if (compressionMethod === 0) {
            actualUncompressedSize = compressedData.length;
        } else if (compressionMethod === 8) {
            try {
                actualUncompressedSize = inflateRawSync(compressedData, {
                    maxOutputLength: Math.max(1, MAX_IMPORT_UNCOMPRESSED_BYTES - totalUncompressed + 1),
                }).length;
            } catch {
                throw new Error('A planilha compactada ultrapassa o limite de expansão permitido ou está corrompida.');
            }
        } else {
            throw new Error('Método de compactação não permitido.');
        }

        if (actualUncompressedSize !== uncompressedSize) {
            throw new Error('A planilha compactada possui tamanhos internos inconsistentes.');
        }

        totalUncompressed += actualUncompressedSize;
        if (totalUncompressed > MAX_IMPORT_UNCOMPRESSED_BYTES) {
            throw new Error('A planilha compactada ultrapassa o limite de expansão permitido.');
        }

        offset += 46 + fileNameLength + extraLength + commentLength;
    }

    if (offset !== centralOffset + centralSize) {
        throw new Error('Estrutura compactada inválida.');
    }
}

export function readBoundedSpreadsheet(buffer) {
    inspectZipBudget(buffer);
    const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellNF: true,
        sheetRows: MAX_IMPORT_SHEET_ROWS + 1,
    });
    const sheetName = workbook.SheetNames.find((name) => name.toLowerCase() === 'dados')
        || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error('Planilha vazia ou sem abas.');

    const sheetRef = sheet['!fullref'] || sheet['!ref'];
    if (!sheetRef) return { workbook, sheet, rows: [] };

    const sheetRange = XLSX.utils.decode_range(sheetRef);
    const totalRows = sheetRange.e.r - sheetRange.s.r + 1;
    const totalColumns = sheetRange.e.c - sheetRange.s.c + 1;
    if (totalRows > MAX_IMPORT_SHEET_ROWS) {
        throw new Error(`A planilha ultrapassa o limite físico de ${MAX_IMPORT_SHEET_ROWS} linhas.`);
    }
    if (totalColumns > MAX_IMPORT_COLUMNS) {
        throw new Error(`A planilha ultrapassa o limite de ${MAX_IMPORT_COLUMNS} colunas.`);
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: false,
        range: XLSX.utils.encode_range(sheetRange),
    });
    return { workbook, sheet, rows };
}
