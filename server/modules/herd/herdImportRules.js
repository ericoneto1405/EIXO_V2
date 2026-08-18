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
  if (normalized === 'macho' || normalized === 'm') return 'MACHO';
  if (normalized === 'femea' || normalized === 'f') return 'FEMEA';
  return null;
}
