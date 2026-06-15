import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { registerNutritionModuleRoutes } from './nutritionModule.js';
import { registerAcasalamentoRoutes } from './acasalamentoModule.js';
import { upsertSystemAccountCategories } from './accountCategoryDefaults.js';
import { runMarketCapture } from './market/services/marketCaptureService.js';
import { publishNormalizedPrice, rejectNormalizedPrice } from './market/services/marketPublishService.js';
import { resolveMarketTrends } from './market/services/marketTrendService.js';
import { startMarketCron } from './market/jobs/marketCron.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import twilio from 'twilio';
import { Resend } from 'resend';
// ─── Módulos Extraídos (Fase 3) ────────────────────────────────────────────────
import { registerMarketRoutes } from './modules/market/marketRoutes.js';
import { registerChatRoutes, createSupportLog, getSupportConversationState, SUPPORT_ENTITY, SUPPORT_ACTION_ASSUME, SUPPORT_ACTION_RELEASE } from './modules/chat/chatService.js';
import { registerHQRoutes } from './modules/hq/hqRoutes.js';
import { registerFieldRoutes } from './modules/field/fieldRoutes.js';
import { registerFinancialRoutes } from './modules/financial/financialRoutes.js';
import { registerOverviewRoutes } from './modules/overview/dashboardRoute.js';
import { registerNewsRoutes } from './modules/news/newsService.js';

// ─── Módulos Extraídos (Fase 1) ────────────────────────────────────────────────
import {
    PORT, NODE_ENV, IS_PROD, SESSION_COOKIE_NAME, SESSION_TOKEN_SALT,
    SESSION_LOGIN_TTL_MS, CORS_ORIGIN, ALLOW_X_USER_ID,
    OTP_SEND_WINDOW_MS, OTP_SEND_MAX_PER_IP, OTP_SEND_MAX_PER_PHONE,
    OTP_VERIFY_WINDOW_MS, OTP_VERIFY_MAX_PER_IP, OTP_VERIFY_MAX_PER_PHONE,
    FORGOT_PASSWORD_WINDOW_MS, FORGOT_PASSWORD_MAX_ATTEMPTS,
    CHAT_RATE_WINDOW_MS, CHAT_RATE_MAX_PER_USER,
    CHAT_BURST_WINDOW_MS, CHAT_BURST_MAX_PER_USER,
    APP_BASE_URL, RESEND_FROM_EMAIL, RESEND_API_KEY,
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID,
    GOOGLE_API_KEY,
    PASSWORD_POLICY_MESSAGE, REPRO_WINDOW_DAYS, DEFAULT_THRESHOLDS,
    HERD_EVENT_CATEGORY_MAP, SANITARY_CATEGORY_MAP,
    FIELD_OCCURRENCE_UPLOAD_ROOT, AVATAR_UPLOAD_ROOT,
    FIELD_WORKER_ROLE, FIELD_ADMIN_ROLE, FIELD_WORKER_DEFAULT_MODULES,
    APP_ACTIVATION_CODE_TTL_MS, APP_ACTIVATION_CODE_ALPHABET,
    FIELD_ATTACHMENT_MAX_FILES, FIELD_OCCURRENCE_TYPES, FIELD_OCCURRENCE_STATUSES,
    FIELD_ATTACHMENT_ALLOWED_MIME_TYPES, PHONE_VERIFY_TTL_MS,
} from './modules/config/env.js';
import { createCorsMiddleware, createSecurityHeadersMiddleware } from './modules/config/cors.js';
import { isPasswordStrongEnough, validateCNPJ, validateCPF, fetchCnpjData, parseCoordinate, validateCoordinatePair } from './modules/utils/validators.js';
import { sanitizeUser, escapeHtml, parseNumber, parseDateValue, parseInteger, normalizeSexo, formatSexoLabel, normalizeReproMode, normalizeReproEventType, normalizePregStatus, normalizeEmbryoTechnique, normalizeSemenMoveType, normalizeEmbryoMoveType, normalizeSelectionDecision, normalizeAnimalTipoCadastro, normalizeEmailForLogin, isEmailValid } from './modules/utils/formatters.js';
import { ensureActivityLogColumns, logActivity, recordActivityLog } from './modules/utils/activityLog.js';
import { loginAttempts, otpSendAttempts, otpVerifyAttempts, chatRateAttempts, chatBurstAttempts, forgotPasswordAttempts, isWindowRateLimited, registerWindowAttempt, clearWindowAttempt, getWindowRetryAfterSeconds, isRateLimited, registerFailedLogin, clearLoginAttempts, isAnyLoginRateLimited, registerFailedLogins, clearLoginRateLimits, isAnyForgotPasswordRateLimited, registerForgotPasswordAttempts, clearForgotPasswordAttempts } from './modules/middlewares/rateLimiter.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from './modules/middlewares/farmScope.js';
import { serializeAnimal, serializePoAnimal, serializeSeason, serializeReproEvent, serializePaddockMove, serializeSemenBatch, serializeNutritionPlan, serializeNutritionAssignment, serializeEmbryoBatch, serializePaddock, serializeFieldOccurrenceAttachment, serializeFieldOccurrence, serializeFinancialTransaction, serializeHerdEvent, serializeSanitaryRecord, getOccurrenceAnimalLabel, getDaysSince, buildFieldOccurrenceAlert } from './modules/utils/serializers.js';
// ─── Módulos Extraídos (Fase 2) ────────────────────────────────────────────────
import {
    SUPER_ADMIN_ALL_MODULES, BILLING_BLOCKED_STATES, PLAN_ENTITLEMENTS, PLAN_MODULES, ORGANIZATION_ADMIN_ROLES,
    buildLegacyEntitlements, hasUserRole, isFieldWorkerUser, isFieldAdminUser, isFieldAppUser,
    getDerivedFieldProfile, getDerivedAccessType, getDerivedActivationStatus, buildManagedUserSummaries,
    normalizeUserModules, buildAllowedModulesFromPlan, canManageOrganizationUsers, serializeManagedUser,
    normalizeOrganizationSlug, ensureFieldWorkerFarmAccess, SaasContextError, isSaasContextError,
    ensureSaasContextForUser, serializeAuthUser, serializeAuthUserWithContext,
} from './modules/utils/saasContext.js';
import {
    WEB_DEVICE_MARKER, hashSessionToken, generateSessionToken, buildCookieOptions,
    extractSessionTokenFromRequest, hashPasswordResetToken, buildLoginRateLimitKeys,
    buildForgotPasswordRateLimitKeys, sanitizeWebDeviceKey, buildSessionUserAgent,
    createSessionForUser, buildAppPermissions, buildAppAuthPayload, getSessionFromRequest,
} from './modules/middlewares/session.js';
import {
    isFieldWorkerRequest, requireBillingAccess, requireNonFieldWorker, requireEntitlement,
    requireAuth, requireSuperAdmin, requireMarketAdmin,
} from './modules/middlewares/requireAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resend = RESEND_API_KEY && RESEND_API_KEY !== 're_...' ? new Resend(RESEND_API_KEY) : null;

// Map temporário: phone -> { verifiedAt: number }  (TTL 30 min, uso único)
const verifiedPhones    = new Map();
// ─────────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

const normalizeActivationCode = (value) =>
    String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

const hashActivationCode = (value) =>
    crypto
        .createHash('sha256')
        .update(normalizeActivationCode(value))
        .update(':app-activation:')
        .update(SESSION_TOKEN_SALT)
        .digest('hex');

const generateActivationCode = () => {
    let raw = '';
    for (let index = 0; index < 12; index += 1) {
        const randomIndex = crypto.randomInt(0, APP_ACTIVATION_CODE_ALPHABET.length);
        raw += APP_ACTIVATION_CODE_ALPHABET[randomIndex];
    }
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
};

const normalizeInternalEmailToken = (value) => {
    const normalized = String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32);
    return normalized || 'colaborador';
};

const generateInternalFieldUserEmail = (name) =>
    `${normalizeInternalEmailToken(name)}.${crypto.randomBytes(4).toString('hex')}@manejo.eixo.local`;

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
        select: { id: true },
    });
};

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

const transferAnimalsToFarm = async ({ ids, targetFarmId, targetPaddockId, transferDate, notes, scopeFilter, farmScopeFilter, isPo }) => {
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

const app = express();
app.set('trust proxy', 1);
app.use(createCorsMiddleware(IS_PROD, CORS_ORIGIN));
app.use(createSecurityHeadersMiddleware(IS_PROD, CORS_ORIGIN));
app.use(express.json());
app.use(cookieParser());

let activePort = Number(PORT) || 3001;
app.get('/health', (_req, res) => {
    res.set('X-Server-Port', String(activePort));
    return res.json({ ok: true, port: activePort });
});

// ─── OTP via Twilio Verify ────────────────────────────────────────────────────
app.post('/auth/send-otp', async (req, res) => {
    const { phone } = req.body || {};
    const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
    const ipKey = `ip:${req.ip || 'unknown'}`;
    const phoneKey = `phone:${digits || 'unknown'}`;

    if (digits.length < 10 || digits.length > 11) {
        return res.status(400).json({ message: 'Informe um celular válido com DDD.' });
    }

    if (isWindowRateLimited(otpSendAttempts, ipKey, OTP_SEND_MAX_PER_IP, OTP_SEND_WINDOW_MS)
        || isWindowRateLimited(otpSendAttempts, phoneKey, OTP_SEND_MAX_PER_PHONE, OTP_SEND_WINDOW_MS)) {
        return res.status(429).json({ message: 'Muitas tentativas de envio. Aguarde alguns minutos antes de tentar novamente.' });
    }

    if (!twilioClient || !TWILIO_VERIFY_SID) {
        return res.status(503).json({ message: 'Serviço de SMS não configurado.' });
    }

    const e164 = `+55${digits}`;
    try {
        registerWindowAttempt(otpSendAttempts, ipKey, OTP_SEND_WINDOW_MS);
        registerWindowAttempt(otpSendAttempts, phoneKey, OTP_SEND_WINDOW_MS);
        await twilioClient.verify.v2.services(TWILIO_VERIFY_SID)
            .verifications.create({ to: e164, channel: 'sms' });
        return res.json({ message: 'Código enviado.' });
    } catch (error) {
        console.error('Twilio send-otp error:', error);
        return res.status(500).json({ message: 'Não foi possível enviar o SMS. Verifique o número e tente novamente.' });
    }
});

app.post('/auth/verify-otp', async (req, res) => {
    const { phone, code } = req.body || {};
    const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
    const ipKey = `ip:${req.ip || 'unknown'}`;
    const phoneKey = `phone:${digits || 'unknown'}`;

    if (!digits || !code) {
        return res.status(400).json({ message: 'Informe o celular e o código.' });
    }

    if (isWindowRateLimited(otpVerifyAttempts, ipKey, OTP_VERIFY_MAX_PER_IP, OTP_VERIFY_WINDOW_MS)
        || isWindowRateLimited(otpVerifyAttempts, phoneKey, OTP_VERIFY_MAX_PER_PHONE, OTP_VERIFY_WINDOW_MS)) {
        return res.status(429).json({ message: 'Muitas tentativas de verificação. Aguarde alguns minutos antes de tentar novamente.' });
    }

    if (!twilioClient || !TWILIO_VERIFY_SID) {
        return res.status(503).json({ message: 'Serviço de SMS não configurado.' });
    }

    const e164 = `+55${digits}`;
    try {
        const check = await twilioClient.verify.v2.services(TWILIO_VERIFY_SID)
            .verificationChecks.create({ to: e164, code: String(code).trim() });

        if (check.status !== 'approved') {
            registerWindowAttempt(otpVerifyAttempts, ipKey, OTP_VERIFY_WINDOW_MS);
            registerWindowAttempt(otpVerifyAttempts, phoneKey, OTP_VERIFY_WINDOW_MS);
            return res.status(400).json({ message: 'Código incorreto ou expirado. Tente novamente.' });
        }

        // Registra celular como verificado (TTL 30 min, uso único no /register)
        verifiedPhones.set(digits, { verifiedAt: Date.now() });
        clearWindowAttempt(otpVerifyAttempts, ipKey);
        clearWindowAttempt(otpVerifyAttempts, phoneKey);
        return res.json({ message: 'Celular verificado.' });
    } catch (error) {
        console.error('Twilio verify-otp error:', error);
        registerWindowAttempt(otpVerifyAttempts, ipKey, OTP_VERIFY_WINDOW_MS);
        registerWindowAttempt(otpVerifyAttempts, phoneKey, OTP_VERIFY_WINDOW_MS);
        return res.status(400).json({ message: 'Código incorreto ou expirado. Tente novamente.' });
    }
});
// ─────────────────────────────────────────────────────────────────────────────

app.post('/auth/register/check-document', async (req, res) => {
    const { document, documentType } = req.body || {};
    const normalizedDocument = typeof document === 'string' ? document.replace(/\D/g, '') : '';
    const normalizedDocumentType = documentType === 'CNPJ' || documentType === 'CPF' ? documentType : null;

    if (!normalizedDocumentType || !normalizedDocument) {
        return res.status(400).json({ message: 'Informe um CPF ou CNPJ válido.' });
    }

    if (normalizedDocumentType === 'CNPJ' && !validateCNPJ(normalizedDocument)) {
        return res.status(400).json({ message: 'CNPJ inválido. Verifique os dígitos.' });
    }

    if (normalizedDocumentType === 'CPF' && !validateCPF(normalizedDocument)) {
        return res.status(400).json({ message: 'CPF inválido. Verifique os dígitos.' });
    }

    try {
        const docExists = await prisma.user.findFirst({ where: { document: normalizedDocument } });
        if (docExists) {
            return res.status(409).json({ message: `${normalizedDocumentType} já está cadastrado em outra conta.`, exists: true });
        }
        return res.json({ exists: false });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Não foi possível validar o documento agora.' });
    }
});

// ─── Consulta pública de CNPJ (Receita Federal) ──────────────────────────────
app.get('/public/cnpj/:cnpj', async (req, res) => {
    const cnpj = req.params.cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) {
        return res.status(400).json({ message: 'CNPJ deve ter 14 dígitos.' });
    }
    try {
        const data = await fetchCnpjData(cnpj);
        return res.json(data);
    } catch (error) {
        console.error('CNPJ lookup error:', error);
        return res.status(error?.statusCode || 503).json({ message: error?.message || 'Não foi possível consultar a Receita Federal. Tente novamente.' });
    }
});
// ─────────────────────────────────────────────────────────────────────────────

