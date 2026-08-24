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

// =============================================
// NASCIMENTO POR SAFRA
//
// O pecuarista de corte raramente anota o nascimento individual. Ele conta por
// safra ("é da safra 23") ou por dentição. Quando a planilha exige DD/MM/AAAA,
// todo mundo digita 01/01/2021 só para preencher — e aí idade, GMD e categoria
// nascem errados. Aceitar safra troca precisão falsa por estimativa assumida.
// =============================================

// No Brasil Central a estação de monta vai de novembro a fevereiro, então os
// nascimentos se concentram entre agosto e novembro. Outubro é o meio da curva.
const MES_MEIO_ESTACAO_NASCIMENTO = 9; // 0 = janeiro, 9 = outubro
const ANO_MIN_SAFRA = 1990;
// Teto no ano que vem: safra futura é erro de digitação, não dado. Sem isso
// "safra 87" viraria 2087 em silêncio — e como a idade de uma data futura é
// nula, o animal entrava sem categoria e sem ninguém avisar.
const anoMaximoSafra = () => new Date().getFullYear() + 1;

function safraParaData(ano) {
  if (!Number.isInteger(ano) || ano < ANO_MIN_SAFRA || ano > anoMaximoSafra()) return null;
  return new Date(ano, MES_MEIO_ESTACAO_NASCIMENTO, 1);
}

// Safra de dois dígitos é sempre deste século: ninguém escreve "safra 87"
// querendo 1987 num cadastro de rebanho vivo.
function expandirAnoCurto(ano) {
  return ano >= 100 ? ano : 2000 + ano;
}

/**
 * Lê a coluna de nascimento aceitando data exata OU safra.
 *
 * Aceita: 15/03/2021 · 2021-03-15 · "safra 2023" · "safra 23" · "2023" ·
 *         "safra 2023/2024" (usa o primeiro ano).
 *
 * Devolve { data, estimada, erro }:
 *   data     — Date ou null
 *   estimada — true quando veio de safra (1º de outubro do ano informado)
 *   erro     — true quando havia algo escrito que não deu para entender
 */
export function parseNascimentoImport(valor) {
  const vazio = { data: null, estimada: false, erro: false };
  if (valor === null || valor === undefined || valor === '') return vazio;

  // Data que já veio pronta do Excel.
  if (valor instanceof Date) {
    return { data: parseImportDate(valor), estimada: false, erro: Number.isNaN(valor.getTime()) };
  }

  if (typeof valor === 'number' && Number.isInteger(valor)) {
    // Dentro da faixa de anos plausíveis é safra, não data serial do Excel
    // (o serial 2023 seria 15/07/1905, que não existe em rebanho vivo).
    if (valor >= ANO_MIN_SAFRA && valor <= anoMaximoSafra()) {
      return { data: safraParaData(valor), estimada: true, erro: false };
    }
    const serial = parseImportDate(valor);
    return { data: serial, estimada: false, erro: serial === null };
  }

  const texto = String(valor).trim();
  if (!texto) return vazio;

  // "safra 2023", "safra 23", "safra 2023/2024", "safra 2023-2024"
  const comPalavra = texto.match(/^safra\s*[:.]?\s*(\d{2,4})(?:\s*[/\-]\s*\d{2,4})?$/i);
  if (comPalavra) {
    const ano = expandirAnoCurto(Number(comPalavra[1]));
    const data = safraParaData(ano);
    return { data, estimada: data !== null, erro: data === null };
  }

  // Ano solto de 4 dígitos, ou safra com barra: "2023", "2023/2024".
  // O hífen NÃO entra aqui de propósito: "2023-03" é março de 2023 em ISO, e
  // tratá-lo como safra jogaria o nascimento 7 meses para frente em silêncio.
  const soAno = texto.match(/^(\d{4})(?:\s*\/\s*\d{2,4})?$/);
  if (soAno) {
    const data = safraParaData(Number(soAno[1]));
    return { data, estimada: data !== null, erro: data === null };
  }

  // Só os formatos de data que sabemos ler. O fallback solto do `new Date()`
  // aceitaria "março de 2023" como data exata — precisão inventada é pior que
  // recusar a linha e pedir para o produtor escrever de novo.
  const soData = /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(texto)
    || /^\d{4}-\d{1,2}-\d{1,2}$/.test(texto);
  if (!soData) return { data: null, estimada: false, erro: true };

  const data = parseImportDate(texto);
  return { data, estimada: false, erro: data === null };
}
