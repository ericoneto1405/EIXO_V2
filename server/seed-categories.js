import { PrismaClient } from '@prisma/client';
import { upsertSystemAccountCategories } from './accountCategoryDefaults.js';

const prisma = new PrismaClient();

async function main() {
    await upsertSystemAccountCategories(prisma);
    console.log('Categorias padrão do sistema sincronizadas.');
}

main()
    .catch((error) => {
        console.error('Erro ao sincronizar categorias.', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
