import { upsertSystemAccountCategories } from '../../accountCategoryDefaults.js';

const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const addMonthsClamped = (date, months) => {
    const source = new Date(date);
    const day = source.getUTCDate();
    const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target;
};

export const buildPurchasePaymentSchedule = ({ amount, condition, purchaseDate, dueDate, installments }) => {
    const totalCents = Math.round(Number(amount || 0) * 100);
    if (!(totalCents > 0)) throw new Error('Informe um valor de compra válido.');

    const normalizedCondition = String(condition || 'PAGO').toUpperCase();
    const baseDate = purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate);
    if (Number.isNaN(baseDate.getTime())) throw new Error('Data da compra inválida.');

    if (normalizedCondition === 'PAGO') {
        return [{ amount: totalCents / 100, status: 'PAGO', dueDate: null, settledAt: baseDate, installment: 1, installments: 1 }];
    }

    const firstDueDate = dueDate instanceof Date ? dueDate : new Date(dueDate);
    if (Number.isNaN(firstDueDate.getTime())) throw new Error('Informe a data do primeiro vencimento.');

    const count = normalizedCondition === 'PARCELADO' ? Number(installments) : 1;
    if (!Number.isInteger(count) || count < 1 || count > 60 || (normalizedCondition === 'PARCELADO' && count < 2)) {
        throw new Error('Informe uma quantidade de parcelas entre 2 e 60.');
    }
    if (!['A_PAGAR', 'PARCELADO'].includes(normalizedCondition)) {
        throw new Error('Condição de pagamento inválida.');
    }

    const baseCents = Math.floor(totalCents / count);
    const remainder = totalCents - baseCents * count;
    return Array.from({ length: count }, (_, index) => ({
        amount: (baseCents + (index < remainder ? 1 : 0)) / 100,
        status: 'PENDENTE',
        dueDate: addMonthsClamped(firstDueDate, index),
        settledAt: null,
        installment: index + 1,
        installments: count,
    }));
};

export const RESULT_CLASS_LABELS = {
    OPERATING_REVENUE: 'Receita operacional',
    PRODUCTION_COST: 'Custo de produção',
    OPERATING_EXPENSE: 'Despesa operacional',
    FINANCIAL_RESULT: 'Resultado financeiro',
    OTHER_RESULT: 'Outros resultados',
};

export const ensureFinancialSettings = async (db, organizationId) => {
    if (!organizationId) return null;
    return db.organizationFinancialSettings.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
    });
};

export const resolveAllocations = async (db, farmId, totalAmount, allocations = []) => {
    if (!Array.isArray(allocations) || allocations.length === 0) return [];
    const resolved = [];
    let allocated = 0;

    for (const item of allocations) {
        const hasExplicitAmount = item.amount !== undefined;
        const hasExplicitPercent = item.percent !== undefined;
        if (!hasExplicitAmount && !hasExplicitPercent && allocations.length !== 1) {
            throw new Error('Informe o valor ou percentual de cada divisão.');
        }
        const amount = hasExplicitAmount
            ? toMoney(item.amount)
            : hasExplicitPercent
                ? toMoney(totalAmount * (Number(item.percent) / 100))
                : toMoney(totalAmount);
        if (!(amount > 0)) throw new Error('Cada divisão precisa ter valor maior que zero.');
        allocated = toMoney(allocated + amount);

        let lot = null;
        let poLot = null;
        let paddock = null;
        if (item.lotId) lot = await db.lot.findFirst({ where: { id: String(item.lotId), farmId } });
        if (item.poLotId) poLot = await db.poLot.findFirst({ where: { id: String(item.poLotId), farmId } });
        if (item.paddockId) paddock = await db.paddock.findFirst({ where: { id: String(item.paddockId), farmId } });
        if ((item.lotId && !lot) || (item.poLotId && !poLot) || (item.paddockId && !paddock)) {
            throw new Error('Um dos destinos informados não pertence à fazenda.');
        }
        const productionPhase = item.productionPhase || lot?.productionPhase || poLot?.productionPhase || null;
        resolved.push({
            amount,
            lotId: lot?.id || null,
            poLotId: poLot?.id || null,
            paddockId: paddock?.id || null,
            productionPhase,
            lotNameSnapshot: lot?.name || poLot?.name || null,
            paddockNameSnapshot: paddock?.name || null,
            phaseLabelSnapshot: productionPhase || null,
        });
    }
    if (allocated > toMoney(totalAmount)) throw new Error('A soma das divisões não pode superar o valor do lançamento.');
    return resolved;
};

