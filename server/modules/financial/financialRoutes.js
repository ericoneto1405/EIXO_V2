import { PrismaClient } from '@prisma/client';
import { upsertSystemAccountCategories } from '../../accountCategoryDefaults.js';
import { logActivity, recordActivityLog } from '../utils/activityLog.js';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import { serializeFinancialTransaction } from '../utils/serializers.js';
import { parseNumber } from '../utils/formatters.js';
import { requireAuth, requireBillingAccess } from '../middlewares/requireAuth.js';
const prisma = new PrismaClient();

const STATUS_TRANSACAO_VALIDOS = ['PAGO', 'PENDENTE', 'CANCELADO'];

const validarCategoriaDaFazenda = async (accountCategoryId, farmId) => {
    const cat = await prisma.accountCategory.findFirst({
        where: {
            id: String(accountCategoryId),
            isActive: true,
            OR: [
                { isSystem: true, farmId: null },
                { farmId: String(farmId) },
            ],
        },
    });
    return Boolean(cat);
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
                    isActive: true,
                    OR: [
                        { isSystem: true, farmId: null },
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
            const { farmId, name, group, type } = req.body;
            if (!farmId || !name?.trim() || !group?.trim() || !type) {
                return res.status(400).json({ message: 'farmId, name, group e type são obrigatórios.' });
            }
            const farmScope = buildFarmScopeFilter(req, { id: String(farmId) });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

            const category = await prisma.accountCategory.create({
                data: {
                    farmId: String(farmId),
                    name: name.trim(),
                    group: group.trim(),
                    type,
                    isSystem: false,
                },
            });
            res.status(201).json({ category });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao criar categoria.' });
        }
    });

    app.patch('/account-categories/:id', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, group, isActive } = req.body;
            const existing = await prisma.accountCategory.findFirst({ where: { id, isSystem: false } });
            if (!existing) return res.status(404).json({ message: 'Categoria não encontrada ou não editável.' });
            // Valida que pertence à fazenda do usuário
            if (existing.farmId) {
                const farmScope = buildFarmScopeFilter(req, { id: existing.farmId });
                const farm = await prisma.farm.findFirst({ where: farmScope });
                if (!farm) return res.status(403).json({ message: 'Acesso negado.' });
            }
            const category = await prisma.accountCategory.update({
                where: { id },
                data: {
                    ...(name ? { name: name.trim() } : {}),
                    ...(group ? { group: group.trim() } : {}),
                    ...(isActive !== undefined ? { isActive } : {}),
                },
            });
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
            const { farmId, type, categoria, accountCategoryId, valor, data, descricao, vencimento, status } = req.body;
            if (!farmId || !type || valor === undefined || valor === null || !data) {
                return res.status(400).json({ message: 'Campos obrigatórios: farmId, type, valor, data.' });
            }
            if (!(parseNumber(valor) > 0)) {
                return res.status(400).json({ message: 'Valor deve ser maior que zero.' });
            }
            const farmScope = buildFarmScopeFilter(req, { id: String(farmId) });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

            if (accountCategoryId && !(await validarCategoriaDaFazenda(accountCategoryId, farmId))) {
                return res.status(400).json({ message: 'Categoria inválida para esta fazenda.' });
            }

            const transaction = await prisma.financialTransaction.create({
                data: {
                    farmId: String(farmId),
                    type,
                    categoria: categoria || 'OUTROS',
                    accountCategoryId: accountCategoryId || null,
                    valor: parseNumber(valor),
                    data: new Date(data),
                    descricao: descricao || null,
                    vencimento: vencimento ? new Date(vencimento) : null,
                    status: status || 'PAGO',
                },
                include: { accountCategory: true },
            });
            const tipoLabel = type === 'ENTRADA' ? 'entrada' : 'saída';
            const valorFmt = Number(parseNumber(valor)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            logActivity(req, { action: 'TRANSACAO_CRIADA', entity: 'FinancialTransaction', entityId: transaction.id, description: `Lançou ${tipoLabel} de ${valorFmt}${descricao ? ` — ${descricao}` : ''}`, farmId: String(farmId) });
            res.status(201).json({ transaction: serializeFinancialTransaction(transaction) });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao criar transação.' });
        }
    });

    app.patch('/financial/transactions/:id', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const existing = await prisma.financialTransaction.findFirst({
                where: { id: req.params.id },
                include: { farm: true },
            });
            if (!existing) return res.status(404).json({ message: 'Transação não encontrada.' });
            const farmScope = buildFarmScopeFilter(req, { id: existing.farmId });
            const farm = await prisma.farm.findFirst({ where: farmScope });
            if (!farm) return res.status(403).json({ message: 'Acesso negado.' });

            const { status, vencimento, valor, descricao, accountCategoryId, data } = req.body;
            if (status !== undefined && !STATUS_TRANSACAO_VALIDOS.includes(String(status))) {
                return res.status(400).json({ message: 'Status inválido.' });
            }
            if (valor !== undefined && !(parseNumber(valor) > 0)) {
                return res.status(400).json({ message: 'Valor deve ser maior que zero.' });
            }
            if (accountCategoryId && !(await validarCategoriaDaFazenda(accountCategoryId, existing.farmId))) {
                return res.status(400).json({ message: 'Categoria inválida para esta fazenda.' });
            }
            const transaction = await prisma.financialTransaction.update({
                where: { id: req.params.id },
                data: {
                    ...(status !== undefined ? { status } : {}),
                    ...(vencimento !== undefined ? { vencimento: vencimento ? new Date(vencimento) : null } : {}),
                    ...(valor !== undefined ? { valor: parseNumber(valor) } : {}),
                    ...(descricao !== undefined ? { descricao: descricao || null } : {}),
                    ...(accountCategoryId !== undefined ? { accountCategoryId: accountCategoryId || null } : {}),
                    ...(data !== undefined ? { data: new Date(data) } : {}),
                },
                include: { accountCategory: true },
            });
            if (status === 'PAGO' && existing.status !== 'PAGO') {
                const valorFmt = Number(existing.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                logActivity(req, { action: 'TRANSACAO_PAGA', entity: 'FinancialTransaction', entityId: existing.id, description: `Marcou como pago: ${valorFmt}${existing.descricao ? ` — ${existing.descricao}` : ''}`, farmId: existing.farmId });
            }
            res.json({ transaction: serializeFinancialTransaction(transaction) });
        } catch (e) {
            console.error(e);
            res.status(500).json({ message: 'Erro ao atualizar transação.' });
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
            const transaction = await prisma.financialTransaction.update({
                where: { id: existing.id },
                data: { status: 'CANCELADO' },
                include: { accountCategory: true },
            });
            await recordActivityLog(req, {
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
}
