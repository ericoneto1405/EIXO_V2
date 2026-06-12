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

const sanitizeUploadFileName = (value) =>
    String(value || 'arquivo')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'arquivo';

const decodeBase64Payload = (value) => {
    const raw = String(value || '').trim();
    if (!raw) {
        return null;
    }
    const normalized = raw.includes(',') ? raw.split(',').pop() : raw;
    return Buffer.from(normalized, 'base64');
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowXUserId = !IS_PROD && ALLOW_X_USER_ID;


if (!GOOGLE_API_KEY) {
    console.warn('GOOGLE_API_KEY is not set. Gemini API will not be available.');
}
const EIXO_SUPORTE_SYSTEM_PROMPT = `Você é o Eixo Suporte, assistente virtual do sistema EIXO (pecuária de corte).

Seu objetivo é orientar o usuário no uso do sistema com respostas simples, práticas e curtas.

## Tom e estilo
- Use português do Brasil, linguagem simples e direta.
- Evite termos técnicos de software.
- Se for passo a passo, use lista numerada curta.
- Para listas com marcador, use sempre traço: "- item".
- Não invente tela, botão ou funcionalidade.

## Como responder
- Foque em "como fazer" dentro do EIXO.
- Quando possível, cite o caminho da tela (ex.: "Manejo do Rebanho > Animais").
- Quando houver link interno disponível no contexto, inclua um link em Markdown.
- O link deve entrar de forma natural na frase, como um atendente humano faria.
- Não crie uma lista de links no fim da resposta.
- Não mostre URLs cruas. Use o nome da tela como texto do link.
- Use apenas links internos informados no contexto. Não invente URL.
- Quando existir link mais específico para uma aba ou ação, prefira ele ao link genérico do módulo.
- Se a dúvida for ambígua, faça 1 pergunta curta para confirmar contexto.
- Se não tiver certeza, diga isso com transparência e oriente a falar com o suporte humano.
- Use o contexto do atendimento para personalizar a resposta.
- Primeiro ajude o cliente a resolver a dúvida. Depois, se fizer sentido, sugira módulo pago.
- Seja vendedor consultivo: conecte a dor do cliente ao benefício real do módulo.
- Não seja insistente. Uma sugestão comercial curta é suficiente.
- Se a resposta já tiver link direto para a tela/aba certa, não pergunte "Quer que eu te mostre onde isso entra no EIXO?".
- Se o cliente responder apenas "sim", "quero" ou algo parecido depois dessa pergunta, não repita todo o passo a passo. Entregue o link direto e diga uma frase curta de orientação.

## Escopo do sistema (resumo)
- Estrutura da Fazenda: cadastro de fazendas e pastos.
- Manejo do Rebanho: cadastro de animais, importação por planilha, pesagens, lotes e eventos.
- Financeiro: lançamentos, contas a pagar/receber, fluxo de caixa e DRE.
- Nutrição: disponível conforme plano.
- Reprodução e Eixo Acasalamento: disponíveis conforme plano.
- EIXO Campo: aplicativo de manejo no campo, conforme acesso configurado.
- Módulos bloqueados aparecem com cadeado e podem exigir upgrade.

## Regras importantes para suporte
- Não informar preços ou condições comerciais de planos.
- Não prometer prazo de entrega de funcionalidades.
- Não pedir senha do usuário.
- Nunca expor dados sensíveis.
- Não diga que um módulo está liberado se o contexto indicar bloqueio.
- Não diga que um módulo está bloqueado se o contexto indicar que está ativo.
- Se o cliente perguntar por preço, planos ou contratação, explique o benefício e oriente clicar em "Ver planos" ou falar com o time comercial.

## Como vender sem atrapalhar
- Se o cliente demonstrar dor ligada a módulo bloqueado, explique o ganho prático do módulo.
- Use frases curtas com link natural, como: "Esse controle fica melhor no módulo [Nutrição](eixo:view:Nutri%C3%A7%C3%A3o)".
- Para upgrade, use algo natural como: "Você pode ver as opções em [Ver planos](/planos)".
- Use "Quer que eu te mostre onde isso entra no EIXO?" só quando ainda não houver link claro na resposta.
- Nunca invente desconto, preço, promoção ou condição comercial.

## Exemplos de resposta boa
Cliente: "Como registro pesagem?"
Resposta: "Para registrar uma pesagem, vá em [Animais](eixo:view:Rebanho%20Comercial?tab=animals), localize o animal, clique no botão de ações e abra a aba Pesagens."

Cliente: "Como importar minha planilha?"
Resposta: "A importação fica em [Importar planilha](eixo:view:Rebanho%20Comercial?tab=animals), dentro da aba Animais. Depois revise as colunas e confirme a importação."

Cliente: "Como controlo dieta?"
Resposta: "Esse controle fica melhor em [Nutrição](eixo:view:Nutri%C3%A7%C3%A3o). Ele ajuda a acompanhar dieta, consumo e custo por lote. Se o módulo não estiver liberado, veja [Ver planos](/planos)."

Cliente: "Sim"
Resposta, se a conversa anterior pediu para mostrar o caminho: "Claro. Clique em [Animais](eixo:view:Rebanho%20Comercial?tab=animals) e localize o animal na lista."

## Evite resposta ruim
- Não responda só "Acesse Manejo do Rebanho > Animais" se puder usar link.
- Não repita o mesmo passo a passo quando o cliente apenas confirmou "sim".
- Não finalize todas as respostas com pergunta genérica.
- Não coloque vários links soltos no fim da mensagem.

## Dúvidas comuns (base de orientação)

**Como cadastrar uma fazenda?**
1. Acesse [Estrutura da Fazenda](eixo:view:Fazendas).
2. Clique em "Adicionar fazenda".
3. Preencha os dados básicos e salve.
4. Depois, cadastre os pastos da fazenda.

**Como importar animais por planilha?**
1. Acesse [Manejo do Rebanho](eixo:view:Rebanho%20Comercial) e vá para a aba [Animais](eixo:view:Rebanho%20Comercial?tab=animals).
2. Clique em "Importar planilha".
3. Revise o mapeamento das colunas.
4. Confirme a importação.

**Como registrar pesagem?**
1. Em [Manejo do Rebanho](eixo:view:Rebanho%20Comercial), vá para a aba [Animais](eixo:view:Rebanho%20Comercial?tab=animals) e localize o animal.
2. Clique no botão de ações (⋮).
3. Abra a aba "Pesagens".
4. Registre data e peso.

**Como lançar despesa?**
1. Acesse [Financeiro](eixo:view:Financeiro) > "Lançamentos".
2. Clique em "Novo lançamento".
3. Selecione tipo "Saída", informe categoria, valor e data.
4. Salve.

**Como funciona integração com Financeiro nos eventos do rebanho?**
- Eventos com valor informado (ex.: compra e venda) podem gerar lançamento financeiro automaticamente.

## Encerramento
- Se o usuário relatar erro técnico, peça print/etapas e oriente acionar o suporte humano.
- Foque sempre em ajudar a concluir a tarefa dentro do sistema EIXO.`;

const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: EIXO_SUPORTE_SYSTEM_PROMPT,
}) : null;

const SUPPORT_ENTITY = 'SupportChat';
const SUPPORT_ACTION_USER = 'chat_message_user';
const SUPPORT_ACTION_AI = 'chat_message_ai';
const SUPPORT_ACTION_ADMIN = 'chat_message_admin';
const SUPPORT_ACTION_ASSUME = 'chat_assumed';
const SUPPORT_ACTION_RELEASE = 'chat_released';
const SUPPORT_ALERT_TO_EMAIL = process.env.SUPPORT_ALERT_TO_EMAIL || process.env.RESEND_FROM_EMAIL || '';
const SUPPORT_ALERT_COOLDOWN_MS = Number(process.env.SUPPORT_ALERT_COOLDOWN_MS) || 15 * 60 * 1000;
const supportAlertCooldownStore = new Map();
const SUPPORT_MODULE_CATALOG = [
    {
        name: 'Estrutura da Fazenda',
        href: 'eixo:view:Fazendas',
        entitlementCodes: ['CORE'],
        benefit: 'organiza fazendas, pastos e base operacional.',
        salesTrigger: 'cadastro de fazenda, pasto, mapa ou estrutura.',
    },
    {
        name: 'Manejo do Rebanho',
        href: 'eixo:view:Rebanho%20Comercial',
        entitlementCodes: ['CORE'],
        benefit: 'centraliza animais, lotes, importação, pesagens e eventos.',
        salesTrigger: 'controle de animais, planilhas, peso, compra, venda ou lotes.',
    },
    {
        name: 'Financeiro',
        href: 'eixo:view:Financeiro',
        entitlementCodes: ['CORE', 'EIXO_GESTAO', 'EIXO_DECISAO'],
        benefit: 'liga lançamentos, despesas, receitas e visão econômica da fazenda.',
        salesTrigger: 'despesas, receitas, lucro, fluxo de caixa, compra ou venda.',
    },
    {
        name: 'Nutrição',
        href: 'eixo:view:Nutri%C3%A7%C3%A3o',
        entitlementCodes: ['NUTRITION', 'EIXO_NUTRITION', 'EIXO_GESTAO', 'EIXO_DECISAO'],
        benefit: 'controla dieta, consumo, custo por lote e ingredientes em risco.',
        salesTrigger: 'cocho, dieta, trato, consumo, suplemento, ração ou custo alimentar.',
    },
    {
        name: 'Reprodução',
        href: '/genetics/reproducao',
        entitlementCodes: ['GENETICS', 'PO', 'EIXO_DECISAO'],
        benefit: 'organiza coberturas, diagnósticos, partos e KPIs reprodutivos.',
        salesTrigger: 'prenhez, parto, matriz, cobertura, IATF ou estação de monta.',
    },
    {
        name: 'Eixo Acasalamento',
        href: '/genetics/acasalamento',
        entitlementCodes: ['GENETICS', 'EIXO_DECISAO'],
        benefit: 'apoia decisões de acasalamento com histórico e objetivo produtivo.',
        salesTrigger: 'acasalamento, touro, sêmen, botijão, matriz ou genética.',
    },
    {
        name: 'Gestão Comercial',
        href: 'eixo:view:Gest%C3%A3o%20Comercial',
        entitlementCodes: ['EIXO_DECISAO'],
        benefit: 'apoia negociação, mercado, oportunidades e decisão de venda.',
        salesTrigger: 'venda, mercado, comprador, negociação, arroba ou margem.',
    },
    {
        name: 'Botijão de Sêmen',
        href: 'eixo:view:Estoque%20e%20Equipamentos',
        entitlementCodes: ['CORE', 'GENETICS', 'EIXO_DECISAO'],
        benefit: 'organiza estoque de sêmen usado no Eixo Acasalamento.',
        salesTrigger: 'sêmen, botijão, doses, estoque de touro ou acasalamento.',
    },
];
const SUPPORT_INTERNAL_LINKS = [
    ...SUPPORT_MODULE_CATALOG.map((module) => ({ label: module.name, href: module.href })),
    { label: 'Animais', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Adicionar animal', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Importar planilha', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Lotes', href: 'eixo:view:Rebanho%20Comercial?tab=lots' },
    { label: 'Criar lote', href: 'eixo:view:Rebanho%20Comercial?tab=lots' },
    { label: 'Pesagens', href: 'eixo:view:Rebanho%20Comercial?tab=weighings' },
    { label: 'Registrar pesagem', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Visão geral do rebanho', href: 'eixo:view:Rebanho%20Comercial?tab=overview' },
    { label: 'Cadastrar fazenda', href: 'eixo:view:Fazendas' },
    { label: 'Cadastrar pasto', href: 'eixo:view:Fazendas' },
    { label: 'Lançar despesa', href: 'eixo:view:Financeiro' },
    { label: 'Fluxo de caixa', href: 'eixo:view:Financeiro' },
    { label: 'Ver planos', href: '/planos' },
];

const SUPPORT_PLAN_LABELS = {
    GRATIS: 'Grátis',
    EIXO_GESTAO: 'EIXO Gestão',
    EIXO_DECISAO: 'EIXO Decisão',
};

const hasSupportModuleAccess = (module, entitlements) => {
    const normalized = new Set((entitlements || []).map((item) => String(item || '').trim().toUpperCase()));
    return module.entitlementCodes.some((code) => normalized.has(code));
};

const formatSupportList = (values) => {
    const filtered = (values || []).map((item) => String(item || '').trim()).filter(Boolean);
    return filtered.length ? filtered.join(', ') : 'não informado';
};

const buildSupportContextText = async (req, { farmId = null, currentPath = null } = {}) => {
    const entitlements = Array.isArray(req.saas?.entitlements) ? req.saas.entitlements : [];
    const allowedModules = normalizeUserModules(req.user?.modules || [], req.user?.roles || [], getDerivedAccessType(req.user));
    const activeModules = SUPPORT_MODULE_CATALOG
        .filter((module) => hasSupportModuleAccess(module, entitlements))
        .map((module) => module.name);
    const lockedModules = SUPPORT_MODULE_CATALOG
        .filter((module) => !hasSupportModuleAccess(module, entitlements))
        .map((module) => `${module.name}: ${module.benefit}`);

    let subscription = null;
    if (req.saas?.organizationId) {
        subscription = await prisma.billingSubscription.findFirst({
            where: { organizationId: req.saas.organizationId },
            orderBy: { createdAt: 'desc' },
            select: { planCode: true, status: true },
        });
    }

    let farm = null;
    if (farmId) {
        farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
            select: { id: true, name: true, city: true },
        });
    }

    const planCode = String(subscription?.planCode || '').trim().toUpperCase();
    const planLabel = SUPPORT_PLAN_LABELS[planCode] || planCode || 'não identificado';
    const salesPlaybook = SUPPORT_MODULE_CATALOG
        .map((module) => `- ${module.name}: vender quando houver dor sobre ${module.salesTrigger} Benefício: ${module.benefit}`)
        .join('\n');
    const internalLinks = SUPPORT_INTERNAL_LINKS
        .map((link) => `- [${link.label}](${link.href})`)
        .join('\n');

    return [
        'Contexto interno do atendimento. Use para responder, mas não copie como relatório para o cliente.',
        `Usuário: ${req.user?.name || 'não informado'} (${req.user?.email || 'sem e-mail'})`,
        `Organização: ${req.saas?.organization?.name || 'não informada'}`,
        `Plano atual: ${planLabel}`,
        `Status da assinatura: ${subscription?.status || req.saas?.billingAccessState || 'não informado'}`,
        `Entitlements ativos: ${formatSupportList(entitlements)}`,
        `Módulos do usuário: ${formatSupportList(allowedModules)}`,
        `Módulos ativos para orientar uso: ${formatSupportList(activeModules)}`,
        `Módulos bloqueados/oportunidade comercial: ${formatSupportList(lockedModules)}`,
        `Fazenda selecionada: ${farm ? `${farm.name}${farm.city ? ` (${farm.city})` : ''}` : 'não selecionada ou não encontrada'}`,
        `Tela atual: ${currentPath || 'não informada'}`,
        '',
        'Links internos permitidos para usar em Markdown:',
        internalLinks,
        '',
        'Playbook comercial interno:',
        salesPlaybook,
        '',
        'Instrução final: responda curto, resolva a dúvida e use links internos de forma natural dentro da frase. Não liste links separados. Evite perguntas finais repetitivas quando o link já resolver o caminho. Só sugira upgrade quando a dor do cliente combinar com um módulo bloqueado.',
    ].join('\n');
};

