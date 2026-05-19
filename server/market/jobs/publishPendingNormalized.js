import { PrismaClient } from '@prisma/client';
import { publishNormalizedPrice } from '../services/marketPublishService.js';

const prisma = new PrismaClient();

const run = async () => {
  const pending = await prisma.marketNormalizedPrice.findMany({
    where: {
      status: 'PENDING',
      validationStatus: 'VALID',
    },
    orderBy: [{ referenceDate: 'desc' }, { createdAt: 'asc' }],
    take: 500,
  });

  let published = 0;
  for (const item of pending) {
    await publishNormalizedPrice(prisma, item.id, null);
    published += 1;
  }

  console.log(JSON.stringify({ ok: true, pending: pending.length, published }, null, 2));
};

run()
  .catch((error) => {
    console.error('[market:publish-pending] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
