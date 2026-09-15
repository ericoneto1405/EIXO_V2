import { rejectLegacyPoReference } from './legacyPoGuard.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { requireAuth, requireNonFieldWorker } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseNumber, parseDateValue, parseInteger, normalizeSexo, normalizeSemenMoveType, normalizeEmbryoMoveType } from '../utils/formatters.js';
import { normalizarCategoriaParaGravar } from '../herd/animalCategories.js';
import { logActivity } from '../utils/activityLog.js';
import {
    serializeSemenBatch, serializeEmbryoBatch,
    serializePaddockMove, serializeNutritionPlan,
} from '../utils/serializers.js';
import { moveAnimalBetweenPaddocks, moveAnimalsBetweenPaddocks, transferAnimalsToFarm, createBulkWeighings, calculateGmdMetrics, diffDaysFloat, weanCalf } from '../animals/animalRoutes.js';
import { HERD_EVENT_CATEGORY_MAP } from '../config/env.js';
import { buildPurchasePaymentSchedule, createIntegratedTransaction } from '../financial/financialService.js';
import { buildProvisionalIdentification, buildTeProvisionalIdentification } from '../animals/herdIntegrityService.js';
const prisma = new PrismaClient();

const verifyPasswordWithLegacySupport = async (user, password) => {
    if (!user?.password) return false;
    if (user.password.startsWith('$2')) {
        return bcrypt.compare(password, user.password);
    }
    const matches = user.password === password;
    if (matches) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });
    }
    return matches;
};

const recalculateAnimalWeighingChain = async (tx, animalId) => {
    const weighingModel = tx.weighing;
    const animalModel = tx.animal;
    const animalIdField = 'animalId';
    const allWeighings = await weighingModel.findMany({
        where: { [animalIdField]: animalId },
        orderBy: { data: 'asc' },
    });

    let previous = null;
    for (const row of allWeighings) {
        let gmdValue = 0;
        if (previous) {
            const interval = diffDaysFloat(row.data, previous.data);
            if (interval > 0) {
                gmdValue = (row.peso - previous.peso) / interval;
            }
        }
        if (row.gmd !== gmdValue) {
            await weighingModel.update({
                where: { id: row.id },
                data: { gmd: gmdValue },
            });
        }
        previous = row;
    }

    if (!allWeighings.length) {
        await animalModel.update({
            where: { id: animalId },
            data: {
                pesoAtual: null,
                gmd: null,
                gmd30: null,
            },
        });
        return;
    }

    const metrics = calculateGmdMetrics(
        allWeighings.map((item) => ({ date: item.data, weight: item.peso })),
    );
    const latest = allWeighings[allWeighings.length - 1];
    await animalModel.update({
        where: { id: animalId },
        data: {
            pesoAtual: latest.peso,
            gmd: metrics.gmdLast,
            gmd30: metrics.gmd30,
        },
    });
};