app.post('/register', async (req, res) => {
    const { name, email, password, document, documentType, phone, termsVersion } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedDocument = typeof document === 'string' ? document.replace(/\D/g, '') : null;
    const normalizedPhone = typeof phone === 'string' ? phone.replace(/\D/g, '') : null;
    const normalizedDocumentType = documentType === 'CNPJ' || documentType === 'CPF' ? documentType : null;

    if (!normalizedName || !normalizedEmail || !password) {
        return res.status(400).json({ message: 'Informe nome, e-mail e senha.' });
    }

    if (!termsVersion) {
        return res.status(400).json({ message: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar sua conta.' });
    }

    if (!isPasswordStrongEnough(password)) {
        return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
    }

    if (!normalizedDocument || !normalizedDocumentType) {
        return res.status(400).json({ message: 'Informe seu CNPJ ou CPF para criar a conta.' });
    }

    if (normalizedDocumentType === 'CNPJ' && !validateCNPJ(normalizedDocument)) {
        return res.status(400).json({ message: 'CNPJ inválido. Verifique os dígitos.' });
    }

    if (normalizedDocumentType === 'CPF' && !validateCPF(normalizedDocument)) {
        return res.status(400).json({ message: 'CPF inválido. Verifique os dígitos.' });
    }

    try {
        const emailExists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (emailExists) {
            return res.status(409).json({ message: 'E-mail já cadastrado.' });
        }

        // Verifica se documento já está cadastrado
        const docExists = await prisma.user.findFirst({ where: { document: normalizedDocument } });
        if (docExists) {
            return res.status(409).json({ message: `${documentType} já está cadastrado em outra conta.` });
        }

        // CNPJ e CPF: exigem celular verificado via OTP
        if (!normalizedPhone) {
            return res.status(400).json({ message: 'Informe e verifique seu celular para continuar.' });
        }
        const phoneEntry = verifiedPhones.get(normalizedPhone);
        const phoneIsValid = phoneEntry && (Date.now() - phoneEntry.verifiedAt) < PHONE_VERIFY_TTL_MS;
        if (!phoneIsValid) {
            return res.status(400).json({ message: 'Celular não verificado. Complete a verificação por SMS antes de criar a conta.' });
        }
        verifiedPhones.delete(normalizedPhone); // uso único

        // Verifica se celular já está em uso por outro usuário
        const phoneAlreadyUsed = await prisma.user.findFirst({ where: { phone: normalizedPhone } });
        if (phoneAlreadyUsed) {
            return res.status(400).json({ message: 'Este celular já está vinculado a outra conta. Use outro número ou recupere sua conta.' });
        }

        let trustedCnpjData = undefined;
        if (normalizedDocumentType === 'CNPJ') {
            try {
                trustedCnpjData = await fetchCnpjData(normalizedDocument);
            } catch (error) {
                console.error('CNPJ register error:', error);
                return res.status(error?.statusCode || 503).json({ message: error?.message || 'Não foi possível confirmar o CNPJ na Receita Federal.' });
            }

            if (String(trustedCnpjData?.descricao_situacao_cadastral || '').trim().toUpperCase() !== 'ATIVA') {
                return res.status(400).json({
                    message: `Este CNPJ está com situação ${trustedCnpjData?.descricao_situacao_cadastral || 'não disponível'} na Receita Federal.`,
                });
            }
        }

        const hashedPassword = await bcrypt.hash(String(password), 10);
        // Plano grátis: Estrutura da Fazenda + Manejo do Rebanho + Financeiro + Visão Geral (Dashboard)
        const FREE_PLAN_MODULES = ['Fazendas', 'Rebanho Comercial', 'Financeiro', 'Visão Geral'];
        const newUser = await prisma.user.create({
            data: {
                name: normalizedName,
                email: normalizedEmail,
                password: hashedPassword,
                modules: FREE_PLAN_MODULES,
                roles: ['user'],
                document: normalizedDocument,
                documentType: normalizedDocumentType,
                cnpjData: trustedCnpjData || undefined,
                phone: normalizedPhone,
                termsVersion: String(termsVersion),
                termsAcceptedAt: new Date(),
            },
        });

        const saasCtx = await ensureSaasContextForUser(newUser.id, { allowProvision: true });

        // Atualiza nome da organização com a razão social (CNPJ)
        if (normalizedDocumentType === 'CNPJ' && trustedCnpjData?.razao_social && saasCtx?.organizationId) {
            await prisma.organization.update({
                where: { id: saasCtx.organizationId },
                data: { name: trustedCnpjData.razao_social },
            });
        }

        // Registra plano gratuito formalmente no banco
        if (saasCtx?.organizationId) {
            await prisma.billingSubscription.upsert({
                where: {
                    provider_providerSubscriptionId: {
                        provider: 'INTERNAL',
                        providerSubscriptionId: `gratis-${saasCtx.organizationId}`,
                    },
                },
                update: {},
                create: {
                    id: `gratis-${saasCtx.organizationId}`,
                    organizationId: saasCtx.organizationId,
                    provider: 'INTERNAL',
                    providerSubscriptionId: `gratis-${saasCtx.organizationId}`,
                    planCode: 'gratis',
                    status: 'ACTIVE',
                    updatedAt: new Date(),
                },
            });
        }

        // Email de boas-vindas
        if (resend) {
            const safeName = escapeHtml(normalizedName.split(' ')[0] || normalizedName);
            resend.emails.send({
                from: RESEND_FROM_EMAIL,
                to: normalizedEmail,
                subject: 'Bem-vindo ao EIXO 🌿',
                html: `
                    <p>Olá, ${safeName}!</p>
                    <p>Sua conta no <strong>EIXO</strong> foi criada com sucesso. Você está no <strong>Plano Grátis</strong> — sem cartão, sem prazo.</p>
                    <p>Com ele você já pode:</p>
                    <ul>
                        <li>Cadastrar e importar seu rebanho</li>
                        <li>Registrar pesagens e acompanhar o GMD</li>
                        <li>Controlar o financeiro da fazenda</li>
                        <li>Gerenciar a estrutura de pastos</li>
                    </ul>
                    <p><a href="${escapeHtml(APP_BASE_URL)}" style="background:#B6E23A;color:#1a1a1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Acessar o EIXO</a></p>
                    <p style="color:#888;font-size:12px;">Dúvidas? Use o botão "Eixo Suporte" dentro do sistema.</p>
                `,
            }).catch((err) => console.error('welcome email error:', err));
        }

        return res.status(201).json({ user: sanitizeUser(newUser) });
    } catch (error) {
        if (error?.code === 'P2002' && Array.isArray(error?.meta?.target) && error.meta.target.includes('document')) {
            return res.status(409).json({ message: `${documentType} já está cadastrado em outra conta.` });
        }
        if (error?.code === 'P2002' && Array.isArray(error?.meta?.target) && error.meta.target.includes('phone')) {
            return res.status(400).json({ message: 'Este celular já está vinculado a outra conta. Use outro número ou recupere sua conta.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao criar conta.' });
    }
});

app.use(
    ['/farms', '/lots', '/animals', '/pastos'],
    requireAuth,
);

app.use(
    ['/users', '/seasons', '/repro-events'],
    requireAuth,
    requireBillingAccess,
);

// Módulos exclusivos de planos pagos — bloqueados no backend por entitlement
app.use(
    ['/genetics', '/po'],
    requireAuth,
    requireBillingAccess,
    requireEntitlement('GENETICS', 'EIXO_DECISAO'),
);

app.use(
    ['/nutrition'],
    requireAuth,
    requireBillingAccess,
    requireEntitlement('NUTRITION', 'EIXO_GESTAO', 'EIXO_DECISAO'),
);

// ─── Recuperação de e-mail por CNPJ ──────────────────────────────────────────

// Passo 1: recebe CNPJ, acha usuário, envia OTP para o celular cadastrado
app.post('/auth/recover-email/request', async (req, res) => {
    const { document } = req.body || {};
    const normalizedCnpj = typeof document === 'string' ? document.replace(/\D/g, '') : '';

    if (normalizedCnpj.length !== 14) {
        return res.status(400).json({ message: 'Informe um CNPJ válido com 14 dígitos.' });
    }

    try {
        const user = await prisma.user.findFirst({
            where: { document: normalizedCnpj, documentType: 'CNPJ' },
            select: { phone: true, email: true },
        });

        // Resposta genérica para não revelar se o CNPJ existe ou não
        if (!user?.phone) {
            return res.json({ message: 'Se este CNPJ estiver cadastrado, um código será enviado ao celular vinculado.' });
        }

        const digits = user.phone.replace(/\D/g, '');
        const e164 = `+55${digits}`;

        if (!twilioClient || !TWILIO_VERIFY_SID) {
            return res.status(503).json({ message: 'Serviço de SMS não configurado.' });
        }

        await twilioClient.verify.v2.services(TWILIO_VERIFY_SID)
            .verifications.create({ to: e164, channel: 'sms' });

        // Mascara o celular para exibir na tela: (11) 9****-1234
        const masked = digits.length === 11
            ? `(${digits.slice(0,2)}) ${digits[2]}****-${digits.slice(-4)}`
            : `(${digits.slice(0,2)}) ****-${digits.slice(-4)}`;

        return res.json({ maskedPhone: masked });
    } catch (error) {
        console.error('recover-email/request error:', error);
        return res.status(500).json({ message: 'Erro ao processar a solicitação.' });
    }
});

// Passo 2: recebe CNPJ + código OTP, valida e retorna e-mail mascarado
app.post('/auth/recover-email/verify', async (req, res) => {
    const { document, code } = req.body || {};
    const normalizedCnpj = typeof document === 'string' ? document.replace(/\D/g, '') : '';

    if (normalizedCnpj.length !== 14 || !code) {
        return res.status(400).json({ message: 'CNPJ e código são obrigatórios.' });
    }

    try {
        const user = await prisma.user.findFirst({
            where: { document: normalizedCnpj, documentType: 'CNPJ' },
            select: { phone: true, email: true },
        });

        if (!user?.phone || !user?.email) {
            return res.status(404).json({ message: 'Cadastro não encontrado.' });
        }

        const digits = user.phone.replace(/\D/g, '');
        const e164 = `+55${digits}`;

        if (!twilioClient || !TWILIO_VERIFY_SID) {
            return res.status(503).json({ message: 'Serviço de SMS não configurado.' });
        }

        const check = await twilioClient.verify.v2.services(TWILIO_VERIFY_SID)
            .verificationChecks.create({ to: e164, code: String(code).trim() });

        if (check.status !== 'approved') {
            return res.status(400).json({ message: 'Código inválido ou expirado.' });
        }

        // Mascara o e-mail: e***@gmail.com
        const [localPart, domain] = user.email.split('@');
        const maskedEmail = `${localPart[0]}***@${domain}`;

        return res.json({ maskedEmail });
    } catch (error) {
        console.error('recover-email/verify error:', error);
        return res.status(500).json({ message: 'Erro ao verificar o código.' });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password, webDeviceKey } = req.body || {};
    const rateLimitKeys = buildLoginRateLimitKeys(email, req.ip);

    if (isAnyLoginRateLimited(rateLimitKeys)) {
        return res.status(429).json({ message: 'Muitas tentativas. Tente novamente mais tarde.' });
    }

    if (!email || !password) {
        return res.status(400).json({ message: 'Informe e-mail e senha.' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { email: normalizeEmailForLogin(email) } });
        if (!user) {
            registerFailedLogins(rateLimitKeys);
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
            registerFailedLogins(rateLimitKeys);
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const saasContext = await ensureSaasContextForUser(user.id);
        const accessContext = await ensureFieldWorkerFarmAccess(user, saasContext);

        clearLoginRateLimits(rateLimitKeys);

        // Sessão única por dispositivo real:
        // - Mantém múltiplas abas no mesmo navegador/dispositivo.
        // - Revoga apenas sessões de outro dispositivo.
        const normalizedWebDeviceKey = sanitizeWebDeviceKey(webDeviceKey);
        const currentSessionUserAgent = buildSessionUserAgent(req, normalizedWebDeviceKey);
        await prisma.session.updateMany({
            where: {
                userId: user.id,
                revokedAt: null,
                OR: [
                    // Sessões de app (com deviceId) são consideradas outro dispositivo.
                    { deviceId: { not: null } },
                    {
                        AND: [
                            { deviceId: null },
                            { userAgent: { not: currentSessionUserAgent } },
                        ],
                    },
                ],
            },
            data: { revokedAt: new Date() },
        });

        const { token, expiresAt } = await createSessionForUser(user.id, req, {
            webDeviceKey: normalizedWebDeviceKey,
        });

        res.cookie(SESSION_COOKIE_NAME, token, buildCookieOptions());
        return res.json({
            user: serializeAuthUser(user, saasContext, {
                ...accessContext,
                allowedModules: buildAllowedModulesFromPlan(user.modules, saasContext?.entitlements || [], user.roles, user.accessType),
            }),
        });
    } catch (error) {
        if (isSaasContextError(error)) {
            return res.status(403).json({ message: 'Sua conta está sem vínculo válido com uma organização. Procure o suporte.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao autenticar usuário.' });
    }
});

app.post('/auth/forgot-password', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Informe o e-mail.' });
    if (!isEmailValid(email)) return res.status(400).json({ message: 'Informe um e-mail válido.' });

    const responsePayload = {
        message: 'Se esse e-mail estiver cadastrado, você receberá as instruções em breve.',
    };
    const normalizedEmail = normalizeEmailForLogin(email);
    const rateLimitKeys = buildForgotPasswordRateLimitKeys(normalizedEmail, req.ip);
    if (isAnyForgotPasswordRateLimited(rateLimitKeys)) {
        return res.status(429).json({ message: 'Muitas tentativas. Tente novamente mais tarde.' });
    }
    registerForgotPasswordAttempts(rateLimitKeys);

    try {
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user || !resend) {
            return res.json(responsePayload);
        }

        await prisma.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
        });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashPasswordResetToken(rawToken);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        await prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });

        const resetLink = `${APP_BASE_URL}?reset=${rawToken}`;
        const safeName = escapeHtml(user.name);
        const safeResetLink = escapeHtml(resetLink);

        const sendResult = await resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: user.email,
            subject: 'Redefinir senha — EIXO',
            html: `
                <p>Olá, ${safeName}.</p>
                <p>Recebemos uma solicitação para redefinir a senha da sua conta no EIXO.</p>
                <p><a href="${safeResetLink}" style="background:#B6E23A;color:#1a1a1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Redefinir senha</a></p>
                <p>Este link expira em 30 minutos. Se você não solicitou a redefinição, ignore este e-mail.</p>
                <p style="color:#888;font-size:12px;">Link alternativo: ${safeResetLink}</p>
            `,
        });
        clearForgotPasswordAttempts(rateLimitKeys);
        console.info('[forgot-password] email-send-success', {
            email: normalizedEmail,
            timestamp: new Date().toISOString(),
            resendMessageId: sendResult?.data?.id || null,
        });
    } catch (err) {
        const safeErrorMessage = err instanceof Error ? err.message : String(err || 'Erro desconhecido');
        console.error('[forgot-password] email-send-failure', {
            email: normalizedEmail,
            timestamp: new Date().toISOString(),
            error: safeErrorMessage.slice(0, 500),
        });
        console.error('forgot-password error:', err);
    }

    return res.json(responsePayload);
});

app.post('/auth/reset-password', async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) {
        return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
    }
    if (!isPasswordStrongEnough(password)) {
        return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
    }

    try {
        const tokenHash = hashPasswordResetToken(token);
        const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

        if (!record || record.usedAt || record.expiresAt < new Date()) {
            return res.status(400).json({ message: 'Link inválido ou expirado. Solicite um novo link.' });
        }

        const hashedPassword = await bcrypt.hash(String(password), 10);

        await prisma.$transaction([
            prisma.user.update({
                where: { id: record.userId },
                data: { password: hashedPassword },
            }),
            prisma.passwordResetToken.update({
                where: { id: record.id },
                data: { usedAt: new Date() },
            }),
            prisma.session.deleteMany({ where: { userId: record.userId } }),
        ]);

        return res.json({ message: 'Senha atualizada com sucesso.' });
    } catch (err) {
        console.error('reset-password error:', err);
        return res.status(500).json({ message: 'Erro ao redefinir senha.' });
    }
});

