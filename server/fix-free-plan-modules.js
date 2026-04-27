/**
 * Script pontual: garante que todos os usuários do plano grátis
 * (sem entitlements pagos) tenham os 4 módulos base do plano grátis.
 *
 * Rodar uma única vez:
 *   node fix-free-plan-modules.js
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Visão Geral removida do plano grátis em 2026-04-24 — exclusiva de planos pagos
const FREE_PLAN_MODULES = ['Fazendas', 'Rebanho Comercial', 'Financeiro'];

async function main() {
    // Busca usuários com módulos que não cobrem o plano grátis completo
    const users = await prisma.user.findMany({
        select: { id: true, email: true, modules: true },
    });

    let updated = 0;

    for (const user of users) {
        const current = user.modules || [];
        const missingModules = FREE_PLAN_MODULES.filter((m) => !current.includes(m));

        // Só adiciona módulos que faltam — nunca remove o que o usuário já tem
        if (missingModules.length > 0) {
            const merged = Array.from(new Set([...current, ...FREE_PLAN_MODULES]));
            await prisma.user.update({
                where: { id: user.id },
                data: { modules: merged },
            });
            console.log(`✅ ${user.email}: adicionados [${missingModules.join(', ')}]`);
            updated++;
        }
    }

    console.log(`\nConcluído. ${updated} usuário(s) atualizado(s).`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