const createSupportLog = async (req, {
    conversationId,
    action,
    message = null,
    userIdOverride = null,
    requestMeta = null,
}) => {
    try {
        await prisma.activityLog.create({
            data: {
                id: crypto.randomUUID(),
                userId: userIdOverride || req.user.id,
                organizationId: req.saas?.organizationId || null,
                method: req.method,
                path: req.originalUrl || req.path || '',
                action,
                entity: SUPPORT_ENTITY,
                entityId: conversationId,
                description: message,
                requestMeta: requestMeta || undefined,
                statusCode: 200,
                ip: req.ip || null,
                userAgent: req.get('user-agent') || null,
            },
        });
    } catch (error) {
        console.error('Erro ao registrar log de suporte:', error);
    }
};

const getSupportConversationState = async (conversationId) => {
    const latestControl = await prisma.activityLog.findFirst({
        where: {
            entity: SUPPORT_ENTITY,
            entityId: conversationId,
            action: { in: [SUPPORT_ACTION_ASSUME, SUPPORT_ACTION_RELEASE] },
        },
        orderBy: { createdAt: 'desc' },
    });

    if (!latestControl || latestControl.action === SUPPORT_ACTION_RELEASE) {
        return { assumed: false, assumedByUserId: null };
    }

    const requestMeta = latestControl.requestMeta && typeof latestControl.requestMeta === 'object'
        ? latestControl.requestMeta
        : {};
    return {
        assumed: true,
        assumedByUserId: requestMeta?.adminUserId || latestControl.userId || null,
    };
};

const shouldTriggerSupportNoAnswerFallback = (text) => {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.length < 20) return true;
    const weakPatterns = [
        'não sei',
        'nao sei',
        'não tenho certeza',
        'nao tenho certeza',
        'não consigo responder',
        'nao consigo responder',
        'não posso responder',
        'nao posso responder',
    ];
    return weakPatterns.some((pattern) => normalized.includes(pattern));
};

const sendSupportAlertEmail = async (req, {
    conversationId,
    farmId = null,
    reason,
    userMessage,
}) => {
    if (!resend || !SUPPORT_ALERT_TO_EMAIL) return;
    const cooldownKey = `${conversationId}:${reason}`;
    const lastSentAt = supportAlertCooldownStore.get(cooldownKey) || 0;
    if (Date.now() - lastSentAt < SUPPORT_ALERT_COOLDOWN_MS) return;

    try {
        const subject = `[EIXO] Alerta de suporte (${reason})`;
        const safeMessage = escapeHtml(String(userMessage || '').slice(0, 2000));
        const userEmail = escapeHtml(String(req.user?.email || 'não informado'));
        const orgId = escapeHtml(String(req.saas?.organizationId || 'não informado'));
        const farmLabel = farmId ? escapeHtml(String(farmId)) : 'chat genérico';
        const body = `
            <div style="font-family: Arial, sans-serif; color: #1f2937;">
                <h2 style="margin: 0 0 12px;">Alerta automático do EIXO Suporte</h2>
                <p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>
                <p><strong>Conversa:</strong> ${escapeHtml(conversationId)}</p>
                <p><strong>Usuário:</strong> ${userEmail}</p>
                <p><strong>Organização:</strong> ${orgId}</p>
                <p><strong>Fazenda:</strong> ${farmLabel}</p>
                <p><strong>Mensagem do usuário:</strong></p>
                <blockquote style="margin: 0; padding: 10px; border-left: 3px solid #d1d5db; background: #f9fafb;">
                    ${safeMessage}
                </blockquote>
            </div>
        `;
        await resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: SUPPORT_ALERT_TO_EMAIL,
            subject,
            html: body,
        });
        supportAlertCooldownStore.set(cooldownKey, Date.now());
    } catch (error) {
        console.error('Erro ao enviar alerta de suporte por e-mail:', error);
    }
};

app.post('/api/chat/send-message', requireAuth, async (req, res) => {
    const { message, history, conversationId, farmId, currentPath } = req.body || {};
    if (!message) {
        return res.status(400).json({ message: 'Mensagem vazia.' });
    }
    const chatRateKey = `user:${req.user.id}`;
    if (isWindowRateLimited(chatRateAttempts, chatRateKey, CHAT_RATE_MAX_PER_USER, CHAT_RATE_WINDOW_MS)) {
        const retryAfter = getWindowRetryAfterSeconds(chatRateAttempts, chatRateKey, CHAT_RATE_WINDOW_MS);
        return res
            .status(429)
            .set('Retry-After', String(retryAfter))
            .json({ message: 'Você enviou muitas mensagens. Aguarde alguns segundos e tente novamente.' });
    }
    if (isWindowRateLimited(chatBurstAttempts, chatRateKey, CHAT_BURST_MAX_PER_USER, CHAT_BURST_WINDOW_MS)) {
        const retryAfter = getWindowRetryAfterSeconds(chatBurstAttempts, chatRateKey, CHAT_BURST_WINDOW_MS);
        return res
            .status(429)
            .set('Retry-After', String(retryAfter))
            .json({ message: 'Muitas mensagens em pouco tempo. Aguarde alguns segundos e tente novamente.' });
    }
    registerWindowAttempt(chatRateAttempts, chatRateKey, CHAT_RATE_WINDOW_MS);
    registerWindowAttempt(chatBurstAttempts, chatRateKey, CHAT_BURST_WINDOW_MS);

    const conversationKey = String(conversationId || '').trim() || crypto.randomUUID();
    const normalizedFarmId = typeof farmId === 'string' && farmId.trim() ? farmId.trim() : null;
    const normalizedCurrentPath = typeof currentPath === 'string' && currentPath.trim()
        ? currentPath.trim().slice(0, 160)
        : null;

    await createSupportLog(req, {
        conversationId: conversationKey,
        action: SUPPORT_ACTION_USER,
        message: String(message).slice(0, 2000),
        requestMeta: { role: 'user', farmId: normalizedFarmId, currentPath: normalizedCurrentPath },
    });

    if (!model) {
        const fallbackText = 'Suporte automático indisponível no momento. Nosso time foi avisado e responderá por aqui.';
        await createSupportLog(req, {
            conversationId: conversationKey,
            action: SUPPORT_ACTION_AI,
            message: fallbackText,
            requestMeta: { role: 'ai', farmId: normalizedFarmId, fallbackReason: 'ai_unavailable' },
        });
        await sendSupportAlertEmail(req, {
            conversationId: conversationKey,
            farmId: normalizedFarmId,
            reason: 'ai_unavailable',
            userMessage: String(message),
        });
        return res.json({ response: fallbackText, conversationId: conversationKey, assumedByAdmin: false });
    }

    try {
        const state = await getSupportConversationState(conversationKey);
        if (state.assumed) {
            return res.json({
                response: 'Seu atendimento foi assumido por um especialista do suporte. Aguarde a resposta aqui no chat.',
                conversationId: conversationKey,
                assumedByAdmin: true,
            });
        }

        const supportContext = await buildSupportContextText(req, {
            farmId: normalizedFarmId,
            currentPath: normalizedCurrentPath,
        });
        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(`${supportContext}\n\nMensagem do cliente:\n${message}`);
        const response = await result.response;
        const text = response.text();
        if (shouldTriggerSupportNoAnswerFallback(text)) {
            const fallbackText = 'Não consegui responder essa dúvida com segurança agora. Nosso time foi avisado e continuará seu atendimento por aqui.';
            await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: fallbackText,
                requestMeta: { role: 'ai', farmId: normalizedFarmId, fallbackReason: 'low_confidence' },
            });
            await sendSupportAlertEmail(req, {
                conversationId: conversationKey,
                farmId: normalizedFarmId,
                reason: 'low_confidence',
                userMessage: String(message),
            });
            return res.json({ response: fallbackText, conversationId: conversationKey, assumedByAdmin: false });
        }

        await createSupportLog(req, {
            conversationId: conversationKey,
            action: SUPPORT_ACTION_AI,
            message: String(text).slice(0, 2000),
            requestMeta: { role: 'ai', farmId: normalizedFarmId },
        });

        return res.json({ response: text, conversationId: conversationKey, assumedByAdmin: false });
    } catch (error) {
        console.error('Erro ao comunicar com a API do Gemini:', error);
        const fallbackText = 'Suporte automático indisponível no momento. Nosso time foi avisado e responderá por aqui.';
        await createSupportLog(req, {
            conversationId: conversationKey,
            action: SUPPORT_ACTION_AI,
            message: fallbackText,
            requestMeta: { role: 'ai', farmId: normalizedFarmId, fallbackReason: 'ai_error' },
        });
        await sendSupportAlertEmail(req, {
            conversationId: conversationKey,
            farmId: normalizedFarmId,
            reason: 'ai_error',
            userMessage: String(message),
        });
        return res.json({ response: fallbackText, conversationId: conversationKey, assumedByAdmin: false });
    }
});

