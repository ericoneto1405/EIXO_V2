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
import { registerAuthRoutes } from "./modules/auth/authRoutes.js";
import { registerUserRoutes } from "./modules/users/userRoutes.js";
import { registerFarmRoutes } from "./modules/farms/farmRoutes.js";
import { registerAnimalRoutes } from "./modules/animals/animalRoutes.js";
import { registerPORoutes } from "./modules/po/poRoutes.js";
import { registerHerdRoutes } from "./modules/herd/herdRoutes.js";
import { registerReproRoutes } from "./modules/repro/reproRoutes.js";

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

// ─────────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();



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








// ─────────────────────────────────────────────────────────────────────────────



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
// ─── Registro de Módulos Extraídos (Fase 4) ──────────────────────────────────
registerAuthRoutes(app);
registerUserRoutes(app);
registerFarmRoutes(app);
registerAnimalRoutes(app);
registerPORoutes(app);
registerHerdRoutes(app);
registerReproRoutes(app);

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
