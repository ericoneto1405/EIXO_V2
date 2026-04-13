import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_MODULES = [
    'Visão Geral',
    'Fazendas',
    'Rebanho Comercial',
    'Rebanho Genética',
    'Fornecedores',
    'Remédios',
    'Rações',
    'Suplementos',
    'Contas a Pagar',
    'Contas a Receber',
    'Fluxo de Caixa',
    'DRE',
    'Operações',
    'Configurações',
];
const LEGACY_MODULE_NAME = 'Rebanho P.O.';
const NEW_MODULE_NAME = 'Rebanho Genética';
const DEFAULT_PRODUCTS = [
    { code: 'CORE', name: 'Core', description: 'Base operacional do sistema.' },
    { code: 'GENETICS', name: 'Genetics', description: 'Genética, reprodução e seleção.' },
    { code: 'PO', name: 'Plantel P.O.', description: 'Gestão do plantel P.O.' },
    { code: 'NUTRITION', name: 'Nutrição', description: 'Planos e atribuições nutricionais.' },
];

const normalizeSlug = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'org';

const buildLegacyEntitlements = (modules) => {
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

const main = async () => {
    const hashedPassword = await bcrypt.hash('admin', 10);
    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@eixo.com' },
        update: {
            password: hashedPassword,
            modules: DEFAULT_MODULES,
            roles: ['admin'],
        },
        create: {
            name: 'Administrador',
            email: 'admin@eixo.com',
            password: hashedPassword,
            modules: DEFAULT_MODULES,
            roles: ['admin'],
        },
    });
    for (const product of DEFAULT_PRODUCTS) {
        await prisma.product.upsert({
            where: { code: product.code },
            update: {
                name: product.name,
                description: product.description,
                isActive: true,
            },
            create: product,
        });
    }
    const legacyUsers = await prisma.user.findMany({
        where: { modules: { has: LEGACY_MODULE_NAME } },
        select: { id: true, modules: true },
    });
    for (const user of legacyUsers) {
        const modulesWithoutLegacy = user.modules.filter((module) => module !== LEGACY_MODULE_NAME);
        if (modulesWithoutLegacy.includes(NEW_MODULE_NAME)) {
            if (modulesWithoutLegacy.length !== user.modules.length) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { modules: modulesWithoutLegacy },
                });
            }
            continue;
        }
        const legacyIndex = Math.max(0, user.modules.indexOf(LEGACY_MODULE_NAME));
        const nextModules = [...modulesWithoutLegacy];
        nextModules.splice(legacyIndex, 0, NEW_MODULE_NAME);
        await prisma.user.update({
            where: { id: user.id },
            data: { modules: nextModules },
        });
    }
    const freshAdmin = await prisma.user.findUnique({
        where: { id: adminUser.id },
        select: {
            id: true,
            name: true,
            email: true,
            modules: true,
            activeOrganizationId: true,
        },
    });
    if (freshAdmin) {
        let organization = freshAdmin.activeOrganizationId
            ? await prisma.organization.findUnique({ where: { id: freshAdmin.activeOrganizationId } })
            : null;

        if (!organization) {
            const slugBase = normalizeSlug(`${freshAdmin.name || freshAdmin.email}-org`);
            organization = await prisma.organization.create({
                data: {
                    name: `${freshAdmin.name || 'Conta'} - Organização`,
                    slug: `${slugBase}-${freshAdmin.id.slice(0, 8)}`,
                    billingProvider: 'INTERNAL',
                    accessState: 'ACTIVE',
                },
            });
            await prisma.organizationMembership.upsert({
                where: {
                    organizationId_userId: {
                        organizationId: organization.id,
                        userId: freshAdmin.id,
                    },
                },
                update: { role: 'OWNER' },
                create: {
                    organizationId: organization.id,
                    userId: freshAdmin.id,
                    role: 'OWNER',
                },
            });
            await prisma.user.update({
                where: { id: freshAdmin.id },
                data: { activeOrganizationId: organization.id },
            });
        }

        await prisma.farm.updateMany({
            where: {
                userId: freshAdmin.id,
                organizationId: null,
            },
            data: {
                organizationId: organization.id,
            },
        });

        const entitlementCodes = buildLegacyEntitlements(freshAdmin.modules);
        const products = await prisma.product.findMany({
            where: { code: { in: entitlementCodes } },
            select: { id: true, code: true },
        });
        for (const product of products) {
            await prisma.organizationProductEntitlement.upsert({
                where: {
                    organizationId_productId: {
                        organizationId: organization.id,
                        productId: product.id,
                    },
                },
                update: {
                    status: 'ACTIVE',
                    endedAt: null,
                },
                create: {
                    organizationId: organization.id,
                    productId: product.id,
                    status: 'ACTIVE',
                },
            });
        }
    }
    console.log('Admin upsert ok: admin@eixo.com');
};

main()
    .catch((error) => {
        console.error('Erro ao rodar seed.', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
