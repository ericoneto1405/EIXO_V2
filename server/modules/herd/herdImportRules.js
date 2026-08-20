export function normalizeImportText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeTipoRacaImport(value) {
  const normalized = normalizeImportText(value);
  if (normalized === 'pura' || normalized === 'puro') return 'Pura';
  if (normalized === 'mestica' || normalized === 'mestico') return 'Mestiça';
  return null;
}

export function normalizeSexoImport(value) {
  const normalized = normalizeImportText(value);
  if (!normalized) return null;
  if (['macho', 'm', 'masculino', 'male'].includes(normalized)) return 'MACHO';
  if (['femea', 'f', 'feminino', 'female'].includes(normalized)) return 'FEMEA';
  // Tolera erro de digitação/variação não prevista: qualquer texto que comece
  // com M ou F continua sendo reconhecido (ex.: "masculiono", "fem").
  if (normalized.startsWith('m')) return 'MACHO';
  if (normalized.startsWith('f')) return 'FEMEA';
  return null;
}

function buildExactDate(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseImportDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value).trim();
  const brMatch = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const monthIndex = Number(brMatch[2]) - 1;
    let year = Number(brMatch[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return buildExactDate(year, monthIndex, day);
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return buildExactDate(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
