const NUTRITION_ADJUSTMENT_BY_SCORE = {
    0: 5,
    1: 2,
    2: 0,
    3: -2,
    4: -5,
    5: -8,
};

const CRITICAL_TROUGH_SCORES = new Set([0, 4, 5]);
const REVIEW_ROLES = new Set(['OWNER', 'ADMIN']);
const REVIEW_USER_ROLES = new Set(['admin', 'manager', 'gerente', 'tech', 'tecnico', 'técnico']);

const toIso = (value) => (value instanceof Date ? value.toISOString() : null);
const roundNutrition = (value, digits = 3) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const normalizeOptionalText = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const parsePositiveNumber = (parseNumber, value) => {
    const parsed = parseNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
};

const calculateDryMatterKg = (naturalKg, dryMatterPercent) => {
    if (!Number.isFinite(naturalKg) || !Number.isFinite(dryMatterPercent)) {
        return null;
    }
    return roundNutrition(naturalKg * (dryMatterPercent / 100));
};

const calculateNaturalMatterKg = (dryKg, dryMatterPercent) => {
    if (!Number.isFinite(dryKg) || !Number.isFinite(dryMatterPercent) || dryMatterPercent <= 0) {
        return null;
    }
    return roundNutrition(dryKg / (dryMatterPercent / 100));
};

const normalizeNutritionOperationContext = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['CONFINAMENTO', 'PASTO', 'SEMI_CONFINAMENTO'].includes(normalized) ? normalized : null;
};

const normalizeNutritionAdjustmentMode = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['SUGESTAO', 'REVISAO_OBRIGATORIA', 'AUTOMATICO'].includes(normalized) ? normalized : null;
};

const normalizeNutritionUnitType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['BAIA', 'LOTE', 'PONTO_TRATO'].includes(normalized) ? normalized : null;
};

const normalizeNutritionReadingType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['DIURNA', 'NOTURNA'].includes(normalized) ? normalized : null;
};

const normalizeNutritionBehavior = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['RUMINANDO', 'NORMAL', 'INQUIETO', 'APATICO', 'OUTRO'].includes(normalized) ? normalized : null;
};

const normalizeNutritionPlanStatus = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['DRAFT', 'ACTIVE', 'ENDED', 'ARCHIVED'].includes(normalized) ? normalized : null;
};

const normalizeNutritionPreparedFeedStatus = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['ACTIVE', 'INACTIVE'].includes(normalized) ? normalized : null;
};

const parseListParams = (query) => {
    const limitRaw = Number(query?.limit);
    const offsetRaw = Number(query?.offset);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    return { limit, offset };
};

const getNutritionActor = (req) => ({
    userId: req.user?.id || null,
    name: req.user?.name || req.user?.email || 'Usuário',
});

const canReviewNutrition = (req) => {
    if (REVIEW_ROLES.has(req.saas?.membershipRole || '')) {
        return true;
    }
    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
    return roles.some((role) => REVIEW_USER_ROLES.has(String(role || '').trim().toLowerCase()));
};

const getNutritionDayRange = (value) => {
    const base = value instanceof Date ? value : new Date(value || Date.now());
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
};

const matchesOfficialReview = (record, approvedOnly) => {
    if (!record || record.canceledAt) {
        return false;
    }
    if (approvedOnly) {
        return record.reviewStatus === 'APPROVED' && !record.rejectedAt;
    }
    return !record.rejectedAt;
};

const matchesOfficialFabrication = (record, settings) => {
    if (!record || record.status === 'CANCELED' || record.status === 'REVERSED') {
        return false;
    }
    if (settings?.requireFabricationApproval) {
        return record.status === 'APPROVED';
    }
    return record.status === 'PENDING' || record.status === 'APPROVED';
};

const resolveFeedBases = ({ naturalKg, dryKg, dryMatterPercent }) => {
    const natural = Number.isFinite(naturalKg) ? naturalKg : null;
    const dry = Number.isFinite(dryKg) ? dryKg : null;
    if (natural !== null && dry !== null) {
        return {
            naturalKg: roundNutrition(natural),
            dryKg: roundNutrition(dry),
        };
    }
    if (natural !== null) {
        return {
            naturalKg: roundNutrition(natural),
            dryKg: calculateDryMatterKg(natural, dryMatterPercent),
        };
    }
    if (dry !== null) {
        return {
            naturalKg: calculateNaturalMatterKg(dry, dryMatterPercent),
            dryKg: roundNutrition(dry),
        };
    }
    return {
        naturalKg: null,
        dryKg: null,
    };
};

const getAdjustmentPercentByScore = (score) => {
    const parsedScore = Number(score);
    return Number.isInteger(parsedScore) && parsedScore in NUTRITION_ADJUSTMENT_BY_SCORE
        ? NUTRITION_ADJUSTMENT_BY_SCORE[parsedScore]
        : 0;
};

const getDiffSeverity = (percent, warningPercent, criticalPercent) => {
    const absolute = Math.abs(percent || 0);
    if (absolute >= criticalPercent) {
        return 'critical';
    }
    if (absolute >= warningPercent) {
        return 'warning';
    }
    return 'normal';
};

const getTroughSeverity = (score, repeatedCritical = false) => {
    if (repeatedCritical || CRITICAL_TROUGH_SCORES.has(score)) {
        return 'critical';
    }
    if (score === 1 || score === 3) {
        return 'warning';
    }
    return 'normal';
};

const serializeNutritionSettings = (settings) => ({
    id: settings.id,
    farmId: settings.farmId,
    operationContext: settings.operationContext,
    adjustmentMode: settings.adjustmentMode,
    indicatorsApprovedOnly: settings.indicatorsApprovedOnly,
    requireFabricationApproval: settings.requireFabricationApproval,
    requireExecutionApproval: settings.requireExecutionApproval,
    requireTroughApproval: settings.requireTroughApproval,
    predictiveSafeDays: settings.predictiveSafeDays,
    predictiveWarningDays: settings.predictiveWarningDays,
    diffWarningPercent: settings.diffWarningPercent,
    diffCriticalPercent: settings.diffCriticalPercent,
    manualReviewThresholdPercent: settings.manualReviewThresholdPercent,
    createdAt: toIso(settings.createdAt),
    updatedAt: toIso(settings.updatedAt),
});

const serializeNutritionPhase = (phase) => ({
    id: phase.id,
    farmId: phase.farmId,
    name: phase.name,
    periodStart: toIso(phase.periodStart),
    periodEnd: toIso(phase.periodEnd),
    primaryPlanId: phase.primaryPlanId,
    targetIntakeDryKgHead: phase.targetIntakeDryKgHead,
    targetGmd: phase.targetGmd,
    targetFeedConversion: phase.targetFeedConversion,
    targetCostPerHeadDay: phase.targetCostPerHeadDay,
    notes: phase.notes,
    active: phase.active,
    createdAt: toIso(phase.createdAt),
    updatedAt: toIso(phase.updatedAt),
});

const serializeNutritionUnit = (unit, resolvedHeadCount = null) => ({
    id: unit.id,
    farmId: unit.farmId,
    lotId: unit.lotId,
    phaseId: unit.phaseId,
    type: unit.type,
    name: unit.name,
    currentHeadCount: unit.currentHeadCount,
    resolvedHeadCount,
    active: unit.active,
    notes: unit.notes,
    lot: unit.lot
        ? {
              id: unit.lot.id,
              name: unit.lot.name,
          }
        : null,
    phase: unit.phase ? serializeNutritionPhase(unit.phase) : null,
    createdAt: toIso(unit.createdAt),
    updatedAt: toIso(unit.updatedAt),
});

const serializeNutritionIngredient = (ingredient) => ({
    id: ingredient.id,
    farmId: ingredient.farmId,
    name: ingredient.name,
    category: ingredient.category,
    unit: ingredient.unit,
    currentCost: ingredient.currentCost,
    supplier: ingredient.supplier,
    currentDryMatterPercent: ingredient.currentDryMatterPercent,
    dryMatterUpdatedAt: toIso(ingredient.dryMatterUpdatedAt),
    currentStockNatural: ingredient.currentStockNatural,
    currentStockDry: calculateDryMatterKg(ingredient.currentStockNatural, ingredient.currentDryMatterPercent),
    minStockNatural: ingredient.minStockNatural,
    active: ingredient.active,
    createdAt: toIso(ingredient.createdAt),
    updatedAt: toIso(ingredient.updatedAt),
    priceHistory: Array.isArray(ingredient.priceHistory)
        ? ingredient.priceHistory.map((item) => ({
              id: item.id,
              cost: item.cost,
              recordedAt: toIso(item.recordedAt),
              notes: item.notes,
              createdByUserId: item.createdByUserId,
              createdByName: item.createdByName,
          }))
        : undefined,
    dryMatterHistory: Array.isArray(ingredient.dryMatterHistory)
        ? ingredient.dryMatterHistory.map((item) => ({
              id: item.id,
              dryMatterPercent: item.dryMatterPercent,
              recordedAt: toIso(item.recordedAt),
              notes: item.notes,
              createdByUserId: item.createdByUserId,
              createdByName: item.createdByName,
          }))
        : undefined,
});

const serializeNutritionPreparedFeed = (feed) => ({
    id: feed.id,
    farmId: feed.farmId,
    name: feed.name,
    expectedYieldNaturalKg: feed.expectedYieldNaturalKg,
    expectedYieldDryKg: feed.expectedYieldDryKg,
    currentDryMatterPercent: feed.currentDryMatterPercent,
    currentTotalCost: feed.currentTotalCost,
    currentCostPerNaturalKg: feed.currentCostPerNaturalKg,
    currentCostPerDryKg: feed.currentCostPerDryKg,
    currentStockNatural: feed.currentStockNatural,
    currentStockDry: feed.currentStockDry,
    status: feed.status,
    notes: feed.notes,
    items: Array.isArray(feed.items)
        ? feed.items.map((item) => ({
              id: item.id,
              ingredientId: item.ingredientId,
              ingredientName: item.ingredient?.name || null,
              ingredientUnit: item.ingredient?.unit || null,
              proportionPercent: item.proportionPercent,
              sequence: item.sequence,
          }))
        : undefined,
    createdAt: toIso(feed.createdAt),
    updatedAt: toIso(feed.updatedAt),
});

const serializeNutritionPlan = (plan) => ({
    id: plan.id,
    farmId: plan.farmId,
    nome: plan.nome,
    fase: plan.fase,
    objetivo: plan.objetivo,
    startAt: toIso(plan.startAt),
    endAt: toIso(plan.endAt),
    metaGmd: plan.metaGmd,
    preparedFeedId: plan.preparedFeedId,
    phaseId: plan.phaseId,
    feedingSlot: plan.feedingSlot,
    plannedIntakeNaturalKgPerHead: plan.plannedIntakeNaturalKgPerHead,
    plannedIntakeDryKgPerHead: plan.plannedIntakeDryKgPerHead,
    plannedIntakeNaturalKgTotal: plan.plannedIntakeNaturalKgTotal,
    plannedIntakeDryKgTotal: plan.plannedIntakeDryKgTotal,
    estimatedCostPerHeadDay: plan.estimatedCostPerHeadDay,
    versionNumber: plan.versionNumber,
    previousVersionId: plan.previousVersionId,
    status: plan.status,
    observacoes: plan.observacoes,
    reviewStatus: plan.reviewStatus,
    preparedFeed: plan.preparedFeed ? serializeNutritionPreparedFeed(plan.preparedFeed) : null,
    phase: plan.phase ? serializeNutritionPhase(plan.phase) : null,
    createdAt: toIso(plan.createdAt),
    updatedAt: toIso(plan.updatedAt),
});

const serializeNutritionAssignment = (assignment) => ({
    id: assignment.id,
    farmId: assignment.farmId,
    planId: assignment.planId,
    lotId: assignment.lotId,
    poLotId: assignment.poLotId,
    animalId: assignment.animalId,
    poAnimalId: assignment.poAnimalId,
    unitId: assignment.unitId,
    startAt: toIso(assignment.startAt),
    endAt: toIso(assignment.endAt),
    reviewStatus: assignment.reviewStatus,
    plan: assignment.plan ? serializeNutritionPlan(assignment.plan) : null,
    unit: assignment.unit ? serializeNutritionUnit(assignment.unit) : null,
    createdAt: toIso(assignment.createdAt),
    updatedAt: toIso(assignment.updatedAt),
});

