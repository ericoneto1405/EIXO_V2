import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { requireAuth, requireModule } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseNumber, parseDateValue } from '../utils/formatters.js';
import { logActivity } from '../utils/activityLog.js';

const prisma = new PrismaClient();

const CLIENT_TYPES = ['FRIGORIFICO', 'PECUARISTA', 'LEILAO_CORRETOR'];
const DEAL_STAGES = ['PROSPECCAO', 'CONTATO', 'NEGOCIANDO', 'PROPOSTA', 'GANHO', 'PERDIDO'];
const REMINDER_TYPES = ['BIRTHDAY', 'INACTIVITY', 'CUSTOM'];
const INACTIVITY_DAYS = 90;
const UPCOMING_BIRTHDAY_DAYS = 7;

const serializeClient = (c) => ({
    id: c.id,
    farmId: c.farmId,
    name: c.name,
    type: c.type,
    document: c.document || null,
    phone: c.phone || null,
    email: c.email || null,
    city: c.city || null,
    state: c.state || null,
    birthDate: c.birthDate ? c.birthDate.toISOString() : null,
    notes: c.notes || null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
});

const serializeDeal = (d) => ({
    id: d.id,
    farmId: d.farmId,
    clientId: d.clientId,
    client: d.client ? { id: d.client.id, name: d.client.name, type: d.client.type } : undefined,
    title: d.title,
    stage: d.stage,
    lotLabel: d.lotLabel || null,
    quantityAnimals: d.quantityAnimals ?? null,
    estimatedValue: d.estimatedValue ?? null,
    closedValue: d.closedValue ?? null,
    expectedCloseDate: d.expectedCloseDate ? d.expectedCloseDate.toISOString() : null,
    closedAt: d.closedAt ? d.closedAt.toISOString() : null,
    lostReason: d.lostReason || null,
    notes: d.notes || null,
    hasContract: d.contract ? true : false,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
});

const serializeContract = (c) => ({
    id: c.id,
    dealId: c.dealId,
    farmId: c.farmId,
    commissionPct: c.commissionPct ?? null,
    commissionAmount: c.commissionAmount ?? null,
    paymentTerms: c.paymentTerms || null,
    fileName: c.fileName || null,
    storagePath: c.storagePath || null,
    signedAt: c.signedAt ? c.signedAt.toISOString() : null,
    notes: c.notes || null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
});

const serializeReminder = (r) => ({
    id: r.id,
    farmId: r.farmId,
    clientId: r.clientId,
    client: r.client ? { id: r.client.id, name: r.client.name } : undefined,
    type: r.type,
    dueDate: r.dueDate.toISOString(),
    message: r.message || null,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
});

async function resolveFarm(req, farmId) {
    if (!farmId) return null;
    return prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
}

function nextBirthdayDiffDays(birthDate, today) {
    if (!birthDate) return null;
    const thisYear = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
    thisYear.setHours(0, 0, 0, 0);
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let target = thisYear;
    if (target < base) {
        target = new Date(today.getFullYear() + 1, birthDate.getMonth(), birthDate.getDate());
    }
    return Math.round((target.getTime() - base.getTime()) / 86400000);
}

