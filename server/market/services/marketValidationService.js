import { isPositiveNumber, parseMarketReferenceDate, normalizeState } from '../utils/marketParsing.js';

const REPLACEMENT_BY_HEAD = new Set(['BEZERRO_DESMAMA', 'BEZERRO_12M', 'GARROTE', 'BOI_MAGRO']);

const defaultRule = {
  maxAgeDays: 15,
  maxDailyVariationPercent: 18,
};

const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));

const findNearestPrevious = async (prisma, normalized) => {
  if (!normalized.regionId || !normalized.productType || !normalized.referenceDate) return null;
  return prisma.marketPrice.findFirst({
    where: {
      regionId: normalized.regionId,
      productType: normalized.productType,
      unit: normalized.unit,
      paymentType: normalized.paymentType,
      status: 'PUBLISHED',
      referenceDate: { lt: normalized.referenceDate },
    },
    orderBy: [{ referenceDate: 'desc' }, { updatedAt: 'desc' }],
  });
};

export const validateNormalizedPrice = async (prisma, normalized, source) => {
  const reasons = [];
  let score = 100;

  if (!source?.isActive) {
    reasons.push('Fonte inativa');
    score -= 30;
  }

  if (!isPositiveNumber(normalized.price)) {
    reasons.push('Preço inválido');
    score -= 60;
  }

  if (normalized.productType === 'BOI_GORDO' && normalized.unit !== 'ARROBA') {
    reasons.push('Boi gordo deve usar ARROBA');
    score -= 40;
  }

  if (REPLACEMENT_BY_HEAD.has(normalized.productType) && normalized.unit === 'CABECA' && !isPositiveNumber(normalized.referenceWeightArrobas)) {
    reasons.push('Reposição por cabeça exige peso em arrobas');
    score -= 30;
  }

  const refDate = parseMarketReferenceDate(normalized.referenceDate);
  const now = new Date();
  if (!refDate) {
    reasons.push('Data de referência inválida');
    score -= 50;
  } else {
    if (refDate.getTime() > now.getTime()) {
      reasons.push('Data de referência futura');
      score -= 50;
    }
    const ageDays = daysBetween(now, refDate);
    if (ageDays > defaultRule.maxAgeDays) {
      reasons.push(`Data antiga (${ageDays} dias)`);
      score -= 20;
    }
  }

  if (!normalized.regionId || !normalizeState(normalized.state)) {
    reasons.push('Região/UF não resolvida');
    score -= 30;
  }

  if (!normalized.marketPlaceName) {
    reasons.push('Praça genérica');
    score -= 5;
  }

  if (typeof source?.trustScore === 'number' && source.trustScore < 70) {
    reasons.push('Fonte com confiança reduzida');
    score -= 12;
  }

  const previous = await findNearestPrevious(prisma, {
    ...normalized,
    referenceDate: refDate,
  });
  if (previous && isPositiveNumber(previous.price) && isPositiveNumber(normalized.price)) {
    const prev = Number(previous.price);
    const curr = Number(normalized.price);
    const variation = Math.abs(((curr - prev) / prev) * 100);
    if (variation > defaultRule.maxDailyVariationPercent) {
      reasons.push(`Variação alta (${variation.toFixed(1)}%)`);
      score -= 25;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let validationStatus = 'VALID';
  if (reasons.some((r) => r.includes('inválida') || r.includes('futura') || r.includes('inativo'))) {
    validationStatus = 'REJECTED';
  } else if (score < (source?.autoPublishMinConfidence ?? 85) || reasons.length > 0) {
    validationStatus = 'NEEDS_REVIEW';
  }

  return {
    confidenceScore: score,
    validationStatus,
    validationReasons: reasons,
  };
};
