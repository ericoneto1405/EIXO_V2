export const calculateTrendPercent = (currentValue, previousValue) => {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
};

export const resolveMarketTrends = async (prisma, { regionId, referenceDate, fatPrice, replacementPrice }) => {
  if (!regionId || !referenceDate) {
    return {
      fatCattleTrendPercent: null,
      replacementAnimalTrendPercent: null,
      replacementCostTrendArrobas: null,
    };
  }

  const [previousFat, previousReplacement] = await Promise.all([
    prisma.marketPrice.findFirst({
      where: {
        regionId,
        productType: 'BOI_GORDO',
        status: 'PUBLISHED',
        referenceDate: { lt: referenceDate },
      },
      orderBy: [{ referenceDate: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.marketPrice.findFirst({
      where: {
        regionId,
        productType: 'BEZERRO_DESMAMA',
        status: 'PUBLISHED',
        referenceDate: { lt: referenceDate },
      },
      orderBy: [{ referenceDate: 'desc' }, { updatedAt: 'desc' }],
    }),
  ]);

  const fatCattleTrendPercent = calculateTrendPercent(fatPrice, previousFat?.price ?? null);
  const replacementAnimalTrendPercent = calculateTrendPercent(replacementPrice, previousReplacement?.price ?? null);

  let replacementCostTrendArrobas = null;
  if (previousFat?.price && previousReplacement?.price) {
    const prevRatio = Number(previousReplacement.price) / Number(previousFat.price);
    const currRatio = Number(replacementPrice) / Number(fatPrice);
    if (Number.isFinite(prevRatio) && Number.isFinite(currRatio)) {
      replacementCostTrendArrobas = currRatio - prevRatio;
    }
  }

  return {
    fatCattleTrendPercent,
    replacementAnimalTrendPercent,
    replacementCostTrendArrobas,
  };
};
