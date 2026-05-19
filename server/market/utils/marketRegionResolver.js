import { normalizeState, normalizeText } from './marketParsing.js';

const MACRO_BY_STATE = {
  AC: 'NORTE', AL: 'NORDESTE', AP: 'NORTE', AM: 'NORTE', BA: 'NORDESTE', CE: 'NORDESTE', DF: 'CENTRO_OESTE',
  ES: 'SUDESTE', GO: 'CENTRO_OESTE', MA: 'NORDESTE', MT: 'CENTRO_OESTE', MS: 'CENTRO_OESTE', MG: 'SUDESTE',
  PA: 'NORTE', PB: 'NORDESTE', PR: 'SUL', PE: 'NORDESTE', PI: 'NORDESTE', RJ: 'SUDESTE', RN: 'NORDESTE',
  RS: 'SUL', RO: 'NORTE', RR: 'NORTE', SC: 'SUL', SP: 'SUDESTE', SE: 'NORDESTE', TO: 'NORTE',
};

export const macroRegionFromState = (state) => {
  const uf = normalizeState(state);
  if (!uf) return null;
  return MACRO_BY_STATE[uf] || null;
};

export const ensureMarketRegion = async (prisma, { state, regionName, city = null, marketPlaceName = null }) => {
  const uf = normalizeState(state);
  if (!uf) return null;
  const name = normalizeText(regionName) || uf;
  const cityName = normalizeText(city);

  let region = null;
  if (cityName) {
    region = await prisma.marketRegion.findFirst({
      where: {
        state: uf,
        city: { equals: cityName, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  if (!region) {
    region = await prisma.marketRegion.findFirst({
      where: {
        state: uf,
        name: { equals: name, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  const payload = {
    name,
    state: uf,
    city: cityName,
    marketPlaceName: normalizeText(marketPlaceName) || name,
    macroRegion: macroRegionFromState(uf),
    isActive: true,
  };

  if (region) {
    return prisma.marketRegion.update({ where: { id: region.id }, data: payload });
  }

  return prisma.marketRegion.create({ data: payload });
};
