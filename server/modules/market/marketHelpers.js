import { PrismaClient } from '@prisma/client';
import { parseNumber } from '../utils/formatters.js';
import { resolveMarketTrends } from '../../market/services/marketTrendService.js';
const prisma = new PrismaClient();

export const REPLACEMENT_RATIO_LIMITS = {
    FAVORAVEL_MAX: 8,
    EQUILIBRADA_MAX: 10,
};
export const DEFAULT_FINISHED_ANIMAL_WEIGHT_ARROBAS = 18;
export const DEFAULT_REPLACEMENT_WEIGHT_ARROBAS = 7;
export const DEFAULT_MARKET_STATE = 'BA';
export const DEFAULT_MARKET_REGION = 'Bahia';
export const MARKET_VISIBLE_SOURCE_NAME = 'EIXO Mercado';
export const MARKET_MACRO_REGION_BY_STATE = {
    AC: 'NORTE', AL: 'NORDESTE', AP: 'NORTE', AM: 'NORTE', BA: 'NORDESTE', CE: 'NORDESTE',
    DF: 'CENTRO_OESTE', ES: 'SUDESTE', GO: 'CENTRO_OESTE', MA: 'NORDESTE', MT: 'CENTRO_OESTE',
    MS: 'CENTRO_OESTE', MG: 'SUDESTE', PA: 'NORTE', PB: 'NORDESTE', PR: 'SUL', PE: 'NORDESTE',
    PI: 'NORDESTE', RJ: 'SUDESTE', RN: 'NORDESTE', RS: 'SUL', RO: 'NORTE', RR: 'NORTE', SC: 'SUL',
    SP: 'SUDESTE', SE: 'NORDESTE', TO: 'NORTE',
};
export const MARKET_ALLOWED_PRODUCT_TYPES = new Set([
    'BOI_GORDO',
    'VACA_GORDA',
    'NOVILHA_GORDA',
    'BEZERRO_DESMAMA',
    'BEZERRO_12M',
    'GARROTE',
    'BOI_MAGRO',
]);
export const MARKET_ALLOWED_UNITS = new Set(['ARROBA', 'CABECA', 'KG']);
export const MARKET_ALLOWED_SOURCE_TYPES = new Set(['MANUAL', 'SITE_NOTICIAS', 'CONSULTORIA', 'API', 'B3', 'OUTRO']);
export const MARKET_ALLOWED_PAYMENT_TYPES = new Set(['A_VISTA', 'TRINTA_DIAS', 'NAO_INFORMADO']);
export const MARKET_ALLOWED_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const formatNumberPtBr = (value, decimals = 1) => Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
});

export const formatDateYYYYMMDD = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const isPositiveFiniteNumber = (value) => Number.isFinite(value) && Number(value) > 0;

export const isValidMarketDateInput = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

export const parseMarketReferenceDate = (value) => {
    if (!isValidMarketDateInput(value)) return null;
    const dt = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
};

export const normalizeMarketState = (value) => String(value || '').trim().toUpperCase().slice(0, 2);
export const marketMacroRegionFromState = (state) => MARKET_MACRO_REGION_BY_STATE[normalizeMarketState(state)] || null;

export const normalizeMarketOptionalText = (value) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized ? normalized : null;
};

export const normalizeText = (value) => {
    const raw = normalizeMarketOptionalText(value);
    if (!raw) return null;
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
};

export const parseFarmMapData = (mapData) => {
    if (!mapData) return null;
    if (typeof mapData === 'object' && !Array.isArray(mapData)) return mapData;
    if (typeof mapData === 'string') {
        try {
            const parsed = JSON.parse(mapData);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_error) {
            return null;
        }
    }
    return null;
};

export const pickFirstText = (...values) => {
    for (const value of values) {
        const normalized = normalizeMarketOptionalText(value);
        if (normalized) return normalized;
    }
    return null;
};

export const parseCityState = (value) => {
    const raw = normalizeMarketOptionalText(value);
    if (!raw) return { city: null, state: null };
    const compact = raw.replace(/\s+/g, ' ').trim();
    const match = compact.match(/^(.*?)[\s,\/-]*([A-Za-z]{2})$/);
    if (!match) return { city: compact, state: null };
    const city = normalizeMarketOptionalText(match[1]);
    const stateCandidate = normalizeMarketOptionalText(match[2]);
    const state = stateCandidate ? normalizeMarketState(stateCandidate) : null;
    if (!state || state.length !== 2) return { city: compact, state: null };
    return { city: city || compact, state };
};