export function registerCommercialRoutes(app) {

    // ── Clientes ─────────────────────────────────────────────────────────
    app.get('/commercial/clients', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { farmId, search, type } = req.query || {};
        const farm = await resolveFarm(req, farmId);
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        try {
            const where = { farmId: farm.id };
            if (type && CLIENT_TYPES.includes(type)) where.type = type;
            if (search) where.name = { contains: String(search), mode: 'insensitive' };
            const clients = await prisma.commercialClient.findMany({ where, orderBy: { name: 'asc' } });
            return res.json({ clients: clients.map(serializeClient) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar clientes.' });
        }
    });

    app.post('/commercial/clients', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { farmId, name, type, document, phone, email, city, state, birthDate, notes } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ message: 'Informe o nome do cliente.' });
        if (!CLIENT_TYPES.includes(type)) return res.status(400).json({ message: 'Tipo de cliente inválido.' });
        const farm = await resolveFarm(req, farmId);
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        try {
            const client = await prisma.commercialClient.create({
                data: {
                    id: randomUUID(), farmId: farm.id, createdById: req.user.id,
                    name: name.trim(), type, document: document?.trim() || null,
                    phone: phone?.trim() || null, email: email?.trim() || null,
                    city: city?.trim() || null, state: state?.trim() || null,
                    birthDate: parseDateValue(birthDate), notes: notes?.trim() || null,
                },
            });
            await logActivity(prisma, req, { action: 'CLIENTE_CRIADO', entity: 'CommercialClient', entityId: client.id, description: `Criou cliente ${client.name}`, farmId: farm.id });
            return res.status(201).json({ client: serializeClient(client) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao criar cliente.' });
        }
    });

    app.put('/commercial/clients/:id', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        const { name, type, document, phone, email, city, state, birthDate, notes } = req.body || {};
        if (type && !CLIENT_TYPES.includes(type)) return res.status(400).json({ message: 'Tipo de cliente inválido.' });
        try {
            const existing = await prisma.commercialClient.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!existing) return res.status(404).json({ message: 'Cliente não encontrado.' });
            const client = await prisma.commercialClient.update({
                where: { id },
                data: {
                    name: name?.trim() ?? existing.name, type: type ?? existing.type,
                    document: document !== undefined ? (document?.trim() || null) : existing.document,
                    phone: phone !== undefined ? (phone?.trim() || null) : existing.phone,
                    email: email !== undefined ? (email?.trim() || null) : existing.email,
                    city: city !== undefined ? (city?.trim() || null) : existing.city,
                    state: state !== undefined ? (state?.trim() || null) : existing.state,
                    birthDate: birthDate !== undefined ? parseDateValue(birthDate) : existing.birthDate,
                    notes: notes !== undefined ? (notes?.trim() || null) : existing.notes,
                },
            });
            return res.json({ client: serializeClient(client) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar cliente.' });
        }
    });

    app.delete('/commercial/clients/:id', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await prisma.commercialClient.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!existing) return res.status(404).json({ message: 'Cliente não encontrado.' });
            await prisma.commercialClient.delete({ where: { id } });
            await logActivity(prisma, req, { action: 'CLIENTE_EXCLUIDO', entity: 'CommercialClient', entityId: id, description: `Excluiu cliente ${existing.name}`, farmId: existing.farmId });
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao excluir cliente.' });
        }
    });

    // ── Negociações (pipeline) ──────────────────────────────────────────────
    app.get('/commercial/deals', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { farmId, stage, clientId } = req.query || {};
        const farm = await resolveFarm(req, farmId);
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        try {
            const where = { farmId: farm.id };
            if (stage && DEAL_STAGES.includes(stage)) where.stage = stage;
            if (clientId) where.clientId = String(clientId);
            const deals = await prisma.commercialDeal.findMany({
                where, orderBy: { updatedAt: 'desc' },
                include: { client: { select: { id: true, name: true, type: true } }, contract: { select: { id: true } } },
            });
            return res.json({ deals: deals.map(serializeDeal) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar negociações.' });
        }
    });

    app.post('/commercial/deals', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { farmId, clientId, title, lotLabel, quantityAnimals, estimatedValue, expectedCloseDate, notes } = req.body || {};
        if (!title?.trim()) return res.status(400).json({ message: 'Informe um título para a negociação.' });
        const farm = await resolveFarm(req, farmId);
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        try {
            const client = await prisma.commercialClient.findFirst({ where: { id: clientId, farmId: farm.id } });
            if (!client) return res.status(404).json({ message: 'Cliente não encontrado.' });
            const deal = await prisma.commercialDeal.create({
                data: {
                    id: randomUUID(), farmId: farm.id, clientId: client.id, createdById: req.user.id,
                    title: title.trim(), stage: 'PROSPECCAO',
                    lotLabel: lotLabel?.trim() || null, quantityAnimals: parseNumber(quantityAnimals) ? Math.round(parseNumber(quantityAnimals)) : null,
                    estimatedValue: parseNumber(estimatedValue), expectedCloseDate: parseDateValue(expectedCloseDate),
                    notes: notes?.trim() || null,
                },
            });
            await logActivity(prisma, req, { action: 'NEGOCIACAO_CRIADA', entity: 'CommercialDeal', entityId: deal.id, description: `Abriu negociação "${deal.title}" com ${client.name}`, farmId: farm.id });
            return res.status(201).json({ deal: serializeDeal({ ...deal, client }) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao criar negociação.' });
        }
    });

    app.put('/commercial/deals/:id', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        const { title, stage, lotLabel, quantityAnimals, estimatedValue, closedValue, expectedCloseDate, lostReason, notes } = req.body || {};
        if (stage && !DEAL_STAGES.includes(stage)) return res.status(400).json({ message: 'Etapa inválida.' });
        try {
            const existing = await prisma.commercialDeal.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!existing) return res.status(404).json({ message: 'Negociação não encontrada.' });
            if (stage === 'PERDIDO' && !lostReason?.trim() && !existing.lostReason) {
                return res.status(400).json({ message: 'Informe o motivo da perda.' });
            }
            if (stage === 'GANHO' && !(closedValue ?? existing.closedValue)) {
                return res.status(400).json({ message: 'Informe o valor de fechamento.' });
            }
            const nextStage = stage ?? existing.stage;
            const deal = await prisma.commercialDeal.update({
                where: { id },
                data: {
                    title: title?.trim() ?? existing.title, stage: nextStage,
                    lotLabel: lotLabel !== undefined ? (lotLabel?.trim() || null) : existing.lotLabel,
                    quantityAnimals: quantityAnimals !== undefined ? (parseNumber(quantityAnimals) ? Math.round(parseNumber(quantityAnimals)) : null) : existing.quantityAnimals,
                    estimatedValue: estimatedValue !== undefined ? parseNumber(estimatedValue) : existing.estimatedValue,
                    closedValue: closedValue !== undefined ? parseNumber(closedValue) : existing.closedValue,
                    expectedCloseDate: expectedCloseDate !== undefined ? parseDateValue(expectedCloseDate) : existing.expectedCloseDate,
                    lostReason: lostReason !== undefined ? (lostReason?.trim() || null) : existing.lostReason,
                    notes: notes !== undefined ? (notes?.trim() || null) : existing.notes,
                    closedAt: nextStage === 'GANHO' && existing.stage !== 'GANHO' ? new Date() : (nextStage === 'GANHO' ? existing.closedAt : (nextStage === 'PERDIDO' ? (existing.closedAt ?? new Date()) : existing.closedAt)),
                },
            });
            return res.json({ deal: serializeDeal(deal) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar negociação.' });
        }
    });

    app.delete('/commercial/deals/:id', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await prisma.commercialDeal.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!existing) return res.status(404).json({ message: 'Negociação não encontrada.' });
            await prisma.commercialDeal.delete({ where: { id } });
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao excluir negociação.' });
        }
    });

    // ── Contratos ────────────────────────────────────────────────────────
    app.post('/commercial/deals/:id/contract', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        const { commissionPct, commissionAmount, paymentTerms, fileName, storagePath, signedAt, notes } = req.body || {};
        try {
            const deal = await prisma.commercialDeal.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!deal) return res.status(404).json({ message: 'Negociação não encontrada.' });
            if (deal.stage !== 'GANHO') return res.status(400).json({ message: 'Só é possível gerar contrato para negociação fechada (Ganho).' });
            const contract = await prisma.commercialContract.upsert({
                where: { dealId: id },
                update: {
                    commissionPct: parseNumber(commissionPct), commissionAmount: parseNumber(commissionAmount),
                    paymentTerms: paymentTerms?.trim() || null, fileName: fileName?.trim() || null,
                    storagePath: storagePath?.trim() || null, signedAt: parseDateValue(signedAt), notes: notes?.trim() || null,
                },
                create: {
                    id: randomUUID(), dealId: id, farmId: deal.farmId, createdById: req.user.id,
                    commissionPct: parseNumber(commissionPct), commissionAmount: parseNumber(commissionAmount),
                    paymentTerms: paymentTerms?.trim() || null, fileName: fileName?.trim() || null,
                    storagePath: storagePath?.trim() || null, signedAt: parseDateValue(signedAt), notes: notes?.trim() || null,
                },
            });
            return res.status(201).json({ contract: serializeContract(contract) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar contrato.' });
        }
    });

    app.get('/commercial/deals/:id/contract', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        try {
            const deal = await prisma.commercialDeal.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!deal) return res.status(404).json({ message: 'Negociação não encontrada.' });
            const contract = await prisma.commercialContract.findUnique({ where: { dealId: id } });
            return res.json({ contract: contract ? serializeContract(contract) : null });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao buscar contrato.' });
        }
    });

    // ── Lembretes ────────────────────────────────────────────────────────
    app.get('/commercial/reminders', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { farmId, includeDone } = req.query || {};
        const farm = await resolveFarm(req, farmId);
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        try {
            const where = { farmId: farm.id };
            if (includeDone !== 'true') where.doneAt = null;
            const reminders = await prisma.commercialReminder.findMany({
                where, orderBy: { dueDate: 'asc' }, include: { client: { select: { id: true, name: true } } },
            });
            return res.json({ reminders: reminders.map(serializeReminder) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar lembretes.' });
        }
    });

    app.post('/commercial/reminders', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { farmId, clientId, type, dueDate, message } = req.body || {};
        if (!REMINDER_TYPES.includes(type)) return res.status(400).json({ message: 'Tipo de lembrete inválido.' });
        const dueDateValue = parseDateValue(dueDate);
        if (!dueDateValue) return res.status(400).json({ message: 'Informe a data do lembrete.' });
        const farm = await resolveFarm(req, farmId);
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        try {
            const client = await prisma.commercialClient.findFirst({ where: { id: clientId, farmId: farm.id } });
            if (!client) return res.status(404).json({ message: 'Cliente não encontrado.' });
            const reminder = await prisma.commercialReminder.create({
                data: { id: randomUUID(), farmId: farm.id, clientId: client.id, createdById: req.user.id, type, dueDate: dueDateValue, message: message?.trim() || null },
            });
            return res.status(201).json({ reminder: serializeReminder({ ...reminder, client }) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao criar lembrete.' });
        }
    });

    app.put('/commercial/reminders/:id/done', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await prisma.commercialReminder.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!existing) return res.status(404).json({ message: 'Lembrete não encontrado.' });
            const reminder = await prisma.commercialReminder.update({ where: { id }, data: { doneAt: new Date() } });
            return res.json({ reminder: serializeReminder(reminder) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao concluir lembrete.' });
        }
    });

    app.delete('/commercial/reminders/:id', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { id } = req.params;
        try {
            const existing = await prisma.commercialReminder.findFirst({ where: { id, farm: buildFarmRelationFilter(req) } });
            if (!existing) return res.status(404).json({ message: 'Lembrete não encontrado.' });
            await prisma.commercialReminder.delete({ where: { id } });
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao excluir lembrete.' });
        }
    });

    // ── Alertas (aniversário + inatividade + lembretes pendentes) ──────────
    app.get('/commercial/alerts', requireAuth, requireModule('Gestão Comercial'), async (req, res) => {
        const { farmId } = req.query || {};
        const farm = await resolveFarm(req, farmId);
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        try {
            const today = new Date();
            const [clients, lastPurchases, pendingReminders] = await Promise.all([
                prisma.commercialClient.findMany({ where: { farmId: farm.id } }),
                prisma.commercialDeal.groupBy({ by: ['clientId'], where: { farmId: farm.id, stage: 'GANHO' }, _max: { closedAt: true } }),
                prisma.commercialReminder.findMany({
                    where: { farmId: farm.id, doneAt: null, dueDate: { lte: new Date(today.getTime() + 7 * 86400000) } },
                    orderBy: { dueDate: 'asc' }, include: { client: { select: { id: true, name: true } } },
                }),
            ]);
            const lastPurchaseByClient = new Map(lastPurchases.map((row) => [row.clientId, row._max.closedAt]));

            const birthdays = clients
                .filter((c) => c.birthDate)
                .map((c) => ({ client: { id: c.id, name: c.name }, birthDate: c.birthDate.toISOString(), daysUntil: nextBirthdayDiffDays(c.birthDate, today) }))
                .filter((row) => row.daysUntil !== null && row.daysUntil <= UPCOMING_BIRTHDAY_DAYS)
                .sort((a, b) => a.daysUntil - b.daysUntil);

            const inactive = clients
                .map((c) => {
                    const lastPurchaseAt = lastPurchaseByClient.get(c.id) || null;
                    const daysSince = lastPurchaseAt ? Math.floor((today.getTime() - lastPurchaseAt.getTime()) / 86400000) : null;
                    return { client: { id: c.id, name: c.name }, lastPurchaseAt: lastPurchaseAt ? lastPurchaseAt.toISOString() : null, daysSincePurchase: daysSince };
                })
                .filter((row) => row.daysSincePurchase === null || row.daysSincePurchase >= INACTIVITY_DAYS)
                .sort((a, b) => (b.daysSincePurchase ?? 99999) - (a.daysSincePurchase ?? 99999));

            return res.json({
                birthdays,
                inactiveClients: inactive,
                reminders: pendingReminders.map(serializeReminder),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao montar alertas.' });
        }
    });
}