export function registerHerdWeighingRoutes(app) {
app.use(['/animals', '/lots', '/farms', '/po', '/nutrition', '/repro'], rejectLegacyPoReference);
app.post('/animals/:id/move-pasto', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { pastoId, paddockId, date, startAt, notes, farmId } = req.body || {};
    const targetPaddockId = pastoId || paddockId;
    if (!targetPaddockId) {
        return res.status(400).json({ message: 'Pasto obrigatório para movimentação.' });
    }
    try {
        if (farmId) {
            const animal = await prisma.animal.findFirst({
                where: { id, farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal não encontrado para a fazenda informada.' });
            }
        }
        const { error, result } = await moveAnimalBetweenPaddocks({
            animalId: id,
            paddockId: targetPaddockId,
            startAt: startAt || date,
            notes,
            scopeFilter: buildFarmRelationFilter(req),

        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        const payload = serializePaddockMove(result.move);
        return res.status(201).json({
            item: { ...payload, fromPaddockId: result.fromPaddockId, toPaddockId: result.toPaddockId },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar animal entre pastos.' });
    }
});

app.patch('/farms/:farmId/weighings/:weighingId', requireAuth, async (req, res) => {
    const { farmId, weighingId } = req.params;
    const { animalId, data, peso } = req.body || {};


    const weighingDate = parseDateValue(data);
    if (!weighingDate) {
        return res.status(400).json({ message: 'Data da pesagem inválida.' });
    }
    const parsedPeso = parseNumber(peso);
    if (parsedPeso === null || parsedPeso <= 0) {
        return res.status(400).json({ message: 'Peso da pesagem inválido.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const weighingModel = prisma.weighing;
        const animalModel = prisma.animal;
        const animalRelation = 'animal';
        const animalIdField = 'animalId';
        const weighing = await weighingModel.findFirst({
            where: { id: weighingId, [animalRelation]: { farmId: farm.id } },
            select: { id: true, [animalIdField]: true, weighingSessionId: true },
        });
        if (!weighing) return res.status(404).json({ message: 'Pesagem não encontrada.' });

        const originalAnimalId = weighing[animalIdField];
        const targetAnimalId = String(animalId || originalAnimalId);
        const targetAnimal = await animalModel.findFirst({
            where: { id: targetAnimalId, farmId: farm.id },
            select: { id: true },
        });
        if (!targetAnimal) return res.status(400).json({ message: 'Animal inválido para esta fazenda.' });

        const updated = await prisma.$transaction(async (tx) => {
            const txWeighingModel = tx.weighing;
            await txWeighingModel.update({
                where: { id: weighing.id },
                data: {
                    [animalIdField]: targetAnimalId,
                    data: weighingDate,
                    peso: parsedPeso,
                },
            });

            await recalculateAnimalWeighingChain(tx, targetAnimalId);
            if (originalAnimalId !== targetAnimalId) {
                await recalculateAnimalWeighingChain(tx, originalAnimalId);
            }

            return txWeighingModel.findUnique({
                where: { id: weighing.id },
                include: {
                    [animalRelation]: { select: { id: true, brinco: true, categoria: true } },
                },
            });
        });
        const updatedAnimal = updated[animalRelation];

        return res.json({
            weighing: {
                id: updated.id,
                date: updated.data.toISOString(),
                weightKg: updated.peso,
                gmd: updated.gmd,
                animal: {
                    id: updatedAnimal.id,
                    brinco: updatedAnimal.brinco,
                    categoria: updatedAnimal.categoria || null,
                },
            },
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe pesagem cadastrada nesta data para este animal.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao editar pesagem.' });
    }
});

app.delete('/farms/:farmId/weighings/:weighingId', requireAuth, async (req, res) => {
    const { farmId, weighingId } = req.params;
    const { masterPassword } = req.body || {};


    if (!masterPassword || String(masterPassword).trim().length < 1) {
        return res.status(400).json({ message: 'Informe a senha do usuário master.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const weighingModel = prisma.weighing;
        const animalRelation = 'animal';
        const animalIdField = 'animalId';
        const weighing = await weighingModel.findFirst({
            where: { id: weighingId, [animalRelation]: { farmId: farm.id } },
            select: { id: true, [animalIdField]: true },
        });
        if (!weighing) return res.status(404).json({ message: 'Pesagem não encontrada.' });

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(403).json({ message: 'Organização não identificada para validação.' });
        }

        const owners = await prisma.organizationMembership.findMany({
            where: { organizationId, role: 'OWNER' },
            select: {
                user: { select: { id: true, password: true } },
            },
        });

        let authorized = false;
        for (const owner of owners) {
            if (await verifyPasswordWithLegacySupport(owner.user, String(masterPassword))) {
                authorized = true;
                break;
            }
        }

        if (!authorized) {
            return res.status(401).json({ message: 'Senha do usuário master inválida.' });
        }

        await prisma.$transaction(async (tx) => {
            await (tx.weighing).delete({ where: { id: weighing.id } });
            await recalculateAnimalWeighingChain(tx, weighing[animalIdField]);
        });

        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir pesagem.' });
    }
});


// ── Pesagens da fazenda (listagem central) ──────────────────────────────────
function serializeWeighingSession(s) {

    return {
        id: s.id,
        name: s.name,
        responsibleName: s.responsibleName ?? null,
        farmId: s.farmId,
        createdAt: s.createdAt,
        herdType: s.herdType || 'COMMERCIAL',
        weighingsCount: (s._count?.weighings ?? undefined),
    };
}

app.post('/farms/:farmId/weighing-sessions', requireAuth, async (req, res) => {
    try {
        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const { name, responsibleName, herdType = 'COMMERCIAL' } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: 'Nome da sessão é obrigatório.' });
        if (!['COMMERCIAL'].includes(herdType)) return res.status(400).json({ message: 'Tipo de rebanho inválido.' });

        const session = await prisma.weighingSession.create({
            data: {
                name: name.trim(),
                responsibleName: responsibleName?.trim() ? responsibleName.trim() : null,
                farmId: farm.id,
                herdType,
            },
        });
        res.status(201).json(serializeWeighingSession(session));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao criar sessão.' });
    }
});

app.get('/farms/:farmId/weighing-sessions', requireAuth, async (req, res) => {
    try {
        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const herdType = 'COMMERCIAL';
        const sessions = await prisma.weighingSession.findMany({
            where: { farmId: farm.id, herdType },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { _count: { select: { weighings: true,  } } },
        });
        res.json({ sessions: sessions.map(serializeWeighingSession) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao listar sessões.' });
    }
});

app.patch('/farms/:farmId/weighing-sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const session = await prisma.weighingSession.findFirst({
            where: { id: req.params.sessionId, farmId: farm.id },
        });
        if (!session) return res.status(404).json({ message: 'Sessão de pesagem não encontrada.' });

        const { name, responsibleName } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ message: 'Nome da sessão é obrigatório.' });
        if (!responsibleName?.trim()) return res.status(400).json({ message: 'Responsável é obrigatório.' });

        const updated = await prisma.weighingSession.update({
            where: { id: session.id },
            data: {
                name: name.trim(),
                responsibleName: responsibleName.trim(),
            },
            include: { _count: { select: { weighings: true,  } } },
        });

        return res.json(serializeWeighingSession(updated));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao editar sessão.' });
    }
});

app.delete('/farms/:farmId/weighing-sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const { masterPassword } = req.body || {};
        if (!masterPassword || String(masterPassword).trim().length < 1) {
            return res.status(400).json({ message: 'Informe a senha do usuário master.' });
        }

        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const session = await prisma.weighingSession.findFirst({
            where: { id: req.params.sessionId, farmId: farm.id },
        });
        if (!session) return res.status(404).json({ message: 'Sessão de pesagem não encontrada.' });

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(403).json({ message: 'Organização não identificada para validação.' });
        }

        const owners = await prisma.organizationMembership.findMany({
            where: { organizationId, role: 'OWNER' },
            select: {
                user: { select: { id: true, password: true } },
            },
        });

        let authorized = false;
        for (const owner of owners) {
            if (await verifyPasswordWithLegacySupport(owner.user, String(masterPassword))) {
                authorized = true;
                break;
            }
        }

        if (!authorized) {
            return res.status(401).json({ message: 'Senha do usuário master inválida.' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.weighing.updateMany({ where: { weighingSessionId: session.id }, data: { weighingSessionId: null } });
            
            await tx.weighingSession.delete({ where: { id: session.id } });
        });

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao excluir sessão.' });
    }
});

app.get('/farms/:farmId/weighing-sessions/summary', requireAuth, async (req, res) => {
    const { farmId } = req.params;
        const { limit = 30, offset = 0, lotId, startDate, endDate, search } = req.query;
        const herdType = 'COMMERCIAL';


    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const where = { farmId: farm.id, herdType };
        if (search) where.name = { contains: String(search), mode: 'insensitive' };

        const take = Math.min(Math.max(parseInt(String(limit), 10) || 30, 1), 200);
        const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

        const [total, sessions] = await Promise.all([
            prisma.weighingSession.count({ where }),
            prisma.weighingSession.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
                skip,
                include: {
                    weighings: {
                        include: {
                            animal: {
                                select: {
                                    id: true,
                                    lotId: true,
                                    lot: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                    
                },
            }),
        ]);

        const startFilter = startDate ? new Date(String(startDate)) : null;
        const endFilter = endDate ? new Date(String(endDate)) : null;
        if (endFilter) endFilter.setHours(23, 59, 59, 999);

        const mapped = sessions
            .map((session) => {
                const weighings = (session.weighings || []);
                if (weighings.length === 0) {
                    return {
                        sessionId: session.id,
                        sessionName: session.name,
                        sessionType: 'INDIVIDUAL',
                        sessionDateTime: session.createdAt.toISOString(),
                        farmId: farm.id,
                        farmName: farm.name,
                        lotId: null,
                        lotName: null,
                        animalsCount: 0,
                        totalWeightKg: 0,
                        averageWeightKg: null,
                        responsibleUserId: null,
                        responsibleUserName: session.responsibleName ?? null,
                    };
                }

                const animalIds = new Set(weighings.map((item) => item.animalId));
                const lotMap = new Map();
                weighings.forEach((item) => {
                    if (item.animal?.lot?.id) {
                        lotMap.set(item.animal.lot.id, item.animal.lot.name);
                    }
                });
                const totalWeightKg = weighings.reduce((sum, item) => sum + (item.peso || 0), 0);
                const animalsCount = animalIds.size;
                const averageWeightKg = animalsCount > 0 ? totalWeightKg / animalsCount : null;
                const sessionDate = weighings.reduce((latest, item) => (
                    !latest || item.data > latest ? item.data : latest
                ), null) || session.createdAt;
                const sessionType = animalsCount > 1 ? 'GROUP' : 'INDIVIDUAL';
                let lotName = null;
                let lotIdValue = null;
                if (lotMap.size === 1) {
                    const [firstLotId, firstLotName] = Array.from(lotMap.entries())[0];
                    lotIdValue = firstLotId;
                    lotName = firstLotName;
                } else if (lotMap.size > 1) {
                    lotName = 'Múltiplos lotes';
                }

                return {
                    sessionId: session.id,
                    sessionName: session.name,
                    sessionType,
                    sessionDateTime: sessionDate.toISOString(),
                    farmId: farm.id,
                    farmName: farm.name,
                    lotId: lotIdValue,
                    lotName,
                    animalsCount,
                    totalWeightKg,
                    averageWeightKg,
                    responsibleUserId: null,
                    responsibleUserName: session.responsibleName ?? null,
                };
            })
            .filter((session) => {
                if (lotId && session.lotId !== String(lotId)) return false;
                if (startFilter && new Date(session.sessionDateTime) < startFilter) return false;
                if (endFilter && new Date(session.sessionDateTime) > endFilter) return false;
                return true;
            });

        return res.json({ total, sessions: mapped });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar resumo de sessões de pesagem.' });
    }
});

app.get('/farms/:farmId/weighing-sessions/:sessionId/items', requireAuth, async (req, res) => {
    const { farmId, sessionId } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const session = await prisma.weighingSession.findFirst({
            where: { id: sessionId, farmId: farm.id },
        });
        if (!session) return res.status(404).json({ message: 'Sessão de pesagem não encontrada.' });

        const rawWeighings = await prisma.weighing.findMany({
                where: { weighingSessionId: session.id, animal: { farmId: farm.id } },
                orderBy: { data: 'desc' },
                include: { animal: { select: { id: true, brinco: true, nome: true, categoria: true, lot: { select: { id: true, name: true } } } } },
            });
        const weighings = rawWeighings.map((item) => ({
            ...item,
            animalId: item.animalId,
            animal: item.animal,
        }));

        const animalIds = [...new Set(weighings.map((item) => item.animalId))];
        const previousMap = {};
        await Promise.all(
            animalIds.map(async (animalId) => {
                const history = await (prisma.weighing).findMany({
                    where: { animalId },
                    orderBy: { data: 'asc' },
                    select: { id: true, data: true, peso: true },
                });
                previousMap[animalId] = history;
            }),
        );

        const totalWeightKg = weighings.reduce((sum, item) => sum + (item.peso || 0), 0);
        const animalsCount = animalIds.length;
        const averageWeightKg = animalsCount > 0 ? totalWeightKg / animalsCount : null;
        const sessionDate = weighings.reduce((latest, item) => (
            !latest || item.data > latest ? item.data : latest
        ), null) || session.createdAt;
        const lotMap = new Map();
        weighings.forEach((item) => {
            if (item.animal?.lot?.id) {
                lotMap.set(item.animal.lot.id, item.animal.lot.name);
            }
        });
        const lotName = lotMap.size === 1
            ? Array.from(lotMap.values())[0]
            : lotMap.size > 1
                ? 'Múltiplos lotes'
                : null;

        return res.json({
            session: {
                sessionId: session.id,
                sessionName: session.name,
                sessionType: animalsCount > 1 ? 'GROUP' : 'INDIVIDUAL',
                sessionDateTime: sessionDate.toISOString(),
                farmName: farm.name,
                lotName,
                animalsCount,
                totalWeightKg,
                averageWeightKg,
                responsibleUserName: session.responsibleName ?? null,
            },
            items: weighings.map((item) => {
                const history = previousMap[item.animalId] || [];
                const idx = history.findIndex((h) => h.id === item.id);
                const prev = idx > 0 ? history[idx - 1] : null;
                return {
                    weighingId: item.id,
                    animalId: item.animal.id,
                    animalCode: item.animal.brinco,
                    animalName: item.animal.nome || null,
                    category: item.animal.categoria || null,
                    weightKg: item.peso,
                    previousWeightKg: prev ? prev.peso : null,
                    gainKg: prev ? item.peso - prev.peso : null,
                    gmd: item.gmd,
                    weighedAt: item.data.toISOString(),
                };
            }),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar itens da sessão de pesagem.' });
    }
});

app.get('/farms/:farmId/weighings', requireAuth, async (req, res) => {
    const { farmId } = req.params;
    const { limit = 50, offset = 0, animalId, startDate, endDate, lotId, weighingSessionId } = req.query;

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const where = { animal: { farmId } };
        if (animalId) where.animalId = String(animalId);
        if (lotId) where.animal = { ...where.animal, lotId: String(lotId) };
        if (weighingSessionId) where.weighingSessionId = String(weighingSessionId);
        if (startDate || endDate) {
            where.data = {};
            if (startDate) where.data.gte = new Date(String(startDate));
            if (endDate) {
                const end = new Date(String(endDate));
                end.setHours(23, 59, 59, 999);
                where.data.lte = end;
            }
        }

        const take = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
        const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

        const [total, weighings] = await Promise.all([
            prisma.weighing.count({ where }),
            prisma.weighing.findMany({
                where,
                orderBy: { data: 'desc' },
                take,
                skip,
                include: {
                    animal: {
                        select: {
                            id: true,
                            brinco: true,
                            raca: true,
                            sexo: true,
                            categoria: true,
                            lotId: true,
                            lot: { select: { name: true } },
                        },
                    },
                    weighingSession: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            }),
        ]);

        // Para cada pesagem, buscar o peso anterior do mesmo animal
        const animalIds = [...new Set(weighings.map((w) => w.animalId))];
        const previousMap = {};
        await Promise.all(
            animalIds.map(async (aid) => {
                const allForAnimal = await prisma.weighing.findMany({
                    where: { animalId: aid },
                    orderBy: { data: 'asc' },
                    select: { id: true, data: true, peso: true },
                });
                previousMap[aid] = allForAnimal;
            }),
        );

        // Calcular stats em uma única query (sem filtros de paginação)
        const allWeighingsForStats = await prisma.weighing.findMany({
            where: { animal: { farmId } },
            select: { data: true, gmd: true, animalId: true },
        });
        const todayStr = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const statsGmds = allWeighingsForStats.map((w) => w.gmd).filter((g) => g != null);
        const stats = {
            todayCount: allWeighingsForStats.filter((w) => w.data.toISOString().slice(0, 10) === todayStr).length,
            weekCount: allWeighingsForStats.filter((w) => w.data >= weekAgo).length,
            uniqueAnimals: new Set(allWeighingsForStats.map((w) => w.animalId)).size,
            avgGmd: statsGmds.length ? statsGmds.reduce((a, b) => a + b, 0) / statsGmds.length : null,
        };

        return res.json({
            total,
            stats,
            weighings: weighings.map((w) => {
                const animalHistory = previousMap[w.animalId] || [];
                const idx = animalHistory.findIndex((h) => h.id === w.id);
                const prev = idx > 0 ? animalHistory[idx - 1] : null;
                return {
                    id: w.id,
                    date: w.data.toISOString(),
                    weightKg: w.peso,
                    gmd: w.gmd,
                    weighingSessionId: w.weighingSessionId,
                    weighingSessionName: w.weighingSession?.name || null,
                    previousWeightKg: prev ? prev.peso : null,
                    gainKg: prev ? w.peso - prev.peso : null,
                    animal: {
                        id: w.animal.id,
                        brinco: w.animal.brinco,
                        raca: w.animal.raca,
                        sexo: w.animal.sexo,
                        categoria: w.animal.categoria,
                        lotId: w.animal.lotId,
                        lotName: w.animal.lot?.name || null,
                    },
                };
            }),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar pesagens da fazenda.' });
    }
});
}