export const hasMarketModelDelegates = () => Boolean(
    prisma?.marketRegion
    && prisma?.marketPrice
    && prisma?.marketSource,
);

export const hasMarketPipelineDelegates = () => Boolean(
    hasMarketModelDelegates()
    && prisma?.marketRawCapture
    && prisma?.marketNormalizedPrice
    && prisma?.marketPublishJob
    && prisma?.marketValidationRule,
);

export const serializeMarketSource = (source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    url: source.url || null,
    priority: source.priority,
    trustScore: source.trustScore,
    autoPublishMinConfidence: source.autoPublishMinConfidence,
    requiresReview: source.requiresReview,
    isAutomationEnabled: source.isAutomationEnabled,
    isActive: source.isActive,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
});

export const serializeMarketRegion = (region) => ({
    id: region.id,
    name: region.name,
    state: region.state,
    city: region.city || null,
    marketPlaceName: region.marketPlaceName || null,
    sourceRegionName: region.sourceRegionName || null,
    macroRegion: region.macroRegion || null,
    isActive: region.isActive,
    createdAt: region.createdAt.toISOString(),
    updatedAt: region.updatedAt.toISOString(),
});

export const serializeMarketPrice = (price) => ({
    id: price.id,
    regionId: price.regionId,
    sourceId: price.sourceId,
    productType: price.productType,
    price: Number(price.price),
    unit: price.unit,
    paymentType: price.paymentType,
    referenceDate: formatDateYYYYMMDD(price.referenceDate),
    referenceWeightArrobas: price.referenceWeightArrobas ?? null,
    sourceBase: price.sourceBase || null,
    notes: price.notes || null,
    status: price.status,
    createdByUserId: price.createdByUserId || null,
    createdAt: price.createdAt.toISOString(),
    updatedAt: price.updatedAt.toISOString(),
    source: price.source ? serializeMarketSource(price.source) : null,
    region: price.region ? serializeMarketRegion(price.region) : null,
});

export const serializeMarketRawCapture = (capture) => ({
    id: capture.id,
    sourceId: capture.sourceId,
    capturedAt: capture.capturedAt?.toISOString?.() || null,
    referenceDate: capture.referenceDate ? formatDateYYYYMMDD(capture.referenceDate) : null,
    rawTitle: capture.rawTitle || null,
    rawText: capture.rawText || null,
    rawUrl: capture.rawUrl || null,
    rawPayload: capture.rawPayload || null,
    captureMethod: capture.captureMethod,
    status: capture.status,
    errorMessage: capture.errorMessage || null,
    createdAt: capture.createdAt?.toISOString?.() || null,
    updatedAt: capture.updatedAt?.toISOString?.() || null,
    source: capture.source ? serializeMarketSource(capture.source) : null,
});

export const serializeMarketNormalizedPrice = (normalized) => ({
    id: normalized.id,
    rawCaptureId: normalized.rawCaptureId || null,
    sourceId: normalized.sourceId,
    regionId: normalized.regionId || null,
    productType: normalized.productType,
    price: Number(normalized.price),
    unit: normalized.unit,
    paymentType: normalized.paymentType,
    referenceDate: formatDateYYYYMMDD(normalized.referenceDate),
    referenceWeightArrobas: normalized.referenceWeightArrobas ?? null,
    confidenceScore: normalized.confidenceScore,
    validationStatus: normalized.validationStatus,
    validationReasons: normalized.validationReasons || [],
    normalizedPayload: normalized.normalizedPayload || null,
    status: normalized.status,
    reviewerNotes: normalized.reviewerNotes || null,
    createdAt: normalized.createdAt?.toISOString?.() || null,
    updatedAt: normalized.updatedAt?.toISOString?.() || null,
    source: normalized.source ? serializeMarketSource(normalized.source) : null,
    region: normalized.region ? serializeMarketRegion(normalized.region) : null,
});

export const calculateReplacementCostInFatArrobas = ({ replacementAnimalPrice, fatCattlePricePerArroba }) => {
    if (!isPositiveFiniteNumber(replacementAnimalPrice) || !isPositiveFiniteNumber(fatCattlePricePerArroba)) return null;
    return replacementAnimalPrice / fatCattlePricePerArroba;
};

export const calculateFinishedAnimalGrossValue = ({ fatCattlePricePerArroba, finishedAnimalWeightArrobas }) => {
    if (!isPositiveFiniteNumber(fatCattlePricePerArroba) || !isPositiveFiniteNumber(finishedAnimalWeightArrobas)) return null;
    return fatCattlePricePerArroba * finishedAnimalWeightArrobas;
};

