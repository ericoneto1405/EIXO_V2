import { PrismaClient } from '@prisma/client';
import { FIELD_WORKER_ROLE, FIELD_ADMIN_ROLE, FIELD_WORKER_DEFAULT_MODULES } from '../config/env.js';

const prisma = new PrismaClient();

export const SUPER_ADMIN_ALL_MODULES = [
    'Mapa do Sistema', 'Visão Geral', 'Fazendas', 'Mapa da Fazenda',
    'Rebanho Comercial', 'Eixo Genetics',
    'Fornecedores', 'Remédios', 'Rações', 'Suplementos',
    'Nutrição', 'Financeiro',
    'Operações', 'Configurações', 'Registro de Atividades',
];

export const BILLING_BLOCKED_STATES = new Set(['PAST_DUE', 'BLOCKED', 'CANCELED']);
export const PLAN_ENTITLEMENTS = {
    GRATIS: ['CORE'],
    EIXO_GESTAO: ['CORE', 'NUTRITION', 'EIXO_GESTAO'],
    EIXO_DECISAO: ['CORE', 'GENETICS', 'PO', 'NUTRITION', 'EIXO_GESTAO', 'EIXO_DECISAO', 'EIXO_NUTRITION'],
};
export const PLAN_MODULES = {
    GRATIS: ['Fazendas', 'Rebanho Comercial', 'Financeiro', 'Visão Geral'],
    EIXO_GESTAO: ['Fazendas', 'Rebanho Comercial', 'Financeiro', 'Visão Geral', 'Nutrição', 'Registro de Atividades'],
    EIXO_DECISAO: ['Fazendas', 'Rebanho Comercial', 'Financeiro', 'Visão Geral', 'Nutrição', 'Registro de Atividades', 'Eixo Genetics'],
};

export const buildLegacyEntitlements = (modules) => {
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

export const ORGANIZATION_ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);

export const hasUserRole = (user, role) => {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return Array.isArray(user?.roles) && user.roles.some((item) => String(item || '').trim().toLowerCase() === normalizedRole);
};

export const isFieldWorkerUser = (user) => hasUserRole(user, FIELD_WORKER_ROLE);
export const isFieldAdminUser = (user) => hasUserRole(user, FIELD_ADMIN_ROLE);
export const isFieldAppUser = (user) => isFieldWorkerUser(user) || isFieldAdminUser(user);

export const getDerivedFieldProfile = (user) => {
    if (user?.fieldProfile) {
        return user.fieldProfile;
    }
    if (isFieldWorkerUser(user)) {
        return 'VAQUEIRO';
    }
    if (isFieldAdminUser(user)) {
        return 'ADMIN_CAMPO';
    }
    return null;
};

export const getDerivedAccessType = (user) => {
    if (user?.accessType) {
        return user.accessType;
    }
    return isFieldAppUser(user) ? 'APP_MANEJO' : 'WEB';
};

export const getDerivedActivationStatus = (user) => {
    const accessType = getDerivedAccessType(user);
    if (accessType === 'WEB_APP') {
        return null;
    }
    if (user?.appActivationStatus) {
        return user.appActivationStatus;
    }
    if (accessType === 'WEB') {
        return null;
    }
    return 'PENDENTE_ATIVACAO';
};

export const buildManagedUserSummaries = (user) => {
    const latestCode = Array.isArray(user?.appActivationCodes) ? user.appActivationCodes[0] : null;
    const activeDevice = Array.isArray(user?.appDevices) ? user.appDevices[0] : null;
    const effectiveStatus = (() => {
        if (activeDevice?.isActive && !activeDevice?.revokedAt) {
            return 'ATIVO';
        }
        if (latestCode?.revokedAt) {
            return 'BLOQUEADO';
        }
        if (latestCode?.usedAt) {
            return getDerivedActivationStatus(user);
        }
        if (latestCode?.expiresAt && new Date(latestCode.expiresAt).getTime() < Date.now()) {
            return 'CODIGO_EXPIRADO';
        }
        return getDerivedActivationStatus(user);
    })();

    return {
        accessType: getDerivedAccessType(user),
        fieldProfile: getDerivedFieldProfile(user),
        appActivationStatus: effectiveStatus,
        activeAppCode: latestCode
            ? {
                createdAt: latestCode.createdAt?.toISOString?.() ?? null,
                expiresAt: latestCode.expiresAt?.toISOString?.() ?? null,
                usedAt: latestCode.usedAt?.toISOString?.() ?? null,
                revokedAt: latestCode.revokedAt?.toISOString?.() ?? null,
            }
            : null,
        activeAppDevice: activeDevice
            ? {
                id: activeDevice.id,
                deviceLabel: activeDevice.deviceLabel || null,
                platform: activeDevice.platform || null,
                appVersion: activeDevice.appVersion || null,
                activatedAt: activeDevice.activatedAt?.toISOString?.() ?? null,
                lastSeenAt: activeDevice.lastSeenAt?.toISOString?.() ?? null,
            }
            : null,
    };
};

