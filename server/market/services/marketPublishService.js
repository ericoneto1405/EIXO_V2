import { parseMarketReferenceDate } from '../utils/marketParsing.js';

const toDate = (value) => {
  if (value instanceof Date) return value;
  return parseMarketReferenceDate(value);
};

export const publishNormalizedPrice = async (prisma, normalizedPriceId, actorUserId = null) => {
  const normalized = await prisma.marketNormalizedPrice.findUnique({ where: { id: normalizedPriceId } });
  if (!normalized) {
    throw new Error('Cotação normalizada não encontrada.');
  }

  const referenceDate = toDate(normalized.referenceDate);
  if (!referenceDate) {
    throw new Error('Data de referência inválida na cotação normalizada.');
  }

  const existing = await prisma.marketPrice.findFirst({
    where: {
      sourceId: normalized.sourceId,
      regionId: normalized.regionId,
      productType: normalized.productType,
      referenceDate,
      unit: normalized.unit,
      paymentType: normalized.paymentType,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const payload = {
    sourceId: normalized.sourceId,
    regionId: normalized.regionId,
    productType: normalized.productType,
    price: normalized.price,
    unit: normalized.unit,
    paymentType: normalized.paymentType,
    referenceDate,
    referenceWeightArrobas: normalized.referenceWeightArrobas,
    sourceBase: 'Pipeline',
    status: 'PUBLISHED',
    notes: 'Publicado automaticamente pelo pipeline EIXO Mercado Nacional',
    createdByUserId: actorUserId,
  };

  const marketPrice = existing
    ? await prisma.marketPrice.update({ where: { id: existing.id }, data: payload })
    : await prisma.marketPrice.create({ data: payload });

  await prisma.marketNormalizedPrice.update({
    where: { id: normalizedPriceId },
    data: { status: 'PUBLISHED', validationStatus: 'VALID' },
  });

  return marketPrice;
};

export const rejectNormalizedPrice = async (prisma, normalizedPriceId, reviewerNotes = null) => {
  const normalized = await prisma.marketNormalizedPrice.findUnique({ where: { id: normalizedPriceId } });
  if (!normalized) throw new Error('Cotação normalizada não encontrada.');
  return prisma.marketNormalizedPrice.update({
    where: { id: normalizedPriceId },
    data: {
      status: 'REJECTED',
      validationStatus: 'REJECTED',
      reviewerNotes: reviewerNotes || normalized.reviewerNotes || null,
    },
  });
};