export const calculateReplacementAnimalsPerFinishedAnimal = ({ finishedAnimalGrossValue, replacementAnimalPrice }) => {
    if (!isPositiveFiniteNumber(finishedAnimalGrossValue) || !isPositiveFiniteNumber(replacementAnimalPrice)) return null;
    return finishedAnimalGrossValue / replacementAnimalPrice;
};

export const calculateReplacementArrobaPrice = ({ replacementAnimalPrice, replacementAnimalWeightArrobas }) => {
    if (!isPositiveFiniteNumber(replacementAnimalPrice) || !isPositiveFiniteNumber(replacementAnimalWeightArrobas)) return null;
    return replacementAnimalPrice / replacementAnimalWeightArrobas;
};

export const calculateReplacementPremiumPercent = ({ replacementArrobaPrice, fatCattlePricePerArroba }) => {
    if (!isPositiveFiniteNumber(replacementArrobaPrice) || !isPositiveFiniteNumber(fatCattlePricePerArroba)) return null;
    return ((replacementArrobaPrice / fatCattlePricePerArroba) - 1) * 100;
};

export const calculateReplacementPremiumInFatArrobas = ({
    replacementAnimalPrice,
    replacementAnimalWeightArrobas,
    fatCattlePricePerArroba,
}) => {
    if (!isPositiveFiniteNumber(replacementAnimalPrice) || !isPositiveFiniteNumber(replacementAnimalWeightArrobas) || !isPositiveFiniteNumber(fatCattlePricePerArroba)) return null;
    const baseValueAtFatCattlePrice = replacementAnimalWeightArrobas * fatCattlePricePerArroba;
    const premiumValue = replacementAnimalPrice - baseValueAtFatCattlePrice;
    return premiumValue / fatCattlePricePerArroba;
};

export const classifyReplacementMarketStatus = (replacementCostInFatArrobas) => {
    // Regra provisória. No futuro, calibrar por categoria, peso, região e histórico da praça.
    if (replacementCostInFatArrobas === null) {
        return {
            status: 'SEM_DADOS',
            statusLabel: 'Sem dados de mercado',
            interpretation: 'Ainda não há dados suficientes para analisar a reposição.',
        };
    }

    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.FAVORAVEL_MAX) {
        return {
            status: 'FAVORAVEL',
            statusLabel: 'Reposição favorável',
            interpretation: 'A reposição está mais favorável para quem precisa comprar bezerros.',
        };
    }
    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.EQUILIBRADA_MAX) {
        return {
            status: 'EQUILIBRADA',
            statusLabel: 'Reposição equilibrada',
            interpretation: 'A relação está equilibrada. A compra exige atenção ao custo de recria.',
        };
    }
    return {
        status: 'PRESSIONADA',
        statusLabel: 'Reposição pressionada',
        interpretation: 'A reposição está pressionada. Comprar bezerro agora exige mais arrobas de boi gordo.',
    };
};

export const buildFatCattleSignal = ({ fatCattlePricePerArroba, fatCattleTrendPercent = null }) => {
    if (!fatCattlePricePerArroba || fatCattlePricePerArroba <= 0) {
        return {
            status: 'SEM_DADOS',
            signal: 'Sem dados',
            label: 'Sem dados da arroba',
            text: 'Ainda não há dados suficientes para avaliar o sinal do boi gordo.',
        };
    }
    if (fatCattleTrendPercent !== null && fatCattleTrendPercent >= 2) {
        return {
            status: 'BOM',
            signal: 'Bom',
            label: 'Arroba em alta',
            text: `A arroba está em alta (${formatNumberPtBr(fatCattleTrendPercent, 1)}% acima da cotação anterior). Boa oportunidade de venda.`,
        };
    }
    if (fatCattleTrendPercent !== null && fatCattleTrendPercent <= -2) {
        return {
            status: 'RUIM',
            signal: 'Ruim',
            label: 'Arroba em queda',
            text: `A arroba está em queda (${formatNumberPtBr(fatCattleTrendPercent, 1)}% abaixo da cotação anterior). Considere segurar a venda.`,
        };
    }
    return {
        status: 'NEUTRO',
        signal: 'Neutro',
        label: 'Arroba em observação',
        text: 'A arroba serve como referência de venda, mas ainda precisa de histórico regional e custo da fazenda para dizer se está realmente boa.',
    };
};

