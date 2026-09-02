import { PrismaClient } from '@prisma/client';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth.js';
import { PLAN_ENTITLEMENTS, PLAN_MODULES } from '../utils/saasContext.js';
import { FIELD_WORKER_ROLE, FIELD_ADMIN_ROLE, SUPPORT_ROLLOUT_MODE } from '../config/env.js';
import {
    createSupportLog,
    getSupportConversationState,
    SUPPORT_ENTITY,
    SUPPORT_ACTION_ASSUME,
    SUPPORT_ACTION_RELEASE,
    SUPPORT_ACTION_ADMIN,
    SUPPORT_ACTION_REQUEST,
    SUPPORT_ACTION_REVIEWED,
    SUPPORT_ACTION_FEEDBACK_RESOLVED,
    SUPPORT_ACTION_FEEDBACK_UNRESOLVED,
    SUPPORT_ACTION_SATISFACTION,
    SUPPORT_ACTION_KNOWLEDGE_SUGGESTION,
    SUPPORT_ACTION_RESOLVED,
    SUPPORT_ACTION_SHADOW,
} from '../chat/chatService.js';
import { calculateSupportMetrics } from '../chat/supportMetrics.js';
import { SUPPORT_KNOWLEDGE_QUALITY, SUPPORT_KNOWLEDGE_VERSION } from '../chat/supportKnowledge.js';
import { normalizeSupportConversationId } from '../chat/supportRules.js';
import { logActivity } from '../utils/activityLog.js';
const prisma = new PrismaClient();

const findSupportOwner = (conversationId, db = prisma) => db.activityLog.findFirst({
    where: {
        entity: SUPPORT_ENTITY,
        entityId: conversationId,
        action: { in: ['chat_message_user', SUPPORT_ACTION_REQUEST] },
    },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, organizationId: true, farmId: true },
});

