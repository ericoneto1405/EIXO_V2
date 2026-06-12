import { PrismaClient } from '@prisma/client';
import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth.js';
import { PLAN_ENTITLEMENTS, PLAN_MODULES, FIELD_WORKER_ROLE, FIELD_ADMIN_ROLE } from '../utils/saasContext.js';
import { createSupportLog, getSupportConversationState, SUPPORT_ENTITY, SUPPORT_ACTION_ASSUME, SUPPORT_ACTION_RELEASE, SUPPORT_ACTION_ADMIN } from '../chat/chatService.js';
import { logActivity } from '../utils/activityLog.js';
const prisma = new PrismaClient();

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
                    action: { in: ['chat_message_user', 'chat_message_ai', 'chat_message_admin'] },
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
                        action: { in: ['chat_message_user', 'chat_message_ai', 'chat_message_admin'] },
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
}
