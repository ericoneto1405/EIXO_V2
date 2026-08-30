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
// NASCIMENTO
//
// O pecuarista de corte às vezes não anota o nascimento individual, só o mês
// (ou nem isso). Aceitar mês/ano troca precisão falsa por estimativa assumida
// — mas exige pelo menos o mês: não aceitamos mais "só o ano" (safra), porque
// isso jogava a data até 12 meses longe da real. Ano isolado hoje é erro.
// =============================================

const ANO_MIN_PLAUSIVEL = 1990;
// Teto no ano que vem: serve só para reconhecer um número de 4 dígitos como
// "parece um ano" e recusar (em vez de ler como serial do Excel). Sem isso
// "2023" batido sem querer no Excel virava uma data de 1905 em silêncio.
const anoMaximoPlausivel = () => new Date().getFullYear() + 1;

/**
 * Lê a coluna de nascimento aceitando data exata ou mês/ano (dia assumido 15).
 *
 * Aceita: 15/03/2021 · 2021-03-15 · 03/2024 (mês/ano, sem dia).
 * Recusa: só o ano ("2023") e qualquer variação de "safra" — pede a data
 * completa ou pelo menos o mês.
 *
 * Devolve { data, estimada, erro }:
 *   data     — Date ou null
 *   estimada — true quando veio só mês/ano (dia 15 assumido)
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
    // Número na faixa de anos plausíveis não é aceito (não existe mais "só o
    // ano") e também não é serial do Excel de verdade — é erro de digitação.
    if (valor >= ANO_MIN_PLAUSIVEL && valor <= anoMaximoPlausivel()) {
      return { data: null, estimada: false, erro: true };
    }
    const serial = parseImportDate(valor);
    return { data: serial, estimada: false, erro: serial === null };
  }

  const texto = String(valor).trim();
  if (!texto) return vazio;

  // "03/24", "3/2024", "03-2024": só mês e ano, sem dia — assume dia 15
  // (meio do mês), igual à pesagem. O hífen ISO ("2023-03") não cai aqui: o
  // primeiro grupo aceita no máximo 2 dígitos, e o ano tem 4.
  const mesAno = texto.match(/^(\d{1,2})[/\-.](\d{2,4})$/);
  if (mesAno) {
    const mes = Number(mesAno[1]);
    let ano = Number(mesAno[2]);
    if (ano < 100) ano += ano < 50 ? 2000 : 1900;
    if (mes < 1 || mes > 12) return { data: null, estimada: false, erro: true };
    const data = buildExactDate(ano, mes - 1, 15);
    return { data, estimada: data !== null, erro: data === null };
  }

  // Só os formatos de data que sabemos ler. O fallback solto do `new Date()`
  // aceitaria "março de 2023" como data exata — precisão inventada é pior que
  // recusar a linha e pedir para o produtor escrever de novo. Ano solto
  // ("2023") e "safra ..." caem aqui e viram erro, de propósito.
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
// contra até 30 se assumisse o dia 1. Mesma ideia usada no nascimento
// (mês/ano também vira dia 15) — aqui não tem estação de monta envolvida,
// é só o meio do próprio mês informado.
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
