import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SESSION_TOKEN_SALT, SESSION_COOKIE_NAME, SESSION_LOGIN_TTL_MS, IS_PROD } from '../config/env.js';
import { normalizeEmailForLogin } from '../utils/formatters.js';
import { serializeAuthUserWithContext } from '../utils/saasContext.js';

const prisma = new PrismaClient();

export const hashSessionToken = (token) =>
    crypto
        .createHash('sha256')
        .update(token)
        .update(SESSION_TOKEN_SALT)
        .digest('hex');

export const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

export const buildCookieOptions = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/',
});

export const extractSessionTokenFromRequest = (req) => {
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (cookieToken) {
        return cookieToken;
    }
    const authHeader = req.get('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }
    const headerToken = req.get('x-session-token');
    if (headerToken) {
        return String(headerToken).trim();
    }
    return null;
};

export const hashPasswordResetToken = (token) =>
    crypto
        .createHash('sha256')
        .update(String(token || ''))
        .update(SESSION_TOKEN_SALT)
        .digest('hex');

export const buildLoginRateLimitKeys = (email, ip) => {
    const keys = [`ip:${String(ip || 'unknown')}`];
    const normalizedEmail = normalizeEmailForLogin(email);
    if (normalizedEmail) {
        keys.push(`email:${normalizedEmail}`);
    }
    return keys;
};

export const buildForgotPasswordRateLimitKeys = (email, ip) => {
    const keys = [`forgot:ip:${String(ip || 'unknown')}`];
    const normalizedEmail = normalizeEmailForLogin(email);
    if (normalizedEmail) {
        keys.push(`forgot:email:${normalizedEmail}`);
    }
    return keys;
};

export const WEB_DEVICE_MARKER = '::eixo-web-device:';

export const sanitizeWebDeviceKey = (value) => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) return null;
    return normalized;
};

export const buildSessionUserAgent = (req, webDeviceKey = null) => {
    const baseUserAgent = req.get('user-agent') || null;
    if (!webDeviceKey) return baseUserAgent;
    if (!baseUserAgent) return `${WEB_DEVICE_MARKER}${webDeviceKey}`;
    return `${baseUserAgent}${WEB_DEVICE_MARKER}${webDeviceKey}`;
};

export const createSessionForUser = async (userId, req, { deviceId = null, webDeviceKey = null } = {}) => {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_LOGIN_TTL_MS);

    await prisma.session.create({
        data: {
            userId,
            deviceId,
            tokenHash,
            expiresAt,
            userAgent: buildSessionUserAgent(req, webDeviceKey),
            ip: req.ip,
        },
    });

    return { token, expiresAt };
};

export const buildAppPermissions = (fieldProfile) => {
    if (fieldProfile === 'ADMIN_CAMPO') {
        return [
            'animals.read',
            'lots.read',
            'paddocks.read',
            'field_occurrences.read',
            'field_occurrences.create',
            'field_occurrences.attach',
            'weighings.create',
            'weighings.read',
            'curral.operate',
            'handling.collective',
        ];
    }

    return [
        'animals.read',
        'lots.read',
        'paddocks.read',
        'field_occurrences.read',
        'field_occurrences.create',
        'field_occurrences.attach',
    ];
};

export const buildAppAuthPayload = async (userId, { device = null } = {}) => {
    const user = await serializeAuthUserWithContext(userId);
    if (!user) {
        return null;
    }

    const fieldProfile = user.fieldProfile || null;
    const farm = user.defaultFarmId
        ? await prisma.farm.findUnique({
            where: { id: user.defaultFarmId },
            select: { id: true, name: true, city: true },
        })
        : null;

    return {
        user,
        farm,
        profile: fieldProfile,
        permissions: buildAppPermissions(fieldProfile),
        device: device
            ? {
                id: device.id,
                deviceLabel: device.deviceLabel || null,
                platform: device.platform || null,
                appVersion: device.appVersion || null,
                activatedAt: device.activatedAt?.toISOString?.() ?? null,
                lastSeenAt: device.lastSeenAt?.toISOString?.() ?? null,
            }
            : null,
    };
};

export const getSessionFromRequest = async (req) => {
    const sessionToken = extractSessionTokenFromRequest(req);
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
        include: { user: true, device: true },
    });
};
