import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REFERENCE_DATE = new Date('2026-05-18T00:00:00.000Z');

const ensureMarketSource = async () => {
  const existing = await prisma.marketSource.findUnique({
    where: { name: 'EIXO Mercado' },
  });

  if (existing) {
    return prisma.marketSource.update({
      where: { id: existing.id },
      data: {
        type: 'MANUAL',
        isActive: true,
      },
    });
  }

  return prisma.marketSource.create({
    data: {
      name: 'EIXO Mercado',
      type: 'MANUAL',
      isActive: true,
    },
  });
};

const ensureMarketRegion = async () => {
  const existing = await prisma.marketRegion.findFirst({
    where: {
      name: { equals: 'Bahia', mode: 'insensitive' },
      state: 'BA',
    },
  });

  if (existing) {
    return prisma.marketRegion.update({
      where: { id: existing.id },
      data: {
        name: 'Bahia',
        state: 'BA',
        marketPlaceName: 'Bahia',
        isActive: true,
      },
    });
  }

  return prisma.marketRegion.create({
    data: {
      name: 'Bahia',
      state: 'BA',
      marketPlaceName: 'Bahia',
      isActive: true,
    },
  });
};

const upsertMarketPriceByIdentity = async ({
  regionId,
  sourceId,
  productType,
  price,
  unit,
  paymentType,
  referenceWeightArrobas = null,
}) => {
  const existing = await prisma.marketPrice.findFirst({
    where: {
      regionId,
      sourceId,
      productType,
      referenceDate: REFERENCE_DATE,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const data = {
    regionId,
    sourceId,
    productType,
    price,
    unit,
    paymentType,
    referenceDate: REFERENCE_DATE,
    referenceWeightArrobas,
    sourceBase: 'Manual',
    status: 'PUBLISHED',
  };

  if (existing) {
    return prisma.marketPrice.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.marketPrice.create({ data });
};

const run = async () => {
  const source = await ensureMarketSource();
  const region = await ensureMarketRegion();

  const boiGordo = await upsertMarketPriceByIdentity({
    regionId: region.id,
    sourceId: source.id,
    productType: 'BOI_GORDO',
    price: 315,
    unit: 'ARROBA',
    paymentType: 'A_VISTA',
  });

  const bezerroDesmama = await upsertMarketPriceByIdentity({
    regionId: region.id,
    sourceId: source.id,
    productType: 'BEZERRO_DESMAMA',
    price: 2900,
    unit: 'CABECA',
    paymentType: 'A_VISTA',
    referenceWeightArrobas: 7,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceId: source.id,
        regionId: region.id,
        boiGordoId: boiGordo.id,
        bezerroDesmamaId: bezerroDesmama.id,
        referenceDate: '2026-05-18',
      },
      null,
      2,
    ),
  );
};

run()
  .catch((error) => {
    console.error('[seed:market] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
