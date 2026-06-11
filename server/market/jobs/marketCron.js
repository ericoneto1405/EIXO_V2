import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runMarketCapture } from '../services/marketCaptureService.js';

const ADAPTER_NAME = process.env.MARKET_CRON_ADAPTER || 'noticias-agricolas';

let prisma = null;

const getPrisma = () => {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
};

const runCapture = async () => {
  const p = getPrisma();
  try {
    const source = await p.marketSource.findFirst({
      where: { name: 'EIXO Mercado' },
      orderBy: { updatedAt: 'desc' },
    });

    if (!source) {
      console.warn('[market-cron] Fonte EIXO Mercado não encontrada. Pulando execução.');
      return;
    }

    if (!source.isActive) {
      console.warn('[market-cron] Fonte EIXO Mercado está inativa. Pulando execução.');
      return;
    }

    console.log(`[market-cron] Iniciando captura: ${ADAPTER_NAME} em ${new Date().toISOString()}`);

    const result = await runMarketCapture({
      prisma: p,
      sourceId: source.id,
      adapterName: ADAPTER_NAME,
      actorUserId: null,
    });

    const { counters } = result;
    console.log(
      `[market-cron] Captura concluída: ${counters.captures} capturas, ` +
      `${counters.normalized} normalizados, ${counters.autoPublished} publicados, ` +
      `${counters.reviewQueue} na fila, ${counters.rejected} rejeitados`
    );
  } catch (error) {
    console.error('[market-cron] Erro na captura:', error.message || error);
  }
};

export const startMarketCron = () => {
  // Segunda a sexta, às 18h00 (horário de Brasília)
  // CEPEA publica o indicador até 18h
  cron.schedule('0 18 * * 1-5', () => {
    runCapture();
  }, {
    timezone: 'America/Sao_Paulo',
  });

  console.log('[market-cron] Agendamento iniciado: captura diária (seg-sex 18h BRT)');
};

export const stopMarketCron = () => {
  if (prisma) {
    prisma.$disconnect();
    prisma = null;
  }
};

export { runCapture };