export const normalizeUserModules = (modules, roles = [], accessType = 'WEB') => {
    const normalizedModules = Array.isArray(modules)
        ? Array.from(new Set(modules.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];
    const hasFieldRole = roles.some((role) => {
        const normalizedRole = String(role || '').trim().toLowerCase();
        return normalizedRole === FIELD_WORKER_ROLE || normalizedRole === FIELD_ADMIN_ROLE;
    });
    if (accessType === 'APP_MANEJO' && hasFieldRole) {
        return FIELD_WORKER_DEFAULT_MODULES;
    }
    if (hasFieldRole && !normalizedModules.includes('Rebanho Comercial')) {
        return [...normalizedModules, 'Rebanho Comercial'];
    }
    return normalizedModules;
};

export const buildAllowedModulesFromPlan = (modules, entitlements, roles = [], accessType = 'WEB') => {
    const normalizedModules = normalizeUserModules(modules, roles, accessType);
    if (accessType === 'APP_MANEJO') {
        return normalizedModules;
    }

    const codes = new Set((entitlements || []).map((code) => String(code || '').trim().toUpperCase()));
    const nextModules = new Set(normalizedModules.length ? normalizedModules : PLAN_MODULES.GRATIS);

    if (codes.has('NUTRITION') || codes.has('EIXO_NUTRITION') || codes.has('EIXO_GESTAO') || codes.has('EIXO_DECISAO')) {
        nextModules.add('Nutrição');
    }
    if (codes.has('GENETICS') || codes.has('PO') || codes.has('EIXO_GENETICS') || codes.has('EIXO_DECISAO')) {
        nextModules.add('Eixo Genetics');
    }
    if (codes.has('EIXO_GESTAO') || codes.has('EIXO_DECISAO')) {
        nextModules.add('Registro de Atividades');
    }

    return Array.from(nextModules);
};

export const canManageOrganizationUsers = (req) => {
    const membershipRole = String(req.saas?.membershipRole || '').trim().toUpperCase();
    return hasUserRole(req.user, 'admin') || ORGANIZATION_ADMIN_ROLES.has(membershipRole);
};

export const serializeManagedUser = (user, membershipRole = null) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    modules: Array.isArray(user.modules) ? user.modules : [],
    roles: Array.isArray(user.roles) ? user.roles : [],
    accessType: getDerivedAccessType(user),
    fieldProfile: getDerivedFieldProfile(user),
    appActivationStatus: getDerivedActivationStatus(user),
    lastFarmId: user.lastFarmId ?? null,
    membershipRole,
    ...buildManagedUserSummaries(user),
    createdAt: user.createdAt?.toISOString?.() ?? null,
});

export const normalizeOrganizationSlug = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'org';