app.post('/auth/logout', async (req, res) => {
    try {
        const sessionToken = extractSessionTokenFromRequest(req);
        if (sessionToken) {
            const tokenHash = hashSessionToken(sessionToken);
            await prisma.session.updateMany({
                where: { tokenHash, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }
        res.clearCookie(SESSION_COOKIE_NAME, buildCookieOptions());
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
        if (isSaasContextError(error)) {
            return res.status(403).json({ message: 'Conta sem vínculo válido com uma organização.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar sessão.' });
    }
});

// ─── Avatares estáticos ───────────────────────────────────────────────────────
app.get('/avatars/:filename', async (req, res) => {
    try {
        const safeFilename = path.basename(req.params.filename);
        const filePath = path.join(AVATAR_UPLOAD_ROOT, safeFilename);
        await fs.access(filePath);
        res.sendFile(filePath);
    } catch {
        return res.status(404).json({ message: 'Avatar não encontrado.' });
    }
});

// ─── Meu Perfil — rotas ───────────────────────────────────────────────────────

// PATCH /auth/me/profile — atualiza nome e e-mail
app.patch('/auth/me/profile', requireAuth, async (req, res) => {
    try {
        const { name, email } = req.body || {};
        const userId = req.user.id;
        const updates = {};

        if (name && typeof name === 'string') {
            updates.name = name.trim();
        }
        if (email && typeof email === 'string') {
            const normalizedEmail = email.trim().toLowerCase();
            if (normalizedEmail !== req.user.email) {
                const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
                if (existing && existing.id !== userId) {
                    return res.status(400).json({ message: 'Este e-mail já está em uso.' });
                }
                updates.email = normalizedEmail;
            }
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({ message: 'Nenhum campo para atualizar.' });
        }

        const updated = await prisma.user.update({ where: { id: userId }, data: updates });
        return res.json({ user: sanitizeUser(updated) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar perfil.' });
    }
});

// PATCH /auth/me/password — troca senha
app.patch('/auth/me/password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Informe a senha atual e a nova senha.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'A nova senha deve ter pelo menos 6 caracteres.' });
        }
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) {
            return res.status(400).json({ message: 'Senha atual incorreta.' });
        }
        const hashed = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
        return res.json({ message: 'Senha atualizada com sucesso.' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar senha.' });
    }
});

// PATCH /auth/me/phone — atualiza celular (exige OTP verificado)
app.patch('/auth/me/phone', requireAuth, async (req, res) => {
    try {
        const { phone } = req.body || {};
        const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
        if (!digits || digits.length < 10) {
            return res.status(400).json({ message: 'Número de celular inválido.' });
        }
        const phoneEntry = verifiedPhones.get(digits);
        const phoneIsValid = phoneEntry && (Date.now() - phoneEntry.verifiedAt) < PHONE_VERIFY_TTL_MS;
        if (!phoneIsValid) {
            return res.status(400).json({ message: 'Celular não verificado. Complete a verificação por SMS antes de salvar.' });
        }
        // Unicidade
        const existing = await prisma.user.findFirst({ where: { phone: digits, NOT: { id: req.user.id } } });
        if (existing) {
            return res.status(400).json({ message: 'Este celular já está vinculado a outra conta.' });
        }
        verifiedPhones.delete(digits);
        await prisma.user.update({ where: { id: req.user.id }, data: { phone: digits } });
        return res.json({ message: 'Celular atualizado com sucesso.' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar celular.' });
    }
});

// POST /auth/me/avatar — upload de foto (base64)
app.post('/auth/me/avatar', requireAuth, async (req, res) => {
    try {
        const { contentBase64, mimeType } = req.body || {};
        const normalizedMime = String(mimeType || '').trim().toLowerCase();
        const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
        if (!ALLOWED_AVATAR_MIMES.has(normalizedMime)) {
            return res.status(400).json({ message: 'Formato inválido. Use JPEG, PNG ou WebP.' });
        }
        const buffer = decodeBase64Payload(contentBase64);
        if (!buffer || buffer.length > 5 * 1024 * 1024) {
            return res.status(400).json({ message: 'Arquivo inválido ou maior que 5 MB.' });
        }
        await fs.mkdir(AVATAR_UPLOAD_ROOT, { recursive: true });
        const ext = normalizedMime === 'image/png' ? 'png' : normalizedMime === 'image/webp' ? 'webp' : 'jpg';
        const filename = `${req.user.id}-${Date.now()}.${ext}`;
        const filePath = path.join(AVATAR_UPLOAD_ROOT, filename);
        await fs.writeFile(filePath, buffer);
        const avatarUrl = `/avatars/${filename}`;
        await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl } });
        return res.json({ avatarUrl });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar avatar.' });
    }
});

app.patch('/auth/me/onboarding', requireAuth, async (req, res) => {
    try {
        const session = await getSessionFromRequest(req);
        if (!session?.user) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }
        await prisma.user.update({
            where: { id: session.user.id },
            data: { onboardingCompletedAt: new Date() },
        });
        return res.json({ success: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar onboarding.' });
    }
});

app.get('/users', requireAuth, async (req, res) => {
    try {
        if (!canManageOrganizationUsers(req)) {
            return res.status(403).json({ message: 'Apenas administradores podem listar usuários.' });
        }
        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(400).json({ message: 'Organização ativa não encontrada.' });
        }
        const memberships = await prisma.organizationMembership.findMany({
            where: { organizationId },
            include: {
                user: {
                    include: {
                        appActivationCodes: {
                            where: { revokedAt: null },
                            orderBy: [{ createdAt: 'desc' }],
                            take: 1,
                        },
                        appDevices: {
                            where: { isActive: true, revokedAt: null },
                            orderBy: [{ activatedAt: 'desc' }],
                            take: 1,
                        },
                    },
                },
            },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        });
        const users = await Promise.all(
            memberships.map(async (membership) => {
                const accessContext = await ensureFieldWorkerFarmAccess(membership.user, req.saas);
                return {
                    ...serializeManagedUser(membership.user, membership.role),
                    allowedFarmIds: accessContext.allowedFarmIds,
                    defaultFarmId: accessContext.defaultFarmId,
                    appContext: accessContext.appContext,
                };
            }),
        );
        return res.json({ users });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar usuários.' });
    }
});

app.post('/users', requireAuth, async (req, res) => {
    const { name, email, password, modules, profile, accessType, fieldProfile, defaultFarmId } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const requestedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPassword = String(password || '');
    const normalizedAccessType = ['WEB', 'APP_MANEJO', 'WEB_APP'].includes(String(accessType || '').trim().toUpperCase())
        ? String(accessType || '').trim().toUpperCase()
        : 'WEB';
    const normalizedProfile = String(profile || '').trim().toLowerCase();
    const normalizedFieldProfile = ['VAQUEIRO', 'ADMIN_CAMPO'].includes(String(fieldProfile || '').trim().toUpperCase())
        ? String(fieldProfile || '').trim().toUpperCase()
        : null;
    const inferredFieldProfile = normalizedFieldProfile
        || (normalizedProfile === FIELD_WORKER_ROLE || normalizedProfile === 'field_worker' ? 'VAQUEIRO' : null);
    const isFieldAccess = normalizedAccessType === 'APP_MANEJO' || normalizedAccessType === 'WEB_APP';
    const requiresAppActivation = normalizedAccessType === 'APP_MANEJO';
    const normalizedRoles = inferredFieldProfile === 'VAQUEIRO'
        ? ['user', FIELD_WORKER_ROLE]
        : inferredFieldProfile === 'ADMIN_CAMPO'
            ? ['user', FIELD_ADMIN_ROLE]
            : ['user'];
    const normalizedModules = normalizeUserModules(modules, normalizedRoles, normalizedAccessType);
    const normalizedDefaultFarmId = typeof defaultFarmId === 'string' && defaultFarmId.trim()
        ? defaultFarmId.trim()
        : null;
    const normalizedEmail = normalizedAccessType === 'APP_MANEJO' && !requestedEmail
        ? generateInternalFieldUserEmail(normalizedName)
        : requestedEmail;

    if (!normalizedName || !Array.isArray(modules)) {
        return res.status(400).json({ message: 'Dados obrigatórios ausentes.' });
    }

    if (normalizedAccessType !== 'APP_MANEJO' && !normalizedEmail) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
    }

    if (normalizedAccessType !== 'APP_MANEJO' && normalizedModules.length === 0) {
        return res.status(400).json({ message: 'Selecione ao menos um módulo.' });
    }

    if (isFieldAccess && !inferredFieldProfile) {
        return res.status(400).json({ message: 'Selecione o perfil de campo para esse acesso.' });
    }

    if (isFieldAccess && !normalizedDefaultFarmId) {
        return res.status(400).json({ message: 'Selecione a fazenda padrão do acesso de campo.' });
    }

    if (normalizedAccessType !== 'APP_MANEJO' && !isPasswordStrongEnough(normalizedPassword)) {
        return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
    }

    try {
        if (!canManageOrganizationUsers(req)) {
            return res.status(403).json({ message: 'Apenas administradores podem cadastrar usuários.' });
        }

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(400).json({ message: 'Organização ativa não encontrada.' });
        }

        if (isFieldAccess) {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: normalizedDefaultFarmId }),
                select: { id: true },
            });
            if (!farm) {
                return res.status(400).json({ message: 'Fazenda padrão inválida para esse usuário.' });
            }
        }

        // Limite de usuários do plano gratuito (3 usuários por org)
        const paidSub = await prisma.billingSubscription.findFirst({
            where: {
                organizationId,
                status: 'ACTIVE',
                NOT: { planCode: { in: ['gratis', 'free', 'gratuito'] } },
            },
        });
        if (!paidSub) {
            const memberCount = await prisma.organizationMembership.count({
                where: { organizationId },
            });
            if (memberCount >= 3) {
                return res.status(403).json({
                    code: 'user_limit_reached',
                    message: 'O plano gratuito permite até 3 usuários. Faça upgrade para adicionar mais.',
                });
            }
        }

        const emailExists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (emailExists) {
            return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
        }

        const passwordToPersist = normalizedAccessType === 'APP_MANEJO'
            ? crypto.randomBytes(24).toString('hex')
            : normalizedPassword;
        const hashedPassword = await bcrypt.hash(passwordToPersist, 10);
        const newUser = await prisma.$transaction(async (tx) => {
            const createdUser = await tx.user.create({
                data: {
                    name: normalizedName,
                    email: normalizedEmail,
                    password: hashedPassword,
                    modules: normalizedModules,
                    roles: normalizedRoles,
                    accessType: normalizedAccessType,
                    fieldProfile: inferredFieldProfile,
                    appActivationStatus: requiresAppActivation ? 'PENDENTE_ATIVACAO' : null,
                    activeOrganizationId: organizationId,
                    lastFarmId: normalizedDefaultFarmId,
                },
                include: {
                    appActivationCodes: {
                        where: { revokedAt: null },
                        orderBy: [{ createdAt: 'desc' }],
                        take: 1,
                    },
                    appDevices: {
                        where: { isActive: true, revokedAt: null },
                        orderBy: [{ activatedAt: 'desc' }],
                        take: 1,
                    },
                },
            });
            await tx.organizationMembership.create({
                data: {
                    organizationId,
                    userId: createdUser.id,
                    role: 'MEMBER',
                },
            });
            if (isFieldAccess && normalizedDefaultFarmId) {
                await tx.userFarmAccess.create({
                    data: {
                        userId: createdUser.id,
                        farmId: normalizedDefaultFarmId,
                        isDefault: true,
                    },
                });
            }
            return createdUser;
        });
        logActivity(req, { action: 'USUARIO_CRIADO', entity: 'User', entityId: newUser.id, description: `Cadastrou o usuário ${newUser.name}` });
        const accessContext = await ensureFieldWorkerFarmAccess(newUser, req.saas);
        return res.status(201).json({
            user: {
                ...serializeManagedUser(newUser, 'MEMBER'),
                allowedFarmIds: accessContext.allowedFarmIds,
                defaultFarmId: accessContext.defaultFarmId,
                appContext: accessContext.appContext,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar usuário.' });
    }
});

app.patch('/users/:id', requireAuth, async (req, res) => {
    const { name, email, modules, defaultFarmId } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedModules = normalizeUserModules(modules, ['user'], 'WEB');
    const normalizedDefaultFarmId = typeof defaultFarmId === 'string' && defaultFarmId.trim()
        ? defaultFarmId.trim()
        : null;

    if (!normalizedName || !normalizedEmail || !Array.isArray(modules)) {
        return res.status(400).json({ message: 'Dados obrigatórios ausentes.' });
    }

    if (normalizedModules.length === 0) {
        return res.status(400).json({ message: 'Selecione ao menos um módulo.' });
    }

    try {
        if (!canManageOrganizationUsers(req)) {
            return res.status(403).json({ message: 'Apenas administradores podem editar usuários.' });
        }

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(400).json({ message: 'Organização ativa não encontrada.' });
        }

        const targetUser = await prisma.user.findFirst({
            where: {
                id: req.params.id,
                memberships: {
                    some: { organizationId },
                },
            },
            include: {
                appActivationCodes: {
                    where: { revokedAt: null },
                    orderBy: [{ createdAt: 'desc' }],
                    take: 1,
                },
                appDevices: {
                    where: { isActive: true, revokedAt: null },
                    orderBy: [{ activatedAt: 'desc' }],
                    take: 1,
                },
                farmAccesses: {
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        if (targetUser.accessType === 'APP_MANEJO') {
            return res.status(400).json({ message: 'Esse acesso deve ser editado no painel do App do Manejo.' });
        }

        if (normalizedDefaultFarmId) {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: normalizedDefaultFarmId }),
                select: { id: true },
            });
            if (!farm) {
                return res.status(400).json({ message: 'Fazenda padrão inválida para esse usuário.' });
            }
        }

        const emailOwner = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (emailOwner && emailOwner.id !== targetUser.id) {
            return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
        }

        const updatedUser = await prisma.$transaction(async (tx) => {
            const savedUser = await tx.user.update({
                where: { id: targetUser.id },
                data: {
                    name: normalizedName,
                    email: normalizedEmail,
                    modules: normalizedModules,
                    lastFarmId: normalizedDefaultFarmId,
                },
                include: {
                    appActivationCodes: {
                        where: { revokedAt: null },
                        orderBy: [{ createdAt: 'desc' }],
                        take: 1,
                    },
                    appDevices: {
                        where: { isActive: true, revokedAt: null },
                        orderBy: [{ activatedAt: 'desc' }],
                        take: 1,
                    },
                },
            });

            if (normalizedDefaultFarmId && (savedUser.accessType === 'WEB_APP' || savedUser.fieldProfile)) {
                await tx.userFarmAccess.updateMany({
                    where: { userId: savedUser.id, isDefault: true },
                    data: { isDefault: false },
                });
                const existingAccess = await tx.userFarmAccess.findFirst({
                    where: { userId: savedUser.id, farmId: normalizedDefaultFarmId },
                    select: { id: true },
                });
                if (existingAccess) {
                    await tx.userFarmAccess.update({
                        where: { id: existingAccess.id },
                        data: { isDefault: true },
                    });
                } else {
                    await tx.userFarmAccess.create({
                        data: {
                            userId: savedUser.id,
                            farmId: normalizedDefaultFarmId,
                            isDefault: true,
                        },
                    });
                }
            }

            return savedUser;
        });

        logActivity(req, { action: 'USUARIO_EDITADO', entity: 'User', entityId: updatedUser.id, description: `Editou o usuário ${updatedUser.name}` });
        const accessContext = await ensureFieldWorkerFarmAccess(updatedUser, req.saas);
        return res.json({
            user: {
                ...serializeManagedUser(updatedUser, 'MEMBER'),
                allowedFarmIds: accessContext.allowedFarmIds,
                defaultFarmId: accessContext.defaultFarmId,
                appContext: accessContext.appContext,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar usuário.' });
    }
});

app.patch('/users/:id/app-access', requireAuth, async (req, res) => {
    const { name, fieldProfile, defaultFarmId } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedFieldProfile = ['VAQUEIRO', 'ADMIN_CAMPO'].includes(String(fieldProfile || '').trim().toUpperCase())
        ? String(fieldProfile || '').trim().toUpperCase()
        : null;
    const normalizedDefaultFarmId = typeof defaultFarmId === 'string' && defaultFarmId.trim()
        ? defaultFarmId.trim()
        : null;

    if (!normalizedName || !normalizedFieldProfile || !normalizedDefaultFarmId) {
        return res.status(400).json({ message: 'Nome, perfil e fazenda são obrigatórios.' });
    }

    try {
        if (!canManageOrganizationUsers(req)) {
            return res.status(403).json({ message: 'Apenas administradores podem editar colaboradores.' });
        }

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(400).json({ message: 'Organização ativa não encontrada.' });
        }

        const targetUser = await prisma.user.findFirst({
            where: {
                id: req.params.id,
                memberships: {
                    some: { organizationId },
                },
            },
            include: {
                appActivationCodes: {
                    where: { revokedAt: null },
                    orderBy: [{ createdAt: 'desc' }],
                    take: 1,
                },
                appDevices: {
                    where: { isActive: true, revokedAt: null },
                    orderBy: [{ activatedAt: 'desc' }],
                    take: 1,
                },
            },
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'Colaborador não encontrado.' });
        }

        if (targetUser.accessType === 'WEB') {
            return res.status(400).json({ message: 'Esse acesso deve ser editado no painel do sistema web.' });
        }

        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: normalizedDefaultFarmId }),
            select: { id: true },
        });
        if (!farm) {
            return res.status(400).json({ message: 'Fazenda inválida para esse colaborador.' });
        }

        const fieldRole = normalizedFieldProfile === 'ADMIN_CAMPO' ? FIELD_ADMIN_ROLE : FIELD_WORKER_ROLE;
        const nextRoles = Array.from(new Set([
            ...targetUser.roles.filter((role) => role !== FIELD_WORKER_ROLE && role !== FIELD_ADMIN_ROLE),
            'user',
            fieldRole,
        ]));
        const nextModules = normalizeUserModules(targetUser.modules, nextRoles, targetUser.accessType);

        const updatedUser = await prisma.$transaction(async (tx) => {
            const savedUser = await tx.user.update({
                where: { id: targetUser.id },
                data: {
                    name: normalizedName,
                    roles: nextRoles,
                    modules: nextModules,
                    fieldProfile: normalizedFieldProfile,
                    lastFarmId: normalizedDefaultFarmId,
                },
                include: {
                    appActivationCodes: {
                        where: { revokedAt: null },
                        orderBy: [{ createdAt: 'desc' }],
                        take: 1,
                    },
                    appDevices: {
                        where: { isActive: true, revokedAt: null },
                        orderBy: [{ activatedAt: 'desc' }],
                        take: 1,
                    },
                },
            });

            await tx.userFarmAccess.updateMany({
                where: { userId: savedUser.id, isDefault: true },
                data: { isDefault: false },
            });
            const existingAccess = await tx.userFarmAccess.findFirst({
                where: { userId: savedUser.id, farmId: normalizedDefaultFarmId },
                select: { id: true },
            });
            if (existingAccess) {
                await tx.userFarmAccess.update({
                    where: { id: existingAccess.id },
                    data: { isDefault: true },
                });
            } else {
                await tx.userFarmAccess.create({
                    data: {
                        userId: savedUser.id,
                        farmId: normalizedDefaultFarmId,
                        isDefault: true,
                    },
                });
            }

            return savedUser;
        });

        logActivity(req, { action: 'COLABORADOR_APP_EDITADO', entity: 'User', entityId: updatedUser.id, description: `Editou o colaborador ${updatedUser.name}` });
        const accessContext = await ensureFieldWorkerFarmAccess(updatedUser, req.saas);
        return res.json({
            user: {
                ...serializeManagedUser(updatedUser, 'MEMBER'),
                allowedFarmIds: accessContext.allowedFarmIds,
                defaultFarmId: accessContext.defaultFarmId,
                appContext: accessContext.appContext,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar colaborador.' });
    }
});

