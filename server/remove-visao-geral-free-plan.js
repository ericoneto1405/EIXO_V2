/**
 * Script pontual: remove 'Visão Geral' dos módulos de usuários do plano grátis.
 * Decisão: Visão Geral passa a ser exclusiva de planos pagos (2026-04-24).
 *
 * Rodar uma única vez:
 *   cd server && node remove-visao-geral-free-plan.js
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PAID_ENTITLEMENT_PRODUCTS = ['VISAO_GERAL', 'PLAN_PRO', 'PLAN_BUSINESS'];

async function main() {
    // Busca todos os usuários que têm 'Visão Geral' nos módulos
    const users = await prisma.user.findMany({
        where: { modules: { has: 'Visão Geral' } },
        select: {
            id: true,
            email: true,
            modules: true,
            memberships: {
                select: {
                    organization: {
                        select: {
                            entitlements: {
                                select: { productId: true, status: true },
                            },
                        },
                    },
                },
            },
        },
    });

    console.log(`\n🔍 Encontrados ${users.length} usuário(s) com "Visão Geral" nos módulos.\n`);

    let removed = 0;
    let skipped = 0;

    for (const user of users) {
        // Verifica se o usuário tem algum entitlement ativo (plano pago)
        const allEntitlements = user.memberships.flatMap(
            (m) => m.organization?.entitlements || []
        );
        const hasPaidPlan = allEntitlements.some((e) => e.status === 'ACTIVE');

        if (hasPaidPlan) {
            console.log(`⏭️  ${user.email}: plano pago — mantendo "Visão Geral".`);
            skipped++;
            continue;
        }

        // Plano grátis: remove 'Visão Geral'
        const updatedModules = user.modules.filter((m) => m !== 'Visão Geral');
        await prisma.user.update({
            where: { id: user.id },
            data: { modules: updatedModules },
        });
        console.log(`✅ ${user.email}: "Visão Geral" removida. Módulos: [${updatedModules.join(', ')}]`);
        removed++;
    }

    console.log(`\nConcluído.`);
    console.log(`  Removidos : ${removed}`);
    console.log(`  Mantidos  : ${skipped} (plano pago)`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