export const classifyReplacementSignal = (replacementCostInFatArrobas) => {
    // Regra provisória. No futuro, calibrar por categoria, peso, região, histórico da praça, sistema produtivo, GMD e custo de recria.
    if (replacementCostInFatArrobas === null) {
        return 'SEM_DADOS';
    }
    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.FAVORAVEL_MAX) {
        return 'FAVORAVEL';
    }
    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.EQUILIBRADA_MAX) {
        return 'EQUILIBRADA';
    }
    return 'PRESSIONADA';
};

export const buildReplacementSignal = ({ replacementCostInFatArrobas }) => {
    const status = classifyReplacementSignal(replacementCostInFatArrobas);
    if (status === 'SEM_DADOS') {
        return {
            status: 'SEM_DADOS',
            signal: 'Sem dados',
            label: 'Sem dados de reposição',
            text: 'Ainda não há dados suficientes para analisar a compra da reposição.',
        };
    }
    if (status === 'FAVORAVEL') {
        return {
            status: 'FAVORAVEL',
            signal: 'Bom',
            label: 'Reposição favorável',
            text: 'A compra da reposição está mais favorável em relação ao preço atual do boi gordo.',
        };
    }
    if (status === 'EQUILIBRADA') {
        return {
            status: 'EQUILIBRADA',
            signal: 'Cautela',
            label: 'Reposição exige eficiência',
            text: 'A compra pode fazer sentido, mas depende de GMD e custo de recria controlados.',
        };
    }
    return {
        status: 'PRESSIONADA',
        signal: 'Pressionada',
        label: 'Reposição cara',
        text: 'A reposição está cara em relação ao boi gordo. Comprar agora exige mais arrobas por cabeça.',
    };
};

export const buildMarketAiInput = ({ base, metrics, statusMeta }) => ({
    state: base.state,
    region: base.region,
    fatCattlePricePerArroba: base.fatCattlePricePerArroba,
    replacementAnimalPrice: base.replacementAnimalPrice,
    replacementAnimalWeightArrobas: base.replacementAnimalWeightArrobas,
    replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
    replacementAnimalsPerFinishedAnimal: metrics.replacementAnimalsPerFinishedAnimal,
    finishedAnimalWeightArrobas: base.finishedAnimalWeightArrobas,
    finishedAnimalGrossValue: metrics.finishedAnimalGrossValue,
    replacementAnimalType: base.replacementAnimalType,
    replacementAnimalTypeLabel: base.replacementAnimalTypeLabel,
    replacementArrobaPrice: metrics.replacementArrobaPrice,
    replacementPremiumPercent: metrics.replacementPremiumPercent,
    replacementPremiumInFatArrobas: metrics.replacementPremiumInFatArrobas,
    status: statusMeta.status,
    statusLabel: statusMeta.statusLabel,
    sourceName: base.sourceName,
    referenceDate: base.referenceDate,
});

export const generateFallbackMarketInsight = (aiInput) => {
    if (aiInput.status === 'SEM_DADOS') {
        return {
            summary: 'Ainda não há dados suficientes para gerar uma leitura de mercado.',
            detail: 'Cadastre cotações de arroba e reposição para liberar a leitura comparativa da reposição.',
            attentionPoints: ['Use essa leitura apenas como referência operacional.'],
            tone: 'SEM_DADOS',
            generatedBy: 'RULES_FALLBACK',
        };
    }
    if (aiInput.status === 'FAVORAVEL') {
        return {
            summary: 'A reposição está favorável para quem precisa comprar bezerros.',
            detail: `Esse bezerro custa o equivalente a ${formatNumberPtBr(aiInput.replacementCostInFatArrobas, 1)} arrobas de boi gordo. Vendendo um boi de referência de ${formatNumberPtBr(aiInput.finishedAnimalWeightArrobas, 0)} @, o produtor compra cerca de ${formatNumberPtBr(aiInput.replacementAnimalsPerFinishedAnimal, 2)} bezerros. A arroba do bezerro está ${formatNumberPtBr(aiInput.replacementPremiumPercent, 1)}% acima da arroba do boi gordo.`,
            attentionPoints: [
                'Ainda assim, acompanhe custo de recria e desempenho do lote.',
                'Use essa leitura como referência, não como decisão automática.',
            ],
            tone: 'OPORTUNIDADE',
            generatedBy: 'RULES_FALLBACK',
        };
    }
    if (aiInput.status === 'EQUILIBRADA') {
        return {
            summary: 'Com a arroba atual, o bezerro desmamado custa 9,2 @ de boi gordo.',
            detail: 'Com a arroba atual, o bezerro desmamado custa 9,2 @ de boi gordo. A compra exige controle de custo e bom ganho de peso.',
            attentionPoints: [
                'Exige eficiência na recria para fechar conta.',
            ],
            tone: 'CAUTELA',
            generatedBy: 'RULES_FALLBACK',
        };
    }
    return {
        summary: 'A reposição está pressionada. Comprar bezerro agora exige mais arrobas de boi gordo.',
        detail: `Esse bezerro custa cerca de ${formatNumberPtBr(aiInput.replacementCostInFatArrobas, 1)} arrobas de boi gordo. O poder de compra está em aproximadamente ${formatNumberPtBr(aiInput.replacementAnimalsPerFinishedAnimal, 2)} bezerros por boi de referência, com ágio de ${formatNumberPtBr(aiInput.replacementPremiumPercent, 1)}%.`,
        attentionPoints: [
            'Reforce análise de custo antes de repor.',
            'Use essa leitura apenas como referência operacional.',
        ],
        tone: 'CAUTELA',
        generatedBy: 'RULES_FALLBACK',
    };
};