export function registerHQRoutes(app) {
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

            logActivity(prisma, req, {
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

    app.get('/api/hq/suporte/metricas', requireAuth, requireSuperAdmin, async (req, res) => {
        const parsedDays = Number.parseInt(String(req.query?.days || '30'), 10);
        const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 90) : 30;
        const since = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        try {
            const logs = await prisma.activityLog.findMany({
                where: { entity: SUPPORT_ENTITY, createdAt: { gte: since } },
                orderBy: { createdAt: 'asc' },
                select: { entityId: true, action: true, requestMeta: true },
            });
            return res.json({
                days,
                knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
                rolloutMode: SUPPORT_ROLLOUT_MODE,
                metrics: calculateSupportMetrics(logs, SUPPORT_KNOWLEDGE_QUALITY),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar métricas do suporte.' });
        }
    });

    app.get('/api/hq/suporte/filtros', requireAuth, requireSuperAdmin, async (_req, res) => {
        const since = new Date(Date.now() - (90 * 24 * 60 * 60 * 1000));
        try {
            const logs = await prisma.activityLog.findMany({
                where: { entity: SUPPORT_ENTITY, createdAt: { gte: since } },
                orderBy: { createdAt: 'desc' },
                take: 10_000,
                select: { organizationId: true, farmId: true, requestMeta: true },
            });
            const organizationIds = Array.from(new Set(logs.map((item) => item.organizationId).filter(Boolean)));
            const farmIds = Array.from(new Set(logs.map((item) => item.farmId).filter(Boolean)));
            const topicIds = Array.from(new Set(logs.flatMap((item) => (
                Array.isArray(item.requestMeta?.topicIds) ? item.requestMeta.topicIds.filter((value) => typeof value === 'string') : []
            )))).sort();
            const reasons = Array.from(new Set(logs.map((item) => {
                if (typeof item.requestMeta?.fallbackReason === 'string') return item.requestMeta.fallbackReason;
                if (typeof item.requestMeta?.escalationReason === 'string') return item.requestMeta.escalationReason;
                if (typeof item.requestMeta?.reason === 'string') return item.requestMeta.reason;
                return item.requestMeta?.responseType === 'clarification' ? 'uncovered' : null;
            }).filter(Boolean))).sort();
            const [organizations, farms] = await Promise.all([
                prisma.organization.findMany({ where: { id: { in: organizationIds } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
                prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
            ]);
            return res.json({ organizations, farms, topicIds, reasons });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar filtros do suporte.' });
        }
    });

    app.get('/api/hq/suporte', requireAuth, requireSuperAdmin, async (req, res) => {
        const parsedPage = Number.parseInt(String(req.query?.page || '1'), 10);
        const parsedLimit = Number.parseInt(String(req.query?.limit || '50'), 10);
        const parsedDays = Number.parseInt(String(req.query?.days || '30'), 10);
        const page = Number.isFinite(parsedPage) ? Math.max(parsedPage, 1) : 1;
        const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 10), 100) : 50;
        const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 90) : 30;
        const since = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        const organizationId = typeof req.query?.organizationId === 'string' ? req.query.organizationId.trim().slice(0, 128) : '';
        const farmId = typeof req.query?.farmId === 'string' ? req.query.farmId.trim().slice(0, 128) : '';
        const topicId = typeof req.query?.topicId === 'string' ? req.query.topicId.trim().slice(0, 80) : '';
        const reason = typeof req.query?.reason === 'string' ? req.query.reason.trim().slice(0, 80) : '';
        const supportActions = ['chat_message_user', 'chat_message_ai', 'chat_message_admin', SUPPORT_ACTION_REQUEST, SUPPORT_ACTION_ASSUME, SUPPORT_ACTION_RELEASE, SUPPORT_ACTION_REVIEWED, SUPPORT_ACTION_FEEDBACK_RESOLVED, SUPPORT_ACTION_FEEDBACK_UNRESOLVED, SUPPORT_ACTION_SATISFACTION, SUPPORT_ACTION_KNOWLEDGE_SUGGESTION, SUPPORT_ACTION_RESOLVED, SUPPORT_ACTION_SHADOW];
        try {
            let matchedConversationIds = null;
            if (topicId || reason) {
                const metadataFilters = [];
                if (topicId) metadataFilters.push({ requestMeta: { path: ['topicIds'], array_contains: [topicId] } });
                if (reason === 'uncovered') {
                    metadataFilters.push({ requestMeta: { path: ['responseType'], equals: 'clarification' } });
                } else if (reason) {
                    metadataFilters.push({ OR: [
                        { requestMeta: { path: ['fallbackReason'], equals: reason } },
                        { requestMeta: { path: ['escalationReason'], equals: reason } },
                        { requestMeta: { path: ['reason'], equals: reason } },
                    ] });
                }
                const matches = await prisma.activityLog.findMany({
                    where: {
                        entity: SUPPORT_ENTITY,
                        action: { in: ['chat_message_ai', SUPPORT_ACTION_SHADOW, SUPPORT_ACTION_REQUEST] },
                        createdAt: { gte: since },
                        ...(organizationId ? { organizationId } : {}),
                        ...(farmId ? { farmId } : {}),
                        AND: metadataFilters,
                    },
                    distinct: ['entityId'],
                    select: { entityId: true },
                });
                matchedConversationIds = matches.map((item) => item.entityId).filter(Boolean);
                if (!matchedConversationIds.length) {
                    return res.json({ suporte: [], pagination: { page, limit, days, hasMore: false } });
                }
            }
            const conversationGroups = await prisma.activityLog.groupBy({
                by: ['entityId'],
                where: {
                    entity: SUPPORT_ENTITY,
                    entityId: { not: null },
                    action: { in: supportActions },
                    createdAt: { gte: since },
                    ...(organizationId ? { organizationId } : {}),
                    ...(farmId ? { farmId } : {}),
                    ...(matchedConversationIds ? { entityId: { in: matchedConversationIds } } : {}),
                },
                _max: { createdAt: true },
                orderBy: { _max: { createdAt: 'desc' } },
                skip: (page - 1) * limit,
                take: limit + 1,
            });
            const hasMore = conversationGroups.length > limit;
            const pagedGroups = conversationGroups.slice(0, limit);
            const conversationIds = pagedGroups
                .map((item) => item.entityId)
                .filter(Boolean);
            const logs = await prisma.activityLog.findMany({
                where: {
                    entity: SUPPORT_ENTITY,
                    entityId: { in: conversationIds },
                    action: { in: supportActions },
                },
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, name: true, email: true } } },
            });

            const grouped = new Map();
            for (const log of logs) {
                const key = log.entityId || `sem-id-${log.id}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        conversationId: key,
                        user: null,
                        lastMessage: '',
                        lastAction: '',
                        lastAt: log.createdAt,
                        totalMessages: 0,
                        humanRequested: false,
                        assumedByAdmin: false,
                        latestControl: null,
                        fallbackReason: null,
                        fallbackAt: null,
                        reviewedAt: null,
                        resolvedAt: null,
                        unresolvedAt: null,
                        knowledgeVersion: null,
                        topicIds: [],
                        confidence: null,
                        responseType: null,
                        provider: null,
                        currentPath: null,
                        farmId: log.farmId || null,
                        organizationId: log.organizationId || null,
                        knowledgeSuggestionAt: null,
                        supportContext: null,
                    });
                }
                const row = grouped.get(key);
                if (['chat_message_user', 'chat_message_ai', 'chat_message_admin', SUPPORT_ACTION_REQUEST].includes(log.action)) {
                    row.totalMessages += 1;
                    if (!row.lastMessage) {
                        row.lastMessage = log.description || '';
                        row.lastAction = log.action || '';
                    }
                    if (!row.user && log.user) {
                        row.user = { id: log.user.id, name: log.user.name, email: log.user.email };
                    }
                }
                if (!row.latestControl && [SUPPORT_ACTION_REQUEST, SUPPORT_ACTION_ASSUME, SUPPORT_ACTION_RELEASE, SUPPORT_ACTION_RESOLVED].includes(log.action)) {
                    row.latestControl = log.action;
                }
                if (!row.fallbackAt && log.action === 'chat_message_ai' && log.requestMeta && typeof log.requestMeta === 'object' && log.requestMeta.fallbackReason) {
                    row.fallbackReason = log.requestMeta.fallbackReason;
                    row.fallbackAt = log.createdAt;
                }
                if (!row.fallbackAt && log.action === 'chat_message_ai' && log.requestMeta?.responseType === 'clarification') {
                    row.fallbackReason = 'uncovered';
                    row.fallbackAt = log.createdAt;
                }
                if (!row.fallbackAt && [SUPPORT_ACTION_SHADOW, SUPPORT_ACTION_REQUEST].includes(log.action)) {
                    const operationalReason = log.requestMeta?.fallbackReason
                        || log.requestMeta?.escalationReason
                        || log.requestMeta?.reason;
                    if (typeof operationalReason === 'string' && operationalReason) {
                        row.fallbackReason = operationalReason;
                        row.fallbackAt = log.createdAt;
                    }
                }
                if (!row.reviewedAt && log.action === SUPPORT_ACTION_REVIEWED) {
                    row.reviewedAt = log.createdAt;
                }
                if (!row.resolvedAt && [SUPPORT_ACTION_FEEDBACK_RESOLVED, SUPPORT_ACTION_RESOLVED].includes(log.action)) {
                    row.resolvedAt = log.createdAt;
                }
                if (!row.unresolvedAt && log.action === SUPPORT_ACTION_FEEDBACK_UNRESOLVED) {
                    row.unresolvedAt = log.createdAt;
                }
                if (log.action === 'chat_message_ai' && log.requestMeta && typeof log.requestMeta === 'object') {
                    if (!row.knowledgeVersion && typeof log.requestMeta.knowledgeVersion === 'string') row.knowledgeVersion = log.requestMeta.knowledgeVersion;
                    if (!row.topicIds.length && Array.isArray(log.requestMeta.topicIds)) row.topicIds = log.requestMeta.topicIds.filter((value) => typeof value === 'string');
                    if (row.confidence === null && Number.isFinite(Number(log.requestMeta.confidence))) row.confidence = Number(log.requestMeta.confidence);
                    if (!row.responseType && typeof log.requestMeta.responseType === 'string') row.responseType = log.requestMeta.responseType;
                    if (!row.provider && typeof log.requestMeta.provider === 'string') row.provider = log.requestMeta.provider;
                }
                if (!row.currentPath && typeof log.requestMeta?.currentPath === 'string') {
                    row.currentPath = log.requestMeta.currentPath;
                }
                if (!row.supportContext && log.requestMeta?.context && typeof log.requestMeta.context === 'object') {
                    row.supportContext = log.requestMeta.context;
                }
                if (!row.knowledgeSuggestionAt && log.action === SUPPORT_ACTION_KNOWLEDGE_SUGGESTION) {
                    row.knowledgeSuggestionAt = log.createdAt;
                }
            }

            const organizationIds = Array.from(new Set(logs.map((log) => log.organizationId).filter(Boolean)));
            const farmIds = Array.from(new Set(logs.map((log) => log.farmId).filter(Boolean)));
            const [organizations, farms] = await Promise.all([
                prisma.organization.findMany({ where: { id: { in: organizationIds } }, select: { id: true, name: true } }),
                prisma.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, name: true } }),
            ]);
            const organizationNames = new Map(organizations.map((item) => [item.id, item.name]));
            const farmNames = new Map(farms.map((item) => [item.id, item.name]));

            const conversations = Array.from(grouped.values())
                .map((item) => {
                    const latestProblemAt = [item.fallbackAt, item.unresolvedAt]
                        .filter(Boolean)
                        .map((value) => new Date(value).getTime())
                        .sort((a, b) => b - a)[0] || 0;
                    const latestResolutionAt = [item.reviewedAt, item.resolvedAt]
                        .filter(Boolean)
                        .map((value) => new Date(value).getTime())
                        .sort((a, b) => b - a)[0] || 0;
                    const needsReview = latestProblemAt > latestResolutionAt;
                    return {
                        ...item,
                        humanRequested: item.latestControl === SUPPORT_ACTION_REQUEST,
                        assumedByAdmin: item.latestControl === SUPPORT_ACTION_ASSUME,
                        resolved: item.latestControl === SUPPORT_ACTION_RESOLVED,
                        needsReview,
                        organizationName: item.organizationId ? organizationNames.get(item.organizationId) || null : null,
                        farmName: item.farmId ? farmNames.get(item.farmId) || null : null,
                        latestControl: undefined,
                        fallbackAt: undefined,
                        reviewedAt: undefined,
                        resolvedAt: undefined,
                        unresolvedAt: undefined,
                    };
                })
                .sort((a, b) => {
                    if (a.humanRequested !== b.humanRequested) return a.humanRequested ? -1 : 1;
                    if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
                    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
                });

            return res.json({
                suporte: conversations,
                pagination: {
                    page,
                    limit,
                    days,
                    hasMore,
                },
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar suporte HQ.' });
        }
    });

    app.get('/api/hq/suporte/:conversationId/messages', requireAuth, requireSuperAdmin, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) return res.status(400).json({ message: 'Conversa inválida.' });
        try {
            const [messages, state] = await Promise.all([
                prisma.activityLog.findMany({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationId,
                        action: { in: ['chat_message_user', 'chat_message_ai', 'chat_message_admin', SUPPORT_ACTION_REQUEST, SUPPORT_ACTION_FEEDBACK_RESOLVED, SUPPORT_ACTION_FEEDBACK_UNRESOLVED, SUPPORT_ACTION_SATISFACTION, SUPPORT_ACTION_KNOWLEDGE_SUGGESTION, SUPPORT_ACTION_RESOLVED, SUPPORT_ACTION_SHADOW] },
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
                resolved: state.resolved,
                messages: messages.map((item) => ({
                    id: item.id,
                    action: item.action,
                    text: item.description || '',
                    createdAt: item.createdAt,
                    farmId: item.farmId || null,
                    metadata: item.requestMeta && typeof item.requestMeta === 'object'
                        ? {
                            knowledgeVersion: item.requestMeta.knowledgeVersion || null,
                            intent: item.requestMeta.intent || null,
                            topicIds: Array.isArray(item.requestMeta.topicIds) ? item.requestMeta.topicIds : [],
                            confidence: Number.isFinite(Number(item.requestMeta.confidence)) ? Number(item.requestMeta.confidence) : null,
                            recommendedLink: item.requestMeta.recommendedLink || null,
                            responseType: item.requestMeta.responseType || null,
                            provider: item.requestMeta.provider || null,
                            escalationReason: item.requestMeta.escalationReason || item.requestMeta.reason || null,
                            currentPath: item.requestMeta.currentPath || null,
                            rating: Number.isInteger(Number(item.requestMeta.rating)) ? Number(item.requestMeta.rating) : null,
                            feedbackReason: typeof item.requestMeta.reason === 'string' ? item.requestMeta.reason : null,
                            context: item.requestMeta.context && typeof item.requestMeta.context === 'object'
                                ? item.requestMeta.context
                                : null,
                        }
                        : null,
                    user: item.action === SUPPORT_ACTION_ADMIN
                        ? {
                            id: item.requestMeta?.adminUserId || null,
                            name: item.requestMeta?.adminName || 'Equipe EIXO',
                            email: null,
                        }
                        : item.user ? { id: item.user.id, name: item.user.name, email: item.user.email } : null,
                })),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar mensagens da conversa.' });
        }
    });

    app.post('/api/hq/suporte/:conversationId/assume', requireAuth, requireSuperAdmin, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) return res.status(400).json({ message: 'Conversa inválida.' });
        try {
            const owner = await findSupportOwner(conversationId);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            const assumedSaved = await createSupportLog(req, {
                conversationId,
                action: SUPPORT_ACTION_ASSUME,
                message: 'Conversa assumida por SUPER ADMIN.',
                requestMeta: {
                    adminUserId: req.user.id,
                    adminName: req.user.name || null,
                },
                farmId: owner.farmId || null,
            });
            if (!assumedSaved) throw new Error('Não foi possível registrar o atendimento.');
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao assumir conversa.' });
        }
    });

    app.post('/api/hq/suporte/:conversationId/release', requireAuth, requireSuperAdmin, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) return res.status(400).json({ message: 'Conversa inválida.' });
        try {
            const owner = await findSupportOwner(conversationId);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            const releasedSaved = await createSupportLog(req, {
                conversationId,
                action: SUPPORT_ACTION_RELEASE,
                message: 'Conversa devolvida para atendimento automático.',
                requestMeta: {
                    adminUserId: req.user.id,
                    adminName: req.user.name || null,
                },
                farmId: owner.farmId || null,
            });
            if (!releasedSaved) throw new Error('Não foi possível liberar o atendimento.');
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao liberar conversa.' });
        }
    });

    app.post('/api/hq/suporte/:conversationId/reply', requireAuth, requireSuperAdmin, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) return res.status(400).json({ message: 'Conversa inválida.' });
        const { message } = req.body || {};
        if (!message || !String(message).trim()) {
            return res.status(400).json({ message: 'Mensagem vazia.' });
        }
        try {
            const ownerLog = await findSupportOwner(conversationId);
            if (!ownerLog) {
                return res.status(404).json({ message: 'Conversa não encontrada.' });
            }
            await prisma.$transaction(async (tx) => {
                const state = await getSupportConversationState(conversationId, tx);
                if (!state.assumed) {
                    const assumedSaved = await createSupportLog(req, {
                        conversationId,
                        action: SUPPORT_ACTION_ASSUME,
                        message: 'Conversa assumida automaticamente ao responder.',
                        requestMeta: {
                            adminUserId: req.user.id,
                            adminName: req.user.name || null,
                        },
                        farmId: ownerLog.farmId || null,
                        db: tx,
                    });
                    if (!assumedSaved) throw new Error('Não foi possível assumir a conversa.');
                }
                const replySaved = await createSupportLog(req, {
                    conversationId,
                    action: SUPPORT_ACTION_ADMIN,
                    message: String(message).trim().slice(0, 2000),
                    userIdOverride: ownerLog.userId,
                    organizationIdOverride: ownerLog.organizationId,
                    requestMeta: {
                        adminUserId: req.user.id,
                        adminName: req.user.name || null,
                        role: 'super_admin',
                    },
                    farmId: ownerLog.farmId || null,
                    db: tx,
                });
                if (!replySaved) throw new Error('Não foi possível registrar a resposta.');
            });
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao responder conversa.' });
        }
    });

    app.post('/api/hq/suporte/:conversationId/review', requireAuth, requireSuperAdmin, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) return res.status(400).json({ message: 'Conversa inválida.' });
        try {
            const owner = await findSupportOwner(conversationId);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            const reviewedSaved = await createSupportLog(req, {
                conversationId,
                action: SUPPORT_ACTION_REVIEWED,
                message: 'Conversa marcada como revisada.',
                requestMeta: {
                    adminUserId: req.user.id,
                    adminName: req.user.name || null,
                },
                farmId: owner.farmId || null,
            });
            if (!reviewedSaved) throw new Error('Não foi possível marcar como revisada.');
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao marcar conversa como revisada.' });
        }
    });

    app.post('/api/hq/suporte/:conversationId/resolve', requireAuth, requireSuperAdmin, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) return res.status(400).json({ message: 'Conversa inválida.' });
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
        if (reason.length < 3) return res.status(400).json({ message: 'Informe o motivo do encerramento.' });
        try {
            const owner = await findSupportOwner(conversationId);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            const saved = await createSupportLog(req, {
                conversationId,
                action: SUPPORT_ACTION_RESOLVED,
                message: 'Atendimento encerrado pela Equipe EIXO.',
                requestMeta: {
                    adminUserId: req.user.id,
                    adminName: req.user.name || null,
                    reason,
                    source: 'hq',
                },
                userIdOverride: owner.userId,
                organizationIdOverride: owner.organizationId,
                farmId: owner.farmId || null,
            });
            if (!saved) throw new Error('Não foi possível encerrar o atendimento.');
            return res.json({ ok: true, resolved: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao encerrar atendimento.' });
        }
    });

    app.post('/api/hq/suporte/:conversationId/knowledge-suggestion', requireAuth, requireSuperAdmin, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) return res.status(400).json({ message: 'Conversa inválida.' });
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
        try {
            const owner = await findSupportOwner(conversationId);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            const [latestCustomerMessage, latestAnswer] = await Promise.all([
                prisma.activityLog.findFirst({
                    where: { entity: SUPPORT_ENTITY, entityId: conversationId, action: 'chat_message_user' },
                    orderBy: { createdAt: 'desc' },
                    select: { description: true },
                }),
                prisma.activityLog.findFirst({
                    where: { entity: SUPPORT_ENTITY, entityId: conversationId, action: 'chat_message_ai' },
                    orderBy: { createdAt: 'desc' },
                    select: { requestMeta: true },
                }),
            ]);
            const saved = await createSupportLog(req, {
                conversationId,
                action: SUPPORT_ACTION_KNOWLEDGE_SUGGESTION,
                message: note || 'Conversa enviada como proposta de melhoria da base de conhecimento.',
                requestMeta: {
                    adminUserId: req.user.id,
                    adminName: req.user.name || null,
                    status: 'pending',
                    customerQuestion: String(latestCustomerMessage?.description || '').slice(0, 500),
                    topicIds: Array.isArray(latestAnswer?.requestMeta?.topicIds)
                        ? latestAnswer.requestMeta.topicIds
                        : [],
                },
                userIdOverride: owner.userId,
                organizationIdOverride: owner.organizationId,
                farmId: owner.farmId || null,
            });
            if (!saved) throw new Error('Não foi possível registrar a sugestão.');
            return res.json({ ok: true, suggestionId: saved.id });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao criar proposta de conhecimento.' });
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
}