app.delete('/users/:id', requireAuth, async (req, res) => {
    try {
        if (!canManageOrganizationUsers(req)) {
            return res.status(403).json({ message: 'Apenas administradores podem excluir usuários.' });
        }

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(400).json({ message: 'Organização ativa não encontrada.' });
        }

        if (req.params.id === req.user?.id) {
            return res.status(400).json({ message: 'Você não pode excluir o seu próprio acesso.' });
        }

        const membershipCount = await prisma.organizationMembership.count({
            where: { organizationId },
        });
        if (membershipCount <= 1) {
            return res.status(400).json({ message: 'Não é possível excluir o único usuário da organização.' });
        }

        const targetUser = await prisma.user.findFirst({
            where: {
                id: req.params.id,
                memberships: {
                    some: { organizationId },
                },
            },
            select: { id: true, name: true },
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.session.deleteMany({ where: { userId: targetUser.id } });
            await tx.appDevice.deleteMany({ where: { userId: targetUser.id } });
            await tx.appActivationCode.deleteMany({ where: { userId: targetUser.id } });
            await tx.userFarmAccess.deleteMany({ where: { userId: targetUser.id } });
            await tx.organizationMembership.deleteMany({ where: { organizationId, userId: targetUser.id } });
            await tx.user.delete({ where: { id: targetUser.id } });
        });

        logActivity(req, { action: 'USUARIO_EXCLUIDO', entity: 'User', entityId: targetUser.id, description: `Excluiu o usuário ${targetUser.name}` });
        return res.status(204).send();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir usuário.' });
    }
});

