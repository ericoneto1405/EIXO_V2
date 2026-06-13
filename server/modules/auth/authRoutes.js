import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import twilio from 'twilio';
import {
    PORT, IS_PROD, SESSION_TOKEN_SALT, SESSION_LOGIN_TTL_MS, SESSION_COOKIE_NAME,
    OTP_SEND_WINDOW_MS, OTP_SEND_MAX_PER_IP, OTP_SEND_MAX_PER_PHONE,
    OTP_VERIFY_WINDOW_MS, OTP_VERIFY_MAX_PER_IP, OTP_VERIFY_MAX_PER_PHONE,
    FORGOT_PASSWORD_WINDOW_MS, FORGOT_PASSWORD_MAX_ATTEMPTS,
    APP_BASE_URL, RESEND_FROM_EMAIL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID,
    PASSWORD_POLICY_MESSAGE, AVATAR_UPLOAD_ROOT,
    APP_ACTIVATION_CODE_TTL_MS, APP_ACTIVATION_CODE_ALPHABET, PHONE_VERIFY_TTL_MS,
    FIELD_WORKER_ROLE, FIELD_ADMIN_ROLE, FIELD_WORKER_DEFAULT_MODULES,
} from '../config/env.js';
import { isPasswordStrongEnough, validateCNPJ, validateCPF, fetchCnpjData } from '../utils/validators.js';
import { sanitizeUser, escapeHtml, normalizeEmailForLogin, isEmailValid } from '../utils/formatters.js';
import { normalizeUserModules, isSaasContextError } from '../utils/saasContext.js';
import { logActivity } from '../utils/activityLog.js';
import {
    otpSendAttempts, otpVerifyAttempts, forgotPasswordAttempts,
    isWindowRateLimited, registerWindowAttempt, clearWindowAttempt, getWindowRetryAfterSeconds,
    isAnyLoginRateLimited, registerFailedLogin, clearLoginAttempts,
    registerFailedLogins, clearLoginRateLimits,
    isAnyForgotPasswordRateLimited, registerForgotPasswordAttempts, clearForgotPasswordAttempts,
} from '../middlewares/rateLimiter.js';
import {
    hashSessionToken, generateSessionToken, buildCookieOptions,
    extractSessionTokenFromRequest, hashPasswordResetToken,
    buildLoginRateLimitKeys, buildForgotPasswordRateLimitKeys,
    sanitizeWebDeviceKey, buildSessionUserAgent,
    createSessionForUser, buildAppAuthPayload, getSessionFromRequest,
} from '../middlewares/session.js';
import {
    ensureSaasContextForUser, ensureFieldWorkerFarmAccess,
    serializeAuthUser, serializeAuthUserWithContext,
    buildAllowedModulesFromPlan,
} from '../utils/saasContext.js';
import { requireAuth, requireBillingAccess, requireEntitlement } from '../middlewares/requireAuth.js';

const prisma = new PrismaClient();
const resend = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_...' ? new Resend(process.env.RESEND_API_KEY) : null;
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

// Map temporário: phone -> { verifiedAt: number }  (TTL 30 min, uso único)
const verifiedPhones    = new Map();

export const normalizeActivationCode = (value) =>
    String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

export const hashActivationCode = (value) =>
    crypto
        .createHash('sha256')
        .update(normalizeActivationCode(value))
        .update(':app-activation:')
        .update(SESSION_TOKEN_SALT)
        .digest('hex');

export const generateActivationCode = () => {
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

export const generateInternalFieldUserEmail = (name) =>
    `${normalizeInternalEmailToken(name)}.${crypto.randomBytes(4).toString('hex')}@manejo.eixo.local`;

const decodeBase64Payload = (value) => {
    const raw = String(value || '').trim();
    if (!raw) {
        return null;
    }
    const normalized = raw.includes(',') ? raw.split(',').pop() : raw;
    return Buffer.from(normalized, 'base64');
};

export function registerAuthRoutes(app) {
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
}