app.get('/api/chat/conversations', requireAuth, async (req, res) => {
    const requestedFarmId = typeof req.query?.farmId === 'string' ? req.query.farmId.trim() : '';
    const normalizedFarmId = requestedFarmId || null;
    const parsedLimit = Number.parseInt(String(req.query?.limit || '3'), 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 3) : 3;

    try {
        const logs = await prisma.activityLog.findMany({
            where: {
                entity: SUPPORT_ENTITY,
                action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN] },
                userId: req.user.id,
                entityId: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 2000,
            select: {
                id: true,
                entityId: true,
                description: true,
                createdAt: true,
                requestMeta: true,
            },
        });

        const grouped = new Map();
        for (const log of logs) {
            const conversationId = String(log.entityId || '').trim();
            if (!conversationId) continue;

            const requestMeta = log.requestMeta && typeof log.requestMeta === 'object'
                ? log.requestMeta
                : {};
            const farmIdFromLog = typeof requestMeta?.farmId === 'string' && requestMeta.farmId.trim()
                ? requestMeta.farmId.trim()
                : null;

            if (normalizedFarmId && farmIdFromLog !== normalizedFarmId) {
                continue;
            }

            if (grouped.has(conversationId)) {
                continue;
            }

            grouped.set(conversationId, {
                conversationId,
                lastAt: log.createdAt,
                preview: String(log.description || '').slice(0, 140),
                farmId: farmIdFromLog,
            });

            if (grouped.size >= limit) {
                break;
            }
        }

        return res.json({ conversations: Array.from(grouped.values()) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar conversas.' });
    }
});

app.get('/api/chat/conversations/:conversationId/messages', requireAuth, async (req, res) => {
    const { conversationId } = req.params;
    if (!conversationId) {
        return res.status(400).json({ message: 'Conversa inválida.' });
    }
    try {
        const [messages, state] = await Promise.all([
            prisma.activityLog.findMany({
                where: {
                    entity: SUPPORT_ENTITY,
                    entityId: conversationId,
                    action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN] },
                    userId: req.user.id,
                },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    action: true,
                    description: true,
                    createdAt: true,
                },
            }),
            getSupportConversationState(conversationId),
        ]);

        return res.json({
            conversationId,
            assumedByAdmin: state.assumed,
            messages: messages.map((item) => ({
                id: item.id,
                role: item.action === SUPPORT_ACTION_USER ? 'user' : 'model',
                text: item.description || '',
                createdAt: item.createdAt,
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar conversa.' });
    }
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
        const farmScope = buildFarmScopeFilter(req, { id: String(farmId) });
        const farm = await prisma.farm.findFirst({ where: farmScope });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

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

const REPLACEMENT_RATIO_LIMITS = {
    FAVORAVEL_MAX: 8,
    EQUILIBRADA_MAX: 10,
};
const DEFAULT_FINISHED_ANIMAL_WEIGHT_ARROBAS = 18;
const DEFAULT_REPLACEMENT_WEIGHT_ARROBAS = 7;
const DEFAULT_MARKET_STATE = 'BA';
const DEFAULT_MARKET_REGION = 'Bahia';
const MARKET_VISIBLE_SOURCE_NAME = 'EIXO Mercado';
const MARKET_MACRO_REGION_BY_STATE = {
    AC: 'NORTE', AL: 'NORDESTE', AP: 'NORTE', AM: 'NORTE', BA: 'NORDESTE', CE: 'NORDESTE',
    DF: 'CENTRO_OESTE', ES: 'SUDESTE', GO: 'CENTRO_OESTE', MA: 'NORDESTE', MT: 'CENTRO_OESTE',
    MS: 'CENTRO_OESTE', MG: 'SUDESTE', PA: 'NORTE', PB: 'NORDESTE', PR: 'SUL', PE: 'NORDESTE',
    PI: 'NORDESTE', RJ: 'SUDESTE', RN: 'NORDESTE', RS: 'SUL', RO: 'NORTE', RR: 'NORTE', SC: 'SUL',
    SP: 'SUDESTE', SE: 'NORDESTE', TO: 'NORTE',
};
const MARKET_ALLOWED_PRODUCT_TYPES = new Set([
    'BOI_GORDO',
    'VACA_GORDA',
    'NOVILHA_GORDA',
    'BEZERRO_DESMAMA',
    'BEZERRO_12M',
    'GARROTE',
    'BOI_MAGRO',
]);
const MARKET_ALLOWED_UNITS = new Set(['ARROBA', 'CABECA', 'KG']);
const MARKET_ALLOWED_SOURCE_TYPES = new Set(['MANUAL', 'SITE_NOTICIAS', 'CONSULTORIA', 'API', 'B3', 'OUTRO']);
const MARKET_ALLOWED_PAYMENT_TYPES = new Set(['A_VISTA', 'TRINTA_DIAS', 'NAO_INFORMADO']);
const MARKET_ALLOWED_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
const formatNumberPtBr = (value, decimals = 1) => Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
});

const formatDateYYYYMMDD = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const isPositiveFiniteNumber = (value) => Number.isFinite(value) && Number(value) > 0;

const isValidMarketDateInput = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const parseMarketReferenceDate = (value) => {
    if (!isValidMarketDateInput(value)) return null;
    const dt = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
};



const normalizeMarketState = (value) => String(value || '').trim().toUpperCase().slice(0, 2);
const marketMacroRegionFromState = (state) => MARKET_MACRO_REGION_BY_STATE[normalizeMarketState(state)] || null;

const normalizeMarketOptionalText = (value) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized ? normalized : null;
};

const normalizeText = (value) => {
    const raw = normalizeMarketOptionalText(value);
    if (!raw) return null;
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
};

const parseFarmMapData = (mapData) => {
    if (!mapData) return null;
    if (typeof mapData === 'object' && !Array.isArray(mapData)) return mapData;
    if (typeof mapData === 'string') {
        try {
            const parsed = JSON.parse(mapData);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_error) {
            return null;
        }
    }
    return null;
};

const pickFirstText = (...values) => {
    for (const value of values) {
        const normalized = normalizeMarketOptionalText(value);
        if (normalized) return normalized;
    }
    return null;
};

const parseCityState = (value) => {
    const raw = normalizeMarketOptionalText(value);
    if (!raw) return { city: null, state: null };
    const compact = raw.replace(/\s+/g, ' ').trim();
    const match = compact.match(/^(.*?)[\s,\/-]*([A-Za-z]{2})$/);
    if (!match) return { city: compact, state: null };
    const city = normalizeMarketOptionalText(match[1]);
    const stateCandidate = normalizeMarketOptionalText(match[2]);
    const state = stateCandidate ? normalizeMarketState(stateCandidate) : null;
    if (!state || state.length !== 2) return { city: compact, state: null };
    return { city: city || compact, state };
};

const hasMarketModelDelegates = () => Boolean(
    prisma?.marketRegion
    && prisma?.marketPrice
    && prisma?.marketSource,
);

const hasMarketPipelineDelegates = () => Boolean(
    hasMarketModelDelegates()
    && prisma?.marketRawCapture
    && prisma?.marketNormalizedPrice
    && prisma?.marketPublishJob
    && prisma?.marketValidationRule,
);

const serializeMarketSource = (source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    url: source.url || null,
    priority: source.priority,
    trustScore: source.trustScore,
    autoPublishMinConfidence: source.autoPublishMinConfidence,
    requiresReview: source.requiresReview,
    isAutomationEnabled: source.isAutomationEnabled,
    isActive: source.isActive,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
});

const serializeMarketRegion = (region) => ({
    id: region.id,
    name: region.name,
    state: region.state,
    city: region.city || null,
    marketPlaceName: region.marketPlaceName || null,
    sourceRegionName: region.sourceRegionName || null,
    macroRegion: region.macroRegion || null,
    isActive: region.isActive,
    createdAt: region.createdAt.toISOString(),
    updatedAt: region.updatedAt.toISOString(),
});

const serializeMarketPrice = (price) => ({
    id: price.id,
    regionId: price.regionId,
    sourceId: price.sourceId,
    productType: price.productType,
    price: Number(price.price),
    unit: price.unit,
    paymentType: price.paymentType,
    referenceDate: formatDateYYYYMMDD(price.referenceDate),
    referenceWeightArrobas: price.referenceWeightArrobas ?? null,
    sourceBase: price.sourceBase || null,
    notes: price.notes || null,
    status: price.status,
    createdByUserId: price.createdByUserId || null,
    createdAt: price.createdAt.toISOString(),
    updatedAt: price.updatedAt.toISOString(),
    source: price.source ? serializeMarketSource(price.source) : null,
    region: price.region ? serializeMarketRegion(price.region) : null,
});

const serializeMarketRawCapture = (capture) => ({
    id: capture.id,
    sourceId: capture.sourceId,
    capturedAt: capture.capturedAt?.toISOString?.() || null,
    referenceDate: capture.referenceDate ? formatDateYYYYMMDD(capture.referenceDate) : null,
    rawTitle: capture.rawTitle || null,
    rawText: capture.rawText || null,
    rawUrl: capture.rawUrl || null,
    rawPayload: capture.rawPayload || null,
    captureMethod: capture.captureMethod,
    status: capture.status,
    errorMessage: capture.errorMessage || null,
    createdAt: capture.createdAt?.toISOString?.() || null,
    updatedAt: capture.updatedAt?.toISOString?.() || null,
    source: capture.source ? serializeMarketSource(capture.source) : null,
});

const serializeMarketNormalizedPrice = (normalized) => ({
    id: normalized.id,
    rawCaptureId: normalized.rawCaptureId || null,
    sourceId: normalized.sourceId,
    regionId: normalized.regionId || null,
    productType: normalized.productType,
    price: Number(normalized.price),
    unit: normalized.unit,
    paymentType: normalized.paymentType,
    referenceDate: formatDateYYYYMMDD(normalized.referenceDate),
    referenceWeightArrobas: normalized.referenceWeightArrobas ?? null,
    confidenceScore: normalized.confidenceScore,
    validationStatus: normalized.validationStatus,
    validationReasons: normalized.validationReasons || [],
    normalizedPayload: normalized.normalizedPayload || null,
    status: normalized.status,
    reviewerNotes: normalized.reviewerNotes || null,
    createdAt: normalized.createdAt?.toISOString?.() || null,
    updatedAt: normalized.updatedAt?.toISOString?.() || null,
    source: normalized.source ? serializeMarketSource(normalized.source) : null,
    region: normalized.region ? serializeMarketRegion(normalized.region) : null,
});

const calculateReplacementCostInFatArrobas = ({ replacementAnimalPrice, fatCattlePricePerArroba }) => {
    if (!isPositiveFiniteNumber(replacementAnimalPrice) || !isPositiveFiniteNumber(fatCattlePricePerArroba)) return null;
    return replacementAnimalPrice / fatCattlePricePerArroba;
};

const calculateFinishedAnimalGrossValue = ({ fatCattlePricePerArroba, finishedAnimalWeightArrobas }) => {
    if (!isPositiveFiniteNumber(fatCattlePricePerArroba) || !isPositiveFiniteNumber(finishedAnimalWeightArrobas)) return null;
    return fatCattlePricePerArroba * finishedAnimalWeightArrobas;
};

const calculateReplacementAnimalsPerFinishedAnimal = ({ finishedAnimalGrossValue, replacementAnimalPrice }) => {
    if (!isPositiveFiniteNumber(finishedAnimalGrossValue) || !isPositiveFiniteNumber(replacementAnimalPrice)) return null;
    return finishedAnimalGrossValue / replacementAnimalPrice;
};

const calculateReplacementArrobaPrice = ({ replacementAnimalPrice, replacementAnimalWeightArrobas }) => {
    if (!isPositiveFiniteNumber(replacementAnimalPrice) || !isPositiveFiniteNumber(replacementAnimalWeightArrobas)) return null;
    return replacementAnimalPrice / replacementAnimalWeightArrobas;
};

const calculateReplacementPremiumPercent = ({ replacementArrobaPrice, fatCattlePricePerArroba }) => {
    if (!isPositiveFiniteNumber(replacementArrobaPrice) || !isPositiveFiniteNumber(fatCattlePricePerArroba)) return null;
    return ((replacementArrobaPrice / fatCattlePricePerArroba) - 1) * 100;
};

const calculateReplacementPremiumInFatArrobas = ({
    replacementAnimalPrice,
    replacementAnimalWeightArrobas,
    fatCattlePricePerArroba,
}) => {
    if (!isPositiveFiniteNumber(replacementAnimalPrice) || !isPositiveFiniteNumber(replacementAnimalWeightArrobas) || !isPositiveFiniteNumber(fatCattlePricePerArroba)) return null;
    const baseValueAtFatCattlePrice = replacementAnimalWeightArrobas * fatCattlePricePerArroba;
    const premiumValue = replacementAnimalPrice - baseValueAtFatCattlePrice;
    return premiumValue / fatCattlePricePerArroba;
};

const classifyReplacementMarketStatus = (replacementCostInFatArrobas) => {
    // Regra provisória. No futuro, calibrar por categoria, peso, região e histórico da praça.
    if (replacementCostInFatArrobas === null) {
        return {
            status: 'SEM_DADOS',
            statusLabel: 'Sem dados de mercado',
            interpretation: 'Ainda não há dados suficientes para analisar a reposição.',
        };
    }

    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.FAVORAVEL_MAX) {
        return {
            status: 'FAVORAVEL',
            statusLabel: 'Reposição favorável',
            interpretation: 'A reposição está mais favorável para quem precisa comprar bezerros.',
        };
    }
    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.EQUILIBRADA_MAX) {
        return {
            status: 'EQUILIBRADA',
            statusLabel: 'Reposição equilibrada',
            interpretation: 'A relação está equilibrada. A compra exige atenção ao custo de recria.',
        };
    }
    return {
        status: 'PRESSIONADA',
        statusLabel: 'Reposição pressionada',
        interpretation: 'A reposição está pressionada. Comprar bezerro agora exige mais arrobas de boi gordo.',
    };
};

const buildFatCattleSignal = ({ fatCattlePricePerArroba, fatCattleTrendPercent = null }) => {
    if (!fatCattlePricePerArroba || fatCattlePricePerArroba <= 0) {
        return {
            status: 'SEM_DADOS',
            signal: 'Sem dados',
            label: 'Sem dados da arroba',
            text: 'Ainda não há dados suficientes para avaliar o sinal do boi gordo.',
        };
    }
    if (fatCattleTrendPercent !== null && fatCattleTrendPercent >= 2) {
        return {
            status: 'BOM',
            signal: 'Bom',
            label: 'Arroba em alta',
            text: `A arroba está em alta (${formatNumberPtBr(fatCattleTrendPercent, 1)}% acima da cotação anterior). Boa oportunidade de venda.`,
        };
    }
    if (fatCattleTrendPercent !== null && fatCattleTrendPercent <= -2) {
        return {
            status: 'RUIM',
            signal: 'Ruim',
            label: 'Arroba em queda',
            text: `A arroba está em queda (${formatNumberPtBr(fatCattleTrendPercent, 1)}% abaixo da cotação anterior). Considere segurar a venda.`,
        };
    }
    return {
        status: 'NEUTRO',
        signal: 'Neutro',
        label: 'Arroba em observação',
        text: 'A arroba serve como referência de venda, mas ainda precisa de histórico regional e custo da fazenda para dizer se está realmente boa.',
    };
};

const classifyReplacementSignal = (replacementCostInFatArrobas) => {
    // Regra provisória. No futuro, calibrar por categoria, peso, região, histórico da praça, sistema produtivo, GMD e custo de recria.
    if (replacementCostInFatArrobas === null) {
        return 'SEM_DADOS';
    }
    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.FAVORAVEL_MAX) {
        return 'FAVORAVEL';
    }
    if (replacementCostInFatArrobas <= REPLACEMENT_RATIO_LIMITS.EQUILIBRADA_MAX) {
        return 'EQUILIBRADA';
    }
    return 'PRESSIONADA';
};

const buildReplacementSignal = ({ replacementCostInFatArrobas }) => {
    const status = classifyReplacementSignal(replacementCostInFatArrobas);
    if (status === 'SEM_DADOS') {
        return {
            status: 'SEM_DADOS',
            signal: 'Sem dados',
            label: 'Sem dados de reposição',
            text: 'Ainda não há dados suficientes para analisar a compra da reposição.',
        };
    }
    if (status === 'FAVORAVEL') {
        return {
            status: 'FAVORAVEL',
            signal: 'Bom',
            label: 'Reposição favorável',
            text: 'A compra da reposição está mais favorável em relação ao preço atual do boi gordo.',
        };
    }
    if (status === 'EQUILIBRADA') {
        return {
            status: 'EQUILIBRADA',
            signal: 'Cautela',
            label: 'Reposição exige eficiência',
            text: 'A compra pode fazer sentido, mas depende de GMD e custo de recria controlados.',
        };
    }
    return {
        status: 'PRESSIONADA',
        signal: 'Pressionada',
        label: 'Reposição cara',
        text: 'A reposição está cara em relação ao boi gordo. Comprar agora exige mais arrobas por cabeça.',
    };
};

const buildMarketAiInput = ({ base, metrics, statusMeta }) => ({
    state: base.state,
    region: base.region,
    fatCattlePricePerArroba: base.fatCattlePricePerArroba,
    replacementAnimalPrice: base.replacementAnimalPrice,
    replacementAnimalWeightArrobas: base.replacementAnimalWeightArrobas,
    replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
    replacementAnimalsPerFinishedAnimal: metrics.replacementAnimalsPerFinishedAnimal,
    finishedAnimalWeightArrobas: base.finishedAnimalWeightArrobas,
    finishedAnimalGrossValue: metrics.finishedAnimalGrossValue,
    replacementAnimalType: base.replacementAnimalType,
    replacementAnimalTypeLabel: base.replacementAnimalTypeLabel,
    replacementArrobaPrice: metrics.replacementArrobaPrice,
    replacementPremiumPercent: metrics.replacementPremiumPercent,
    replacementPremiumInFatArrobas: metrics.replacementPremiumInFatArrobas,
    status: statusMeta.status,
    statusLabel: statusMeta.statusLabel,
    sourceName: base.sourceName,
    referenceDate: base.referenceDate,
});

