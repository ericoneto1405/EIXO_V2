// Verifica se um número de identificação (brinco/registro/chip) já está em
// uso em QUALQUER fazenda da mesma organização — não só na fazenda atual.
// Isso evita que o mesmo número seja reaproveitado por engano em outro
// animal, mesmo que seja de uma fazenda diferente da mesma conta.
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';

export async function findDuplicateIdentityInOrganization(prisma, req, { identityKey, excludeAnimalId } = {}) {
    if (!identityKey) return null;

    const farms = await prisma.farm.findMany({
        where: buildFarmScopeFilter(req),
        select: { id: true, name: true },
    });
    if (!farms.length) return null;
    const farmIds = farms.map((farm) => farm.id);
    const farmNameById = new Map(farms.map((farm) => [farm.id, farm.name]));

    const existing = await prisma.animal.findFirst({
        where: {
            identityKey,
            farmId: { in: farmIds },
            ...(excludeAnimalId ? { id: { not: excludeAnimalId } } : {}),
        },
        select: { id: true, farmId: true, brinco: true },
    });
    if (!existing) return null;

    return { ...existing, farmName: farmNameById.get(existing.farmId) || null };
}

// Igual à de cima, mas pra checar VÁRIOS números de uma vez (usado na
// importação/cadastro em lote) — uma consulta só em vez de uma por animal.
export async function findDuplicateIdentitiesInOrganization(prisma, req, { identityKeys = [], excludeAnimalId } = {}) {
    const keys = Array.from(new Set(identityKeys.filter(Boolean)));
    if (!keys.length) return [];

    const farms = await prisma.farm.findMany({
        where: buildFarmScopeFilter(req),
        select: { id: true, name: true },
    });
    if (!farms.length) return [];
    const farmIds = farms.map((farm) => farm.id);
    const farmNameById = new Map(farms.map((farm) => [farm.id, farm.name]));

    const existingList = await prisma.animal.findMany({
        where: {
            identityKey: { in: keys },
            farmId: { in: farmIds },
            ...(excludeAnimalId ? { id: { not: excludeAnimalId } } : {}),
        },
        select: { id: true, farmId: true, brinco: true, identityKey: true },
    });
    return existingList.map((item) => ({ ...item, farmName: farmNameById.get(item.farmId) || null }));
}