export const syncTransactionResult = async (db, transaction, category, allocations) => {
    const sourceKey = `TRANSACTION:${transaction.id}:RESULT`;
    if (transaction.modelVersion !== 2 || transaction.status === 'CANCELADO' || !category?.isConfigured
        || category.recognitionRule !== 'IMMEDIATE' || !category.resultClass) {
        await db.financialResultEntry.updateMany({
            where: { sourceKey, status: 'ACTIVE' },
            data: { status: 'REVERSED', reversedAt: new Date() },
        });
        return null;
    }

    const resolvedAllocations = allocations === undefined
        ? null
        : await resolveAllocations(db, transaction.farmId, Number(transaction.valor), allocations);
    const entry = await db.financialResultEntry.upsert({
        where: { sourceKey },
        update: {
            accountCategoryId: category.id,
            resultClass: category.resultClass,
            amount: transaction.valor,
            competenceDate: transaction.competenceDate || transaction.data,
            description: transaction.descricao,
            status: 'ACTIVE',
            reversedAt: null,
        },
        create: {
            farmId: transaction.farmId,
            transactionId: transaction.id,
            accountCategoryId: category.id,
            sourceKey,
            sourceType: 'TRANSACTION',
            sourceId: transaction.id,
            resultClass: category.resultClass,
            amount: transaction.valor,
            competenceDate: transaction.competenceDate || transaction.data,
            description: transaction.descricao,
        },
    });
    if (resolvedAllocations !== null) await db.financialResultAllocation.deleteMany({ where: { resultEntryId: entry.id } });
    if (resolvedAllocations?.length) {
        await db.financialResultAllocation.createMany({
            data: resolvedAllocations.map((item) => ({ ...item, resultEntryId: entry.id })),
        });
    }
    return entry;
};

export const upsertAutomaticResult = async (db, payload) => {
    const amount = toMoney(payload.amount);
    if (!(amount > 0)) return null;
    const farm = await db.farm.findUnique({ where: { id: payload.farmId }, select: { organizationId: true } });
    if (farm?.organizationId) await ensureFinancialSettings(db, farm.organizationId);
    if (payload.accountCategoryId) {
        const category = await db.accountCategory.findUnique({ where: { id: payload.accountCategoryId } });
        if (!category) await upsertSystemAccountCategories(db);
    }
    const resolvedAllocations = await resolveAllocations(db, payload.farmId, amount, payload.allocations || []);
    const entry = await db.financialResultEntry.upsert({
        where: { sourceKey: payload.sourceKey },
        update: {
            resultClass: payload.resultClass,
            amount,
            competenceDate: payload.competenceDate,
            description: payload.description || null,
            herdEventId: payload.herdEventId || null,
            sanitaryRecordId: payload.sanitaryRecordId || null,
            nutritionExecutionId: payload.nutritionExecutionId || null,
            status: 'ACTIVE',
            reversedAt: null,
        },
        create: {
            farmId: payload.farmId,
            transactionId: payload.transactionId || null,
            accountCategoryId: payload.accountCategoryId || null,
            sourceKey: payload.sourceKey,
            sourceType: payload.sourceType,
            sourceId: payload.sourceId || null,
            resultClass: payload.resultClass,
            amount,
            competenceDate: payload.competenceDate,
            description: payload.description || null,
            herdEventId: payload.herdEventId || null,
            sanitaryRecordId: payload.sanitaryRecordId || null,
            nutritionExecutionId: payload.nutritionExecutionId || null,
        },
    });
    await db.financialResultAllocation.deleteMany({ where: { resultEntryId: entry.id } });
    if (resolvedAllocations.length) {
        await db.financialResultAllocation.createMany({ data: resolvedAllocations.map((item) => ({ ...item, resultEntryId: entry.id })) });
    }
    return entry;
};

export const reverseResultBySource = (db, sourceKey) => db.financialResultEntry.updateMany({
    where: { sourceKey, status: 'ACTIVE' },
    data: { status: 'REVERSED', reversedAt: new Date() },
});

