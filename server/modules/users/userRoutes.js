import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middlewares/requireAuth.js';
import { sanitizeUser, escapeHtml, isEmailValid } from '../../utils/formatters.js';
import { isPasswordStrongEnough, validateCNPJ, validateCPF, fetchCnpjData } from '../../utils/validators.js';
import { logActivity } from '../../utils/activityLog.js';
import { buildFarmScopeFilter } from '../../middlewares/farmScope.js';
import {
    canManageOrganizationUsers, serializeManagedUser,
    isFieldAppUser, hasUserRole,
    ensureSaasContextForUser, ensureFieldWorkerFarmAccess,
    normalizeUserModules as normalizeUserModulesFn,
} from '../../utils/saasContext.js';
import {
    generateActivationCode, hashActivationCode, normalizeActivationCode,
    generateInternalFieldUserEmail,
} from '../auth/authRoutes.js';
import {
    APP_ACTIVATION_CODE_TTL_MS, SESSION_COOKIE_NAME,
    APP_BASE_URL, RESEND_FROM_EMAIL,
    FIELD_WORKER_ROLE, FIELD_ADMIN_ROLE, FIELD_WORKER_DEFAULT_MODULES,
    PASSWORD_POLICY_MESSAGE,
} from '../../config/env.js';
import { Resend } from 'resend';
import {
    buildAppPermissions, buildAppAuthPayload,
    createSessionForUser, buildCookieOptions, getSessionFromRequest,
} from '../../middlewares/session.js';
import { buildFarmRelationFilter } from '../../middlewares/farmScope.js';
import {
    normalizeOrganizationSlug, ensureSaasContextForUser as ensureSaas,
    isSaasContextError,
} from '../../utils/saasContext.js';

const prisma = new PrismaClient();
const resend = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_...' ? new Resend(process.env.RESEND_API_KEY) : null;

function normalizeUserModulesLocal(modules, roles, accessType) {
    return normalizeUserModules(modules, roles, accessType);
}

export function registerUserRoutes(app) {
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
}