const generateFallbackMarketInsight = (aiInput) => {
    if (aiInput.status === 'SEM_DADOS') {
        return {
            summary: 'Ainda não há dados suficientes para gerar uma leitura de mercado.',
            detail: 'Cadastre cotações de arroba e reposição para liberar a leitura comparativa da reposição.',
            attentionPoints: ['Use essa leitura apenas como referência operacional.'],
            tone: 'SEM_DADOS',
            generatedBy: 'RULES_FALLBACK',
        };
    }
    if (aiInput.status === 'FAVORAVEL') {
        return {
            summary: 'A reposição está favorável para quem precisa comprar bezerros.',
            detail: `Esse bezerro custa o equivalente a ${formatNumberPtBr(aiInput.replacementCostInFatArrobas, 1)} arrobas de boi gordo. Vendendo um boi de referência de ${formatNumberPtBr(aiInput.finishedAnimalWeightArrobas, 0)} @, o produtor compra cerca de ${formatNumberPtBr(aiInput.replacementAnimalsPerFinishedAnimal, 2)} bezerros. A arroba do bezerro está ${formatNumberPtBr(aiInput.replacementPremiumPercent, 1)}% acima da arroba do boi gordo.`,
            attentionPoints: [
                'Ainda assim, acompanhe custo de recria e desempenho do lote.',
                'Use essa leitura como referência, não como decisão automática.',
            ],
            tone: 'OPORTUNIDADE',
            generatedBy: 'RULES_FALLBACK',
        };
    }
    if (aiInput.status === 'EQUILIBRADA') {
        return {
            summary: 'Com a arroba atual, o bezerro desmamado custa 9,2 @ de boi gordo.',
            detail: 'Com a arroba atual, o bezerro desmamado custa 9,2 @ de boi gordo. A compra exige controle de custo e bom ganho de peso.',
            attentionPoints: [
                'Exige eficiência na recria para fechar conta.',
            ],
            tone: 'CAUTELA',
            generatedBy: 'RULES_FALLBACK',
        };
    }
    return {
        summary: 'A reposição está pressionada. Comprar bezerro agora exige mais arrobas de boi gordo.',
        detail: `Esse bezerro custa cerca de ${formatNumberPtBr(aiInput.replacementCostInFatArrobas, 1)} arrobas de boi gordo. O poder de compra está em aproximadamente ${formatNumberPtBr(aiInput.replacementAnimalsPerFinishedAnimal, 2)} bezerros por boi de referência, com ágio de ${formatNumberPtBr(aiInput.replacementPremiumPercent, 1)}%.`,
        attentionPoints: [
            'Reforce análise de custo antes de repor.',
            'Use essa leitura apenas como referência operacional.',
        ],
        tone: 'CAUTELA',
        generatedBy: 'RULES_FALLBACK',
    };
};

const generateMarketInsight = (aiInput) => generateFallbackMarketInsight(aiInput);

const calculateMarketReplacementMetrics = (base) => {
    const finishedAnimalGrossValue = calculateFinishedAnimalGrossValue(base);
    const replacementCostInFatArrobas = calculateReplacementCostInFatArrobas(base);
    const replacementAnimalsPerFinishedAnimal = calculateReplacementAnimalsPerFinishedAnimal({
        finishedAnimalGrossValue,
        replacementAnimalPrice: base.replacementAnimalPrice,
    });
    const replacementArrobaPrice = calculateReplacementArrobaPrice(base);
    const replacementPremiumPercent = calculateReplacementPremiumPercent({
        replacementArrobaPrice,
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
    });
    const replacementPremiumInFatArrobas = calculateReplacementPremiumInFatArrobas(base);
    return {
        finishedAnimalGrossValue,
        replacementCostInFatArrobas,
        replacementAnimalsPerFinishedAnimal,
        replacementArrobaPrice,
        replacementPremiumPercent,
        replacementPremiumInFatArrobas,
    };
};

const buildEmptyMarketReplacementSnapshot = ({ region = null, state = null, referenceDate = null } = {}) => ({
    fatCattlePricePerArroba: null,
    fatCattleTrendPercent: null,
    finishedAnimalWeightArrobas: null,
    finishedAnimalGrossValue: null,
    replacementAnimalType: null,
    replacementAnimalTypeLabel: null,
    replacementAnimalPrice: null,
    replacementAnimalTrendPercent: null,
    replacementAnimalWeightArrobas: null,
    replacementArrobaPrice: null,
    replacementCostInFatArrobas: null,
    replacementCostTrendArrobas: null,
    replacementAnimalsPerFinishedAnimal: null,
    replacementPremiumPercent: null,
    replacementPremiumInFatArrobas: null,
    replacementRatio: null,
    fatCattleSignal: {
        status: 'SEM_DADOS',
        signal: 'Sem dados',
        label: 'Sem dados de arroba',
        text: 'Ainda não há dados suficientes para avaliar o sinal do boi gordo.',
    },
    replacementSignal: {
        status: 'SEM_DADOS',
        signal: 'Sem dados',
        label: 'Sem dados de reposição',
        text: 'Ainda não há dados suficientes para analisar a compra da reposição.',
    },
    status: 'SEM_DADOS',
    statusLabel: 'Sem dados de mercado',
    interpretation: 'Ainda não há dados suficientes para analisar mercado e reposição.',
    region,
    state,
    sourceName: MARKET_VISIBLE_SOURCE_NAME,
    sourceBase: null,
    referenceDate,
    aiInsight: {
        summary: 'Ainda não há dados suficientes para analisar mercado e reposição.',
        detail: '',
        attentionPoints: [],
        tone: 'SEM_DADOS',
        generatedBy: 'RULES_FALLBACK',
    },
});

const buildPartialMarketReplacementSnapshot = ({
    fatCattlePrice = null,
    replacementPrice = null,
    region = null,
    state = null,
}) => {
    const base = {
        fatCattlePricePerArroba: fatCattlePrice ? Number(fatCattlePrice.price) : null,
        finishedAnimalWeightArrobas: DEFAULT_FINISHED_ANIMAL_WEIGHT_ARROBAS,
        replacementAnimalType: replacementPrice?.productType || 'BEZERRO_DESMAMA',
        replacementAnimalTypeLabel: 'Bezerro desmamado',
        replacementAnimalPrice: replacementPrice ? Number(replacementPrice.price) : null,
        replacementAnimalWeightArrobas: replacementPrice?.referenceWeightArrobas ?? DEFAULT_REPLACEMENT_WEIGHT_ARROBAS,
        region,
        state,
        sourceName: MARKET_VISIBLE_SOURCE_NAME,
        sourceBase: normalizeMarketOptionalText(replacementPrice?.sourceBase || fatCattlePrice?.sourceBase),
        referenceDate: formatDateYYYYMMDD(replacementPrice?.referenceDate || fatCattlePrice?.referenceDate || new Date()),
    };
    const metrics = calculateMarketReplacementMetrics(base);
    const statusMeta = classifyReplacementMarketStatus(metrics.replacementCostInFatArrobas);
    const fatCattleSignal = buildFatCattleSignal({
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        fatCattleTrendPercent: null,
    });
    const replacementSignal = buildReplacementSignal({
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
    });
    const aiInput = buildMarketAiInput({ base, metrics, statusMeta });
    const aiInsight = generateMarketInsight(aiInput);
    return {
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        finishedAnimalWeightArrobas: base.finishedAnimalWeightArrobas,
        finishedAnimalGrossValue: metrics.finishedAnimalGrossValue,
        replacementAnimalType: base.replacementAnimalType,
        replacementAnimalTypeLabel: base.replacementAnimalTypeLabel,
        replacementAnimalPrice: base.replacementAnimalPrice,
        replacementAnimalWeightArrobas: base.replacementAnimalWeightArrobas,
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
        replacementAnimalsPerFinishedAnimal: metrics.replacementAnimalsPerFinishedAnimal,
        replacementArrobaPrice: metrics.replacementArrobaPrice,
        replacementPremiumPercent: metrics.replacementPremiumPercent,
        replacementPremiumInFatArrobas: metrics.replacementPremiumInFatArrobas,
        replacementRatio: metrics.replacementCostInFatArrobas,
        fatCattleSignal,
        replacementSignal,
        status: statusMeta.status,
        statusLabel: statusMeta.statusLabel,
        interpretation: metrics.replacementCostInFatArrobas === null
            ? 'Ainda não há dados suficientes para analisar mercado e reposição.'
            : statusMeta.interpretation,
        region,
        state,
        sourceName: base.sourceName,
        sourceBase: base.sourceBase,
        referenceDate: base.referenceDate,
        fatCattleTrendPercent: null,
        replacementAnimalTrendPercent: null,
        replacementCostTrendArrobas: null,
        aiInsight,
    };
};

const resolveFarmMarketRegion = (farm) => {
    const mapData = parseFarmMapData(farm?.mapData);

    const farmCityRaw = pickFirstText(
        farm?.city,
        farm?.cidade,
        mapData?.city,
        mapData?.cidade,
        mapData?.municipio,
        mapData?.município,
        mapData?.localidade,
    );
    const parsedFarmCity = parseCityState(farmCityRaw);
    const farmCity = parsedFarmCity.city;

    const farmRegion = pickFirstText(
        farm?.region,
        mapData?.region,
        mapData?.regiao,
        mapData?.região,
        mapData?.marketRegion,
        mapData?.marketPlaceName,
        mapData?.praca,
        mapData?.praça,
    );

    const stateRaw = pickFirstText(
        farm?.state,
        farm?.uf,
        mapData?.uf,
        mapData?.UF,
        mapData?.state,
        mapData?.estado,
        mapData?.siglaUf,
        mapData?.siglaUF,
        mapData?.estadoSigla,
        mapData?.stateCode,
    );
    const farmState = stateRaw ? normalizeMarketState(stateRaw) : parsedFarmCity.state;

    const addressRaw = pickFirstText(
        mapData?.address,
        mapData?.endereco,
        mapData?.endereço,
        mapData?.location,
        mapData?.place,
    );

    const farmLat = farm?.latitude ?? farm?.lat ?? mapData?.latitude ?? mapData?.lat ?? null;
    const farmLng = farm?.longitude ?? farm?.lng ?? mapData?.longitude ?? mapData?.lng ?? null;

    let resolvedRegion = farmRegion;
    let resolvedState = farmState;
    let source = farmRegion || farmState || farmCity ? 'farm-field' : 'empty';

    const cityKey = normalizeText(farmCity);
    const addressKey = normalizeText(addressRaw);

    if ((!resolvedRegion || !resolvedState) && (cityKey === 'feira de santana' || cityKey === 'feira' || cityKey === 'lagoa do capim' || parsedFarmCity.state === 'BA')) {
        resolvedRegion = resolvedRegion || 'Bahia';
        resolvedState = resolvedState || 'BA';
        source = 'city-state-fallback';
    }

    if ((!resolvedRegion || !resolvedState) && (addressKey?.includes('bahia') || addressKey?.includes(' ba '))) {
        resolvedRegion = resolvedRegion || 'Bahia';
        resolvedState = resolvedState || 'BA';
        source = 'city-state-fallback';
    }

    if (!resolvedRegion && !resolvedState && (farmLat !== null || farmLng !== null)) {
        source = 'coords-only';
    } else if (!resolvedRegion && !resolvedState) {
        source = 'empty';
    } else if (!source) {
        source = 'mapData';
    }

    return {
        region: resolvedRegion || null,
        state: resolvedState || null,
        city: farmCity || null,
        lat: farmLat,
        lng: farmLng,
        source,
        mapDataKeys: mapData ? Object.keys(mapData) : [],
    };
};

const resolveMarketRegionContext = async ({ farm, scope }) => {
    const farmRegionContext = resolveFarmMarketRegion(farm);
    const marketTablesAvailable = hasMarketModelDelegates();

    if (scope === 'farm' && process.env.NODE_ENV !== 'production') {
        console.log('[overview/dashboard] farm market region', {
            farmId: farm?.id || null,
            farmName: farm?.name || null,
            city: farm?.city || farm?.cidade || null,
            lat: farm?.lat ?? null,
            lng: farm?.lng ?? null,
            mapDataKeys: farmRegionContext.mapDataKeys || [],
            resolvedRegion: farmRegionContext.region || null,
            resolvedState: farmRegionContext.state || null,
            source: farmRegionContext.source || 'empty',
        });
    }

    if (!marketTablesAvailable) {
        console.warn('[market] Prisma market models unavailable');
        if (farmRegionContext.region || farmRegionContext.state) {
            return {
                id: null,
                name: farmRegionContext.region || farmRegionContext.state,
                state: farmRegionContext.state,
            };
        }
        return null;
    }

    if (scope === 'farm' && farmRegionContext.city) {
        const byCity = await prisma.marketRegion.findFirst({
            where: {
                isActive: true,
                city: { equals: farmRegionContext.city, mode: 'insensitive' },
                ...(farmRegionContext.state ? { state: farmRegionContext.state } : {}),
            },
            orderBy: { updatedAt: 'desc' },
        });
        if (byCity) return byCity;
    }

    if (scope === 'farm' && farmRegionContext.region) {
        const byRegionName = await prisma.marketRegion.findFirst({
            where: {
                isActive: true,
                name: { equals: farmRegionContext.region, mode: 'insensitive' },
                ...(farmRegionContext.state ? { state: farmRegionContext.state } : {}),
            },
            orderBy: { updatedAt: 'desc' },
        });
        if (byRegionName) return byRegionName;
    }

    if (scope === 'farm' && farmRegionContext.state) {
        const byState = await prisma.marketRegion.findFirst({
            where: { isActive: true, state: farmRegionContext.state },
            orderBy: [{ updatedAt: 'desc' }],
        });
        if (byState) return byState;
        const macroRegion = marketMacroRegionFromState(farmRegionContext.state);
        if (macroRegion) {
            const byMacroRegion = await prisma.marketRegion.findFirst({
                where: { isActive: true, macroRegion },
                orderBy: [{ updatedAt: 'desc' }],
            });
            if (byMacroRegion) return byMacroRegion;
        }
        return {
            id: null,
            name: farmRegionContext.region || farmRegionContext.state,
            state: farmRegionContext.state,
        };
    }

    const byDefaultState = await prisma.marketRegion.findFirst({
        where: { isActive: true, state: DEFAULT_MARKET_STATE },
        orderBy: [{ updatedAt: 'desc' }],
    });
    if (byDefaultState) return byDefaultState;
    return null;
};

