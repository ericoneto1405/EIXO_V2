import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { registerNutritionModuleRoutes } from './nutritionModule.js';
import { GoogleGenerativeAI } from '@google/generative-ai'; // Added for Gemini AI

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'session';
const SESSION_TOKEN_SALT = process.env.SESSION_TOKEN_SALT || 'dev-session-salt';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 24 * 60 * 60 * 1000;
const SESSION_REMEMBER_TTL_MS = Number(process.env.SESSION_REMEMBER_TTL_MS) || 30 * 24 * 60 * 60 * 1000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const ALLOW_X_USER_ID = process.env.ALLOW_X_USER_ID === 'true';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@eixo.com';

function sanitizeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
}

const prisma = new PrismaClient();

const parseCoordinate = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string' && value.trim() === '') {
        return null;
    }
    const normalizedValue = typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const parsed = Number(normalizedValue);
    return Number.isFinite(parsed) ? parsed : null;
};

const validateCoordinatePair = (lat, lng) => {
    if ((lat === null) !== (lng === null)) {
        return 'Informe latitude e longitude juntas.';
    }
    if (lat !== null && (lat < -90 || lat > 90)) {
        return 'Latitude inválida. Use um valor entre -90 e 90.';
    }
    if (lng !== null && (lng < -180 || lng > 180)) {
        return 'Longitude inválida. Use um valor entre -180 e 180.';
    }
    return null;
};

const findFarmByCoordinates = async ({ lat, lng, excludeFarmId = null }) => {
    if (lat === null || lng === null) {
        return null;
    }
    return prisma.farm.findFirst({
        where: {
            lat,
            lng,
            ...(excludeFarmId ? { NOT: { id: excludeFarmId } } : {}),
        },
        select: {
            id: true,
            name: true,
            city: true,
        },
    });
};

const parseNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseDateValue = (value) => {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeSexo = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'macho') {
        return 'MACHO';
    }
    if (normalized === 'femea' || normalized === 'fêmea') {
        return 'FEMEA';
    }
    return null;
};

const formatSexoLabel = (sexo) => (sexo === 'FEMEA' ? 'Fêmea' : 'Macho');

const normalizeReproMode = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized === 'CONTINUO' || normalized === 'ESTACAO' ? normalized : null;
};

const normalizeReproEventType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    const validTypes = ['COBERTURA', 'IATF', 'DIAGNOSTICO_PRENHEZ', 'PARTO', 'DESMAME'];
    return validTypes.includes(normalized) ? normalized : null;
};

const normalizePregStatus = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized === 'PRENHE' || normalized === 'VACIA' ? normalized : null;
};

const normalizeEmbryoTechnique = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized === 'FIV' || normalized === 'TE' ? normalized : null;
};

const normalizeSemenMoveType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['IN', 'OUT', 'USE', 'ADJUST'].includes(normalized) ? normalized : null;
};

const normalizeEmbryoMoveType = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['IN', 'OUT', 'TRANSFER', 'ADJUST'].includes(normalized) ? normalized : null;
};

const parseInteger = (value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
};

const REPRO_WINDOW_DAYS = 120;
const DEFAULT_THRESHOLDS = {
    openDays: {
        greenMax: 120,
        yellowMax: 180,
        critical: 240,
    },
    iepDays: {
        greenMax: 430,
        yellowMax: 480,
        critical: 540,
    },
};

const normalizeSelectionDecision = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['KEEP', 'WATCH', 'DISCARD'].includes(normalized) ? normalized : null;
};

const serializeAnimal = (animal) => ({
    id: animal.id,
    brinco: animal.brinco,
    raca: animal.raca,
    sexo: formatSexoLabel(animal.sexo),
    dataNascimento: animal.dataNascimento.toISOString(),
    pesoAtual: animal.pesoAtual,
    gmd: animal.gmd ?? null,
    gmdLast: animal.gmd ?? null,
    gmd30: animal.gmd30 ?? null,
    farmId: animal.farmId,
    lotId: animal.lotId,
    currentPaddockId: animal.currentPaddockId,
    currentPaddockName: animal.currentPaddock?.name || null,
    nutritionPlan: animal.currentNutritionPlan || null,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString(),
});

const serializeSeason = (season) => ({
    id: season.id,
    farmId: season.farmId,
    name: season.name,
    startAt: season.startAt.toISOString(),
    endAt: season.endAt.toISOString(),
    createdAt: season.createdAt.toISOString(),
    updatedAt: season.updatedAt.toISOString(),
});

const serializeReproEvent = (event) => ({
    id: event.id,
    farmId: event.farmId,
    animalId: event.animalId,
    type: event.type,
    date: event.date.toISOString(),
    seasonId: event.seasonId,
    payload: event.payload || null,
    notes: event.notes || null,
    bullId: event.bullId || null,
    protocol: event.protocol || null,
    createdAt: event.createdAt.toISOString(),
});

const serializePoAnimal = (animal) => ({
    id: animal.id,
    farmId: animal.farmId,
    brinco: animal.brinco,
    nome: animal.nome,
    raca: animal.raca,
    sexo: animal.sexo,
    dataNascimento: animal.dataNascimento ? animal.dataNascimento.toISOString() : null,
    pesoAtual: animal.pesoAtual ?? 0,
    gmd: animal.gmd ?? null,
    gmdLast: animal.gmd ?? null,
    gmd30: animal.gmd30 ?? null,
    lotId: animal.lotId || null,
    currentPaddockId: animal.currentPaddockId,
    currentPaddockName: animal.currentPaddock?.name || null,
    nutritionPlan: animal.currentNutritionPlan || null,
    registro: animal.registro,
    categoria: animal.categoria,
    observacoes: animal.observacoes,
    createdAt: animal.createdAt.toISOString(),
    updatedAt: animal.updatedAt.toISOString(),
});

const serializePaddockMove = (move) => ({
    id: move.id,
    farmId: move.farmId,
    paddockId: move.paddockId,
    paddockName: move.paddock?.name || null,
    animalId: move.animalId || null,
    poAnimalId: move.poAnimalId || null,
    startAt: move.startAt.toISOString(),
    endAt: move.endAt ? move.endAt.toISOString() : null,
    notes: move.notes || null,
    createdAt: move.createdAt.toISOString(),
});

const serializeSemenBatch = (batch) => ({
    id: batch.id,
    farmId: batch.farmId,
    bullPoAnimalId: batch.bullPoAnimalId,
    bullName: batch.bullName,
    bullRegistry: batch.bullRegistry,
    fornecedor: batch.fornecedor,
    lote: batch.lote,
    dataColeta: batch.dataColeta ? batch.dataColeta.toISOString() : null,
    dosesTotal: batch.dosesTotal,
    dosesDisponiveis: batch.dosesDisponiveis,
    localArmazenamento: batch.localArmazenamento,
    observacoes: batch.observacoes,
    bullPoAnimal: batch.bullPoAnimal
        ? {
              id: batch.bullPoAnimal.id,
              brinco: batch.bullPoAnimal.brinco,
              nome: batch.bullPoAnimal.nome,
              registro: batch.bullPoAnimal.registro,
          }
        : null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
});

const serializeNutritionPlan = (plan) => ({
    id: plan.id,
    farmId: plan.farmId,
    nome: plan.nome,
    fase: plan.fase,
    startAt: plan.startAt.toISOString(),
    endAt: plan.endAt ? plan.endAt.toISOString() : null,
    metaGmd: plan.metaGmd,
    observacoes: plan.observacoes,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
});

const serializeNutritionAssignment = (assignment) => ({
    id: assignment.id,
    farmId: assignment.farmId,
    planId: assignment.planId,
    lotId: assignment.lotId,
    poLotId: assignment.poLotId,
    animalId: assignment.animalId,
    poAnimalId: assignment.poAnimalId,
    startAt: assignment.startAt.toISOString(),
    endAt: assignment.endAt ? assignment.endAt.toISOString() : null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
});

const serializeEmbryoBatch = (batch) => ({
    id: batch.id,
    farmId: batch.farmId,
    donorPoAnimalId: batch.donorPoAnimalId,
    donorName: batch.donorName,
    donorRegistry: batch.donorRegistry,
    sirePoAnimalId: batch.sirePoAnimalId,
    sireName: batch.sireName,
    sireRegistry: batch.sireRegistry,
    tecnica: batch.tecnica,
    estagio: batch.estagio,
    qualidade: batch.qualidade,
    lote: batch.lote,
    quantidadeTotal: batch.quantidadeTotal,
    quantidadeDisponivel: batch.quantidadeDisponivel,
    localArmazenamento: batch.localArmazenamento,
    observacoes: batch.observacoes,
    donorPoAnimal: batch.donorPoAnimal
        ? {
              id: batch.donorPoAnimal.id,
              brinco: batch.donorPoAnimal.brinco,
              nome: batch.donorPoAnimal.nome,
              registro: batch.donorPoAnimal.registro,
          }
        : null,
    sirePoAnimal: batch.sirePoAnimal
        ? {
              id: batch.sirePoAnimal.id,
              brinco: batch.sirePoAnimal.brinco,
              nome: batch.sirePoAnimal.nome,
              registro: batch.sirePoAnimal.registro,
          }
        : null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
});

const serializePaddock = (paddock) => ({
    id: paddock.id,
    farmId: paddock.farmId,
    name: paddock.name,
    areaHa: paddock.areaHa ?? null,
    divisionType: paddock.divisionType ?? null,
    capacity: paddock.capacity ?? null,
    lat: paddock.lat ?? null,
    lng: paddock.lng ?? null,
    mapGeometry: paddock.mapGeometry ?? null,
    active: paddock.active ?? true,
    createdAt: paddock.createdAt?.toISOString?.() ?? null,
    updatedAt: paddock.updatedAt?.toISOString?.() ?? null,
});

