import { PrismaClient } from '@prisma/client';
import { requireAuth, requireNonFieldWorker, requireModule } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import {
    parseNumber, parseDateValue, parseInteger,
    normalizeSexo, formatSexoLabel,
    normalizeReproMode, normalizeReproEventType, normalizePregStatus,
    normalizeEmbryoTechnique, normalizeSemenMoveType, normalizeEmbryoMoveType,
    normalizeSelectionDecision, normalizeAnimalTipoCadastro, normalizeAnimalIdentityKey,
} from '../utils/formatters.js';
import { logActivity } from '../utils/activityLog.js';
import { findDuplicateIdentityInOrganization, findDuplicateIdentitiesInOrganization } from '../utils/animalIdentity.js';
import {
    serializeAnimal, serializePoAnimal, serializeSeason,
    serializeReproEvent, serializePaddockMove,
    serializeSemenBatch, serializeNutritionPlan, serializeNutritionAssignment,
    serializeEmbryoBatch, serializePaddock, getOccurrenceAnimalLabel,
} from '../utils/serializers.js';
import { REPRO_WINDOW_DAYS, DEFAULT_THRESHOLDS, HERD_EVENT_CATEGORY_MAP } from '../config/env.js';
import { buildPurchasePaymentSchedule, createIntegratedTransaction } from '../financial/financialService.js';
import { buildProvisionalIdentification, buildTeProvisionalIdentification } from './herdIntegrityService.js';
import { normalizarCategoriaParaGravar } from '../herd/animalCategories.js';
import { registerNutritionModuleRoutes } from '../../nutritionModule.js';
import { registerAcasalamentoRoutes } from '../../acasalamentoModule.js';
const prisma = new PrismaClient();

const findInventoryAnimal = async ({ id, farmId }) => {
    if (!id) {
        return null;
    }
    return prisma.animal.findFirst({
        where: { id: String(id), farmId: String(farmId) },
    });
};

const findLegacyPoAnimal = async ({ id, farmId }) => {
    if (!id) {
        return null;
    }
    return prisma.poAnimal.findFirst({
        where: { id: String(id), farmId: String(farmId) },
    });
};

const diffDays = (later, earlier) => {
    const diffMs = later.getTime() - earlier.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

export const diffDaysFloat = (later, earlier) => {
    return (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24);
};

const normalizeWeighingsByDay = (weighings) => {
    if (!Array.isArray(weighings)) {
        return [];
    }
    const sorted = weighings
        .filter((item) => item && item.date instanceof Date && Number.isFinite(item.weight))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    const byDay = new Map();
    sorted.forEach((item) => {
        const key = item.date.toISOString().slice(0, 10);
        byDay.set(key, item);
    });

    return Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const calculateGmdMetrics = (weighings) => {
    const normalized = normalizeWeighingsByDay(weighings);
    if (normalized.length < 2) {
        return { gmdLast: null, gmd30: null };
    }

    const last = normalized[normalized.length - 1];
    const previous = normalized[normalized.length - 2];
    const lastIntervalDays = diffDaysFloat(last.date, previous.date);
    const gmdLast = lastIntervalDays > 0 ? (last.weight - previous.weight) / lastIntervalDays : null;

    const windowStart = new Date(last.date.getTime() - 30 * 24 * 60 * 60 * 1000);
    const window = normalized.filter((item) => item.date >= windowStart && item.date <= last.date);
    let gmd30 = null;
    if (window.length >= 2) {
        const oldest = window[0];
        const windowDays = diffDaysFloat(last.date, oldest.date);
        if (windowDays > 0) {
            gmd30 = (last.weight - oldest.weight) / windowDays;
        }
    }

    return { gmdLast, gmd30 };
};

export const moveAnimalBetweenPaddocks = async ({ animalId, paddockId, startAt, notes, scopeFilter, isPo }) => {
    const animalModel = isPo ? prisma.poAnimal : prisma.animal;
    const moveWhere = isPo ? { poAnimalId: animalId } : { animalId };

    const animal = await animalModel.findFirst({
        where: { id: animalId, farm: scopeFilter },
    });
    if (!animal) {
        return { error: { status: 404, message: isPo ? 'Animal P.O. não encontrado.' : 'Animal não encontrado.' } };
    }

    const paddock = await prisma.paddock.findFirst({
        where: { id: paddockId, farmId: animal.farmId, farm: scopeFilter },
    });
    if (!paddock) {
        return { error: { status: 400, message: 'Pasto inválido para esta fazenda.' } };
    }

    const moveStartAt = startAt ? parseDateValue(startAt) : new Date();
    if (startAt && !moveStartAt) {
        return { error: { status: 400, message: 'Data de entrada no pasto inválida.' } };
    }
    const trimmedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const updateModel = isPo ? tx.poAnimal : tx.animal;
            const openMove = await tx.paddockMove.findFirst({
                where: { ...moveWhere, endAt: null },
                orderBy: { startAt: 'desc' },
            });

            if (openMove && moveStartAt <= openMove.startAt) {
                const error = new Error('MOVE_DATE_BEFORE_OPEN');
                error.code = 'MOVE_DATE_BEFORE_OPEN';
                throw error;
            }

            if (openMove && animal.currentPaddockId === paddockId) {
                const error = new Error('SAME_PADDOCK');
                error.code = 'SAME_PADDOCK';
                throw error;
            }

            if (openMove) {
                await tx.paddockMove.update({
                    where: { id: openMove.id },
                    data: { endAt: moveStartAt },
                });
            }

            const created = await tx.paddockMove.create({
                data: {
                    farmId: animal.farmId,
                    paddockId,
                    ...(isPo ? { poAnimalId: animalId } : { animalId }),
                    startAt: moveStartAt,
                    notes: trimmedNotes,
                },
                include: { paddock: true },
            });

            await updateModel.update({
                where: { id: animal.id },
                data: { currentPaddockId: paddockId },
            });

            return { move: created, fromPaddockId: openMove?.paddockId || null, toPaddockId: paddockId };
        });

        return { result };
    } catch (error) {
        if (error?.code === 'MOVE_DATE_BEFORE_OPEN') {
            return { error: { status: 400, message: 'Data da movimentação deve ser posterior à última entrada no pasto.' } };
        }
        if (error?.code === 'SAME_PADDOCK') {
            return { error: { status: 409, message: 'Animal já está alocado neste pasto.' } };
        }
        throw error;
    }
};

export const moveAnimalsBetweenPaddocks = async ({ ids, paddockId, startAt, notes, scopeFilter, isPo }) => {
    const normalizedIds = Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))] : [];
    if (!normalizedIds.length || !paddockId) {
        return { error: { status: 400, message: 'Informe ao menos um animal e o pasto.' } };
    }
    if (normalizedIds.length !== ids.length) {
        return { error: { status: 400, message: 'A seleção contém animais duplicados.' } };
    }

    const moveStartAt = startAt ? parseDateValue(startAt) : new Date();
    if (startAt && !moveStartAt) {
        return { error: { status: 400, message: 'Data de entrada no pasto inválida.' } };
    }
    const trimmedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
    const animalModel = isPo ? prisma.poAnimal : prisma.animal;
    const animals = await animalModel.findMany({
        where: { id: { in: normalizedIds }, farm: scopeFilter },
        select: { id: true, farmId: true, brinco: true, currentPaddockId: true },
    });
    if (animals.length !== normalizedIds.length) {
        return { error: { status: 403, message: isPo ? 'Um ou mais animais P.O. não pertencem a esta conta.' : 'Um ou mais animais não pertencem a esta conta.' } };
    }

    const farmIds = new Set(animals.map((animal) => animal.farmId));
    if (farmIds.size !== 1) {
        return { error: { status: 400, message: 'Selecione animais de apenas uma fazenda por movimentação.' } };
    }
    const farmId = animals[0].farmId;
    const targetPaddockId = String(paddockId);
    const paddock = await prisma.paddock.findFirst({
        where: { id: targetPaddockId, farmId, farm: scopeFilter },
        select: { id: true },
    });
    if (!paddock) {
        return { error: { status: 400, message: 'Pasto inválido para esta fazenda.' } };
    }
    const animalAlreadyInPaddock = animals.find((animal) => animal.currentPaddockId === targetPaddockId);
    if (animalAlreadyInPaddock) {
        const label = animalAlreadyInPaddock.brinco ? ` "${animalAlreadyInPaddock.brinco}"` : '';
        return { error: { status: 409, message: `O animal${label} já está alocado neste pasto.` } };
    }

    const relationFilter = isPo
        ? { poAnimalId: { in: normalizedIds } }
        : { animalId: { in: normalizedIds } };
    const openMoves = await prisma.paddockMove.findMany({
        where: { ...relationFilter, endAt: null },
        select: { id: true, startAt: true },
    });
    if (openMoves.some((move) => moveStartAt <= move.startAt)) {
        return { error: { status: 400, message: 'Data da movimentação deve ser posterior à última entrada no pasto.' } };
    }

    const result = await prisma.$transaction(async (tx) => {
        const txAnimalModel = isPo ? tx.poAnimal : tx.animal;
        await tx.paddockMove.updateMany({
            where: { ...relationFilter, endAt: null },
            data: { endAt: moveStartAt },
        });
        await tx.paddockMove.createMany({
            data: normalizedIds.map((animalId) => ({
                farmId,
                paddockId: targetPaddockId,
                ...(isPo ? { poAnimalId: animalId } : { animalId }),
                startAt: moveStartAt,
                notes: trimmedNotes,
            })),
        });
        await txAnimalModel.updateMany({
            where: { id: { in: normalizedIds }, farmId },
            data: { currentPaddockId: targetPaddockId },
        });
        return { updated: normalizedIds.length, paddockId: targetPaddockId };
    });

    return { result };
};

export const createBulkWeighings = async ({ ids, farmId, animalCount, date, totalWeightKg, weighingSessionId, scopeFilter, isPo }) => {
    const normalizedIds = Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))] : [];
    const expectedCount = Number(animalCount);
    const totalWeight = parseNumber(totalWeightKg);
    const weighingDate = parseDateValue(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (!farmId || !normalizedIds.length || normalizedIds.length !== ids.length) {
        return { error: { status: 400, message: 'Seleção de animais inválida.' } };
    }
    if (!Number.isInteger(expectedCount) || expectedCount !== normalizedIds.length) {
        return { error: { status: 400, message: 'A quantidade deve ser igual aos animais selecionados.' } };
    }
    if (!weighingDate || weighingDate > today) {
        return { error: { status: 400, message: 'Data da pesagem inválida.' } };
    }
    if (totalWeight === null || totalWeight <= 0) {
        return { error: { status: 400, message: 'Peso total inválido.' } };
    }

    const animalModel = isPo ? prisma.poAnimal : prisma.animal;
    const weighingModel = isPo ? prisma.poWeighing : prisma.weighing;
    const animalIdField = isPo ? 'poAnimalId' : 'animalId';
    const animals = await animalModel.findMany({
        where: { id: { in: normalizedIds }, farmId: String(farmId), farm: scopeFilter },
        select: { id: true },
    });
    if (animals.length !== normalizedIds.length) {
        return { error: { status: 403, message: isPo ? 'Um ou mais animais P.O. não pertencem à fazenda.' : 'Um ou mais animais não pertencem à fazenda.' } };
    }

    const duplicate = await weighingModel.findFirst({
        where: { [animalIdField]: { in: normalizedIds }, data: weighingDate },
        select: { id: true },
    });
    if (duplicate) {
        return { error: { status: 409, message: 'Já existe pesagem nesta data para um ou mais animais.' } };
    }

    let validSessionId = null;
    if (weighingSessionId) {
        const session = await prisma.weighingSession.findFirst({
            where: { id: String(weighingSessionId), farmId: String(farmId), herdType: isPo ? 'PO' : 'COMMERCIAL' },
            select: { id: true },
        });
        if (!session) {
            return { error: { status: 404, message: 'Sessão de pesagem não encontrada.' } };
        }
        validSessionId = session.id;
    }

    const averageWeight = Number((totalWeight / normalizedIds.length).toFixed(1));
    const result = await prisma.$transaction(async (tx) => {
        const txWeighingModel = isPo ? tx.poWeighing : tx.weighing;
        const txAnimalModel = isPo ? tx.poAnimal : tx.animal;
        for (const animalId of normalizedIds) {
            const previous = await txWeighingModel.findFirst({
                where: { [animalIdField]: animalId, data: { lt: weighingDate } },
                orderBy: { data: 'desc' },
            });
            const days = previous ? diffDaysFloat(weighingDate, previous.data) : 0;
            const gmd = previous && days > 0 ? (averageWeight - previous.peso) / days : 0;
            await txWeighingModel.create({
                data: {
                    [animalIdField]: animalId,
                    ...(isPo ? { farmId: String(farmId) } : {}),
                    data: weighingDate,
                    peso: averageWeight,
                    gmd,
                    ...(validSessionId ? { weighingSessionId: validSessionId } : {}),
                },
            });
            const history = await txWeighingModel.findMany({
                where: { [animalIdField]: animalId },
                orderBy: { data: 'asc' },
                select: { data: true, peso: true },
            });
            const metrics = calculateGmdMetrics(history.map((row) => ({ date: row.data, weight: row.peso })));
            const latest = history[history.length - 1];
            await txAnimalModel.update({
                where: { id: animalId },
                data: { pesoAtual: latest?.peso ?? averageWeight, gmd: metrics.gmdLast, gmd30: metrics.gmd30 },
            });
        }
        return { created: normalizedIds.length, averageWeightKg: averageWeight, weighingSessionId: validSessionId };
    });

    return { result };
};

