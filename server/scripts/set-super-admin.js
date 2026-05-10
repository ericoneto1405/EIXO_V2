import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const prisma = new PrismaClient();

const EMAIL = process.argv[2];
if (!EMAIL) {
    console.error('Uso: node set-super-admin.js <email>');
    process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email: EMAIL } });
if (!user) {
    console.error(`Usuário não encontrado: ${EMAIL}`);
    process.exit(1);
}

const updatedRoles = Array.from(new Set([...(user.roles || []), 'SUPER_ADMIN']));
await prisma.user.update({ where: { email: EMAIL }, data: { roles: updatedRoles } });
console.log(`✅ SUPER_ADMIN atribuído a ${EMAIL}`);

await prisma.$disconnect();