const diffDays = (later, earlier) => {
    const diffMs = later.getTime() - earlier.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

const diffDaysFloat = (later, earlier) => {
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

const calculateGmdMetrics = (weighings) => {
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

const moveAnimalBetweenPaddocks = async ({ animalId, paddockId, startAt, notes, scopeFilter, isPo }) => {
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

const serializeAuthUser = (user, saasContext = null) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    modules: user.modules,
    roles: user.roles,
    lastFarmId: user.lastFarmId,
    organizationId: saasContext?.organizationId || null,
    membershipRole: saasContext?.membershipRole || null,
    billingAccessState: saasContext?.billingAccessState || null,
    entitlements: saasContext?.entitlements || [],
    organization: saasContext?.organization || null,
});

const app = express();
app.set('trust proxy', 1);
const corsOrigins = CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const devOriginRegex = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }
            if (corsOrigins.includes(origin)) {
                return callback(null, true);
            }
            if (!IS_PROD && devOriginRegex.test(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    }),
);
app.use(express.json());
app.use(cookieParser());

let activePort = Number(PORT) || 3001;
app.get('/health', (req, res) => {
    res.set('X-Server-Port', String(activePort));
    return res.json({ ok: true, port: activePort });
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

const allowXUserId = !IS_PROD && ALLOW_X_USER_ID;
const BILLING_BLOCKED_STATES = new Set(['PAST_DUE', 'BLOCKED', 'CANCELED']);

const buildLegacyEntitlements = (modules) => {
    const normalized = new Set((modules || []).map((item) => String(item || '').trim()));
    const codes = ['CORE'];
    if (normalized.has('Rebanho Genética')) {
        codes.push('GENETICS');
    }
    if (normalized.has('Rebanho P.O.')) {
        codes.push('PO');
    }
    if (normalized.has('Rações') || normalized.has('Suplementos')) {
        codes.push('NUTRITION');
    }
    return [...new Set(codes)];
};

const normalizeOrganizationSlug = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'org';

const buildFarmScopeFilter = (req, extra = {}) => ({
    ...(req.saas?.organizationId ? { organizationId: req.saas.organizationId } : { userId: req.user.id }),
    ...extra,
});

const buildFarmRelationFilter = (req, extra = {}) => ({
    ...(req.saas?.organizationId ? { organizationId: req.saas.organizationId } : { userId: req.user.id }),
    ...extra,
});

const ensureSaasContextForUser = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            activeOrganization: true,
            memberships: {
                include: { organization: true },
                orderBy: { createdAt: 'asc' },
            },
        },
    });

    if (!user) {
        return null;
    }

    let activeOrganization = user.activeOrganization || null;
    let membership = activeOrganization
        ? user.memberships.find((item) => item.organizationId === activeOrganization.id) || null
        : null;

    if (!activeOrganization && user.memberships.length) {
        membership = user.memberships[0];
        activeOrganization = membership.organization;
        await prisma.user.update({
            where: { id: user.id },
            data: { activeOrganizationId: activeOrganization.id },
        });
    }

    if (!activeOrganization) {
        const slugBase = normalizeOrganizationSlug((user.name || user.email) + '-org');
        activeOrganization = await prisma.organization.create({
            data: {
                name: (user.name || 'Conta') + ' - Organização',
                slug: slugBase + '-' + user.id.slice(0, 8),
                billingProvider: 'INTERNAL',
                accessState: 'ACTIVE',
            },
        });
        membership = await prisma.organizationMembership.create({
            data: {
                organizationId: activeOrganization.id,
                userId: user.id,
                role: 'OWNER',
            },
        });
        await prisma.user.update({
            where: { id: user.id },
            data: { activeOrganizationId: activeOrganization.id },
        });
    }

    await prisma.farm.updateMany({
        where: {
            userId: user.id,
            organizationId: null,
        },
        data: { organizationId: activeOrganization.id },
    });

    const entitlementCodes = buildLegacyEntitlements(user.modules);
    if (entitlementCodes.length) {
        const products = await prisma.product.findMany({
            where: { code: { in: entitlementCodes } },
            select: { id: true },
        });
        for (const product of products) {
            await prisma.organizationProductEntitlement.upsert({
                where: {
                    organizationId_productId: {
                        organizationId: activeOrganization.id,
                        productId: product.id,
                    },
                },
                update: {
                    status: 'ACTIVE',
                    endedAt: null,
                },
                create: {
                    organizationId: activeOrganization.id,
                    productId: product.id,
                    status: 'ACTIVE',
                },
            });
        }
    }

    const entitlements = await prisma.organizationProductEntitlement.findMany({
        where: {
            organizationId: activeOrganization.id,
            status: 'ACTIVE',
        },
        include: { product: true },
    });

    return {
        organizationId: activeOrganization.id,
        membershipRole: membership?.role || null,
        billingAccessState: activeOrganization.accessState,
        entitlements: entitlements.map((item) => item.product.code),
        organization: {
            id: activeOrganization.id,
            name: activeOrganization.name,
            slug: activeOrganization.slug,
            accessState: activeOrganization.accessState,
        },
    };
};

const requireBillingAccess = (req, res, next) => {
    const accessState = req.saas?.billingAccessState || null;
    if (!accessState || !BILLING_BLOCKED_STATES.has(accessState)) {
        return next();
    }
    return res.status(402).json({
        code: 'billing_blocked',
        message: 'Acesso bloqueado por assinatura.',
        accessState,
    });
};

const resolveFarmForRequest = async (req, farmId) =>
    prisma.farm.findFirst({
        where: buildFarmScopeFilter(req, { id: String(farmId) }),
    });

const serializeAuthUserWithContext = async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return null;
    }
    const saasContext = await ensureSaasContextForUser(userId);
    return serializeAuthUser(user, saasContext);
};

const hashSessionToken = (token) =>
    crypto
        .createHash('sha256')
        .update(token)
        .update(SESSION_TOKEN_SALT)
        .digest('hex');

const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

const buildCookieOptions = (expiresAt) => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    expires: expiresAt,
    path: '/',
});

const isRateLimited = (key) => {
    const entry = loginAttempts.get(key);
    if (!entry) {
        return false;
    }
    if (Date.now() - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(key);
        return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
};

const registerFailedLogin = (key) => {
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
        loginAttempts.set(key, { count: 1, firstAttemptAt: now });
        return;
    }
    entry.count += 1;
    loginAttempts.set(key, entry);
};

const clearLoginAttempts = (key) => {
    loginAttempts.delete(key);
};

const getSessionFromRequest = async (req) => {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!sessionToken) {
        return null;
    }
    const tokenHash = hashSessionToken(sessionToken);
    return prisma.session.findFirst({
        where: {
            tokenHash,
            revokedAt: null,
            expiresAt: { gt: new Date() },
        },
        include: { user: true },
    });
};

const requireAuth = async (req, res, next) => {
    try {
        const session = await getSessionFromRequest(req);
        if (session?.user) {
            req.user = session.user;
            req.session = session;
            req.saas = await ensureSaasContextForUser(session.user.id);
            return next();
        }

        if (allowXUserId) {
            const userId = req.header('x-user-id');
            if (!userId) {
                return res.status(401).json({ message: 'Usuário não autenticado.' });
            }
            if (!UUID_REGEX.test(userId)) {
                return res.status(401).json({ message: 'Identificador de usuário inválido.' });
            }
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return res.status(401).json({ message: 'Usuário não encontrado.' });
            }
            req.user = user;
            req.saas = await ensureSaasContextForUser(user.id);
            return next();
        }

        return res.status(401).json({ message: 'Usuário não autenticado.' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar usuário.' });
    }
};

// Initialize Google Generative AI
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
    console.warn('GOOGLE_API_KEY is not set. Gemini API will not be available.');
}
const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }) : null;

app.post('/api/chat/send-message', requireAuth, async (req, res) => {
    console.log('Recebida uma requisição para /api/chat/send-message'); // Debug log
    if (!model) {
        return res.status(503).json({ message: 'Assistente de IA não disponível. Chave de API ausente.' });
    }

    const { message, history } = req.body || {};
    if (!message) {
        return res.status(400).json({ message: 'Mensagem vazia.' });
    }

    try {
        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        return res.json({ response: text });
    } catch (error) {
        console.error('Erro ao comunicar com a API do Gemini:', error);
        return res.status(500).json({ message: 'Erro ao processar sua solicitação com o assistente de IA.' });
    }
});

app.use(
    ['/farms', '/lots', '/animals', '/users', '/seasons', '/repro-events', '/genetics', '/po', '/nutrition', '/pastos'],
    requireAuth,
    requireBillingAccess,
);

