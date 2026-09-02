import { PrismaClient } from '@prisma/client';
import { upsertSystemAccountCategories } from '../../accountCategoryDefaults.js';
import { logActivity, recordActivityLog } from '../utils/activityLog.js';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import { serializeFinancialTransaction } from '../utils/serializers.js';
import { parseNumber } from '../utils/formatters.js';
import { requireAuth, requireBillingAccess, requireEntitlement } from '../middlewares/requireAuth.js';
import {
    ensureFinancialSettings,
    summarizeCashFlow,
    summarizeIncomeStatement,
    syncTransactionResult,
} from './financialService.js';
const prisma = new PrismaClient();

const STATUS_TRANSACAO_VALIDOS = ['PAGO', 'PENDENTE', 'CANCELADO'];
const TIPOS_FINANCEIROS_VALIDOS = ['ENTRADA', 'SAIDA'];
const CASH_FLOW_CLASSES = ['OPERATING', 'INVESTING', 'FINANCING'];
const RESULT_CLASSES = ['OPERATING_REVENUE', 'PRODUCTION_COST', 'OPERATING_EXPENSE', 'FINANCIAL_RESULT', 'OTHER_RESULT'];
const RECOGNITION_RULES = ['IMMEDIATE', 'ON_NUTRITION_CONSUMPTION', 'ON_ANIMAL_SALE', 'NOT_IN_RESULT'];
const isAllocationValidationError = (error) => /divis|destino|soma/i.test(String(error?.message || ''));

const parseReportPeriod = (query) => {
    const year = Number(query.year || query.ano) || new Date().getFullYear();
    const monthValue = query.month || query.mes;
    const month = monthValue ? Number(monthValue) : null;
    const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
    const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);
    return { year, month, start, end };
};

const resolveReportFarms = async (req) => {
    const farmId = typeof req.query.farmId === 'string' ? req.query.farmId.trim() : '';
    const farms = await prisma.farm.findMany({
        where: buildFarmScopeFilter(req, farmId ? { id: farmId } : {}),
        select: { id: true, name: true, organizationId: true },
    });
    if (farmId && !farms.length) return null;
    return farms;
};

const buscarCategoriaDaFazenda = async (accountCategoryId, farmId) => {
    return prisma.accountCategory.findFirst({
        where: {
            id: String(accountCategoryId),
            isActive: true,
            OR: [
                { isSystem: true, farmId: null },
                { farmId: String(farmId) },
            ],
        },
    });
};

let systemAccountCategoriesReady = false;
let systemAccountCategoriesPromise = null;

const ensureSystemAccountCategories = async () => {
    if (systemAccountCategoriesReady) return;
    if (!systemAccountCategoriesPromise) {
        systemAccountCategoriesPromise = upsertSystemAccountCategories(prisma)
            .then(() => {
                systemAccountCategoriesReady = true;
            })
            .finally(() => {
                systemAccountCategoriesPromise = null;
            });
    }
    await systemAccountCategoriesPromise;
};

