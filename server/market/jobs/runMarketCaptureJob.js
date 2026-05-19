import { PrismaClient } from '@prisma/client';
import { runMarketCapture } from '../services/marketCaptureService.js';

const prisma = new PrismaClient();

const run = async () => {
  const source = await prisma.marketSource.findFirst({
    where: { name: 'EIXO Mercado' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!source) {
    throw new Error('Fonte EIXO Mercado não encontrada. Cadastre a fonte primeiro.');
  }

  const result = await runMarketCapture({
    prisma,
    sourceId: source.id,
    adapterName: 'mock-national',
    actorUserId: null,
  });

  console.log(JSON.stringify(result, null, 2));
};

run()
  .catch((error) => {
    console.error('[market:mock-national] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