const serializeNutritionFabrication = (fabrication) => ({
    id: fabrication.id,
    farmId: fabrication.farmId,
    preparedFeedId: fabrication.preparedFeedId,
    batchCode: fabrication.batchCode,
    producedAt: toIso(fabrication.producedAt),
    outputNaturalKg: fabrication.outputNaturalKg,
    outputDryKg: fabrication.outputDryKg,
    remainingNaturalKg: fabrication.remainingNaturalKg,
    remainingDryKg: fabrication.remainingDryKg,
    totalCost: fabrication.totalCost,
    costPerNaturalKg: fabrication.costPerNaturalKg,
    costPerDryKg: fabrication.costPerDryKg,
    status: fabrication.status,
    notes: fabrication.notes,
    createdByUserId: fabrication.createdByUserId,
    createdByName: fabrication.createdByName,
    approvedAt: toIso(fabrication.approvedAt),
    approvedByUserId: fabrication.approvedByUserId,
    approvedByName: fabrication.approvedByName,
    canceledAt: toIso(fabrication.canceledAt),
    canceledByUserId: fabrication.canceledByUserId,
    canceledByName: fabrication.canceledByName,
    cancelReason: fabrication.cancelReason,
    preparedFeed: fabrication.preparedFeed ? serializeNutritionPreparedFeed(fabrication.preparedFeed) : null,
    items: Array.isArray(fabrication.items)
        ? fabrication.items.map((item) => ({
              id: item.id,
              ingredientId: item.ingredientId,
              ingredientName: item.ingredientName,
              quantityNaturalKg: item.quantityNaturalKg,
              quantityDryKg: item.quantityDryKg,
              dryMatterPercent: item.dryMatterPercent,
              unitCost: item.unitCost,
              lineCost: item.lineCost,
          }))
        : undefined,
    createdAt: toIso(fabrication.createdAt),
    updatedAt: toIso(fabrication.updatedAt),
});

const serializeNutritionExecution = (execution) => ({
    id: execution.id,
    farmId: execution.farmId,
    lotId: execution.lotId,
    poLotId: execution.poLotId,
    unitId: execution.unitId,
    planId: execution.planId,
    preparedFeedId: execution.preparedFeedId,
    fabricationId: execution.fabricationId,
    date: toIso(execution.date),
    feedingSlot: execution.feedingSlot,
    plannedNaturalKg: execution.plannedNaturalKg,
    plannedDryMatterKg: execution.plannedDryMatterKg,
    actualNaturalKg: execution.actualNaturalKg,
    actualDryMatterKg: execution.actualDryMatterKg,
    refusalNaturalKg: execution.refusalNaturalKg,
    refusalDryMatterKg: execution.refusalDryMatterKg,
    headCountSnapshot: execution.headCountSnapshot,
    totalCost: execution.totalCost,
    costPerHeadDay: execution.costPerHeadDay,
    notes: execution.notes,
    reviewStatus: execution.reviewStatus,
    createdByUserId: execution.createdByUserId,
    createdByName: execution.createdByName,
    approvedAt: toIso(execution.approvedAt),
    approvedByUserId: execution.approvedByUserId,
    approvedByName: execution.approvedByName,
    rejectedAt: toIso(execution.rejectedAt),
    rejectedByUserId: execution.rejectedByUserId,
    rejectedByName: execution.rejectedByName,
    rejectionReason: execution.rejectionReason,
    canceledAt: toIso(execution.canceledAt),
    canceledByUserId: execution.canceledByUserId,
    canceledByName: execution.canceledByName,
    cancelReason: execution.cancelReason,
    unit: execution.unit ? serializeNutritionUnit(execution.unit) : null,
    plan: execution.plan ? serializeNutritionPlan(execution.plan) : null,
    preparedFeed: execution.preparedFeed ? serializeNutritionPreparedFeed(execution.preparedFeed) : null,
    fabrication: execution.fabrication ? serializeNutritionFabrication(execution.fabrication) : null,
    createdAt: toIso(execution.createdAt),
    updatedAt: toIso(execution.updatedAt),
});

const serializeNutritionTroughReading = (reading) => ({
    id: reading.id,
    farmId: reading.farmId,
    unitId: reading.unitId,
    date: toIso(reading.date),
    readingType: reading.readingType,
    score: reading.score,
    supplyObservation: reading.supplyObservation,
    observedDryMatterPercent: reading.observedDryMatterPercent,
    animalBehavior: reading.animalBehavior,
    notes: reading.notes,
    reviewStatus: reading.reviewStatus,
    suggestedAdjustmentPercent: reading.suggestedAdjustmentPercent,
    suggestedNextNaturalKg: reading.suggestedNextNaturalKg,
    suggestedNextDryKg: reading.suggestedNextDryKg,
    syncSource: reading.syncSource,
    createdByUserId: reading.createdByUserId,
    createdByName: reading.createdByName,
    approvedAt: toIso(reading.approvedAt),
    approvedByUserId: reading.approvedByUserId,
    approvedByName: reading.approvedByName,
    rejectedAt: toIso(reading.rejectedAt),
    rejectedByUserId: reading.rejectedByUserId,
    rejectedByName: reading.rejectedByName,
    rejectionReason: reading.rejectionReason,
    unit: reading.unit ? serializeNutritionUnit(reading.unit) : null,
    createdAt: toIso(reading.createdAt),
    updatedAt: toIso(reading.updatedAt),
});

const ensureNutritionSettings = async (prisma, farmId) => {
    const existing = await prisma.nutritionSettings.findUnique({ where: { farmId } });
    if (existing) {
        return existing;
    }
    return prisma.nutritionSettings.create({ data: { farmId } });
};

const resolveNutritionFarm = async (prisma, req, buildFarmScopeFilter, farmId) => {
    if (!farmId) {
        return null;
    }
    return prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
};

const getLotHeadCountMap = async (prisma, farmId) => {
    const rows = await prisma.animal.groupBy({
        by: ['lotId'],
        where: {
            farmId,
            lotId: { not: null },
        },
        _count: { _all: true },
    });
    const map = new Map();
    rows.forEach((row) => {
        if (row.lotId) {
            map.set(row.lotId, row._count._all);
        }
    });
    return map;
};

const getLotGmdMap = async (prisma, farmId) => {
    const rows = await prisma.animal.groupBy({
        by: ['lotId'],
        where: {
            farmId,
            lotId: { not: null },
            gmd: { not: null },
        },
        _avg: { gmd: true },
    });
    const map = new Map();
    rows.forEach((row) => {
        if (row.lotId) {
            map.set(row.lotId, row._avg.gmd ?? null);
        }
    });
    return map;
};

const resolveUnitHeadCount = (unit, lotHeadCounts) => {
    if (Number.isInteger(unit.currentHeadCount) && unit.currentHeadCount >= 0) {
        return unit.currentHeadCount;
    }
    if (unit.lotId && lotHeadCounts.has(unit.lotId)) {
        return lotHeadCounts.get(unit.lotId);
    }
    return 0;
};

const buildPreparedFeedRecipeMetrics = async (prisma, farmId, items, expectedYieldNaturalKg) => {
    if (!Array.isArray(items) || !items.length) {
        throw new Error('Informe os ingredientes da ração preparada.');
    }
    if (!Number.isFinite(expectedYieldNaturalKg) || expectedYieldNaturalKg <= 0) {
        throw new Error('Rendimento total inválido.');
    }
    const normalizedItems = items.map((item, index) => ({
        ingredientId: String(item.ingredientId || ''),
        proportionPercent: Number(item.proportionPercent),
        sequence: Number.isInteger(item.sequence) ? item.sequence : index,
    }));
    if (normalizedItems.some((item) => !item.ingredientId || !Number.isFinite(item.proportionPercent) || item.proportionPercent <= 0)) {
        throw new Error('Ingredientes e proporções da ração preparada são obrigatórios.');
    }
    const totalProportion = normalizedItems.reduce((sum, item) => sum + item.proportionPercent, 0);
    if (Math.abs(totalProportion - 100) > 0.01) {
        throw new Error('A soma das proporções da ração preparada deve ser 100%.');
    }
    const ingredients = await prisma.nutritionIngredient.findMany({
        where: {
            farmId,
            id: { in: normalizedItems.map((item) => item.ingredientId) },
        },
    });
    if (ingredients.length !== normalizedItems.length) {
        throw new Error('Um ou mais ingredientes não foram encontrados.');
    }
    const ingredientMap = new Map(ingredients.map((item) => [item.id, item]));
    const resolvedItems = normalizedItems.map((item) => {
        const ingredient = ingredientMap.get(item.ingredientId);
        if (!ingredient || !ingredient.active) {
            throw new Error('Ingrediente inativo não pode entrar em nova ração preparada.');
        }
        const quantityNaturalKg = roundNutrition(expectedYieldNaturalKg * (item.proportionPercent / 100));
        const quantityDryKg = calculateDryMatterKg(quantityNaturalKg, ingredient.currentDryMatterPercent) || 0;
        const lineCost = roundNutrition(quantityNaturalKg * ingredient.currentCost) || 0;
        return {
            ingredient,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            proportionPercent: item.proportionPercent,
            sequence: item.sequence,
            quantityNaturalKg,
            quantityDryKg,
            dryMatterPercent: ingredient.currentDryMatterPercent,
            unitCost: ingredient.currentCost,
            lineCost,
        };
    });
    const totalCost = roundNutrition(resolvedItems.reduce((sum, item) => sum + (item.lineCost || 0), 0)) || 0;
    const totalDryKg = roundNutrition(resolvedItems.reduce((sum, item) => sum + (item.quantityDryKg || 0), 0)) || 0;
    const dryMatterPercent = expectedYieldNaturalKg > 0 ? roundNutrition((totalDryKg / expectedYieldNaturalKg) * 100) || 0 : 0;
    return {
        resolvedItems,
        totalCost,
        totalDryKg,
        dryMatterPercent,
        costPerNaturalKg: expectedYieldNaturalKg > 0 ? roundNutrition(totalCost / expectedYieldNaturalKg) || 0 : 0,
        costPerDryKg: totalDryKg > 0 ? roundNutrition(totalCost / totalDryKg) || 0 : null,
    };
};

const resolvePlanQuantities = (plan, headCount, dryMatterPercent) => {
    const perHeadNatural = Number.isFinite(plan?.plannedIntakeNaturalKgPerHead)
        ? plan.plannedIntakeNaturalKgPerHead
        : calculateNaturalMatterKg(plan?.plannedIntakeDryKgPerHead, dryMatterPercent);
    const perHeadDry = Number.isFinite(plan?.plannedIntakeDryKgPerHead)
        ? plan.plannedIntakeDryKgPerHead
        : calculateDryMatterKg(plan?.plannedIntakeNaturalKgPerHead, dryMatterPercent);
    const totalNaturalFromPlan = Number.isFinite(plan?.plannedIntakeNaturalKgTotal)
        ? plan.plannedIntakeNaturalKgTotal
        : null;
    const totalDryFromPlan = Number.isFinite(plan?.plannedIntakeDryKgTotal)
        ? plan.plannedIntakeDryKgTotal
        : null;

    const totalNatural = totalNaturalFromPlan !== null
        ? totalNaturalFromPlan
        : Number.isFinite(perHeadNatural) && Number.isFinite(headCount)
        ? roundNutrition(perHeadNatural * headCount)
        : calculateNaturalMatterKg(totalDryFromPlan, dryMatterPercent);
    const totalDry = totalDryFromPlan !== null
        ? totalDryFromPlan
        : Number.isFinite(perHeadDry) && Number.isFinite(headCount)
        ? roundNutrition(perHeadDry * headCount)
        : calculateDryMatterKg(totalNaturalFromPlan, dryMatterPercent);

    return {
        perHeadNatural: roundNutrition(perHeadNatural),
        perHeadDry: roundNutrition(perHeadDry),
        totalNatural: roundNutrition(totalNatural),
        totalDry: roundNutrition(totalDry),
    };
};

const buildNutritionSuggestion = (plan, headCount, score) => {
    const dryMatterPercent = plan?.preparedFeed?.currentDryMatterPercent ?? null;
    const targets = resolvePlanQuantities(plan, headCount, dryMatterPercent);
    const adjustmentPercent = getAdjustmentPercentByScore(score);
    if (!Number.isFinite(targets.totalNatural)) {
        return {
            adjustmentPercent,
            nextNaturalKg: null,
            nextDryKg: null,
        };
    }
    const nextNaturalKg = roundNutrition(targets.totalNatural * (1 + adjustmentPercent / 100));
    const nextDryKg = dryMatterPercent !== null ? calculateDryMatterKg(nextNaturalKg, dryMatterPercent) : null;
    return {
        adjustmentPercent,
        nextNaturalKg,
        nextDryKg,
    };
};