export const weanCalf = async ({ req, animalId, isPo = false }) => {
    const { date, data, peso, weightKg, identificacaoDefinitiva, paddockId, pastoId, lotId, observacoes } = req.body || {};
    const weaningDate = parseDateValue(date || data);
    const parsedWeight = parseNumber(peso ?? weightKg);
    if (!weaningDate || parsedWeight === null || parsedWeight <= 0) {
        return { error: { status: 400, message: 'Informe data e peso de desmama válidos.' } };
    }
    const animalModel = isPo ? prisma.poAnimal : prisma.animal;
    const weighingModel = isPo ? prisma.poWeighing : prisma.weighing;
    const lotModel = isPo ? prisma.poLot : prisma.lot;
    const animal = await animalModel.findFirst({
        where: { id: String(animalId), farm: buildFarmRelationFilter(req) },
    });
    if (!animal) return { error: { status: 404, message: isPo ? 'Animal P.O. não encontrado.' : 'Animal não encontrado.' } };
    if (animal.desmamadoEm) return { error: { status: 409, message: 'A desmama desta cria já foi registrada.' } };
    if (animal.dataNascimento && weaningDate < animal.dataNascimento) {
        return { error: { status: 400, message: 'A desmama não pode ser anterior ao nascimento.' } };
    }

    const definitiveId = String(identificacaoDefinitiva || '').trim() || null;
    if (definitiveId) {
        const duplicateWhere = isPo
            ? { farmId: animal.farmId, brinco: definitiveId, NOT: { id: animal.id } }
            : { farmId: animal.farmId, OR: [{ brinco: definitiveId }, { identityKey: definitiveId }], NOT: { id: animal.id } };
        const duplicate = await animalModel.findFirst({ where: duplicateWhere, select: { id: true } });
        const crossDuplicate = isPo
            ? await prisma.animal.findFirst({ where: { farmId: animal.farmId, OR: [{ brinco: definitiveId }, { identityKey: definitiveId }] }, select: { id: true } })
            : await prisma.poAnimal.findFirst({ where: { farmId: animal.farmId, brinco: definitiveId }, select: { id: true } });
        if (duplicate || crossDuplicate) return { error: { status: 409, message: 'Identificação definitiva já cadastrada nesta fazenda.' } };
    }

    const targetPaddockId = String(paddockId || pastoId || '').trim() || null;
    const targetLotId = String(lotId || '').trim() || null;
    if (targetPaddockId) {
        const paddock = await prisma.paddock.findFirst({ where: { id: targetPaddockId, farmId: animal.farmId } });
        if (!paddock) return { error: { status: 400, message: 'Pasto de destino inválido.' } };
    }
    if (targetLotId) {
        const lot = await lotModel.findFirst({ where: { id: targetLotId, farmId: animal.farmId } });
        if (!lot) return { error: { status: 400, message: 'Lote de destino inválido.' } };
    }

    const dayStart = new Date(weaningDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const animalIdField = isPo ? 'poAnimalId' : 'animalId';
    const duplicateWeighing = await weighingModel.findFirst({
        where: { [animalIdField]: animal.id, data: { gte: dayStart, lt: dayEnd } },
        select: { id: true },
    });
    if (duplicateWeighing) return { error: { status: 409, message: 'Já existe pesagem para esta cria na data informada.' } };
    const openMove = targetPaddockId ? await prisma.paddockMove.findFirst({
        where: { [animalIdField]: animal.id, endAt: null },
        orderBy: { startAt: 'desc' },
    }) : null;
    if (openMove && openMove.startAt > weaningDate) {
        return { error: { status: 400, message: 'A movimentação de desmama não pode ser anterior à entrada no pasto atual.' } };
    }

    const result = await prisma.$transaction(async (tx) => {
        const previous = await (isPo ? tx.poWeighing : tx.weighing).findFirst({
            where: { [animalIdField]: animal.id, data: { lt: weaningDate } },
            orderBy: { data: 'desc' },
        });
        const interval = previous ? diffDaysFloat(weaningDate, previous.data) : 0;
        const gmd = previous && interval > 0 ? (parsedWeight - previous.peso) / interval : 0;
        await (isPo ? tx.poWeighing : tx.weighing).create({
            data: { ...(isPo ? { farmId: animal.farmId } : {}), [animalIdField]: animal.id, data: weaningDate, peso: parsedWeight, gmd },
        });
        await tx.herdEvent.create({
            data: { farmId: animal.farmId, [animalIdField]: animal.id, type: 'DESMAMA', date: weaningDate, peso: parsedWeight, observacoes: String(observacoes || '').trim() || null },
        });
        if (targetPaddockId && targetPaddockId !== animal.currentPaddockId) {
            if (openMove) await tx.paddockMove.update({ where: { id: openMove.id }, data: { endAt: weaningDate } });
            await tx.paddockMove.create({ data: { farmId: animal.farmId, paddockId: targetPaddockId, [animalIdField]: animal.id, startAt: weaningDate, notes: String(observacoes || '').trim() || null } });
        }
        const updateData = {
            desmamadoEm: weaningDate,
            pesoDesmamaKg: parsedWeight,
            pesoAtual: parsedWeight,
            gmd,
            ...(targetPaddockId ? { currentPaddockId: targetPaddockId } : {}),
            ...(targetLotId ? { lotId: targetLotId } : {}),
        };
        if (definitiveId) {
            Object.assign(updateData, {
                identificacaoAnterior: animal.brinco,
                brinco: definitiveId,
                identificacaoProvisoria: false,
                ...(isPo ? {} : { identityKey: definitiveId }),
            });
        }
        return (isPo ? tx.poAnimal : tx.animal).update({ where: { id: animal.id }, data: updateData });
    });
    return { result, previousIdentification: animal.brinco, definitiveId };
};
export const transferAnimalsToFarm = async ({ ids, targetFarmId, targetPaddockId, transferDate, notes, scopeFilter, farmScopeFilter, isPo }) => {
    const normalizedIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
    if (!normalizedIds.length || !targetFarmId || !targetPaddockId) {
        return { error: { status: 400, message: 'Informe animais, fazenda destino e pasto destino.' } };
    }

    const moveStartAt = transferDate ? parseDateValue(transferDate) : new Date();
    if (transferDate && !moveStartAt) {
        return { error: { status: 400, message: 'Data da transferência inválida.' } };
    }
    const trimmedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
    const animalModel = isPo ? prisma.poAnimal : prisma.animal;

    const targetFarm = await prisma.farm.findFirst({
        where: farmScopeFilter,
    });
    if (!targetFarm) {
        return { error: { status: 404, message: 'Fazenda destino não encontrada.' } };
    }

    const targetPaddock = await prisma.paddock.findFirst({
        where: { id: String(targetPaddockId), farmId: targetFarm.id },
    });
    if (!targetPaddock) {
        return { error: { status: 400, message: 'Pasto destino inválido para esta fazenda.' } };
    }

    const animals = await animalModel.findMany({
        where: { id: { in: normalizedIds }, farm: scopeFilter },
        select: isPo
            ? { id: true, farmId: true, brinco: true }
            : { id: true, farmId: true, brinco: true, identityKey: true },
    });
    if (animals.length !== normalizedIds.length) {
        return { error: { status: 403, message: isPo ? 'Um ou mais animais P.O. não pertencem a esta conta.' : 'Um ou mais animais não pertencem a esta conta.' } };
    }

    const sourceFarmIds = new Set(animals.map((animal) => animal.farmId));
    if (sourceFarmIds.size !== 1) {
        return { error: { status: 400, message: 'Selecione animais de apenas uma fazenda por transferência.' } };
    }
    const sourceFarmId = animals[0].farmId;
    if (sourceFarmId === targetFarm.id) {
        return { error: { status: 400, message: 'A fazenda destino deve ser diferente da fazenda atual.' } };
    }

    if (isPo) {
        const brincos = animals.map((animal) => animal.brinco).filter(Boolean);
        if (brincos.length) {
            const duplicate = await prisma.poAnimal.findFirst({
                where: { farmId: targetFarm.id, brinco: { in: brincos } },
                select: { brinco: true },
            });
            if (duplicate) {
                return { error: { status: 409, message: `Já existe animal P.O. com o brinco "${duplicate.brinco}" na fazenda destino.` } };
            }
        }
    } else {
        const duplicate = await prisma.animal.findFirst({
            where: {
                farmId: targetFarm.id,
                OR: animals.flatMap((animal) => [
                    { brinco: animal.brinco },
                    { identityKey: animal.identityKey },
                ]),
            },
            select: { brinco: true },
        });
        if (duplicate) {
            return { error: { status: 409, message: `Já existe animal com o ID "${duplicate.brinco}" na fazenda destino.` } };
        }
    }

    const result = await prisma.$transaction(async (tx) => {
        const updateModel = isPo ? tx.poAnimal : tx.animal;
        const moveWhere = isPo ? { poAnimalId: { in: normalizedIds } } : { animalId: { in: normalizedIds } };

        await tx.paddockMove.updateMany({
            where: { ...moveWhere, endAt: null },
            data: { endAt: moveStartAt },
        });

        await updateModel.updateMany({
            where: { id: { in: normalizedIds } },
            data: {
                farmId: targetFarm.id,
                lotId: null,
                currentPaddockId: targetPaddock.id,
            },
        });

        await tx.paddockMove.createMany({
            data: normalizedIds.map((animalId) => ({
                farmId: targetFarm.id,
                paddockId: targetPaddock.id,
                ...(isPo ? { poAnimalId: animalId } : { animalId }),
                startAt: moveStartAt,
                notes: trimmedNotes,
            })),
        });

        return { updated: normalizedIds.length, sourceFarmId, targetFarmId: targetFarm.id, targetPaddockId: targetPaddock.id };
    });

    return { result };
};

const calculateReproKpis = async ({ animalId, farmId, seasonId }) => {
    const partoEvents = await prisma.reproEvent.findMany({
        where: { animalId, farmId, type: 'PARTO' },
        orderBy: { date: 'desc' },
        take: 2,
    });

    const lastParto = partoEvents[0] || null;
    const previousParto = partoEvents[1] || null;
    const iepDays = lastParto && previousParto ? diffDays(lastParto.date, previousParto.date) : null;

    let openDays = null;
    let firstPreg = null;
    if (lastParto) {
        firstPreg = await prisma.reproEvent.findFirst({
            where: {
                animalId,
                farmId,
                type: 'DIAGNOSTICO_PRENHEZ',
                date: { gt: lastParto.date },
                payload: {
                    path: ['status'],
                    equals: 'PRENHE',
                },
                ...(seasonId ? { seasonId } : {}),
            },
            orderBy: { date: 'asc' },
        });
        if (firstPreg) {
            openDays = diffDays(firstPreg.date, lastParto.date);
        }
    }

    const diagnosticsBaseWhere = {
        animalId,
        farmId,
        type: 'DIAGNOSTICO_PRENHEZ',
        ...(seasonId ? { seasonId } : {}),
    };

    const allDiagnostics = await prisma.reproEvent.findMany({
        where: diagnosticsBaseWhere,
        orderBy: { date: 'desc' },
    });

    let diagnosticsForRate = allDiagnostics;
    if (!seasonId) {
        const windowBase = allDiagnostics[0]?.date || lastParto?.date || new Date();
        const fromDate = new Date(windowBase.getTime() - REPRO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        diagnosticsForRate = allDiagnostics.filter((event) => event.date >= fromDate);
    }

    const statusList = allDiagnostics
        .map((event) => normalizePregStatus(event?.payload?.status))
        .filter(Boolean);

    const totalDiagnostics = diagnosticsForRate.length;
    const pregCount = diagnosticsForRate.filter(
        (event) => normalizePregStatus(event?.payload?.status) === 'PRENHE',
    ).length;
    const pregRate = totalDiagnostics > 0 ? pregCount / totalDiagnostics : null;

    let lastPregCheck = allDiagnostics[0]?.date || null;
    if (!lastPregCheck && firstPreg) {
        lastPregCheck = firstPreg.date;
    }
    const isEmpty = statusList[0] === 'VACIA';
    const isRepeatEmpty = statusList[0] === 'VACIA' && statusList[1] === 'VACIA';

    return {
        iepDays,
        openDays,
        pregRate,
        emptyAlerts: {
            isEmpty,
            isRepeatEmpty,
        },
        lastCalvingDate: lastParto?.date || null,
        lastPregCheck,
    };
};

const buildSelectionTrafficLight = (kpis, thresholds = DEFAULT_THRESHOLDS) => {
    const reasons = new Set();
    let hasRed = false;
    let hasYellow = false;

    const noHistory = kpis.openDays === null
        && kpis.iepDays === null
        && !kpis.lastPregCheck
        && !kpis.lastCalvingDate;

    if (noHistory) {
        hasYellow = true;
        reasons.add('Sem histórico suficiente (dados incompletos)');
    }

    if (kpis.emptyAlerts?.isRepeatEmpty) {
        hasRed = true;
        reasons.add('2 vazias seguidas');
    } else if (kpis.emptyAlerts?.isEmpty) {
        hasYellow = true;
        reasons.add('Último diagnóstico: vazia');
    }

    if (kpis.openDays !== null) {
        if (kpis.openDays > thresholds.openDays.yellowMax) {
            hasRed = true;
            reasons.add('Dias em aberto acima de 180');
        } else if (kpis.openDays > thresholds.openDays.greenMax) {
            hasYellow = true;
            reasons.add('Dias em aberto acima de 120');
        }
        if (kpis.openDays > thresholds.openDays.critical) {
            hasRed = true;
            reasons.add('Dias em aberto crítico (>240)');
        }
    }

    if (kpis.iepDays !== null) {
        if (kpis.iepDays > thresholds.iepDays.yellowMax) {
            hasRed = true;
            reasons.add('IEP acima de 480 dias');
        } else if (kpis.iepDays > thresholds.iepDays.greenMax) {
            hasYellow = true;
            reasons.add('IEP acima de 430 dias');
        }
        if (kpis.iepDays > thresholds.iepDays.critical) {
            hasRed = true;
            reasons.add('IEP crítico (>18 meses)');
        }
    }

    const trafficLight = hasRed ? 'RED' : hasYellow ? 'YELLOW' : 'GREEN';
    return { trafficLight, reasons: Array.from(reasons) };
};

const computeSelectionKpis = ({ events, animalId, seasonId, exposuresSet }) => {
    const partoEvents = events.filter((event) => event.type === 'PARTO');
    const lastParto = partoEvents[0] || null;
    const previousParto = partoEvents[1] || null;
    const iepDays = lastParto && previousParto ? diffDays(lastParto.date, previousParto.date) : null;

    const diagnostics = events.filter((event) => event.type === 'DIAGNOSTICO_PRENHEZ');
    const statusList = diagnostics
        .map((event) => normalizePregStatus(event?.payload?.status))
        .filter(Boolean);

    const lastPregCheck = diagnostics[0]?.date || null;
    const isEmpty = statusList[0] === 'VACIA';
    const isRepeatEmpty = statusList[0] === 'VACIA' && statusList[1] === 'VACIA';

    let openDays = null;
    let firstPreg = null;
    if (lastParto) {
        diagnostics.forEach((event) => {
            if (event.date <= lastParto.date) {
                return;
            }
            if (normalizePregStatus(event?.payload?.status) !== 'PRENHE') {
                return;
            }
            if (!firstPreg || event.date < firstPreg.date) {
                firstPreg = event;
            }
        });
        if (firstPreg) {
            openDays = diffDays(firstPreg.date, lastParto.date);
        }
    }

    let pregRate = null;
    let diagnosticsInWindowCount = 0;
    let pregInWindowCount = 0;
    let isExposed = false;
    let hasPrenheInSeason = false;

    if (seasonId) {
        isExposed = exposuresSet?.has(animalId) || false;
        if (isExposed) {
            const diagnosticsInSeason = diagnostics.filter((event) => event.seasonId === seasonId);
            hasPrenheInSeason = diagnosticsInSeason.some(
                (event) => normalizePregStatus(event?.payload?.status) === 'PRENHE',
            );
            pregRate = hasPrenheInSeason ? 1 : 0;
        }
    } else {
        const windowBase = diagnostics[0]?.date || lastParto?.date || new Date();
        const fromDate = new Date(windowBase.getTime() - REPRO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const diagnosticsInWindow = diagnostics.filter((event) => event.date >= fromDate);
        diagnosticsInWindowCount = diagnosticsInWindow.length;
        pregInWindowCount = diagnosticsInWindow.filter(
            (event) => normalizePregStatus(event?.payload?.status) === 'PRENHE',
        ).length;
        pregRate = diagnosticsInWindowCount > 0 ? pregInWindowCount / diagnosticsInWindowCount : null;
    }

    return {
        kpis: {
            iepDays,
            openDays,
            pregRate,
            emptyAlerts: {
                isEmpty,
                isRepeatEmpty,
            },
            lastCalvingDate: lastParto?.date || null,
            lastPregCheck: lastPregCheck || firstPreg?.date || null,
        },
        diagnosticsInWindowCount,
        pregInWindowCount,
        isExposed,
        hasPrenheInSeason,
    };
};

export function registerAnimalRoutes(app) {
app.patch('/animals/:id', requireAuth, requireModule('Editar Animais'), async (req, res) => {
    const { id } = req.params;
    const { lotId, brinco, raca, sexo, categoria, dataNascimento, registro,
            nome, brincoEletronico, padraoRacial, tipoRaca, composicaoMestica, racaPredominante,
            funcaoReprodutiva, statusReprodutivo, previsaoParto, observacoes, justificativa } = req.body || {};
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });

        const updateData = {};

        // lotId — trocar de lote NÃO exige justificativa, só fica no log de
        // atividades (é uma movimentação de rotina, não uma correção de dado).
        if (lotId !== undefined) {
            if (lotId) {
                const lot = await prisma.lot.findFirst({
                    where: { id: String(lotId), farmId: animal.farmId },
                });
                if (!lot) return res.status(404).json({ message: 'Lote não encontrado.' });
                updateData.lotId = lot.id;
            } else {
                updateData.lotId = null;
            }
        }

        // Campos básicos editáveis
        if (brinco !== undefined) {
            const trimmed = String(brinco).trim();
            if (!trimmed) return res.status(400).json({ message: 'Identificação não pode ser vazia.' });
            const identityKey = normalizeAnimalIdentityKey(trimmed);
            // Verificar duplicidade em TODA a organização (não só nesta fazenda):
            // o mesmo número não pode ser reaproveitado por outro animal, nem em
            // outra fazenda da mesma conta.
            const duplicate = await findDuplicateIdentityInOrganization(prisma, req, { identityKey, excludeAnimalId: id });
            if (duplicate) {
                const ondeMsg = duplicate.farmId === animal.farmId ? 'nesta fazenda' : `na fazenda "${duplicate.farmName || 'outra fazenda'}"`;
                return res.status(409).json({ message: `Já existe um animal com a identificação "${trimmed}" ${ondeMsg}.` });
            }
            updateData.brinco = trimmed;
            updateData.identityKey = identityKey;
        }
        if (raca !== undefined) updateData.raca = raca ? String(raca).trim() : null;
        if (sexo !== undefined) {
            const validSexo = ['MACHO', 'FEMEA'];
            updateData.sexo = validSexo.includes(sexo) ? sexo : null;
        }
        // Normaliza contra a lista única, mas SEM apagar texto que não reconhece
        // (ex.: "Doadora", "Boi magro"). Em branco volta a null de propósito: é
        // assim que o produtor devolve o animal para a dedução automática.
        if (categoria !== undefined) updateData.categoria = normalizarCategoriaParaGravar(categoria);
        if (dataNascimento !== undefined) {
            const novaData = dataNascimento ? new Date(dataNascimento) : null;
            updateData.dataNascimento = novaData;
            // A flag de safra só cai quando a data MUDA de verdade. O modal manda
            // o campo em todo salvamento, mesmo sem edição — zerar aqui de forma
            // incondicional apagaria o "~" da idade estimada de um animal cuja
            // data continua sendo o chute do 1º de outubro. Flag que mente é
            // pior que flag nenhuma.
            const atual = animal.dataNascimento ? new Date(animal.dataNascimento).getTime() : null;
            const proxima = novaData ? novaData.getTime() : null;
            if (atual !== proxima) updateData.dataNascimentoEstimada = false;
        }
        if (registro !== undefined) updateData.registro = registro ? String(registro).trim() : null;
        if (nome !== undefined) updateData.nome = nome ? String(nome).trim() : null;
        if (brincoEletronico !== undefined) updateData.brincoEletronico = brincoEletronico ? String(brincoEletronico).trim() : null;
        if (padraoRacial !== undefined) updateData.padraoRacial = padraoRacial ? String(padraoRacial).trim() : null;
        if (tipoRaca !== undefined) updateData.tipoRaca = tipoRaca ? String(tipoRaca).trim() : null;
        if (composicaoMestica !== undefined) updateData.composicaoMestica = composicaoMestica ? String(composicaoMestica).trim() : null;
        if (racaPredominante !== undefined) updateData.racaPredominante = racaPredominante ? String(racaPredominante).trim() : null;
        if (funcaoReprodutiva !== undefined) updateData.funcaoReprodutiva = funcaoReprodutiva ? String(funcaoReprodutiva).trim() : null;
        if (statusReprodutivo !== undefined) updateData.statusReprodutivo = statusReprodutivo ? String(statusReprodutivo).trim() : null;
        if (previsaoParto !== undefined) updateData.previsaoParto = previsaoParto ? new Date(previsaoParto) : null;
        if (observacoes !== undefined) updateData.observacoes = observacoes ? String(observacoes).trim() : null;

        // Monta o "antes/depois" de tudo que mudou de verdade, exceto lote e o
        // identityKey (que é só um espelho técnico do brinco, não precisa
        // aparecer duas vezes no motivo da edição).
        const changes = {};
        for (const [key, newValue] of Object.entries(updateData)) {
            if (key === 'lotId' || key === 'identityKey' || key === 'dataNascimentoEstimada') continue;
            const oldValue = animal[key] ?? null;
            const normalizedNew = newValue ?? null;
            const oldComparable = oldValue instanceof Date ? oldValue.toISOString() : oldValue;
            const newComparable = normalizedNew instanceof Date ? normalizedNew.toISOString() : normalizedNew;
            if (oldComparable !== newComparable) {
                changes[key] = { de: oldValue, para: normalizedNew };
            }
        }
        const hasFieldChanges = Object.keys(changes).length > 0;
        const justificativaTrimmed = String(justificativa || '').trim();
        if (hasFieldChanges && !justificativaTrimmed) {
            return res.status(400).json({ message: 'Informe uma justificativa para editar dados do animal.' });
        }

        const updated = await prisma.animal.update({
            where: { id },
            data: updateData,
        });

        // Toda edição de dado do animal (fora troca de lote) fica registrada com
        // quem editou, o que mudou e por quê — pra sempre, mesmo que o dado seja
        // corrigido de novo depois.
        if (hasFieldChanges) {
            await prisma.animalEditLog.create({
                data: {
                    animalId: id,
                    farmId: animal.farmId,
                    userId: req.user.id,
                    changes,
                    justificativa: justificativaTrimmed,
                },
            });
        }
        if (updateData.lotId !== undefined) {
            await logActivity(prisma, req, {
                action: 'ANIMAL_LOTE_ALTERADO',
                entity: 'Animal',
                entityId: id,
                description: `Alterou o lote do animal ${animal.brinco || id}`,
                farmId: animal.farmId,
            });
        }

        return res.json({ animal: updated });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar animal.' });
    }
});
app.get('/repro-events', async (req, res) => {
    const { farmId, animalId, seasonId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar eventos.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        if (animalId) {
            const animal = await prisma.animal.findFirst({
                where: { id: String(animalId), farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal não encontrado.' });
            }
        }

        if (seasonId) {
            const season = await prisma.breedingSeason.findFirst({
                where: { id: String(seasonId), farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            });
            if (!season) {
                return res.status(404).json({ message: 'Estação não encontrada.' });
            }
        }

        const events = await prisma.reproEvent.findMany({
            where: {
                farmId: String(farmId),
                ...(animalId ? { animalId: String(animalId) } : {}),
                ...(seasonId ? { seasonId: String(seasonId) } : {}),
            },
            orderBy: { date: 'desc' },
        });

        return res.json({ events: events.map(serializeReproEvent) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar eventos reprodutivos.' });
    }
});

app.post('/repro-events', async (req, res) => {
    const { farmId, animalId, type, date, seasonId, payload, notes, bullId, protocol } = req.body || {};

    if (!farmId || !animalId || !type || !date) {
        return res.status(400).json({ message: 'Informe fazenda, animal, tipo e data.' });
    }

    const eventType = normalizeReproEventType(type);
    if (!eventType) {
        return res.status(400).json({ message: 'Tipo de evento inválido.' });
    }

    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do evento inválida.' });
    }

    let normalizedPayload = null;
    if (eventType === 'DIAGNOSTICO_PRENHEZ') {
        const status = normalizePregStatus(payload?.status);
        if (!status) {
            return res.status(400).json({ message: 'Status de prenhez inválido.' });
        }
        normalizedPayload = { status };
    } else if (payload) {
        normalizedPayload = payload;
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const animal = await prisma.animal.findFirst({
            where: { id: animalId, farmId, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        if (animal.sexo !== 'FEMEA') {
            return res.status(400).json({ message: 'Eventos reprodutivos são permitidos apenas para fêmeas.' });
        }

        let validSeasonId = null;
        if (seasonId) {
            const season = await prisma.breedingSeason.findFirst({
                where: { id: seasonId, farmId, farm: buildFarmRelationFilter(req) },
            });
            if (!season) {
                return res.status(404).json({ message: 'Estação não encontrada.' });
            }
            validSeasonId = seasonId;
        }

        const event = await prisma.reproEvent.create({
            data: {
                farmId,
                animalId,
                type: eventType,
                date: eventDate,
                seasonId: validSeasonId,
                payload: normalizedPayload,
                notes: notes?.trim() || null,
                bullId: bullId?.trim() || null,
                protocol: protocol?.trim() || null,
            },
        });

        await logActivity(prisma, req, {
            action: `REPRO_${eventType}`,
            entity: 'ReproEvent',
            entityId: event.id,
            description: `Registrou evento reprodutivo (${eventType}) no animal ${animal.brinco || animalId}`,
            farmId,
        });

        return res.status(201).json({ event: serializeReproEvent(event) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar evento reprodutivo.' });
    }
});

app.delete('/repro-events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const event = await prisma.reproEvent.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!event) {
            return res.status(404).json({ message: 'Evento não encontrado.' });
        }

        await prisma.reproEvent.delete({ where: { id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir evento reprodutivo.' });
    }
});
app.get('/genetics/selection', async (req, res) => {
    const {
        farmId,
        seasonId,
        onlyFemales = '1',
        status = 'all',
        search,
        limit,
        offset,
    } = req.query || {};

    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para a seleção.' });
    }

    const take = Math.min(Math.max(parseInt(String(limit || ''), 10) || 50, 1), 200);
    const skip = Math.max(parseInt(String(offset || ''), 10) || 0, 0);
    const onlyFemalesFlag = !(String(onlyFemales).toLowerCase() === '0' || String(onlyFemales).toLowerCase() === 'false');
    const statusFilter = String(status || 'all').toLowerCase() === 'alert' ? 'alert' : 'all';
    const searchTerm = typeof search === 'string' ? search.trim() : '';

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        let validSeasonId = null;
        if (seasonId) {
            const season = await prisma.breedingSeason.findFirst({
                where: { id: String(seasonId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!season) {
                return res.status(404).json({ message: 'Estação não encontrada.' });
            }
            validSeasonId = String(seasonId);
        }

        const animals = await prisma.animal.findMany({
            where: {
                farmId: farm.id,
                farm: buildFarmRelationFilter(req),
                ...(onlyFemalesFlag ? { sexo: 'FEMEA' } : {}),
                ...(searchTerm
                    ? {
                          brinco: {
                              contains: searchTerm,
                              mode: 'insensitive',
                          },
                      }
                    : {}),
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!animals.length) {
            return res.json({ items: [], total: 0 });
        }

        const animalIds = animals.map((animal) => animal.id);
        const reproEvents = await prisma.reproEvent.findMany({
            where: {
                farmId: farm.id,
                animalId: { in: animalIds },
            },
            orderBy: { date: 'desc' },
        });

        const eventsByAnimal = new Map();
        reproEvents.forEach((event) => {
            const list = eventsByAnimal.get(event.animalId) || [];
            list.push(event);
            eventsByAnimal.set(event.animalId, list);
        });

        let exposuresSet = null;
        if (validSeasonId) {
            const exposures = await prisma.exposure.findMany({
                where: { seasonId: validSeasonId },
                select: { animalId: true },
            });
            exposuresSet = new Set(exposures.map((item) => item.animalId));
        }

        const decisions = await prisma.selectionDecision.findMany({
            where: { farmId: farm.id, animalId: { in: animalIds } },
        });
        const decisionMap = new Map();
        decisions.forEach((decision) => {
            decisionMap.set(decision.animalId, {
                id: decision.id,
                farmId: decision.farmId,
                animalId: decision.animalId,
                decision: decision.decision,
                reason: decision.reason,
                createdAt: decision.createdAt.toISOString(),
                updatedAt: decision.updatedAt.toISOString(),
            });
        });

        const items = animals.map((animal) => {
            const events = eventsByAnimal.get(animal.id) || [];
            const { kpis } = computeSelectionKpis({
                events,
                animalId: animal.id,
                seasonId: validSeasonId,
                exposuresSet,
            });

            const traffic = buildSelectionTrafficLight(kpis);

            return {
                animal: {
                    id: animal.id,
                    brinco: animal.brinco,
                    raca: animal.raca,
                    dataNascimento: animal.dataNascimento.toISOString(),
                    lotId: animal.lotId,
                },
                kpis: {
                    ...kpis,
                    lastCalvingDate: kpis.lastCalvingDate ? kpis.lastCalvingDate.toISOString() : null,
                    lastPregCheck: kpis.lastPregCheck ? kpis.lastPregCheck.toISOString() : null,
                },
                trafficLight: traffic.trafficLight,
                reasons: traffic.reasons,
                decision: decisionMap.get(animal.id) || null,
            };
        });

        const filteredItems = statusFilter === 'alert'
            ? items.filter((item) => item.trafficLight !== 'GREEN')
            : items;

        const pagedItems = filteredItems.slice(skip, skip + take);

        return res.json({
            items: pagedItems,
            total: filteredItems.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar seleção genética.' });
    }
});

app.get('/genetics/reports/summary', async (req, res) => {
    const { farmId, seasonId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para o relatório.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        let validSeasonId = null;
        if (seasonId) {
            const season = await prisma.breedingSeason.findFirst({
                where: { id: String(seasonId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!season) {
                return res.status(404).json({ message: 'Estação não encontrada.' });
            }
            validSeasonId = String(seasonId);
        }

        const animals = await prisma.animal.findMany({
            where: {
                farmId: farm.id,
                farm: buildFarmRelationFilter(req),
                sexo: 'FEMEA',
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!animals.length) {
            return res.json({
                summary: {
                    pregRate: null,
                    openDaysAvg: null,
                    openDaysOver180Pct: null,
                    iepAvg: null,
                    totals: { females: 0, withKpis: 0, exposures: validSeasonId ? 0 : undefined, diagCount: 0 },
                },
                topAlerts: [],
                decisions: [],
            });
        }

        const animalIds = animals.map((animal) => animal.id);
        const reproEvents = await prisma.reproEvent.findMany({
            where: {
                farmId: farm.id,
                animalId: { in: animalIds },
            },
            orderBy: { date: 'desc' },
        });

        const eventsByAnimal = new Map();
        reproEvents.forEach((event) => {
            const list = eventsByAnimal.get(event.animalId) || [];
            list.push(event);
            eventsByAnimal.set(event.animalId, list);
        });

        let exposuresSet = null;
        if (validSeasonId) {
            const exposures = await prisma.exposure.findMany({
                where: { seasonId: validSeasonId },
                select: { animalId: true },
            });
            exposuresSet = new Set(exposures.map((item) => item.animalId));
        }

        const decisions = await prisma.selectionDecision.findMany({
            where: { farmId: farm.id, animalId: { in: animalIds } },
        });
        const decisionMap = new Map();
        decisions.forEach((decision) => {
            decisionMap.set(decision.animalId, {
                id: decision.id,
                farmId: decision.farmId,
                animalId: decision.animalId,
                decision: decision.decision,
                reason: decision.reason,
                createdAt: decision.createdAt.toISOString(),
                updatedAt: decision.updatedAt.toISOString(),
            });
        });

        let openDaysSum = 0;
        let openDaysCount = 0;
        let openDaysOver180Count = 0;
        let iepSum = 0;
        let iepCount = 0;
        let withKpisCount = 0;
        let totalDiagnosticsWindow = 0;
        let pregInWindowTotal = 0;
        let totalExposed = exposuresSet ? exposuresSet.size : 0;
        let pregInSeasonCount = 0;
        let emptyInSeasonCount = 0;

        const items = animals.map((animal) => {
            const events = eventsByAnimal.get(animal.id) || [];
            const { kpis, diagnosticsInWindowCount, pregInWindowCount, isExposed } =
                computeSelectionKpis({
                    events,
                    animalId: animal.id,
                    seasonId: validSeasonId,
                    exposuresSet,
                });

            const noHistory = kpis.openDays === null
                && kpis.iepDays === null
                && !kpis.lastPregCheck
                && !kpis.lastCalvingDate;
            if (!noHistory) {
                withKpisCount += 1;
            }

            if (kpis.openDays !== null) {
                openDaysSum += kpis.openDays;
                openDaysCount += 1;
                if (kpis.openDays > DEFAULT_THRESHOLDS.openDays.yellowMax) {
                    openDaysOver180Count += 1;
                }
            }

            if (kpis.iepDays !== null) {
                iepSum += kpis.iepDays;
                iepCount += 1;
            }

            if (validSeasonId) {
                if (isExposed) {
                    const diagnosticsInSeason = events.filter(
                        (event) => event.type === 'DIAGNOSTICO_PRENHEZ' && event.seasonId === validSeasonId,
                    );
                    const hasPrenhe = diagnosticsInSeason.some(
                        (event) => normalizePregStatus(event?.payload?.status) === 'PRENHE',
                    );
                    const hasEmpty = diagnosticsInSeason.some(
                        (event) => normalizePregStatus(event?.payload?.status) === 'VACIA',
                    );
                    if (hasPrenhe) {
                        pregInSeasonCount += 1;
                    }
                    if (hasEmpty) {
                        emptyInSeasonCount += 1;
                    }
                }
            } else {
                totalDiagnosticsWindow += diagnosticsInWindowCount;
                pregInWindowTotal += pregInWindowCount;
            }

            const traffic = buildSelectionTrafficLight(kpis);

            return {
                animal: {
                    id: animal.id,
                    brinco: animal.brinco,
                    raca: animal.raca,
                },
                kpis: {
                    ...kpis,
                    lastCalvingDate: kpis.lastCalvingDate ? kpis.lastCalvingDate.toISOString() : null,
                    lastPregCheck: kpis.lastPregCheck ? kpis.lastPregCheck.toISOString() : null,
                },
                trafficLight: traffic.trafficLight,
                reasons: traffic.reasons,
                decision: decisionMap.get(animal.id) || null,
            };
        });

        const summary = {
            pregRate: validSeasonId
                ? totalExposed > 0
                    ? pregInSeasonCount / totalExposed
                    : null
                : totalDiagnosticsWindow > 0
                    ? pregInWindowTotal / totalDiagnosticsWindow
                    : null,
            openDaysAvg: openDaysCount > 0 ? openDaysSum / openDaysCount : null,
            openDaysOver180Pct: openDaysCount > 0 ? openDaysOver180Count / openDaysCount : null,
            iepAvg: iepCount > 0 ? iepSum / iepCount : null,
            openDaysCount,
            iepCount,
            totals: {
                females: animals.length,
                withKpis: withKpisCount,
                ...(validSeasonId
                    ? { exposures: totalExposed, pregnant: pregInSeasonCount, empty: emptyInSeasonCount }
                    : {}),
                ...(validSeasonId ? {} : { diagCount: totalDiagnosticsWindow }),
            },
        };

        const topAlerts = items
            .filter((item) => item.trafficLight === 'RED')
            .sort((a, b) => {
                const aOpen = a.kpis.openDays ?? -1;
                const bOpen = b.kpis.openDays ?? -1;
                return bOpen - aOpen;
            })
            .slice(0, 20);

        const decisionsList = await prisma.selectionDecision.findMany({
            where: { farmId: farm.id },
            include: { animal: true },
            orderBy: { updatedAt: 'desc' },
            take: 50,
        });

        return res.json({
            summary,
            topAlerts,
            decisions: decisionsList.map((decision) => ({
                animal: {
                    id: decision.animal.id,
                    brinco: decision.animal.brinco,
                    raca: decision.animal.raca,
                },
                decision: {
                    decision: decision.decision,
                    reason: decision.reason,
                    updatedAt: decision.updatedAt.toISOString(),
                },
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar relatório genético.' });
    }
});

app.get('/genetics/selection/decisions', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar decisões.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const decisions = await prisma.selectionDecision.findMany({
            where: { farmId: farm.id },
            orderBy: { updatedAt: 'desc' },
        });

        return res.json({
            decisions: decisions.map((decision) => ({
                id: decision.id,
                farmId: decision.farmId,
                animalId: decision.animalId,
                decision: decision.decision,
                reason: decision.reason,
                createdAt: decision.createdAt.toISOString(),
                updatedAt: decision.updatedAt.toISOString(),
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar decisões de seleção.' });
    }
});

app.post('/genetics/selection/decisions', async (req, res) => {
    const { farmId, animalId, decision, reason } = req.body || {};
    if (!farmId || !animalId || !decision) {
        return res.status(400).json({ message: 'Informe fazenda, animal e decisão.' });
    }

    const normalizedDecision = normalizeSelectionDecision(decision);
    if (!normalizedDecision) {
        return res.status(400).json({ message: 'Decisão inválida.' });
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (normalizedDecision === 'DISCARD' && !trimmedReason) {
        return res.status(400).json({ message: 'Motivo obrigatório para descarte.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const animal = await prisma.animal.findFirst({
            where: { id: String(animalId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }

        const decisionRecord = await prisma.selectionDecision.upsert({
            where: {
                farmId_animalId: {
                    farmId: farm.id,
                    animalId: animal.id,
                },
            },
            update: {
                decision: normalizedDecision,
                reason: normalizedDecision === 'DISCARD' ? trimmedReason : trimmedReason || null,
            },
            create: {
                farmId: farm.id,
                animalId: animal.id,
                decision: normalizedDecision,
                reason: normalizedDecision === 'DISCARD' ? trimmedReason : trimmedReason || null,
            },
        });

        return res.json({
            decision: {
                id: decisionRecord.id,
                farmId: decisionRecord.farmId,
                animalId: decisionRecord.animalId,
                decision: decisionRecord.decision,
                reason: decisionRecord.reason,
                createdAt: decisionRecord.createdAt.toISOString(),
                updatedAt: decisionRecord.updatedAt.toISOString(),
            },
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Decisão já registrada.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar decisão.' });
    }
});

app.delete('/genetics/selection/decisions/:animalId', async (req, res) => {
    const { animalId } = req.params;
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para remover decisão.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const existing = await prisma.selectionDecision.findFirst({
            where: { farmId: farm.id, animalId: String(animalId) },
        });
        if (!existing) {
            return res.status(404).json({ message: 'Decisão não encontrada.' });
        }

        await prisma.selectionDecision.delete({
            where: { id: existing.id },
        });

        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao remover decisão.' });
    }
});
app.get('/nutrition/plans', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar planos.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const plans = await prisma.nutritionPlan.findMany({
            where: { farmId: farm.id },
            orderBy: { startAt: 'desc' },
        });
        return res.json({ plans: plans.map(serializeNutritionPlan) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar planos.' });
    }
});

app.post('/nutrition/plans', async (req, res) => {
    const { farmId, nome, fase, startAt, endAt, metaGmd, observacoes } = req.body || {};
    if (!farmId || !nome?.trim() || !startAt) {
        return res.status(400).json({ message: 'Dados obrigatórios do plano ausentes.' });
    }
    const parsedStart = parseDateValue(startAt);
    if (!parsedStart) {
        return res.status(400).json({ message: 'Data de início inválida.' });
    }
    const parsedEnd = endAt ? parseDateValue(endAt) : null;
    if (endAt && !parsedEnd) {
        return res.status(400).json({ message: 'Data de fim inválida.' });
    }
    if (parsedEnd && parsedEnd < parsedStart) {
        return res.status(400).json({ message: 'Data de fim deve ser maior que a data de início.' });
    }
    let parsedMetaGmd = null;
    if (metaGmd !== undefined && metaGmd !== null && metaGmd !== '') {
        const parsed = parseNumber(metaGmd);
        if (parsed === null || parsed <= 0) {
            return res.status(400).json({ message: 'Meta de GMD inválida.' });
        }
        parsedMetaGmd = parsed;
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const plan = await prisma.nutritionPlan.create({
            data: {
                farmId: farm.id,
                nome: nome.trim(),
                fase: typeof fase === 'string' && fase.trim() ? fase.trim() : null,
                startAt: parsedStart,
                endAt: parsedEnd,
                metaGmd: parsedMetaGmd,
                observacoes: typeof observacoes === 'string' && observacoes.trim() ? observacoes.trim() : null,
            },
        });
        await logActivity(prisma, req, {
            action: 'PLANO_NUTRICAO_CRIADO',
            entity: 'NutritionPlan',
            entityId: plan.id,
            description: `Criou o plano de nutrição "${plan.nome}"`,
            farmId: farm.id,
        });
        return res.status(201).json({ plan: serializeNutritionPlan(plan) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar plano.' });
    }
});

app.patch('/nutrition/plans/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, fase, startAt, endAt, metaGmd, observacoes } = req.body || {};
    try {
        const plan = await prisma.nutritionPlan.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!plan) {
            return res.status(404).json({ message: 'Plano não encontrado.' });
        }
        const updates = {};
        if (nome !== undefined) {
            if (!nome?.trim()) {
                return res.status(400).json({ message: 'Nome inválido.' });
            }
            updates.nome = nome.trim();
        }
        if (fase !== undefined) {
            updates.fase = typeof fase === 'string' && fase.trim() ? fase.trim() : null;
        }
        if (startAt !== undefined) {
            const parsedStart = parseDateValue(startAt);
            if (!parsedStart) {
                return res.status(400).json({ message: 'Data de início inválida.' });
            }
            updates.startAt = parsedStart;
        }
        if (endAt !== undefined) {
            if (!endAt) {
                updates.endAt = null;
            } else {
                const parsedEnd = parseDateValue(endAt);
                if (!parsedEnd) {
                    return res.status(400).json({ message: 'Data de fim inválida.' });
                }
                updates.endAt = parsedEnd;
            }
        }
        if (updates.startAt && updates.endAt && updates.endAt < updates.startAt) {
            return res.status(400).json({ message: 'Data de fim deve ser maior que a data de início.' });
        }
        if (metaGmd !== undefined) {
            if (metaGmd === null || metaGmd === '') {
                updates.metaGmd = null;
            } else {
                const parsed = parseNumber(metaGmd);
                if (parsed === null || parsed <= 0) {
                    return res.status(400).json({ message: 'Meta de GMD inválida.' });
                }
                updates.metaGmd = parsed;
            }
        }
        if (observacoes !== undefined) {
            updates.observacoes = typeof observacoes === 'string' && observacoes.trim() ? observacoes.trim() : null;
        }
        const updated = await prisma.nutritionPlan.update({
            where: { id: plan.id },
            data: updates,
        });
        await logActivity(prisma, req, {
            action: 'PLANO_NUTRICAO_EDITADO',
            entity: 'NutritionPlan',
            entityId: updated.id,
            description: `Editou o plano de nutrição "${updated.nome}"`,
            farmId: updated.farmId,
        });
        return res.json({ plan: serializeNutritionPlan(updated) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar plano.' });
    }
});

app.delete('/nutrition/plans/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const plan = await prisma.nutritionPlan.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!plan) {
            return res.status(404).json({ message: 'Plano não encontrado.' });
        }
        await prisma.nutritionPlan.delete({ where: { id: plan.id } });
        await logActivity(prisma, req, {
            action: 'PLANO_NUTRICAO_EXCLUIDO',
            entity: 'NutritionPlan',
            entityId: plan.id,
            description: `Excluiu o plano de nutrição "${plan.nome}"`,
            farmId: plan.farmId,
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir plano.' });
    }
});

app.post('/nutrition/assignments', async (req, res) => {
    const { farmId, planId, lotId, poLotId, animalId, poAnimalId, startAt, endAt } = req.body || {};
    if (!farmId || !planId || !startAt) {
        return res.status(400).json({ message: 'Dados obrigatórios da atribuição ausentes.' });
    }
    const targets = [lotId, poLotId, animalId, poAnimalId].filter(Boolean);
    if (targets.length !== 1) {
        return res.status(400).json({ message: 'Informe exatamente um destino: lote, lote P.O., animal ou animal P.O.' });
    }
    const parsedStart = parseDateValue(startAt);
    if (!parsedStart) {
        return res.status(400).json({ message: 'Data de início inválida.' });
    }
    const parsedEnd = endAt ? parseDateValue(endAt) : null;
    if (endAt && !parsedEnd) {
        return res.status(400).json({ message: 'Data de fim inválida.' });
    }
    if (parsedEnd && parsedEnd < parsedStart) {
        return res.status(400).json({ message: 'Data de fim deve ser maior que a data de início.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const plan = await prisma.nutritionPlan.findFirst({
            where: { id: String(planId), farmId: farm.id },
        });
        if (!plan) {
            return res.status(404).json({ message: 'Plano não encontrado.' });
        }
        if (lotId) {
            const lot = await prisma.lot.findFirst({
                where: { id: String(lotId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!lot) {
                return res.status(404).json({ message: 'Lote não encontrado.' });
            }
        }
        if (poLotId) {
            const lot = await prisma.poLot.findFirst({
                where: { id: String(poLotId), farmId: farm.id },
            });
            if (!lot) {
                return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
            }
        }
        if (animalId) {
            const animal = await prisma.animal.findFirst({
                where: { id: String(animalId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal não encontrado.' });
            }
        }
        if (poAnimalId) {
            const poAnimal = await prisma.poAnimal.findFirst({
                where: { id: String(poAnimalId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!poAnimal) {
                return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
            }
        }
        const assignment = await prisma.nutritionAssignment.create({
            data: {
                farmId: farm.id,
                planId: plan.id,
                lotId: lotId ? String(lotId) : null,
                poLotId: poLotId ? String(poLotId) : null,
                animalId: animalId ? String(animalId) : null,
                poAnimalId: poAnimalId ? String(poAnimalId) : null,
                startAt: parsedStart,
                endAt: parsedEnd,
            },
        });
        await logActivity(prisma, req, {
            action: 'PLANO_NUTRICAO_ATRIBUIDO',
            entity: 'NutritionAssignment',
            entityId: assignment.id,
            description: `Atribuiu o plano de nutrição "${plan.nome}"`,
            farmId: farm.id,
        });
        return res.status(201).json({ assignment: serializeNutritionAssignment(assignment), plan: serializeNutritionPlan(plan) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atribuir plano.' });
    }
});

app.get('/nutrition/assignments/current', async (req, res) => {
    const { farmId, lotId, poLotId, animalId, poAnimalId, at } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda.' });
    }
    const targets = [lotId, poLotId, animalId, poAnimalId].filter(Boolean);
    if (targets.length !== 1) {
        return res.status(400).json({ message: 'Informe exatamente um destino: lote, lote P.O., animal ou animal P.O.' });
    }
    const atDate = at ? parseDateValue(at) : new Date();
    if (!atDate) {
        return res.status(400).json({ message: 'Data inválida.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        if (lotId) {
            const lot = await prisma.lot.findFirst({
                where: { id: String(lotId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!lot) {
                return res.status(404).json({ message: 'Lote não encontrado.' });
            }
        }
        if (poLotId) {
            const lot = await prisma.poLot.findFirst({
                where: { id: String(poLotId), farmId: farm.id },
            });
            if (!lot) {
                return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
            }
        }
        if (animalId) {
            const animal = await prisma.animal.findFirst({
                where: { id: String(animalId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal não encontrado.' });
            }
        }
        if (poAnimalId) {
            const poAnimal = await prisma.poAnimal.findFirst({
                where: { id: String(poAnimalId), farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!poAnimal) {
                return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
            }
        }
        const assignment = await prisma.nutritionAssignment.findFirst({
            where: {
                farmId: farm.id,
                lotId: lotId ? String(lotId) : null,
                poLotId: poLotId ? String(poLotId) : null,
                animalId: animalId ? String(animalId) : null,
                poAnimalId: poAnimalId ? String(poAnimalId) : null,
                startAt: { lte: atDate },
                OR: [{ endAt: null }, { endAt: { gte: atDate } }],
            },
            orderBy: { startAt: 'desc' },
            include: { plan: true },
        });
        if (!assignment) {
            return res.json({ assignment: null, plan: null });
        }
        return res.json({
            assignment: serializeNutritionAssignment(assignment),
            plan: serializeNutritionPlan(assignment.plan),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao buscar plano atual.' });
    }
});

registerNutritionModuleRoutes({
    app,
    prisma,
    parseNumber,
    parseDateValue,
    buildFarmScopeFilter,
});

registerAcasalamentoRoutes({
    app,
    prisma,
    buildFarmScopeFilter,
    buildFarmRelationFilter,
});

app.get('/animals', requireAuth, async (req, res) => {
    const { farmId, lotId, status: statusFilter } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar animais.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        // Por padrão só mostra animais vivos. "ARQUIVADOS" mostra vendidos/mortos
        // e "TODOS" mostra tudo — o histórico nunca é apagado, só sai da lista
        // ativa por padrão.
        const normalizedStatusFilter = String(statusFilter || 'VIVO').toUpperCase();
        const statusWhere = normalizedStatusFilter === 'TODOS'
            ? {}
            : normalizedStatusFilter === 'ARQUIVADOS'
                ? { status: { in: ['VENDIDO', 'MORTO'] } }
                : { status: 'VIVO' };

        const animals = await prisma.animal.findMany({
            where: {
                farmId: String(farmId),
                farm: buildFarmRelationFilter(req),
                ...(lotId ? { lotId: String(lotId) } : {}),
                ...statusWhere,
            },
            include: {
                currentPaddock: true,
                pesagens: { orderBy: { data: 'desc' }, take: 1, select: { data: true, peso: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const now = new Date();
        const animalIds = animals.map((animal) => animal.id);
        const lotIds = animals.map((animal) => animal.lotId).filter(Boolean);
        let nutritionByAnimal = new Map();
        let nutritionByLot = new Map();
        if (animalIds.length || lotIds.length) {
            const assignments = await prisma.nutritionAssignment.findMany({
                where: {
                    farmId: farm.id,
                    startAt: { lte: now },
                    OR: [{ endAt: null }, { endAt: { gte: now } }],
                    AND: [
                        {
                            OR: [
                                ...(animalIds.length ? [{ animalId: { in: animalIds } }] : []),
                                ...(lotIds.length ? [{ lotId: { in: lotIds } }] : []),
                            ],
                        },
                    ],
                },
                include: { plan: true },
            });
            const pickLatest = (map, key, assignment) => {
                if (!key) return;
                const existing = map.get(key);
                if (!existing || assignment.startAt > existing.startAt) {
                    map.set(key, assignment);
                }
            };
            assignments.forEach((assignment) => {
                if (assignment.animalId) {
                    pickLatest(nutritionByAnimal, assignment.animalId, assignment);
                }
                if (assignment.lotId) {
                    pickLatest(nutritionByLot, assignment.lotId, assignment);
                }
            });
        }

        // Vaca é fêmea que pariu, não fêmea velha. Aqui o sistema descobre quem
        // pariu de verdade: uma consulta em lote para todas as fêmeas da página,
        // não uma por animal. Sem isso a dedução cai no status reprodutivo.
        const femeaIds = animals.filter((animal) => animal.sexo === 'FEMEA').map((animal) => animal.id);
        let matrizesComParto = new Set();
        if (femeaIds.length) {
            const crias = await prisma.animal.findMany({
                where: { maeId: { in: femeaIds } },
                select: { maeId: true },
                distinct: ['maeId'],
            });
            matrizesComParto = new Set(crias.map((cria) => cria.maeId));
        }

        const enriched = animals.map((animal) => {
            const direct = nutritionByAnimal.get(animal.id);
            const lot = animal.lotId ? nutritionByLot.get(animal.lotId) : null;
            const plan = direct?.plan || lot?.plan || null;
            return {
                ...animal,
                currentNutritionPlan: plan ? serializeNutritionPlan(plan) : null,
                jaPariu: matrizesComParto.has(animal.id),
            };
        });

        return res.json({ animals: enriched.map(serializeAnimal) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar animais.' });
    }
});

app.post('/animals', requireAuth, async (req, res) => {
    const { farmId, lotId, brinco, raca, sexo, dataNascimento, ultimoPeso, paddockId, paddockStartAt, valorCompra, dataCompra, tipoCadastro,
            tatuagem, sisbov, maeId, maeNome, paiId, paiNome,
            nome, brincoEletronico, padraoRacial, tipoRaca, composicaoMestica, racaPredominante,
            funcaoReprodutiva, statusReprodutivo, previsaoParto, observacoes, categoria } = req.body || {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pesoAtual')) {
        return res.status(400).json({ message: 'Campo inválido: use "ultimoPeso" no lugar de "pesoAtual".' });
    }

    if (!farmId || !brinco?.trim() || !raca?.trim() || !sexo) {
        return res.status(400).json({ message: 'Dados obrigatórios do animal ausentes.' });
    }
    // paddockId é opcional — animais podem ser importados sem pasto e alocados depois

    const sexoEnum = normalizeSexo(sexo);
    if (!sexoEnum) {
        return res.status(400).json({ message: 'Sexo inválido. Use Macho ou Fêmea.' });
    }

    const birthDate = dataNascimento ? parseDateValue(dataNascimento) : null;
    if (dataNascimento && !birthDate) {
        return res.status(400).json({ message: 'Data de nascimento inválida.' });
    }

    const parsedPesoAtual = (ultimoPeso !== undefined && ultimoPeso !== null && ultimoPeso !== '')
        ? parseNumber(ultimoPeso)
        : null;
    if (parsedPesoAtual !== null && parsedPesoAtual <= 0) {
        return res.status(400).json({ message: 'Peso atual inválido.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        let validLotId = null;
        if (lotId) {
            const lot = await prisma.lot.findFirst({
                where: { id: lotId, farmId, farm: buildFarmRelationFilter(req) },
            });
            if (!lot || lot.farmId !== farmId) {
                return res.status(400).json({ message: 'Lote inválido para esta fazenda.' });
            }
            validLotId = lotId;
        }

        let validPaddockId = null;
        let moveStartAt = null;
        if (paddockId) {
            const paddock = await prisma.paddock.findFirst({
                where: { id: paddockId, farmId, farm: buildFarmRelationFilter(req) },
            });
            if (!paddock) {
                return res.status(400).json({ message: 'Pasto inválido para esta fazenda.' });
            }
            moveStartAt = paddockStartAt ? parseDateValue(paddockStartAt) : new Date();
            if (paddockStartAt && !moveStartAt) {
                return res.status(400).json({ message: 'Data de entrada no pasto inválida.' });
            }
            validPaddockId = paddockId;
        }

        const parsedValorCompra = valorCompra ? parseFloat(valorCompra) : null;
        const compraDate = dataCompra ? parseDateValue(dataCompra) : (moveStartAt || new Date());
        if ((valorCompra !== undefined && valorCompra !== '' && (!Number.isFinite(parsedValorCompra) || parsedValorCompra <= 0)) || !compraDate) {
            return res.status(400).json({ message: 'Data ou valor de compra inválido.' });
        }

        // Resolver maeId/paiId por brinco se não vier como UUID direto
        let resolvedMaeId = maeId || null;
        let resolvedPaiId = paiId || null;
        if (!resolvedMaeId && maeNome?.trim()) {
            const maeAnimal = await prisma.animal.findFirst({ where: { farmId, brinco: maeNome.trim() } });
            if (maeAnimal) resolvedMaeId = maeAnimal.id;
        }
        if (!resolvedPaiId && paiNome?.trim()) {
            const paiAnimal = await prisma.animal.findFirst({ where: { farmId, brinco: paiNome.trim() } });
            if (paiAnimal) resolvedPaiId = paiAnimal.id;
        }

        // A identificação não pode se repetir em nenhuma fazenda da mesma
        // organização, não só nesta.
        const brincoTrimmed = brinco.trim();
        const identityKey = normalizeAnimalIdentityKey(brincoTrimmed);
        const duplicateIdentity = await findDuplicateIdentityInOrganization(prisma, req, { identityKey });
        if (duplicateIdentity) {
            const ondeMsg = duplicateIdentity.farmId === farmId ? 'nesta fazenda' : `na fazenda "${duplicateIdentity.farmName || 'outra fazenda'}"`;
            return res.status(409).json({ message: `Já existe um animal com a identificação "${brincoTrimmed}" ${ondeMsg}.` });
        }

        const animal = await prisma.$transaction(async (tx) => {
            const created = await tx.animal.create({
                data: {
                    farmId,
                    lotId: validLotId,
                    brinco: brincoTrimmed,
                    identityKey,
                    raca: raca.trim(),
                    tipoCadastro: normalizeAnimalTipoCadastro(tipoCadastro),
                    sexo: sexoEnum,
                    dataNascimento: birthDate,
                    pesoAtual: parsedPesoAtual,
                    gmd: null,
                    gmd30: null,
                    currentPaddockId: validPaddockId,
                    tatuagem: tatuagem?.trim() || null,
                    sisbov: sisbov?.trim() || null,
                    maeId: resolvedMaeId,
                    maeNome: resolvedMaeId ? null : (maeNome?.trim() || null),
                    paiId: resolvedPaiId,
                    paiNome: resolvedPaiId ? null : (paiNome?.trim() || null),
                    nome: nome?.trim() || null,
                    brincoEletronico: brincoEletronico?.trim() || null,
                    padraoRacial: padraoRacial?.trim() || null,
                    tipoRaca: tipoRaca?.trim() || null,
                    composicaoMestica: composicaoMestica?.trim() || null,
                    racaPredominante: racaPredominante?.trim() || null,
                    funcaoReprodutiva: funcaoReprodutiva?.trim() || null,
                    statusReprodutivo: statusReprodutivo?.trim() || null,
                    previsaoParto: previsaoParto ? parseDateValue(previsaoParto) : null,
                    observacoes: observacoes?.trim() || null,
                    // A categoria vinha do formulário e era descartada aqui: o campo
                    // não estava no destructuring nem neste create. Em branco fica
                    // null de propósito, para a dedução por idade assumir na leitura.
                    categoria: normalizarCategoriaParaGravar(categoria),
                },
            });
            if (parsedPesoAtual) {
                await tx.weighing.create({
                    data: { animalId: created.id, data: compraDate, peso: parsedPesoAtual, gmd: 0, source: 'MANUAL' },
                });
            }
            if (validPaddockId && moveStartAt) {
                await tx.paddockMove.create({
                    data: {
                        farmId,
                        paddockId: validPaddockId,
                        animalId: created.id,
                        startAt: moveStartAt,
                    },
                });
            }

            // Se valor de compra informado, cria evento + lançamento financeiro automaticamente
            if (parsedValorCompra && parsedValorCompra > 0) {
                const catMap = HERD_EVENT_CATEGORY_MAP['COMPRA'];
                const herdEvent = await tx.herdEvent.create({
                    data: {
                        farmId,
                        animalId: created.id,
                        type: 'COMPRA',
                        date: compraDate,
                        peso: parsedPesoAtual ?? null,
                        valor: parsedValorCompra,
                        observacoes: `Compra registrada no cadastro — brinco ${brinco.trim()}`,
                        purchasePurpose: 'PRODUCTION',
                    },
                });
                await createIntegratedTransaction(tx, {
                    farmId,
                    type: catMap.type,
                    categoria: catMap.categoria,
                    accountCategoryId: 'sys-compra-animais-producao',
                    amount: parsedValorCompra,
                    competenceDate: compraDate,
                    description: `Compra de animal — ${brinco.trim()}`,
                    herdEventId: herdEvent.id,
                    animalId: created.id,
                    allocations: (created.lotId || validPaddockId) ? [{ lotId: created.lotId, paddockId: validPaddockId }] : [],
                });
            }

            return created;
        });

        await logActivity(prisma, req, { action: 'ANIMAL_CRIADO', entity: 'Animal', entityId: animal.id, description: `Cadastrou o animal ${brinco.trim()}`, farmId });
        return res.status(201).json({ animal: serializeAnimal(animal) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar animal.' });
    }
});

// ── Registrar nascimento — fluxo dedicado ─────────────────────────────────────
// Cria o bezerro puxando raça e pasto da mãe automaticamente quando possível
app.post('/animals/nascimento', requireAuth, async (req, res) => {
    const { farmId, maeId, sexo, dataNascimento, pesoNascimento, nome, lotId, paddockId, origemNascimento, embryoTransferId } = req.body || {};
    const isTe = String(origemNascimento || '').toUpperCase() === 'TE' || Boolean(embryoTransferId);

    if (!farmId || (!isTe && !maeId) || (isTe && !embryoTransferId) || !sexo || !dataNascimento) {
        return res.status(400).json({ message: 'Informe fazenda, origem, matriz ou transferência, sexo e data de nascimento.' });
    }

    const sexoEnum = normalizeSexo(sexo);
    if (!sexoEnum) return res.status(400).json({ message: 'Sexo inválido.' });

    const birthDate = parseDateValue(dataNascimento);
    if (!birthDate) return res.status(400).json({ message: 'Data de nascimento inválida.' });

    try {
        const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: farmId }) });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const transfer = isTe ? await prisma.embryoTransfer.findFirst({
            where: { id: String(embryoTransferId), farmId, herdType: 'COMMERCIAL', status: 'PENDING' },
            include: { embryoBatch: { include: { donorAnimal: true, sireAnimal: true } }, recipientAnimal: true },
        }) : null;
        if (isTe && (!transfer || !transfer.recipientAnimal || transfer.transferredAt > birthDate)) {
            return res.status(400).json({ message: 'Transferência de embrião pendente inválida para este nascimento.' });
        }

        // Em TE, a receptora é a matriz responsável inicial; a doadora permanece na genealogia.
        const maeAnimal = isTe
            ? transfer.recipientAnimal
            : await prisma.animal.findFirst({ where: { id: String(maeId), farmId, sexo: 'FEMEA' } });
        if (!maeAnimal) return res.status(400).json({ message: 'Matriz inválida para esta fazenda.' });

        // Herdar pasto e lote da mãe se não informados
        const validPaddockId = paddockId || maeAnimal.currentPaddockId || null;
        const validLotId = lotId || maeAnimal.lotId || null;
        if (validPaddockId) {
            const paddock = await prisma.paddock.findFirst({ where: { id: String(validPaddockId), farmId } });
            if (!paddock) return res.status(400).json({ message: 'Pasto inválido para esta fazenda.' });
        }
        if (validLotId) {
            const lot = await prisma.lot.findFirst({ where: { id: String(validLotId), farmId } });
            if (!lot) return res.status(400).json({ message: 'Lote inválido para esta fazenda.' });
        }

        // Raça herdada da mãe
        const racaBezerro = transfer?.embryoBatch?.donorAnimal?.raca || maeAnimal?.raca || 'Não informada';

        const peso = pesoNascimento ? parseNumber(pesoNascimento) : null;

        const bezerro = await prisma.$transaction(async (tx) => {
            let sequenciaMatriz;
            let identificacaoMatrizSnapshot;
            let brincoFinal;
            if (isTe) {
                const pair = await tx.embryoPairSequence.upsert({
                    where: { farmId_herdType_recipientKey_donorKey: { farmId, herdType: 'COMMERCIAL', recipientKey: maeAnimal.id, donorKey: transfer.donorKey } },
                    create: { farmId, herdType: 'COMMERCIAL', recipientKey: maeAnimal.id, donorKey: transfer.donorKey, lastSequence: 1 },
                    update: { lastSequence: { increment: 1 } },
                    select: { lastSequence: true },
                });
                sequenciaMatriz = pair.lastSequence;
                identificacaoMatrizSnapshot = transfer.recipientSnapshot;
                brincoFinal = buildTeProvisionalIdentification(transfer.recipientSnapshot, transfer.donorSnapshot, sequenciaMatriz);
            } else {
                const matrizAtualizada = await tx.animal.update({
                    where: { id: maeAnimal.id },
                    data: { ultimaSequenciaCria: { increment: 1 } },
                    select: { ultimaSequenciaCria: true, brinco: true, nome: true },
                });
                sequenciaMatriz = matrizAtualizada.ultimaSequenciaCria;
                identificacaoMatrizSnapshot = matrizAtualizada.brinco || matrizAtualizada.nome || maeAnimal.id;
                brincoFinal = buildProvisionalIdentification(identificacaoMatrizSnapshot, sequenciaMatriz);
            }
            const created = await tx.animal.create({
                data: {
                    farmId,
                    brinco: brincoFinal,
                    identityKey: normalizeAnimalIdentityKey(brincoFinal),
                    nome: String(nome || '').trim() || null,
                    raca: racaBezerro,
                    sexo: sexoEnum,
                    dataNascimento: birthDate,
                    pesoAtual: peso,
                    gmd: null,
                    gmd30: null,
                    currentPaddockId: validPaddockId,
                    lotId: validLotId,
                    maeId: isTe ? (transfer.embryoBatch.donorAnimalId || null) : maeAnimal.id,
                    maeNome: isTe ? transfer.donorSnapshot : null,
                    paiId: isTe ? (transfer.embryoBatch.sireAnimalId || null) : null,
                    paiNome: isTe ? transfer.sireSnapshot : null,
                    matrizResponsavelId: maeAnimal.id,
                    identificacaoProvisoria: true,
                    identificacaoProvisoriaOriginal: brincoFinal,
                    identificacaoMatrizSnapshot,
                    sequenciaMatriz,
                    origemNascimento: isTe ? 'TE' : 'NATURAL',
                    receptoraGestacionalId: maeAnimal.id,
                    receptoraGestacionalSnapshot: identificacaoMatrizSnapshot,
                    doadoraSnapshot: isTe ? transfer.donorSnapshot : null,
                    touroSnapshot: isTe ? transfer.sireSnapshot : null,
                    embryoTransferId: isTe ? transfer.id : null,
                },
            });

            if (isTe) {
                await tx.embryoTransfer.update({ where: { id: transfer.id }, data: { status: 'BORN', birthAt: birthDate } });
            }

            if (validPaddockId) {
                await tx.paddockMove.create({
                    data: { farmId, paddockId: validPaddockId, animalId: created.id, startAt: birthDate },
                });
            }

            await tx.herdEvent.create({
                data: {
                    farmId,
                    animalId: created.id,
                    type: 'NASCIMENTO',
                    date: birthDate,
                    peso: peso ?? null,
                    observacoes: isTe
                        ? `Nascimento por TE — receptora ${transfer.recipientSnapshot}; doadora ${transfer.donorSnapshot}`
                        : `Nascimento registrado — mãe: ${maeAnimal.brinco}`,
                },
            });

            const existingBirthEvent = await tx.reproEvent.findFirst({
                where: { farmId, animalId: maeAnimal.id, type: 'PARTO', date: birthDate },
                select: { id: true, payload: true },
            });
            const birthPayload = {
                ...(existingBirthEvent?.payload && typeof existingBirthEvent.payload === 'object' ? existingBirthEvent.payload : {}),
                calfSex: formatSexoLabel(sexoEnum),
                calfAnimalId: created.id,
                birthOrigin: isTe ? 'TE' : 'NATURAL',
            };
            if (existingBirthEvent) {
                await tx.reproEvent.update({ where: { id: existingBirthEvent.id }, data: { payload: birthPayload } });
            } else {
                await tx.reproEvent.create({
                    data: {
                        farmId,
                        animalId: maeAnimal.id,
                        type: 'PARTO',
                        date: birthDate,
                        payload: birthPayload,
                        notes: isTe
                            ? `Parto com cria por TE — ${created.brinco}`
                            : `Parto com cria cadastrada — ${created.brinco}`,
                    },
                });
            }

            await tx.animal.update({
                where: { id: maeAnimal.id },
                data: { statusReprodutivo: 'VAZIA', previsaoParto: null, emTransferenciaEmbriao: false },
            });

            return created;
        });

        await logActivity(prisma, req, { action: 'NASCIMENTO_REGISTRADO', entity: 'Animal', entityId: bezerro.id, description: `Registrou nascimento — brinco ${bezerro.brinco}`, farmId });
        return res.status(201).json({ animal: serializeAnimal(bezerro), brincoProvisorio: bezerro.identificacaoProvisoria });
    } catch (error) {
        if (error?.code === 'P2002') return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        console.error(error);
        return res.status(500).json({ message: 'Erro ao registrar nascimento.' });
    }
});

app.post('/animals/:id/identificacao-definitiva', requireAuth, async (req, res) => {
    const identificacao = String(req.body?.identificacao || '').trim();
    if (!identificacao) return res.status(400).json({ message: 'Informe a identificação definitiva.' });
    try {
        const animal = await prisma.animal.findFirst({
            where: { id: String(req.params.id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
        if (!animal.identificacaoProvisoria) return res.status(409).json({ message: 'O animal já possui identificação definitiva.' });
        const identityKey = normalizeAnimalIdentityKey(identificacao);
        // A identificação definitiva também não pode repetir em nenhuma
        // fazenda da mesma organização.
        const duplicate = await findDuplicateIdentityInOrganization(prisma, req, { identityKey, excludeAnimalId: animal.id });
        const duplicatePo = await prisma.poAnimal.findFirst({ where: { farmId: animal.farmId, brinco: identificacao }, select: { id: true } });
        if (duplicate || duplicatePo) {
            const ondeMsg = duplicate && duplicate.farmId !== animal.farmId ? `na fazenda "${duplicate.farmName || 'outra fazenda'}"` : 'nesta fazenda';
            return res.status(409).json({ message: `Identificação já cadastrada ${ondeMsg}.` });
        }
        const updated = await prisma.animal.update({
            where: { id: animal.id },
            data: {
                identificacaoAnterior: animal.brinco,
                brinco: identificacao,
                identityKey,
                identificacaoProvisoria: false,
            },
        });
        await logActivity(prisma, req, { action: 'IDENTIFICACAO_DEFINITIVA', entity: 'Animal', entityId: animal.id, description: `Substituiu ${animal.brinco} por ${identificacao}`, farmId: animal.farmId });
        return res.json({ animal: serializeAnimal(updated) });
    } catch (error) {
        if (error?.code === 'P2002') return res.status(409).json({ message: 'Identificação já cadastrada nesta fazenda.' });
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atribuir identificação definitiva.' });
    }
});

app.post('/animals/:id/desmama', requireAuth, async (req, res) => {
    try {
        const { error, result, previousIdentification, definitiveId } = await weanCalf({ req, animalId: req.params.id, isPo: false });
        if (error) return res.status(error.status).json({ message: error.message });
        await logActivity(prisma, req, {
            action: 'DESMAMA_REGISTRADA',
            entity: 'Animal',
            entityId: result.id,
            description: definitiveId
                ? `Registrou desmama e substituiu ${previousIdentification} por ${definitiveId}`
                : `Registrou desmama de ${previousIdentification}; aguardando ID definitivo`,
            farmId: result.farmId,
        });
        return res.status(201).json({ animal: serializeAnimal(result) });
    } catch (error) {
        if (error?.code === 'P2002') return res.status(409).json({ message: 'Identificação ou pesagem já cadastrada.' });
        console.error(error);
        return res.status(500).json({ message: 'Erro ao registrar desmama.' });
    }
});

app.post('/animals/:id/matriz-responsavel', requireAuth, async (req, res) => {
    const matrizResponsavelId = String(req.body?.matrizResponsavelId || '').trim();
    if (!matrizResponsavelId) return res.status(400).json({ message: 'Informe a matriz responsável.' });
    try {
        const animal = await prisma.animal.findFirst({ where: { id: String(req.params.id), farm: buildFarmRelationFilter(req) } });
        if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
        if (!animal.identificacaoProvisoria) return res.status(409).json({ message: 'A troca de matriz responsável exige identificação provisória.' });
        if (animal.id === matrizResponsavelId) return res.status(400).json({ message: 'O animal não pode ser sua própria matriz.' });
        const matriz = await prisma.animal.findFirst({ where: { id: matrizResponsavelId, farmId: animal.farmId, sexo: 'FEMEA' } });
        if (!matriz) return res.status(400).json({ message: 'Matriz responsável inválida.' });
        if (animal.origemNascimento === 'TE') {
            const updated = await prisma.animal.update({ where: { id: animal.id }, data: { matrizResponsavelId: matriz.id } });
            await logActivity(prisma, req, { action: 'MATRIZ_RESPONSAVEL_ALTERADA', entity: 'Animal', entityId: animal.id, description: `Alterou matriz responsável de ${animal.brinco}; a receptora e a identificação TE foram preservadas`, farmId: animal.farmId });
            return res.json({ animal: serializeAnimal(updated) });
        }
        const updated = await prisma.$transaction(async (tx) => {
            const nextMother = await tx.animal.update({ where: { id: matriz.id }, data: { ultimaSequenciaCria: { increment: 1 } }, select: { ultimaSequenciaCria: true, brinco: true, nome: true } });
            const snapshot = nextMother.brinco || nextMother.nome || nextMother.id;
            const nextId = buildProvisionalIdentification(snapshot, nextMother.ultimaSequenciaCria);
            return tx.animal.update({
                where: { id: animal.id },
                data: { identificacaoAnterior: animal.brinco, brinco: nextId, identityKey: nextId, matrizResponsavelId: matriz.id, identificacaoMatrizSnapshot: snapshot, sequenciaMatriz: nextMother.ultimaSequenciaCria },
            });
        });
        await logActivity(prisma, req, { action: 'MATRIZ_RESPONSAVEL_ALTERADA', entity: 'Animal', entityId: animal.id, description: `Alterou matriz responsável; ${animal.brinco} passou a ${updated.brinco}`, farmId: animal.farmId });
        return res.json({ animal: serializeAnimal(updated) });
    } catch (error) {
        if (error?.code === 'P2002') return res.status(409).json({ message: 'A nova identificação provisória já existe.' });
        console.error(error);
        return res.status(500).json({ message: 'Erro ao alterar matriz responsável.' });
    }
});

// ── Entrada de lote: cria múltiplos animais de uma só vez ─────────────────────
app.post('/animals/batch', requireAuth, async (req, res) => {
    const { farmId, paddockId, lotId, dataCompra, valorPorCabeca, fornecedor, condicaoPagamento, vencimento, parcelas, animals } = req.body || {};

    if (!farmId || !paddockId || !Array.isArray(animals) || animals.length === 0) {
        return res.status(400).json({ message: 'farmId, paddockId e animais são obrigatórios.' });
    }

    const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: farmId }) });
    if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

    const paddock = await prisma.paddock.findFirst({ where: { id: paddockId, farmId } });
    if (!paddock) return res.status(400).json({ message: 'Pasto inválido.' });

    let validLotId = null;
    if (lotId) {
        const lot = await prisma.lot.findFirst({ where: { id: lotId, farmId } });
        if (!lot) return res.status(400).json({ message: 'Lote inválido.' });
        validLotId = lotId;
    }

    const compraDate = dataCompra ? parseDateValue(dataCompra) : new Date();
    const parsedValor = valorPorCabeca ? parseNumber(valorPorCabeca) : null;
    const supplier = String(fornecedor || '').trim();
    const catMap = HERD_EVENT_CATEGORY_MAP['COMPRA'];
    if (!compraDate || !supplier || parsedValor === null || parsedValor <= 0) {
        return res.status(400).json({ message: 'Informe fornecedor, data e valor por cabeça válidos.' });
    }

    const normalizedAnimals = animals.map((animal, index) => ({
        line: index + 1,
        invalidField: Object.prototype.hasOwnProperty.call(animal || {}, 'pesoAtual'),
        brinco: String(animal?.brinco || '').trim(),
        nome: String(animal?.nome || '').trim(),
        registro: String(animal?.registro || '').trim(),
        raca: String(animal?.raca || '').trim(),
        sexo: normalizeSexo(animal?.sexo),
        peso: animal?.ultimoPeso === undefined || animal?.ultimoPeso === '' ? null : parseNumber(animal.ultimoPeso),
    }));
    const invalidAnimal = normalizedAnimals.find((animal) => animal.invalidField || !animal.brinco || !animal.raca || !animal.sexo || (animal.peso !== null && animal.peso <= 0));
    if (invalidAnimal) {
        return res.status(400).json({ message: `Linha ${invalidAnimal.line}: preencha brinco, raça, sexo e peso com valores válidos.` });
    }

    // Valida brincos duplicados no banco
    const brincos = normalizedAnimals.map((animal) => animal.brinco);
    if (new Set(brincos).size !== brincos.length) {
        return res.status(400).json({ message: 'Há brincos duplicados na lista.' });
    }
    if (brincos.length !== animals.length) {
        return res.status(400).json({ message: 'Todos os animais devem ter brinco informado.' });
    }

    // Não pode repetir nem nesta fazenda, nem em nenhuma outra da mesma organização.
    const identityKeys = normalizedAnimals.map((animal) => normalizeAnimalIdentityKey(animal.brinco));
    const duplicates = await findDuplicateIdentitiesInOrganization(prisma, req, { identityKeys });
    if (duplicates.length) {
        const primeiro = duplicates[0];
        const ondeMsg = primeiro.farmId === farmId ? 'nesta fazenda' : `na fazenda "${primeiro.farmName || 'outra fazenda'}"`;
        return res.status(409).json({ message: `Identificação já cadastrada ${ondeMsg}: ${primeiro.brinco}` });
    }

    let paymentSchedule;
    try {
        paymentSchedule = buildPurchasePaymentSchedule({
            amount: parsedValor * normalizedAnimals.length,
            condition: condicaoPagamento,
            purchaseDate: compraDate,
            dueDate: vencimento,
            installments: parcelas,
        });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            const results = [];
            const purchaseEvents = [];
            for (const item of normalizedAnimals) {
                const animal = await tx.animal.create({
                    data: {
                        farmId,
                        lotId: validLotId,
                        brinco: item.brinco,
                        identityKey: normalizeAnimalIdentityKey(item.brinco),
                        nome: item.nome || null,
                        registro: item.registro || null,
                        raca: item.raca,
                        sexo: item.sexo,
                        dataNascimento: null,
                        pesoAtual: item.peso,
                        gmd: null,
                        gmd30: null,
                        currentPaddockId: paddockId,
                    },
                });

                if (item.peso) {
                    await tx.weighing.create({
                        data: {
                            animalId: animal.id,
                            data: compraDate,
                            peso: item.peso,
                            gmd: 0,
                        },
                    });
                }

                await tx.paddockMove.create({
                    data: { farmId, paddockId, animalId: animal.id, startAt: compraDate },
                });

                const herdEvent = await tx.herdEvent.create({
                    data: {
                        farmId,
                        animalId: animal.id,
                        type: 'COMPRA',
                        date: compraDate,
                        peso: item.peso,
                        valor: parsedValor,
                        observacoes: `Compra de ${supplier} — brinco ${item.brinco}`,
                        purchasePurpose: 'PRODUCTION',
                    },
                });
                purchaseEvents.push(herdEvent);
                results.push(animal);
            }
            for (const installment of paymentSchedule) {
                await createIntegratedTransaction(tx, {
                    farmId,
                    type: catMap.type,
                    categoria: catMap.categoria,
                    accountCategoryId: 'sys-compra-animais-producao',
                    amount: installment.amount,
                    competenceDate: compraDate,
                    settledAt: installment.settledAt,
                    status: installment.status,
                    dueDate: installment.dueDate,
                    description: `Compra de ${results.length} animal(is) — ${supplier}${installment.installments > 1 ? ` — parcela ${installment.installment}/${installment.installments}` : ''}`,
                    herdEventId: purchaseEvents[0]?.id || null,
                    allocations: [{ lotId: validLotId, paddockId }],
                });
            }
            return results;
        });

        await logActivity(prisma, req, { action: 'LOTE_CRIADO', entity: 'Animal', description: `Cadastrou lote de ${created.length} animal(is)`, farmId });
        return res.status(201).json({ count: created.length, message: `${created.length} animal(is) cadastrado(s) com sucesso.` });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Um ou mais brincos já estão cadastrados nesta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar lote de animais.' });
    }
});

// ── Ações em massa ────────────────────────────────────────────────────────────

app.post('/animals/bulk-delete', requireAuth, async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos um animal.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        // Verifica que todos pertencem ao tenant
        const animals = await prisma.animal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true, farmId: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais não pertencem a esta conta.' });
        }
        if (new Set(animals.map((animal) => animal.farmId)).size !== 1) {
            return res.status(400).json({ message: 'Selecione animais de apenas uma fazenda.' });
        }
        await prisma.animal.deleteMany({ where: { id: { in: ids.map(String) } } });
        return res.json({ deleted: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir animais.' });
    }
});

app.post('/animals/bulk-move-lot', requireAuth, async (req, res) => {
    const { ids, lotId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos um animal.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.animal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true, farmId: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais não pertencem a esta conta.' });
        }
        if (new Set(animals.map((animal) => animal.farmId)).size !== 1) {
            return res.status(400).json({ message: 'Selecione animais de apenas uma fazenda.' });
        }
        if (lotId) {
            const farmId = animals[0].farmId;
            const lot = await prisma.lot.findFirst({ where: { id: String(lotId), farmId } });
            if (!lot) return res.status(404).json({ message: 'Lote não encontrado.' });
        }
        await prisma.animal.updateMany({
            where: { id: { in: ids.map(String) } },
            data: { lotId: lotId ? String(lotId) : null },
        });
        return res.json({ updated: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao mover animais para lote.' });
    }
});

app.post('/animals/bulk-move-pasto', requireAuth, async (req, res) => {
    const { ids, pastoId, startAt, notes } = req.body || {};
    try {
        const { error, result } = await moveAnimalsBetweenPaddocks({
            ids,
            paddockId: pastoId,
            startAt,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: false,
        });
        if (error) return res.status(error.status).json({ message: error.message });
        return res.json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao mover animais para pasto.' });
    }
});

app.post('/animals/bulk-weighings', requireAuth, async (req, res) => {
    const { farmId, animalIds, animalCount, data, totalWeightKg, weighingSessionId } = req.body || {};
    try {
        const { error, result } = await createBulkWeighings({
            ids: animalIds,
            farmId,
            animalCount,
            date: data,
            totalWeightKg,
            weighingSessionId,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: false,
        });
        if (error) return res.status(error.status).json({ message: error.message });
        await logActivity(prisma, req, {
            action: 'PESAGEM_LOTE_REGISTRADA',
            entity: 'Weighing',
            entityId: null,
            description: `Registrou pesagem em grupo de ${result.created} animal(is) — média ${result.averageWeightKg} kg`,
            farmId: String(farmId),
        });
        return res.status(201).json(result);
    } catch (error) {
        if (error?.code === 'P2002') return res.status(409).json({ message: 'Já existe pesagem nesta data para um ou mais animais.' });
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar pesagem em grupo.' });
    }
});

app.post('/animals/bulk-transfer-farm', requireAuth, async (req, res) => {
    const { ids, targetFarmId, targetPaddockId, transferDate, notes } = req.body || {};
    try {
        const { error, result } = await transferAnimalsToFarm({
            ids,
            targetFarmId,
            targetPaddockId,
            transferDate,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            farmScopeFilter: buildFarmScopeFilter(req, { id: String(targetFarmId || '') }),
            isPo: false,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        return res.json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao transferir animais para outra fazenda.' });
    }
});
app.get('/animals/:id/repro-kpis', async (req, res) => {
    const { id } = req.params;
    const { seasonId } = req.query || {};
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        if (animal.sexo !== 'FEMEA') {
            return res.status(400).json({ message: 'KPIs reprodutivos disponíveis apenas para fêmeas.' });
        }

        let validSeasonId = null;
        if (seasonId) {
            const season = await prisma.breedingSeason.findFirst({
                where: { id: String(seasonId), farmId: animal.farmId, farm: buildFarmRelationFilter(req) },
            });
            if (!season) {
                return res.status(404).json({ message: 'Estação não encontrada.' });
            }
            validSeasonId = String(seasonId);
        }

        const kpis = await calculateReproKpis({
            animalId: animal.id,
            farmId: animal.farmId,
            seasonId: validSeasonId,
        });

        return res.json({
            kpis: {
                iepDays: kpis.iepDays,
                openDays: kpis.openDays,
                pregRate: kpis.pregRate,
                emptyAlerts: kpis.emptyAlerts,
                lastCalvingDate: kpis.lastCalvingDate ? kpis.lastCalvingDate.toISOString() : null,
                lastPregCheck: kpis.lastPregCheck ? kpis.lastPregCheck.toISOString() : null,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao calcular KPIs reprodutivos.' });
    }
});

app.get('/animals/:id/pesagens', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }

        const pesagens = await prisma.weighing.findMany({
            where: { animalId: id },
            orderBy: { data: 'desc' },
        });
        return res.json({
            pesagens: pesagens.map((pesagem) => ({
                id: pesagem.id,
                data: pesagem.data.toISOString(),
                peso: pesagem.peso,
                gmd: pesagem.gmd,
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar pesagens.' });
    }
});

app.post('/animals/:id/pesagens', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { data, peso, forceReplace } = req.body || {};
    const weighingSessionId = req.body?.weighingSessionId ?? null;

    const weighingDate = parseDateValue(data);
    if (!weighingDate) {
        return res.status(400).json({ message: 'Data da pesagem inválida.' });
    }

    const parsedPeso = parseNumber(peso);
    if (parsedPeso === null || parsedPeso <= 0) {
        return res.status(400).json({ message: 'Peso da pesagem inválido.' });
    }

    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }

        let validWeighingSessionId = null;
        if (weighingSessionId) {
            const session = await prisma.weighingSession.findFirst({
                where: {
                    id: String(weighingSessionId),
                    farmId: animal.farmId,
                    farm: buildFarmRelationFilter(req),
                },
            });
            if (!session) {
                return res.status(404).json({ message: 'Sessão de pesagem não encontrada.' });
            }
            validWeighingSessionId = session.id;
        }

        const pesagem = await prisma.$transaction(async (tx) => {
            if (forceReplace === true) {
                await tx.weighing.deleteMany({
                    where: { animalId: id, data: weighingDate },
                });
            }

            const previousWeighing = await tx.weighing.findFirst({
                where: { animalId: id, data: { lt: weighingDate } },
                orderBy: { data: 'desc' },
            });

            let gmdValue = 0;
            if (previousWeighing) {
                const diffDaysValue = diffDaysFloat(weighingDate, previousWeighing.data);
                if (diffDaysValue > 0) {
                    gmdValue = (parsedPeso - previousWeighing.peso) / diffDaysValue;
                }
            }

            const createdWeighing = await tx.weighing.create({
                data: {
                    animalId: id,
                    data: weighingDate,
                    peso: parsedPeso,
                    gmd: gmdValue,
                    ...(validWeighingSessionId ? { weighingSessionId: validWeighingSessionId } : {}),
                },
            });

            const allWeighings = await tx.weighing.findMany({
                where: { animalId: id },
                orderBy: { data: 'asc' },
            });

            const metrics = calculateGmdMetrics(
                allWeighings.map((row) => ({ date: row.data, weight: row.peso })),
            );
            const latest = allWeighings[allWeighings.length - 1];

            await tx.animal.update({
                where: { id: animal.id },
                data: {
                    pesoAtual: latest?.peso ?? parsedPeso,
                    gmd: metrics.gmdLast,
                    gmd30: metrics.gmd30,
                },
            });

            return createdWeighing;
        });

        await logActivity(prisma, req, {
            action: 'PESAGEM_REGISTRADA',
            entity: 'Weighing',
            entityId: pesagem.id,
            description: `Registrou pesagem de ${parsedPeso} kg do animal ${animal.brinco || id}`,
            farmId: animal.farmId,
        });

        return res.status(201).json({
            pesagem: {
                id: pesagem.id,
                data: pesagem.data.toISOString(),
                peso: pesagem.peso,
                gmd: pesagem.gmd,
                weighingSessionId: pesagem.weighingSessionId,
            },
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe pesagem cadastrada nesta data.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar pesagem.' });
    }
});

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
app.get('/animals/:id/paddock-moves', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }

        const moves = await prisma.paddockMove.findMany({
            where: { animalId: id },
            include: { paddock: true },
            orderBy: { startAt: 'desc' },
        });

        const items = moves.map(serializePaddockMove);
        return res.json({ moves: items, items, total: items.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar movimentações de pasto.' });
    }
});

app.post('/animals/:id/paddock-moves', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { paddockId, startAt, notes } = req.body || {};

    try {
        if (!paddockId) {
            return res.status(400).json({ message: 'Pasto obrigatório para movimentação.' });
        }
        const { error, result } = await moveAnimalBetweenPaddocks({
            animalId: id,
            paddockId,
            startAt,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: false,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        const payload = serializePaddockMove(result.move);
        return res.status(201).json({
            move: { ...payload, fromPaddockId: result.fromPaddockId, toPaddockId: result.toPaddockId },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar animal entre pastos.' });
    }
});

app.get('/po/animals/:id/paddock-moves', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const moves = await prisma.paddockMove.findMany({
            where: { poAnimalId: id },
            include: { paddock: true },
            orderBy: { startAt: 'desc' },
        });

        const items = moves.map(serializePaddockMove);
        return res.json({ moves: items, items, total: items.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar movimentações de pasto.' });
    }
});

app.post('/po/animals/:id/paddock-moves', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { paddockId, startAt, notes } = req.body || {};

    try {
        if (!paddockId) {
            return res.status(400).json({ message: 'Pasto obrigatório para movimentação.' });
        }
        const { error, result } = await moveAnimalBetweenPaddocks({
            animalId: id,
            paddockId,
            startAt,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: true,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        const payload = serializePaddockMove(result.move);
        return res.status(201).json({
            move: { ...payload, fromPaddockId: result.fromPaddockId, toPaddockId: result.toPaddockId },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar animal entre pastos.' });
    }
});

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
            isPo: false,
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
}
