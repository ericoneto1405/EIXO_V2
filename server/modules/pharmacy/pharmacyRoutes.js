import { PrismaClient } from '@prisma/client';
import { requireNonFieldWorker } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import { logActivity } from '../utils/activityLog.js';
import { calculatePharmacyMovement } from './pharmacyRules.js';

const prisma = new PrismaClient();
const MOVEMENT_TYPES = new Set(['ENTRY', 'EXIT', 'ADJUSTMENT']);
const PRODUCT_CATEGORIES = new Set([
    'VACINA',
    'VERMIFUGO',
    'ANTIBIOTICO',
    'ANTIPARASITARIO',
    'ANTI_INFLAMATORIO',
    'VITAMINA_MINERAL',
    'HORMONIO_REPRODUCAO',
    'DESINFETANTE',
    'MATERIAL_VETERINARIO',
    'OUTRO_SANITARIO',
]);

const parseOptionalDate = (value) => {
    if (!value) return null;
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const serializeBatch = (batch) => ({
    ...batch,
    quantity: Number(batch.quantity || 0),
    unitCost: batch.unitCost === null ? null : Number(batch.unitCost),
});

const serializeProduct = (product) => ({
    ...product,
    minStock: Number(product.minStock || 0),
    batches: (product.batches || []).map(serializeBatch),
    totalStock: (product.batches || []).reduce((sum, batch) => sum + Number(batch.quantity || 0), 0),
});

const attachScopedFarm = async (req, res, next) => {
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(req.params.farmId) }),
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        req.pharmacyFarm = farm;
        return next();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar a fazenda.' });
    }
};

