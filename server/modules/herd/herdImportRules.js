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
  // Tolera erro de digitação ("masculiono", "fem", "macha"), mas exige um começo
  // reconhecível. Aceitar qualquer palavra com M ou F fazia "Mestiça" virar MACHO:
  // uma coluna desalinhada transformava o rebanho inteiro em macho, em silêncio.
  if (['mac', 'mas', 'mal'].some((prefixo) => normalized.startsWith(prefixo))) return 'MACHO';
  if (['fem', 'fea'].some((prefixo) => normalized.startsWith(prefixo))) return 'FEMEA';
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

// Converte o serial de data do Excel (dias desde 30/12/1899) num Date real.
function serialExcelParaData(valorNumerico) {
  if (!Number.isFinite(valorNumerico)) return null;
  const excelEpoch = new Date(1899, 11, 30);
  const date = new Date(excelEpoch.getTime() + valorNumerico * 86400000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseImportDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    return serialExcelParaData(value);
  }

  const text = String(value).trim();

  // Número puro de 5+ dígitos, sem barra nem traço: a célula perdeu a
  // formatação de data no Excel (comum ao colar de outra planilha) e o
  // arquivo exporta o serial ("45366") em vez do texto "15/03/2024". Sem
  // isso, new Date("45366") lia como se fosse o ano 45366 e a linha virava
  // "data no futuro" — um erro que não tem nada a ver com o que o cliente fez.
  if (/^\d{5,}$/.test(text)) {
    return serialExcelParaData(Number(text));
  }

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

  // Só os formatos acima. O fallback solto do `new Date()` aceitava "03/24"
  // (mês/ano, sem dia) como se fosse 24/03/2001 — a linha entrava com uma
  // data errada e ninguém percebia. Recusar e pedir para corrigir é melhor
  // que inventar um dia e um século que o cliente nunca digitou.
  return null;
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
  // O terceiro padrão (5+ dígitos sem separador) é o serial do Excel quando a
  // célula perdeu a formatação de data — mesma situação tratada em parseImportDate.
  const soData = /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(texto)
    || /^\d{4}-\d{1,2}-\d{1,2}$/.test(texto)
    || /^\d{5,}$/.test(texto);
  if (!soData) return { data: null, estimada: false, erro: true };

  const data = parseImportDate(texto);
  return { data, estimada: false, erro: data === null };
}

// =============================================
// PESAGEM SEM O DIA
//
// O produtor às vezes só lembra o mês da pesagem ("foi em março"). Em vez de
// recusar a linha, assume o dia 15 (meio do mês): erra no máximo ±15 dias,
// contra até 30 se assumisse o dia 1. Diferente da safra do nascimento, aqui
// não tem estação que justifique um mês "mais provável" — é só o meio do
// próprio mês informado.
//
// Devolve { data, diaEstimado, erro }:
//   diaEstimado — true quando o dia veio assumido (mês/ano, sem dia)
// =============================================
export function parsePesagemImport(valor) {
  const vazio = { data: null, diaEstimado: false, erro: false };
  if (valor === null || valor === undefined || valor === '') return vazio;

  const texto = String(valor).trim();
  if (!texto) return vazio;

  // "03/24", "3/24", "03/2024", "03-2024": só mês e ano, um separador só.
  const mesAno = texto.match(/^(\d{1,2})[/\-.](\d{2,4})$/);
  if (mesAno) {
    const mes = Number(mesAno[1]);
    let ano = Number(mesAno[2]);
    if (ano < 100) ano += ano < 50 ? 2000 : 1900;
    if (mes < 1 || mes > 12) return { data: null, diaEstimado: false, erro: true };
    const data = buildExactDate(ano, mes - 1, 15);
    return { data, diaEstimado: data !== null, erro: data === null };
  }

  const data = parseImportDate(valor);
  return { data, diaEstimado: false, erro: data === null };
}
