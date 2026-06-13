import { PrismaClient } from '@prisma/client';
import { UUID_REGEX, allowXUserId } from '../config/constants.js';
import { extractSessionTokenFromRequest, hashSessionToken, getSessionFromRequest } from './session.js';
import { ensureSaasContextForUser, ensureFieldWorkerFarmAccess, isSaasContextError, BILLING_BLOCKED_STATES } from '../utils/saasContext.js';

const prisma = new PrismaClient();

export const isFieldWorkerRequest = (req) => req.access?.appContext?.mode === 'field';

export const requireBillingAccess = (req, res, next) => {
    if (isFieldWorkerRequest(req)) {
        return res.status(403).json({ message: 'Financeiro não está disponível para operação de campo.' });
    }
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

export const requireNonFieldWorker = (req, res, next) => {
    if (isFieldWorkerRequest(req)) {
        return res.status(403).json({ message: 'Ação não permitida para operação de campo.' });
    }
    return next();
};

export const requireEntitlement = (...codes) => async (req, res, next) => {
    const orgId = req.saas?.organizationId || null;
    if (!orgId) return res.status(403).json({ message: 'Organização não encontrada.' });
    const entitlements = req.saas?.entitlements || [];
    const hasEntitlement = codes.some((code) => entitlements.includes(code));
    if (hasEntitlement) return next();
    const count = await prisma.organizationProductEntitlement.count({
        where: { organizationId: orgId, status: 'ACTIVE', product: { code: { in: codes } } },
    });
    if (count > 0) return next();
    return res.status(403).json({
        code: 'entitlement_required',
        message: 'Este módulo não está disponível no seu plano atual.',
    });
};

export const requireAuth = async (req, res, next) => {
    try {
        const presentedSessionToken = extractSessionTokenFromRequest(req);
        const session = await getSessionFromRequest(req);
        if (session?.user) {
            if (session.deviceId) {
                if (!session.device || !session.device.isActive || session.device.revokedAt) {
                    await prisma.session.updateMany({
                        where: { id: session.id, revokedAt: null },
                        data: { revokedAt: new Date() },
                    });
                    return res.status(401).json({ message: 'Aparelho revogado. Solicite nova liberacao da fazenda.' });
                }
                await prisma.appDevice.update({
                    where: { id: session.deviceId },
                    data: { lastSeenAt: new Date() },
                });
                req.appDevice = session.device;
            }
            req.user = session.user;
            req.session = session;
            req.saas = await ensureSaasContextForUser(session.user.id);
            req.access = await ensureFieldWorkerFarmAccess(session.user, req.saas);
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
            req.access = await ensureFieldWorkerFarmAccess(user, req.saas);
            return next();
        }

        if (presentedSessionToken) {
            const tokenHash = hashSessionToken(presentedSessionToken);
            const existingSession = await prisma.session.findFirst({
                where: { tokenHash },
                select: { revokedAt: true, expiresAt: true },
            });
            if (existingSession?.revokedAt) {
                return res.status(401).json({
                    code: 'SESSION_REVOKED',
                    message: 'Sessão encerrada. Faça login novamente.',
                });
            }
            if (existingSession?.expiresAt && existingSession.expiresAt <= new Date()) {
                return res.status(401).json({
                    code: 'SESSION_EXPIRED',
                    message: 'Sessão expirada. Faça login novamente.',
                });
            }
            return res.status(401).json({
                code: 'SESSION_INVALID',
                message: 'Sessão encerrada. Faça login novamente.',
            });
        }

        return res.status(401).json({ message: 'Usuário não autenticado.' });
    } catch (error) {
        if (isSaasContextError(error)) {
            return res.status(403).json({ message: 'Conta sem vínculo válido com uma organização.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar usuário.' });
    }
};

export const requireSuperAdmin = (req, res, next) => {
    if (!req.user?.roles?.includes('SUPER_ADMIN')) {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    return next();
};

export const requireMarketAdmin = (req, res, next) => {
    if (!req.user?.roles?.includes('SUPER_ADMIN')) {
        return res.status(403).json({ message: 'Acesso negado.' });
    }
    return next();
};
