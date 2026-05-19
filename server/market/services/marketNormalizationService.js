import { normalizeState, normalizeText, parseMarketReferenceDate } from '../utils/marketParsing.js';
import { ensureMarketRegion } from '../utils/marketRegionResolver.js';
import { validateNormalizedPrice } from './marketValidationService.js';

export const createNormalizedPricesFromCapture = async ({ prisma, source, rawCapture, normalizedRows }) => {
  const created = [];

  for (const row of normalizedRows) {
    const state = normalizeState(row.state);
    const regionName = normalizeText(row.regionName) || state;
    const marketPlaceName = normalizeText(row.marketPlaceName) || regionName;

    const region = await ensureMarketRegion(prisma, {
      state,
      regionName,
      city: normalizeText(row.city),
      marketPlaceName,
    });

    const referenceDate = parseMarketReferenceDate(row.referenceDate);

    const candidate = {
      rawCaptureId: rawCapture.id,
      sourceId: source.id,
      regionId: region?.id || null,
      state,
      marketPlaceName,
      productType: row.productType,
      price: row.price,
      unit: row.unit,
      paymentType: row.paymentType || 'NAO_INFORMADO',
      referenceDate,
      referenceWeightArrobas: row.referenceWeightArrobas ?? null,
      normalizedPayload: row.normalizedPayload || row,
    };

    const validation = await validateNormalizedPrice(prisma, candidate, source);

    const normalized = await prisma.marketNormalizedPrice.create({
      data: {
        rawCaptureId: candidate.rawCaptureId,
        sourceId: candidate.sourceId,
        regionId: candidate.regionId,
        productType: candidate.productType,
        price: candidate.price,
        unit: candidate.unit,
        paymentType: candidate.paymentType,
        referenceDate: candidate.referenceDate || new Date(),
        referenceWeightArrobas: candidate.referenceWeightArrobas,
        confidenceScore: validation.confidenceScore,
        validationStatus: validation.validationStatus,
        validationReasons: validation.validationReasons,
        normalizedPayload: candidate.normalizedPayload,
      },
    });

    created.push(normalized);
  }

  return created;
};