export const generateMarketInsight = (aiInput) => generateFallbackMarketInsight(aiInput);

export const calculateMarketReplacementMetrics = (base) => {
    const finishedAnimalGrossValue = calculateFinishedAnimalGrossValue(base);
    const replacementCostInFatArrobas = calculateReplacementCostInFatArrobas(base);
    const replacementAnimalsPerFinishedAnimal = calculateReplacementAnimalsPerFinishedAnimal({
        finishedAnimalGrossValue,
        replacementAnimalPrice: base.replacementAnimalPrice,
    });
    const replacementArrobaPrice = calculateReplacementArrobaPrice(base);
    const replacementPremiumPercent = calculateReplacementPremiumPercent({
        replacementArrobaPrice,
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
    });
    const replacementPremiumInFatArrobas = calculateReplacementPremiumInFatArrobas(base);
    return {
        finishedAnimalGrossValue,
        replacementCostInFatArrobas,
        replacementAnimalsPerFinishedAnimal,
        replacementArrobaPrice,
        replacementPremiumPercent,
        replacementPremiumInFatArrobas,
    };
};

export const buildEmptyMarketReplacementSnapshot = ({ region = null, state = null, referenceDate = null } = {}) => ({
    fatCattlePricePerArroba: null,
    fatCattleTrendPercent: null,
    finishedAnimalWeightArrobas: null,
    finishedAnimalGrossValue: null,
    replacementAnimalType: null,
    replacementAnimalTypeLabel: null,
    replacementAnimalPrice: null,
    replacementAnimalTrendPercent: null,
    replacementAnimalWeightArrobas: null,
    replacementArrobaPrice: null,
    replacementCostInFatArrobas: null,
    replacementCostTrendArrobas: null,
    replacementAnimalsPerFinishedAnimal: null,
    replacementPremiumPercent: null,
    replacementPremiumInFatArrobas: null,
    replacementRatio: null,
    fatCattleSignal: {
        status: 'SEM_DADOS',
        signal: 'Sem dados',
        label: 'Sem dados de arroba',
        text: 'Ainda não há dados suficientes para avaliar o sinal do boi gordo.',
    },
    replacementSignal: {
        status: 'SEM_DADOS',
        signal: 'Sem dados',
        label: 'Sem dados de reposição',
        text: 'Ainda não há dados suficientes para analisar a compra da reposição.',
    },
    status: 'SEM_DADOS',
    statusLabel: 'Sem dados de mercado',
    interpretation: 'Ainda não há dados suficientes para analisar mercado e reposição.',
    region,
    state,
    sourceName: MARKET_VISIBLE_SOURCE_NAME,
    sourceBase: null,
    referenceDate,
    aiInsight: {
        summary: 'Ainda não há dados suficientes para analisar mercado e reposição.',
        detail: '',
        attentionPoints: [],
        tone: 'SEM_DADOS',
        generatedBy: 'RULES_FALLBACK',
    },
});

