import { UUID_REGEX } from '../config/constants.js';
import { requireAuth, requireMarketAdmin } from '../middlewares/requireAuth.js';
import { parseNumber } from '../utils/formatters.js';
import { runMarketCapture } from '../../market/services/marketCaptureService.js';
import { publishNormalizedPrice, rejectNormalizedPrice } from '../../market/services/marketPublishService.js';
import {
    MARKET_ALLOWED_PRODUCT_TYPES, MARKET_ALLOWED_UNITS, MARKET_ALLOWED_SOURCE_TYPES,
    MARKET_ALLOWED_PAYMENT_TYPES, MARKET_ALLOWED_STATUSES,
    hasMarketModelDelegates, hasMarketPipelineDelegates,
    serializeMarketSource, serializeMarketRegion, serializeMarketPrice,
    serializeMarketRawCapture, serializeMarketNormalizedPrice,
    normalizeMarketOptionalText, normalizeMarketState, parseMarketReferenceDate,
    isValidMarketDateInput,
} from './marketHelpers.js';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export function registerMarketRoutes(app) {
    app.get('/market/sources', requireAuth, requireMarketAdmin, async (_req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const sources = await prisma.marketSource.findMany({
                orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
            });
            return res.json({ sources: sources.map(serializeMarketSource) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar fontes de mercado.' });
        }
    });

    app.post('/market/sources', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const name = normalizeMarketOptionalText(req.body?.name);
            const type = String(req.body?.type || '').trim().toUpperCase();
            const url = normalizeMarketOptionalText(req.body?.url);
            const isActive = req.body?.isActive !== false;
            const priority = Number.isFinite(Number(req.body?.priority)) ? Math.max(1, Math.round(Number(req.body?.priority))) : 100;
            const trustScore = Number.isFinite(Number(req.body?.trustScore)) ? Math.min(100, Math.max(0, Math.round(Number(req.body?.trustScore)))) : 70;
            const autoPublishMinConfidence = Number.isFinite(Number(req.body?.autoPublishMinConfidence))
                ? Math.min(100, Math.max(0, Math.round(Number(req.body?.autoPublishMinConfidence))))
                : 85;
            const requiresReview = req.body?.requiresReview !== undefined ? Boolean(req.body?.requiresReview) : true;
            const isAutomationEnabled = req.body?.isAutomationEnabled !== undefined ? Boolean(req.body?.isAutomationEnabled) : false;
            if (!name) return res.status(400).json({ message: 'Nome da fonte é obrigatório.' });
            if (!MARKET_ALLOWED_SOURCE_TYPES.has(type)) return res.status(400).json({ message: 'Tipo de fonte inválido.' });
            const created = await prisma.marketSource.create({
                data: { name, type, url, isActive, priority, trustScore, autoPublishMinConfidence, requiresReview, isAutomationEnabled },
            });
            return res.status(201).json({ source: serializeMarketSource(created) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao criar fonte de mercado.' });
        }
    });

    app.patch('/market/sources/:id', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const sourceId = String(req.params.id || '');
            if (!UUID_REGEX.test(sourceId)) return res.status(400).json({ message: 'Fonte inválida.' });
            const data = {};
            if (req.body?.name !== undefined) {
                const name = normalizeMarketOptionalText(req.body?.name);
                if (!name) return res.status(400).json({ message: 'Nome da fonte inválido.' });
                data.name = name;
            }
            if (req.body?.type !== undefined) {
                const type = String(req.body?.type || '').trim().toUpperCase();
                if (!MARKET_ALLOWED_SOURCE_TYPES.has(type)) return res.status(400).json({ message: 'Tipo de fonte inválido.' });
                data.type = type;
            }
            if (req.body?.url !== undefined) data.url = normalizeMarketOptionalText(req.body?.url);
            if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body?.isActive);
            if (req.body?.priority !== undefined) data.priority = Math.max(1, Math.round(Number(req.body?.priority)));
            if (req.body?.trustScore !== undefined) data.trustScore = Math.min(100, Math.max(0, Math.round(Number(req.body?.trustScore))));
            if (req.body?.autoPublishMinConfidence !== undefined) data.autoPublishMinConfidence = Math.min(100, Math.max(0, Math.round(Number(req.body?.autoPublishMinConfidence))));
            if (req.body?.requiresReview !== undefined) data.requiresReview = Boolean(req.body?.requiresReview);
            if (req.body?.isAutomationEnabled !== undefined) data.isAutomationEnabled = Boolean(req.body?.isAutomationEnabled);
            const updated = await prisma.marketSource.update({ where: { id: sourceId }, data });
            return res.json({ source: serializeMarketSource(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar fonte de mercado.' });
        }
    });

    app.get('/market/regions', requireAuth, requireMarketAdmin, async (_req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const regions = await prisma.marketRegion.findMany({
                orderBy: [{ isActive: 'desc' }, { state: 'asc' }, { name: 'asc' }],
            });
            return res.json({ regions: regions.map(serializeMarketRegion) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar regiões de mercado.' });
        }
    });

    app.post('/market/regions', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const name = normalizeMarketOptionalText(req.body?.name);
            const state = normalizeMarketState(req.body?.state);
            const city = normalizeMarketOptionalText(req.body?.city);
            const marketPlaceName = normalizeMarketOptionalText(req.body?.marketPlaceName);
            const sourceRegionName = normalizeMarketOptionalText(req.body?.sourceRegionName);
            const macroRegion = normalizeMarketOptionalText(req.body?.macroRegion);
            const isActive = req.body?.isActive !== false;
            if (!name) return res.status(400).json({ message: 'Nome da região é obrigatório.' });
            if (!state || state.length !== 2) return res.status(400).json({ message: 'UF inválida.' });
            if (macroRegion && !['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'].includes(macroRegion)) {
                return res.status(400).json({ message: 'Macro região inválida.' });
            }
            const created = await prisma.marketRegion.create({
                data: { name, state, city, marketPlaceName, sourceRegionName, macroRegion, isActive },
            });
            return res.status(201).json({ region: serializeMarketRegion(created) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao criar região de mercado.' });
        }
    });

    app.patch('/market/regions/:id', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const regionId = String(req.params.id || '');
            if (!UUID_REGEX.test(regionId)) return res.status(400).json({ message: 'Região inválida.' });
            const data = {};
            if (req.body?.name !== undefined) {
                const name = normalizeMarketOptionalText(req.body?.name);
                if (!name) return res.status(400).json({ message: 'Nome da região inválido.' });
                data.name = name;
            }
            if (req.body?.state !== undefined) {
                const state = normalizeMarketState(req.body?.state);
                if (!state || state.length !== 2) return res.status(400).json({ message: 'UF inválida.' });
                data.state = state;
            }
            if (req.body?.city !== undefined) data.city = normalizeMarketOptionalText(req.body?.city);
            if (req.body?.marketPlaceName !== undefined) data.marketPlaceName = normalizeMarketOptionalText(req.body?.marketPlaceName);
            if (req.body?.sourceRegionName !== undefined) data.sourceRegionName = normalizeMarketOptionalText(req.body?.sourceRegionName);
            if (req.body?.macroRegion !== undefined) {
                const macroRegion = normalizeMarketOptionalText(req.body?.macroRegion);
                if (macroRegion && !['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'].includes(macroRegion)) {
                    return res.status(400).json({ message: 'Macro região inválida.' });
                }
                data.macroRegion = macroRegion;
            }
            if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body?.isActive);
            const updated = await prisma.marketRegion.update({ where: { id: regionId }, data });
            return res.json({ region: serializeMarketRegion(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar região de mercado.' });
        }
    });

    app.get('/market/prices', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const where = {};
            const state = normalizeMarketState(req.query?.state);
            const regionId = normalizeMarketOptionalText(req.query?.regionId);
            const productType = String(req.query?.productType || '').trim().toUpperCase();
            const sourceId = normalizeMarketOptionalText(req.query?.sourceId);
            const status = String(req.query?.status || '').trim().toUpperCase();
            const dateFrom = normalizeMarketOptionalText(req.query?.dateFrom);
            const dateTo = normalizeMarketOptionalText(req.query?.dateTo);

            if (regionId) where.regionId = regionId;
            if (state) where.region = { state };
            if (productType && MARKET_ALLOWED_PRODUCT_TYPES.has(productType)) where.productType = productType;
            if (sourceId) where.sourceId = sourceId;
            if (status && MARKET_ALLOWED_STATUSES.has(status)) where.status = status;
            if (dateFrom || dateTo) {
                const dateFilter = {};
                if (dateFrom && isValidMarketDateInput(dateFrom)) dateFilter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
                if (dateTo && isValidMarketDateInput(dateTo)) dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);
                if (Object.keys(dateFilter).length) where.referenceDate = dateFilter;
            }

            const prices = await prisma.marketPrice.findMany({
                where,
                include: { region: true, source: true },
                orderBy: [{ referenceDate: 'desc' }, { updatedAt: 'desc' }],
                take: 300,
            });
            return res.json({ prices: prices.map(serializeMarketPrice) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar cotações de mercado.' });
        }
    });

    app.post('/market/prices', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const regionId = normalizeMarketOptionalText(req.body?.regionId);
            const sourceId = normalizeMarketOptionalText(req.body?.sourceId);
            const productType = String(req.body?.productType || '').trim().toUpperCase();
            const unit = String(req.body?.unit || '').trim().toUpperCase();
            const paymentType = String(req.body?.paymentType || 'NAO_INFORMADO').trim().toUpperCase();
            const status = String(req.body?.status || 'DRAFT').trim().toUpperCase();
            const referenceDateInput = normalizeMarketOptionalText(req.body?.referenceDate);
            const referenceDate = parseMarketReferenceDate(referenceDateInput);
            const price = parseNumber(req.body?.price);
            const referenceWeightArrobas = req.body?.referenceWeightArrobas === undefined ? null : parseNumber(req.body?.referenceWeightArrobas);
            const sourceBase = normalizeMarketOptionalText(req.body?.sourceBase);
            const notes = normalizeMarketOptionalText(req.body?.notes);

            if (!regionId || !UUID_REGEX.test(regionId)) return res.status(400).json({ message: 'Região é obrigatória.' });
            if (!sourceId || !UUID_REGEX.test(sourceId)) return res.status(400).json({ message: 'Fonte é obrigatória.' });
            if (!MARKET_ALLOWED_PRODUCT_TYPES.has(productType)) return res.status(400).json({ message: 'Produto inválido.' });
            if (!MARKET_ALLOWED_UNITS.has(unit)) return res.status(400).json({ message: 'Unidade inválida.' });
            if (!MARKET_ALLOWED_PAYMENT_TYPES.has(paymentType)) return res.status(400).json({ message: 'Tipo de pagamento inválido.' });
            if (!MARKET_ALLOWED_STATUSES.has(status)) return res.status(400).json({ message: 'Status inválido.' });
            if (!referenceDate) return res.status(400).json({ message: 'Data de referência inválida.' });
            if (referenceDate.getTime() > Date.now()) return res.status(400).json({ message: 'Data de referência não pode ser futura.' });
            if (!price || price <= 0) return res.status(400).json({ message: 'Preço deve ser maior que zero.' });
            if (referenceWeightArrobas !== null && referenceWeightArrobas <= 0) return res.status(400).json({ message: 'Peso de referência inválido.' });

            const repoProducts = new Set(['BEZERRO_DESMAMA', 'BEZERRO_12M', 'GARROTE', 'BOI_MAGRO']);
            if (repoProducts.has(productType) && unit === 'CABECA' && !referenceWeightArrobas) {
                return res.status(400).json({ message: 'Peso em arrobas é obrigatório para reposição por cabeça.' });
            }
            if (productType === 'BOI_GORDO' && unit !== 'ARROBA') {
                return res.status(400).json({ message: 'Boi gordo deve usar unidade ARROBA.' });
            }

            const created = await prisma.marketPrice.create({
                data: {
                    regionId,
                    sourceId,
                    productType,
                    price,
                    unit,
                    paymentType,
                    referenceDate,
                    referenceWeightArrobas,
                    sourceBase,
                    notes,
                    status,
                    createdByUserId: req.user.id,
                },
                include: { source: true, region: true },
            });
            return res.status(201).json({ price: serializeMarketPrice(created) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao criar cotação de mercado.' });
        }
    });

    app.patch('/market/prices/:id', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketModelDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado ainda não está disponível neste ambiente.',
                });
            }
            const priceId = String(req.params.id || '');
            if (!UUID_REGEX.test(priceId)) return res.status(400).json({ message: 'Cotação inválida.' });
            const data = {};
            if (req.body?.regionId !== undefined) {
                const regionId = normalizeMarketOptionalText(req.body?.regionId);
                if (!regionId || !UUID_REGEX.test(regionId)) return res.status(400).json({ message: 'Região inválida.' });
                data.regionId = regionId;
            }
            if (req.body?.sourceId !== undefined) {
                const sourceId = normalizeMarketOptionalText(req.body?.sourceId);
                if (!sourceId || !UUID_REGEX.test(sourceId)) return res.status(400).json({ message: 'Fonte inválida.' });
                data.sourceId = sourceId;
            }
            if (req.body?.productType !== undefined) {
                const productType = String(req.body?.productType || '').trim().toUpperCase();
                if (!MARKET_ALLOWED_PRODUCT_TYPES.has(productType)) return res.status(400).json({ message: 'Produto inválido.' });
                data.productType = productType;
            }
            if (req.body?.price !== undefined) {
                const price = parseNumber(req.body?.price);
                if (!price || price <= 0) return res.status(400).json({ message: 'Preço deve ser maior que zero.' });
                data.price = price;
            }
            if (req.body?.unit !== undefined) {
                const unit = String(req.body?.unit || '').trim().toUpperCase();
                if (!MARKET_ALLOWED_UNITS.has(unit)) return res.status(400).json({ message: 'Unidade inválida.' });
                data.unit = unit;
            }
            if (req.body?.paymentType !== undefined) {
                const paymentType = String(req.body?.paymentType || '').trim().toUpperCase();
                if (!MARKET_ALLOWED_PAYMENT_TYPES.has(paymentType)) return res.status(400).json({ message: 'Tipo de pagamento inválido.' });
                data.paymentType = paymentType;
            }
            if (req.body?.status !== undefined) {
                const status = String(req.body?.status || '').trim().toUpperCase();
                if (!MARKET_ALLOWED_STATUSES.has(status)) return res.status(400).json({ message: 'Status inválido.' });
                data.status = status;
            }
            if (req.body?.referenceDate !== undefined) {
                const referenceDate = parseMarketReferenceDate(req.body?.referenceDate);
                if (!referenceDate) return res.status(400).json({ message: 'Data de referência inválida.' });
                if (referenceDate.getTime() > Date.now()) return res.status(400).json({ message: 'Data de referência não pode ser futura.' });
                data.referenceDate = referenceDate;
            }
            if (req.body?.referenceWeightArrobas !== undefined) {
                if (req.body?.referenceWeightArrobas === null || req.body?.referenceWeightArrobas === '') {
                    data.referenceWeightArrobas = null;
                } else {
                    const weight = parseNumber(req.body?.referenceWeightArrobas);
                    if (!weight || weight <= 0) return res.status(400).json({ message: 'Peso em arrobas inválido.' });
                    data.referenceWeightArrobas = weight;
                }
            }
            if (req.body?.sourceBase !== undefined) data.sourceBase = normalizeMarketOptionalText(req.body?.sourceBase);
            if (req.body?.notes !== undefined) data.notes = normalizeMarketOptionalText(req.body?.notes);

            const updated = await prisma.marketPrice.update({
                where: { id: priceId },
                data,
                include: { source: true, region: true },
            });
            return res.json({ price: serializeMarketPrice(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar cotação de mercado.' });
        }
    });

    app.post('/market/jobs/run-mock-national', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketPipelineDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
                });
            }

            const source = await prisma.marketSource.findFirst({
                where: { name: { equals: 'EIXO Mercado', mode: 'insensitive' } },
                orderBy: { updatedAt: 'desc' },
            });
            if (!source) {
                return res.status(404).json({ message: 'Fonte EIXO Mercado não encontrada.' });
            }

            const result = await runMarketCapture({
                prisma,
                sourceId: source.id,
                adapterName: 'mock-national',
                actorUserId: req.user?.id || null,
            });
            return res.status(201).json({
                job: result.job,
                summary: result.counters,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao executar job mock nacional.' });
        }
    });

    app.get('/market/jobs', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketPipelineDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
                });
            }
            const takeRaw = Number(req.query?.take);
            const take = Number.isFinite(takeRaw) && takeRaw > 0 ? Math.min(takeRaw, 200) : 50;
            const jobs = await prisma.marketPublishJob.findMany({
                include: { source: true },
                orderBy: [{ createdAt: 'desc' }],
                take,
            });
            return res.json({
                jobs: jobs.map((job) => ({
                    id: job.id,
                    status: job.status,
                    startedAt: job.startedAt?.toISOString?.() || null,
                    finishedAt: job.finishedAt?.toISOString?.() || null,
                    sourceId: job.sourceId || null,
                    sourceName: job.source?.name || null,
                    summary: job.summary || null,
                    errorMessage: job.errorMessage || null,
                    createdAt: job.createdAt.toISOString(),
                    updatedAt: job.updatedAt.toISOString(),
                })),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar jobs de mercado.' });
        }
    });

    app.get('/market/raw-captures', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketPipelineDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
                });
            }
            const sourceId = normalizeMarketOptionalText(req.query?.sourceId);
            const status = String(req.query?.status || '').trim().toUpperCase();
            const where = {};
            if (sourceId && UUID_REGEX.test(sourceId)) where.sourceId = sourceId;
            if (status) where.status = status;

            const captures = await prisma.marketRawCapture.findMany({
                where,
                include: { source: true },
                orderBy: [{ capturedAt: 'desc' }],
                take: 300,
            });
            return res.json({ captures: captures.map(serializeMarketRawCapture) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar capturas brutas.' });
        }
    });

    app.get('/market/normalized-prices', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketPipelineDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
                });
            }
            const status = String(req.query?.status || '').trim().toUpperCase();
            const validationStatus = String(req.query?.validationStatus || '').trim().toUpperCase();
            const where = {};
            if (status) where.status = status;
            if (validationStatus) where.validationStatus = validationStatus;

            const normalized = await prisma.marketNormalizedPrice.findMany({
                where,
                include: { source: true, region: true },
                orderBy: [{ referenceDate: 'desc' }, { createdAt: 'desc' }],
                take: 500,
            });
            return res.json({ normalizedPrices: normalized.map(serializeMarketNormalizedPrice) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar cotações normalizadas.' });
        }
    });

    app.post('/market/normalized-prices/:id/publish', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketPipelineDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
                });
            }
            const id = String(req.params.id || '');
            if (!UUID_REGEX.test(id)) return res.status(400).json({ message: 'ID inválido.' });
            const published = await publishNormalizedPrice(prisma, id, req.user?.id || null);
            return res.json({ price: serializeMarketPrice(published) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: error?.message || 'Erro ao publicar cotação normalizada.' });
        }
    });

    app.post('/market/normalized-prices/:id/reject', requireAuth, requireMarketAdmin, async (req, res) => {
        try {
            if (!hasMarketPipelineDelegates()) {
                return res.status(503).json({
                    error: 'MARKET_MODULE_NOT_READY',
                    message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
                });
            }
            const id = String(req.params.id || '');
            if (!UUID_REGEX.test(id)) return res.status(400).json({ message: 'ID inválido.' });
            const reviewerNotes = normalizeMarketOptionalText(req.body?.reviewerNotes);
            const rejected = await rejectNormalizedPrice(prisma, id, reviewerNotes);
            return res.json({
                normalizedPrice: {
                    id: rejected.id,
                    status: rejected.status,
                    validationStatus: rejected.validationStatus,
                    reviewerNotes: rejected.reviewerNotes || null,
                },
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: error?.message || 'Erro ao rejeitar cotação normalizada.' });
        }
    });
}
