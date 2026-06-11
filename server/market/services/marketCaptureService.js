import { MockNationalAdapter } from '../adapters/mockNationalAdapter.js';
import { ManualImportAdapter } from '../adapters/manualImportAdapter.js';
import { NoticiasAgricolasAdapter } from '../adapters/noticiasAgricolasAdapter.js';
import { createNormalizedPricesFromCapture } from './marketNormalizationService.js';
import { publishNormalizedPrice } from './marketPublishService.js';

const ADAPTERS = {
  'mock-national': () => new MockNationalAdapter(),
  'manual-import': () => new ManualImportAdapter(),
  'noticias-agricolas': () => new NoticiasAgricolasAdapter(),
};

export const getAdapterByName = (adapterName) => {
  const factory = ADAPTERS[adapterName];
  if (!factory) {
    throw new Error(`Adapter não encontrado: ${adapterName}`);
  }
  return factory();
};

export const runMarketCapture = async ({ prisma, sourceId, adapterName, actorUserId = null }) => {
  const source = await prisma.marketSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error('Fonte não encontrada.');
  if (!source.isActive) throw new Error('Fonte inativa.');

  const adapter = getAdapterByName(adapterName);

  const job = await prisma.marketPublishJob.create({
    data: {
      status: 'RUNNING',
      sourceId,
      startedAt: new Date(),
      summary: {
        adapter: adapterName,
        sourceName: source.name,
      },
    },
  });

  try {
    const rawRows = await adapter.fetch();
    const counters = {
      captures: 0,
      normalized: 0,
      autoPublished: 0,
      reviewQueue: 0,
      rejected: 0,
    };

    for (const rawRow of rawRows) {
      const rawCapture = await prisma.marketRawCapture.create({
        data: {
          sourceId,
          capturedAt: new Date(),
          referenceDate: rawRow.referenceDate ? new Date(`${rawRow.referenceDate}T00:00:00.000Z`) : null,
          rawTitle: rawRow.rawTitle || null,
          rawText: rawRow.rawText || null,
          rawUrl: rawRow.rawUrl || null,
          rawPayload: rawRow.rawPayload || null,
          captureMethod: 'MANUAL_IMPORT',
          status: 'CAPTURED',
        },
      });
      counters.captures += 1;

      const normalizedRows = await adapter.normalize(rawRow);
      const normalizedCreated = await createNormalizedPricesFromCapture({
        prisma,
        source,
        rawCapture,
        normalizedRows,
      });

      counters.normalized += normalizedCreated.length;

      await prisma.marketRawCapture.update({
        where: { id: rawCapture.id },
        data: { status: 'NORMALIZED' },
      });

      for (const normalized of normalizedCreated) {
        const autoPublishThreshold = source.autoPublishMinConfidence ?? 85;
        if (normalized.validationStatus === 'VALID' && normalized.confidenceScore >= autoPublishThreshold && !source.requiresReview) {
          await publishNormalizedPrice(prisma, normalized.id, actorUserId);
          counters.autoPublished += 1;
        } else if (normalized.validationStatus === 'REJECTED') {
          counters.rejected += 1;
        } else {
          counters.reviewQueue += 1;
        }
      }
    }

    const doneJob = await prisma.marketPublishJob.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
        summary: {
          adapter: adapterName,
          sourceName: source.name,
          ...counters,
        },
      },
    });

    return { job: doneJob, counters };
  } catch (error) {
    await prisma.marketPublishJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: error?.message || 'Erro no pipeline de mercado.',
      },
    });
    throw error;
  }
};