app.post('/auth/login', async (req, res) => {
    const { email, password, rememberMe } = req.body || {};
    const ipKey = req.ip;

    if (isRateLimited(ipKey)) {
        return res.status(429).json({ message: 'Muitas tentativas. Tente novamente mais tarde.' });
    }

    if (!email || !password) {
        return res.status(400).json({ message: 'Informe e-mail e senha.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            registerFailedLogin(ipKey);
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        let passwordMatches = false;
        if (user.password?.startsWith('$2')) {
            passwordMatches = await bcrypt.compare(password, user.password);
        } else {
            passwordMatches = user.password === password;
            if (passwordMatches) {
                const hashedPassword = await bcrypt.hash(password, 10);
                await prisma.user.update({
                    where: { id: user.id },
                    data: { password: hashedPassword },
                });
            }
        }

        if (!passwordMatches) {
            registerFailedLogin(ipKey);
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        clearLoginAttempts(ipKey);

        const token = generateSessionToken();
        const tokenHash = hashSessionToken(token);
        const shouldRemember = Boolean(rememberMe);
        const ttl = shouldRemember ? SESSION_REMEMBER_TTL_MS : SESSION_TTL_MS;
        const expiresAt = new Date(Date.now() + ttl);

        await prisma.session.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
                userAgent: req.get('user-agent') || null,
                ip: req.ip,
            },
        });

        res.cookie(SESSION_COOKIE_NAME, token, buildCookieOptions(expiresAt));
        return res.json({ user: await serializeAuthUserWithContext(user.id) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao autenticar usuário.' });
    }
});

app.post('/auth/logout', async (req, res) => {
    try {
        const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
        if (sessionToken) {
            const tokenHash = hashSessionToken(sessionToken);
            await prisma.session.updateMany({
                where: { tokenHash, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }
        res.clearCookie(SESSION_COOKIE_NAME, buildCookieOptions(new Date(0)));
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao sair.' });
    }
});

app.get('/auth/me', async (req, res) => {
    try {
        const session = await getSessionFromRequest(req);
        if (!session?.user) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }
        return res.json({ user: await serializeAuthUserWithContext(session.user.id) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar sessão.' });
    }
});

app.get('/users', async (req, res) => {
    try {
        if (req.user?.email !== ADMIN_EMAIL) {
            return res.status(403).json({ message: 'Apenas administradores podem listar usuários.' });
        }
        const users = await prisma.user.findMany();
        res.json({ users: users.map(sanitizeUser) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao listar usuários.' });
    }
});

app.post('/users', async (req, res) => {
    const { name, email, password, modules } = req.body || {};
    if (!name || !email || !password || !Array.isArray(modules)) {
        return res.status(400).json({ message: 'Dados obrigatórios ausentes.' });
    }

    if (modules.length === 0) {
        return res.status(400).json({ message: 'Selecione ao menos um módulo.' });
    }

    try {
        if (req.user?.email !== ADMIN_EMAIL) {
            return res.status(403).json({ message: 'Apenas administradores podem cadastrar usuários.' });
        }

        const emailExists = await prisma.user.findUnique({ where: { email } });
        if (emailExists) {
            return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                modules,
                roles: ['user'],
            },
        });
        return res.status(201).json({ user: sanitizeUser(newUser) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar usuário.' });
    }
});

app.get('/farms', async (req, res) => {
    try {
        const farms = await prisma.farm.findMany({
            where: buildFarmScopeFilter(req),
            include: { paddocks: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'desc' },
        });
        const items = farms.map((farm) => ({
            ...farm,
            responsibleName: farm.responsibleName ?? null,
            paddocks: farm.paddocks.map(serializePaddock),
        }));
        return res.json({ farms: items, items, total: items.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar fazendas.' });
    }
});

app.post('/farms', async (req, res) => {
    const { name, city, lat, lng, size, notes, responsibleName, paddocks } = req.body || {};

    const parsedSize = Number(size);
    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);
    if (!name || !city || Number.isNaN(parsedSize) || parsedSize <= 0) {
        return res.status(400).json({ message: 'Nome, cidade e tamanho da fazenda são obrigatórios.' });
    }
    const coordinateError = validateCoordinatePair(parsedLat, parsedLng);
    if (coordinateError) {
        return res.status(400).json({ message: coordinateError });
    }

    const normalizedPaddocks = Array.isArray(paddocks)
        ? paddocks
              .map((paddock) => {
                  const paddockId = typeof paddock?.id === 'string' ? paddock.id.trim() : '';
                  const paddockName = (paddock?.name || paddock?.nome || '').trim();
                  const areaRaw = paddock?.areaHa ?? paddock?.size ?? paddock?.area;
                  const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === ''
                      ? null
                      : Number(areaRaw);
                  const divisionType = (paddock?.divisionType || paddock?.type || '').trim() || null;
                  const capacityValue = parseNumber(paddock?.capacity);
                  const activeValue = paddock?.active === false ? false : true;
                  if (!paddockName) {
                      return null;
                  }
                  if (areaValue !== null && (Number.isNaN(areaValue) || areaValue <= 0)) {
                      return null;
                  }
                  return {
                      name: paddockName,
                      areaHa: areaValue,
                      divisionType,
                      capacity: capacityValue,
                      active: activeValue,
                  };
              })
              .filter(Boolean)
        : [];

    if (Array.isArray(paddocks) && paddocks.length && normalizedPaddocks.length === 0) {
        return res.status(400).json({ message: 'Pastos devem ter nome e área válidos.' });
    }

    try {
        const existingFarmAtCoordinates = await findFarmByCoordinates({ lat: parsedLat, lng: parsedLng });
        if (existingFarmAtCoordinates) {
            return res.status(409).json({
                message: `Já existe uma fazenda cadastrada nesse local: ${existingFarmAtCoordinates.name} (${existingFarmAtCoordinates.city}).`,
            });
        }

        const newFarm = await prisma.farm.create({
            data: {
                name,
                city,
                lat: parsedLat,
                lng: parsedLng,
                size: parsedSize,
                notes: notes?.trim() || null,
                responsibleName: responsibleName?.trim() || null,
                userId: req.user.id,
                organizationId: req.saas?.organizationId || null,
                paddocks: {
                    create: normalizedPaddocks,
                },
            },
            include: { paddocks: true },
        });
        return res.status(201).json({
            farm: {
                ...newFarm,
                responsibleName: newFarm.responsibleName ?? null,
                paddocks: newFarm.paddocks.map(serializePaddock),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar fazenda.' });
    }
});

app.patch('/farms/:id', async (req, res) => {
    const { id } = req.params;
    const { name, city, lat, lng, size, notes, responsibleName, paddocks } = req.body || {};

    const parsedSize = Number(size);
    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);
    if (!name || !city || Number.isNaN(parsedSize) || parsedSize <= 0) {
        return res.status(400).json({ message: 'Nome, cidade e tamanho da fazenda são obrigatórios.' });
    }
    const coordinateError = validateCoordinatePair(parsedLat, parsedLng);
    if (coordinateError) {
        return res.status(400).json({ message: coordinateError });
    }

    const normalizedPaddocks = Array.isArray(paddocks)
        ? paddocks
              .map((paddock) => {
                  const paddockId = typeof paddock?.id === 'string' ? paddock.id.trim() : '';
                  const paddockName = (paddock?.name || paddock?.nome || '').trim();
                  const areaRaw = paddock?.areaHa ?? paddock?.size ?? paddock?.area;
                  const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === ''
                      ? null
                      : Number(areaRaw);
                  const divisionType = (paddock?.divisionType || paddock?.type || '').trim() || null;
                  if (!paddockName) {
                      return null;
                  }
                  if (areaValue !== null && (Number.isNaN(areaValue) || areaValue <= 0)) {
                      return null;
                  }
                  return {
                      id: paddockId || null,
                      name: paddockName,
                      areaHa: areaValue,
                      divisionType,
                  };
              })
              .filter(Boolean)
        : [];

    if (Array.isArray(paddocks) && paddocks.length && normalizedPaddocks.length === 0) {
        return res.status(400).json({ message: 'Divisões devem ter nome e área válidos.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(id) }),
            include: { paddocks: true },
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const existingFarmAtCoordinates = await findFarmByCoordinates({
            lat: parsedLat,
            lng: parsedLng,
            excludeFarmId: farm.id,
        });
        if (existingFarmAtCoordinates) {
            return res.status(409).json({
                message: `Já existe uma fazenda cadastrada nesse local: ${existingFarmAtCoordinates.name} (${existingFarmAtCoordinates.city}).`,
            });
        }

        const updatedFarm = await prisma.$transaction(async (tx) => {
            const existingPaddocks = await tx.paddock.findMany({
                where: { farmId: farm.id },
                select: { id: true },
            });
            const existingIds = new Set(existingPaddocks.map((item) => item.id));

            for (const division of normalizedPaddocks) {
                if (division.id && existingIds.has(division.id)) {
                    await tx.paddock.update({
                        where: { id: division.id },
                        data: {
                            name: division.name,
                            areaHa: division.areaHa,
                            divisionType: division.divisionType,
                            ...(division.mapGeometry !== undefined ? { mapGeometry: division.mapGeometry } : {}),
                        },
                    });
                    continue;
                }

                await tx.paddock.create({
                    data: {
                        farmId: farm.id,
                        name: division.name,
                        areaHa: division.areaHa,
                        divisionType: division.divisionType,
                        ...(division.mapGeometry !== undefined ? { mapGeometry: division.mapGeometry } : {}),
                        active: true,
                    },
                });
            }

            return tx.farm.update({
                where: { id: farm.id },
                data: {
                    name,
                    city,
                    lat: parsedLat,
                    lng: parsedLng,
                    size: parsedSize,
                    notes: notes?.trim() || null,
                    responsibleName: responsibleName?.trim() || null,
                },
                include: { paddocks: true },
            });
        });

        return res.json({
            farm: {
                ...updatedFarm,
                responsibleName: updatedFarm.responsibleName ?? null,
                paddocks: updatedFarm.paddocks.map(serializePaddock),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar fazenda.' });
    }
});

app.delete('/farms/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(id) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        await prisma.farm.delete({
            where: { id: farm.id },
        });

        return res.json({ success: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir fazenda.' });
    }
});

app.get('/farms/:id/map-summary', async (req, res) => {
    const { id } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(id) }),
            include: { paddocks: { orderBy: { createdAt: 'asc' } } },
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const paddockIds = farm.paddocks.map((p) => p.id);

        const [commercialGroups, poGroups] = await Promise.all([
            prisma.animal.groupBy({
                by: ['currentPaddockId'],
                where: { farmId: farm.id, currentPaddockId: { in: paddockIds } },
                _count: { id: true },
                _sum: { pesoAtual: true },
            }),
            prisma.poAnimal.groupBy({
                by: ['currentPaddockId'],
                where: { farmId: farm.id, currentPaddockId: { in: paddockIds } },
                _count: { id: true },
                _sum: { pesoAtual: true },
            }),
        ]);

        const commercialMap = new Map(commercialGroups.map((g) => [g.currentPaddockId, g]));
        const poMap = new Map(poGroups.map((g) => [g.currentPaddockId, g]));

        const summary = farm.paddocks.map((paddock) => {
            const commercial = commercialMap.get(paddock.id);
            const po = poMap.get(paddock.id);
            const animalCount = commercial?._count?.id ?? 0;
            const poAnimalCount = po?._count?.id ?? 0;
            const totalWeightKg = (commercial?._sum?.pesoAtual ?? 0) + (po?._sum?.pesoAtual ?? 0);
            const areaHa = paddock.areaHa ?? 0;
            const uaTotal = totalWeightKg / 450;
            const lotacao = areaHa > 0 ? uaTotal / areaHa : null;
            return {
                paddockId: paddock.id,
                paddockName: paddock.name,
                areaHa,
                divisionType: paddock.divisionType ?? null,
                animalCount,
                poAnimalCount,
                totalAnimals: animalCount + poAnimalCount,
                totalWeightKg,
                lotacaoUaHa: lotacao !== null ? Math.round(lotacao * 100) / 100 : null,
            };
        });

        return res.json({ summary });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar resumo do mapa.' });
    }
});

app.get('/pastos', async (req, res) => {
    const { farmId, includeInactive } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar pastos.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const pastos = await prisma.paddock.findMany({
            where: {
                farmId: farm.id,
                ...(includeInactive === 'true' ? {} : { active: true }),
            },
            orderBy: { createdAt: 'asc' },
        });
        return res.json({ items: pastos.map(serializePaddock), total: pastos.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar pastos.' });
    }
});

app.post('/pastos', async (req, res) => {
    const { farmId, nome, name, areaHa, size, capacity, ativo, active, divisionType, type } = req.body || {};
    const paddockName = (nome || name || '').trim();
    if (!farmId || !paddockName) {
        return res.status(400).json({ message: 'Informe fazenda e nome do pasto.' });
    }
    const areaRaw = areaHa ?? size;
    const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === '' ? null : Number(areaRaw);
    if (areaValue !== null && (Number.isNaN(areaValue) || areaValue <= 0)) {
        return res.status(400).json({ message: 'Área do pasto inválida.' });
    }
    const capacityValue = capacity === undefined || capacity === null || capacity === '' ? null : parseNumber(capacity);
    if (capacity !== undefined && capacity !== null && capacity !== '' && (capacityValue === null || capacityValue <= 0)) {
        return res.status(400).json({ message: 'Capacidade do pasto inválida.' });
    }
    const activeValue = ativo === false || active === false ? false : true;
    const normalizedDivisionType = (divisionType || type || '').trim() || null;
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const existing = await prisma.paddock.findFirst({
            where: { farmId: farm.id, name: paddockName },
        });
        if (existing) {
            return res.status(409).json({ message: 'Já existe um pasto com esse nome nesta fazenda.' });
        }
        const paddock = await prisma.paddock.create({
            data: {
                farmId: farm.id,
                name: paddockName,
                areaHa: areaValue,
                divisionType: normalizedDivisionType,
                capacity: capacityValue,
                active: activeValue,
            },
        });
        return res.status(201).json({ item: serializePaddock(paddock) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar pasto.' });
    }
});

app.patch('/pastos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, name, areaHa, size, capacity, ativo, active, divisionType, type } = req.body || {};
    const paddockName = typeof nome === 'string' || typeof name === 'string' ? (nome || name).trim() : null;
    const areaRaw = areaHa ?? size;
    const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === '' ? undefined : Number(areaRaw);
    const capacityValue = capacity === undefined || capacity === null || capacity === '' ? undefined : parseNumber(capacity);
    const activeValue = ativo === undefined && active === undefined ? undefined : !(ativo === false || active === false);
    const normalizedDivisionType =
        divisionType === undefined && type === undefined
            ? undefined
            : ((divisionType || type || '').trim() || null);
    if (areaValue !== undefined && (Number.isNaN(areaValue) || areaValue <= 0)) {
        return res.status(400).json({ message: 'Área do pasto inválida.' });
    }
    if (capacityValue !== undefined && (capacityValue === null || capacityValue <= 0)) {
        return res.status(400).json({ message: 'Capacidade do pasto inválida.' });
    }
    try {
        const paddock = await prisma.paddock.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!paddock) {
            return res.status(404).json({ message: 'Pasto não encontrado.' });
        }
        if (paddockName) {
            const duplicate = await prisma.paddock.findFirst({
                where: { farmId: paddock.farmId, name: paddockName, id: { not: paddock.id } },
            });
            if (duplicate) {
                return res.status(409).json({ message: 'Já existe um pasto com esse nome nesta fazenda.' });
            }
        }
        if (activeValue === false) {
            const activeCount = await prisma.paddock.count({
                where: { farmId: paddock.farmId, active: true },
            });
            if (activeCount <= 1) {
                return res.status(400).json({ message: 'A fazenda precisa ter ao menos um pasto ativo.' });
            }
        }
        const updated = await prisma.paddock.update({
            where: { id: paddock.id },
            data: {
                ...(paddockName ? { name: paddockName } : {}),
                ...(areaValue !== undefined ? { areaHa: areaValue } : {}),
                ...(normalizedDivisionType !== undefined ? { divisionType: normalizedDivisionType } : {}),
                ...(capacityValue !== undefined ? { capacity: capacityValue } : {}),
                ...(activeValue !== undefined ? { active: activeValue } : {}),
            },
        });
        return res.json({ item: serializePaddock(updated) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar pasto.' });
    }
});

app.patch('/farms/:id/repro-mode', async (req, res) => {
    const { id } = req.params;
    const { reproMode } = req.body || {};
    const normalizedMode = normalizeReproMode(reproMode);
    if (!normalizedMode) {
        return res.status(400).json({ message: 'Modo reprodutivo inválido.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const updatedFarm = await prisma.farm.update({
            where: { id },
            data: { reproMode: normalizedMode },
        });
        return res.json({ farm: updatedFarm });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar modo reprodutivo.' });
    }
});

app.get('/seasons', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar estações.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const seasons = await prisma.breedingSeason.findMany({
            where: { farmId: String(farmId) },
            orderBy: { startAt: 'desc' },
        });
        return res.json({ seasons: seasons.map(serializeSeason) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar estações.' });
    }
});

app.post('/seasons', async (req, res) => {
    const { farmId, name, startAt, endAt } = req.body || {};
    if (!farmId || !name?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e nome da estação.' });
    }

    const startDate = parseDateValue(startAt);
    const endDate = parseDateValue(endAt);
    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Datas da estação inválidas.' });
    }
    if (startDate > endDate) {
        return res.status(400).json({ message: 'Data de início deve ser anterior ao fim.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        if (farm.reproMode !== 'ESTACAO') {
            return res.status(400).json({ message: 'Fazenda não está em modo estação.' });
        }

        const season = await prisma.breedingSeason.create({
            data: {
                farmId,
                name: name.trim(),
                startAt: startDate,
                endAt: endDate,
            },
        });
        return res.status(201).json({ season: serializeSeason(season) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar estação.' });
    }
});

app.patch('/seasons/:id', async (req, res) => {
    const { id } = req.params;
    const { name, startAt, endAt } = req.body || {};
    const startDate = startAt ? parseDateValue(startAt) : null;
    const endDate = endAt ? parseDateValue(endAt) : null;

    if ((startAt && !startDate) || (endAt && !endDate)) {
        return res.status(400).json({ message: 'Datas da estação inválidas.' });
    }
    if (startDate && endDate && startDate > endDate) {
        return res.status(400).json({ message: 'Data de início deve ser anterior ao fim.' });
    }

    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const updatedSeason = await prisma.breedingSeason.update({
            where: { id },
            data: {
                name: name?.trim() || season.name,
                startAt: startDate || season.startAt,
                endAt: endDate || season.endAt,
            },
        });
        return res.json({ season: serializeSeason(updatedSeason) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar estação.' });
    }
});

app.delete('/seasons/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const [exposureCount, eventCount] = await prisma.$transaction([
            prisma.exposure.count({ where: { seasonId: id } }),
            prisma.reproEvent.count({ where: { seasonId: id } }),
        ]);
        if (exposureCount > 0 || eventCount > 0) {
            return res.status(409).json({ message: 'Estação possui registros vinculados.' });
        }

        await prisma.breedingSeason.delete({ where: { id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir estação.' });
    }
});

app.get('/seasons/:id/exposures', async (req, res) => {
    const { id } = req.params;
    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const exposures = await prisma.exposure.findMany({
            where: { seasonId: id },
            include: { animal: true },
            orderBy: { createdAt: 'asc' },
        });
        return res.json({
            exposures: exposures.map((exposure) => ({
                id: exposure.id,
                animalId: exposure.animalId,
                createdAt: exposure.createdAt.toISOString(),
                animal: serializeAnimal(exposure.animal),
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar expostas.' });
    }
});

app.post('/seasons/:id/exposures', async (req, res) => {
    const { id } = req.params;
    const { animalIds } = req.body || {};
    const uniqueAnimalIds = Array.isArray(animalIds)
        ? [...new Set(animalIds.map((animalId) => String(animalId)))]
        : [];

    if (!uniqueAnimalIds.length) {
        return res.status(400).json({ message: 'Informe as fêmeas expostas.' });
    }

    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const animals = await prisma.animal.findMany({
            where: {
                id: { in: uniqueAnimalIds },
                farmId: season.farmId,
                farm: buildFarmRelationFilter(req),
                sexo: 'FEMEA',
            },
            select: { id: true },
        });

        const validIds = new Set(animals.map((animal) => animal.id));
        const invalidIds = uniqueAnimalIds.filter((animalId) => !validIds.has(animalId));
        if (invalidIds.length) {
            return res.status(400).json({ message: 'Apenas fêmeas da fazenda podem ser expostas.' });
        }

        const createResult = await prisma.exposure.createMany({
            data: animals.map((animal) => ({ seasonId: id, animalId: animal.id })),
            skipDuplicates: true,
        });

        const exposures = await prisma.exposure.findMany({
            where: { seasonId: id },
            include: { animal: true },
            orderBy: { createdAt: 'asc' },
        });
        const createdCount = createResult.count || 0;
        const existingCount = Math.max(validIds.size - createdCount, 0);
        return res.status(200).json({
            createdCount,
            existingCount,
            exposures: exposures.map((exposure) => ({
                id: exposure.id,
                animalId: exposure.animalId,
                createdAt: exposure.createdAt.toISOString(),
                animal: serializeAnimal(exposure.animal),
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar expostas.' });
    }
});

app.delete('/seasons/:id/exposures/:animalId', async (req, res) => {
    const { id, animalId } = req.params;
    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        await prisma.exposure.deleteMany({
            where: { seasonId: id, animalId },
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao remover exposta.' });
    }
});

app.get('/lots', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar lotes.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const lots = await prisma.lot.findMany({
            where: { farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ lots });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar lotes.' });
    }
});

app.post('/lots', async (req, res) => {
    const { farmId, name, notes } = req.body || {};
    if (!farmId || !name?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e nome do lote.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const lot = await prisma.lot.create({
            data: {
                farmId,
                name: name.trim(),
                notes: notes?.trim() || null,
            },
        });
        return res.status(201).json({ lot });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar lote.' });
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
            const { kpis, diagnosticsInWindowCount, pregInWindowCount, isExposed, hasPrenheInSeason } =
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

app.get('/po/animals', async (req, res) => {
    const { farmId, lotId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar animais P.O.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const animals = await prisma.poAnimal.findMany({
            where: {
                farmId: farm.id,
                ...(lotId ? { lotId: String(lotId) } : {}),
            },
            include: { currentPaddock: true },
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
                                ...(animalIds.length ? [{ poAnimalId: { in: animalIds } }] : []),
                                ...(lotIds.length ? [{ poLotId: { in: lotIds } }] : []),
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
                if (assignment.poAnimalId) {
                    pickLatest(nutritionByAnimal, assignment.poAnimalId, assignment);
                }
                if (assignment.poLotId) {
                    pickLatest(nutritionByLot, assignment.poLotId, assignment);
                }
            });
        }

        const enriched = animals.map((animal) => {
            const direct = nutritionByAnimal.get(animal.id);
            const lot = animal.lotId ? nutritionByLot.get(animal.lotId) : null;
            const plan = direct?.plan || lot?.plan || null;
            return {
                ...animal,
                currentNutritionPlan: plan ? serializeNutritionPlan(plan) : null,
            };
        });

        return res.json({ animals: enriched.map(serializePoAnimal) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar animais P.O.' });
    }
});

app.post('/po/animals', async (req, res) => {
    const { farmId, lotId, brinco, nome, raca, sexo, dataNascimento, registro, categoria, observacoes, pesoAtual, paddockId, paddockStartAt } = req.body || {};
    if (!farmId || !nome?.trim() || !raca?.trim() || !sexo) {
        return res.status(400).json({ message: 'Dados obrigatórios do animal P.O. ausentes.' });
    }
    if (!paddockId) {
        return res.status(400).json({ message: 'Pasto obrigatório para cadastrar o animal P.O.' });
    }

    const sexoEnum = normalizeSexo(sexo);
    if (!sexoEnum) {
        return res.status(400).json({ message: 'Sexo inválido. Use Macho ou Fêmea.' });
    }

    const birthDate = dataNascimento ? parseDateValue(dataNascimento) : null;
    if (dataNascimento && !birthDate) {
        return res.status(400).json({ message: 'Data de nascimento inválida.' });
    }

    const trimmedBrinco = typeof brinco === 'string' ? brinco.trim() : '';
    const trimmedRegistro = typeof registro === 'string' ? registro.trim() : '';
    const trimmedCategoria = typeof categoria === 'string' ? categoria.trim() : '';
    const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';
    let parsedPesoAtual = 0;
    if (pesoAtual !== undefined && pesoAtual !== null && pesoAtual !== '') {
        const parsed = parseNumber(pesoAtual);
        if (parsed === null || parsed <= 0) {
            return res.status(400).json({ message: 'Peso atual inválido.' });
        }
        parsedPesoAtual = parsed;
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        let validLotId = null;
        if (lotId) {
            const lot = await prisma.poLot.findFirst({
                where: { id: String(lotId), farmId: farm.id },
            });
            if (!lot) {
                return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
            }
            validLotId = lot.id;
        }

        const paddock = await prisma.paddock.findFirst({
            where: { id: paddockId, farmId: farm.id, farm: buildFarmRelationFilter(req) },
        });
        if (!paddock) {
            return res.status(400).json({ message: 'Pasto inválido para esta fazenda.' });
        }

        const moveStartAt = paddockStartAt ? parseDateValue(paddockStartAt) : new Date();
        if (paddockStartAt && !moveStartAt) {
            return res.status(400).json({ message: 'Data de entrada no pasto inválida.' });
        }

        const animal = await prisma.$transaction(async (tx) => {
            const created = await tx.poAnimal.create({
                data: {
                    farmId: farm.id,
                    lotId: validLotId,
                    brinco: trimmedBrinco || null,
                    nome: nome.trim(),
                    raca: raca.trim(),
                    sexo: sexoEnum,
                    dataNascimento: birthDate,
                    pesoAtual: parsedPesoAtual,
                    gmd: null,
                    gmd30: null,
                    registro: trimmedRegistro || null,
                    categoria: trimmedCategoria || null,
                    observacoes: trimmedObservacoes || null,
                    currentPaddockId: paddockId,
                },
            });
            await tx.paddockMove.create({
                data: {
                    farmId: farm.id,
                    paddockId,
                    poAnimalId: created.id,
                    startAt: moveStartAt,
                },
            });
            return created;
        });

        return res.status(201).json({ animal: serializePoAnimal(animal) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar animal P.O.' });
    }
});

app.patch('/po/animals/:id', async (req, res) => {
    const { id } = req.params;
    const { lotId, brinco, nome, raca, sexo, dataNascimento, registro, categoria, observacoes } = req.body || {};

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const updates = {};

        if (brinco !== undefined) {
            const trimmedBrinco = typeof brinco === 'string' ? brinco.trim() : '';
            updates.brinco = trimmedBrinco || null;
        }

        if (nome !== undefined) {
            if (!nome?.trim()) {
                return res.status(400).json({ message: 'Nome inválido.' });
            }
            updates.nome = nome.trim();
        }

        if (raca !== undefined) {
            if (!raca?.trim()) {
                return res.status(400).json({ message: 'Raça inválida.' });
            }
            updates.raca = raca.trim();
        }

        if (sexo !== undefined) {
            const sexoEnum = normalizeSexo(sexo);
            if (!sexoEnum) {
                return res.status(400).json({ message: 'Sexo inválido. Use Macho ou Fêmea.' });
            }
            updates.sexo = sexoEnum;
        }

        if (dataNascimento !== undefined) {
            if (dataNascimento === null || dataNascimento === '') {
                updates.dataNascimento = null;
            } else {
                const parsedDate = parseDateValue(dataNascimento);
                if (!parsedDate) {
                    return res.status(400).json({ message: 'Data de nascimento inválida.' });
                }
                updates.dataNascimento = parsedDate;
            }
        }

        if (registro !== undefined) {
            const trimmedRegistro = typeof registro === 'string' ? registro.trim() : '';
            updates.registro = trimmedRegistro || null;
        }

        if (categoria !== undefined) {
            const trimmedCategoria = typeof categoria === 'string' ? categoria.trim() : '';
            updates.categoria = trimmedCategoria || null;
        }

        if (observacoes !== undefined) {
            const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';
            updates.observacoes = trimmedObservacoes || null;
        }
        if (lotId !== undefined) {
            if (!lotId) {
                updates.lotId = null;
            } else {
                const lot = await prisma.poLot.findFirst({
                    where: { id: String(lotId), farmId: animal.farmId },
                });
                if (!lot) {
                    return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
                }
                updates.lotId = lot.id;
            }
        }

        const updated = await prisma.poAnimal.update({
            where: { id: animal.id },
            data: updates,
        });

        return res.json({ animal: serializePoAnimal(updated) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar animal P.O.' });
    }
});

app.delete('/po/animals/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        await prisma.poAnimal.delete({ where: { id: animal.id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir animal P.O.' });
    }
});

app.get('/po/lots', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar lotes P.O.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const lots = await prisma.poLot.findMany({
            where: { farmId: farm.id },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ lots });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar lotes P.O.' });
    }
});

app.post('/po/lots', async (req, res) => {
    const { farmId, name, notes } = req.body || {};
    if (!farmId || !name?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e nome do lote.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const lot = await prisma.poLot.create({
            data: {
                farmId: farm.id,
                name: name.trim(),
                notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
            },
        });
        return res.status(201).json({ lot });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar lote P.O.' });
    }
});

const listPoWeighings = async (req, res, responseKey) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const pesagens = await prisma.poWeighing.findMany({
            where: { poAnimalId: id, farmId: animal.farmId },
            orderBy: { data: 'desc' },
        });

        if (responseKey === 'pesagens') {
            return res.json({
                pesagens: pesagens.map((pesagem) => ({
                    id: pesagem.id,
                    data: pesagem.data.toISOString(),
                    peso: pesagem.peso,
                    gmd: pesagem.gmd,
                })),
            });
        }
        return res.json({
            [responseKey]: pesagens.map((pesagem) => ({
                id: pesagem.id,
                date: pesagem.data.toISOString(),
                weightKg: pesagem.peso,
                gmd: pesagem.gmd,
                notes: pesagem.notes,
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar pesagens.' });
    }
};

const createPoWeighing = async (req, res, responseKey) => {
    const { id } = req.params;
    const { data, date, peso, weightKg, notes } = req.body || {};

    const weighingDate = parseDateValue(date || data);
    if (!weighingDate) {
        return res.status(400).json({ message: 'Data da pesagem inválida.' });
    }

    const parsedPeso = parseNumber(weightKg ?? peso);
    if (parsedPeso === null || parsedPeso <= 0) {
        return res.status(400).json({ message: 'Peso da pesagem inválido.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const pesagem = await prisma.$transaction(async (tx) => {
            const previousWeighing = await tx.poWeighing.findFirst({
                where: { poAnimalId: id, data: { lt: weighingDate } },
                orderBy: { data: 'desc' },
            });

            let gmdValue = 0;
            if (previousWeighing) {
                const diffDaysValue = diffDaysFloat(weighingDate, previousWeighing.data);
                if (diffDaysValue > 0) {
                    gmdValue = (parsedPeso - previousWeighing.peso) / diffDaysValue;
                }
            }

            const createdWeighing = await tx.poWeighing.create({
                data: {
                    poAnimalId: id,
                    farmId: animal.farmId,
                    data: weighingDate,
                    peso: parsedPeso,
                    gmd: gmdValue,
                    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
                },
            });

            const allWeighings = await tx.poWeighing.findMany({
                where: { poAnimalId: id },
                orderBy: { data: 'asc' },
            });
            const metrics = calculateGmdMetrics(
                allWeighings.map((row) => ({ date: row.data, weight: row.peso })),
            );
            const latest = allWeighings[allWeighings.length - 1];

            await tx.poAnimal.update({
                where: { id: animal.id },
                data: {
                    pesoAtual: latest?.peso ?? parsedPeso,
                    gmd: metrics.gmdLast,
                    gmd30: metrics.gmd30,
                },
            });

            return createdWeighing;
        });

        if (responseKey === 'pesagem') {
            return res.status(201).json({
                pesagem: {
                    id: pesagem.id,
                    data: pesagem.data.toISOString(),
                    peso: pesagem.peso,
                    gmd: pesagem.gmd,
                },
            });
        }
        return res.status(201).json({
            [responseKey]: {
                id: pesagem.id,
                date: pesagem.data.toISOString(),
                weightKg: pesagem.peso,
                gmd: pesagem.gmd,
                notes: pesagem.notes,
            },
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe pesagem cadastrada nesta data.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar pesagem.' });
    }
};

app.get('/po/animals/:id/pesagens', (req, res) => listPoWeighings(req, res, 'pesagens'));
app.post('/po/animals/:id/pesagens', (req, res) => createPoWeighing(req, res, 'pesagem'));

app.get('/po/animals/:id/weighings', (req, res) => listPoWeighings(req, res, 'weighings'));
app.post('/po/animals/:id/weighings', (req, res) => createPoWeighing(req, res, 'weighing'));

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

app.get('/po/semen', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar sêmen.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const batches = await prisma.semenBatch.findMany({
            where: { farmId: farm.id },
            include: { bullPoAnimal: true },
            orderBy: { createdAt: 'desc' },
        });

        return res.json({ batches: batches.map(serializeSemenBatch) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar sêmen.' });
    }
});

app.post('/po/semen', async (req, res) => {
    const {
        farmId,
        bullPoAnimalId,
        bullName,
        bullRegistry,
        fornecedor,
        lote,
        dataColeta,
        dosesTotal,
        dosesDisponiveis,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    if (!farmId || !lote?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e lote do sêmen.' });
    }

    const totalValue = parseInteger(dosesTotal);
    const availableValue = parseInteger(dosesDisponiveis);
    if (!totalValue || totalValue <= 0) {
        return res.status(400).json({ message: 'Doses totais inválidas.' });
    }
    if (availableValue === null || availableValue < 0) {
        return res.status(400).json({ message: 'Doses disponíveis inválidas.' });
    }
    if (availableValue > totalValue) {
        return res.status(400).json({ message: 'Doses disponíveis não podem exceder o total.' });
    }

    const trimmedName = typeof bullName === 'string' ? bullName.trim() : '';
    const trimmedRegistry = typeof bullRegistry === 'string' ? bullRegistry.trim() : '';
    const trimmedFornecedor = typeof fornecedor === 'string' ? fornecedor.trim() : '';
    const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
    const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

    const collectionDate = dataColeta ? parseDateValue(dataColeta) : null;
    if (dataColeta && !collectionDate) {
        return res.status(400).json({ message: 'Data de coleta inválida.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        let validBullId = null;
        if (bullPoAnimalId) {
            const bull = await prisma.poAnimal.findFirst({
                where: { id: String(bullPoAnimalId), farmId: farm.id },
            });
            if (!bull) {
                return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
            }
            validBullId = bull.id;
        }

        if (!validBullId && !trimmedName) {
            return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
        }

        const batch = await prisma.semenBatch.create({
            data: {
                farmId: farm.id,
                bullPoAnimalId: validBullId,
                bullName: validBullId ? null : trimmedName,
                bullRegistry: validBullId ? null : trimmedRegistry || null,
                fornecedor: trimmedFornecedor || null,
                lote: lote.trim(),
                dataColeta: collectionDate,
                dosesTotal: totalValue,
                dosesDisponiveis: availableValue,
                localArmazenamento: trimmedLocal || null,
                observacoes: trimmedObservacoes || null,
            },
        });

        return res.status(201).json({ batch: serializeSemenBatch({ ...batch, bullPoAnimal: null }) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar sêmen.' });
    }
});

app.patch('/po/semen/:id', async (req, res) => {
    const { id } = req.params;
    const {
        bullPoAnimalId,
        bullName,
        bullRegistry,
        fornecedor,
        lote,
        dataColeta,
        dosesTotal,
        dosesDisponiveis,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    try {
        const batch = await prisma.semenBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de sêmen não encontrado.' });
        }

        const updates = {};
        const trimmedName = typeof bullName === 'string' ? bullName.trim() : '';
        const trimmedRegistry = typeof bullRegistry === 'string' ? bullRegistry.trim() : '';
        const trimmedFornecedor = typeof fornecedor === 'string' ? fornecedor.trim() : '';
        const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
        const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

        let nextBullId = batch.bullPoAnimalId;
        if (bullPoAnimalId !== undefined) {
            nextBullId = bullPoAnimalId ? String(bullPoAnimalId) : null;
            if (nextBullId) {
                const bull = await prisma.poAnimal.findFirst({
                    where: { id: nextBullId, farmId: batch.farmId },
                });
                if (!bull) {
                    return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
                }
                updates.bullPoAnimalId = bull.id;
                updates.bullName = bullName !== undefined ? trimmedName || null : null;
                updates.bullRegistry = bullRegistry !== undefined ? trimmedRegistry || null : null;
            } else {
                updates.bullPoAnimalId = null;
            }
        }

        if (nextBullId === null) {
            const nextName = bullName !== undefined ? trimmedName : batch.bullName;
            if (!nextName) {
                return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
            }
            if (bullName !== undefined) {
                updates.bullName = trimmedName || null;
            }
            if (bullRegistry !== undefined) {
                updates.bullRegistry = trimmedRegistry || null;
            }
        }

        if (lote !== undefined) {
            if (!lote?.trim()) {
                return res.status(400).json({ message: 'Lote inválido.' });
            }
            updates.lote = lote.trim();
        }

        const totalValue = dosesTotal !== undefined ? parseInteger(dosesTotal) : batch.dosesTotal;
        const availableValue = dosesDisponiveis !== undefined ? parseInteger(dosesDisponiveis) : batch.dosesDisponiveis;
        if (dosesTotal !== undefined && (!totalValue || totalValue <= 0)) {
            return res.status(400).json({ message: 'Doses totais inválidas.' });
        }
        if (dosesDisponiveis !== undefined && (availableValue === null || availableValue < 0)) {
            return res.status(400).json({ message: 'Doses disponíveis inválidas.' });
        }
        if (availableValue > totalValue) {
            return res.status(400).json({ message: 'Doses disponíveis não podem exceder o total.' });
        }

        if (dosesTotal !== undefined) {
            updates.dosesTotal = totalValue;
        }
        if (dosesDisponiveis !== undefined) {
            updates.dosesDisponiveis = availableValue;
        }

        if (dataColeta !== undefined) {
            if (dataColeta === null || dataColeta === '') {
                updates.dataColeta = null;
            } else {
                const parsedDate = parseDateValue(dataColeta);
                if (!parsedDate) {
                    return res.status(400).json({ message: 'Data de coleta inválida.' });
                }
                updates.dataColeta = parsedDate;
            }
        }

        if (fornecedor !== undefined) {
            updates.fornecedor = trimmedFornecedor || null;
        }
        if (localArmazenamento !== undefined) {
            updates.localArmazenamento = trimmedLocal || null;
        }
        if (observacoes !== undefined) {
            updates.observacoes = trimmedObservacoes || null;
        }

        const updated = await prisma.semenBatch.update({
            where: { id: batch.id },
            data: updates,
        });

        const updatedWithBull = await prisma.semenBatch.findUnique({
            where: { id: updated.id },
            include: { bullPoAnimal: true },
        });

        return res.json({ batch: serializeSemenBatch(updatedWithBull) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar sêmen.' });
    }
});

app.post('/po/semen/:id/move', async (req, res) => {
    const { id } = req.params;
    const { date, qty, type, notes } = req.body || {};

    const moveType = normalizeSemenMoveType(type);
    if (!moveType) {
        return res.status(400).json({ message: 'Tipo de movimentação inválido.' });
    }

    const qtyValue = parseInteger(qty);
    if (qtyValue === null || qtyValue === 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }
    if (moveType !== 'ADJUST' && qtyValue < 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }

    const moveDate = parseDateValue(date);
    if (!moveDate) {
        return res.status(400).json({ message: 'Data inválida.' });
    }

    try {
        const batch = await prisma.semenBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de sêmen não encontrado.' });
        }

        const delta = moveType === 'IN'
            ? qtyValue
            : moveType === 'OUT' || moveType === 'USE'
                ? -qtyValue
                : qtyValue;

        const nextAvailable = batch.dosesDisponiveis + delta;
        if (nextAvailable < 0 || nextAvailable > batch.dosesTotal) {
            return res.status(400).json({ message: 'Saldo disponível inválido para a movimentação.' });
        }

        const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';

        const [move] = await prisma.$transaction([
            prisma.semenMove.create({
                data: {
                    semenBatchId: batch.id,
                    date: moveDate,
                    qty: qtyValue,
                    type: moveType,
                    notes: trimmedNotes || null,
                },
            }),
            prisma.semenBatch.update({
                where: { id: batch.id },
                data: { dosesDisponiveis: nextAvailable },
            }),
        ]);

        return res.json({
            move: {
                id: move.id,
                semenBatchId: move.semenBatchId,
                date: move.date.toISOString(),
                qty: move.qty,
                type: move.type,
                notes: move.notes,
            },
            dosesDisponiveis: nextAvailable,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar sêmen.' });
    }
});

app.delete('/po/semen/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const batch = await prisma.semenBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de sêmen não encontrado.' });
        }

        const moveCount = await prisma.semenMove.count({
            where: { semenBatchId: batch.id },
        });
        if (moveCount > 0) {
            return res.status(409).json({ message: 'Lote possui movimentações.' });
        }
        if (batch.dosesDisponiveis !== batch.dosesTotal) {
            return res.status(409).json({ message: 'Lote possui saldo diferente do total.' });
        }

        await prisma.semenBatch.delete({ where: { id: batch.id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir lote de sêmen.' });
    }
});

app.get('/po/embryos', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar embriões.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const batches = await prisma.embryoBatch.findMany({
            where: { farmId: farm.id },
            include: { donorPoAnimal: true, sirePoAnimal: true },
            orderBy: { createdAt: 'desc' },
        });

        return res.json({ batches: batches.map(serializeEmbryoBatch) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar embriões.' });
    }
});

app.post('/po/embryos', async (req, res) => {
    const {
        farmId,
        donorPoAnimalId,
        donorName,
        donorRegistry,
        sirePoAnimalId,
        sireName,
        sireRegistry,
        tecnica,
        estagio,
        qualidade,
        lote,
        quantidadeTotal,
        quantidadeDisponivel,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    if (!farmId || !lote?.trim() || !tecnica) {
        return res.status(400).json({ message: 'Informe fazenda, lote e técnica.' });
    }

    const tecnicaEnum = normalizeEmbryoTechnique(tecnica);
    if (!tecnicaEnum) {
        return res.status(400).json({ message: 'Técnica inválida.' });
    }

    const totalValue = parseInteger(quantidadeTotal);
    const availableValue = parseInteger(quantidadeDisponivel);
    if (!totalValue || totalValue <= 0) {
        return res.status(400).json({ message: 'Quantidade total inválida.' });
    }
    if (availableValue === null || availableValue < 0) {
        return res.status(400).json({ message: 'Quantidade disponível inválida.' });
    }
    if (availableValue > totalValue) {
        return res.status(400).json({ message: 'Quantidade disponível não pode exceder o total.' });
    }

    const trimmedDonorName = typeof donorName === 'string' ? donorName.trim() : '';
    const trimmedSireName = typeof sireName === 'string' ? sireName.trim() : '';
    const trimmedDonorRegistry = typeof donorRegistry === 'string' ? donorRegistry.trim() : '';
    const trimmedSireRegistry = typeof sireRegistry === 'string' ? sireRegistry.trim() : '';
    const trimmedEstagio = typeof estagio === 'string' ? estagio.trim() : '';
    const trimmedQualidade = typeof qualidade === 'string' ? qualidade.trim() : '';
    const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
    const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        let validDonorId = null;
        if (donorPoAnimalId) {
            const donor = await prisma.poAnimal.findFirst({
                where: { id: String(donorPoAnimalId), farmId: farm.id },
            });
            if (!donor) {
                return res.status(404).json({ message: 'Doadora P.O. não encontrada.' });
            }
            validDonorId = donor.id;
        }

        let validSireId = null;
        if (sirePoAnimalId) {
            const sire = await prisma.poAnimal.findFirst({
                where: { id: String(sirePoAnimalId), farmId: farm.id },
            });
            if (!sire) {
                return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
            }
            validSireId = sire.id;
        }

        if (!validDonorId && !trimmedDonorName) {
            return res.status(400).json({ message: 'Informe o nome da doadora externa.' });
        }
        if (!validSireId && !trimmedSireName) {
            return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
        }

        const batch = await prisma.embryoBatch.create({
            data: {
                farmId: farm.id,
                donorPoAnimalId: validDonorId,
                donorName: validDonorId ? null : trimmedDonorName,
                donorRegistry: validDonorId ? null : trimmedDonorRegistry || null,
                sirePoAnimalId: validSireId,
                sireName: validSireId ? null : trimmedSireName,
                sireRegistry: validSireId ? null : trimmedSireRegistry || null,
                tecnica: tecnicaEnum,
                estagio: trimmedEstagio || null,
                qualidade: trimmedQualidade || null,
                lote: lote.trim(),
                quantidadeTotal: totalValue,
                quantidadeDisponivel: availableValue,
                localArmazenamento: trimmedLocal || null,
                observacoes: trimmedObservacoes || null,
            },
        });

        return res.status(201).json({ batch: serializeEmbryoBatch({ ...batch, donorPoAnimal: null, sirePoAnimal: null }) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar embriões.' });
    }
});

app.patch('/po/embryos/:id', async (req, res) => {
    const { id } = req.params;
    const {
        donorPoAnimalId,
        donorName,
        donorRegistry,
        sirePoAnimalId,
        sireName,
        sireRegistry,
        tecnica,
        estagio,
        qualidade,
        lote,
        quantidadeTotal,
        quantidadeDisponivel,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    try {
        const batch = await prisma.embryoBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de embriões não encontrado.' });
        }

        const updates = {};
        const trimmedDonorName = typeof donorName === 'string' ? donorName.trim() : '';
        const trimmedSireName = typeof sireName === 'string' ? sireName.trim() : '';
        const trimmedDonorRegistry = typeof donorRegistry === 'string' ? donorRegistry.trim() : '';
        const trimmedSireRegistry = typeof sireRegistry === 'string' ? sireRegistry.trim() : '';
        const trimmedEstagio = typeof estagio === 'string' ? estagio.trim() : '';
        const trimmedQualidade = typeof qualidade === 'string' ? qualidade.trim() : '';
        const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
        const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

        let nextDonorId = batch.donorPoAnimalId;
        if (donorPoAnimalId !== undefined) {
            nextDonorId = donorPoAnimalId ? String(donorPoAnimalId) : null;
            if (nextDonorId) {
                const donor = await prisma.poAnimal.findFirst({
                    where: { id: nextDonorId, farmId: batch.farmId },
                });
                if (!donor) {
                    return res.status(404).json({ message: 'Doadora P.O. não encontrada.' });
                }
                updates.donorPoAnimalId = donor.id;
                updates.donorName = donorName !== undefined ? trimmedDonorName || null : null;
                updates.donorRegistry = donorRegistry !== undefined ? trimmedDonorRegistry || null : null;
            } else {
                updates.donorPoAnimalId = null;
            }
        }

        let nextSireId = batch.sirePoAnimalId;
        if (sirePoAnimalId !== undefined) {
            nextSireId = sirePoAnimalId ? String(sirePoAnimalId) : null;
            if (nextSireId) {
                const sire = await prisma.poAnimal.findFirst({
                    where: { id: nextSireId, farmId: batch.farmId },
                });
                if (!sire) {
                    return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
                }
                updates.sirePoAnimalId = sire.id;
                updates.sireName = sireName !== undefined ? trimmedSireName || null : null;
                updates.sireRegistry = sireRegistry !== undefined ? trimmedSireRegistry || null : null;
            } else {
                updates.sirePoAnimalId = null;
            }
        }

        if (nextDonorId === null) {
            const nextName = donorName !== undefined ? trimmedDonorName : batch.donorName;
            if (!nextName) {
                return res.status(400).json({ message: 'Informe o nome da doadora externa.' });
            }
            if (donorName !== undefined) {
                updates.donorName = trimmedDonorName || null;
            }
            if (donorRegistry !== undefined) {
                updates.donorRegistry = trimmedDonorRegistry || null;
            }
        }

        if (nextSireId === null) {
            const nextName = sireName !== undefined ? trimmedSireName : batch.sireName;
            if (!nextName) {
                return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
            }
            if (sireName !== undefined) {
                updates.sireName = trimmedSireName || null;
            }
            if (sireRegistry !== undefined) {
                updates.sireRegistry = trimmedSireRegistry || null;
            }
        }

        if (tecnica !== undefined) {
            const tecnicaEnum = normalizeEmbryoTechnique(tecnica);
            if (!tecnicaEnum) {
                return res.status(400).json({ message: 'Técnica inválida.' });
            }
            updates.tecnica = tecnicaEnum;
        }

        if (lote !== undefined) {
            if (!lote?.trim()) {
                return res.status(400).json({ message: 'Lote inválido.' });
            }
            updates.lote = lote.trim();
        }

        const totalValue = quantidadeTotal !== undefined ? parseInteger(quantidadeTotal) : batch.quantidadeTotal;
        const availableValue = quantidadeDisponivel !== undefined ? parseInteger(quantidadeDisponivel) : batch.quantidadeDisponivel;
        if (quantidadeTotal !== undefined && (!totalValue || totalValue <= 0)) {
            return res.status(400).json({ message: 'Quantidade total inválida.' });
        }
        if (quantidadeDisponivel !== undefined && (availableValue === null || availableValue < 0)) {
            return res.status(400).json({ message: 'Quantidade disponível inválida.' });
        }
        if (availableValue > totalValue) {
            return res.status(400).json({ message: 'Quantidade disponível não pode exceder o total.' });
        }

        if (quantidadeTotal !== undefined) {
            updates.quantidadeTotal = totalValue;
        }
        if (quantidadeDisponivel !== undefined) {
            updates.quantidadeDisponivel = availableValue;
        }

        if (estagio !== undefined) {
            updates.estagio = trimmedEstagio || null;
        }
        if (qualidade !== undefined) {
            updates.qualidade = trimmedQualidade || null;
        }
        if (localArmazenamento !== undefined) {
            updates.localArmazenamento = trimmedLocal || null;
        }
        if (observacoes !== undefined) {
            updates.observacoes = trimmedObservacoes || null;
        }

        const updated = await prisma.embryoBatch.update({
            where: { id: batch.id },
            data: updates,
        });

        const updatedWithRelations = await prisma.embryoBatch.findUnique({
            where: { id: updated.id },
            include: { donorPoAnimal: true, sirePoAnimal: true },
        });

        return res.json({ batch: serializeEmbryoBatch(updatedWithRelations) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar embriões.' });
    }
});

app.post('/po/embryos/:id/move', async (req, res) => {
    const { id } = req.params;
    const { date, qty, type, notes } = req.body || {};

    const moveType = normalizeEmbryoMoveType(type);
    if (!moveType) {
        return res.status(400).json({ message: 'Tipo de movimentação inválido.' });
    }

    const qtyValue = parseInteger(qty);
    if (qtyValue === null || qtyValue === 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }
    if (moveType !== 'ADJUST' && qtyValue < 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }

    const moveDate = parseDateValue(date);
    if (!moveDate) {
        return res.status(400).json({ message: 'Data inválida.' });
    }

    try {
        const batch = await prisma.embryoBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de embriões não encontrado.' });
        }

        const delta = moveType === 'IN'
            ? qtyValue
            : moveType === 'OUT' || moveType === 'TRANSFER'
                ? -qtyValue
                : qtyValue;

        const nextAvailable = batch.quantidadeDisponivel + delta;
        if (nextAvailable < 0 || nextAvailable > batch.quantidadeTotal) {
            return res.status(400).json({ message: 'Saldo disponível inválido para a movimentação.' });
        }

        const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';

        const [move] = await prisma.$transaction([
            prisma.embryoMove.create({
                data: {
                    embryoBatchId: batch.id,
                    date: moveDate,
                    qty: qtyValue,
                    type: moveType,
                    notes: trimmedNotes || null,
                },
            }),
            prisma.embryoBatch.update({
                where: { id: batch.id },
                data: { quantidadeDisponivel: nextAvailable },
            }),
        ]);

        return res.json({
            move: {
                id: move.id,
                embryoBatchId: move.embryoBatchId,
                date: move.date.toISOString(),
                qty: move.qty,
                type: move.type,
                notes: move.notes,
            },
            quantidadeDisponivel: nextAvailable,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar embriões.' });
    }
});

app.delete('/po/embryos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const batch = await prisma.embryoBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de embriões não encontrado.' });
        }

        const moveCount = await prisma.embryoMove.count({
            where: { embryoBatchId: batch.id },
        });
        if (moveCount > 0) {
            return res.status(409).json({ message: 'Lote possui movimentações.' });
        }
        if (batch.quantidadeDisponivel !== batch.quantidadeTotal) {
            return res.status(409).json({ message: 'Lote possui saldo diferente do total.' });
        }

        await prisma.embryoBatch.delete({ where: { id: batch.id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir lote de embriões.' });
    }
});

app.get('/animals', async (req, res) => {
    const { farmId, lotId } = req.query || {};
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

        const animals = await prisma.animal.findMany({
            where: {
                farmId: String(farmId),
                farm: buildFarmRelationFilter(req),
                ...(lotId ? { lotId: String(lotId) } : {}),
            },
            include: { currentPaddock: true },
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

        const enriched = animals.map((animal) => {
            const direct = nutritionByAnimal.get(animal.id);
            const lot = animal.lotId ? nutritionByLot.get(animal.lotId) : null;
            const plan = direct?.plan || lot?.plan || null;
            return {
                ...animal,
                currentNutritionPlan: plan ? serializeNutritionPlan(plan) : null,
            };
        });

        return res.json({ animals: enriched.map(serializeAnimal) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar animais.' });
    }
});

app.post('/animals', async (req, res) => {
    const { farmId, lotId, brinco, raca, sexo, dataNascimento, pesoAtual, paddockId, paddockStartAt } = req.body || {};

    if (!farmId || !brinco?.trim() || !raca?.trim() || !sexo || !dataNascimento) {
        return res.status(400).json({ message: 'Dados obrigatórios do animal ausentes.' });
    }
    if (!paddockId) {
        return res.status(400).json({ message: 'Pasto obrigatório para cadastrar o animal.' });
    }

    const sexoEnum = normalizeSexo(sexo);
    if (!sexoEnum) {
        return res.status(400).json({ message: 'Sexo inválido. Use Macho ou Fêmea.' });
    }

    const birthDate = parseDateValue(dataNascimento);
    if (!birthDate) {
        return res.status(400).json({ message: 'Data de nascimento inválida.' });
    }

    const parsedPesoAtual = parseNumber(pesoAtual);
    if (parsedPesoAtual === null || parsedPesoAtual <= 0) {
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

        const paddock = await prisma.paddock.findFirst({
            where: { id: paddockId, farmId, farm: buildFarmRelationFilter(req) },
        });
        if (!paddock) {
            return res.status(400).json({ message: 'Pasto inválido para esta fazenda.' });
        }

        const moveStartAt = paddockStartAt ? parseDateValue(paddockStartAt) : new Date();
        if (paddockStartAt && !moveStartAt) {
            return res.status(400).json({ message: 'Data de entrada no pasto inválida.' });
        }

        const animal = await prisma.$transaction(async (tx) => {
            const created = await tx.animal.create({
                data: {
                    farmId,
                    lotId: validLotId,
                    brinco: brinco.trim(),
                    raca: raca.trim(),
                    sexo: sexoEnum,
                    dataNascimento: birthDate,
                    pesoAtual: parsedPesoAtual,
                    gmd: null,
                    gmd30: null,
                    currentPaddockId: paddockId,
                },
            });
            await tx.paddockMove.create({
                data: {
                    farmId,
                    paddockId,
                    animalId: created.id,
                    startAt: moveStartAt,
                },
            });
            return created;
        });

        return res.status(201).json({ animal: serializeAnimal(animal) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar animal.' });
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

app.post('/animals/:id/pesagens', async (req, res) => {
    const { id } = req.params;
    const { data, peso } = req.body || {};

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

        const pesagem = await prisma.$transaction(async (tx) => {
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

        return res.status(201).json({
            pesagem: {
                id: pesagem.id,
                data: pesagem.data.toISOString(),
                peso: pesagem.peso,
                gmd: pesagem.gmd,
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

app.post('/animals/:id/paddock-moves', async (req, res) => {
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

app.post('/po/animals/:id/paddock-moves', async (req, res) => {
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

app.post('/animals/:id/move-pasto', async (req, res) => {
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

app.post('/po/animals/:id/move-pasto', async (req, res) => {
    const { id } = req.params;
    const { pastoId, paddockId, date, startAt, notes, farmId } = req.body || {};
    const targetPaddockId = pastoId || paddockId;
    if (!targetPaddockId) {
        return res.status(400).json({ message: 'Pasto obrigatório para movimentação.' });
    }
    try {
        if (farmId) {
            const animal = await prisma.poAnimal.findFirst({
                where: { id, farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal P.O. não encontrado para a fazenda informada.' });
            }
        }
        const { error, result } = await moveAnimalBetweenPaddocks({
            animalId: id,
            paddockId: targetPaddockId,
            startAt: startAt || date,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: true,
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

const MAX_PORT_ATTEMPTS = Number(process.env.PORT_ATTEMPTS) || 10;
const BASE_PORT = Number(PORT) || 3001;
const LAST_PORT = BASE_PORT + Math.max(MAX_PORT_ATTEMPTS - 1, 0);

const startServer = (port) => {
    const server = app.listen(port, () => {
        activePort = port;
        console.log(`Eixo API rodando em http://localhost:${port}`);
    });

    server.on('error', (error) => {
        if (error?.code === 'EADDRINUSE' && port < LAST_PORT) {
            const nextPort = port + 1;
            console.warn(`Porta ${port} ocupada, subindo em ${nextPort}`);
            return startServer(nextPort);
        }
        if (error?.code === 'EADDRINUSE') {
            console.error(`Não foi possível encontrar porta livre entre ${BASE_PORT} e ${LAST_PORT}.`);
            process.exit(1);
        }
        console.error('Erro ao iniciar servidor:', error);
        process.exit(1);
    });
};

startServer(BASE_PORT);
