import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import { requireAuth, requireBillingAccess } from '../middlewares/requireAuth.js';

const serializeAllocation = (item) => ({
    id: item.id,
    amount: Number(item.amount),
    lotId: item.lotId,
    paddockId: item.paddockId,
    animalId: item.animalId,
    productionPhase: item.productionPhase,
    lotName: item.lotNameSnapshot,
    paddockName: item.paddockNameSnapshot,
    animalLabel: item.animalLabelSnapshot,
});

export function canEditTransactionAllocations(transaction, category = transaction.accountCategory) {
    return transaction.modelVersion === 2 && transaction.status !== 'CANCELADO'
        && !transaction.herdEventId && !transaction.sanitaryRecordId
        && !!category?.isConfigured && !category.deprecatedAt
        && category.recognitionRule === 'IMMEDIATE' && !!category.resultClass;
}

export function registerFinancialAllocationRoutes(app, { database }) {
    app.get('/financial/transactions/:id/allocations', requireAuth, requireBillingAccess, async (req, res) => {
        try {
            const transaction = await database.financialTransaction.findFirst({
                where: { id: req.params.id, farm: buildFarmScopeFilter(req) },
                include: { accountCategory: true },
            });
            if (!transaction) return res.status(404).json({ message: 'Lançamento não encontrado.' });
            const entries = await database.financialResultEntry.findMany({
                where: { transactionId: transaction.id, farmId: transaction.farmId, status: 'ACTIVE' },
                include: { allocations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            const directSource = `TRANSACTION:${transaction.id}:RESULT`;
            const direct = entries.find((entry) => entry.sourceKey === directSource);
            const editable = canEditTransactionAllocations(transaction);
            res.json({
                editable,
                reason: editable ? null : 'A distribuição deste lançamento é mantida pelo fluxo que reconhece o resultado. Consulte os destinos abaixo.',
                allocations: (direct?.allocations || []).map(serializeAllocation),
                relatedResults: entries.filter((entry) => entry.sourceKey !== directSource).map((entry) => ({
                    id: entry.id,
                    description: entry.description || 'Resultado vinculado',
                    amount: Number(entry.amount),
                    allocations: entry.allocations.map(serializeAllocation),
                })),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Não foi possível consultar a distribuição do lançamento.' });
        }
    });
}