const findLatestPublishedMarketPrice = async ({ regionId, productType }) => {
    if (!regionId || !productType || !hasMarketModelDelegates()) return null;
    return prisma.marketPrice.findFirst({
        where: {
            regionId,
            productType,
            status: 'PUBLISHED',
        },
        include: {
            source: true,
            region: true,
        },
        orderBy: [{ referenceDate: 'desc' }, { updatedAt: 'desc' }],
    });
};

const buildMarketReplacementSnapshot = async ({ scope, farm }) => {
    const regionContext = await resolveMarketRegionContext({ farm, scope });
    if (!regionContext) {
        return buildEmptyMarketReplacementSnapshot();
    }

    const [fatCattlePrice, replacementPrice] = await Promise.all([
        findLatestPublishedMarketPrice({ regionId: regionContext.id, productType: 'BOI_GORDO' }),
        findLatestPublishedMarketPrice({ regionId: regionContext.id, productType: 'BEZERRO_DESMAMA' }),
    ]);

    if (!fatCattlePrice && !replacementPrice) {
        return buildEmptyMarketReplacementSnapshot({
            region: regionContext.name,
            state: regionContext.state,
            referenceDate: formatDateYYYYMMDD(new Date()),
        });
    }

    if (!fatCattlePrice || !replacementPrice) {
        return buildPartialMarketReplacementSnapshot({
            fatCattlePrice,
            replacementPrice,
            region: regionContext.name,
            state: regionContext.state,
        });
    }

    const replacementWeight = replacementPrice.referenceWeightArrobas && replacementPrice.referenceWeightArrobas > 0
        ? replacementPrice.referenceWeightArrobas
        : null;
    if (!replacementWeight) {
        return buildPartialMarketReplacementSnapshot({
            fatCattlePrice,
            replacementPrice,
            region: regionContext.name,
            state: regionContext.state,
        });
    }

    const base = {
        fatCattlePricePerArroba: Number(fatCattlePrice.price),
        finishedAnimalWeightArrobas: DEFAULT_FINISHED_ANIMAL_WEIGHT_ARROBAS,
        replacementAnimalType: replacementPrice.productType,
        replacementAnimalTypeLabel: 'Bezerro desmamado',
        replacementAnimalPrice: Number(replacementPrice.price),
        replacementAnimalWeightArrobas: replacementWeight,
        region: regionContext.name,
        state: regionContext.state,
        sourceName: MARKET_VISIBLE_SOURCE_NAME,
        sourceBase: normalizeMarketOptionalText(replacementPrice.sourceBase || fatCattlePrice.sourceBase),
        referenceDate: formatDateYYYYMMDD(replacementPrice.referenceDate >= fatCattlePrice.referenceDate ? replacementPrice.referenceDate : fatCattlePrice.referenceDate),
    };

    const metrics = calculateMarketReplacementMetrics(base);
    const statusMeta = classifyReplacementMarketStatus(metrics.replacementCostInFatArrobas);
    const replacementSignal = buildReplacementSignal({
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
    });
    const aiInput = buildMarketAiInput({ base, metrics, statusMeta });
    const aiInsight = generateMarketInsight(aiInput);
    const trends = await resolveMarketTrends(prisma, {
        regionId: regionContext.id,
        referenceDate: replacementPrice.referenceDate >= fatCattlePrice.referenceDate ? replacementPrice.referenceDate : fatCattlePrice.referenceDate,
        fatPrice: base.fatCattlePricePerArroba,
        replacementPrice: base.replacementAnimalPrice,
    });
    const fatCattleSignal = buildFatCattleSignal({
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        fatCattleTrendPercent: trends.fatCattleTrendPercent,
    });

    return {
        fatCattlePricePerArroba: base.fatCattlePricePerArroba,
        finishedAnimalWeightArrobas: base.finishedAnimalWeightArrobas,
        finishedAnimalGrossValue: metrics.finishedAnimalGrossValue,
        replacementAnimalType: base.replacementAnimalType,
        replacementAnimalTypeLabel: base.replacementAnimalTypeLabel,
        replacementAnimalPrice: base.replacementAnimalPrice,
        replacementAnimalWeightArrobas: base.replacementAnimalWeightArrobas,
        replacementCostInFatArrobas: metrics.replacementCostInFatArrobas,
        replacementAnimalsPerFinishedAnimal: metrics.replacementAnimalsPerFinishedAnimal,
        replacementArrobaPrice: metrics.replacementArrobaPrice,
        replacementPremiumPercent: metrics.replacementPremiumPercent,
        replacementPremiumInFatArrobas: metrics.replacementPremiumInFatArrobas,
        // compatibilidade temporária com versão anterior do frontend
        replacementRatio: metrics.replacementCostInFatArrobas,
        fatCattleSignal,
        replacementSignal,
        status: statusMeta.status,
        statusLabel: statusMeta.statusLabel,
        interpretation: statusMeta.interpretation,
        region: base.region,
        state: base.state,
        sourceName: base.sourceName,
        sourceBase: base.sourceBase,
        referenceDate: base.referenceDate,
        fatCattleTrendPercent: trends.fatCattleTrendPercent,
        replacementAnimalTrendPercent: trends.replacementAnimalTrendPercent,
        replacementCostTrendArrobas: trends.replacementCostTrendArrobas,
        aiInsight,
    };
};

app.get('/market/sources', requireAuth, requireMarketAdmin, async (_req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const sources = await prisma.marketSource.findMany({
            orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        });
        return res.json({ sources: sources.map(serializeMarketSource) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar fontes de mercado.' });
    }
});

app.post('/market/sources', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const name = normalizeMarketOptionalText(req.body?.name);
        const type = String(req.body?.type || '').trim().toUpperCase();
        const url = normalizeMarketOptionalText(req.body?.url);
        const isActive = req.body?.isActive !== false;
        const priority = Number.isFinite(Number(req.body?.priority)) ? Math.max(1, Math.round(Number(req.body?.priority))) : 100;
        const trustScore = Number.isFinite(Number(req.body?.trustScore)) ? Math.min(100, Math.max(0, Math.round(Number(req.body?.trustScore)))) : 70;
        const autoPublishMinConfidence = Number.isFinite(Number(req.body?.autoPublishMinConfidence))
            ? Math.min(100, Math.max(0, Math.round(Number(req.body?.autoPublishMinConfidence))))
            : 85;
        const requiresReview = req.body?.requiresReview !== undefined ? Boolean(req.body?.requiresReview) : true;
        const isAutomationEnabled = req.body?.isAutomationEnabled !== undefined ? Boolean(req.body?.isAutomationEnabled) : false;
        if (!name) return res.status(400).json({ message: 'Nome da fonte é obrigatório.' });
        if (!MARKET_ALLOWED_SOURCE_TYPES.has(type)) return res.status(400).json({ message: 'Tipo de fonte inválido.' });
        const created = await prisma.marketSource.create({
            data: { name, type, url, isActive, priority, trustScore, autoPublishMinConfidence, requiresReview, isAutomationEnabled },
        });
        return res.status(201).json({ source: serializeMarketSource(created) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao criar fonte de mercado.' });
    }
});

app.patch('/market/sources/:id', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const sourceId = String(req.params.id || '');
        if (!UUID_REGEX.test(sourceId)) return res.status(400).json({ message: 'Fonte inválida.' });
        const data = {};
        if (req.body?.name !== undefined) {
            const name = normalizeMarketOptionalText(req.body?.name);
            if (!name) return res.status(400).json({ message: 'Nome da fonte inválido.' });
            data.name = name;
        }
        if (req.body?.type !== undefined) {
            const type = String(req.body?.type || '').trim().toUpperCase();
            if (!MARKET_ALLOWED_SOURCE_TYPES.has(type)) return res.status(400).json({ message: 'Tipo de fonte inválido.' });
            data.type = type;
        }
        if (req.body?.url !== undefined) data.url = normalizeMarketOptionalText(req.body?.url);
        if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body?.isActive);
        if (req.body?.priority !== undefined) data.priority = Math.max(1, Math.round(Number(req.body?.priority)));
        if (req.body?.trustScore !== undefined) data.trustScore = Math.min(100, Math.max(0, Math.round(Number(req.body?.trustScore))));
        if (req.body?.autoPublishMinConfidence !== undefined) data.autoPublishMinConfidence = Math.min(100, Math.max(0, Math.round(Number(req.body?.autoPublishMinConfidence))));
        if (req.body?.requiresReview !== undefined) data.requiresReview = Boolean(req.body?.requiresReview);
        if (req.body?.isAutomationEnabled !== undefined) data.isAutomationEnabled = Boolean(req.body?.isAutomationEnabled);
        const updated = await prisma.marketSource.update({ where: { id: sourceId }, data });
        return res.json({ source: serializeMarketSource(updated) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar fonte de mercado.' });
    }
});

app.get('/market/regions', requireAuth, requireMarketAdmin, async (_req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const regions = await prisma.marketRegion.findMany({
            orderBy: [{ isActive: 'desc' }, { state: 'asc' }, { name: 'asc' }],
        });
        return res.json({ regions: regions.map(serializeMarketRegion) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar regiões de mercado.' });
    }
});

app.post('/market/regions', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const name = normalizeMarketOptionalText(req.body?.name);
        const state = normalizeMarketState(req.body?.state);
        const city = normalizeMarketOptionalText(req.body?.city);
        const marketPlaceName = normalizeMarketOptionalText(req.body?.marketPlaceName);
        const sourceRegionName = normalizeMarketOptionalText(req.body?.sourceRegionName);
        const macroRegion = normalizeMarketOptionalText(req.body?.macroRegion);
        const isActive = req.body?.isActive !== false;
        if (!name) return res.status(400).json({ message: 'Nome da região é obrigatório.' });
        if (!state || state.length !== 2) return res.status(400).json({ message: 'UF inválida.' });
        if (macroRegion && !['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'].includes(macroRegion)) {
            return res.status(400).json({ message: 'Macro região inválida.' });
        }
        const created = await prisma.marketRegion.create({
            data: { name, state, city, marketPlaceName, sourceRegionName, macroRegion, isActive },
        });
        return res.status(201).json({ region: serializeMarketRegion(created) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao criar região de mercado.' });
    }
});

app.patch('/market/regions/:id', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const regionId = String(req.params.id || '');
        if (!UUID_REGEX.test(regionId)) return res.status(400).json({ message: 'Região inválida.' });
        const data = {};
        if (req.body?.name !== undefined) {
            const name = normalizeMarketOptionalText(req.body?.name);
            if (!name) return res.status(400).json({ message: 'Nome da região inválido.' });
            data.name = name;
        }
        if (req.body?.state !== undefined) {
            const state = normalizeMarketState(req.body?.state);
            if (!state || state.length !== 2) return res.status(400).json({ message: 'UF inválida.' });
            data.state = state;
        }
        if (req.body?.city !== undefined) data.city = normalizeMarketOptionalText(req.body?.city);
        if (req.body?.marketPlaceName !== undefined) data.marketPlaceName = normalizeMarketOptionalText(req.body?.marketPlaceName);
        if (req.body?.sourceRegionName !== undefined) data.sourceRegionName = normalizeMarketOptionalText(req.body?.sourceRegionName);
        if (req.body?.macroRegion !== undefined) {
            const macroRegion = normalizeMarketOptionalText(req.body?.macroRegion);
            if (macroRegion && !['NORTE', 'NORDESTE', 'CENTRO_OESTE', 'SUDESTE', 'SUL'].includes(macroRegion)) {
                return res.status(400).json({ message: 'Macro região inválida.' });
            }
            data.macroRegion = macroRegion;
        }
        if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body?.isActive);
        const updated = await prisma.marketRegion.update({ where: { id: regionId }, data });
        return res.json({ region: serializeMarketRegion(updated) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar região de mercado.' });
    }
});