export const buildPartialMarketReplacementSnapshot = ({
    fatCattlePrice = null,
    replacementPrice = null,
    region = null,
    state = null,
}) => {
    const base = {
        fatCattlePricePerArroba: fatCattlePrice ? Number(fatCattlePrice.price) : null,
        finishedAnimalWeightArrobas: DEFAULT_FINISHED_ANIMAL_WEIGHT_ARROBAS,
        replacementAnimalType: replacementPrice?.productType || 'BEZERRO_DESMAMA',
        replacementAnimalTypeLabel: 'Bezerro desmamado',
        replacementAnimalPrice: replacementPrice ? Number(replacementPrice.price) : null,
        replacementAnimalWeightArrobas: replacementPrice?.referenceWeightArrobas ?? DEFAULT_REPLACEMENT_WEIGHT_ARROBAS,
        region,
        state,
        sourceName: MARKET_VISIBLE_SOURCE_NAME,
        sourceBase: normalizeMarketOptionalText(replacementPrice?.sourceBase || fatCattlePrice?.sourceBase),
        referenceDate: formatDateYYYYMMDD(replacementPrice?.referenceDate || fatCattlePrice?.referenceDate || new Date()),
    };
    const metrics = calculateMarketReplacementMetrics(base);
    const statusMeta = classifyReplacementMarketStatus(metrics.replacementCostInFatArrobas);
    const fatCattleSignal = buildFatCattleSignal({
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        fatCattleTrendPercent: null,
    });
    const replacementSignal = buildReplacementSignal({
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
    });
    const aiInput = buildMarketAiInput({ base, metrics, statusMeta });
    const aiInsight = generateMarketInsight(aiInput);
    return {
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        finishedAnimalWeightArrobas: base.finishedAnimalWeightArrobas,
        finishedAnimalGrossValue: metrics.finishedAnimalGrossValue,
        replacementAnimalType: base.replacementAnimalType,
        replacementAnimalTypeLabel: base.replacementAnimalTypeLabel,
        replacementAnimalPrice: base.replacementAnimalPrice,
        replacementAnimalWeightArrobas: base.replacementAnimalWeightArrobas,
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
        replacementAnimalsPerFinishedAnimal: metrics.replacementAnimalsPerFinishedAnimal,
        replacementArrobaPrice: metrics.replacementArrobaPrice,
        replacementPremiumPercent: metrics.replacementPremiumPercent,
        replacementPremiumInFatArrobas: metrics.replacementPremiumInFatArrobas,
        replacementRatio: metrics.replacementCostInFatArrobas,
        fatCattleSignal,
        replacementSignal,
        status: statusMeta.status,
        statusLabel: statusMeta.statusLabel,
        interpretation: metrics.replacementCostInFatArrobas === null
            ? 'Ainda não há dados suficientes para analisar mercado e reposição.'
            : statusMeta.interpretation,
        region,
        state,
        sourceName: base.sourceName,
        sourceBase: base.sourceBase,
        referenceDate: base.referenceDate,
        fatCattleTrendPercent: null,
        replacementAnimalTrendPercent: null,
        replacementCostTrendArrobas: null,
        aiInsight,
    };
};

export const resolveFarmMarketRegion = (farm) => {
    const mapData = parseFarmMapData(farm?.mapData);

    const farmCityRaw = pickFirstText(
        farm?.city,
        farm?.cidade,
        mapData?.city,
        mapData?.cidade,
        mapData?.municipio,
        mapData?.município,
        mapData?.localidade,
    );
    const parsedFarmCity = parseCityState(farmCityRaw);
    const farmCity = parsedFarmCity.city;

    const farmRegion = pickFirstText(
        farm?.region,
        mapData?.region,
        mapData?.regiao,
        mapData?.região,
        mapData?.marketRegion,
        mapData?.marketPlaceName,
        mapData?.praca,
        mapData?.praça,
    );

    const stateRaw = pickFirstText(
        farm?.state,
        farm?.uf,
        mapData?.uf,
        mapData?.UF,
        mapData?.state,
        mapData?.estado,
        mapData?.siglaUf,
        mapData?.siglaUF,
        mapData?.estadoSigla,
        mapData?.stateCode,
    );
    const farmState = stateRaw ? normalizeMarketState(stateRaw) : parsedFarmCity.state;

    const addressRaw = pickFirstText(
        mapData?.address,
        mapData?.endereco,
        mapData?.endereço,
        mapData?.location,
        mapData?.place,
    );

    const farmLat = farm?.latitude ?? farm?.lat ?? mapData?.latitude ?? mapData?.lat ?? null;
    const farmLng = farm?.longitude ?? farm?.lng ?? mapData?.longitude ?? mapData?.lng ?? null;

    let resolvedRegion = farmRegion;
    let resolvedState = farmState;
    let source = farmRegion || farmState || farmCity ? 'farm-field' : 'empty';

    const cityKey = normalizeText(farmCity);
    const addressKey = normalizeText(addressRaw);

    if ((!resolvedRegion || !resolvedState) && (cityKey === 'feira de santana' || cityKey === 'feira' || cityKey === 'lagoa do capim' || parsedFarmCity.state === 'BA')) {
        resolvedRegion = resolvedRegion || 'Bahia';
        resolvedState = resolvedState || 'BA';
        source = 'city-state-fallback';
    }

    if ((!resolvedRegion || !resolvedState) && (addressKey?.includes('bahia') || addressKey?.includes(' ba '))) {
        resolvedRegion = resolvedRegion || 'Bahia';
        resolvedState = resolvedState || 'BA';
        source = 'city-state-fallback';
    }

    if (!resolvedRegion && !resolvedState && (farmLat !== null || farmLng !== null)) {
        source = 'coords-only';
    } else if (!resolvedRegion && !resolvedState) {
        source = 'empty';
    } else if (!source) {
        source = 'mapData';
    }

    return {
        region: resolvedRegion || null,
        state: resolvedState || null,
        city: farmCity || null,
        lat: farmLat,
        lng: farmLng,
        source,
        mapDataKeys: mapData ? Object.keys(mapData) : [],
    };
};