export function registerFinancialRoutes(app) {
    // ── Plano de Contas ──────────────────────────────────────────────────────────

    app.get('/account-categories', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            await ensureSystemAccountCategories();
            const { farmId } = req.query;
            if (farmId) {
                const farmScope = buildFarmScopeFilter(req, { id: String(farmId) });
                const farm = await prisma.farm.findFirst({ where: farmScope });
                if (!farm) {
                    return res.status(404).json({ message: 'Fazenda não encontrada.' });
                }
            }
            const categories = await prisma.accountCategory.findMany({
                where: {
                    OR: [
                        { isSystem: true, farmId: null, isActive: true },
                        ...(farmId ? [{ farmId: String(farmId), isSystem: false }] : []),
                    ],
                },
                orderBy: [{ type: 'asc' }, { group: 'asc' }, { name: 'asc' }],
            });
            res.json({ categories });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao listar categorias.' });
        }
    });

    app.post('/account-categories', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const { farmId, name, group, type, cashFlowClass, resultClass, recognitionRule } = req.body;
            if (!farmId || !name?.trim() || !group?.trim() || !type || !cashFlowClass || !recognitionRule) {
                return res.status(400).json({ message: 'Informe fazenda, nome, grupo, tipo e classificação gerencial.' });
            }
            if (!TIPOS_FINANCEIROS_VALIDOS.includes(String(type))) {
                return res.status(400).json({ message: 'Tipo de categoria inválido.' });
            }
            if (!CASH_FLOW_CLASSES.includes(String(cashFlowClass)) || !RECOGNITION_RULES.includes(String(recognitionRule))) {
                return res.status(400).json({ message: 'Classificação gerencial inválida.' });
            }
            if (recognitionRule !== 'NOT_IN_RESULT' && !RESULT_CLASSES.includes(String(resultClass))) {
                return res.status(400).json({ message: 'Informe onde a categoria aparece no resultado.' });
            }
            const farmScope = buildFarmScopeFilter(req, { id: String(farmId) });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

            const normalizedName = name.trim();
            const normalizedGroup = group.trim();
            const duplicate = await prisma.accountCategory.findFirst({
                where: {
                    farmId: String(farmId),
                    type,
                    name: { equals: normalizedName, mode: 'insensitive' },
                    group: { equals: normalizedGroup, mode: 'insensitive' },
                },
            });
            if (duplicate) {
                return res.status(409).json({
                    message: duplicate.isActive
                        ? 'Já existe uma categoria com este nome neste grupo.'
                        : 'Esta categoria já existe e está desativada. Reative-a no plano de contas.',
                });
            }

            const category = await prisma.accountCategory.create({
                data: {
                    farmId: String(farmId),
                    name: normalizedName,
                    group: normalizedGroup,
                    type,
                    isSystem: false,
                    cashFlowClass,
                    resultClass: recognitionRule === 'NOT_IN_RESULT' ? null : resultClass,
                    recognitionRule,
                    isConfigured: true,
                },
            });
            await logActivity(prisma, req, { action: 'CATEGORIA_FINANCEIRA_CRIADA', entity: 'AccountCategory', entityId: category.id, description: `Criou a categoria ${category.name}`, farmId: String(farmId) });
            res.status(201).json({ category });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao criar categoria.' });
        }
    });

    app.patch('/account-categories/:id', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, group, isActive, cashFlowClass, resultClass, recognitionRule } = req.body;
            const existing = await prisma.accountCategory.findFirst({ where: { id, isSystem: false } });
            if (!existing) return res.status(404).json({ message: 'Categoria não encontrada ou não editável.' });
            // Valida que pertence à fazenda do usuário
            if (existing.farmId) {
                const farmScope = buildFarmScopeFilter(req, { id: existing.farmId });
                const farm = await prisma.farm.findFirst({ where: farmScope });
                if (!farm) return res.status(403).json({ message: 'Acesso negado.' });
            }
            const normalizedName = name !== undefined ? String(name).trim() : existing.name;
            const normalizedGroup = group !== undefined ? String(group).trim() : existing.group;
            if (!normalizedName || !normalizedGroup) {
                return res.status(400).json({ message: 'Nome e grupo da categoria não podem ficar vazios.' });
            }
            const duplicate = await prisma.accountCategory.findFirst({
                where: {
                    id: { not: id },
                    farmId: existing.farmId,
                    type: existing.type,
                    name: { equals: normalizedName, mode: 'insensitive' },
                    group: { equals: normalizedGroup, mode: 'insensitive' },
                },
            });
            if (duplicate) {
                return res.status(409).json({ message: 'Já existe uma categoria com este nome neste grupo.' });
            }
            const nextCashFlowClass = cashFlowClass ?? existing.cashFlowClass;
            const nextRecognitionRule = recognitionRule ?? existing.recognitionRule;
            const nextResultClass = resultClass !== undefined ? resultClass : existing.resultClass;
            if (nextCashFlowClass && !CASH_FLOW_CLASSES.includes(String(nextCashFlowClass))) {
                return res.status(400).json({ message: 'Classificação de caixa inválida.' });
            }
            if (nextRecognitionRule && !RECOGNITION_RULES.includes(String(nextRecognitionRule))) {
                return res.status(400).json({ message: 'Regra de reconhecimento inválida.' });
            }
            if (nextRecognitionRule !== 'NOT_IN_RESULT' && nextRecognitionRule && !RESULT_CLASSES.includes(String(nextResultClass))) {
                return res.status(400).json({ message: 'Classificação de resultado inválida.' });
            }
            const category = await prisma.accountCategory.update({
                where: { id },
                data: {
                    ...(name !== undefined ? { name: normalizedName } : {}),
                    ...(group !== undefined ? { group: normalizedGroup } : {}),
                    ...(isActive !== undefined ? { isActive } : {}),
                    ...(cashFlowClass !== undefined ? { cashFlowClass } : {}),
                    ...(recognitionRule !== undefined ? { recognitionRule } : {}),
                    ...((resultClass !== undefined || recognitionRule === 'NOT_IN_RESULT') ? { resultClass: recognitionRule === 'NOT_IN_RESULT' ? null : resultClass } : {}),
                    ...(nextCashFlowClass && nextRecognitionRule ? { isConfigured: true } : {}),
                },
            });
            await logActivity(prisma, req, { action: 'CATEGORIA_FINANCEIRA_EDITADA', entity: 'AccountCategory', entityId: category.id, description: `Atualizou a categoria ${category.name}`, farmId: existing.farmId });
            res.json({ category });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao editar categoria.' });
        }
    });

    app.delete('/account-categories/:id', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await prisma.accountCategory.findFirst({ where: { id, isSystem: false } });
            if (!existing) return res.status(404).json({ message: 'Categoria não encontrada ou não removível.' });
            if (existing.farmId) {
                const farmScope = buildFarmScopeFilter(req, { id: existing.farmId });
                const farm = await prisma.farm.findFirst({ where: farmScope });
                if (!farm) return res.status(403).json({ message: 'Acesso negado.' });
            }
            // Desativa em vez de excluir (preserva histórico)
            await prisma.accountCategory.update({ where: { id }, data: { isActive: false } });
            res.json({ ok: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao remover categoria.' });
        }
    });

    // ── Transações Financeiras ────────────────────────────────────────────────────

    app.get('/financial/transactions', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const { farmId, mes, ano, tipo, status } = req.query;
            if (!farmId) return res.status(400).json({ message: 'farmId é obrigatório.' });
            const farmScope = buildFarmScopeFilter(req, { id: String(farmId) });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

            const where = { farmId: String(farmId) };
            if (mes && ano) {
                const start = new Date(Number(ano), Number(mes) - 1, 1);
                const end = new Date(Number(ano), Number(mes), 1);
                where.data = { gte: start, lt: end };
            } else if (ano && !mes) {
                const start = new Date(Number(ano), 0, 1);
                const end = new Date(Number(ano) + 1, 0, 1);
                where.data = { gte: start, lt: end };
            }
            if (tipo) where.type = String(tipo);
            if (status) {
                if (!STATUS_TRANSACAO_VALIDOS.includes(String(status))) {
                    return res.status(400).json({ message: 'Status inválido.' });
                }
                where.status = String(status);
            } else {
                where.status = { not: 'CANCELADO' };
            }

            const transactions = await prisma.financialTransaction.findMany({
                where,
                include: { accountCategory: true },
                orderBy: { data: 'desc' },
            });
            res.json({ transactions: transactions.map(serializeFinancialTransaction) });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao listar transações.' });
        }
    });

    app.post('/financial/transactions', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const { farmId, type, categoria, accountCategoryId, valor, data, competenceDate, settledAt, descricao, vencimento, status, allocations } = req.body;
            if (!farmId || !type || valor === undefined || valor === null || !data) {
                return res.status(400).json({ message: 'Campos obrigatórios: farmId, type, valor, data.' });
            }
            if (!TIPOS_FINANCEIROS_VALIDOS.includes(String(type))) {
                return res.status(400).json({ message: 'Tipo de lançamento inválido.' });
            }
            if (status !== undefined && !STATUS_TRANSACAO_VALIDOS.includes(String(status))) {
                return res.status(400).json({ message: 'Status inválido.' });
            }
            if (!(parseNumber(valor) > 0)) {
                return res.status(400).json({ message: 'Valor deve ser maior que zero.' });
            }
            const farmScope = buildFarmScopeFilter(req, { id: String(farmId) });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

            if (!accountCategoryId) return res.status(400).json({ message: 'Selecione uma categoria.' });
            const accountCategory = await buscarCategoriaDaFazenda(accountCategoryId, farmId);
            if (!accountCategory) {
                return res.status(400).json({ message: 'Categoria inválida para esta fazenda.' });
            }
            if (accountCategory.type !== type) {
                return res.status(400).json({ message: 'A categoria selecionada não corresponde ao tipo do lançamento.' });
            }
            if (!accountCategory.isConfigured || accountCategory.deprecatedAt) {
                return res.status(400).json({ message: 'Esta categoria precisa ser regularizada no Plano de Contas antes de ser usada.' });
            }

            const resolvedStatus = status || 'PAGO';
            const resolvedCompetenceDate = new Date(competenceDate || data);
            const transaction = await prisma.$transaction(async (tx) => {
                await ensureFinancialSettings(tx, req.saas?.organizationId || farm.organizationId);
                const created = await tx.financialTransaction.create({
                    data: {
                        farmId: String(farmId),
                        type,
                        categoria: categoria || 'OUTROS',
                        accountCategoryId,
                        valor: parseNumber(valor),
                        data: resolvedCompetenceDate,
                        competenceDate: resolvedCompetenceDate,
                        settledAt: resolvedStatus === 'PAGO' ? new Date(settledAt || competenceDate || data) : null,
                        modelVersion: 2,
                        descricao: descricao || null,
                        vencimento: vencimento ? new Date(vencimento) : null,
                        status: resolvedStatus,
                    },
                    include: { accountCategory: true },
                });
                await syncTransactionResult(tx, created, accountCategory, allocations || []);
                return created;
            });
            const tipoLabel = type === 'ENTRADA' ? 'entrada' : 'saída';
            const valorFmt = Number(parseNumber(valor)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            await logActivity(prisma, req, { action: 'TRANSACAO_CRIADA', entity: 'FinancialTransaction', entityId: transaction.id, description: `Lançou ${tipoLabel} de ${valorFmt}${descricao ? ` — ${descricao}` : ''}`, farmId: String(farmId) });
            res.status(201).json({ transaction: serializeFinancialTransaction(transaction) });
        } catch (e) {
            console.error(e);
            res.status(isAllocationValidationError(e) ? 400 : 500).json({ message: isAllocationValidationError(e) ? e.message : 'Erro ao criar transação.' });
        }
    });

    app.patch('/financial/transactions/:id', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const existing = await prisma.financialTransaction.findFirst({
                where: { id: req.params.id },
                include: { farm: true, accountCategory: true },
            });
            if (!existing) return res.status(404).json({ message: 'Transação não encontrada.' });
            const farmScope = buildFarmScopeFilter(req, { id: existing.farmId });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(403).json({ message: 'Acesso negado.' });

            const { status, vencimento, valor, descricao, accountCategoryId, data, competenceDate, settledAt, allocations } = req.body;
            if (status !== undefined && !STATUS_TRANSACAO_VALIDOS.includes(String(status))) {
                return res.status(400).json({ message: 'Status inválido.' });
            }
            if (valor !== undefined && !(parseNumber(valor) > 0)) {
                return res.status(400).json({ message: 'Valor deve ser maior que zero.' });
            }
            let accountCategory = existing.accountCategory;
            if (accountCategoryId) {
                accountCategory = await buscarCategoriaDaFazenda(accountCategoryId, existing.farmId);
                if (!accountCategory) {
                    return res.status(400).json({ message: 'Categoria inválida para esta fazenda.' });
                }
                if (accountCategory.type !== existing.type) {
                    return res.status(400).json({ message: 'A categoria selecionada não corresponde ao tipo do lançamento.' });
                }
                if (existing.modelVersion === 2 && (!accountCategory.isConfigured || accountCategory.deprecatedAt)) {
                    return res.status(400).json({ message: 'Esta categoria precisa ser regularizada antes de ser usada.' });
                }
            }
            const resolvedStatus = status ?? existing.status;
            const transaction = await prisma.$transaction(async (tx) => {
                const updated = await tx.financialTransaction.update({
                    where: { id: req.params.id },
                    data: {
                        ...(status !== undefined ? { status } : {}),
                        ...(vencimento !== undefined ? { vencimento: vencimento ? new Date(vencimento) : null } : {}),
                        ...(valor !== undefined ? { valor: parseNumber(valor) } : {}),
                        ...(descricao !== undefined ? { descricao: descricao || null } : {}),
                        ...(accountCategoryId !== undefined ? { accountCategoryId: accountCategoryId || null } : {}),
                        ...((data !== undefined || competenceDate !== undefined) ? {
                            data: new Date(competenceDate || data),
                            ...(existing.modelVersion === 2 ? { competenceDate: new Date(competenceDate || data) } : {}),
                        } : {}),
                        ...(settledAt !== undefined ? { settledAt: settledAt ? new Date(settledAt) : null } : {}),
                        ...(status === 'PAGO' && existing.status !== 'PAGO' && settledAt === undefined ? { settledAt: new Date() } : {}),
                        ...(resolvedStatus !== 'PAGO' ? { settledAt: null } : {}),
                    },
                    include: { accountCategory: true },
                });
                await syncTransactionResult(tx, updated, accountCategory, allocations);
                return updated;
            });
            await logActivity(prisma, req, {
                action: allocations !== undefined ? 'RATEIO_FINANCEIRO_EDITADO' : 'TRANSACAO_EDITADA',
                entity: 'FinancialTransaction',
                entityId: existing.id,
                description: allocations !== undefined ? 'Atualizou a divisão analítica do lançamento' : 'Atualizou o lançamento financeiro',
                farmId: existing.farmId,
            });
            if (status === 'PAGO' && existing.status !== 'PAGO') {
                const valorFmt = Number(existing.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                await logActivity(prisma, req, { action: 'TRANSACAO_PAGA', entity: 'FinancialTransaction', entityId: existing.id, description: `Marcou como pago: ${valorFmt}${existing.descricao ? ` — ${existing.descricao}` : ''}`, farmId: existing.farmId });
            }
            res.json({ transaction: serializeFinancialTransaction(transaction) });
        } catch (e) {
            console.error(e);
            res.status(isAllocationValidationError(e) ? 400 : 500).json({ message: isAllocationValidationError(e) ? e.message : 'Erro ao atualizar transação.' });
        }
    });

    app.delete('/financial/transactions/:id', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const existing = await prisma.financialTransaction.findFirst({
                where: { id: req.params.id },
                include: { farm: true },
            });
            if (!existing) return res.status(404).json({ message: 'Transação não encontrada.' });
            const farmScope = buildFarmScopeFilter(req, { id: existing.farmId });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(403).json({ message: 'Acesso negado.' });
            if (existing.herdEventId || existing.sanitaryRecordId) {
                return res.status(400).json({ message: 'Transações geradas automaticamente não podem ser excluídas diretamente.' });
            }
            const transaction = await prisma.$transaction(async (tx) => {
                const cancelled = await tx.financialTransaction.update({
                    where: { id: existing.id },
                    data: { status: 'CANCELADO', settledAt: null },
                    include: { accountCategory: true },
                });
                await syncTransactionResult(tx, cancelled, cancelled.accountCategory);
                return cancelled;
            });
            await recordActivityLog(prisma, req, {
                statusCode: 200,
                requestMeta: {
                    action: 'financial_transaction_cancelled',
                    targetType: 'financial_transaction',
                    targetId: existing.id,
                    farmId: existing.farmId,
                    result: 'cancelled',
                },
            });
            res.json({
                ok: true,
                transaction: serializeFinancialTransaction(transaction),
                message: 'Transação cancelada com segurança.',
            });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao excluir transação.' });
        }
    });

    app.get('/financial/reports/cash-flow', requireAuth, requireBillingAccess, requireEntitlement('EIXO_GESTAO', 'EIXO_DECISAO'), async (req, res) => {
        try {
            const farms = await resolveReportFarms(req);
            if (!farms) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const { start, end, year, month } = parseReportPeriod(req.query);
            const farmIds = farms.map((farm) => farm.id);
            const [realized, projected] = await Promise.all([
                prisma.financialTransaction.findMany({
                    where: { farmId: { in: farmIds }, status: 'PAGO', settledAt: { gte: start, lt: end } },
                    include: { accountCategory: true },
                }),
                prisma.financialTransaction.findMany({
                    where: { farmId: { in: farmIds }, status: 'PENDENTE', vencimento: { gte: start, lt: end } },
                    include: { accountCategory: true },
                }),
            ]);
            res.json({ period: { year, month, start, end }, realized: summarizeCashFlow(realized, 'settledAt'), projected: summarizeCashFlow(projected, 'vencimento') });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao montar fluxo de caixa.' });
        }
    });

    app.get('/financial/reports/income-statement', requireAuth, requireBillingAccess, requireEntitlement('EIXO_GESTAO', 'EIXO_DECISAO'), async (req, res) => {
        try {
            const farms = await resolveReportFarms(req);
            if (!farms) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const { start, end, year, month } = parseReportPeriod(req.query);
            const entries = await prisma.financialResultEntry.findMany({
                where: { farmId: { in: farms.map((farm) => farm.id) }, status: 'ACTIVE', competenceDate: { gte: start, lt: end } },
                include: { accountCategory: true },
            });
            const byFarm = farms.map((farm) => ({
                farmId: farm.id,
                farmName: farm.name,
                ...summarizeIncomeStatement(entries.filter((entry) => entry.farmId === farm.id)),
            }));
            const settings = req.saas?.organizationId
                ? await prisma.organizationFinancialSettings.findUnique({ where: { organizationId: req.saas.organizationId } })
                : null;
            res.json({
                period: { year, month, start, end },
                reliableSince: settings?.analyticsStartedAt || null,
                consolidated: summarizeIncomeStatement(entries),
                byFarm,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao montar o resultado da operação.' });
        }
    });

    app.get('/financial/reports/analytics', requireAuth, requireBillingAccess, requireEntitlement('EIXO_GESTAO', 'EIXO_DECISAO'), async (req, res) => {
        try {
            const dimension = String(req.query.dimension || 'FARM').toUpperCase();
            if (!['FARM', 'LOT', 'PADDOCK', 'PRODUCTION_PHASE'].includes(dimension)) {
                return res.status(400).json({ message: 'Dimensão de análise inválida.' });
            }
            const farms = await resolveReportFarms(req);
            if (!farms) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const { start, end, year, month } = parseReportPeriod(req.query);
            const entries = await prisma.financialResultEntry.findMany({
                where: { farmId: { in: farms.map((farm) => farm.id) }, status: 'ACTIVE', competenceDate: { gte: start, lt: end } },
                include: { accountCategory: true, allocations: true },
            });
            const groups = new Map();
            let totalEligible = 0;
            let totalAllocated = 0;
            const add = (key, label, entry, amount, farmId) => {
                const row = groups.get(key) || { key, label, farmId, revenue: 0, productionCost: 0, operatingExpense: 0, margin: 0, categories: {} };
                if (entry.resultClass === 'OPERATING_REVENUE') row.revenue += amount;
                else if (entry.resultClass === 'PRODUCTION_COST') row.productionCost += amount;
                else if (entry.resultClass === 'OPERATING_EXPENSE') row.operatingExpense += amount;
                if (entry.resultClass === 'PRODUCTION_COST' || entry.resultClass === 'OPERATING_EXPENSE') {
                    const categoryName = entry.accountCategory?.name || 'Sem categoria';
                    row.categories[categoryName] = (row.categories[categoryName] || 0) + amount;
                }
                row.margin = row.revenue - row.productionCost - row.operatingExpense;
                groups.set(key, row);
            };
            for (const entry of entries) {
                const amount = Number(entry.amount || 0);
                totalEligible += amount;
                if (dimension === 'FARM') {
                    const farm = farms.find((item) => item.id === entry.farmId);
                    add(entry.farmId, farm?.name || 'Fazenda', entry, amount, entry.farmId);
                    totalAllocated += amount;
                    continue;
                }
                for (const allocation of entry.allocations) {
                    const allocatedAmount = Number(allocation.amount || 0);
                    let key = '';
                    let label = '';
                    if (dimension === 'LOT') {
                        key = allocation.lotId || allocation.poLotId || '';
                        label = allocation.lotNameSnapshot || 'Lote não informado';
                    } else if (dimension === 'PADDOCK') {
                        key = allocation.paddockId || '';
                        label = allocation.paddockNameSnapshot || 'Pasto não informado';
                    } else {
                        key = allocation.productionPhase || '';
                        label = allocation.phaseLabelSnapshot || allocation.productionPhase || 'Fase não informada';
                    }
                    if (!key) continue;
                    add(key, label, entry, allocatedAmount, entry.farmId);
                    totalAllocated += allocatedAmount;
                }
            }
            if (dimension === 'LOT') {
                const commercialLotIds = [...new Set(entries.flatMap((entry) => entry.allocations.map((allocation) => allocation.lotId).filter(Boolean)))];
                const poLotIds = [...new Set(entries.flatMap((entry) => entry.allocations.map((allocation) => allocation.poLotId).filter(Boolean)))];
                const [commercialLots, poLots] = await Promise.all([
                    prisma.lot.findMany({ where: { id: { in: commercialLotIds } }, include: { animals: { include: { pesagens: { orderBy: { data: 'asc' } } } } } }),
                    prisma.poLot.findMany({ where: { id: { in: poLotIds } }, include: { animals: { include: { pesagens: { orderBy: { data: 'asc' } } } } } }),
                ]);
                const acquisitionCostLots = new Set(entries
                    .filter((entry) => entry.sourceType === 'HERD_SALE_ACQUISITION')
                    .flatMap((entry) => entry.allocations.map((allocation) => allocation.lotId || allocation.poLotId).filter(Boolean)));
                const enrichCostPerArroba = (row, animals) => {
                    const missing = [];
                    let gainKg = 0;
                    if (!animals.length || animals.some((animal) => animal.pesagens.length < 2)) missing.push('pesagem inicial e final');
                    else {
                        gainKg = animals.reduce((sum, animal) => sum + (Number(animal.pesagens.at(-1)?.peso || 0) - Number(animal.pesagens[0]?.peso || 0)), 0);
                        if (!(gainKg > 0)) missing.push('ganho de peso positivo');
                    }
                    if (!(row.productionCost > 0)) missing.push('custos diretos atribuídos');
                    if (row.revenue > 0 && !acquisitionCostLots.has(row.key)) missing.push('custo de aquisição');
                    row.costPerArroba = missing.length ? null : row.productionCost / (gainKg / 15);
                    row.costPerArrobaMissing = missing;
                };
                for (const lot of commercialLots) enrichCostPerArroba(groups.get(lot.id), lot.animals);
                for (const lot of poLots) enrichCostPerArroba(groups.get(lot.id), lot.animals);
            }
            if (dimension === 'PADDOCK') {
                const paddockIds = [...groups.keys()];
                const moves = await prisma.paddockMove.findMany({
                    where: { paddockId: { in: paddockIds }, startAt: { lt: end }, OR: [{ endAt: null }, { endAt: { gt: start } }] },
                    select: { paddockId: true, startAt: true, endAt: true },
                });
                for (const paddockId of paddockIds) {
                    const animalDays = moves.filter((move) => move.paddockId === paddockId).reduce((sum, move) => {
                        const from = Math.max(new Date(move.startAt).getTime(), start.getTime());
                        const to = Math.min(move.endAt ? new Date(move.endAt).getTime() : end.getTime(), end.getTime());
                        return sum + Math.max(0, (to - from) / 86_400_000);
                    }, 0);
                    const row = groups.get(paddockId);
                    row.costPerHeadDay = row.productionCost > 0 && animalDays > 0 ? row.productionCost / animalDays : null;
                    row.costPerHeadDayMissing = row.productionCost <= 0 ? 'custos diretos atribuídos' : animalDays <= 0 ? 'histórico de permanência dos animais' : null;
                }
            }
            const reportItems = [...groups.values()].map((row) => ({
                ...row,
                categories: undefined,
                topCategories: Object.entries(row.categories).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 3),
            })).sort((a, b) => b.margin - a.margin);
            res.json({
                period: { year, month, start, end },
                dimension,
                items: reportItems,
                unallocatedAmount: Math.max(0, totalEligible - totalAllocated),
                allocationCoveragePercent: totalEligible > 0 ? Math.min(100, (totalAllocated / totalEligible) * 100) : 100,
                metricNotice: dimension === 'LOT'
                    ? 'Custo por arroba só é exibido quando pesagens e custos atribuídos forem suficientes.'
                    : dimension === 'PADDOCK' ? 'Custo por cabeça/dia exige histórico de permanência dos animais.' : null,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao montar custos e margens.' });
        }
    });

    app.get('/financial/reports/data-quality', requireAuth, requireBillingAccess, requireEntitlement('EIXO_GESTAO', 'EIXO_DECISAO'), async (req, res) => {
        try {
            const farms = await resolveReportFarms(req);
            if (!farms) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const farmIds = farms.map((farm) => farm.id);
            const [unconfiguredCategories, activeEntries, commercialLotsWithoutPhase, poLotsWithoutPhase, commercialAnimalsWithoutAcquisition, poAnimalsWithoutAcquisition, animals, weighingCounts] = await Promise.all([
                prisma.accountCategory.count({ where: { farmId: { in: farmIds }, isActive: true, isConfigured: false } }),
                prisma.financialResultEntry.findMany({ where: { farmId: { in: farmIds }, status: 'ACTIVE', resultClass: 'PRODUCTION_COST' }, include: { allocations: true } }),
                prisma.lot.count({ where: { farmId: { in: farmIds }, status: 'ATIVO', productionPhase: null } }),
                prisma.poLot.count({ where: { farmId: { in: farmIds }, productionPhase: null } }),
                prisma.animal.count({
                    where: { farmId: { in: farmIds }, AND: [{ herdEvents: { some: { type: 'VENDA' } } }, { herdEvents: { none: { type: 'COMPRA', valor: { gt: 0 } } } }] },
                }),
                prisma.poAnimal.count({
                    where: { farmId: { in: farmIds }, AND: [{ herdEvents: { some: { type: 'VENDA' } } }, { herdEvents: { none: { type: 'COMPRA', valor: { gt: 0 } } } }] },
                }),
                prisma.animal.findMany({ where: { farmId: { in: farmIds } }, select: { id: true } }),
                prisma.weighing.groupBy({ by: ['animalId'], where: { animal: { farmId: { in: farmIds } } }, _count: { _all: true } }),
            ]);
            const weighingCountByAnimal = new Map(weighingCounts.map((item) => [item.animalId, item._count._all]));
            const animalsWithoutSufficientWeighings = animals.filter((animal) => (weighingCountByAnimal.get(animal.id) || 0) < 2).length;
            const lotsWithoutPhase = commercialLotsWithoutPhase + poLotsWithoutPhase;
            const animalsWithoutAcquisition = commercialAnimalsWithoutAcquisition + poAnimalsWithoutAcquisition;
            const totalAmount = activeEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
            const allocatedAmount = activeEntries.reduce((sum, entry) => sum + entry.allocations.reduce((inner, allocation) => inner + Number(allocation.amount || 0), 0), 0);
            res.json({
                unconfiguredCategories,
                lotsWithoutPhase,
                animalsWithoutAcquisitionCost: animalsWithoutAcquisition,
                animalsWithoutSufficientWeighings,
                unallocatedAmount: Math.max(0, totalAmount - allocatedAmount),
                allocationCoveragePercent: totalAmount > 0 ? Math.min(100, (allocatedAmount / totalAmount) * 100) : 100,
                reliable: unconfiguredCategories === 0 && lotsWithoutPhase === 0,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao verificar a qualidade dos dados.' });
        }
    });
}