const buildIngredientRiskList = async (prisma, farmId, settings) => {
    const ingredients = await prisma.nutritionIngredient.findMany({
        where: { farmId, active: true },
        orderBy: { name: 'asc' },
    });
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 2);
    const fabricationItems = await prisma.nutritionFabricationItem.findMany({
        where: {
            fabrication: {
                farmId,
                producedAt: { gte: since },
            },
        },
        include: {
            fabrication: true,
        },
    });
    const dailyConsumption = new Map();
    fabricationItems.forEach((item) => {
        if (!matchesOfficialFabrication(item.fabrication, settings)) {
            return;
        }
        dailyConsumption.set(
            item.ingredientId,
            (dailyConsumption.get(item.ingredientId) || 0) + (item.quantityNaturalKg || 0),
        );
    });

    return ingredients.map((ingredient) => {
        const averagePerDay = roundNutrition((dailyConsumption.get(ingredient.id) || 0) / 3) || 0;
        const daysRemaining = averagePerDay > 0 ? roundNutrition(ingredient.currentStockNatural / averagePerDay, 1) : null;
        let level = 'safe';
        let message = 'Estoque seguro';
        if (daysRemaining !== null && daysRemaining < settings.predictiveWarningDays) {
            level = 'critical';
            message = 'Crítico: risco de falta imediata';
        } else if (daysRemaining !== null && daysRemaining < settings.predictiveSafeDays) {
            level = 'warning';
            message = 'Atenção: pode acabar em breve';
        }
        return {
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            currentStockNatural: ingredient.currentStockNatural,
            currentStockDry: calculateDryMatterKg(ingredient.currentStockNatural, ingredient.currentDryMatterPercent),
            averagePerDay,
            daysRemaining,
            level,
            message,
        };
    });
};