export const resolveMarketRegionContext = async ({ farm, scope }) => {
    const farmRegionContext = resolveFarmMarketRegion(farm);
    const marketTablesAvailable = hasMarketModelDelegates();

    if (scope === 'farm' && process.env.NODE_ENV !== 'production') {
        console.log('[overview/dashboard] farm market region', {
            farmId: farm?.id || null,
            farmName: farm?.name || null,
            city: farm?.city || farm?.cidade || null,
            lat: farm?.lat ?? null,
            lng: farm?.lng ?? null,
            mapDataKeys: farmRegionContext.mapDataKeys || [],
            resolvedRegion: farmRegionContext.region || null,
            resolvedState: farmRegionContext.state || null,
            source: farmRegionContext.source || 'empty',
        });
    }

    if (!marketTablesAvailable) {
        console.warn('[market] Prisma market models unavailable');
        if (farmRegionContext.region || farmRegionContext.state) {
            return {
                id: null,
                name: farmRegionContext.region || farmRegionContext.state,
                state: farmRegionContext.state,
            };
        }
        return null;
    }

    if (scope === 'farm' && farmRegionContext.city) {
        const byCity = await prisma.marketRegion.findFirst({
            where: {
                isActive: true,
                city: { equals: farmRegionContext.city, mode: 'insensitive' },
                ...(farmRegionContext.state ? { state: farmRegionContext.state } : {}),
            },
            orderBy: { updatedAt: 'desc' },
        });
        if (byCity) return byCity;
    }

    if (scope === 'farm' && farmRegionContext.region) {
        const byRegionName = await prisma.marketRegion.findFirst({
            where: {
                isActive: true,
                name: { equals: farmRegionContext.region, mode: 'insensitive' },
                ...(farmRegionContext.state ? { state: farmRegionContext.state } : {}),
            },
            orderBy: { updatedAt: 'desc' },
        });
        if (byRegionName) return byRegionName;
    }

    if (scope === 'farm' && farmRegionContext.state) {
        const byState = await prisma.marketRegion.findFirst({
            where: { isActive: true, state: farmRegionContext.state },
            orderBy: [{ updatedAt: 'desc' }],
        });
        if (byState) return byState;
        const macroRegion = marketMacroRegionFromState(farmRegionContext.state);
        if (macroRegion) {
            const byMacroRegion = await prisma.marketRegion.findFirst({
                where: { isActive: true, macroRegion },
                orderBy: [{ updatedAt: 'desc' }],
            });
            if (byMacroRegion) return byMacroRegion;
        }
        return {
            id: null,
            name: farmRegionContext.region || farmRegionContext.state,
            state: farmRegionContext.state,
        };
    }

    const byDefaultState = await prisma.marketRegion.findFirst({
        where: { isActive: true, state: DEFAULT_MARKET_STATE },
        orderBy: [{ updatedAt: 'desc' }],
    });
    if (byDefaultState) return byDefaultState;
    return null;
};

export const findLatestPublishedMarketPrice = async ({ regionId, productType }) => {
    if (!regionId || !productType || !hasMarketModelDelegates()) return null;
    return prisma.marketPrice.findFirst({
        where: {
            regionId,
            productType,
            status: 'PUBLISHED',
        },
        include: {
            source: true,
            region: true,
        },
        orderBy: [{ referenceDate: 'desc' }, { updatedAt: 'desc' }],
    });
};

