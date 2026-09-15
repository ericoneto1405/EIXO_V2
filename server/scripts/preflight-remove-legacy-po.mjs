// Preflight (somente leitura) para a migração 20260915160000_remove_legacy_po.
//
// Roda as MESMAS condições de DELETE/DROP que estão em
// server/prisma/migrations/20260915160000_remove_legacy_po/migration.sql,
// mas só CONTA quantas linhas seriam afetadas - não apaga nada.
//
// Como rodar (no terminal do Mac, dentro da pasta server/):
//   node scripts/preflight-remove-legacy-po.mjs
//
// Precisa rodar ANTES de aplicar a migração (antes do `npx prisma migrate deploy`
// ou `npx prisma migrate dev`), enquanto as tabelas PoAnimal/PoLot/PoWeighing
// ainda existem no banco.

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const prisma = new PrismaClient();

async function count(label, sql) {
    const rows = await prisma.$queryRawUnsafe(sql);
    const n = Number(rows[0].n);
    console.log(`${n.toString().padStart(6)}  ${label}`);
    return n;
}

async function main() {
    console.log('=== Tabelas que serão apagadas por inteiro ===');
    await count('PoAnimal (registros)', `SELECT COUNT(*)::int AS n FROM "PoAnimal"`);
    await count('PoLot (registros)', `SELECT COUNT(*)::int AS n FROM "PoLot"`);
    await count('PoWeighing (registros)', `SELECT COUNT(*)::int AS n FROM "PoWeighing"`);

    console.log('\n=== Linhas que seriam DELETADAS (só existem ligadas ao Plantel P.O., sem par no cadastro novo) ===');
    const herdEvents = await count(
        'HerdEvent (evento perdido de vez)',
        `SELECT COUNT(*)::int AS n FROM "HerdEvent" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL`
    );
    const sanitary = await count(
        'SanitaryRecord (registro sanitário perdido de vez)',
        `SELECT COUNT(*)::int AS n FROM "SanitaryRecord" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL`
    );
    const nutritionExec = await count(
        'NutritionExecution (execução de nutrição perdida de vez)',
        `SELECT COUNT(*)::int AS n FROM "NutritionExecution" WHERE "poLotId" IS NOT NULL AND "lotId" IS NULL AND "unitId" IS NULL`
    );
    await count(
        'NutritionCostEntry (custo de nutrição perdido de vez)',
        `SELECT COUNT(*)::int AS n FROM "NutritionCostEntry" WHERE "poLotId" IS NOT NULL AND "lotId" IS NULL`
    );
    await count(
        'NutritionAssignment (atribuição de dieta perdida de vez)',
        `SELECT COUNT(*)::int AS n FROM "NutritionAssignment" WHERE ("poLotId" IS NOT NULL OR "poAnimalId" IS NOT NULL) AND "lotId" IS NULL AND "animalId" IS NULL`
    );
    await count(
        'PaddockMove (movimentação de pasto perdida de vez)',
        `SELECT COUNT(*)::int AS n FROM "PaddockMove" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL`
    );
    await count(
        'CriaMortality (registro de mortalidade perdido de vez)',
        `SELECT COUNT(*)::int AS n FROM "CriaMortality" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL`
    );
    const weighingSessionsDeleted = await count(
        'WeighingSession do Plantel P.O. sem nenhuma pesagem (apagada)',
        `SELECT COUNT(*)::int AS n FROM "WeighingSession" s WHERE s."herdType" = 'PO' AND NOT EXISTS (SELECT 1 FROM "Weighing" w WHERE w."weighingSessionId" = s.id)`
    );
    const weighingSessionsKept = await count(
        'WeighingSession do Plantel P.O. COM pesagem (mantida, só muda de rótulo)',
        `SELECT COUNT(*)::int AS n FROM "WeighingSession" s WHERE s."herdType" = 'PO' AND EXISTS (SELECT 1 FROM "Weighing" w WHERE w."weighingSessionId" = s.id)`
    );
    const embryoTransferDeleted = await count(
        'EmbryoTransfer (transferência de embrião perdida de vez)',
        `SELECT COUNT(*)::int AS n FROM "EmbryoTransfer" t WHERE t."recipientPoAnimalId" IS NOT NULL AND t."recipientAnimalId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Animal" a WHERE a."embryoTransferId" = t.id)`
    );
    await count(
        'EmbryoPairSequence do Plantel P.O. (apagada)',
        `SELECT COUNT(*)::int AS n FROM "EmbryoPairSequence" WHERE "herdType" = 'PO'`
    );

    console.log('\n=== Nomes/registros que ficariam em branco mesmo depois do backup automático ===');
    await count(
        'SemenBatch sem nome nem registro do touro nos dois lados (ficaria em branco)',
        `SELECT COUNT(*)::int AS n FROM "SemenBatch" b JOIN "PoAnimal" p ON p.id = b."bullPoAnimalId" WHERE COALESCE(NULLIF(b."bullName", ''), p.nome, p.brinco) IS NULL`
    );
    await count(
        'EmbryoBatch sem nome da doadora nos dois lados (ficaria em branco)',
        `SELECT COUNT(*)::int AS n FROM "EmbryoBatch" b JOIN "PoAnimal" p ON p.id = b."donorPoAnimalId" WHERE COALESCE(NULLIF(b."donorName", ''), p.nome, p.brinco) IS NULL`
    );
    await count(
        'FinancialResultAllocation sem nome do lote nos dois lados (ficaria em branco)',
        `SELECT COUNT(*)::int AS n FROM "FinancialResultAllocation" a JOIN "PoLot" p ON p.id = a."poLotId" WHERE COALESCE(a."lotNameSnapshot", p.name) IS NULL`
    );

    console.log('\n=== Resumo ===');
    const totalPerdido = herdEvents + sanitary + nutritionExec + weighingSessionsDeleted + embryoTransferDeleted;
    if (totalPerdido === 0) {
        console.log('Nenhuma linha "órfã" seria apagada de vez - tudo que existe no Plantel P.O. já tem par no cadastro novo (Animal) ou é seguro de remover.');
    } else {
        console.log(`Atenção: ${totalPerdido} linha(s) seriam apagadas de vez (sem equivalente no cadastro novo). Revise antes de aplicar a migração.`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Erro ao rodar o preflight:', err.message);
    await prisma.$disconnect();
    process.exit(1);
});