const registerNutritionModuleRoutes = ({ app, prisma, parseNumber, parseDateValue, buildFarmScopeFilter }) => {
    app.get('/nutrition/module/settings', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const settings = await ensureNutritionSettings(prisma, farm.id);
            return res.json({ settings: serializeNutritionSettings(settings) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar parâmetros da nutrição.' });
        }
    });

    app.put('/nutrition/module/settings', async (req, res) => {
        const { farmId, operationContext, adjustmentMode, indicatorsApprovedOnly, requireFabricationApproval, requireExecutionApproval, requireTroughApproval, predictiveSafeDays, predictiveWarningDays, diffWarningPercent, diffCriticalPercent, manualReviewThresholdPercent } = req.body || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const normalizedContext = normalizeNutritionOperationContext(operationContext);
        const normalizedMode = normalizeNutritionAdjustmentMode(adjustmentMode);
        if (operationContext !== undefined && !normalizedContext) {
            return res.status(400).json({ message: 'Contexto operacional inválido.' });
        }
        if (adjustmentMode !== undefined && !normalizedMode) {
            return res.status(400).json({ message: 'Modo de ajuste inválido.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const settings = await prisma.nutritionSettings.upsert({
                where: { farmId: farm.id },
                create: {
                    farmId: farm.id,
                    operationContext: normalizedContext || 'PASTO',
                    adjustmentMode: normalizedMode || 'SUGESTAO',
                    indicatorsApprovedOnly: Boolean(indicatorsApprovedOnly),
                    requireFabricationApproval: requireFabricationApproval !== false,
                    requireExecutionApproval: requireExecutionApproval !== false,
                    requireTroughApproval: requireTroughApproval !== false,
                    predictiveSafeDays: Number.isInteger(Number(predictiveSafeDays)) ? Number(predictiveSafeDays) : 7,
                    predictiveWarningDays: Number.isInteger(Number(predictiveWarningDays)) ? Number(predictiveWarningDays) : 3,
                    diffWarningPercent: parseNumber(diffWarningPercent) ?? 3,
                    diffCriticalPercent: parseNumber(diffCriticalPercent) ?? 7,
                    manualReviewThresholdPercent: parseNumber(manualReviewThresholdPercent) ?? 5,
                },
                update: {
                    ...(normalizedContext ? { operationContext: normalizedContext } : {}),
                    ...(normalizedMode ? { adjustmentMode: normalizedMode } : {}),
                    ...(indicatorsApprovedOnly !== undefined ? { indicatorsApprovedOnly: Boolean(indicatorsApprovedOnly) } : {}),
                    ...(requireFabricationApproval !== undefined ? { requireFabricationApproval: Boolean(requireFabricationApproval) } : {}),
                    ...(requireExecutionApproval !== undefined ? { requireExecutionApproval: Boolean(requireExecutionApproval) } : {}),
                    ...(requireTroughApproval !== undefined ? { requireTroughApproval: Boolean(requireTroughApproval) } : {}),
                    ...(predictiveSafeDays !== undefined ? { predictiveSafeDays: Math.max(1, Number(predictiveSafeDays) || 7) } : {}),
                    ...(predictiveWarningDays !== undefined ? { predictiveWarningDays: Math.max(1, Number(predictiveWarningDays) || 3) } : {}),
                    ...(diffWarningPercent !== undefined ? { diffWarningPercent: parseNumber(diffWarningPercent) ?? 3 } : {}),
                    ...(diffCriticalPercent !== undefined ? { diffCriticalPercent: parseNumber(diffCriticalPercent) ?? 7 } : {}),
                    ...(manualReviewThresholdPercent !== undefined ? { manualReviewThresholdPercent: parseNumber(manualReviewThresholdPercent) ?? 5 } : {}),
                },
            });
            return res.json({ settings: serializeNutritionSettings(settings) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar parâmetros da nutrição.' });
        }
    });

    app.get('/nutrition/module/ingredients', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionIngredient.count({ where: { farmId: farm.id } }),
                prisma.nutritionIngredient.findMany({
                    where: { farmId: farm.id },
                    include: {
                        priceHistory: { orderBy: { recordedAt: 'desc' }, take: 5 },
                        dryMatterHistory: { orderBy: { recordedAt: 'desc' }, take: 5 },
                    },
                    orderBy: { name: 'asc' },
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionIngredient), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar ingredientes.' });
        }
    });

    app.post('/nutrition/module/ingredients', async (req, res) => {
        const { farmId, name, category, unit, cost, supplier, dryMatterPercent, stockNatural, minStockNatural, active, notes } = req.body || {};
        if (!farmId || !name?.trim() || !category?.trim() || !unit?.trim()) {
            return res.status(400).json({ message: 'Nome, categoria e unidade são obrigatórios.' });
        }
        const parsedCost = parsePositiveNumber(parseNumber, cost);
        const parsedDryMatter = parsePositiveNumber(parseNumber, dryMatterPercent);
        if (parsedCost === null) {
            return res.status(400).json({ message: 'Custo inválido.' });
        }
        if (parsedDryMatter === null || parsedDryMatter > 100) {
            return res.status(400).json({ message: 'Matéria seca inválida.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const actor = getNutritionActor(req);
            const now = new Date();
            const ingredient = await prisma.$transaction(async (tx) => {
                const created = await tx.nutritionIngredient.create({
                    data: {
                        farmId: farm.id,
                        name: name.trim(),
                        category: category.trim(),
                        unit: unit.trim(),
                        currentCost: parsedCost,
                        supplier: normalizeOptionalText(supplier),
                        currentDryMatterPercent: parsedDryMatter,
                        dryMatterUpdatedAt: now,
                        currentStockNatural: parseNumber(stockNatural) ?? 0,
                        minStockNatural: parseNumber(minStockNatural) ?? 0,
                        active: active !== false,
                    },
                    include: {
                        priceHistory: true,
                        dryMatterHistory: true,
                    },
                });
                await tx.nutritionIngredientCostHistory.create({
                    data: {
                        ingredientId: created.id,
                        cost: parsedCost,
                        recordedAt: now,
                        notes: normalizeOptionalText(notes),
                        createdByUserId: actor.userId,
                        createdByName: actor.name,
                    },
                });
                await tx.nutritionIngredientDryMatterHistory.create({
                    data: {
                        ingredientId: created.id,
                        dryMatterPercent: parsedDryMatter,
                        recordedAt: now,
                        notes: normalizeOptionalText(notes),
                        createdByUserId: actor.userId,
                        createdByName: actor.name,
                    },
                });
                return tx.nutritionIngredient.findUnique({
                    where: { id: created.id },
                    include: {
                        priceHistory: { orderBy: { recordedAt: 'desc' }, take: 5 },
                        dryMatterHistory: { orderBy: { recordedAt: 'desc' }, take: 5 },
                    },
                });
            });
            return res.status(201).json({ item: serializeNutritionIngredient(ingredient) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar ingrediente.' });
        }
    });

    app.patch('/nutrition/module/ingredients/:id', async (req, res) => {
        const { id } = req.params;
        const updates = req.body || {};
        try {
            const ingredient = await prisma.nutritionIngredient.findFirst({
                where: {
                    id: String(id),
                    farm: buildFarmScopeFilter(req),
                },
            });
            if (!ingredient) {
                return res.status(404).json({ message: 'Ingrediente não encontrado.' });
            }
            const actor = getNutritionActor(req);
            const now = new Date();
            const data = {};
            const createCostHistory = updates.cost !== undefined;
            const createDryHistory = updates.dryMatterPercent !== undefined;
            if (updates.name !== undefined) {
                if (!String(updates.name || '').trim()) {
                    return res.status(400).json({ message: 'Nome inválido.' });
                }
                data.name = String(updates.name).trim();
            }
            if (updates.category !== undefined) {
                if (!String(updates.category || '').trim()) {
                    return res.status(400).json({ message: 'Categoria inválida.' });
                }
                data.category = String(updates.category).trim();
            }
            if (updates.unit !== undefined) {
                if (!String(updates.unit || '').trim()) {
                    return res.status(400).json({ message: 'Unidade inválida.' });
                }
                data.unit = String(updates.unit).trim();
            }
            if (updates.cost !== undefined) {
                const parsed = parsePositiveNumber(parseNumber, updates.cost);
                if (parsed === null) {
                    return res.status(400).json({ message: 'Custo inválido.' });
                }
                data.currentCost = parsed;
            }
            if (updates.supplier !== undefined) {
                data.supplier = normalizeOptionalText(updates.supplier);
            }
            if (updates.dryMatterPercent !== undefined) {
                const parsed = parsePositiveNumber(parseNumber, updates.dryMatterPercent);
                if (parsed === null || parsed > 100) {
                    return res.status(400).json({ message: 'Matéria seca inválida.' });
                }
                data.currentDryMatterPercent = parsed;
                data.dryMatterUpdatedAt = now;
            }
            if (updates.stockNatural !== undefined) {
                const parsed = parseNumber(updates.stockNatural);
                if (parsed === null || parsed < 0) {
                    return res.status(400).json({ message: 'Estoque atual inválido.' });
                }
                data.currentStockNatural = parsed;
            }
            if (updates.minStockNatural !== undefined) {
                const parsed = parseNumber(updates.minStockNatural);
                if (parsed === null || parsed < 0) {
                    return res.status(400).json({ message: 'Estoque mínimo inválido.' });
                }
                data.minStockNatural = parsed;
            }
            if (updates.active !== undefined) {
                data.active = Boolean(updates.active);
            }
            const updated = await prisma.$transaction(async (tx) => {
                await tx.nutritionIngredient.update({ where: { id: ingredient.id }, data });
                if (createCostHistory) {
                    await tx.nutritionIngredientCostHistory.create({
                        data: {
                            ingredientId: ingredient.id,
                            cost: data.currentCost,
                            recordedAt: now,
                            notes: normalizeOptionalText(updates.notes),
                            createdByUserId: actor.userId,
                            createdByName: actor.name,
                        },
                    });
                }
                if (createDryHistory) {
                    await tx.nutritionIngredientDryMatterHistory.create({
                        data: {
                            ingredientId: ingredient.id,
                            dryMatterPercent: data.currentDryMatterPercent,
                            recordedAt: now,
                            notes: normalizeOptionalText(updates.notes),
                            createdByUserId: actor.userId,
                            createdByName: actor.name,
                        },
                    });
                }
                return tx.nutritionIngredient.findUnique({
                    where: { id: ingredient.id },
                    include: {
                        priceHistory: { orderBy: { recordedAt: 'desc' }, take: 5 },
                        dryMatterHistory: { orderBy: { recordedAt: 'desc' }, take: 5 },
                    },
                });
            });
            return res.json({ item: serializeNutritionIngredient(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar ingrediente.' });
        }
    });

    app.get('/nutrition/module/phases', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionPhase.count({ where: { farmId: farm.id } }),
                prisma.nutritionPhase.findMany({
                    where: { farmId: farm.id },
                    orderBy: [{ active: 'desc' }, { name: 'asc' }],
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionPhase), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar fases.' });
        }
    });

    app.post('/nutrition/module/phases', async (req, res) => {
        const { farmId, name, periodStart, periodEnd, targetIntakeDryKgHead, targetGmd, targetFeedConversion, targetCostPerHeadDay, notes, active } = req.body || {};
        if (!farmId || !name?.trim()) {
            return res.status(400).json({ message: 'Informe a fazenda e o nome da fase.' });
        }
        const parsedStart = periodStart ? parseDateValue(periodStart) : null;
        const parsedEnd = periodEnd ? parseDateValue(periodEnd) : null;
        if ((periodStart && !parsedStart) || (periodEnd && !parsedEnd)) {
            return res.status(400).json({ message: 'Período inválido.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const phase = await prisma.nutritionPhase.create({
                data: {
                    farmId: farm.id,
                    name: name.trim(),
                    periodStart: parsedStart,
                    periodEnd: parsedEnd,
                    targetIntakeDryKgHead: parseNumber(targetIntakeDryKgHead),
                    targetGmd: parseNumber(targetGmd),
                    targetFeedConversion: parseNumber(targetFeedConversion),
                    targetCostPerHeadDay: parseNumber(targetCostPerHeadDay),
                    notes: normalizeOptionalText(notes),
                    active: active !== false,
                },
            });
            return res.status(201).json({ item: serializeNutritionPhase(phase) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar fase.' });
        }
    });

    app.patch('/nutrition/module/phases/:id', async (req, res) => {
        const { id } = req.params;
        const updates = req.body || {};
        try {
            const phase = await prisma.nutritionPhase.findFirst({
                where: {
                    id: String(id),
                    farm: buildFarmScopeFilter(req),
                },
            });
            if (!phase) {
                return res.status(404).json({ message: 'Fase não encontrada.' });
            }
            const data = {};
            if (updates.name !== undefined) {
                if (!String(updates.name || '').trim()) {
                    return res.status(400).json({ message: 'Nome inválido.' });
                }
                data.name = String(updates.name).trim();
            }
            if (updates.periodStart !== undefined) {
                data.periodStart = updates.periodStart ? parseDateValue(updates.periodStart) : null;
            }
            if (updates.periodEnd !== undefined) {
                data.periodEnd = updates.periodEnd ? parseDateValue(updates.periodEnd) : null;
            }
            if (updates.targetIntakeDryKgHead !== undefined) {
                data.targetIntakeDryKgHead = parseNumber(updates.targetIntakeDryKgHead);
            }
            if (updates.targetGmd !== undefined) {
                data.targetGmd = parseNumber(updates.targetGmd);
            }
            if (updates.targetFeedConversion !== undefined) {
                data.targetFeedConversion = parseNumber(updates.targetFeedConversion);
            }
            if (updates.targetCostPerHeadDay !== undefined) {
                data.targetCostPerHeadDay = parseNumber(updates.targetCostPerHeadDay);
            }
            if (updates.notes !== undefined) {
                data.notes = normalizeOptionalText(updates.notes);
            }
            if (updates.active !== undefined) {
                data.active = Boolean(updates.active);
            }
            const updated = await prisma.nutritionPhase.update({ where: { id: phase.id }, data });
            return res.json({ item: serializeNutritionPhase(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar fase.' });
        }
    });

    app.get('/nutrition/module/units', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const lotHeadCounts = await getLotHeadCountMap(prisma, farm.id);
            const [total, units] = await prisma.$transaction([
                prisma.nutritionUnit.count({ where: { farmId: farm.id } }),
                prisma.nutritionUnit.findMany({
                    where: { farmId: farm.id },
                    include: { lot: true, phase: true },
                    orderBy: [{ active: 'desc' }, { name: 'asc' }],
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({
                items: units.map((item) => serializeNutritionUnit(item, resolveUnitHeadCount(item, lotHeadCounts))),
                total,
                limit,
                offset,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar baias e pontos de trato.' });
        }
    });

    app.post('/nutrition/module/units', async (req, res) => {
        const { farmId, type, lotId, phaseId, name, currentHeadCount, active, notes } = req.body || {};
        if (!farmId || !type) {
            return res.status(400).json({ message: 'Informe a fazenda e o tipo da unidade.' });
        }
        const normalizedType = normalizeNutritionUnitType(type);
        if (!normalizedType) {
            return res.status(400).json({ message: 'Tipo de unidade inválido.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const settings = await ensureNutritionSettings(prisma, farm.id);
            if (settings.operationContext === 'CONFINAMENTO' && normalizedType !== 'BAIA') {
                return res.status(400).json({ message: 'No confinamento, a unidade principal deve ser a baia.' });
            }
            if (settings.operationContext !== 'CONFINAMENTO' && normalizedType === 'BAIA') {
                return res.status(400).json({ message: 'Baia só pode ser usada quando o contexto da fazenda for confinamento.' });
            }
            let lot = null;
            if (lotId) {
                lot = await prisma.lot.findFirst({ where: { id: String(lotId), farmId: farm.id } });
                if (!lot) {
                    return res.status(404).json({ message: 'Lote não encontrado.' });
                }
            }
            if (normalizedType === 'LOTE' && !lot) {
                return res.status(400).json({ message: 'Unidade do tipo lote precisa de um lote vinculado.' });
            }
            let phase = null;
            if (phaseId) {
                phase = await prisma.nutritionPhase.findFirst({ where: { id: String(phaseId), farmId: farm.id } });
                if (!phase) {
                    return res.status(404).json({ message: 'Fase não encontrada.' });
                }
            }
            const unit = await prisma.nutritionUnit.create({
                data: {
                    farmId: farm.id,
                    type: normalizedType,
                    lotId: lot?.id || null,
                    phaseId: phase?.id || null,
                    name: normalizeOptionalText(name) || lot?.name || normalizedType,
                    currentHeadCount: Number.isInteger(Number(currentHeadCount)) ? Number(currentHeadCount) : null,
                    active: active !== false,
                    notes: normalizeOptionalText(notes),
                },
                include: { lot: true, phase: true },
            });
            const lotHeadCounts = await getLotHeadCountMap(prisma, farm.id);
            return res.status(201).json({ item: serializeNutritionUnit(unit, resolveUnitHeadCount(unit, lotHeadCounts)) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar unidade operacional.' });
        }
    });

    app.patch('/nutrition/module/units/:id', async (req, res) => {
        const { id } = req.params;
        const updates = req.body || {};
        try {
            const unit = await prisma.nutritionUnit.findFirst({
                where: {
                    id: String(id),
                    farm: buildFarmScopeFilter(req),
                },
                include: { lot: true, phase: true },
            });
            if (!unit) {
                return res.status(404).json({ message: 'Unidade não encontrada.' });
            }
            const settings = await ensureNutritionSettings(prisma, unit.farmId);
            const data = {};
            if (updates.type !== undefined) {
                const normalizedType = normalizeNutritionUnitType(updates.type);
                if (!normalizedType) {
                    return res.status(400).json({ message: 'Tipo de unidade inválido.' });
                }
                if (settings.operationContext === 'CONFINAMENTO' && normalizedType !== 'BAIA') {
                    return res.status(400).json({ message: 'No confinamento, a unidade principal deve ser a baia.' });
                }
                if (settings.operationContext !== 'CONFINAMENTO' && normalizedType === 'BAIA') {
                    return res.status(400).json({ message: 'Baia só pode ser usada quando o contexto da fazenda for confinamento.' });
                }
                data.type = normalizedType;
            }
            if (updates.name !== undefined) {
                const normalizedName = normalizeOptionalText(updates.name);
                if (!normalizedName) {
                    return res.status(400).json({ message: 'Nome inválido.' });
                }
                data.name = normalizedName;
            }
            if (updates.currentHeadCount !== undefined) {
                const parsed = Number(updates.currentHeadCount);
                if (!Number.isInteger(parsed) || parsed < 0) {
                    return res.status(400).json({ message: 'Quantidade de cabeças inválida.' });
                }
                data.currentHeadCount = parsed;
            }
            if (updates.active !== undefined) {
                data.active = Boolean(updates.active);
            }
            if (updates.notes !== undefined) {
                data.notes = normalizeOptionalText(updates.notes);
            }
            if (updates.phaseId !== undefined) {
                if (!updates.phaseId) {
                    data.phaseId = null;
                } else {
                    const phase = await prisma.nutritionPhase.findFirst({ where: { id: String(updates.phaseId), farmId: unit.farmId } });
                    if (!phase) {
                        return res.status(404).json({ message: 'Fase não encontrada.' });
                    }
                    data.phaseId = phase.id;
                }
            }
            if (updates.lotId !== undefined) {
                if (!updates.lotId) {
                    data.lotId = null;
                } else {
                    const lot = await prisma.lot.findFirst({ where: { id: String(updates.lotId), farmId: unit.farmId } });
                    if (!lot) {
                        return res.status(404).json({ message: 'Lote não encontrado.' });
                    }
                    data.lotId = lot.id;
                }
            }
            const updated = await prisma.nutritionUnit.update({
                where: { id: unit.id },
                data,
                include: { lot: true, phase: true },
            });
            const lotHeadCounts = await getLotHeadCountMap(prisma, unit.farmId);
            return res.json({ item: serializeNutritionUnit(updated, resolveUnitHeadCount(updated, lotHeadCounts)) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar unidade operacional.' });
        }
    });

    app.get('/nutrition/module/prepared-feeds', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionPreparedFeed.count({ where: { farmId: farm.id } }),
                prisma.nutritionPreparedFeed.findMany({
                    where: { farmId: farm.id },
                    include: {
                        items: {
                            include: { ingredient: true },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                    orderBy: { name: 'asc' },
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionPreparedFeed), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar rações preparadas.' });
        }
    });

    app.post('/nutrition/module/prepared-feeds', async (req, res) => {
        const { farmId, name, expectedYieldNaturalKg, items, notes, status } = req.body || {};
        if (!farmId || !name?.trim()) {
            return res.status(400).json({ message: 'Informe a fazenda e o nome da ração preparada.' });
        }
        const yieldNatural = parsePositiveNumber(parseNumber, expectedYieldNaturalKg);
        if (yieldNatural === null) {
            return res.status(400).json({ message: 'Rendimento total inválido.' });
        }
        const normalizedStatus = status ? normalizeNutritionPreparedFeedStatus(status) : 'ACTIVE';
        if (!normalizedStatus) {
            return res.status(400).json({ message: 'Status inválido.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const metrics = await buildPreparedFeedRecipeMetrics(prisma, farm.id, items, yieldNatural);
            const feed = await prisma.$transaction(async (tx) => {
                const created = await tx.nutritionPreparedFeed.create({
                    data: {
                        farmId: farm.id,
                        name: name.trim(),
                        expectedYieldNaturalKg: yieldNatural,
                        expectedYieldDryKg: metrics.totalDryKg,
                        currentDryMatterPercent: metrics.dryMatterPercent,
                        currentTotalCost: metrics.totalCost,
                        currentCostPerNaturalKg: metrics.costPerNaturalKg,
                        currentCostPerDryKg: metrics.costPerDryKg,
                        status: normalizedStatus,
                        notes: normalizeOptionalText(notes),
                    },
                });
                if (metrics.resolvedItems.length) {
                    await tx.nutritionPreparedFeedItem.createMany({
                        data: metrics.resolvedItems.map((item) => ({
                            preparedFeedId: created.id,
                            ingredientId: item.ingredientId,
                            proportionPercent: item.proportionPercent,
                            sequence: item.sequence,
                        })),
                    });
                }
                return tx.nutritionPreparedFeed.findUnique({
                    where: { id: created.id },
                    include: {
                        items: {
                            include: { ingredient: true },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                });
            });
            return res.status(201).json({ item: serializeNutritionPreparedFeed(feed) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: error?.message || 'Erro ao salvar ração preparada.' });
        }
    });

    app.patch('/nutrition/module/prepared-feeds/:id', async (req, res) => {
        const { id } = req.params;
        const updates = req.body || {};
        try {
            const preparedFeed = await prisma.nutritionPreparedFeed.findFirst({
                where: {
                    id: String(id),
                    farm: buildFarmScopeFilter(req),
                },
                include: { items: true },
            });
            if (!preparedFeed) {
                return res.status(404).json({ message: 'Ração preparada não encontrada.' });
            }
            const data = {};
            if (updates.name !== undefined) {
                const normalizedName = normalizeOptionalText(updates.name);
                if (!normalizedName) {
                    return res.status(400).json({ message: 'Nome inválido.' });
                }
                data.name = normalizedName;
            }
            if (updates.notes !== undefined) {
                data.notes = normalizeOptionalText(updates.notes);
            }
            if (updates.status !== undefined) {
                const normalizedStatus = normalizeNutritionPreparedFeedStatus(updates.status);
                if (!normalizedStatus) {
                    return res.status(400).json({ message: 'Status inválido.' });
                }
                data.status = normalizedStatus;
            }
            let nextItems = null;
            if (updates.expectedYieldNaturalKg !== undefined || updates.items !== undefined) {
                const yieldNatural = parsePositiveNumber(parseNumber, updates.expectedYieldNaturalKg ?? preparedFeed.expectedYieldNaturalKg);
                if (yieldNatural === null) {
                    return res.status(400).json({ message: 'Rendimento total inválido.' });
                }
                const items = Array.isArray(updates.items)
                    ? updates.items
                    : preparedFeed.items.map((item) => ({
                          ingredientId: item.ingredientId,
                          proportionPercent: item.proportionPercent,
                          sequence: item.sequence,
                      }));
                const metrics = await buildPreparedFeedRecipeMetrics(prisma, preparedFeed.farmId, items, yieldNatural);
                data.expectedYieldNaturalKg = yieldNatural;
                data.expectedYieldDryKg = metrics.totalDryKg;
                data.currentDryMatterPercent = metrics.dryMatterPercent;
                data.currentTotalCost = metrics.totalCost;
                data.currentCostPerNaturalKg = metrics.costPerNaturalKg;
                data.currentCostPerDryKg = metrics.costPerDryKg;
                nextItems = metrics.resolvedItems;
            }
            const updated = await prisma.$transaction(async (tx) => {
                await tx.nutritionPreparedFeed.update({ where: { id: preparedFeed.id }, data });
                if (nextItems) {
                    await tx.nutritionPreparedFeedItem.deleteMany({ where: { preparedFeedId: preparedFeed.id } });
                    await tx.nutritionPreparedFeedItem.createMany({
                        data: nextItems.map((item) => ({
                            preparedFeedId: preparedFeed.id,
                            ingredientId: item.ingredientId,
                            proportionPercent: item.proportionPercent,
                            sequence: item.sequence,
                        })),
                    });
                }
                return tx.nutritionPreparedFeed.findUnique({
                    where: { id: preparedFeed.id },
                    include: {
                        items: {
                            include: { ingredient: true },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                });
            });
            return res.json({ item: serializeNutritionPreparedFeed(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: error?.message || 'Erro ao atualizar ração preparada.' });
        }
    });

    app.get('/nutrition/module/plans', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionPlan.count({ where: { farmId: farm.id } }),
                prisma.nutritionPlan.findMany({
                    where: { farmId: farm.id },
                    include: {
                        preparedFeed: {
                            include: {
                                items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } },
                            },
                        },
                        phase: true,
                    },
                    orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }],
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionPlan), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar planos de trato.' });
        }
    });

    app.post('/nutrition/module/plans', async (req, res) => {
        const { farmId, nome, objetivo, fase, phaseId, preparedFeedId, feedingSlot, startAt, endAt, metaGmd, plannedIntakeNaturalKgPerHead, plannedIntakeDryKgPerHead, plannedIntakeNaturalKgTotal, plannedIntakeDryKgTotal, estimatedCostPerHeadDay, observacoes, status } = req.body || {};
        if (!farmId || !nome?.trim() || !startAt) {
            return res.status(400).json({ message: 'Fazenda, nome e data de início são obrigatórios.' });
        }
        const parsedStart = parseDateValue(startAt);
        const parsedEnd = endAt ? parseDateValue(endAt) : null;
        if (!parsedStart || (endAt && !parsedEnd)) {
            return res.status(400).json({ message: 'Período inválido.' });
        }
        const normalizedStatus = status ? normalizeNutritionPlanStatus(status) : 'ACTIVE';
        if (!normalizedStatus) {
            return res.status(400).json({ message: 'Status do plano inválido.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            let preparedFeed = null;
            if (preparedFeedId) {
                preparedFeed = await prisma.nutritionPreparedFeed.findFirst({
                    where: { id: String(preparedFeedId), farmId: farm.id },
                    include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } },
                });
                if (!preparedFeed) {
                    return res.status(404).json({ message: 'Ração preparada não encontrada.' });
                }
            }
            let phase = null;
            if (phaseId) {
                phase = await prisma.nutritionPhase.findFirst({ where: { id: String(phaseId), farmId: farm.id } });
                if (!phase) {
                    return res.status(404).json({ message: 'Fase não encontrada.' });
                }
            }
            const dryMatterPercent = preparedFeed?.currentDryMatterPercent ?? null;
            const plannedBases = resolveFeedBases({
                naturalKg: parseNumber(plannedIntakeNaturalKgPerHead),
                dryKg: parseNumber(plannedIntakeDryKgPerHead),
                dryMatterPercent,
            });
            const totalBases = resolveFeedBases({
                naturalKg: parseNumber(plannedIntakeNaturalKgTotal),
                dryKg: parseNumber(plannedIntakeDryKgTotal),
                dryMatterPercent,
            });
            const plan = await prisma.nutritionPlan.create({
                data: {
                    farmId: farm.id,
                    nome: nome.trim(),
                    objetivo: normalizeOptionalText(objetivo),
                    fase: normalizeOptionalText(fase),
                    phaseId: phase?.id || null,
                    preparedFeedId: preparedFeed?.id || null,
                    feedingSlot: normalizeOptionalText(feedingSlot),
                    startAt: parsedStart,
                    endAt: parsedEnd,
                    metaGmd: parseNumber(metaGmd),
                    plannedIntakeNaturalKgPerHead: plannedBases.naturalKg,
                    plannedIntakeDryKgPerHead: plannedBases.dryKg,
                    plannedIntakeNaturalKgTotal: totalBases.naturalKg,
                    plannedIntakeDryKgTotal: totalBases.dryKg,
                    estimatedCostPerHeadDay: parseNumber(estimatedCostPerHeadDay),
                    observacoes: normalizeOptionalText(observacoes),
                    status: normalizedStatus,
                },
                include: {
                    preparedFeed: {
                        include: {
                            items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } },
                        },
                    },
                    phase: true,
                },
            });
            return res.status(201).json({ item: serializeNutritionPlan(plan) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar plano de trato.' });
        }
    });

    app.patch('/nutrition/module/plans/:id', async (req, res) => {
        const { id } = req.params;
        const updates = req.body || {};
        try {
            const plan = await prisma.nutritionPlan.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req) },
                include: { preparedFeed: true, phase: true },
            });
            if (!plan) {
                return res.status(404).json({ message: 'Plano de trato não encontrado.' });
            }
            const data = {};
            let preparedFeed = plan.preparedFeed;
            if (updates.nome !== undefined) {
                const normalized = normalizeOptionalText(updates.nome);
                if (!normalized) {
                    return res.status(400).json({ message: 'Nome inválido.' });
                }
                data.nome = normalized;
            }
            if (updates.objetivo !== undefined) data.objetivo = normalizeOptionalText(updates.objetivo);
            if (updates.fase !== undefined) data.fase = normalizeOptionalText(updates.fase);
            if (updates.feedingSlot !== undefined) data.feedingSlot = normalizeOptionalText(updates.feedingSlot);
            if (updates.startAt !== undefined) {
                data.startAt = updates.startAt ? parseDateValue(updates.startAt) : null;
                if (!data.startAt) {
                    return res.status(400).json({ message: 'Data de início inválida.' });
                }
            }
            if (updates.endAt !== undefined) {
                data.endAt = updates.endAt ? parseDateValue(updates.endAt) : null;
                if (updates.endAt && !data.endAt) {
                    return res.status(400).json({ message: 'Data de fim inválida.' });
                }
            }
            if (updates.metaGmd !== undefined) data.metaGmd = parseNumber(updates.metaGmd);
            if (updates.estimatedCostPerHeadDay !== undefined) data.estimatedCostPerHeadDay = parseNumber(updates.estimatedCostPerHeadDay);
            if (updates.observacoes !== undefined) data.observacoes = normalizeOptionalText(updates.observacoes);
            if (updates.status !== undefined) {
                const normalizedStatus = normalizeNutritionPlanStatus(updates.status);
                if (!normalizedStatus) {
                    return res.status(400).json({ message: 'Status inválido.' });
                }
                data.status = normalizedStatus;
            }
            if (updates.preparedFeedId !== undefined) {
                if (!updates.preparedFeedId) {
                    preparedFeed = null;
                    data.preparedFeedId = null;
                } else {
                    preparedFeed = await prisma.nutritionPreparedFeed.findFirst({
                        where: { id: String(updates.preparedFeedId), farmId: plan.farmId },
                    });
                    if (!preparedFeed) {
                        return res.status(404).json({ message: 'Ração preparada não encontrada.' });
                    }
                    data.preparedFeedId = preparedFeed.id;
                }
            }
            if (updates.phaseId !== undefined) {
                if (!updates.phaseId) {
                    data.phaseId = null;
                } else {
                    const phase = await prisma.nutritionPhase.findFirst({ where: { id: String(updates.phaseId), farmId: plan.farmId } });
                    if (!phase) {
                        return res.status(404).json({ message: 'Fase não encontrada.' });
                    }
                    data.phaseId = phase.id;
                }
            }
            if (updates.plannedIntakeNaturalKgPerHead !== undefined || updates.plannedIntakeDryKgPerHead !== undefined) {
                const perHeadBases = resolveFeedBases({
                    naturalKg: parseNumber(updates.plannedIntakeNaturalKgPerHead ?? plan.plannedIntakeNaturalKgPerHead),
                    dryKg: parseNumber(updates.plannedIntakeDryKgPerHead ?? plan.plannedIntakeDryKgPerHead),
                    dryMatterPercent: preparedFeed?.currentDryMatterPercent ?? null,
                });
                data.plannedIntakeNaturalKgPerHead = perHeadBases.naturalKg;
                data.plannedIntakeDryKgPerHead = perHeadBases.dryKg;
            }
            if (updates.plannedIntakeNaturalKgTotal !== undefined || updates.plannedIntakeDryKgTotal !== undefined) {
                const totalBases = resolveFeedBases({
                    naturalKg: parseNumber(updates.plannedIntakeNaturalKgTotal ?? plan.plannedIntakeNaturalKgTotal),
                    dryKg: parseNumber(updates.plannedIntakeDryKgTotal ?? plan.plannedIntakeDryKgTotal),
                    dryMatterPercent: preparedFeed?.currentDryMatterPercent ?? null,
                });
                data.plannedIntakeNaturalKgTotal = totalBases.naturalKg;
                data.plannedIntakeDryKgTotal = totalBases.dryKg;
            }
            const updated = await prisma.nutritionPlan.update({
                where: { id: plan.id },
                data,
                include: {
                    preparedFeed: {
                        include: {
                            items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } },
                        },
                    },
                    phase: true,
                },
            });
            return res.json({ item: serializeNutritionPlan(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar plano de trato.' });
        }
    });

    app.get('/nutrition/module/assignments', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionAssignment.count({ where: { farmId: farm.id } }),
                prisma.nutritionAssignment.findMany({
                    where: { farmId: farm.id },
                    include: {
                        plan: {
                            include: {
                                preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                                phase: true,
                            },
                        },
                        unit: { include: { lot: true, phase: true } },
                    },
                    orderBy: { startAt: 'desc' },
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionAssignment), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar vínculos de trato.' });
        }
    });

    app.post('/nutrition/module/assignments', async (req, res) => {
        const { farmId, planId, unitId, startAt, endAt } = req.body || {};
        if (!farmId || !planId || !unitId || !startAt) {
            return res.status(400).json({ message: 'Fazenda, plano, unidade e início são obrigatórios.' });
        }
        const parsedStart = parseDateValue(startAt);
        const parsedEnd = endAt ? parseDateValue(endAt) : null;
        if (!parsedStart || (endAt && !parsedEnd)) {
            return res.status(400).json({ message: 'Período inválido.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [plan, unit] = await Promise.all([
                prisma.nutritionPlan.findFirst({ where: { id: String(planId), farmId: farm.id } }),
                prisma.nutritionUnit.findFirst({ where: { id: String(unitId), farmId: farm.id }, include: { lot: true, phase: true } }),
            ]);
            if (!plan) {
                return res.status(404).json({ message: 'Plano de trato não encontrado.' });
            }
            if (!unit) {
                return res.status(404).json({ message: 'Unidade operacional não encontrada.' });
            }
            const assignment = await prisma.nutritionAssignment.create({
                data: {
                    farmId: farm.id,
                    planId: plan.id,
                    unitId: unit.id,
                    lotId: unit.lotId || null,
                    startAt: parsedStart,
                    endAt: parsedEnd,
                },
                include: {
                    plan: {
                        include: {
                            preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                            phase: true,
                        },
                    },
                    unit: { include: { lot: true, phase: true } },
                },
            });
            return res.status(201).json({ item: serializeNutritionAssignment(assignment) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao vincular plano de trato.' });
        }
    });

    app.get('/nutrition/module/fabrications', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionFabrication.count({ where: { farmId: farm.id } }),
                prisma.nutritionFabrication.findMany({
                    where: { farmId: farm.id },
                    include: {
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        items: true,
                    },
                    orderBy: { producedAt: 'desc' },
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionFabrication), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar fabricações.' });
        }
    });

    app.post('/nutrition/module/fabrications', async (req, res) => {
        const { farmId, preparedFeedId, batchCode, producedAt, outputNaturalKg, notes } = req.body || {};
        if (!farmId || !preparedFeedId || !producedAt) {
            return res.status(400).json({ message: 'Fazenda, ração preparada e data são obrigatórios.' });
        }
        const producedDate = parseDateValue(producedAt);
        const outputNatural = parsePositiveNumber(parseNumber, outputNaturalKg);
        if (!producedDate) {
            return res.status(400).json({ message: 'Data de fabricação inválida.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const settings = await ensureNutritionSettings(prisma, farm.id);
            const preparedFeed = await prisma.nutritionPreparedFeed.findFirst({
                where: { id: String(preparedFeedId), farmId: farm.id },
                include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } },
            });
            if (!preparedFeed) {
                return res.status(404).json({ message: 'Ração preparada não encontrada.' });
            }
            const productionNatural = outputNatural ?? preparedFeed.expectedYieldNaturalKg;
            if (!Number.isFinite(productionNatural) || productionNatural <= 0) {
                return res.status(400).json({ message: 'Rendimento fabricado inválido.' });
            }
            const actor = getNutritionActor(req);
            const usageItems = preparedFeed.items.map((item) => {
                const quantityNaturalKg = roundNutrition(productionNatural * (item.proportionPercent / 100)) || 0;
                const dryMatterPercent = item.ingredient?.currentDryMatterPercent ?? 0;
                const quantityDryKg = calculateDryMatterKg(quantityNaturalKg, dryMatterPercent) || 0;
                const unitCost = item.ingredient?.currentCost ?? 0;
                const lineCost = roundNutrition(quantityNaturalKg * unitCost) || 0;
                return {
                    ingredientId: item.ingredientId,
                    ingredientName: item.ingredient?.name || 'Ingrediente',
                    quantityNaturalKg,
                    quantityDryKg,
                    dryMatterPercent,
                    unitCost,
                    lineCost,
                };
            });
            const insufficient = usageItems.find((item) => {
                const ingredient = preparedFeed.items.find((recipeItem) => recipeItem.ingredientId === item.ingredientId)?.ingredient;
                return (ingredient?.currentStockNatural ?? 0) < item.quantityNaturalKg;
            });
            if (insufficient) {
                return res.status(409).json({ message: `Estoque insuficiente para fabricar. Falta ingrediente para ${insufficient.ingredientName}.` });
            }
            const totalCost = roundNutrition(usageItems.reduce((sum, item) => sum + item.lineCost, 0)) || 0;
            const outputDryKg = roundNutrition(usageItems.reduce((sum, item) => sum + item.quantityDryKg, 0)) || 0;
            const costPerNaturalKg = productionNatural > 0 ? roundNutrition(totalCost / productionNatural) || 0 : 0;
            const costPerDryKg = outputDryKg > 0 ? roundNutrition(totalCost / outputDryKg) || 0 : null;
            const status = settings.requireFabricationApproval ? 'PENDING' : 'APPROVED';
            const fabrication = await prisma.$transaction(async (tx) => {
                for (const item of usageItems) {
                    await tx.nutritionIngredient.update({
                        where: { id: item.ingredientId },
                        data: {
                            currentStockNatural: {
                                decrement: item.quantityNaturalKg,
                            },
                        },
                    });
                }
                await tx.nutritionPreparedFeed.update({
                    where: { id: preparedFeed.id },
                    data: {
                        currentStockNatural: { increment: productionNatural },
                        currentStockDry: { increment: outputDryKg },
                    },
                });
                const created = await tx.nutritionFabrication.create({
                    data: {
                        farmId: farm.id,
                        preparedFeedId: preparedFeed.id,
                        batchCode: normalizeOptionalText(batchCode) || `${preparedFeed.name} ${producedDate.toISOString().slice(0, 10)}`,
                        producedAt: producedDate,
                        outputNaturalKg: productionNatural,
                        outputDryKg,
                        remainingNaturalKg: productionNatural,
                        remainingDryKg: outputDryKg,
                        totalCost,
                        costPerNaturalKg,
                        costPerDryKg,
                        status,
                        notes: normalizeOptionalText(notes),
                        createdByUserId: actor.userId,
                        createdByName: actor.name,
                        approvedAt: status === 'APPROVED' ? new Date() : null,
                        approvedByUserId: status === 'APPROVED' ? actor.userId : null,
                        approvedByName: status === 'APPROVED' ? actor.name : null,
                    },
                });
                await tx.nutritionFabricationItem.createMany({
                    data: usageItems.map((item) => ({
                        fabricationId: created.id,
                        ingredientId: item.ingredientId,
                        ingredientName: item.ingredientName,
                        quantityNaturalKg: item.quantityNaturalKg,
                        quantityDryKg: item.quantityDryKg,
                        dryMatterPercent: item.dryMatterPercent,
                        unitCost: item.unitCost,
                        lineCost: item.lineCost,
                    })),
                });
                return tx.nutritionFabrication.findUnique({
                    where: { id: created.id },
                    include: {
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        items: true,
                    },
                });
            });
            return res.status(201).json({ item: serializeNutritionFabrication(fabrication) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: error?.message || 'Erro ao registrar fabricação.' });
        }
    });

    app.post('/nutrition/module/fabrications/:id/approve', async (req, res) => {
        if (!canReviewNutrition(req)) {
            return res.status(403).json({ message: 'Somente gerente ou técnico podem aprovar a fabricação.' });
        }
        const { id } = req.params;
        try {
            const fabrication = await prisma.nutritionFabrication.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req) },
                include: {
                    preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                    items: true,
                },
            });
            if (!fabrication) {
                return res.status(404).json({ message: 'Fabricação não encontrada.' });
            }
            if (fabrication.status !== 'PENDING') {
                return res.status(409).json({ message: 'Somente fabricação pendente pode ser aprovada.' });
            }
            const actor = getNutritionActor(req);
            const updated = await prisma.nutritionFabrication.update({
                where: { id: fabrication.id },
                data: {
                    status: 'APPROVED',
                    approvedAt: new Date(),
                    approvedByUserId: actor.userId,
                    approvedByName: actor.name,
                },
                include: {
                    preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                    items: true,
                },
            });
            return res.json({ item: serializeNutritionFabrication(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao aprovar fabricação.' });
        }
    });

    app.post('/nutrition/module/fabrications/:id/cancel', async (req, res) => {
        if (!canReviewNutrition(req)) {
            return res.status(403).json({ message: 'Somente gerente ou técnico podem cancelar a fabricação.' });
        }
        const { id } = req.params;
        const { reason } = req.body || {};
        const normalizedReason = normalizeOptionalText(reason);
        if (!normalizedReason) {
            return res.status(400).json({ message: 'Informe o motivo do cancelamento.' });
        }
        try {
            const fabrication = await prisma.nutritionFabrication.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req) },
                include: {
                    items: true,
                    executions: {
                        where: { canceledAt: null },
                    },
                },
            });
            if (!fabrication) {
                return res.status(404).json({ message: 'Fabricação não encontrada.' });
            }
            if (fabrication.status === 'CANCELED' || fabrication.status === 'REVERSED') {
                return res.status(409).json({ message: 'Esta fabricação já foi cancelada.' });
            }
            if (fabrication.executions.length) {
                return res.status(409).json({ message: 'Esta fabricação já foi usada em trato realizado e não pode ser cancelada livremente.' });
            }
            const preparedFeed = await prisma.nutritionPreparedFeed.findUnique({ where: { id: fabrication.preparedFeedId } });
            if (!preparedFeed || preparedFeed.currentStockNatural < fabrication.outputNaturalKg - 0.001) {
                return res.status(409).json({ message: 'Não foi possível estornar esta fabricação porque o saldo da ração preparada já não comporta a reversão.' });
            }
            const actor = getNutritionActor(req);
            const nextStatus = fabrication.status === 'APPROVED' ? 'REVERSED' : 'CANCELED';
            const updated = await prisma.$transaction(async (tx) => {
                for (const item of fabrication.items) {
                    await tx.nutritionIngredient.update({
                        where: { id: item.ingredientId },
                        data: {
                            currentStockNatural: { increment: item.quantityNaturalKg },
                        },
                    });
                }
                await tx.nutritionPreparedFeed.update({
                    where: { id: fabrication.preparedFeedId },
                    data: {
                        currentStockNatural: { decrement: fabrication.outputNaturalKg },
                        currentStockDry: { decrement: fabrication.outputDryKg },
                    },
                });
                return tx.nutritionFabrication.update({
                    where: { id: fabrication.id },
                    data: {
                        status: nextStatus,
                        canceledAt: new Date(),
                        canceledByUserId: actor.userId,
                        canceledByName: actor.name,
                        cancelReason: normalizedReason,
                    },
                    include: {
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        items: true,
                    },
                });
            });
            return res.json({ item: serializeNutritionFabrication(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao cancelar fabricação.' });
        }
    });

    app.get('/nutrition/module/executions', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionExecution.count({ where: { farmId: farm.id } }),
                prisma.nutritionExecution.findMany({
                    where: { farmId: farm.id },
                    include: {
                        unit: { include: { lot: true, phase: true } },
                        plan: {
                            include: {
                                preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                                phase: true,
                            },
                        },
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                    },
                    orderBy: { date: 'desc' },
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionExecution), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar tratos realizados.' });
        }
    });

    app.post('/nutrition/module/executions', async (req, res) => {
        const { farmId, unitId, planId, preparedFeedId, fabricationId, date, feedingSlot, actualNaturalKg, actualDryMatterKg, refusalNaturalKg, refusalDryMatterKg, notes } = req.body || {};
        if (!farmId || !unitId || !date) {
            return res.status(400).json({ message: 'Fazenda, unidade e data são obrigatórios.' });
        }
        const executionDate = parseDateValue(date);
        if (!executionDate) {
            return res.status(400).json({ message: 'Data do trato inválida.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const settings = await ensureNutritionSettings(prisma, farm.id);
            const [unit, lotHeadCounts] = await Promise.all([
                prisma.nutritionUnit.findFirst({ where: { id: String(unitId), farmId: farm.id }, include: { lot: true, phase: true } }),
                getLotHeadCountMap(prisma, farm.id),
            ]);
            if (!unit) {
                return res.status(404).json({ message: 'Unidade operacional não encontrada.' });
            }
            let assignment = null;
            if (planId) {
                const plan = await prisma.nutritionPlan.findFirst({
                    where: { id: String(planId), farmId: farm.id },
                    include: {
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        phase: true,
                    },
                });
                if (!plan) {
                    return res.status(404).json({ message: 'Plano de trato não encontrado.' });
                }
                assignment = { plan, unit };
            } else {
                assignment = await prisma.nutritionAssignment.findFirst({
                    where: {
                        farmId: farm.id,
                        unitId: unit.id,
                        startAt: { lte: executionDate },
                        OR: [{ endAt: null }, { endAt: { gte: executionDate } }],
                    },
                    include: {
                        plan: {
                            include: {
                                preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                                phase: true,
                            },
                        },
                        unit: { include: { lot: true, phase: true } },
                    },
                    orderBy: { startAt: 'desc' },
                });
            }
            const plan = assignment?.plan || null;
            let preparedFeed = null;
            if (preparedFeedId) {
                preparedFeed = await prisma.nutritionPreparedFeed.findFirst({
                    where: { id: String(preparedFeedId), farmId: farm.id },
                    include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } },
                });
            } else {
                preparedFeed = plan?.preparedFeed || null;
            }
            if (!preparedFeed) {
                return res.status(400).json({ message: 'Selecione a ração preparada do trato.' });
            }
            let fabrication = null;
            if (fabricationId) {
                fabrication = await prisma.nutritionFabrication.findFirst({
                    where: { id: String(fabricationId), farmId: farm.id },
                    include: {
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        items: true,
                    },
                });
            } else {
                fabrication = await prisma.nutritionFabrication.findFirst({
                    where: {
                        farmId: farm.id,
                        preparedFeedId: preparedFeed.id,
                        remainingNaturalKg: { gt: 0 },
                        status: settings.requireFabricationApproval ? 'APPROVED' : { in: ['PENDING', 'APPROVED'] },
                    },
                    include: {
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        items: true,
                    },
                    orderBy: { producedAt: 'asc' },
                });
            }
            if (!fabrication) {
                return res.status(409).json({ message: 'Não há fabricação disponível com saldo para este trato.' });
            }
            const bases = resolveFeedBases({
                naturalKg: parseNumber(actualNaturalKg),
                dryKg: parseNumber(actualDryMatterKg),
                dryMatterPercent: fabrication.costPerDryKg ? fabrication.outputDryKg / fabrication.outputNaturalKg * 100 : preparedFeed.currentDryMatterPercent,
            });
            if (!Number.isFinite(bases.naturalKg) || !Number.isFinite(bases.dryKg)) {
                return res.status(400).json({ message: 'Informe a quantidade entregue em matéria natural ou matéria seca.' });
            }
            if (fabrication.remainingNaturalKg < bases.naturalKg - 0.001) {
                return res.status(409).json({ message: 'Saldo insuficiente na fabricação selecionada.' });
            }
            if (preparedFeed.currentStockNatural < bases.naturalKg - 0.001) {
                return res.status(409).json({ message: 'Saldo insuficiente da ração preparada.' });
            }
            const headCount = resolveUnitHeadCount(unit, lotHeadCounts);
            const planTargets = plan ? resolvePlanQuantities(plan, headCount, preparedFeed.currentDryMatterPercent) : { totalNatural: null, totalDry: null };
            const totalCost = roundNutrition((fabrication.costPerNaturalKg || preparedFeed.currentCostPerNaturalKg || 0) * bases.naturalKg) || 0;
            const costPerHeadDay = headCount > 0 ? roundNutrition(totalCost / headCount) : null;
            const actor = getNutritionActor(req);
            const reviewStatus = settings.requireExecutionApproval ? 'PENDING' : 'APPROVED';
            const execution = await prisma.$transaction(async (tx) => {
                await tx.nutritionFabrication.update({
                    where: { id: fabrication.id },
                    data: {
                        remainingNaturalKg: { decrement: bases.naturalKg },
                        remainingDryKg: { decrement: bases.dryKg },
                    },
                });
                await tx.nutritionPreparedFeed.update({
                    where: { id: preparedFeed.id },
                    data: {
                        currentStockNatural: { decrement: bases.naturalKg },
                        currentStockDry: { decrement: bases.dryKg },
                    },
                });
                const created = await tx.nutritionExecution.create({
                    data: {
                        farmId: farm.id,
                        lotId: unit.lotId || null,
                        unitId: unit.id,
                        planId: plan?.id || null,
                        preparedFeedId: preparedFeed.id,
                        fabricationId: fabrication.id,
                        date: executionDate,
                        feedingSlot: normalizeOptionalText(feedingSlot) || plan?.feedingSlot || null,
                        plannedNaturalKg: planTargets.totalNatural,
                        plannedDryMatterKg: planTargets.totalDry,
                        actualNaturalKg: bases.naturalKg,
                        actualDryMatterKg: bases.dryKg,
                        refusalNaturalKg: parseNumber(refusalNaturalKg),
                        refusalDryMatterKg: parseNumber(refusalDryMatterKg),
                        headCountSnapshot: headCount,
                        totalCost,
                        costPerHeadDay,
                        notes: normalizeOptionalText(notes),
                        reviewStatus,
                        createdByUserId: actor.userId,
                        createdByName: actor.name,
                        approvedAt: reviewStatus === 'APPROVED' ? new Date() : null,
                        approvedByUserId: reviewStatus === 'APPROVED' ? actor.userId : null,
                        approvedByName: reviewStatus === 'APPROVED' ? actor.name : null,
                    },
                });
                return tx.nutritionExecution.findUnique({
                    where: { id: created.id },
                    include: {
                        unit: { include: { lot: true, phase: true } },
                        plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                    },
                });
            });
            return res.status(201).json({ item: serializeNutritionExecution(execution) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: error?.message || 'Erro ao registrar trato realizado.' });
        }
    });

    app.post('/nutrition/module/executions/:id/approve', async (req, res) => {
        if (!canReviewNutrition(req)) {
            return res.status(403).json({ message: 'Somente gerente ou técnico podem aprovar o trato realizado.' });
        }
        const { id } = req.params;
        try {
            const execution = await prisma.nutritionExecution.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req), canceledAt: null },
                include: {
                    unit: { include: { lot: true, phase: true } },
                    plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                    preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                    fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                },
            });
            if (!execution) {
                return res.status(404).json({ message: 'Trato realizado não encontrado.' });
            }
            if (execution.reviewStatus === 'APPROVED' && !execution.rejectedAt) {
                return res.status(409).json({ message: 'Este trato já está aprovado.' });
            }
            const actor = getNutritionActor(req);
            const updated = await prisma.nutritionExecution.update({
                where: { id: execution.id },
                data: {
                    reviewStatus: 'APPROVED',
                    approvedAt: new Date(),
                    approvedByUserId: actor.userId,
                    approvedByName: actor.name,
                    rejectedAt: null,
                    rejectedByUserId: null,
                    rejectedByName: null,
                    rejectionReason: null,
                },
                include: {
                    unit: { include: { lot: true, phase: true } },
                    plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                    preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                    fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                },
            });
            return res.json({ item: serializeNutritionExecution(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao aprovar trato realizado.' });
        }
    });

    app.post('/nutrition/module/executions/:id/reject', async (req, res) => {
        if (!canReviewNutrition(req)) {
            return res.status(403).json({ message: 'Somente gerente ou técnico podem rejeitar o trato realizado.' });
        }
        const { id } = req.params;
        const reason = normalizeOptionalText(req.body?.reason);
        if (!reason) {
            return res.status(400).json({ message: 'Informe o motivo da rejeição.' });
        }
        try {
            const execution = await prisma.nutritionExecution.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req), canceledAt: null },
                include: {
                    unit: { include: { lot: true, phase: true } },
                    plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                    preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                    fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                },
            });
            if (!execution) {
                return res.status(404).json({ message: 'Trato realizado não encontrado.' });
            }
            const actor = getNutritionActor(req);
            const updated = await prisma.nutritionExecution.update({
                where: { id: execution.id },
                data: {
                    reviewStatus: 'PENDING',
                    rejectedAt: new Date(),
                    rejectedByUserId: actor.userId,
                    rejectedByName: actor.name,
                    rejectionReason: reason,
                },
                include: {
                    unit: { include: { lot: true, phase: true } },
                    plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                    preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                    fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                },
            });
            return res.json({ item: serializeNutritionExecution(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao rejeitar trato realizado.' });
        }
    });

    app.post('/nutrition/module/executions/:id/cancel', async (req, res) => {
        if (!canReviewNutrition(req)) {
            return res.status(403).json({ message: 'Somente gerente ou técnico podem cancelar o trato realizado.' });
        }
        const { id } = req.params;
        const reason = normalizeOptionalText(req.body?.reason);
        if (!reason) {
            return res.status(400).json({ message: 'Informe o motivo do cancelamento.' });
        }
        try {
            const execution = await prisma.nutritionExecution.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req), canceledAt: null },
                include: {
                    unit: { include: { lot: true, phase: true } },
                    plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                    preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                    fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                },
            });
            if (!execution) {
                return res.status(404).json({ message: 'Trato realizado não encontrado.' });
            }
            const actor = getNutritionActor(req);
            const updated = await prisma.$transaction(async (tx) => {
                if (execution.fabricationId) {
                    await tx.nutritionFabrication.update({
                        where: { id: execution.fabricationId },
                        data: {
                            remainingNaturalKg: { increment: execution.actualNaturalKg || 0 },
                            remainingDryKg: { increment: execution.actualDryMatterKg || 0 },
                        },
                    });
                }
                if (execution.preparedFeedId) {
                    await tx.nutritionPreparedFeed.update({
                        where: { id: execution.preparedFeedId },
                        data: {
                            currentStockNatural: { increment: execution.actualNaturalKg || 0 },
                            currentStockDry: { increment: execution.actualDryMatterKg || 0 },
                        },
                    });
                }
                return tx.nutritionExecution.update({
                    where: { id: execution.id },
                    data: {
                        canceledAt: new Date(),
                        canceledByUserId: actor.userId,
                        canceledByName: actor.name,
                        cancelReason: reason,
                    },
                    include: {
                        unit: { include: { lot: true, phase: true } },
                        plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                    },
                });
            });
            return res.json({ item: serializeNutritionExecution(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao cancelar trato realizado.' });
        }
    });

    app.get('/nutrition/module/trough-readings', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const { limit, offset } = parseListParams(req.query);
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const [total, items] = await prisma.$transaction([
                prisma.nutritionTroughReading.count({ where: { farmId: farm.id } }),
                prisma.nutritionTroughReading.findMany({
                    where: { farmId: farm.id },
                    include: { unit: { include: { lot: true, phase: true } } },
                    orderBy: { date: 'desc' },
                    skip: offset,
                    take: limit,
                }),
            ]);
            return res.json({ items: items.map(serializeNutritionTroughReading), total, limit, offset });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar leituras de cocho.' });
        }
    });

    app.post('/nutrition/module/trough-readings', async (req, res) => {
        const { farmId, unitId, date, readingType, score, supplyObservation, observedDryMatterPercent, animalBehavior, notes, syncSource } = req.body || {};
        if (!farmId || !unitId || !date) {
            return res.status(400).json({ message: 'Fazenda, unidade e data são obrigatórios.' });
        }
        const readingDate = parseDateValue(date);
        const normalizedType = normalizeNutritionReadingType(readingType);
        const normalizedBehavior = normalizeNutritionBehavior(animalBehavior || 'NORMAL');
        const parsedScore = Number(score);
        if (!readingDate) {
            return res.status(400).json({ message: 'Data da leitura inválida.' });
        }
        if (!normalizedType) {
            return res.status(400).json({ message: 'Tipo de leitura inválido.' });
        }
        if (!normalizedBehavior) {
            return res.status(400).json({ message: 'Comportamento animal inválido.' });
        }
        if (!Number.isInteger(parsedScore) || parsedScore < 0 || parsedScore > 5) {
            return res.status(400).json({ message: 'Score do cocho inválido.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const settings = await ensureNutritionSettings(prisma, farm.id);
            const [unit, lotHeadCounts, assignment] = await Promise.all([
                prisma.nutritionUnit.findFirst({ where: { id: String(unitId), farmId: farm.id }, include: { lot: true, phase: true } }),
                getLotHeadCountMap(prisma, farm.id),
                prisma.nutritionAssignment.findFirst({
                    where: {
                        farmId: farm.id,
                        unitId: String(unitId),
                        startAt: { lte: readingDate },
                        OR: [{ endAt: null }, { endAt: { gte: readingDate } }],
                    },
                    include: {
                        plan: {
                            include: {
                                preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                                phase: true,
                            },
                        },
                    },
                    orderBy: { startAt: 'desc' },
                }),
            ]);
            if (!unit) {
                return res.status(404).json({ message: 'Unidade operacional não encontrada.' });
            }
            const headCount = resolveUnitHeadCount(unit, lotHeadCounts);
            const suggestion = buildNutritionSuggestion(assignment?.plan || null, headCount, parsedScore);
            const actor = getNutritionActor(req);
            const reviewStatus = settings.requireTroughApproval ? 'PENDING' : 'APPROVED';
            const reading = await prisma.nutritionTroughReading.create({
                data: {
                    farmId: farm.id,
                    unitId: unit.id,
                    date: readingDate,
                    readingType: normalizedType,
                    score: parsedScore,
                    supplyObservation: normalizeOptionalText(supplyObservation),
                    observedDryMatterPercent: parseNumber(observedDryMatterPercent),
                    animalBehavior: normalizedBehavior,
                    notes: normalizeOptionalText(notes),
                    reviewStatus,
                    suggestedAdjustmentPercent: suggestion.adjustmentPercent,
                    suggestedNextNaturalKg: suggestion.nextNaturalKg,
                    suggestedNextDryKg: suggestion.nextDryKg,
                    syncSource: normalizeOptionalText(syncSource) || 'ONLINE',
                    createdByUserId: actor.userId,
                    createdByName: actor.name,
                    approvedAt: reviewStatus === 'APPROVED' ? new Date() : null,
                    approvedByUserId: reviewStatus === 'APPROVED' ? actor.userId : null,
                    approvedByName: reviewStatus === 'APPROVED' ? actor.name : null,
                },
                include: { unit: { include: { lot: true, phase: true } } },
            });
            return res.status(201).json({ item: serializeNutritionTroughReading(reading) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar leitura de cocho.' });
        }
    });

    app.post('/nutrition/module/trough-readings/:id/approve', async (req, res) => {
        if (!canReviewNutrition(req)) {
            return res.status(403).json({ message: 'Somente gerente ou técnico podem aprovar a leitura de cocho.' });
        }
        const { id } = req.params;
        try {
            const reading = await prisma.nutritionTroughReading.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req) },
                include: { unit: { include: { lot: true, phase: true } } },
            });
            if (!reading) {
                return res.status(404).json({ message: 'Leitura não encontrada.' });
            }
            const actor = getNutritionActor(req);
            const updated = await prisma.nutritionTroughReading.update({
                where: { id: reading.id },
                data: {
                    reviewStatus: 'APPROVED',
                    approvedAt: new Date(),
                    approvedByUserId: actor.userId,
                    approvedByName: actor.name,
                    rejectedAt: null,
                    rejectedByUserId: null,
                    rejectedByName: null,
                    rejectionReason: null,
                },
                include: { unit: { include: { lot: true, phase: true } } },
            });
            return res.json({ item: serializeNutritionTroughReading(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao aprovar leitura de cocho.' });
        }
    });

    app.post('/nutrition/module/trough-readings/:id/reject', async (req, res) => {
        if (!canReviewNutrition(req)) {
            return res.status(403).json({ message: 'Somente gerente ou técnico podem rejeitar a leitura de cocho.' });
        }
        const { id } = req.params;
        const reason = normalizeOptionalText(req.body?.reason);
        if (!reason) {
            return res.status(400).json({ message: 'Informe o motivo da rejeição.' });
        }
        try {
            const reading = await prisma.nutritionTroughReading.findFirst({
                where: { id: String(id), farm: buildFarmScopeFilter(req) },
                include: { unit: { include: { lot: true, phase: true } } },
            });
            if (!reading) {
                return res.status(404).json({ message: 'Leitura não encontrada.' });
            }
            const actor = getNutritionActor(req);
            const updated = await prisma.nutritionTroughReading.update({
                where: { id: reading.id },
                data: {
                    reviewStatus: 'PENDING',
                    rejectedAt: new Date(),
                    rejectedByUserId: actor.userId,
                    rejectedByName: actor.name,
                    rejectionReason: reason,
                },
                include: { unit: { include: { lot: true, phase: true } } },
            });
            return res.json({ item: serializeNutritionTroughReading(updated) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao rejeitar leitura de cocho.' });
        }
    });

    app.get('/nutrition/module/dashboard', async (req, res) => {
        const { farmId, date } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }
        const baseDate = date ? parseDateValue(date) : new Date();
        if (!baseDate) {
            return res.status(400).json({ message: 'Data inválida.' });
        }
        try {
            const farm = await resolveNutritionFarm(prisma, req, buildFarmScopeFilter, farmId);
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const settings = await ensureNutritionSettings(prisma, farm.id);
            const { start, end } = getNutritionDayRange(baseDate);
            const [lotHeadCounts, lotGmd, units, assignments, fabrications, executions, readings, ingredientsAtRisk] = await Promise.all([
                getLotHeadCountMap(prisma, farm.id),
                getLotGmdMap(prisma, farm.id),
                prisma.nutritionUnit.findMany({
                    where: { farmId: farm.id, active: true },
                    include: { lot: true, phase: true },
                    orderBy: { name: 'asc' },
                }),
                prisma.nutritionAssignment.findMany({
                    where: {
                        farmId: farm.id,
                        startAt: { lte: end },
                        OR: [{ endAt: null }, { endAt: { gte: start } }],
                    },
                    include: {
                        plan: {
                            include: {
                                preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                                phase: true,
                            },
                        },
                    },
                    orderBy: { startAt: 'desc' },
                }),
                prisma.nutritionFabrication.findMany({
                    where: { farmId: farm.id, producedAt: { gte: start, lt: end } },
                    include: {
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        items: true,
                    },
                    orderBy: { producedAt: 'desc' },
                }),
                prisma.nutritionExecution.findMany({
                    where: { farmId: farm.id, date: { gte: start, lt: end } },
                    include: {
                        unit: { include: { lot: true, phase: true } },
                        plan: { include: { preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } }, phase: true } },
                        preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } },
                        fabrication: { include: { items: true, preparedFeed: { include: { items: { include: { ingredient: true }, orderBy: { sequence: 'asc' } } } } } },
                    },
                    orderBy: { date: 'desc' },
                }),
                prisma.nutritionTroughReading.findMany({
                    where: { farmId: farm.id, date: { gte: new Date(start.getTime() - 24 * 60 * 60 * 1000), lt: end } },
                    include: { unit: { include: { lot: true, phase: true } } },
                    orderBy: { date: 'desc' },
                }),
                buildIngredientRiskList(prisma, farm.id, settings),
            ]);

            const assignmentByUnit = new Map();
            const assignmentByLot = new Map();
            assignments.forEach((assignment) => {
                if (assignment.unitId && !assignmentByUnit.has(assignment.unitId)) {
                    assignmentByUnit.set(assignment.unitId, assignment);
                }
                if (assignment.lotId && !assignmentByLot.has(assignment.lotId)) {
                    assignmentByLot.set(assignment.lotId, assignment);
                }
            });

            const officialExecutions = executions.filter((item) => matchesOfficialReview(item, settings.indicatorsApprovedOnly));
            const officialFabrications = fabrications.filter((item) => matchesOfficialFabrication(item, settings));
            const officialReadings = readings.filter((item) => settings.indicatorsApprovedOnly ? item.reviewStatus === 'APPROVED' && !item.rejectedAt : !item.rejectedAt);

            const unitMetrics = units.map((unit) => {
                const assignment = assignmentByUnit.get(unit.id) || (unit.lotId ? assignmentByLot.get(unit.lotId) : null) || null;
                const headCount = resolveUnitHeadCount(unit, lotHeadCounts);
                const targets = assignment?.plan
                    ? resolvePlanQuantities(assignment.plan, headCount, assignment.plan.preparedFeed?.currentDryMatterPercent ?? null)
                    : { totalNatural: null, totalDry: null, perHeadDry: null };
                const unitExecutions = officialExecutions.filter((item) => item.unitId === unit.id);
                const deliveredNaturalKg = roundNutrition(unitExecutions.reduce((sum, item) => sum + (item.actualNaturalKg || 0), 0)) || 0;
                const deliveredDryKg = roundNutrition(unitExecutions.reduce((sum, item) => sum + (item.actualDryMatterKg || 0), 0)) || 0;
                const totalCost = roundNutrition(unitExecutions.reduce((sum, item) => sum + (item.totalCost || 0), 0)) || 0;
                const costPerHeadDay = headCount > 0 ? roundNutrition(totalCost / headCount) : null;
                const latestReadings = readings.filter((item) => item.unitId === unit.id && !item.rejectedAt).slice(0, 2);
                const latestScore = latestReadings[0]?.score ?? null;
                const repeatedCritical = latestReadings.length >= 2 && latestReadings.every((item) => CRITICAL_TROUGH_SCORES.has(item.score));
                const diffNaturalKg = Number.isFinite(targets.totalNatural) ? roundNutrition(deliveredNaturalKg - targets.totalNatural) : null;
                const diffPercent = Number.isFinite(targets.totalNatural) && targets.totalNatural > 0
                    ? roundNutrition(((deliveredNaturalKg - targets.totalNatural) / targets.totalNatural) * 100, 2)
                    : null;
                const gmd = unit.lotId ? lotGmd.get(unit.lotId) ?? null : null;
                const intakeDryPerHead = headCount > 0 ? roundNutrition(deliveredDryKg / headCount) : null;
                const conversion = intakeDryPerHead && gmd && gmd > 0 ? roundNutrition(intakeDryPerHead / gmd) : null;
                const costPerKgGain = costPerHeadDay && gmd && gmd > 0 ? roundNutrition(costPerHeadDay / gmd) : null;
                const costPerArroba = costPerKgGain ? roundNutrition(costPerKgGain * 15) : null;
                const targetCost = assignment?.plan?.estimatedCostPerHeadDay ?? unit.phase?.targetCostPerHeadDay ?? null;
                return {
                    unit: serializeNutritionUnit(unit, headCount),
                    assignment: assignment ? serializeNutritionAssignment(assignment) : null,
                    plannedNaturalKg: targets.totalNatural,
                    plannedDryKg: targets.totalDry,
                    deliveredNaturalKg,
                    deliveredDryKg,
                    diffNaturalKg,
                    diffPercent,
                    diffSeverity: diffPercent !== null ? getDiffSeverity(diffPercent, settings.diffWarningPercent, settings.diffCriticalPercent) : 'normal',
                    latestScore,
                    troughSeverity: latestScore !== null ? getTroughSeverity(latestScore, repeatedCritical) : 'normal',
                    repeatedCriticalScore: repeatedCritical,
                    headCount,
                    gmd,
                    intakeDryPerHead,
                    conversion,
                    costPerHeadDay,
                    totalCost,
                    costPerKgGain,
                    costPerArroba,
                    targetCost,
                    costAboveTarget: targetCost !== null && costPerHeadDay !== null ? costPerHeadDay > targetCost : false,
                };
            });

            const pendingApprovals = {
                fabrications: fabrications.filter((item) => item.status === 'PENDING').length,
                executions: executions.filter((item) => item.reviewStatus === 'PENDING' && !item.canceledAt).length,
                troughReadings: readings.filter((item) => item.reviewStatus === 'PENDING').length,
            };

            const rejectedCount = {
                executions: executions.filter((item) => item.rejectedAt).length,
                troughReadings: readings.filter((item) => item.rejectedAt).length,
            };

            const exceptions = [];
            ingredientsAtRisk.forEach((item) => {
                if (item.level !== 'safe') {
                    exceptions.push({
                        id: `ingredient-${item.ingredientId}`,
                        type: 'ingredient_risk',
                        severity: item.level === 'critical' ? 'critical' : 'warning',
                        title: item.message,
                        description: `${item.ingredientName} com cobertura estimada em ${item.daysRemaining ?? 'sem cálculo'} dias.`,
                        action: 'Ver estoque',
                    });
                }
            });
            unitMetrics.forEach((item) => {
                if (item.diffSeverity === 'critical') {
                    exceptions.push({
                        id: `diff-${item.unit.id}`,
                        type: 'critical_diff',
                        severity: 'critical',
                        title: 'Diferença crítica entre planejado e entregue',
                        description: `${item.unit.name}: diferença de ${item.diffPercent}% no trato do dia.`,
                        action: 'Ver diferenças',
                    });
                }
                if (item.troughSeverity === 'critical') {
                    exceptions.push({
                        id: `trough-${item.unit.id}`,
                        type: 'critical_trough',
                        severity: 'critical',
                        title: 'Leitura de cocho crítica',
                        description: `${item.unit.name}: score ${item.latestScore}${item.repeatedCriticalScore ? ' em sequência' : ''}.`,
                        action: 'Revisar próximo trato',
                    });
                }
                if (item.costAboveTarget) {
                    exceptions.push({
                        id: `cost-${item.unit.id}`,
                        type: 'cost_above_target',
                        severity: 'warning',
                        title: 'Custo acima da meta',
                        description: `${item.unit.name}: custo por cabeça acima da meta definida.`,
                        action: 'Ver custo do lote',
                    });
                }
            });
            if (pendingApprovals.fabrications + pendingApprovals.executions + pendingApprovals.troughReadings > 0) {
                exceptions.push({
                    id: 'pending-approvals',
                    type: 'pending_approval',
                    severity: 'info',
                    title: 'Há registros pendentes de conferência',
                    description: `${pendingApprovals.fabrications + pendingApprovals.executions + pendingApprovals.troughReadings} registro(s) aguardando aprovação.`,
                    action: 'Conferir',
                });
            }
            if (rejectedCount.executions + rejectedCount.troughReadings > 0) {
                exceptions.push({
                    id: 'rejected-records',
                    type: 'rejected_records',
                    severity: 'warning',
                    title: 'Há registros rejeitados',
                    description: `${rejectedCount.executions + rejectedCount.troughReadings} registro(s) precisam de correção.`,
                    action: 'Corrigir',
                });
            }

            const worstUnit = [...unitMetrics]
                .sort((a, b) => {
                    const diffA = Math.abs(a.diffPercent || 0);
                    const diffB = Math.abs(b.diffPercent || 0);
                    if (diffA !== diffB) return diffB - diffA;
                    return (b.costPerHeadDay || 0) - (a.costPerHeadDay || 0);
                })[0] || null;
            if (worstUnit) {
                exceptions.push({
                    id: 'worst-unit',
                    type: 'worst_result',
                    severity: 'warning',
                    title: 'Pior resultado do dia',
                    description: `${worstUnit.unit.name} é a unidade com maior diferença ou custo no dia.`,
                    action: 'Abrir unidade',
                });
            }

            const plannedNaturalKg = roundNutrition(unitMetrics.reduce((sum, item) => sum + (item.plannedNaturalKg || 0), 0)) || 0;
            const plannedDryKg = roundNutrition(unitMetrics.reduce((sum, item) => sum + (item.plannedDryKg || 0), 0)) || 0;
            const fabricatedNaturalKg = roundNutrition(officialFabrications.reduce((sum, item) => sum + (item.outputNaturalKg || 0), 0)) || 0;
            const fabricatedDryKg = roundNutrition(officialFabrications.reduce((sum, item) => sum + (item.outputDryKg || 0), 0)) || 0;
            const deliveredNaturalKg = roundNutrition(unitMetrics.reduce((sum, item) => sum + (item.deliveredNaturalKg || 0), 0)) || 0;
            const deliveredDryKg = roundNutrition(unitMetrics.reduce((sum, item) => sum + (item.deliveredDryKg || 0), 0)) || 0;
            const totalCostDay = roundNutrition(unitMetrics.reduce((sum, item) => sum + (item.totalCost || 0), 0)) || 0;
            const totalHeadCount = unitMetrics.reduce((sum, item) => sum + (item.headCount || 0), 0);

            return res.json({
                settings: serializeNutritionSettings(settings),
                summary: {
                    plannedNaturalKg,
                    plannedDryKg,
                    fabricatedNaturalKg,
                    fabricatedDryKg,
                    deliveredNaturalKg,
                    deliveredDryKg,
                    totalCostDay,
                    averageCostPerHeadDay: totalHeadCount > 0 ? roundNutrition(totalCostDay / totalHeadCount) : null,
                    pendingApprovals,
                    rejectedCount,
                    exceptionCount: exceptions.length,
                    ingredientRiskCount: ingredientsAtRisk.filter((item) => item.level !== 'safe').length,
                },
                today: {
                    units: unitMetrics,
                    fabrications: fabrications.map(serializeNutritionFabrication),
                    executions: executions.map(serializeNutritionExecution),
                    troughReadings: readings.map(serializeNutritionTroughReading),
                },
                ingredientsAtRisk,
                exceptions,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao montar o painel de nutrição.' });
        }
    });
};

export { registerNutritionModuleRoutes };