app.post('/users/:id/app-code', requireAuth, async (req, res) => {
    try {
        if (!canManageOrganizationUsers(req)) {
            return res.status(403).json({ message: 'Apenas administradores podem gerar codigo.' });
        }

        const targetUser = await prisma.user.findFirst({
            where: {
                id: req.params.id,
                memberships: {
                    some: { organizationId: req.saas?.organizationId || null },
                },
            },
            include: {
                farmAccesses: {
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'Usuario nao encontrado.' });
        }
        if (targetUser.accessType !== 'APP_MANEJO') {
            return res.status(400).json({ message: 'Esse usuario nao usa App do Manejo.' });
        }
        if (!targetUser.fieldProfile) {
            return res.status(400).json({ message: 'Defina o perfil de campo antes de gerar o codigo.' });
        }

        const defaultFarmId = targetUser.farmAccesses.find((item) => item.isDefault)?.farmId
            || targetUser.farmAccesses[0]?.farmId
            || targetUser.lastFarmId
            || null;

        if (!defaultFarmId) {
            return res.status(400).json({ message: 'Usuario sem fazenda padrao vinculada.' });
        }

        const code = generateActivationCode();
        const codeHash = hashActivationCode(code);
        const expiresAt = new Date(Date.now() + APP_ACTIVATION_CODE_TTL_MS);

        await prisma.$transaction([
            prisma.appActivationCode.updateMany({
                where: {
                    userId: targetUser.id,
                    usedAt: null,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                },
                data: { revokedAt: new Date() },
            }),
            prisma.user.update({
                where: { id: targetUser.id },
                data: { appActivationStatus: 'PENDENTE_ATIVACAO' },
            }),
            prisma.appActivationCode.create({
                data: {
                    userId: targetUser.id,
                    organizationId: req.saas.organizationId,
                    farmId: defaultFarmId,
                    codeHash,
                    expiresAt,
                    createdById: req.user.id,
                },
            }),
        ]);

        return res.json({
            code,
            expiresAt: expiresAt.toISOString(),
            userId: targetUser.id,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao gerar codigo de ativacao.' });
    }
});

app.post('/users/:id/revoke-device', requireAuth, async (req, res) => {
    try {
        if (!canManageOrganizationUsers(req)) {
            return res.status(403).json({ message: 'Apenas administradores podem revogar aparelho.' });
        }

        const targetUser = await prisma.user.findFirst({
            where: {
                id: req.params.id,
                memberships: {
                    some: { organizationId: req.saas?.organizationId || null },
                },
            },
            select: { id: true, accessType: true },
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'Usuario nao encontrado.' });
        }
        if (targetUser.accessType !== 'APP_MANEJO') {
            return res.status(400).json({ message: 'Esse usuario nao possui aparelho vinculado no app.' });
        }

        const activeDevice = await prisma.appDevice.findFirst({
            where: {
                userId: targetUser.id,
                organizationId: req.saas.organizationId,
                isActive: true,
                revokedAt: null,
            },
            orderBy: { activatedAt: 'desc' },
        });

        if (!activeDevice) {
            return res.status(400).json({ message: 'Nenhum aparelho ativo para revogar.' });
        }

        await prisma.$transaction([
            prisma.appDevice.update({
                where: { id: activeDevice.id },
                data: {
                    isActive: false,
                    revokedAt: new Date(),
                },
            }),
            prisma.session.updateMany({
                where: {
                    userId: targetUser.id,
                    deviceId: activeDevice.id,
                    revokedAt: null,
                },
                data: { revokedAt: new Date() },
            }),
            prisma.user.update({
                where: { id: targetUser.id },
                data: { appActivationStatus: 'APARELHO_REVOGADO' },
            }),
        ]);

        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao revogar aparelho.' });
    }
});

// ─── Convites ─────────────────────────────────────────────────────────────────

app.post('/invitations', requireAuth, async (req, res) => {
    try {
        const membershipRole = String(req.saas?.membershipRole || '').trim().toUpperCase();
        if (membershipRole !== 'OWNER') {
            return res.status(403).json({ message: 'Apenas o Proprietário pode convidar usuários.' });
        }

        const { email, role } = req.body || {};
        if (!email || !role) {
            return res.status(400).json({ message: 'E-mail e papel são obrigatórios.' });
        }
        if (!['OWNER', 'ADMIN', 'MEMBER'].includes(role)) {
            return res.status(400).json({ message: 'Papel inválido.' });
        }

        const orgId = req.saas?.organizationId;
        if (!orgId) {
            return res.status(400).json({ message: 'Organização não encontrada.' });
        }

        const normalizedEmail = String(email).toLowerCase().trim();

        // Verificar se já é membro
        const existingMember = await prisma.organizationMembership.findFirst({
            where: { organizationId: orgId, user: { email: normalizedEmail } },
        });
        if (existingMember) {
            return res.status(409).json({ message: 'Este e-mail já é membro da organização.' });
        }

        // Cancelar convites pendentes para o mesmo e-mail
        await prisma.invitation.updateMany({
            where: { organizationId: orgId, email: normalizedEmail, acceptedAt: null },
            data: { acceptedAt: new Date() },
        });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        await prisma.invitation.create({
            data: { organizationId: orgId, email: normalizedEmail, role, token: rawToken, expiresAt },
        });

        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        const inviteLink = `${APP_BASE_URL}?invite=${rawToken}`;
        const safeLink = escapeHtml(inviteLink);
        const safeOrg = escapeHtml(org?.name || 'EIXO');
        const roleLabel = role === 'ADMIN' ? 'Gestor' : role === 'OWNER' ? 'Proprietário' : 'Operador';

        if (resend) {
            await resend.emails.send({
                from: RESEND_FROM_EMAIL,
                to: normalizedEmail,
                subject: `Você foi convidado para ${safeOrg} — EIXO`,
                html: `
                    <p>Você foi convidado para fazer parte de <strong>${safeOrg}</strong> no EIXO como <strong>${roleLabel}</strong>.</p>
                    <p><a href="${safeLink}" style="background:#B6E23A;color:#1a1a1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Aceitar convite</a></p>
                    <p>Este link expira em 48 horas. Se você não conhece esta organização, ignore este e-mail.</p>
                    <p style="color:#888;font-size:12px;">Link alternativo: ${safeLink}</p>
                `,
            });
        }

        return res.json({ message: 'Convite enviado.' });
    } catch (error) {
        console.error('invitation create error:', error);
        return res.status(500).json({ message: 'Erro ao enviar convite.' });
    }
});

app.get('/invitations/:token', async (req, res) => {
    try {
        const invitation = await prisma.invitation.findUnique({
            where: { token: String(req.params.token) },
            include: { organization: { select: { name: true } } },
        });
        if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
            return res.status(404).json({ message: 'Convite inválido ou expirado.' });
        }
        return res.json({
            email: invitation.email,
            orgName: invitation.organization?.name || '',
            role: invitation.role,
        });
    } catch (error) {
        console.error('invitation get error:', error);
        return res.status(500).json({ message: 'Erro ao verificar convite.' });
    }
});

app.post('/invitations/accept', async (req, res) => {
    try {
        const { token, name, password } = req.body || {};
        if (!token || !name || !password) {
            return res.status(400).json({ message: 'Token, nome e senha são obrigatórios.' });
        }
        if (String(password).length < 8) {
            return res.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres.' });
        }

        const invitation = await prisma.invitation.findUnique({
            where: { token: String(token) },
        });
        if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
            return res.status(400).json({ message: 'Convite inválido ou expirado.' });
        }

        // Usuário já existe — só vincular à organização
        const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
        if (existingUser) {
            await prisma.$transaction([
                prisma.organizationMembership.upsert({
                    where: { organizationId_userId: { organizationId: invitation.organizationId, userId: existingUser.id } },
                    create: { organizationId: invitation.organizationId, userId: existingUser.id, role: invitation.role },
                    update: { role: invitation.role },
                }),
                prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
            ]);
            return res.json({ message: 'Conta vinculada com sucesso. Faça login.' });
        }

        // Módulos padrão por papel
        const defaultModules = invitation.role === 'MEMBER'
            ? ['Fazendas', 'Rebanho Comercial']
            : ['Fazendas', 'Rebanho Comercial', 'Nutrição', 'Financeiro'];

        const hashedPassword = await bcrypt.hash(String(password), 10);

        await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    name: String(name).trim(),
                    email: invitation.email,
                    password: hashedPassword,
                    modules: defaultModules,
                    activeOrganizationId: invitation.organizationId,
                    termsAcceptedAt: new Date(),
                    termsVersion: '1.0',
                },
            });
            await tx.organizationMembership.create({
                data: { organizationId: invitation.organizationId, userId: newUser.id, role: invitation.role },
            });
            await tx.invitation.update({
                where: { id: invitation.id },
                data: { acceptedAt: new Date() },
            });
        });

        return res.json({ message: 'Conta criada com sucesso. Faça login.' });
    } catch (error) {
        console.error('invitation accept error:', error);
        return res.status(500).json({ message: 'Erro ao aceitar convite.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

app.post('/app/activate', async (req, res) => {
    const {
        code,
        deviceFingerprint,
        deviceLabel,
        platform,
        appVersion,
    } = req.body || {};

    const normalizedCode = normalizeActivationCode(code);
    const normalizedDeviceFingerprint = String(deviceFingerprint || '').trim();

    if (!normalizedCode || !normalizedDeviceFingerprint) {
        return res.status(400).json({ message: 'Informe codigo e identificador do aparelho.' });
    }

    try {
        const activationCode = await prisma.appActivationCode.findFirst({
            where: {
                codeHash: hashActivationCode(normalizedCode),
                revokedAt: null,
            },
            include: {
                user: {
                    include: {
                        farmAccesses: {
                            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                        },
                    },
                },
            },
        });

        if (!activationCode) {
            return res.status(401).json({ message: 'Codigo invalido.' });
        }
        if (activationCode.usedAt) {
            return res.status(401).json({ message: 'Esse codigo ja foi utilizado.' });
        }
        if (activationCode.expiresAt.getTime() <= Date.now()) {
            await prisma.user.update({
                where: { id: activationCode.userId },
                data: { appActivationStatus: 'CODIGO_EXPIRADO' },
            });
            return res.status(401).json({ message: 'Codigo expirado. Gere um novo codigo no sistema.' });
        }

        const targetUser = activationCode.user;
        if (!targetUser || targetUser.accessType === 'WEB' || !targetUser.fieldProfile) {
            return res.status(400).json({ message: 'Usuario sem acesso valido ao App do Manejo.' });
        }
        if (targetUser.appActivationStatus === 'BLOQUEADO') {
            return res.status(403).json({ message: 'Acesso bloqueado. Procure a fazenda.' });
        }

        const saasContext = await ensureSaasContextForUser(targetUser.id);
        const accessContext = await ensureFieldWorkerFarmAccess(targetUser, saasContext);

        const activeDevice = await prisma.appDevice.findFirst({
            where: {
                userId: targetUser.id,
                isActive: true,
                revokedAt: null,
            },
            orderBy: { activatedAt: 'desc' },
        });

        if (activeDevice && activeDevice.deviceFingerprint !== normalizedDeviceFingerprint) {
            return res.status(409).json({
                message: 'Ja existe um aparelho ativo para esse usuario. A troca exige revogacao manual pela fazenda.',
            });
        }

        let device = activeDevice;

        const result = await prisma.$transaction(async (tx) => {
            const nextDevice = device
                ? await tx.appDevice.update({
                    where: { id: device.id },
                    data: {
                        deviceLabel: typeof deviceLabel === 'string' ? deviceLabel.trim() || null : null,
                        platform: typeof platform === 'string' ? platform.trim() || null : null,
                        appVersion: typeof appVersion === 'string' ? appVersion.trim() || null : null,
                        lastSeenAt: new Date(),
                    },
                })
                : await tx.appDevice.create({
                    data: {
                        userId: targetUser.id,
                        organizationId: saasContext.organizationId,
                        farmId: accessContext.defaultFarmId,
                        deviceFingerprint: normalizedDeviceFingerprint,
                        deviceLabel: typeof deviceLabel === 'string' ? deviceLabel.trim() || null : null,
                        platform: typeof platform === 'string' ? platform.trim() || null : null,
                        appVersion: typeof appVersion === 'string' ? appVersion.trim() || null : null,
                        lastSeenAt: new Date(),
                    },
                });

            await tx.appActivationCode.update({
                where: { id: activationCode.id },
                data: { usedAt: new Date() },
            });

            await tx.user.update({
                where: { id: targetUser.id },
                data: { appActivationStatus: 'ATIVO' },
            });

            return nextDevice;
        });

        device = result;

        const { token, expiresAt } = await createSessionForUser(targetUser.id, req, {
            deviceId: device.id,
        });

        res.cookie(SESSION_COOKIE_NAME, token, buildCookieOptions());

        const payload = await buildAppAuthPayload(targetUser.id, { device });
        return res.json({
            sessionToken: token,
            sessionExpiresAt: expiresAt.toISOString(),
            ...payload,
        });
    } catch (error) {
        if (isSaasContextError(error)) {
            return res.status(403).json({ message: 'Conta sem vinculo valido com uma organizacao.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao ativar acesso do app.' });
    }
});

app.get('/app/me', requireAuth, async (req, res) => {
    try {
        if (req.access?.appContext?.mode !== 'field') {
            return res.status(403).json({ message: 'Esse acesso nao pertence ao App do Manejo.' });
        }
        const payload = await buildAppAuthPayload(req.user.id, { device: req.appDevice || null });
        return res.json(payload);
    } catch (error) {
        if (isSaasContextError(error)) {
            return res.status(403).json({ message: 'Conta sem vinculo valido com uma organizacao.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar sessao do app.' });
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

app.post('/farms', requireNonFieldWorker, async (req, res) => {
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
        // --- Limite de fazendas por plano ---
        const orgId = req.saas?.organizationId || null;
        if (orgId) {
            const activePaidSubscription = await prisma.billingSubscription.findFirst({
                where: {
                    organizationId: orgId,
                    status: 'ACTIVE',
                    NOT: { planCode: { in: ['gratis', 'free', 'gratuito'] } },
                },
            });
            if (!activePaidSubscription) {
                const farmCount = await prisma.farm.count({ where: { organizationId: orgId } });
                if (farmCount >= 1) {
                    return res.status(403).json({
                        code: 'farm_limit_reached',
                        message: 'O plano gratuito permite apenas 1 fazenda. Faça upgrade para cadastrar mais fazendas.',
                    });
                }
            }
        }
        // ------------------------------------

        const existingFarmAtCoordinates = await findFarmByCoordinates({
            lat: parsedLat,
            lng: parsedLng,
        });
        if (existingFarmAtCoordinates) {
            return res.status(409).json({
                message: 'Já existe uma fazenda cadastrada com essas coordenadas.',
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
        logActivity(req, { action: 'FAZENDA_CRIADA', entity: 'Farm', entityId: newFarm.id, description: `Cadastrou a fazenda ${newFarm.name}`, farmId: newFarm.id });
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

app.patch('/farms/:id', requireNonFieldWorker, async (req, res) => {
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
                  const forrageira = (paddock?.forrageira || '').trim() || null;
                  const lotacaoRaw = paddock?.lotacaoUaHa;
                  const lotacaoUaHa = lotacaoRaw !== undefined && lotacaoRaw !== null && lotacaoRaw !== ''
                      ? Number(lotacaoRaw) || null
                      : null;
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
                      forrageira,
                      lotacaoUaHa,
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
                message: 'Já existe uma fazenda cadastrada com essas coordenadas.',
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
                            forrageira: division.forrageira,
                            lotacaoUaHa: division.lotacaoUaHa,
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
                        forrageira: division.forrageira,
                        lotacaoUaHa: division.lotacaoUaHa,
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

app.delete('/farms/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(id) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        await recordActivityLog(req, {
            statusCode: 423,
            requestMeta: {
                action: 'farm_delete_blocked',
                targetType: 'farm',
                targetId: farm.id,
                result: 'blocked',
            },
        });
        return res.status(423).json({
            message: 'A exclusão direta de fazendas está temporariamente desativada por segurança.',
        });
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

app.post('/pastos', requireNonFieldWorker, async (req, res) => {
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

app.patch('/pastos/:id', requireNonFieldWorker, async (req, res) => {
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

app.patch('/farms/:id/repro-mode', requireNonFieldWorker, async (req, res) => {
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

app.post('/lots', requireNonFieldWorker, async (req, res) => {
    const { farmId, name, notes, objective, phase, status, startDate } = req.body || {};
    if (!farmId || !name?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e nome do lote.' });
    }
    const parsedStartDate = startDate ? parseDateValue(startDate) : null;
    if (startDate && !parsedStartDate) {
        return res.status(400).json({ message: 'Data de início inválida.' });
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
                objective: objective?.trim() || null,
                phase: phase?.trim() || null,
                status: status?.trim() || 'ATIVO',
                startDate: parsedStartDate,
            },
        });
        logActivity(req, { action: 'LOTE_CRIADO', entity: 'Lot', entityId: lot.id, description: `Criou o lote "${lot.name}"`, farmId: lot.farmId });
        return res.status(201).json({ lot });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar lote.' });
    }
});

app.patch('/lots/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    const { name, notes, objective, phase, status, startDate } = req.body || {};
    if (!name?.trim()) {
        return res.status(400).json({ message: 'Informe o nome do lote.' });
    }
    const parsedStartDate = startDate ? parseDateValue(startDate) : null;
    if (startDate && !parsedStartDate) {
        return res.status(400).json({ message: 'Data de início inválida.' });
    }
    try {
        const lot = await prisma.lot.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!lot) return res.status(404).json({ message: 'Lote não encontrado.' });
        const updated = await prisma.lot.update({
            where: { id },
            data: {
                name: name.trim(),
                notes: notes?.trim() || null,
                objective: objective?.trim() || null,
                phase: phase?.trim() || null,
                status: status?.trim() || 'ATIVO',
                startDate: parsedStartDate,
            },
        });
        return res.json({ lot: updated });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao editar lote.' });
    }
});

app.delete('/lots/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    try {
        const lot = await prisma.lot.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!lot) return res.status(404).json({ message: 'Lote não encontrado.' });
        await prisma.lot.delete({ where: { id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir lote.' });
    }
});

app.patch('/animals/:id', async (req, res) => {
    const { id } = req.params;
    const { lotId, brinco, raca, sexo, categoria, dataNascimento, registro } = req.body || {};
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });

        const updateData = {};

        // lotId
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
            if (!trimmed) return res.status(400).json({ message: 'Brinco não pode ser vazio.' });
            // Verificar duplicidade dentro da fazenda (exceto o próprio animal)
            const duplicate = await prisma.animal.findFirst({
                where: { farmId: animal.farmId, brinco: trimmed, id: { not: id } },
            });
            if (duplicate) return res.status(409).json({ message: `Já existe um animal com o brinco "${trimmed}" nesta fazenda.` });
            updateData.brinco = trimmed;
            updateData.identityKey = trimmed;
        }
        if (raca !== undefined) updateData.raca = raca ? String(raca).trim() : null;
        if (sexo !== undefined) {
            const validSexo = ['MACHO', 'FEMEA'];
            updateData.sexo = validSexo.includes(sexo) ? sexo : null;
        }
        if (categoria !== undefined) updateData.categoria = categoria ? String(categoria).trim() : null;
        if (dataNascimento !== undefined) {
            updateData.dataNascimento = dataNascimento ? new Date(dataNascimento) : null;
        }
        if (registro !== undefined) updateData.registro = registro ? String(registro).trim() : null;

        const updated = await prisma.animal.update({
            where: { id },
            data: updateData,
        });
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

app.get('/po/animals', requireAuth, async (req, res) => {
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
            include: {
                currentPaddock: true,
                pesagens: {
                    orderBy: { data: 'desc' },
                    take: 1,
                    select: { data: true, peso: true },
                },
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
        const decisions = animalIds.length
            ? await prisma.selectionDecision.findMany({
                where: { farmId: farm.id, animalId: { in: animalIds } },
                select: { animalId: true, decision: true },
            })
            : [];
        const decisionByAnimal = new Map(decisions.map((decision) => [decision.animalId, decision.decision]));

        const enriched = animals.map((animal) => {
            const direct = nutritionByAnimal.get(animal.id);
            const lot = animal.lotId ? nutritionByLot.get(animal.lotId) : null;
            const plan = direct?.plan || lot?.plan || null;
            return {
                ...animal,
                currentNutritionPlan: plan ? serializeNutritionPlan(plan) : null,
                selectionDecision: decisionByAnimal.get(animal.id) || null,
            };
        });

        return res.json({ animals: enriched.map(serializePoAnimal) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar animais P.O.' });
    }
});

app.post('/po/animals', requireAuth, async (req, res) => {
    const { farmId, lotId, brinco, nome, raca, sexo, dataNascimento, registro, categoria, observacoes, ultimoPeso, paddockId, paddockStartAt } = req.body || {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pesoAtual')) {
        return res.status(400).json({ message: 'Campo inválido: use "ultimoPeso" no lugar de "pesoAtual".' });
    }
    if (!farmId || !nome?.trim() || !raca?.trim() || !sexo) {
        return res.status(400).json({ message: 'Dados obrigatórios do animal P.O. ausentes.' });
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
    if (ultimoPeso !== undefined && ultimoPeso !== null && ultimoPeso !== '') {
        const parsed = parseNumber(ultimoPeso);
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

        let validPaddockId = null;
        let moveStartAt = null;
        if (paddockId) {
            const paddock = await prisma.paddock.findFirst({
                where: { id: paddockId, farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!paddock) {
                return res.status(400).json({ message: 'Pasto inválido para esta fazenda.' });
            }

            moveStartAt = paddockStartAt ? parseDateValue(paddockStartAt) : new Date();
            if (paddockStartAt && !moveStartAt) {
                return res.status(400).json({ message: 'Data de entrada no pasto inválida.' });
            }
            validPaddockId = paddock.id;
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
                    currentPaddockId: validPaddockId,
                },
            });
            if (validPaddockId && moveStartAt) {
                await tx.paddockMove.create({
                    data: {
                        farmId: farm.id,
                        paddockId: validPaddockId,
                        poAnimalId: created.id,
                        startAt: moveStartAt,
                    },
                });
            }
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

app.post('/po/animals/import-batch', requireAuth, async (req, res) => {
    const { farmId, items } = req.body || {};
    if (!farmId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'farmId e items são obrigatórios.' });
    }
    if (items.length > 500) {
        return res.status(400).json({ message: 'Limite de importação: até 500 animais por envio.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const results = [];
        let success = 0;

        for (let index = 0; index < items.length; index++) {
            const item = items[index] || {};
            const rowLabel = item.rowLabel || `Linha ${index + 2}`;
            const warnings = [];
            if (Object.prototype.hasOwnProperty.call(item, 'pesoAtual')) {
                results.push({ index, success: false, message: `${rowLabel}: campo inválido "pesoAtual". Use "ultimoPeso".` });
                continue;
            }

            const nome = String(item.nome || item.brinco || '').trim();
            const raca = String(item.raca || '').trim();
            const sexoEnum = normalizeSexo(item.sexo);
            const paddockId = String(item.paddockId || '').trim();

            if (!nome || !raca || !sexoEnum) {
                results.push({ index, success: false, message: `${rowLabel}: campos obrigatórios ausentes (nome, raça, sexo).` });
                continue;
            }

            const birthDate = item.dataNascimento ? parseDateValue(item.dataNascimento) : null;
            if (item.dataNascimento && !birthDate) {
                results.push({ index, success: false, message: `${rowLabel} (${nome}): data de nascimento inválida.` });
                continue;
            }

            let parsedPesoAtual = 0;
            if (item.ultimoPeso !== undefined && item.ultimoPeso !== null && item.ultimoPeso !== '') {
                const parsed = parseNumber(item.ultimoPeso);
                if (parsed === null || parsed <= 0) {
                    results.push({ index, success: false, message: `${rowLabel} (${nome}): peso atual inválido.` });
                    continue;
                }
                parsedPesoAtual = parsed;
            }

            try {
                const createdAnimal = await prisma.$transaction(async (tx) => {
                    let validLotId = null;
                    if (item.lotId) {
                        const lot = await tx.poLot.findFirst({
                            where: { id: String(item.lotId), farmId: String(farmId) },
                        });
                        if (!lot) throw new Error('Lote P.O. inválido.');
                        validLotId = lot.id;
                    }

                    let validPaddockId = null;
                    let moveStartAt = null;
                    if (paddockId) {
                        const paddock = await tx.paddock.findFirst({
                            where: { id: paddockId, farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                        });
                        if (!paddock) throw new Error('Pasto inválido para esta fazenda.');

                        moveStartAt = item.paddockStartAt ? parseDateValue(item.paddockStartAt) : new Date();
                        if (item.paddockStartAt && !moveStartAt) throw new Error('Data de entrada no pasto inválida.');
                        validPaddockId = paddock.id;
                    }

                    const created = await tx.poAnimal.create({
                        data: {
                            farmId: String(farmId),
                            lotId: validLotId,
                            brinco: item.brinco ? String(item.brinco).trim() || null : null,
                            nome,
                            raca,
                            sexo: sexoEnum,
                            dataNascimento: birthDate,
                            pesoAtual: parsedPesoAtual,
                            gmd: null,
                            gmd30: null,
                            registro: item.registro ? String(item.registro).trim() || null : null,
                            categoria: item.categoria ? String(item.categoria).trim() || null : null,
                            observacoes: item.observacoes ? String(item.observacoes).trim() || null : null,
                            currentPaddockId: validPaddockId,
                        },
                    });

                    if (validPaddockId && moveStartAt) {
                        await tx.paddockMove.create({
                            data: { farmId: String(farmId), paddockId: validPaddockId, poAnimalId: created.id, startAt: moveStartAt },
                        });
                    }

                    const weighingsInput = Array.isArray(item.weighings) ? item.weighings : [];
                    const parsedWeighings = weighingsInput
                        .map((weighing) => {
                            const date = parseDateValue(weighing?.data);
                            const weight = parseNumber(weighing?.peso);
                            if (!date || weight === null || weight <= 0) return null;
                            return { date, weight };
                        })
                        .filter(Boolean)
                        .sort((left, right) => left.date.getTime() - right.date.getTime());

                    if (weighingsInput.length > 0 && parsedWeighings.length === 0) {
                        warnings.push(`${rowLabel} (${nome}): pesagens ignoradas por dados inválidos.`);
                    }
                    if (parsedWeighings.length === 0 && parsedPesoAtual > 0) {
                        parsedWeighings.push({ date: new Date(), weight: parsedPesoAtual });
                    }

                    let previous = null;
                    for (const weighing of parsedWeighings) {
                        let gmdValue = 0;
                        if (previous) {
                            const diffDaysValue = diffDaysFloat(weighing.date, previous.date);
                            if (diffDaysValue > 0) gmdValue = (weighing.weight - previous.weight) / diffDaysValue;
                        }
                        await tx.poWeighing.create({
                            data: {
                                poAnimalId: created.id,
                                farmId: String(farmId),
                                data: weighing.date,
                                peso: weighing.weight,
                                gmd: gmdValue,
                            },
                        });
                        previous = weighing;
                    }

                    if (parsedWeighings.length > 0) {
                        const allWeighings = await tx.poWeighing.findMany({
                            where: { poAnimalId: created.id },
                            orderBy: { data: 'asc' },
                        });
                        const metrics = calculateGmdMetrics(
                            allWeighings.map((row) => ({ date: row.data, weight: row.peso })),
                        );
                        const latest = allWeighings[allWeighings.length - 1];
                        await tx.poAnimal.update({
                            where: { id: created.id },
                            data: { pesoAtual: latest?.peso ?? created.pesoAtual, gmd: metrics.gmdLast, gmd30: metrics.gmd30 },
                        });
                    }

                    return created;
                });

                success += 1;
                results.push({ index, success: true, animalId: createdAnimal.id, nome, warnings });
            } catch (error) {
                if (error?.code === 'P2002') {
                    results.push({ index, success: false, message: `${rowLabel} (${nome}): brinco já cadastrado.` });
                } else {
                    results.push({ index, success: false, message: `${rowLabel} (${nome}): ${error?.message || 'erro ao importar.'}` });
                }
            }
        }

        if (success > 0) {
            logActivity(req, {
                action: 'PO_ANIMAL_IMPORT_BATCH',
                entity: 'PoAnimal',
                description: `Importou ${success} animal(is) P.O. em lote`,
                farmId: String(farmId),
            });
        }

        return res.status(200).json({ total: items.length, success, failures: items.length - success, results });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao importar animais P.O. em lote.' });
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
    const { data, date, peso, weightKg, notes, forceReplace } = req.body || {};

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
            if (forceReplace === true) {
                await tx.poWeighing.deleteMany({
                    where: { poAnimalId: id, data: weighingDate },
                });
            }

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

registerAcasalamentoRoutes({
    app,
    prisma,
    buildFarmScopeFilter,
    buildFarmRelationFilter,
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
            include: { bullAnimal: true, bullPoAnimal: true },
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
        bullAnimalId,
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

        let validAnimalBullId = null;
        if (bullAnimalId) {
            const bull = await findInventoryAnimal({ id: bullAnimalId, farmId: farm.id });
            if (!bull) {
                return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
            }
            validAnimalBullId = bull.id;
        }

        let validBullId = null;
        if (bullPoAnimalId) {
            const bull = await findLegacyPoAnimal({ id: bullPoAnimalId, farmId: farm.id });
            if (!bull) {
                return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
            }
            validBullId = bull.id;
        }

        if (!validAnimalBullId && !validBullId && !trimmedName) {
            return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
        }

        const batch = await prisma.semenBatch.create({
            data: {
                farmId: farm.id,
                bullAnimalId: validAnimalBullId,
                bullPoAnimalId: validBullId,
                bullName: validAnimalBullId || validBullId ? null : trimmedName,
                bullRegistry: validAnimalBullId || validBullId ? null : trimmedRegistry || null,
                fornecedor: trimmedFornecedor || null,
                lote: lote.trim(),
                dataColeta: collectionDate,
                dosesTotal: totalValue,
                dosesDisponiveis: availableValue,
                localArmazenamento: trimmedLocal || null,
                observacoes: trimmedObservacoes || null,
            },
        });

        return res.status(201).json({ batch: serializeSemenBatch({ ...batch, bullAnimal: null, bullPoAnimal: null }) });
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
        bullAnimalId,
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

        let nextAnimalBullId = batch.bullAnimalId;
        if (bullAnimalId !== undefined) {
            nextAnimalBullId = bullAnimalId ? String(bullAnimalId) : null;
            if (nextAnimalBullId) {
                const bull = await findInventoryAnimal({ id: nextAnimalBullId, farmId: batch.farmId });
                if (!bull) {
                    return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
                }
                updates.bullAnimalId = bull.id;
                updates.bullPoAnimalId = null;
                updates.bullName = bullName !== undefined ? trimmedName || null : null;
                updates.bullRegistry = bullRegistry !== undefined ? trimmedRegistry || null : null;
            } else {
                updates.bullAnimalId = null;
            }
        }

        let nextBullId = bullAnimalId !== undefined && bullAnimalId ? null : batch.bullPoAnimalId;
        if (bullPoAnimalId !== undefined) {
            nextBullId = bullPoAnimalId ? String(bullPoAnimalId) : null;
            if (nextBullId) {
                const bull = await findLegacyPoAnimal({ id: nextBullId, farmId: batch.farmId });
                if (!bull) {
                    return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
                }
                updates.bullPoAnimalId = bull.id;
                updates.bullAnimalId = null;
                updates.bullName = bullName !== undefined ? trimmedName || null : null;
                updates.bullRegistry = bullRegistry !== undefined ? trimmedRegistry || null : null;
            } else {
                updates.bullPoAnimalId = null;
            }
        }

        if (nextAnimalBullId === null && nextBullId === null) {
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
            include: { bullAnimal: true, bullPoAnimal: true },
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
            include: { donorAnimal: true, donorPoAnimal: true, sireAnimal: true, sirePoAnimal: true },
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
        donorAnimalId,
        donorPoAnimalId,
        donorName,
        donorRegistry,
        sireAnimalId,
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

        let validDonorAnimalId = null;
        if (donorAnimalId) {
            const donor = await findInventoryAnimal({ id: donorAnimalId, farmId: farm.id });
            if (!donor) {
                return res.status(404).json({ message: 'Doadora não encontrada no rebanho.' });
            }
            validDonorAnimalId = donor.id;
        }

        let validDonorId = null;
        if (donorPoAnimalId) {
            const donor = await findLegacyPoAnimal({ id: donorPoAnimalId, farmId: farm.id });
            if (!donor) {
                return res.status(404).json({ message: 'Doadora P.O. não encontrada.' });
            }
            validDonorId = donor.id;
        }

        let validSireAnimalId = null;
        if (sireAnimalId) {
            const sire = await findInventoryAnimal({ id: sireAnimalId, farmId: farm.id });
            if (!sire) {
                return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
            }
            validSireAnimalId = sire.id;
        }

        let validSireId = null;
        if (sirePoAnimalId) {
            const sire = await findLegacyPoAnimal({ id: sirePoAnimalId, farmId: farm.id });
            if (!sire) {
                return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
            }
            validSireId = sire.id;
        }

        if (!validDonorAnimalId && !validDonorId && !trimmedDonorName) {
            return res.status(400).json({ message: 'Informe o nome da doadora externa.' });
        }
        if (!validSireAnimalId && !validSireId && !trimmedSireName) {
            return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
        }

        const batch = await prisma.embryoBatch.create({
            data: {
                farmId: farm.id,
                donorAnimalId: validDonorAnimalId,
                donorPoAnimalId: validDonorId,
                donorName: validDonorAnimalId || validDonorId ? null : trimmedDonorName,
                donorRegistry: validDonorAnimalId || validDonorId ? null : trimmedDonorRegistry || null,
                sireAnimalId: validSireAnimalId,
                sirePoAnimalId: validSireId,
                sireName: validSireAnimalId || validSireId ? null : trimmedSireName,
                sireRegistry: validSireAnimalId || validSireId ? null : trimmedSireRegistry || null,
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

        return res.status(201).json({ batch: serializeEmbryoBatch({ ...batch, donorAnimal: null, donorPoAnimal: null, sireAnimal: null, sirePoAnimal: null }) });
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
        donorAnimalId,
        donorPoAnimalId,
        donorName,
        donorRegistry,
        sireAnimalId,
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

        let nextDonorAnimalId = batch.donorAnimalId;
        if (donorAnimalId !== undefined) {
            nextDonorAnimalId = donorAnimalId ? String(donorAnimalId) : null;
            if (nextDonorAnimalId) {
                const donor = await findInventoryAnimal({ id: nextDonorAnimalId, farmId: batch.farmId });
                if (!donor) {
                    return res.status(404).json({ message: 'Doadora não encontrada no rebanho.' });
                }
                updates.donorAnimalId = donor.id;
                updates.donorPoAnimalId = null;
                updates.donorName = donorName !== undefined ? trimmedDonorName || null : null;
                updates.donorRegistry = donorRegistry !== undefined ? trimmedDonorRegistry || null : null;
            } else {
                updates.donorAnimalId = null;
            }
        }

        let nextDonorId = donorAnimalId !== undefined && donorAnimalId ? null : batch.donorPoAnimalId;
        if (donorPoAnimalId !== undefined) {
            nextDonorId = donorPoAnimalId ? String(donorPoAnimalId) : null;
            if (nextDonorId) {
                const donor = await findLegacyPoAnimal({ id: nextDonorId, farmId: batch.farmId });
                if (!donor) {
                    return res.status(404).json({ message: 'Doadora P.O. não encontrada.' });
                }
                updates.donorPoAnimalId = donor.id;
                updates.donorAnimalId = null;
                updates.donorName = donorName !== undefined ? trimmedDonorName || null : null;
                updates.donorRegistry = donorRegistry !== undefined ? trimmedDonorRegistry || null : null;
            } else {
                updates.donorPoAnimalId = null;
            }
        }

        let nextSireAnimalId = batch.sireAnimalId;
        if (sireAnimalId !== undefined) {
            nextSireAnimalId = sireAnimalId ? String(sireAnimalId) : null;
            if (nextSireAnimalId) {
                const sire = await findInventoryAnimal({ id: nextSireAnimalId, farmId: batch.farmId });
                if (!sire) {
                    return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
                }
                updates.sireAnimalId = sire.id;
                updates.sirePoAnimalId = null;
                updates.sireName = sireName !== undefined ? trimmedSireName || null : null;
                updates.sireRegistry = sireRegistry !== undefined ? trimmedSireRegistry || null : null;
            } else {
                updates.sireAnimalId = null;
            }
        }

        let nextSireId = sireAnimalId !== undefined && sireAnimalId ? null : batch.sirePoAnimalId;
        if (sirePoAnimalId !== undefined) {
            nextSireId = sirePoAnimalId ? String(sirePoAnimalId) : null;
            if (nextSireId) {
                const sire = await findLegacyPoAnimal({ id: nextSireId, farmId: batch.farmId });
                if (!sire) {
                    return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
                }
                updates.sirePoAnimalId = sire.id;
                updates.sireAnimalId = null;
                updates.sireName = sireName !== undefined ? trimmedSireName || null : null;
                updates.sireRegistry = sireRegistry !== undefined ? trimmedSireRegistry || null : null;
            } else {
                updates.sirePoAnimalId = null;
            }
        }

        if (nextDonorAnimalId === null && nextDonorId === null) {
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

        if (nextSireAnimalId === null && nextSireId === null) {
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
            include: { donorAnimal: true, donorPoAnimal: true, sireAnimal: true, sirePoAnimal: true },
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

app.get('/animals', requireAuth, async (req, res) => {
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

app.post('/animals', requireAuth, async (req, res) => {
    const { farmId, lotId, brinco, raca, sexo, dataNascimento, ultimoPeso, paddockId, paddockStartAt, valorCompra, dataCompra, tipoCadastro,
            tatuagem, sisbov, maeId, maeNome, paiId, paiNome } = req.body || {};
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

        const animal = await prisma.$transaction(async (tx) => {
            const created = await tx.animal.create({
                data: {
                    farmId,
                    lotId: validLotId,
                    brinco: brinco.trim(),
                    identityKey: brinco.trim(),
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
                },
            });
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
                    },
                });
                await tx.financialTransaction.create({
                    data: {
                        farmId,
                        type: catMap.type,
                        categoria: catMap.categoria,
                        accountCategoryId: catMap.categoryId,
                        valor: parsedValorCompra,
                        data: compraDate,
                        status: 'PAGO',
                        descricao: `Compra de animal — ${brinco.trim()}`,
                        herdEventId: herdEvent.id,
                    },
                });
            }

            return created;
        });

        logActivity(req, { action: 'ANIMAL_CRIADO', entity: 'Animal', entityId: animal.id, description: `Cadastrou o animal ${brinco.trim()}`, farmId });
        return res.status(201).json({ animal: serializeAnimal(animal) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar animal.' });
    }
});

// ── Importação em lote (linha a linha com retorno por item) ──────────────────
app.post('/animals/import-batch', requireAuth, async (req, res) => {
    const { farmId, items } = req.body || {};
    if (!farmId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'farmId e items são obrigatórios.' });
    }
    if (items.length > 500) {
        return res.status(400).json({ message: 'Limite de importação: até 500 animais por envio.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const results = [];
        let success = 0;

        for (let index = 0; index < items.length; index++) {
            const item = items[index] || {};
            const rowLabel = item.rowLabel || `Linha ${index + 2}`;
            const warnings = [];
            if (Object.prototype.hasOwnProperty.call(item, 'pesoAtual')) {
                results.push({ index, success: false, message: `${rowLabel}: campo inválido "pesoAtual". Use "ultimoPeso".` });
                continue;
            }

            const brinco = String(item.brinco || '').trim();
            const raca = String(item.raca || '').trim();
            const sexoEnum = normalizeSexo(item.sexo);

            if (!brinco || !raca || !sexoEnum) {
                results.push({ index, success: false, message: `${rowLabel}: campos obrigatórios ausentes (brinco, raça, sexo).` });
                continue;
            }

            const birthDate = item.dataNascimento ? parseDateValue(item.dataNascimento) : null;
            if (item.dataNascimento && !birthDate) {
                results.push({ index, success: false, message: `${rowLabel} (${brinco}): data de nascimento inválida.` });
                continue;
            }

            const parsedPesoAtual = (item.ultimoPeso !== undefined && item.ultimoPeso !== null && item.ultimoPeso !== '')
                ? parseNumber(item.ultimoPeso)
                : null;
            if (parsedPesoAtual !== null && parsedPesoAtual <= 0) {
                results.push({ index, success: false, message: `${rowLabel} (${brinco}): peso atual inválido.` });
                continue;
            }

            try {
                const createdAnimal = await prisma.$transaction(async (tx) => {
                    let validLotId = null;
                    if (item.lotId) {
                        const lot = await tx.lot.findFirst({
                            where: { id: String(item.lotId), farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                        });
                        if (!lot) throw new Error('Lote inválido para esta fazenda.');
                        validLotId = lot.id;
                    }

                    let validPaddockId = null;
                    let moveStartAt = null;
                    if (item.paddockId) {
                        const paddock = await tx.paddock.findFirst({
                            where: { id: String(item.paddockId), farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                        });
                        if (!paddock) throw new Error('Pasto inválido para esta fazenda.');
                        moveStartAt = item.paddockStartAt ? parseDateValue(item.paddockStartAt) : new Date();
                        if (item.paddockStartAt && !moveStartAt) throw new Error('Data de entrada no pasto inválida.');
                        validPaddockId = paddock.id;
                    }

                    let resolvedMaeId = item.maeId || null;
                    let resolvedPaiId = item.paiId || null;
                    if (!resolvedMaeId && item.maeNome?.trim()) {
                        const maeAnimal = await tx.animal.findFirst({ where: { farmId: String(farmId), brinco: item.maeNome.trim() } });
                        if (maeAnimal) resolvedMaeId = maeAnimal.id;
                    }
                    if (!resolvedPaiId && item.paiNome?.trim()) {
                        const paiAnimal = await tx.animal.findFirst({ where: { farmId: String(farmId), brinco: item.paiNome.trim() } });
                        if (paiAnimal) resolvedPaiId = paiAnimal.id;
                    }

                    const created = await tx.animal.create({
                        data: {
                            farmId: String(farmId),
                            lotId: validLotId,
                            brinco,
                            identityKey: brinco,
                            raca,
                            sexo: sexoEnum,
                            dataNascimento: birthDate,
                            pesoAtual: parsedPesoAtual,
                            gmd: null,
                            gmd30: null,
                            currentPaddockId: validPaddockId,
                            categoria: item.categoria ? String(item.categoria).trim() || null : null,
                            tipoCadastro: normalizeAnimalTipoCadastro(item.tipoCadastro),
                            tatuagem: item.tatuagem ? String(item.tatuagem).trim() || null : null,
                            sisbov: item.sisbov ? String(item.sisbov).trim() || null : null,
                            maeId: resolvedMaeId,
                            maeNome: resolvedMaeId ? null : (item.maeNome?.trim() || null),
                            paiId: resolvedPaiId,
                            paiNome: resolvedPaiId ? null : (item.paiNome?.trim() || null),
                        },
                    });

                    if (validPaddockId && moveStartAt) {
                        await tx.paddockMove.create({
                            data: { farmId: String(farmId), paddockId: validPaddockId, animalId: created.id, startAt: moveStartAt },
                        });
                    }

                    const weighingsInput = Array.isArray(item.weighings) ? item.weighings : [];
                    const parsedWeighings = weighingsInput
                        .map((weighing) => {
                            const date = parseDateValue(weighing?.data);
                            const weight = parseNumber(weighing?.peso);
                            if (!date || weight === null || weight <= 0) return null;
                            return { date, weight };
                        })
                        .filter(Boolean)
                        .sort((left, right) => left.date.getTime() - right.date.getTime());

                    if (weighingsInput.length > 0 && parsedWeighings.length === 0) {
                        warnings.push(`${rowLabel} (${brinco}): pesagens ignoradas por dados inválidos.`);
                    }
                    if (parsedWeighings.length === 0 && parsedPesoAtual !== null && parsedPesoAtual > 0) {
                        parsedWeighings.push({ date: new Date(), weight: parsedPesoAtual });
                    }

                    let previous = null;
                    for (const weighing of parsedWeighings) {
                        let gmdValue = 0;
                        if (previous) {
                            const diffDaysValue = diffDaysFloat(weighing.date, previous.date);
                            if (diffDaysValue > 0) gmdValue = (weighing.weight - previous.weight) / diffDaysValue;
                        }
                        await tx.weighing.create({
                            data: { animalId: created.id, data: weighing.date, peso: weighing.weight, gmd: gmdValue },
                        });
                        previous = weighing;
                    }

                    if (parsedWeighings.length > 0) {
                        const allWeighings = await tx.weighing.findMany({
                            where: { animalId: created.id },
                            orderBy: { data: 'asc' },
                        });
                        const metrics = calculateGmdMetrics(
                            allWeighings.map((row) => ({ date: row.data, weight: row.peso })),
                        );
                        const latest = allWeighings[allWeighings.length - 1];
                        await tx.animal.update({
                            where: { id: created.id },
                            data: { pesoAtual: latest?.peso ?? created.pesoAtual, gmd: metrics.gmdLast, gmd30: metrics.gmd30 },
                        });
                    }

                    return created;
                });

                success += 1;
                results.push({ index, success: true, animalId: createdAnimal.id, brinco, warnings });
            } catch (error) {
                if (error?.code === 'P2002') {
                    results.push({ index, success: false, message: `${rowLabel} (${brinco}): brinco já cadastrado.` });
                } else {
                    results.push({ index, success: false, message: `${rowLabel} (${brinco}): ${error?.message || 'erro ao importar.'}` });
                }
            }
        }

        if (success > 0) {
            logActivity(req, {
                action: 'ANIMAL_IMPORT_BATCH',
                entity: 'Animal',
                description: `Importou ${success} animal(is) em lote`,
                farmId: String(farmId),
            });
        }

        return res.status(200).json({ total: items.length, success, failures: items.length - success, results });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao importar animais em lote.' });
    }
});

// ── Registrar nascimento — fluxo dedicado ─────────────────────────────────────
// Cria o bezerro puxando raça e pasto da mãe automaticamente quando possível
app.post('/animals/nascimento', async (req, res) => {
    const { farmId, maeId, maeNome, sexo, dataNascimento, pesoNascimento, brinco, lotId, paddockId } = req.body || {};

    if (!farmId || !sexo || !dataNascimento) {
        return res.status(400).json({ message: 'farmId, sexo e dataNascimento são obrigatórios.' });
    }

    const sexoEnum = normalizeSexo(sexo);
    if (!sexoEnum) return res.status(400).json({ message: 'Sexo inválido.' });

    const birthDate = parseDateValue(dataNascimento);
    if (!birthDate) return res.status(400).json({ message: 'Data de nascimento inválida.' });

    try {
        const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: farmId }) });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        // Resolver mãe
        let resolvedMaeId = maeId || null;
        let resolvedMaeNome = maeNome?.trim() || null;
        let maeAnimal = null;
        if (resolvedMaeId) {
            maeAnimal = await prisma.animal.findFirst({ where: { id: resolvedMaeId, farmId } });
        } else if (resolvedMaeNome) {
            maeAnimal = await prisma.animal.findFirst({ where: { farmId, brinco: resolvedMaeNome } });
            if (maeAnimal) resolvedMaeId = maeAnimal.id;
        }

        // Herdar pasto e lote da mãe se não informados
        const validPaddockId = paddockId || maeAnimal?.currentPaddockId || null;
        const validLotId = lotId || maeAnimal?.lotId || null;

        // Raça herdada da mãe
        const racaBezerro = maeAnimal?.raca || 'Não informada';

        // Brinco provisório se não informado
        const brincoFinal = brinco?.trim() || `NAS-${Date.now()}`;

        const peso = pesoNascimento ? parseNumber(pesoNascimento) : null;

        const bezerro = await prisma.$transaction(async (tx) => {
            const created = await tx.animal.create({
                data: {
                    farmId,
                    brinco: brincoFinal,
                    identityKey: brincoFinal,
                    raca: racaBezerro,
                    sexo: sexoEnum,
                    dataNascimento: birthDate,
                    pesoAtual: peso,
                    gmd: null,
                    gmd30: null,
                    currentPaddockId: validPaddockId,
                    lotId: validLotId,
                    maeId: resolvedMaeId,
                    maeNome: resolvedMaeId ? null : resolvedMaeNome,
                },
            });

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
                    observacoes: `Nascimento registrado${maeAnimal ? ` — mãe: ${maeAnimal.brinco}` : ''}`,
                },
            });

            return created;
        });

        logActivity(req, { action: 'NASCIMENTO_REGISTRADO', entity: 'Animal', entityId: bezerro.id, description: `Registrou nascimento — brinco ${brincoFinal}`, farmId });
        return res.status(201).json({ animal: serializeAnimal(bezerro), brincoProvisorio: !brinco?.trim() });
    } catch (error) {
        if (error?.code === 'P2002') return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        console.error(error);
        return res.status(500).json({ message: 'Erro ao registrar nascimento.' });
    }
});

// ── Entrada de lote: cria múltiplos animais de uma só vez ─────────────────────
app.post('/animals/batch', async (req, res) => {
    const { farmId, paddockId, lotId, dataCompra, valorPorCabeca, animals } = req.body || {};

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
    const catMap = HERD_EVENT_CATEGORY_MAP['COMPRA'];

    // Valida brincos duplicados no banco
    const brincos = animals.map((a) => a.brinco?.trim()).filter(Boolean);
    if (new Set(brincos).size !== brincos.length) {
        return res.status(400).json({ message: 'Há brincos duplicados na lista.' });
    }
    if (brincos.length !== animals.length) {
        return res.status(400).json({ message: 'Todos os animais devem ter brinco informado.' });
    }

    const existing = await prisma.animal.findFirst({ where: { farmId, brinco: { in: brincos } } });
    if (existing) {
        return res.status(409).json({ message: `Brinco já cadastrado: ${existing.brinco}` });
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            const results = [];
            for (let index = 0; index < animals.length; index++) {
                const a = animals[index] || {};
                if (Object.prototype.hasOwnProperty.call(a, 'pesoAtual')) {
                    throw new Error(`Linha ${index + 1}: campo inválido "pesoAtual". Use "ultimoPeso".`);
                }
                const sexoEnum = normalizeSexo(a.sexo || 'Macho');
                const peso = (a.ultimoPeso !== undefined && a.ultimoPeso !== null && a.ultimoPeso !== '')
                    ? parseNumber(a.ultimoPeso)
                    : null;
                if (peso !== null && peso <= 0) {
                    throw new Error(`Linha ${index + 1}: peso inválido.`);
                }

                const animal = await tx.animal.create({
                    data: {
                        farmId,
                        lotId: validLotId,
                        brinco: a.brinco.trim(),
                        identityKey: a.brinco.trim(),
                        raca: (a.raca || 'Indefinida').trim(),
                        sexo: sexoEnum,
                        dataNascimento: null,
                        pesoAtual: peso && peso > 0 ? peso : null,
                        gmd: null,
                        gmd30: null,
                        currentPaddockId: paddockId,
                    },
                });

                if (peso && peso > 0) {
                    await tx.weighing.create({
                        data: {
                            animalId: animal.id,
                            data: compraDate,
                            peso,
                            gmd: 0,
                        },
                    });
                }

                await tx.paddockMove.create({
                    data: { farmId, paddockId, animalId: animal.id, startAt: compraDate },
                });

                if (parsedValor && parsedValor > 0) {
                    const herdEvent = await tx.herdEvent.create({
                        data: {
                            farmId,
                            animalId: animal.id,
                            type: 'COMPRA',
                            date: compraDate,
                            peso: peso && peso > 0 ? peso : null,
                            valor: parsedValor,
                            observacoes: `Entrada de lote — brinco ${a.brinco.trim()}`,
                        },
                    });
                    await tx.financialTransaction.create({
                        data: {
                            farmId,
                            type: catMap.type,
                            categoria: catMap.categoria,
                            accountCategoryId: catMap.categoryId,
                            valor: parsedValor,
                            data: compraDate,
                            status: 'PAGO',
                            descricao: `Compra de animal — ${a.brinco.trim()}`,
                            herdEventId: herdEvent.id,
                        },
                    });
                }

                results.push(animal);
            }
            return results;
        });

        logActivity(req, { action: 'LOTE_CRIADO', entity: 'Animal', description: `Cadastrou lote de ${created.length} animal(is)`, farmId });
        return res.status(201).json({ count: created.length, message: `${created.length} animal(is) cadastrado(s) com sucesso.` });
    } catch (error) {
        if (typeof error?.message === 'string' && error.message.includes('campo inválido "pesoAtual"')) {
            return res.status(400).json({ message: error.message });
        }
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Um ou mais brincos já estão cadastrados nesta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar lote de animais.' });
    }
});

// ── Ações em massa ────────────────────────────────────────────────────────────

app.post('/animals/bulk-delete', async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos um animal.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        // Verifica que todos pertencem ao tenant
        const animals = await prisma.animal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais não pertencem a esta conta.' });
        }
        await prisma.animal.deleteMany({ where: { id: { in: ids.map(String) } } });
        return res.json({ deleted: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir animais.' });
    }
});

app.post('/animals/bulk-move-lot', async (req, res) => {
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

app.post('/animals/bulk-move-pasto', async (req, res) => {
    const { ids, pastoId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || !pastoId) {
        return res.status(400).json({ message: 'Informe ao menos um animal e o pasto.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.animal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais não pertencem a esta conta.' });
        }
        const results = [];
        for (const animal of animals) {
            const { error, result } = await moveAnimalBetweenPaddocks({
                animalId: animal.id,
                paddockId: String(pastoId),
                scopeFilter: filter,
                isPo: false,
            });
            if (!error) results.push(result);
        }
        return res.json({ updated: results.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao mover animais para pasto.' });
    }
});

app.post('/animals/bulk-transfer-farm', async (req, res) => {
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

app.post('/po/animals/bulk-delete', async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos um animal P.O.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.poAnimal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais P.O. não pertencem a esta conta.' });
        }
        await prisma.poAnimal.deleteMany({ where: { id: { in: ids.map(String) } } });
        return res.json({ deleted: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir animais P.O.' });
    }
});

app.post('/po/animals/bulk-move-lot', async (req, res) => {
    const { ids, lotId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos um animal P.O.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.poAnimal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true, farmId: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais P.O. não pertencem a esta conta.' });
        }
        if (lotId) {
            const farmId = animals[0].farmId;
            const lot = await prisma.poLot.findFirst({ where: { id: String(lotId), farmId } });
            if (!lot) return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
        }
        await prisma.poAnimal.updateMany({
            where: { id: { in: ids.map(String) } },
            data: { lotId: lotId ? String(lotId) : null },
        });
        return res.json({ updated: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao mover animais P.O. para lote.' });
    }
});

app.post('/po/animals/bulk-move-pasto', async (req, res) => {
    const { ids, pastoId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || !pastoId) {
        return res.status(400).json({ message: 'Informe ao menos um animal P.O. e o pasto.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.poAnimal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais P.O. não pertencem a esta conta.' });
        }
        const results = [];
        for (const animal of animals) {
            const { error, result } = await moveAnimalBetweenPaddocks({
                animalId: animal.id,
                paddockId: String(pastoId),
                scopeFilter: filter,
                isPo: true,
            });
            if (!error) results.push(result);
        }
        return res.json({ updated: results.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao mover animais P.O. para pasto.' });
    }
});

app.post('/po/animals/bulk-transfer-farm', async (req, res) => {
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
            isPo: true,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        return res.json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao transferir animais P.O. para outra fazenda.' });
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

const recalculateAnimalWeighingChain = async (tx, animalId) => {
    const allWeighings = await tx.weighing.findMany({
        where: { animalId },
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
            await tx.weighing.update({
                where: { id: row.id },
                data: { gmd: gmdValue },
            });
        }
        previous = row;
    }

    if (!allWeighings.length) {
        await tx.animal.update({
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
    await tx.animal.update({
        where: { id: animalId },
        data: {
            pesoAtual: latest.peso,
            gmd: metrics.gmdLast,
            gmd30: metrics.gmd30,
        },
    });
};

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

        const weighing = await prisma.weighing.findFirst({
            where: { id: weighingId, animal: { farmId: farm.id } },
            select: { id: true, animalId: true, weighingSessionId: true },
        });
        if (!weighing) return res.status(404).json({ message: 'Pesagem não encontrada.' });

        const targetAnimalId = String(animalId || weighing.animalId);
        const targetAnimal = await prisma.animal.findFirst({
            where: { id: targetAnimalId, farmId: farm.id },
            select: { id: true },
        });
        if (!targetAnimal) return res.status(400).json({ message: 'Animal inválido para esta fazenda.' });

        const updated = await prisma.$transaction(async (tx) => {
            await tx.weighing.update({
                where: { id: weighing.id },
                data: {
                    animalId: targetAnimalId,
                    data: weighingDate,
                    peso: parsedPeso,
                },
            });

            await recalculateAnimalWeighingChain(tx, targetAnimalId);
            if (weighing.animalId !== targetAnimalId) {
                await recalculateAnimalWeighingChain(tx, weighing.animalId);
            }

            return tx.weighing.findUnique({
                where: { id: weighing.id },
                include: {
                    animal: { select: { id: true, brinco: true, categoria: true } },
                },
            });
        });

        return res.json({
            weighing: {
                id: updated.id,
                date: updated.data.toISOString(),
                weightKg: updated.peso,
                gmd: updated.gmd,
                animal: {
                    id: updated.animal.id,
                    brinco: updated.animal.brinco,
                    categoria: updated.animal.categoria || null,
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

        const weighing = await prisma.weighing.findFirst({
            where: { id: weighingId, animal: { farmId: farm.id } },
            select: { id: true, animalId: true },
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
            await tx.weighing.delete({ where: { id: weighing.id } });
            await recalculateAnimalWeighingChain(tx, weighing.animalId);
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
        weighingsCount: s._count?.weighings ?? undefined,
    };
}

app.post('/farms/:farmId/weighing-sessions', requireAuth, async (req, res) => {
    try {
        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const { name, responsibleName } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: 'Nome da sessão é obrigatório.' });

        const session = await prisma.weighingSession.create({
            data: {
                name: name.trim(),
                responsibleName: responsibleName?.trim() ? responsibleName.trim() : null,
                farmId: farm.id,
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

        const sessions = await prisma.weighingSession.findMany({
            where: { farmId: farm.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { _count: { select: { weighings: true } } },
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
            include: { _count: { select: { weighings: true } } },
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

        await prisma.weighingSession.delete({
            where: { id: session.id },
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

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const where = { farmId: farm.id };
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
                const weighings = session.weighings || [];
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

        const weighings = await prisma.weighing.findMany({
            where: { weighingSessionId: session.id, animal: { farmId: farm.id } },
            orderBy: { data: 'desc' },
            include: {
                animal: {
                    select: {
                        id: true,
                        brinco: true,
                        categoria: true,
                        lot: { select: { id: true, name: true } },
                    },
                },
            },
        });

        const animalIds = [...new Set(weighings.map((item) => item.animalId))];
        const previousMap = {};
        await Promise.all(
            animalIds.map(async (animalId) => {
                const history = await prisma.weighing.findMany({
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
                    animalName: null,
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

app.get('/farms/:farmId/weighings', async (req, res) => {
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


// ── HerdSettings ─────────────────────────────────────────────────────────────

app.get('/farms/:farmId/herd-settings', async (req, res) => {
    const { farmId } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const [settings, targets] = await Promise.all([
            prisma.herdSettings.findUnique({ where: { farmId } }),
            prisma.herdCategoryTarget.findMany({ where: { farmId }, orderBy: { categoria: 'asc' } }),
        ]);

        return res.json({
            weighingIntervalDays: settings?.weighingIntervalDays ?? 30,
            categoryTargets: targets.map(t => ({
                id: t.id,
                categoria: t.categoria,
                pesoAlvoKg: t.pesoAlvoKg,
            })),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao buscar configurações do rebanho.' });
    }
});

app.put('/farms/:farmId/herd-settings', async (req, res) => {
    const { farmId } = req.params;
    const { weighingIntervalDays } = req.body;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const intervalVal = parseInt(weighingIntervalDays, 10);
        if (isNaN(intervalVal) || intervalVal < 1 || intervalVal > 365) {
            return res.status(400).json({ message: 'Intervalo inválido (1–365 dias).' });
        }

        const settings = await prisma.herdSettings.upsert({
            where: { farmId },
            create: { farmId, weighingIntervalDays: intervalVal },
            update: { weighingIntervalDays: intervalVal },
        });

        return res.json({ weighingIntervalDays: settings.weighingIntervalDays });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao salvar configurações do rebanho.' });
    }
});

app.put('/farms/:farmId/herd-settings/category-targets', async (req, res) => {
    const { farmId } = req.params;
    const { targets } = req.body; // [{ categoria, pesoAlvoKg }]
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        if (!Array.isArray(targets)) {
            return res.status(400).json({ message: 'targets deve ser um array.' });
        }

        // Upsert cada categoria
        const upserts = targets.map(({ categoria, pesoAlvoKg }) =>
            prisma.herdCategoryTarget.upsert({
                where: { farmId_categoria: { farmId, categoria } },
                create: { farmId, categoria, pesoAlvoKg: pesoAlvoKg ?? null },
                update: { pesoAlvoKg: pesoAlvoKg ?? null },
            })
        );
        await Promise.all(upserts);

        const updated = await prisma.herdCategoryTarget.findMany({
            where: { farmId },
            orderBy: { categoria: 'asc' },
        });

        return res.json({
            categoryTargets: updated.map(t => ({
                id: t.id,
                categoria: t.categoria,
                pesoAlvoKg: t.pesoAlvoKg,
            })),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao salvar pesos alvo.' });
    }
});

// ─── Raças por fazenda ────────────────────────────────────────────────────────

app.get('/farms/:farmId/breeds', async (req, res) => {
    const { farmId } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const breeds = await prisma.breed.findMany({
            where: { farmId },
            orderBy: { name: 'asc' },
        });
        return res.json({ breeds: breeds.map(b => ({ id: b.id, name: b.name })) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar raças.' });
    }
});

app.post('/farms/:farmId/breeds', async (req, res) => {
    const { farmId } = req.params;
    const { name } = req.body || {};
    if (!name?.trim()) {
        return res.status(400).json({ message: 'Nome da raça é obrigatório.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const breed = await prisma.breed.create({
            data: { farmId, name: name.trim() },
        });
        return res.status(201).json({ breed: { id: breed.id, name: breed.name } });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ message: 'Raça já cadastrada nesta fazenda.' });
        }
        console.error(err);
        return res.status(500).json({ message: 'Erro ao cadastrar raça.' });
    }
});

app.delete('/farms/:farmId/breeds/:breedId', async (req, res) => {
    const { farmId, breedId } = req.params;
    try {
        const breed = await prisma.breed.findFirst({
            where: { id: breedId, farmId },
        });
        if (!breed) return res.status(404).json({ message: 'Raça não encontrada.' });

        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(403).json({ message: 'Sem permissão.' });

        await prisma.breed.delete({ where: { id: breedId } });
        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao remover raça.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

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

// ================================================================
// EIXO V2 — Novas rotas: Eventos de Inventário + Manejo Sanitário
// Cole este bloco inteiro no index.js, logo ANTES da linha:
//   const MAX_PORT_ATTEMPTS = ...
// ================================================================

const VALID_EVENT_TYPES = ['NASCIMENTO', 'COMPRA', 'VENDA', 'MORTE'];
const VALID_SANITARY_TIPOS = ['VACINA', 'VERMIFUGO', 'TRATAMENTO'];

// =============================================
// EVENTOS DE INVENTÁRIO — Rebanho Comercial
// =============================================

app.get('/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const events = await prisma.herdEvent.findMany({
            where: { animalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ events: events.map(serializeHerdEvent) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar eventos.' });
    }
});

app.post('/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    const { type, date, peso, valor, origem, destino, observacoes } = req.body || {};

    if (!VALID_EVENT_TYPES.includes(type?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use NASCIMENTO, COMPRA, VENDA ou MORTE.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do evento inválida.' });
    }

    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const eventType = type.toUpperCase();
        const event = await prisma.herdEvent.create({
            data: {
                farmId: animal.farmId,
                animalId: id,
                type: eventType,
                date: eventDate,
                peso: parseNumber(peso),
                valor: parseNumber(valor),
                origem: origem?.trim() || null,
                destino: destino?.trim() || null,
                observacoes: observacoes?.trim() || null,
            },
        });

        // Auto-lançamento financeiro para COMPRA e VENDA
        const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
        if (financialMap && valor) {
            const parsedValor = parseNumber(valor);
            if (parsedValor && parsedValor > 0) {
                await prisma.financialTransaction.create({
                    data: {
                        farmId: animal.farmId,
                        type: financialMap.type,
                        categoria: financialMap.categoria,
                        accountCategoryId: financialMap.categoryId,
                        valor: parsedValor,
                        data: eventDate,
                        descricao: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} de animal — ${animal.brinco || id}`,
                        herdEventId: event.id,
                        status: 'PAGO',
                    },
                });
            }
        }

        const eventLabels = { COMPRA: 'Registrou compra', VENDA: 'Registrou venda', MORTE: 'Registrou morte', NASCIMENTO: 'Registrou nascimento' };
        const label = eventLabels[eventType] || 'Registrou evento';
        const valorStr = parseNumber(valor) ? ` por R$ ${Number(parseNumber(valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '';
        logActivity(req, { action: `ANIMAL_${eventType}`, entity: 'Animal', entityId: id, description: `${label} do animal ${animal.brinco || id}${valorStr}`, farmId: animal.farmId });
        return res.status(201).json({ event: serializeHerdEvent(event) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar evento.' });
    }
});

// =============================================
// MANEJO SANITÁRIO — Rebanho Comercial
// =============================================

app.get('/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const records = await prisma.sanitaryRecord.findMany({
            where: { animalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ records: records.map(serializeSanitaryRecord) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar registros sanitários.' });
    }
});

app.post('/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    const { tipo, produto, date, dose, proximaAplicacao, observacoes, valorUnitario } = req.body || {};

    if (!VALID_SANITARY_TIPOS.includes(tipo?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use VACINA, VERMIFUGO ou TRATAMENTO.' });
    }
    if (!produto?.trim()) {
        return res.status(400).json({ message: 'Nome do produto é obrigatório.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do registro inválida.' });
    }

    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const tipoUpper = tipo.toUpperCase();
        const parsedValor = parseNumber(valorUnitario);
        const record = await prisma.sanitaryRecord.create({
            data: {
                farmId: animal.farmId,
                animalId: id,
                tipo: tipoUpper,
                produto: produto.trim(),
                date: eventDate,
                dose: dose?.trim() || null,
                proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null,
                valorUnitario: parsedValor || null,
            },
        });

        // Auto-lançamento financeiro se valorUnitario foi informado
        const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
        if (sanitaryMap && parsedValor && parsedValor > 0) {
            await prisma.financialTransaction.create({
                data: {
                    farmId: animal.farmId,
                    type: 'SAIDA',
                    categoria: sanitaryMap.categoria,
                    accountCategoryId: sanitaryMap.categoryId,
                    valor: parsedValor,
                    data: eventDate,
                    descricao: `${produto.trim()} — ${animal.brinco || id}`,
                    sanitaryRecordId: record.id,
                    status: 'PAGO',
                },
            });
        }

        return res.status(201).json({ record: serializeSanitaryRecord(record) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar registro sanitário.' });
    }
});

// =============================================
// EVENTOS DE INVENTÁRIO — Plantel P.O.
// =============================================

app.get('/po/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const events = await prisma.herdEvent.findMany({
            where: { poAnimalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ events: events.map(serializeHerdEvent) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar eventos.' });
    }
});

app.post('/po/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    const { type, date, peso, valor, origem, destino, observacoes } = req.body || {};

    if (!VALID_EVENT_TYPES.includes(type?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use NASCIMENTO, COMPRA, VENDA ou MORTE.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do evento inválida.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const eventType = type.toUpperCase();
        const event = await prisma.herdEvent.create({
            data: {
                farmId: animal.farmId,
                poAnimalId: id,
                type: eventType,
                date: eventDate,
                peso: parseNumber(peso),
                valor: parseNumber(valor),
                origem: origem?.trim() || null,
                destino: destino?.trim() || null,
                observacoes: observacoes?.trim() || null,
            },
        });

        const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
        if (financialMap && valor) {
            const parsedValor = parseNumber(valor);
            if (parsedValor && parsedValor > 0) {
                await prisma.financialTransaction.create({
                    data: {
                        farmId: animal.farmId,
                        type: financialMap.type,
                        categoria: financialMap.categoria,
                        accountCategoryId: financialMap.categoryId,
                        valor: parsedValor,
                        data: eventDate,
                        descricao: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} P.O. — ${animal.brinco || animal.nome || id}`,
                        herdEventId: event.id,
                        status: 'PAGO',
                    },
                });
            }
        }

        return res.status(201).json({ event: serializeHerdEvent(event) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar evento.' });
    }
});

// =============================================
// MANEJO SANITÁRIO — Plantel P.O.
// =============================================

app.get('/po/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const records = await prisma.sanitaryRecord.findMany({
            where: { poAnimalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ records: records.map(serializeSanitaryRecord) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar registros sanitários.' });
    }
});

app.post('/po/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    const { tipo, produto, date, dose, proximaAplicacao, observacoes, valorUnitario } = req.body || {};

    if (!VALID_SANITARY_TIPOS.includes(tipo?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use VACINA, VERMIFUGO ou TRATAMENTO.' });
    }
    if (!produto?.trim()) {
        return res.status(400).json({ message: 'Nome do produto é obrigatório.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do registro inválida.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const tipoUpper = tipo.toUpperCase();
        const parsedValor = parseNumber(valorUnitario);
        const record = await prisma.sanitaryRecord.create({
            data: {
                farmId: animal.farmId,
                poAnimalId: id,
                tipo: tipoUpper,
                produto: produto.trim(),
                date: eventDate,
                dose: dose?.trim() || null,
                proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null,
                valorUnitario: parsedValor || null,
            },
        });

        const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
        if (sanitaryMap && parsedValor && parsedValor > 0) {
            await prisma.financialTransaction.create({
                data: {
                    farmId: animal.farmId,
                    type: 'SAIDA',
                    categoria: sanitaryMap.categoria,
                    accountCategoryId: sanitaryMap.categoryId,
                    valor: parsedValor,
                    data: eventDate,
                    descricao: `${produto.trim()} P.O. — ${animal.brinco || animal.nome || id}`,
                    sanitaryRecordId: record.id,
                    status: 'PAGO',
                },
            });
        }

        return res.status(201).json({ record: serializeSanitaryRecord(record) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar registro sanitário.' });
    }
});

// ── Logs de Atividade ───────────────────────────────────────────────────────
app.get('/activity-logs', requireAuth, async (req, res) => {
    const { farmId: rawFarmId, limit = 100, offset = 0 } = req.query;
    const organizationId = req.saas?.organizationId;
    const farmId = req.access?.restrictToFarmIds?.length
        ? (rawFarmId ? String(rawFarmId) : req.access.restrictToFarmIds[0])
        : rawFarmId;
    if (farmId && req.access?.restrictToFarmIds?.length && !req.access.restrictToFarmIds.includes(String(farmId))) {
        return res.status(403).json({ message: 'Acesso negado para essa fazenda.' });
    }
    try {
        const rows = await prisma.$queryRawUnsafe(`
            SELECT al.id, al.action, al.entity, al."entityId", al.description,
                   al."farmId", al."createdAt",
                   u.name AS "userName", u.email AS "userEmail"
            FROM "ActivityLog" al
            JOIN "User" u ON u.id = al."userId"
            WHERE al."organizationId" = $1
              AND al.description IS NOT NULL
              ${farmId ? 'AND al."farmId" = $4' : ''}
            ORDER BY al."createdAt" DESC
            LIMIT $2 OFFSET $3
        `, organizationId, Number(limit), Number(offset), ...(farmId ? [farmId] : []));
        res.json({ logs: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Erro ao carregar logs.' });
    }
});

// ─── Registro de Módulos Extraídos (Fase 3) ──────────────────────────────────
registerMarketRoutes(app);
registerChatRoutes(app);
registerHQRoutes(app);
registerFieldRoutes(app);
registerFinancialRoutes(app);
registerOverviewRoutes(app);
registerNewsRoutes(app);

const MAX_PORT_ATTEMPTS = Number(process.env.PORT_ATTEMPTS) || 10;
const BASE_PORT = Number(PORT) || 3001;
const LAST_PORT = BASE_PORT + Math.max(MAX_PORT_ATTEMPTS - 1, 0);

const startServer = (port) => {
    const server = app.listen(port, () => {
        activePort = port;
        console.log(`Eixo API rodando em http://localhost:${port}`);
        try {
            startMarketCron();
        } catch (cronError) {
            console.warn('[market-cron] Falha ao iniciar agendamento:', cronError?.message || cronError);
        }
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