export const buildMarketReplacementSnapshot = async ({ scope, farm }) => {
    const regionContext = await resolveMarketRegionContext({ farm, scope });
    if (!regionContext) {
        return buildEmptyMarketReplacementSnapshot();
    }

    const [fatCattlePrice, replacementPrice] = await Promise.all([
        findLatestPublishedMarketPrice({ regionId: regionContext.id, productType: 'BOI_GORDO' }),
        findLatestPublishedMarketPrice({ regionId: regionContext.id, productType: 'BEZERRO_DESMAMA' }),
    ]);

    if (!fatCattlePrice && !replacementPrice) {
        return buildEmptyMarketReplacementSnapshot({
            region: regionContext.name,
            state: regionContext.state,
            referenceDate: formatDateYYYYMMDD(new Date()),
        });
    }

    if (!fatCattlePrice || !replacementPrice) {
        return buildPartialMarketReplacementSnapshot({
            fatCattlePrice,
            replacementPrice,
            region: regionContext.name,
            state: regionContext.state,
        });
    }

    const replacementWeight = replacementPrice.referenceWeightArrobas && replacementPrice.referenceWeightArrobas > 0
        ? replacementPrice.referenceWeightArrobas
        : null;
    if (!replacementWeight) {
        return buildPartialMarketReplacementSnapshot({
            fatCattlePrice,
            replacementPrice,
            region: regionContext.name,
            state: regionContext.state,
        });
    }

    const base = {
        fatCattlePricePerArroba: Number(fatCattlePrice.price),
        finishedAnimalWeightArrobas: DEFAULT_FINISHED_ANIMAL_WEIGHT_ARROBAS,
        replacementAnimalType: replacementPrice.productType,
        replacementAnimalTypeLabel: 'Bezerro desmamado',
        replacementAnimalPrice: Number(replacementPrice.price),
        replacementAnimalWeightArrobas: replacementWeight,
        region: regionContext.name,
        state: regionContext.state,
        sourceName: MARKET_VISIBLE_SOURCE_NAME,
        sourceBase: normalizeMarketOptionalText(replacementPrice.sourceBase || fatCattlePrice.sourceBase),
        referenceDate: formatDateYYYYMMDD(replacementPrice.referenceDate >= fatCattlePrice.referenceDate ? replacementPrice.referenceDate : fatCattlePrice.referenceDate),
    };

    const metrics = calculateMarketReplacementMetrics(base);
    const statusMeta = classifyReplacementMarketStatus(metrics.replacementCostInFatArrobas);
    const replacementSignal = buildReplacementSignal({
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
    });
    const aiInput = buildMarketAiInput({ base, metrics, statusMeta });
    const aiInsight = generateMarketInsight(aiInput);
    const trends = await resolveMarketTrends(prisma, {
        regionId: regionContext.id,
        referenceDate: replacementPrice.referenceDate >= fatCattlePrice.referenceDate ? replacementPrice.referenceDate : fatCattlePrice.referenceDate,
        fatPrice: base.fatCattlePricePerArroba,
        replacementPrice: base.replacementAnimalPrice,
    });
    const fatCattleSignal = buildFatCattleSignal({
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        fatCattleTrendPercent: trends.fatCattleTrendPercent,
    });

    return {
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        finishedAnimalWeightArrobas: base.finishedAnimalWeightArrobas,
        finishedAnimalGrossValue: metrics.finishedAnimalGrossValue,
        replacementAnimalType: base.replacementAnimalType,
        replacementAnimalTypeLabel: base.replacementAnimalTypeLabel,
        replacementAnimalPrice: base.replacementAnimalPrice,
        replacementAnimalWeightArrobas: base.replacementAnimalWeightArrobas,
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
        replacementAnimalsPerFinishedAnimal: metrics.replacementAnimalsPerFinishedAnimal,
        replacementArrobaPrice: metrics.replacementArrobaPrice,
        replacementPremiumPercent: metrics.replacementPremiumPercent,
        replacementPremiumInFatArrobas: metrics.replacementPremiumInFatArrobas,
        // compatibilidade temporária com versão anterior do frontend
        replacementRatio: metrics.replacementCostInFatArrobas,
        fatCattleSignal,
        replacementSignal,
        status: statusMeta.status,
        statusLabel: statusMeta.statusLabel,
        interpretation: statusMeta.interpretation,
        region: base.region,
        state: base.state,
        sourceName: base.sourceName,
        sourceBase: base.sourceBase,
        referenceDate: base.referenceDate,
        fatCattleTrendPercent: trends.fatCattleTrendPercent,
        replacementAnimalTrendPercent: trends.replacementAnimalTrendPercent,
        replacementCostTrendArrobas: trends.replacementCostTrendArrobas,
        aiInsight,
    };
};