app.get('/market/prices', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const where = {};
        const state = normalizeMarketState(req.query?.state);
        const regionId = normalizeMarketOptionalText(req.query?.regionId);
        const productType = String(req.query?.productType || '').trim().toUpperCase();
        const sourceId = normalizeMarketOptionalText(req.query?.sourceId);
        const status = String(req.query?.status || '').trim().toUpperCase();
        const dateFrom = normalizeMarketOptionalText(req.query?.dateFrom);
        const dateTo = normalizeMarketOptionalText(req.query?.dateTo);

        if (regionId) where.regionId = regionId;
        if (state) where.region = { state };
        if (productType && MARKET_ALLOWED_PRODUCT_TYPES.has(productType)) where.productType = productType;
        if (sourceId) where.sourceId = sourceId;
        if (status && MARKET_ALLOWED_STATUSES.has(status)) where.status = status;
        if (dateFrom || dateTo) {
            const dateFilter = {};
            if (dateFrom && isValidMarketDateInput(dateFrom)) dateFilter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
            if (dateTo && isValidMarketDateInput(dateTo)) dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`);
            if (Object.keys(dateFilter).length) where.referenceDate = dateFilter;
        }

        const prices = await prisma.marketPrice.findMany({
            where,
            include: { region: true, source: true },
            orderBy: [{ referenceDate: 'desc' }, { updatedAt: 'desc' }],
            take: 300,
        });
        return res.json({ prices: prices.map(serializeMarketPrice) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar cotações de mercado.' });
    }
});

app.post('/market/prices', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const regionId = normalizeMarketOptionalText(req.body?.regionId);
        const sourceId = normalizeMarketOptionalText(req.body?.sourceId);
        const productType = String(req.body?.productType || '').trim().toUpperCase();
        const unit = String(req.body?.unit || '').trim().toUpperCase();
        const paymentType = String(req.body?.paymentType || 'NAO_INFORMADO').trim().toUpperCase();
        const status = String(req.body?.status || 'DRAFT').trim().toUpperCase();
        const referenceDateInput = normalizeMarketOptionalText(req.body?.referenceDate);
        const referenceDate = parseMarketReferenceDate(referenceDateInput);
        const price = parseNumber(req.body?.price);
        const referenceWeightArrobas = req.body?.referenceWeightArrobas === undefined ? null : parseNumber(req.body?.referenceWeightArrobas);
        const sourceBase = normalizeMarketOptionalText(req.body?.sourceBase);
        const notes = normalizeMarketOptionalText(req.body?.notes);

        if (!regionId || !UUID_REGEX.test(regionId)) return res.status(400).json({ message: 'Região é obrigatória.' });
        if (!sourceId || !UUID_REGEX.test(sourceId)) return res.status(400).json({ message: 'Fonte é obrigatória.' });
        if (!MARKET_ALLOWED_PRODUCT_TYPES.has(productType)) return res.status(400).json({ message: 'Produto inválido.' });
        if (!MARKET_ALLOWED_UNITS.has(unit)) return res.status(400).json({ message: 'Unidade inválida.' });
        if (!MARKET_ALLOWED_PAYMENT_TYPES.has(paymentType)) return res.status(400).json({ message: 'Tipo de pagamento inválido.' });
        if (!MARKET_ALLOWED_STATUSES.has(status)) return res.status(400).json({ message: 'Status inválido.' });
        if (!referenceDate) return res.status(400).json({ message: 'Data de referência inválida.' });
        if (referenceDate.getTime() > Date.now()) return res.status(400).json({ message: 'Data de referência não pode ser futura.' });
        if (!price || price <= 0) return res.status(400).json({ message: 'Preço deve ser maior que zero.' });
        if (referenceWeightArrobas !== null && referenceWeightArrobas <= 0) return res.status(400).json({ message: 'Peso de referência inválido.' });

        const repoProducts = new Set(['BEZERRO_DESMAMA', 'BEZERRO_12M', 'GARROTE', 'BOI_MAGRO']);
        if (repoProducts.has(productType) && unit === 'CABECA' && !referenceWeightArrobas) {
            return res.status(400).json({ message: 'Peso em arrobas é obrigatório para reposição por cabeça.' });
        }
        if (productType === 'BOI_GORDO' && unit !== 'ARROBA') {
            return res.status(400).json({ message: 'Boi gordo deve usar unidade ARROBA.' });
        }

        const created = await prisma.marketPrice.create({
            data: {
                regionId,
                sourceId,
                productType,
                price,
                unit,
                paymentType,
                referenceDate,
                referenceWeightArrobas,
                sourceBase,
                notes,
                status,
                createdByUserId: req.user.id,
            },
            include: { source: true, region: true },
        });
        return res.status(201).json({ price: serializeMarketPrice(created) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao criar cotação de mercado.' });
    }
});

app.patch('/market/prices/:id', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketModelDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado ainda não está disponível neste ambiente.',
            });
        }
        const priceId = String(req.params.id || '');
        if (!UUID_REGEX.test(priceId)) return res.status(400).json({ message: 'Cotação inválida.' });
        const data = {};
        if (req.body?.regionId !== undefined) {
            const regionId = normalizeMarketOptionalText(req.body?.regionId);
            if (!regionId || !UUID_REGEX.test(regionId)) return res.status(400).json({ message: 'Região inválida.' });
            data.regionId = regionId;
        }
        if (req.body?.sourceId !== undefined) {
            const sourceId = normalizeMarketOptionalText(req.body?.sourceId);
            if (!sourceId || !UUID_REGEX.test(sourceId)) return res.status(400).json({ message: 'Fonte inválida.' });
            data.sourceId = sourceId;
        }
        if (req.body?.productType !== undefined) {
            const productType = String(req.body?.productType || '').trim().toUpperCase();
            if (!MARKET_ALLOWED_PRODUCT_TYPES.has(productType)) return res.status(400).json({ message: 'Produto inválido.' });
            data.productType = productType;
        }
        if (req.body?.price !== undefined) {
            const price = parseNumber(req.body?.price);
            if (!price || price <= 0) return res.status(400).json({ message: 'Preço deve ser maior que zero.' });
            data.price = price;
        }
        if (req.body?.unit !== undefined) {
            const unit = String(req.body?.unit || '').trim().toUpperCase();
            if (!MARKET_ALLOWED_UNITS.has(unit)) return res.status(400).json({ message: 'Unidade inválida.' });
            data.unit = unit;
        }
        if (req.body?.paymentType !== undefined) {
            const paymentType = String(req.body?.paymentType || '').trim().toUpperCase();
            if (!MARKET_ALLOWED_PAYMENT_TYPES.has(paymentType)) return res.status(400).json({ message: 'Tipo de pagamento inválido.' });
            data.paymentType = paymentType;
        }
        if (req.body?.status !== undefined) {
            const status = String(req.body?.status || '').trim().toUpperCase();
            if (!MARKET_ALLOWED_STATUSES.has(status)) return res.status(400).json({ message: 'Status inválido.' });
            data.status = status;
        }
        if (req.body?.referenceDate !== undefined) {
            const referenceDate = parseMarketReferenceDate(req.body?.referenceDate);
            if (!referenceDate) return res.status(400).json({ message: 'Data de referência inválida.' });
            if (referenceDate.getTime() > Date.now()) return res.status(400).json({ message: 'Data de referência não pode ser futura.' });
            data.referenceDate = referenceDate;
        }
        if (req.body?.referenceWeightArrobas !== undefined) {
            if (req.body?.referenceWeightArrobas === null || req.body?.referenceWeightArrobas === '') {
                data.referenceWeightArrobas = null;
            } else {
                const weight = parseNumber(req.body?.referenceWeightArrobas);
                if (!weight || weight <= 0) return res.status(400).json({ message: 'Peso em arrobas inválido.' });
                data.referenceWeightArrobas = weight;
            }
        }
        if (req.body?.sourceBase !== undefined) data.sourceBase = normalizeMarketOptionalText(req.body?.sourceBase);
        if (req.body?.notes !== undefined) data.notes = normalizeMarketOptionalText(req.body?.notes);

        const updated = await prisma.marketPrice.update({
            where: { id: priceId },
            data,
            include: { source: true, region: true },
        });
        return res.json({ price: serializeMarketPrice(updated) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar cotação de mercado.' });
    }
});

app.post('/market/jobs/run-mock-national', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketPipelineDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
            });
        }

        const source = await prisma.marketSource.findFirst({
            where: { name: { equals: 'EIXO Mercado', mode: 'insensitive' } },
            orderBy: { updatedAt: 'desc' },
        });
        if (!source) {
            return res.status(404).json({ message: 'Fonte EIXO Mercado não encontrada.' });
        }

        const result = await runMarketCapture({
            prisma,
            sourceId: source.id,
            adapterName: 'mock-national',
            actorUserId: req.user?.id || null,
        });
        return res.status(201).json({
            job: result.job,
            summary: result.counters,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao executar job mock nacional.' });
    }
});

app.get('/market/jobs', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketPipelineDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
            });
        }
        const takeRaw = Number(req.query?.take);
        const take = Number.isFinite(takeRaw) && takeRaw > 0 ? Math.min(takeRaw, 200) : 50;
        const jobs = await prisma.marketPublishJob.findMany({
            include: { source: true },
            orderBy: [{ createdAt: 'desc' }],
            take,
        });
        return res.json({
            jobs: jobs.map((job) => ({
                id: job.id,
                status: job.status,
                startedAt: job.startedAt?.toISOString?.() || null,
                finishedAt: job.finishedAt?.toISOString?.() || null,
                sourceId: job.sourceId || null,
                sourceName: job.source?.name || null,
                summary: job.summary || null,
                errorMessage: job.errorMessage || null,
                createdAt: job.createdAt.toISOString(),
                updatedAt: job.updatedAt.toISOString(),
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar jobs de mercado.' });
    }
});

app.get('/market/raw-captures', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketPipelineDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
            });
        }
        const sourceId = normalizeMarketOptionalText(req.query?.sourceId);
        const status = String(req.query?.status || '').trim().toUpperCase();
        const where = {};
        if (sourceId && UUID_REGEX.test(sourceId)) where.sourceId = sourceId;
        if (status) where.status = status;

        const captures = await prisma.marketRawCapture.findMany({
            where,
            include: { source: true },
            orderBy: [{ capturedAt: 'desc' }],
            take: 300,
        });
        return res.json({ captures: captures.map(serializeMarketRawCapture) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar capturas brutas.' });
    }
});

app.get('/market/normalized-prices', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketPipelineDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
            });
        }
        const status = String(req.query?.status || '').trim().toUpperCase();
        const validationStatus = String(req.query?.validationStatus || '').trim().toUpperCase();
        const where = {};
        if (status) where.status = status;
        if (validationStatus) where.validationStatus = validationStatus;

        const normalized = await prisma.marketNormalizedPrice.findMany({
            where,
            include: { source: true, region: true },
            orderBy: [{ referenceDate: 'desc' }, { createdAt: 'desc' }],
            take: 500,
        });
        return res.json({ normalizedPrices: normalized.map(serializeMarketNormalizedPrice) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar cotações normalizadas.' });
    }
});

app.post('/market/normalized-prices/:id/publish', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketPipelineDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
            });
        }
        const id = String(req.params.id || '');
        if (!UUID_REGEX.test(id)) return res.status(400).json({ message: 'ID inválido.' });
        const published = await publishNormalizedPrice(prisma, id, req.user?.id || null);
        return res.json({ price: serializeMarketPrice(published) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: error?.message || 'Erro ao publicar cotação normalizada.' });
    }
});

app.post('/market/normalized-prices/:id/reject', requireAuth, requireMarketAdmin, async (req, res) => {
    try {
        if (!hasMarketPipelineDelegates()) {
            return res.status(503).json({
                error: 'MARKET_MODULE_NOT_READY',
                message: 'EIXO Mercado Nacional ainda não está disponível neste ambiente.',
            });
        }
        const id = String(req.params.id || '');
        if (!UUID_REGEX.test(id)) return res.status(400).json({ message: 'ID inválido.' });
        const reviewerNotes = normalizeMarketOptionalText(req.body?.reviewerNotes);
        const rejected = await rejectNormalizedPrice(prisma, id, reviewerNotes);
        return res.json({
            normalizedPrice: {
                id: rejected.id,
                status: rejected.status,
                validationStatus: rejected.validationStatus,
                reviewerNotes: rejected.reviewerNotes || null,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: error?.message || 'Erro ao rejeitar cotação normalizada.' });
    }
});

app.get('/overview/dashboard', requireAuth, async (req, res) => {
    try {
        const scope = req.query?.scope === 'farm' ? 'farm' : 'all';
        const rawFarmId = typeof req.query?.farmId === 'string' ? req.query.farmId.trim() : '';
        const farmId = scope === 'farm' ? rawFarmId : '';
        const mes = Number(req.query?.mes) || (new Date().getMonth() + 1);
        const ano = Number(req.query?.ano) || new Date().getFullYear();

        if (scope === 'farm' && !farmId) {
            return res.status(400).json({ message: 'farmId é obrigatório quando scope=farm.' });
        }

        const farms = await prisma.farm.findMany({
            where: buildFarmScopeFilter(req, scope === 'farm' ? { id: farmId } : {}),
            select: { id: true, name: true, size: true, city: true, lat: true, lng: true, mapData: true },
        });
        if (scope === 'farm' && farms.length === 0) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const farmIds = farms.map((farm) => farm.id);
        const selectedFarm = scope === 'farm' ? farms[0] : null;
        let marketReplacement = buildEmptyMarketReplacementSnapshot();
        try {
            marketReplacement = await buildMarketReplacementSnapshot({ scope, farm: selectedFarm });
        } catch (marketError) {
            const fallbackRegionContext = scope === 'farm' ? resolveFarmMarketRegion(selectedFarm) : null;
            console.error('[overview/dashboard] marketReplacement failed', {
                scope,
                farmId: farmId || null,
                error: marketError?.message || 'unknown_error',
            });
            marketReplacement = buildEmptyMarketReplacementSnapshot({
                region: fallbackRegionContext?.region || null,
                state: fallbackRegionContext?.state || null,
            });
        }
        if (!farmIds.length) {
            return res.json({
                kpis: {
                    totalAnimais: 0,
                    nascimentosMes: 0,
                    categorias: [],
                    taxaOcupacao: null,
                    gmdMedio: null,
                    entradas: null,
                    saidas: null,
                    saldoMes: null,
                    animaisSemPesagem: 0,
                    areaTotalHa: null,
                },
                marketReplacement,
            });
        }

        const animals = await prisma.animal.findMany({
            where: {
                farmId: { in: farmIds },
                farm: buildFarmRelationFilter(req),
            },
            select: { id: true, categoria: true, dataNascimento: true },
        });

        const totalAnimais = animals.length;
        const nascimentosMes = animals.filter((animal) => {
            if (!animal.dataNascimento) return false;
            const birthDate = new Date(animal.dataNascimento);
            if (Number.isNaN(birthDate.getTime())) return false;
            return birthDate.getMonth() + 1 === mes && birthDate.getFullYear() === ano;
        }).length;

        const catMap = new Map();
        for (const animal of animals) {
            const cat = animal.categoria || 'Sem categoria';
            catMap.set(cat, (catMap.get(cat) || 0) + 1);
        }
        const categorias = Array.from(catMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 4);

        const areaTotalHa = farms.reduce((sum, farm) => sum + (Number(farm.size) || 0), 0) || null;
        const taxaOcupacao = areaTotalHa && areaTotalHa > 0 && totalAnimais > 0
            ? totalAnimais / areaTotalHa
            : null;

        const animalIds = animals.map((animal) => animal.id);
        let gmdMedio = null;
        let animaisSemPesagem = totalAnimais;
        if (animalIds.length > 0) {
            const weighings = await prisma.weighing.findMany({
                where: { animalId: { in: animalIds } },
                orderBy: [{ animalId: 'asc' }, { data: 'desc' }],
                select: { animalId: true, gmd: true, data: true },
            });
            const lastByAnimal = new Map();
            for (const item of weighings) {
                if (!lastByAnimal.has(item.animalId)) {
                    lastByAnimal.set(item.animalId, { gmd: item.gmd, date: item.data });
                }
            }
            const cutoff30 = new Date();
            cutoff30.setDate(cutoff30.getDate() - 30);
            animaisSemPesagem = animals.filter((animal) => {
                const last = lastByAnimal.get(animal.id);
                if (!last) return true;
                return new Date(last.date) < cutoff30;
            }).length;
            const validGmds = Array.from(lastByAnimal.values())
                .map((item) => item.gmd)
                .filter((g) => g !== null && g > 0);
            gmdMedio = validGmds.length
                ? validGmds.reduce((sum, value) => sum + value, 0) / validGmds.length
                : null;
        }

        const start = new Date(ano, mes - 1, 1);
        const end = new Date(ano, mes, 1);
        const txs = await prisma.financialTransaction.findMany({
            where: {
                farmId: { in: farmIds },
                data: { gte: start, lt: end },
                status: { not: 'CANCELADO' },
            },
            select: { type: true, valor: true },
        });
        const entradas = txs
            .filter((item) => item.type === 'ENTRADA')
            .reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
        const saidas = txs
            .filter((item) => item.type === 'SAIDA' || item.type === 'SAÍDA')
            .reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
        const saldoMes = entradas - saidas;

        return res.json({
            kpis: {
                totalAnimais,
                nascimentosMes,
                categorias,
                taxaOcupacao,
                gmdMedio,
                entradas,
                saidas,
                saldoMes,
                animaisSemPesagem,
                areaTotalHa,
            },
            marketReplacement,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar visão geral.' });
    }
});

// ── Rota: log de atividades ───────────────────────────────────────────────────
app.get('/alerts', requireAuth, async (req, res) => {
    const { farmId } = req.query || {};
    const staleDays = 7;
    const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    try {
        if (farmId) {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
                select: { id: true },
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
        }

        const farms = await prisma.farm.findMany({
            where: buildFarmScopeFilter(req, farmId ? { id: String(farmId) } : {}),
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
        const farmIds = farms.map((farm) => farm.id);
        if (farmIds.length === 0) {
            return res.json({ alerts: [] });
        }

        const alerts = [];
        const fieldAppAlertsEnabled = process.env.ENABLE_FIELD_APP_ALERTS === 'true';

        if (fieldAppAlertsEnabled) {
            const [paddocks, staleOccurrences, immediateOccurrences] = await Promise.all([
                prisma.paddock.findMany({
                    where: { farmId: { in: farmIds }, active: true },
                    select: { id: true, farmId: true, name: true },
                    orderBy: { name: 'asc' },
                }),
                prisma.fieldOccurrence.findMany({
                    where: {
                        farmId: { in: farmIds },
                        type: { in: ['COCHO', 'AGUA'] },
                    },
                    include: {
                        paddock: true,
                        createdBy: { select: { id: true, name: true } },
                    },
                    orderBy: { occurredAt: 'desc' },
                }),
                prisma.fieldOccurrence.findMany({
                    where: {
                        farmId: { in: farmIds },
                        status: 'PENDENTE',
                        type: { in: ['NASCEU', 'MORREU', 'DOENTE', 'AVARIA'] },
                    },
                    include: {
                        animal: true,
                        paddock: true,
                        createdBy: { select: { id: true, name: true } },
                    },
                    orderBy: { occurredAt: 'desc' },
                    take: 50,
                }),
            ]);

            const paddocksByFarmId = new Map();
            paddocks.forEach((paddock) => {
                const current = paddocksByFarmId.get(paddock.farmId) || [];
                current.push(paddock);
                paddocksByFarmId.set(paddock.farmId, current);
            });

            const latestByKey = new Map();
            staleOccurrences.forEach((occurrence) => {
                const scopeId = occurrence.paddockId || '__farm__';
                const key = `${occurrence.farmId}:${occurrence.type}:${scopeId}`;
                if (!latestByKey.has(key)) {
                    latestByKey.set(key, occurrence);
                }
            });

            for (const farm of farms) {
                const farmPaddocks = paddocksByFarmId.get(farm.id) || [];
                for (const type of ['COCHO', 'AGUA']) {
                    const scopes = farmPaddocks.length > 0
                        ? farmPaddocks.map((paddock) => ({ id: paddock.id, label: paddock.name }))
                        : [{ id: '__farm__', label: farm.name }];

                    for (const scope of scopes) {
                        const latest = latestByKey.get(`${farm.id}:${type}:${scope.id}`) || null;
                        if (latest && latest.occurredAt >= staleCutoff) {
                            continue;
                        }
                        const daysSince = getDaysSince(latest?.occurredAt);
                        const workerName = latest?.createdBy?.name ? String(latest.createdBy.name).trim() : '';
                        const workerPrefix = workerName ? `${workerName}, ` : '';
                        alerts.push({
                            id: `stale-${type.toLowerCase()}-${farm.id}-${scope.id}`,
                            type: 'warning',
                            message: `${type}: ${workerPrefix}${type === 'COCHO' ? 'cocho' : 'bebedouro'} sem atualização${daysSince === null ? ' no período' : ` há ${daysSince} dia(s)`}.`,
                            source: 'APP_MANEJO',
                            sourceType: type,
                            sourceId: latest?.id || null,
                            farmId: farm.id,
                            createdAt: latest?.occurredAt?.toISOString?.() ?? null,
                        });
                    }
                }
            }

            immediateOccurrences
                .map(buildFieldOccurrenceAlert)
                .filter(Boolean)
                .forEach((alert) => alerts.push(alert));
        }

        const severityOrder = { critical: 0, warning: 1, info: 2 };
        alerts.sort((a, b) => {
            const severityDiff = (severityOrder[a.type] ?? 3) - (severityOrder[b.type] ?? 3);
            if (severityDiff !== 0) {
                return severityDiff;
            }
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        return res.json({ alerts: alerts.slice(0, 80) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar alertas.' });
    }
});

app.get('/field-occurrences', requireAuth, async (req, res) => {
    const { farmId, limit = 50, offset = 0, type, status } = req.query;
    try {
        const where = {
            organizationId: req.saas?.organizationId || null,
            ...(farmId ? { farmId: String(farmId) } : {}),
            ...(type ? { type: String(type) } : {}),
            ...(status ? { status: String(status) } : {}),
            ...(req.access?.restrictToFarmIds?.length
                ? { farmId: { in: req.access.restrictToFarmIds, ...(farmId ? undefined : {}) } }
                : {}),
        };

        if (farmId && req.access?.restrictToFarmIds?.length && !req.access.restrictToFarmIds.includes(String(farmId))) {
            return res.status(403).json({ message: 'Acesso negado para essa fazenda.' });
        }

        const items = await prisma.fieldOccurrence.findMany({
            where,
            include: {
                createdBy: { select: { id: true, name: true } },
                animal: { include: { currentPaddock: true } },
                paddock: true,
                attachments: { orderBy: { uploadedAt: 'asc' } },
            },
            orderBy: { occurredAt: 'desc' },
            take: Math.min(Number(limit) || 50, 100),
            skip: Math.max(Number(offset) || 0, 0),
        });

        return res.json({
            occurrences: items.map(serializeFieldOccurrence),
            total: items.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar ocorrências de campo.' });
    }
});

app.post('/field-occurrences', requireAuth, async (req, res) => {
    const {
        farmId,
        type,
        status,
        description,
        animalId,
        paddockId,
        occurredAt,
        lat,
        lng,
        offlineCreatedAt,
        syncSource,
        photoCount,
    } = req.body || {};

    const normalizedType = String(type || '').trim().toUpperCase();
    const normalizedStatus = String(status || 'PENDENTE').trim().toUpperCase();
    const parsedOccurredAt = parseDateValue(occurredAt) || new Date();
    const parsedOfflineCreatedAt = offlineCreatedAt ? parseDateValue(offlineCreatedAt) : null;
    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);

    if (!farmId || !normalizedType) {
        return res.status(400).json({ message: 'Fazenda e tipo da ocorrência são obrigatórios.' });
    }
    if (!Number.isInteger(Number(photoCount)) || Number(photoCount) < 1) {
        return res.status(400).json({ message: 'Envie pelo menos uma foto da ocorrência.' });
    }
    if (!FIELD_OCCURRENCE_TYPES.includes(normalizedType)) {
        return res.status(400).json({ message: 'Tipo de ocorrência inválido.' });
    }
    if (!FIELD_OCCURRENCE_STATUSES.includes(normalizedStatus)) {
        return res.status(400).json({ message: 'Status de ocorrência inválido.' });
    }
    const coordinateError = validateCoordinatePair(parsedLat, parsedLng);
    if (coordinateError) {
        return res.status(400).json({ message: coordinateError });
    }
    if (farmId && req.access?.restrictToFarmIds?.length && !req.access.restrictToFarmIds.includes(String(farmId))) {
        return res.status(403).json({ message: 'Acesso negado para essa fazenda.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
            select: { id: true, organizationId: true },
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const normalizedSyncSource = typeof syncSource === 'string' ? syncSource.trim() || null : null;

        if (normalizedSyncSource) {
            const existingOccurrence = await prisma.fieldOccurrence.findFirst({
                where: {
                    organizationId: farm.organizationId || req.saas?.organizationId,
                    farmId: String(farmId),
                    createdById: req.user.id,
                    syncSource: normalizedSyncSource,
                },
                include: {
                    createdBy: { select: { id: true, name: true } },
                    animal: { include: { currentPaddock: true } },
                    paddock: true,
                    attachments: true,
                },
            });
            if (existingOccurrence) {
                return res.json({ occurrence: serializeFieldOccurrence(existingOccurrence) });
            }
        }

        if (animalId) {
            const animal = await prisma.animal.findFirst({
                where: {
                    id: String(animalId),
                    farmId: String(farmId),
                    farm: buildFarmRelationFilter(req),
                },
                select: { id: true },
            });
            if (!animal) {
                return res.status(400).json({ message: 'Animal inválido para essa fazenda.' });
            }
        }

        if (paddockId) {
            const paddock = await prisma.paddock.findFirst({
                where: {
                    id: String(paddockId),
                    farmId: String(farmId),
                    farm: buildFarmRelationFilter(req),
                },
                select: { id: true },
            });
            if (!paddock) {
                return res.status(400).json({ message: 'Pasto inválido para essa fazenda.' });
            }
        }

        const occurrence = await prisma.fieldOccurrence.create({
            data: {
                organizationId: farm.organizationId || req.saas?.organizationId,
                farmId: String(farmId),
                createdById: req.user.id,
                type: normalizedType,
                status: normalizedStatus,
                description: typeof description === 'string' ? description.trim() || null : null,
                animalId: animalId ? String(animalId) : null,
                paddockId: paddockId ? String(paddockId) : null,
                occurredAt: parsedOccurredAt,
                lat: parsedLat,
                lng: parsedLng,
                offlineCreatedAt: parsedOfflineCreatedAt,
                syncSource: normalizedSyncSource,
            },
            include: {
                createdBy: { select: { id: true, name: true } },
                animal: { include: { currentPaddock: true } },
                paddock: true,
                attachments: true,
            },
        });

        await logActivity(req, {
            action: 'OCORRENCIA_CAMPO_CRIADA',
            entity: 'FieldOccurrence',
            entityId: occurrence.id,
            description: `Registrou ocorrência ${normalizedType.toLowerCase()} na fazenda`,
            farmId: occurrence.farmId,
        });

        return res.status(201).json({ occurrence: serializeFieldOccurrence(occurrence) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar ocorrência de campo.' });
    }
});

app.post('/field-occurrences/:id/attachments', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { fileName, mimeType, contentBase64 } = req.body || {};
    const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
    const safeFileName = sanitizeUploadFileName(fileName);
    const fileBuffer = decodeBase64Payload(contentBase64);

    if (!safeFileName || !normalizedMimeType || !fileBuffer?.length) {
        return res.status(400).json({ message: 'Arquivo inválido para upload.' });
    }
    if (!FIELD_ATTACHMENT_ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
        return res.status(400).json({ message: 'Tipo de arquivo não suportado.' });
    }

    try {
        const occurrence = await prisma.fieldOccurrence.findFirst({
            where: {
                id,
                organizationId: req.saas?.organizationId || null,
                ...(req.access?.restrictToFarmIds?.length ? { farmId: { in: req.access.restrictToFarmIds } } : {}),
            },
            include: {
                attachments: true,
            },
        });

        if (!occurrence) {
            return res.status(404).json({ message: 'Ocorrência não encontrada.' });
        }
        if (occurrence.attachments.length >= FIELD_ATTACHMENT_MAX_FILES) {
            return res.status(400).json({ message: 'A ocorrência já atingiu o limite de 3 fotos.' });
        }

        const uploadDir = path.join(
            FIELD_OCCURRENCE_UPLOAD_ROOT,
            occurrence.organizationId,
            occurrence.farmId,
            occurrence.id,
        );
        await fs.mkdir(uploadDir, { recursive: true });

        const savedName = `${Date.now()}-${safeFileName}`;
        const fullPath = path.join(uploadDir, savedName);
        await fs.writeFile(fullPath, fileBuffer);

        const attachment = await prisma.fieldOccurrenceAttachment.create({
            data: {
                occurrenceId: occurrence.id,
                fileName: safeFileName,
                mimeType: normalizedMimeType,
                storagePath: fullPath,
            },
        });

        return res.status(201).json({ attachment: serializeFieldOccurrenceAttachment(attachment) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar anexo da ocorrência.' });
    }
});

app.get('/field-occurrence-attachments/:attachmentId/file', requireAuth, async (req, res) => {
    const { attachmentId } = req.params;
    try {
        const attachment = await prisma.fieldOccurrenceAttachment.findFirst({
            where: {
                id: attachmentId,
                occurrence: {
                    organizationId: req.saas?.organizationId || null,
                    ...(req.access?.restrictToFarmIds?.length ? { farmId: { in: req.access.restrictToFarmIds } } : {}),
                },
            },
        });
        if (!attachment) {
            return res.status(404).json({ message: 'Anexo não encontrado.' });
        }
        return res.sendFile(attachment.storagePath);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar anexo.' });
    }
});

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

// ─── News proxy ───────────────────────────────────────────────────────────────

const NEWS_SOURCES = [
    { url: 'https://www.canalrural.com.br/feed/',             source: 'Canal Rural' },
    { url: 'https://www.beefpoint.com.br/feed/',              source: 'BeefPoint'   },
    { url: 'https://revistagloborural.globo.com/rss/',        source: 'Globo Rural' },
    { url: 'https://www.dbo.com.br/feed/',                    source: 'DBO'         },
];

const NEWS_KEYWORDS = [
    // Pecuária e animais
    'boi','vaca','bovino','gado','bezerro','novilho','novilha',
    'nelore','angus','brahman','zebu','rebanho','plantel','matriz',
    'reprodutor','touro',
    // Mercado e preços
    'arroba','@boi','carcaça','frigorífico','abate','carne bovina','proteína animal',
    // Manejo e produção
    'confinamento','pastagem','pasto','forrageira','brachiaria','capim',
    'suplementação','sal mineral','vermífugo','sanidade','vacinação','aftosa','brucelose',
    // Agro geral que impacta o pecuarista
    'clima','seca','chuva','ração','milho','soja','câmbio','dólar','exportação','importação',
    // Instituições e mercado
    'cepea','esalq','mapa','sif','rastreabilidade','gtb','minerva','jbs','marfrig','frigol',
];

const newsMatchesKeyword = (text) => {
    const lower = text.toLowerCase();
    return NEWS_KEYWORDS.some((kw) => lower.includes(kw));
};

const parseRssItems = (xml, source) => {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
        const c = m[1];
        const title = (c.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || c.match(/<title>(.*?)<\/title>/s))?.[1]?.trim();
        const link = (c.match(/<link>(https?:\/\/[^<]+)<\/link>/) || c.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/))?.[1]?.trim();
        const pubDate = c.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || null;
        const rawDesc = (c.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || c.match(/<description>([\s\S]*?)<\/description>/))?.[1] || '';
        const description = rawDesc.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, ' ').trim().slice(0, 140) || null;
        if (title && link && newsMatchesKeyword(title + ' ' + (description || ''))) {
            items.push({ title, link, pubDate, description, source });
        }
    }
    return items;
};

let _newsCache = null;
let _newsCacheTs = 0;
const NEWS_CACHE_TTL = 30 * 60 * 1000; // 30 min

app.get('/api/news/cattle', requireAuth, async (req, res) => {
    try {
        if (_newsCache && Date.now() - _newsCacheTs < NEWS_CACHE_TTL) {
            return res.json(_newsCache);
        }

        const fetches = NEWS_SOURCES.map(({ url, source }) =>
            fetch(url, { headers: { 'User-Agent': 'EIXO-Sistema/1.0' }, signal: AbortSignal.timeout(8000) })
                .then((r) => r.ok ? r.text() : Promise.resolve(''))
                .then((xml) => parseRssItems(xml, source))
                .catch(() => [])
        );

        const results = await Promise.all(fetches);
        const allItems = results.flat();

        // Ordena por data (mais recente primeiro) e pega os 6 melhores
        allItems.sort((a, b) => {
            const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
            const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
            return db - da;
        });

        const items = allItems.slice(0, 6);
        const result = { items, fetchedAt: new Date().toISOString() };
        _newsCache = result;
        _newsCacheTs = Date.now();
        res.json(result);
    } catch (err) {
        console.error('News proxy error:', err.message);
        if (_newsCache) return res.json({ ..._newsCache, stale: true });
        res.status(502).json({ error: 'Não foi possível carregar as notícias.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/hq/clientes', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const orgs = await prisma.organization.findMany({
            include: {
                memberships: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                createdAt: true,
                            },
                        },
                    },
                },
                billingSubscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
                farms: {
                    include: { _count: { select: { animals: true } } },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const result = orgs.map((org) => {
            const owner = org.memberships.find((membership) => membership.role === 'OWNER')?.user;
            const totalAnimals = org.farms.reduce((sum, farm) => sum + farm._count.animals, 0);
            const sub = org.billingSubscriptions[0];

            return {
                id: org.id,
                name: org.name,
                slug: org.slug,
                owner: owner ? { name: owner.name, email: owner.email } : null,
                plan: sub?.planCode ?? 'GRATIS',
                billingStatus: sub?.status ?? null,
                accessState: org.accessState,
                totalAnimals,
                totalFarms: org.farms.length,
                createdAt: org.createdAt,
            };
        });

        return res.json({ clientes: result });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar clientes HQ.' });
    }
});

app.patch('/api/hq/clientes/:organizationId/plan', requireAuth, requireSuperAdmin, async (req, res) => {
    const { organizationId } = req.params;
    const { planCode, billingStatus } = req.body || {};

    const normalizedPlanCode = String(planCode || '').trim().toUpperCase();
    const normalizedBillingStatus = String(billingStatus || '').trim().toUpperCase();
    const allowedPlans = new Set(['GRATIS', 'EIXO_GESTAO', 'EIXO_DECISAO']);
    const allowedStatuses = new Set(['ACTIVE', 'BLOCKED']);

    if (!organizationId) {
        return res.status(400).json({ message: 'Organização não informada.' });
    }
    if (!allowedPlans.has(normalizedPlanCode)) {
        return res.status(400).json({ message: 'Plano inválido.' });
    }
    if (!allowedStatuses.has(normalizedBillingStatus)) {
        return res.status(400).json({ message: 'Status inválido.' });
    }

    try {
        const organization = await prisma.organization.findUnique({
            where: { id: String(organizationId) },
            select: { id: true, name: true },
        });
        if (!organization) {
            return res.status(404).json({ message: 'Organização não encontrada.' });
        }

        const now = new Date();
        const subscription = await prisma.$transaction(async (tx) => {
            await tx.organization.update({
                where: { id: organization.id },
                data: { accessState: normalizedBillingStatus },
            });

            const latestSubscription = await tx.billingSubscription.findFirst({
                where: { organizationId: organization.id },
                orderBy: { createdAt: 'desc' },
            });

            let updatedSubscription;
            if (latestSubscription) {
                updatedSubscription = await tx.billingSubscription.update({
                    where: { id: latestSubscription.id },
                    data: {
                        planCode: normalizedPlanCode,
                        status: normalizedBillingStatus,
                        updatedAt: now,
                        currentPeriodStart: latestSubscription.currentPeriodStart || now,
                        currentPeriodEnd: latestSubscription.currentPeriodEnd || new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)),
                    },
                });
            } else {
                updatedSubscription = await tx.billingSubscription.create({
                    data: {
                        id: `manual-${organization.id}`,
                        organizationId: organization.id,
                        provider: 'INTERNAL',
                        providerSubscriptionId: `manual-${organization.id}`,
                        planCode: normalizedPlanCode,
                        status: normalizedBillingStatus,
                        currentPeriodStart: now,
                        currentPeriodEnd: new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)),
                    },
                });
            }

            const entitlementCodes = PLAN_ENTITLEMENTS[normalizedPlanCode] || ['CORE'];
            const products = await tx.product.findMany({
                where: { code: { in: entitlementCodes } },
                select: { id: true, code: true },
            });
            const productIdsToKeep = products.map((item) => item.id);

            await tx.organizationProductEntitlement.updateMany({
                where: { organizationId: organization.id },
                data: {
                    status: 'INACTIVE',
                    endedAt: now,
                },
            });

            for (const product of products) {
                await tx.organizationProductEntitlement.upsert({
                    where: {
                        organizationId_productId: {
                            organizationId: organization.id,
                            productId: product.id,
                        },
                    },
                    update: {
                        status: 'ACTIVE',
                        startedAt: now,
                        endedAt: null,
                    },
                    create: {
                        organizationId: organization.id,
                        productId: product.id,
                        status: 'ACTIVE',
                        startedAt: now,
                    },
                });
            }

            if (!productIdsToKeep.length) {
                await tx.organizationProductEntitlement.deleteMany({
                    where: { organizationId: organization.id },
                });
            }

            const modulesForPlan = PLAN_MODULES[normalizedPlanCode] || PLAN_MODULES.GRATIS;
            await tx.user.updateMany({
                where: {
                    memberships: {
                        some: { organizationId: organization.id },
                    },
                    NOT: {
                        roles: { hasSome: [FIELD_WORKER_ROLE, FIELD_ADMIN_ROLE] },
                    },
                },
                data: { modules: modulesForPlan },
            });

            return updatedSubscription;
        });

        logActivity(req, {
            action: 'HQ_ORG_PLAN_UPDATED',
            entity: 'Organization',
            entityId: organization.id,
            description: `Atualizou plano da organização ${organization.name}: plano ${normalizedPlanCode}, status ${normalizedBillingStatus}`,
        });

        return res.json({
            ok: true,
            organizationId: organization.id,
            planCode: subscription.planCode,
            billingStatus: subscription.status,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar plano da organização.' });
    }
});

app.get('/api/hq/metricas', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const [totalOrgs, totalUsers, subscriptions, animals] = await Promise.all([
            prisma.organization.count(),
            prisma.user.count(),
            prisma.billingSubscription.findMany({ where: { status: 'ACTIVE' } }),
            prisma.animal.count(),
        ]);

        const paidOrgIds = Array.from(new Set(
            subscriptions
                .filter((subscription) => subscription.planCode !== 'GRATIS')
                .map((subscription) => subscription.organizationId),
        ));
        const freeSubs = Math.max(totalOrgs - paidOrgIds.length, 0);

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const recentOrgs = await prisma.organization.findMany({
            where: { createdAt: { gte: sixMonthsAgo } },
            select: { createdAt: true },
        });

        return res.json({
            totalOrgs,
            totalUsers,
            totalAnimals: animals,
            paidClients: paidOrgIds.length,
            freeClients: freeSubs,
            conversionRate: totalOrgs > 0 ? ((paidOrgIds.length / totalOrgs) * 100).toFixed(1) : '0',
            recentSignups: recentOrgs.length,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar métricas HQ.' });
    }
});

app.get('/api/hq/pipeline', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const paidOrgIds = (
            await prisma.billingSubscription.findMany({
                where: { status: 'ACTIVE', NOT: { planCode: 'GRATIS' } },
                select: { organizationId: true },
            })
        ).map((subscription) => subscription.organizationId);

        const leads = await prisma.organization.findMany({
            where: {
                createdAt: { lte: sevenDaysAgo },
                id: { notIn: paidOrgIds },
            },
            include: {
                memberships: {
                    where: { role: 'OWNER' },
                    include: {
                        user: {
                            select: {
                                name: true,
                                email: true,
                                phone: true,
                                createdAt: true,
                            },
                        },
                    },
                },
                farms: { select: { id: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        const result = leads.map((org) => {
            const owner = org.memberships[0]?.user;
            const diasNoSistema = Math.floor((Date.now() - new Date(org.createdAt).getTime()) / (1000 * 60 * 60 * 24));

            return {
                id: org.id,
                name: org.name,
                owner: owner ? { name: owner.name, email: owner.email, phone: owner.phone } : null,
                diasNoSistema,
                totalFarms: org.farms.length,
                createdAt: org.createdAt,
            };
        });

        return res.json({ pipeline: result });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar pipeline HQ.' });
    }
});

app.get('/api/hq/suporte', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const logs = await prisma.activityLog.findMany({
            where: {
                entity: SUPPORT_ENTITY,
                action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN] },
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        const grouped = new Map();
        for (const log of logs) {
            const key = log.entityId || `sem-id-${log.id}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    conversationId: key,
                    user: log.user ? { id: log.user.id, name: log.user.name, email: log.user.email } : null,
                    lastMessage: log.description || '',
                    lastAction: log.action || '',
                    lastAt: log.createdAt,
                    totalMessages: 0,
                });
            }
            const row = grouped.get(key);
            row.totalMessages += 1;
        }

        const conversations = Array.from(grouped.values()).sort(
            (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
        );

        return res.json({ suporte: conversations });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar suporte HQ.' });
    }
});