export const ensureFieldWorkerFarmAccess = async (user, saasContext = null) => {
    if (!isFieldAppUser(user)) {
        return {
            allowedFarmIds: [],
            defaultFarmId: user.lastFarmId ?? null,
            restrictToFarmIds: null,
            appContext: {
                profile: 'full_user',
                mode: 'full',
            },
        };
    }

    const farmAccesses = await prisma.userFarmAccess.findMany({
        where: {
            userId: user.id,
            farm: saasContext?.organizationId
                ? { organizationId: saasContext.organizationId }
                : undefined,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: {
            farm: {
                select: { id: true },
            },
        },
    });

    const allowedFarmIds = farmAccesses.map((item) => item.farmId);
    const defaultFarmId = farmAccesses.find((item) => item.isDefault)?.farmId
        || allowedFarmIds[0]
        || null;

    if (!defaultFarmId || allowedFarmIds.length !== 1) {
        throw new SaasContextError('Usuário de campo sem fazenda válida vinculada.');
    }

    return {
        allowedFarmIds,
        defaultFarmId,
        restrictToFarmIds: allowedFarmIds,
        appContext: {
            profile: isFieldAdminUser(user) ? 'field_admin' : 'field_worker',
            mode: 'field',
        },
    };
};

export class SaasContextError extends Error {
    constructor(message = 'Usuário sem organização ativa.') {
        super(message);
        this.name = 'SaasContextError';
        this.code = 'SAAS_CONTEXT_INVALID';
    }
}

export const isSaasContextError = (error) => error?.code === 'SAAS_CONTEXT_INVALID';

export const ensureSaasContextForUser = async (userId, { allowProvision = false } = {}) => {
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

    if ((!activeOrganization || !membership) && user.memberships.length) {
        membership = user.memberships[0];
        activeOrganization = membership.organization;
        await prisma.user.update({
            where: { id: user.id },
            data: { activeOrganizationId: activeOrganization.id },
        });
    }

    if (!activeOrganization || !membership) {
        if (!allowProvision) {
            throw new SaasContextError('Usuário sem vínculo válido com uma organização.');
        }
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
    const activeSubscription = await prisma.billingSubscription.findFirst({
        where: {
            organizationId: activeOrganization.id,
            status: 'ACTIVE',
        },
        orderBy: { createdAt: 'desc' },
        select: { planCode: true },
    });
    const subscriptionPlanCode = String(activeSubscription?.planCode || '').trim().toUpperCase();
    const subscriptionEntitlements = PLAN_ENTITLEMENTS[subscriptionPlanCode] || [];
    const mergedEntitlementCodes = Array.from(new Set([
        ...entitlements.map((item) => item.product.code),
        ...subscriptionEntitlements,
    ]));

    return {
        organizationId: activeOrganization.id,
        membershipRole: membership?.role || null,
        billingAccessState: activeOrganization.accessState,
        entitlements: mergedEntitlementCodes,
        organization: {
            id: activeOrganization.id,
            name: activeOrganization.name,
            slug: activeOrganization.slug,
            accessState: activeOrganization.accessState,
        },
    };
};

export const serializeAuthUser = (user, saasContext = null, accessContext = null) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    modules: user.roles?.includes('SUPER_ADMIN') ? SUPER_ADMIN_ALL_MODULES : (accessContext?.allowedModules || user.modules),
    allowedModules: user.roles?.includes('SUPER_ADMIN') ? SUPER_ADMIN_ALL_MODULES : (accessContext?.allowedModules || user.modules),
    roles: user.roles,
    accessType: getDerivedAccessType(user),
    fieldProfile: getDerivedFieldProfile(user),
    appActivationStatus: getDerivedActivationStatus(user),
    lastFarmId: user.lastFarmId,
    allowedFarmIds: accessContext?.allowedFarmIds || [],
    defaultFarmId: accessContext?.defaultFarmId || user.lastFarmId || null,
    appContext: accessContext?.appContext || { profile: 'full_user', mode: 'full' },
    organizationId: saasContext?.organizationId || null,
    membershipRole: saasContext?.membershipRole || null,
    billingAccessState: saasContext?.billingAccessState || null,
    entitlements: user.roles?.includes('SUPER_ADMIN')
        ? ['GENETICS', 'PO', 'NUTRITION', 'EIXO_GESTAO', 'EIXO_DECISAO', 'EIXO_NUTRITION']
        : (saasContext?.entitlements || []),
    organization: saasContext?.organization || null,
    onboardingCompletedAt: user.onboardingCompletedAt || null,
    phone: user.phone || null,
    avatarUrl: user.avatarUrl || null,
});

export const serializeAuthUserWithContext = async (userId, options) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return null;
    }
    const saasContext = await ensureSaasContextForUser(userId, options);
    const accessContext = await ensureFieldWorkerFarmAccess(user, saasContext);
    return serializeAuthUser(user, saasContext, {
        ...accessContext,
        allowedModules: buildAllowedModulesFromPlan(user.modules, saasContext?.entitlements || [], user.roles, user.accessType),
    });
};