export function registerPharmacyRoutes(app) {
    app.get('/farms/:farmId/pharmacy', attachScopedFarm, async (req, res) => {
        const farm = req.pharmacyFarm;

        try {
            const [products, movements] = await Promise.all([
                prisma.pharmacyProduct.findMany({
                    where: { farmId: farm.id, active: true },
                    include: { batches: { orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }] } },
                    orderBy: { name: 'asc' },
                }),
                prisma.pharmacyMovement.findMany({
                    where: { farmId: farm.id },
                    include: { product: { select: { name: true, unit: true } }, batch: { select: { lotNumber: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                }),
            ]);
            return res.json({
                farm,
                products: products.map(serializeProduct),
                movements: movements.map((movement) => ({ ...movement, quantity: Number(movement.quantity), unitCost: movement.unitCost === null ? null : Number(movement.unitCost) })),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar a farmácia.' });
        }
    });

    app.post('/farms/:farmId/pharmacy/products', requireNonFieldWorker, attachScopedFarm, async (req, res) => {
        const farm = req.pharmacyFarm;

        const name = String(req.body?.name || '').trim();
        const activeIngredient = String(req.body?.activeIngredient || '').trim() || null;
        const category = String(req.body?.category || '').trim().toUpperCase();
        const unit = String(req.body?.unit || '').trim();
        const manufacturer = String(req.body?.manufacturer || '').trim() || null;
        const presentation = String(req.body?.presentation || '').trim() || null;
        const applicationUnit = String(req.body?.applicationUnit || '').trim() || null;
        const storageLocation = String(req.body?.storageLocation || '').trim() || null;
        const refrigerated = req.body?.refrigerated === true;
        const slaughterWithdrawalDays = req.body?.slaughterWithdrawalDays === '' || req.body?.slaughterWithdrawalDays == null ? null : Number(req.body.slaughterWithdrawalDays);
        const milkWithdrawalDays = req.body?.milkWithdrawalDays === '' || req.body?.milkWithdrawalDays == null ? null : Number(req.body.milkWithdrawalDays);
        const notes = String(req.body?.notes || '').trim() || null;
        const minStock = Number(req.body?.minStock ?? 0);
        if (!name || !category || !unit) return res.status(400).json({ message: 'Informe nome, categoria e unidade.' });
        if (!PRODUCT_CATEGORIES.has(category)) return res.status(400).json({ message: 'Categoria sanitária inválida.' });
        if (!Number.isFinite(minStock) || minStock < 0) return res.status(400).json({ message: 'Estoque mínimo inválido.' });
        if (slaughterWithdrawalDays !== null && (!Number.isInteger(slaughterWithdrawalDays) || slaughterWithdrawalDays < 0)) return res.status(400).json({ message: 'Carência para abate inválida.' });
        if (milkWithdrawalDays !== null && (!Number.isInteger(milkWithdrawalDays) || milkWithdrawalDays < 0)) return res.status(400).json({ message: 'Carência para leite inválida.' });

        try {
            const duplicate = await prisma.pharmacyProduct.findFirst({
                where: { farmId: farm.id, name: { equals: name, mode: 'insensitive' } },
                select: { id: true },
            });
            if (duplicate) return res.status(409).json({ message: 'Já existe um produto com esse nome nesta fazenda.' });
            const product = await prisma.pharmacyProduct.create({
                data: {
                    farmId: farm.id,
                    name,
                    activeIngredient,
                    category,
                    manufacturer,
                    presentation,
                    unit,
                    applicationUnit,
                    minStock,
                    storageLocation,
                    refrigerated,
                    slaughterWithdrawalDays,
                    milkWithdrawalDays,
                    notes,
                },
                include: { batches: true },
            });
            void logActivity(prisma, req, { action: 'FARMACIA_PRODUTO_CRIADO', entity: 'PharmacyProduct', entityId: product.id, description: `Cadastrou ${name} na farmácia`, farmId: farm.id });
            return res.status(201).json({ product: serializeProduct(product) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao cadastrar produto.' });
        }
    });

    app.post('/farms/:farmId/pharmacy/batches', requireNonFieldWorker, attachScopedFarm, async (req, res) => {
        const farm = req.pharmacyFarm;

        const productId = String(req.body?.productId || '');
        const lotNumber = String(req.body?.lotNumber || '').trim();
        const quantity = Number(req.body?.quantity);
        const unitCost = req.body?.unitCost === '' || req.body?.unitCost == null ? null : Number(req.body.unitCost);
        const expiresAt = parseOptionalDate(req.body?.expiresAt);
        if (!productId || !lotNumber) return res.status(400).json({ message: 'Informe produto e lote.' });
        if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ message: 'A quantidade de entrada deve ser maior que zero.' });
        if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) return res.status(400).json({ message: 'Custo unitário inválido.' });
        if (expiresAt === undefined) return res.status(400).json({ message: 'Data de validade inválida.' });

        try {
            const product = await prisma.pharmacyProduct.findFirst({ where: { id: productId, farmId: farm.id, active: true } });
            if (!product) return res.status(404).json({ message: 'Produto não encontrado nesta fazenda.' });
            const batch = await prisma.$transaction(async (tx) => {
                const created = await tx.pharmacyBatch.create({
                    data: { farmId: farm.id, productId, lotNumber, expiresAt, quantity, unitCost },
                });
                await tx.pharmacyMovement.create({
                    data: { farmId: farm.id, productId, batchId: created.id, type: 'ENTRY', quantity, unitCost, notes: 'Entrada inicial do lote' },
                });
                return created;
            });
            void logActivity(prisma, req, { action: 'FARMACIA_ENTRADA', entity: 'PharmacyBatch', entityId: batch.id, description: `Entrada de ${quantity} ${product.unit} de ${product.name}`, farmId: farm.id });
            return res.status(201).json({ batch: serializeBatch(batch) });
        } catch (error) {
            if (error?.code === 'P2002') return res.status(409).json({ message: 'Este lote já está cadastrado para o produto.' });
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar entrada do lote.' });
        }
    });

    app.post('/farms/:farmId/pharmacy/movements', requireNonFieldWorker, attachScopedFarm, async (req, res) => {
        const farm = req.pharmacyFarm;

        const batchId = String(req.body?.batchId || '');
        const type = String(req.body?.type || '').toUpperCase();
        const quantity = Number(req.body?.quantity);
        const notes = String(req.body?.notes || '').trim() || null;
        if (!batchId || !MOVEMENT_TYPES.has(type)) return res.status(400).json({ message: 'Informe lote e tipo de movimentação.' });
        if (!Number.isFinite(quantity) || quantity < 0 || (type !== 'ADJUSTMENT' && quantity === 0)) return res.status(400).json({ message: 'Quantidade inválida.' });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const batch = await tx.pharmacyBatch.findFirst({
                    where: { id: batchId, farmId: farm.id },
                    include: { product: true },
                });
                if (!batch) return { error: { status: 404, message: 'Lote não encontrado nesta fazenda.' } };
                const current = Number(batch.quantity || 0);
                let movementResult;
                try {
                    movementResult = calculatePharmacyMovement({ currentStock: current, type, quantity });
                } catch (movementError) {
                    return { error: { status: 409, message: movementError.message === 'Estoque insuficiente.' ? `Estoque insuficiente. Saldo atual: ${current} ${batch.product.unit}.` : movementError.message } };
                }
                const updatedBatch = await tx.pharmacyBatch.update({
                    where: { id: batch.id },
                    data: { quantity: movementResult.nextStock },
                });
                const movement = await tx.pharmacyMovement.create({
                    data: { farmId: farm.id, productId: batch.productId, batchId: batch.id, type, quantity: movementResult.movementQuantity, unitCost: batch.unitCost, notes },
                });
                return { updatedBatch, movement, product: batch.product };
            });
            if (result.error) return res.status(result.error.status).json({ message: result.error.message });
            void logActivity(prisma, req, { action: `FARMACIA_${type}`, entity: 'PharmacyMovement', entityId: result.movement.id, description: `Movimentou o estoque de ${result.product.name}`, farmId: farm.id });
            return res.status(201).json({ movement: result.movement, batch: serializeBatch(result.updatedBatch) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao movimentar estoque.' });
        }
    });
}
