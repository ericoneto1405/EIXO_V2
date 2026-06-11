import { PrismaClient } from '@prisma/client';
import { runMarketCapture } from '../services/marketCaptureService.js';

const prisma = new PrismaClient();

const ADAPTER_NAME = process.argv[2] || 'mock-national';

const VALID_ADAPTERS = ['mock-national', 'manual-import', 'noticias-agricolas'];

if (!VALID_ADAPTERS.includes(ADAPTER_NAME)) {
  console.error(`Adapter inválido: ${ADAPTER_NAME}`);
  console.error(`Adapters válidos: ${VALID_ADAPTERS.join(', ')}`);
  process.exitCode = 1;
}

const run = async () => {
  const source = await prisma.marketSource.findFirst({
    where: { name: 'EIXO Mercado' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!source) {
    throw new Error('Fonte EIXO Mercado não encontrada. Cadastre a fonte primeiro.');
  }

  console.log(`[market] Executando adapter: ${ADAPTER_NAME}`);

  const result = await runMarketCapture({
    prisma,
    sourceId: source.id,
    adapterName: ADAPTER_NAME,
    actorUserId: null,
  });

  console.log(JSON.stringify(result, null, 2));
};

if (!process.exitCode) {
  run()
    .catch((error) => {
      console.error(`[market:${ADAPTER_NAME}] failed`, error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