app.get('/api/hq/suporte/:conversationId/messages', requireAuth, requireSuperAdmin, async (req, res) => {
    const { conversationId } = req.params;
    try {
        const [messages, state] = await Promise.all([
            prisma.activityLog.findMany({
                where: {
                    entity: SUPPORT_ENTITY,
                    entityId: conversationId,
                    action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN] },
                },
                orderBy: { createdAt: 'asc' },
                include: { user: { select: { id: true, name: true, email: true } } },
            }),
            getSupportConversationState(conversationId),
        ]);

        return res.json({
            conversationId,
            assumedByAdmin: state.assumed,
            assumedByUserId: state.assumedByUserId,
            messages: messages.map((item) => ({
                id: item.id,
                action: item.action,
                text: item.description || '',
                createdAt: item.createdAt,
                user: item.user ? { id: item.user.id, name: item.user.name, email: item.user.email } : null,
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar mensagens da conversa.' });
    }
});

app.post('/api/hq/suporte/:conversationId/assume', requireAuth, requireSuperAdmin, async (req, res) => {
    const { conversationId } = req.params;
    try {
        await createSupportLog(req, {
            conversationId,
            action: SUPPORT_ACTION_ASSUME,
            message: 'Conversa assumida por SUPER ADMIN.',
            requestMeta: {
                adminUserId: req.user.id,
                adminName: req.user.name || null,
            },
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao assumir conversa.' });
    }
});

app.post('/api/hq/suporte/:conversationId/release', requireAuth, requireSuperAdmin, async (req, res) => {
    const { conversationId } = req.params;
    try {
        await createSupportLog(req, {
            conversationId,
            action: SUPPORT_ACTION_RELEASE,
            message: 'Conversa devolvida para atendimento automático.',
            requestMeta: {
                adminUserId: req.user.id,
                adminName: req.user.name || null,
            },
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao liberar conversa.' });
    }
});

app.post('/api/hq/suporte/:conversationId/reply', requireAuth, requireSuperAdmin, async (req, res) => {
    const { conversationId } = req.params;
    const { message } = req.body || {};
    if (!message || !String(message).trim()) {
        return res.status(400).json({ message: 'Mensagem vazia.' });
    }
    try {
        await createSupportLog(req, {
            conversationId,
            action: SUPPORT_ACTION_ADMIN,
            message: String(message).trim().slice(0, 2000),
            requestMeta: {
                adminUserId: req.user.id,
                adminName: req.user.name || null,
                role: 'super_admin',
            },
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao responder conversa.' });
    }
});

app.get('/api/hq/cadastro', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                document: true,
                documentType: true,
                createdAt: true,
                roles: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return res.json({ cadastro: users });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar cadastro HQ.' });
    }
});

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