export const createIntegratedTransaction = async (db, payload) => {
    const farm = await db.farm.findUnique({ where: { id: payload.farmId }, select: { organizationId: true } });
    if (farm?.organizationId) await ensureFinancialSettings(db, farm.organizationId);
    let category = await db.accountCategory.findUnique({ where: { id: payload.accountCategoryId } });
    if (!category) {
        await upsertSystemAccountCategories(db);
        category = await db.accountCategory.findUnique({ where: { id: payload.accountCategoryId } });
    }
    if (!category) throw new Error('Categoria financeira automática não encontrada.');
    const transaction = await db.financialTransaction.create({
        data: {
            farmId: payload.farmId,
            type: payload.type,
            categoria: payload.categoria || 'OUTROS',
            accountCategoryId: payload.accountCategoryId,
            valor: payload.amount,
            data: payload.competenceDate,
            competenceDate: payload.competenceDate,
            settledAt: payload.status === 'PENDENTE' ? null : (payload.settledAt || payload.competenceDate),
            modelVersion: 2,
            descricao: payload.description || null,
            herdEventId: payload.herdEventId || null,
            sanitaryRecordId: payload.sanitaryRecordId || null,
            status: payload.status || 'PAGO',
            vencimento: payload.dueDate || null,
        },
        include: { accountCategory: true },
    });
    await syncTransactionResult(db, transaction, category, payload.allocations || []);

    if (payload.type === 'ENTRADA' && payload.herdEventId && (payload.animalId || payload.poAnimalId)) {
        const purchase = await db.herdEvent.findFirst({
            where: {
                farmId: payload.farmId,
                type: 'COMPRA',
                OR: [{ purchasePurpose: null }, { purchasePurpose: 'PRODUCTION' }],
                ...(payload.animalId ? { animalId: payload.animalId } : { poAnimalId: payload.poAnimalId }),
                valor: { gt: 0 },
                date: { lte: payload.competenceDate },
            },
            orderBy: { date: 'desc' },
        });
        if (purchase?.valor) {
            await upsertAutomaticResult(db, {
                farmId: payload.farmId,
                transactionId: transaction.id,
                accountCategoryId: 'sys-compra-animais',
                sourceKey: `HERD_SALE:${payload.herdEventId}:ACQUISITION_COST`,
                sourceType: 'HERD_SALE_ACQUISITION',
                sourceId: payload.herdEventId,
                resultClass: 'PRODUCTION_COST',
                amount: purchase.valor,
                competenceDate: payload.competenceDate,
                description: 'Custo de aquisição reconhecido na venda do animal',
                herdEventId: payload.herdEventId,
                allocations: payload.allocations || [],
            });
        }
    }
    return transaction;
};

export const summarizeIncomeStatement = (entries) => {
    const totals = { operatingRevenue: 0, productionCost: 0, operatingExpense: 0, financialResult: 0, otherResult: 0 };
    for (const entry of entries) {
        const amount = Number(entry.amount || 0);
        if (entry.resultClass === 'OPERATING_REVENUE') totals.operatingRevenue += amount;
        else if (entry.resultClass === 'PRODUCTION_COST') totals.productionCost += amount;
        else if (entry.resultClass === 'OPERATING_EXPENSE') totals.operatingExpense += amount;
        else if (entry.resultClass === 'FINANCIAL_RESULT') totals.financialResult += entry.accountCategory?.type === 'SAIDA' ? -amount : amount;
        else if (entry.resultClass === 'OTHER_RESULT') totals.otherResult += entry.accountCategory?.type === 'SAIDA' ? -amount : amount;
    }
    Object.keys(totals).forEach((key) => { totals[key] = toMoney(totals[key]); });
    const grossMargin = toMoney(totals.operatingRevenue - totals.productionCost);
    const operatingResult = toMoney(grossMargin - totals.operatingExpense);
    const managementResult = toMoney(operatingResult + totals.financialResult + totals.otherResult);
    return { ...totals, grossMargin, operatingResult, managementResult };
};

export const summarizeCashFlow = (rows, dateField) => {
    const totals = { incoming: 0, outgoing: 0, net: 0 };
    const byMonth = new Map();
    const byActivity = new Map();
    for (const row of rows) {
        const amount = Number(row.valor || 0);
        if (row.type === 'ENTRADA') totals.incoming += amount;
        else totals.outgoing += amount;
        const date = row[dateField];
        const monthKey = date ? new Date(date).toISOString().slice(0, 7) : 'sem-data';
        const monthly = byMonth.get(monthKey) || { month: monthKey, incoming: 0, outgoing: 0, net: 0 };
        if (row.type === 'ENTRADA') monthly.incoming += amount; else monthly.outgoing += amount;
        monthly.net = monthly.incoming - monthly.outgoing;
        byMonth.set(monthKey, monthly);
        const activity = row.accountCategory?.cashFlowClass || 'OPERATING';
        const activityRow = byActivity.get(activity) || { activity, incoming: 0, outgoing: 0, net: 0 };
        if (row.type === 'ENTRADA') activityRow.incoming += amount; else activityRow.outgoing += amount;
        activityRow.net = activityRow.incoming - activityRow.outgoing;
        byActivity.set(activity, activityRow);
    }
    totals.net = totals.incoming - totals.outgoing;
    return { totals, byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)), byActivity: [...byActivity.values()] };
};
