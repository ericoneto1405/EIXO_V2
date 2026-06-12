import { PrismaClient } from '@prisma/client';
import { requireAuth, requireNonFieldWorker } from '../../middlewares/requireAuth.js';
import { requireBillingAccess } from '../../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../../middlewares/farmScope.js';
import { parseCoordinate, validateCoordinatePair } from '../../utils/validators.js';
import { parseNumber, parseDateValue } from '../../utils/formatters.js';
import { logActivity, recordActivityLog } from '../../utils/activityLog.js';
import { serializePaddock, serializeSeason } from '../../utils/serializers.js';
import { isSaasContextError } from '../../utils/saasContext.js';
import { normalizeReproMode } from '../../utils/formatters.js';
import { serializeAnimal } from '../../utils/serializers.js';
import { REPRO_WINDOW_DAYS } from '../../config/env.js';
const prisma = new PrismaClient();

const findFarmByCoordinates = async ({ lat, lng, excludeFarmId = null }) => {
    if (lat === null || lng === null) {
        return null;
    }
    return prisma.farm.findFirst({
        where: {
            lat,
            lng,
            ...(excludeFarmId ? { NOT: { id: excludeFarmId } } : {}),
        },
        select: { id: true },
    });
};

export function registerFarmRoutes(app) {
app.get('/farms', async (req, res) => {
    try {
        const farms = await prisma.farm.findMany({
            where: buildFarmScopeFilter(req),
            include: { paddocks: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'desc' },
        });
        const items = farms.map((farm) => ({
            ...farm,
            responsibleName: farm.responsibleName ?? null,
            paddocks: farm.paddocks.map(serializePaddock),
        }));
        return res.json({ farms: items, items, total: items.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar fazendas.' });
    }
});

app.post('/farms', requireNonFieldWorker, async (req, res) => {
    const { name, city, lat, lng, size, notes, responsibleName, paddocks } = req.body || {};

    const parsedSize = Number(size);
    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);
    if (!name || !city || Number.isNaN(parsedSize) || parsedSize <= 0) {
        return res.status(400).json({ message: 'Nome, cidade e tamanho da fazenda são obrigatórios.' });
    }
    const coordinateError = validateCoordinatePair(parsedLat, parsedLng);
    if (coordinateError) {
        return res.status(400).json({ message: coordinateError });
    }

    const normalizedPaddocks = Array.isArray(paddocks)
        ? paddocks
              .map((paddock) => {
                  const paddockName = (paddock?.name || paddock?.nome || '').trim();
                  const areaRaw = paddock?.areaHa ?? paddock?.size ?? paddock?.area;
                  const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === ''
                      ? null
                      : Number(areaRaw);
                  const divisionType = (paddock?.divisionType || paddock?.type || '').trim() || null;
                  const capacityValue = parseNumber(paddock?.capacity);
                  const activeValue = paddock?.active === false ? false : true;
                  if (!paddockName) {
                      return null;
                  }
                  if (areaValue !== null && (Number.isNaN(areaValue) || areaValue <= 0)) {
                      return null;
                  }
                  return {
                      name: paddockName,
                      areaHa: areaValue,
                      divisionType,
                      capacity: capacityValue,
                      active: activeValue,
                  };
              })
              .filter(Boolean)
        : [];

    if (Array.isArray(paddocks) && paddocks.length && normalizedPaddocks.length === 0) {
        return res.status(400).json({ message: 'Pastos devem ter nome e área válidos.' });
    }

    try {
        // --- Limite de fazendas por plano ---
        const orgId = req.saas?.organizationId || null;
        if (orgId) {
            const activePaidSubscription = await prisma.billingSubscription.findFirst({
                where: {
                    organizationId: orgId,
                    status: 'ACTIVE',
                    NOT: { planCode: { in: ['gratis', 'free', 'gratuito'] } },
                },
            });
            if (!activePaidSubscription) {
                const farmCount = await prisma.farm.count({ where: { organizationId: orgId } });
                if (farmCount >= 1) {
                    return res.status(403).json({
                        code: 'farm_limit_reached',
                        message: 'O plano gratuito permite apenas 1 fazenda. Faça upgrade para cadastrar mais fazendas.',
                    });
                }
            }
        }
        // ------------------------------------

        const existingFarmAtCoordinates = await findFarmByCoordinates({
            lat: parsedLat,
            lng: parsedLng,
        });
        if (existingFarmAtCoordinates) {
            return res.status(409).json({
                message: 'Já existe uma fazenda cadastrada com essas coordenadas.',
            });
        }

        const newFarm = await prisma.farm.create({
            data: {
                name,
                city,
                lat: parsedLat,
                lng: parsedLng,
                size: parsedSize,
                notes: notes?.trim() || null,
                responsibleName: responsibleName?.trim() || null,
                userId: req.user.id,
                organizationId: req.saas?.organizationId || null,
                paddocks: {
                    create: normalizedPaddocks,
                },
            },
            include: { paddocks: true },
        });
        logActivity(req, { action: 'FAZENDA_CRIADA', entity: 'Farm', entityId: newFarm.id, description: `Cadastrou a fazenda ${newFarm.name}`, farmId: newFarm.id });
        return res.status(201).json({
            farm: {
                ...newFarm,
                responsibleName: newFarm.responsibleName ?? null,
                paddocks: newFarm.paddocks.map(serializePaddock),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar fazenda.' });
    }
});

app.patch('/farms/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    const { name, city, lat, lng, size, notes, responsibleName, paddocks } = req.body || {};

    const parsedSize = Number(size);
    const parsedLat = parseCoordinate(lat);
    const parsedLng = parseCoordinate(lng);
    if (!name || !city || Number.isNaN(parsedSize) || parsedSize <= 0) {
        return res.status(400).json({ message: 'Nome, cidade e tamanho da fazenda são obrigatórios.' });
    }
    const coordinateError = validateCoordinatePair(parsedLat, parsedLng);
    if (coordinateError) {
        return res.status(400).json({ message: coordinateError });
    }

    const normalizedPaddocks = Array.isArray(paddocks)
        ? paddocks
              .map((paddock) => {
                  const paddockId = typeof paddock?.id === 'string' ? paddock.id.trim() : '';
                  const paddockName = (paddock?.name || paddock?.nome || '').trim();
                  const areaRaw = paddock?.areaHa ?? paddock?.size ?? paddock?.area;
                  const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === ''
                      ? null
                      : Number(areaRaw);
                  const divisionType = (paddock?.divisionType || paddock?.type || '').trim() || null;
                  const forrageira = (paddock?.forrageira || '').trim() || null;
                  const lotacaoRaw = paddock?.lotacaoUaHa;
                  const lotacaoUaHa = lotacaoRaw !== undefined && lotacaoRaw !== null && lotacaoRaw !== ''
                      ? Number(lotacaoRaw) || null
                      : null;
                  if (!paddockName) {
                      return null;
                  }
                  if (areaValue !== null && (Number.isNaN(areaValue) || areaValue <= 0)) {
                      return null;
                  }
                  return {
                      id: paddockId || null,
                      name: paddockName,
                      areaHa: areaValue,
                      divisionType,
                      forrageira,
                      lotacaoUaHa,
                  };
              })
              .filter(Boolean)
        : [];

    if (Array.isArray(paddocks) && paddocks.length && normalizedPaddocks.length === 0) {
        return res.status(400).json({ message: 'Divisões devem ter nome e área válidos.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(id) }),
            include: { paddocks: true },
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const existingFarmAtCoordinates = await findFarmByCoordinates({
            lat: parsedLat,
            lng: parsedLng,
            excludeFarmId: farm.id,
        });
        if (existingFarmAtCoordinates) {
            return res.status(409).json({
                message: 'Já existe uma fazenda cadastrada com essas coordenadas.',
            });
        }

        const updatedFarm = await prisma.$transaction(async (tx) => {
            const existingPaddocks = await tx.paddock.findMany({
                where: { farmId: farm.id },
                select: { id: true },
            });
            const existingIds = new Set(existingPaddocks.map((item) => item.id));

            for (const division of normalizedPaddocks) {
                if (division.id && existingIds.has(division.id)) {
                    await tx.paddock.update({
                        where: { id: division.id },
                        data: {
                            name: division.name,
                            areaHa: division.areaHa,
                            divisionType: division.divisionType,
                            forrageira: division.forrageira,
                            lotacaoUaHa: division.lotacaoUaHa,
                            ...(division.mapGeometry !== undefined ? { mapGeometry: division.mapGeometry } : {}),
                        },
                    });
                    continue;
                }

                await tx.paddock.create({
                    data: {
                        farmId: farm.id,
                        name: division.name,
                        areaHa: division.areaHa,
                        divisionType: division.divisionType,
                        forrageira: division.forrageira,
                        lotacaoUaHa: division.lotacaoUaHa,
                        ...(division.mapGeometry !== undefined ? { mapGeometry: division.mapGeometry } : {}),
                        active: true,
                    },
                });
            }

            return tx.farm.update({
                where: { id: farm.id },
                data: {
                    name,
                    city,
                    lat: parsedLat,
                    lng: parsedLng,
                    size: parsedSize,
                    notes: notes?.trim() || null,
                    responsibleName: responsibleName?.trim() || null,
                },
                include: { paddocks: true },
            });
        });

        return res.json({
            farm: {
                ...updatedFarm,
                responsibleName: updatedFarm.responsibleName ?? null,
                paddocks: updatedFarm.paddocks.map(serializePaddock),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar fazenda.' });
    }
});

app.delete('/farms/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(id) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        await recordActivityLog(req, {
            statusCode: 423,
            requestMeta: {
                action: 'farm_delete_blocked',
                targetType: 'farm',
                targetId: farm.id,
                result: 'blocked',
            },
        });
        return res.status(423).json({
            message: 'A exclusão direta de fazendas está temporariamente desativada por segurança.',
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir fazenda.' });
    }
});

app.get('/farms/:id/map-summary', async (req, res) => {
    const { id } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(id) }),
            include: { paddocks: { orderBy: { createdAt: 'asc' } } },
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const paddockIds = farm.paddocks.map((p) => p.id);

        const [commercialGroups, poGroups] = await Promise.all([
            prisma.animal.groupBy({
                by: ['currentPaddockId'],
                where: { farmId: farm.id, currentPaddockId: { in: paddockIds } },
                _count: { id: true },
                _sum: { pesoAtual: true },
            }),
            prisma.poAnimal.groupBy({
                by: ['currentPaddockId'],
                where: { farmId: farm.id, currentPaddockId: { in: paddockIds } },
                _count: { id: true },
                _sum: { pesoAtual: true },
            }),
        ]);

        const commercialMap = new Map(commercialGroups.map((g) => [g.currentPaddockId, g]));
        const poMap = new Map(poGroups.map((g) => [g.currentPaddockId, g]));

        const summary = farm.paddocks.map((paddock) => {
            const commercial = commercialMap.get(paddock.id);
            const po = poMap.get(paddock.id);
            const animalCount = commercial?._count?.id ?? 0;
            const poAnimalCount = po?._count?.id ?? 0;
            const totalWeightKg = (commercial?._sum?.pesoAtual ?? 0) + (po?._sum?.pesoAtual ?? 0);
            const areaHa = paddock.areaHa ?? 0;
            const uaTotal = totalWeightKg / 450;
            const lotacao = areaHa > 0 ? uaTotal / areaHa : null;
            return {
                paddockId: paddock.id,
                paddockName: paddock.name,
                areaHa,
                divisionType: paddock.divisionType ?? null,
                animalCount,
                poAnimalCount,
                totalAnimals: animalCount + poAnimalCount,
                totalWeightKg,
                lotacaoUaHa: lotacao !== null ? Math.round(lotacao * 100) / 100 : null,
            };
        });

        return res.json({ summary });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao carregar resumo do mapa.' });
    }
});

app.get('/pastos', async (req, res) => {
    const { farmId, includeInactive } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar pastos.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const pastos = await prisma.paddock.findMany({
            where: {
                farmId: farm.id,
                ...(includeInactive === 'true' ? {} : { active: true }),
            },
            orderBy: { createdAt: 'asc' },
        });
        return res.json({ items: pastos.map(serializePaddock), total: pastos.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar pastos.' });
    }
});

app.post('/pastos', requireNonFieldWorker, async (req, res) => {
    const { farmId, nome, name, areaHa, size, capacity, ativo, active, divisionType, type } = req.body || {};
    const paddockName = (nome || name || '').trim();
    if (!farmId || !paddockName) {
        return res.status(400).json({ message: 'Informe fazenda e nome do pasto.' });
    }
    const areaRaw = areaHa ?? size;
    const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === '' ? null : Number(areaRaw);
    if (areaValue !== null && (Number.isNaN(areaValue) || areaValue <= 0)) {
        return res.status(400).json({ message: 'Área do pasto inválida.' });
    }
    const capacityValue = capacity === undefined || capacity === null || capacity === '' ? null : parseNumber(capacity);
    if (capacity !== undefined && capacity !== null && capacity !== '' && (capacityValue === null || capacityValue <= 0)) {
        return res.status(400).json({ message: 'Capacidade do pasto inválida.' });
    }
    const activeValue = ativo === false || active === false ? false : true;
    const normalizedDivisionType = (divisionType || type || '').trim() || null;
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const existing = await prisma.paddock.findFirst({
            where: { farmId: farm.id, name: paddockName },
        });
        if (existing) {
            return res.status(409).json({ message: 'Já existe um pasto com esse nome nesta fazenda.' });
        }
        const paddock = await prisma.paddock.create({
            data: {
                farmId: farm.id,
                name: paddockName,
                areaHa: areaValue,
                divisionType: normalizedDivisionType,
                capacity: capacityValue,
                active: activeValue,
            },
        });
        return res.status(201).json({ item: serializePaddock(paddock) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar pasto.' });
    }
});

app.patch('/pastos/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    const { nome, name, areaHa, size, capacity, ativo, active, divisionType, type } = req.body || {};
    const paddockName = typeof nome === 'string' || typeof name === 'string' ? (nome || name).trim() : null;
    const areaRaw = areaHa ?? size;
    const areaValue = areaRaw === undefined || areaRaw === null || areaRaw === '' ? undefined : Number(areaRaw);
    const capacityValue = capacity === undefined || capacity === null || capacity === '' ? undefined : parseNumber(capacity);
    const activeValue = ativo === undefined && active === undefined ? undefined : !(ativo === false || active === false);
    const normalizedDivisionType =
        divisionType === undefined && type === undefined
            ? undefined
            : ((divisionType || type || '').trim() || null);
    if (areaValue !== undefined && (Number.isNaN(areaValue) || areaValue <= 0)) {
        return res.status(400).json({ message: 'Área do pasto inválida.' });
    }
    if (capacityValue !== undefined && (capacityValue === null || capacityValue <= 0)) {
        return res.status(400).json({ message: 'Capacidade do pasto inválida.' });
    }
    try {
        const paddock = await prisma.paddock.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!paddock) {
            return res.status(404).json({ message: 'Pasto não encontrado.' });
        }
        if (paddockName) {
            const duplicate = await prisma.paddock.findFirst({
                where: { farmId: paddock.farmId, name: paddockName, id: { not: paddock.id } },
            });
            if (duplicate) {
                return res.status(409).json({ message: 'Já existe um pasto com esse nome nesta fazenda.' });
            }
        }
        if (activeValue === false) {
            const activeCount = await prisma.paddock.count({
                where: { farmId: paddock.farmId, active: true },
            });
            if (activeCount <= 1) {
                return res.status(400).json({ message: 'A fazenda precisa ter ao menos um pasto ativo.' });
            }
        }
        const updated = await prisma.paddock.update({
            where: { id: paddock.id },
            data: {
                ...(paddockName ? { name: paddockName } : {}),
                ...(areaValue !== undefined ? { areaHa: areaValue } : {}),
                ...(normalizedDivisionType !== undefined ? { divisionType: normalizedDivisionType } : {}),
                ...(capacityValue !== undefined ? { capacity: capacityValue } : {}),
                ...(activeValue !== undefined ? { active: activeValue } : {}),
            },
        });
        return res.json({ item: serializePaddock(updated) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar pasto.' });
    }
});

app.patch('/farms/:id/repro-mode', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    const { reproMode } = req.body || {};
    const normalizedMode = normalizeReproMode(reproMode);
    if (!normalizedMode) {
        return res.status(400).json({ message: 'Modo reprodutivo inválido.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const updatedFarm = await prisma.farm.update({
            where: { id },
            data: { reproMode: normalizedMode },
        });
        return res.json({ farm: updatedFarm });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar modo reprodutivo.' });
    }
});

app.get('/seasons', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar estações.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const seasons = await prisma.breedingSeason.findMany({
            where: { farmId: String(farmId) },
            orderBy: { startAt: 'desc' },
        });
        return res.json({ seasons: seasons.map(serializeSeason) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar estações.' });
    }
});

app.post('/seasons', async (req, res) => {
    const { farmId, name, startAt, endAt } = req.body || {};
    if (!farmId || !name?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e nome da estação.' });
    }

    const startDate = parseDateValue(startAt);
    const endDate = parseDateValue(endAt);
    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Datas da estação inválidas.' });
    }
    if (startDate > endDate) {
        return res.status(400).json({ message: 'Data de início deve ser anterior ao fim.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        if (farm.reproMode !== 'ESTACAO') {
            return res.status(400).json({ message: 'Fazenda não está em modo estação.' });
        }

        const season = await prisma.breedingSeason.create({
            data: {
                farmId,
                name: name.trim(),
                startAt: startDate,
                endAt: endDate,
            },
        });
        return res.status(201).json({ season: serializeSeason(season) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar estação.' });
    }
});

app.patch('/seasons/:id', async (req, res) => {
    const { id } = req.params;
    const { name, startAt, endAt } = req.body || {};
    const startDate = startAt ? parseDateValue(startAt) : null;
    const endDate = endAt ? parseDateValue(endAt) : null;

    if ((startAt && !startDate) || (endAt && !endDate)) {
        return res.status(400).json({ message: 'Datas da estação inválidas.' });
    }
    if (startDate && endDate && startDate > endDate) {
        return res.status(400).json({ message: 'Data de início deve ser anterior ao fim.' });
    }

    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const updatedSeason = await prisma.breedingSeason.update({
            where: { id },
            data: {
                name: name?.trim() || season.name,
                startAt: startDate || season.startAt,
                endAt: endDate || season.endAt,
            },
        });
        return res.json({ season: serializeSeason(updatedSeason) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar estação.' });
    }
});

app.delete('/seasons/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const [exposureCount, eventCount] = await prisma.$transaction([
            prisma.exposure.count({ where: { seasonId: id } }),
            prisma.reproEvent.count({ where: { seasonId: id } }),
        ]);
        if (exposureCount > 0 || eventCount > 0) {
            return res.status(409).json({ message: 'Estação possui registros vinculados.' });
        }

        await prisma.breedingSeason.delete({ where: { id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir estação.' });
    }
});

app.get('/seasons/:id/exposures', async (req, res) => {
    const { id } = req.params;
    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const exposures = await prisma.exposure.findMany({
            where: { seasonId: id },
            include: { animal: true },
            orderBy: { createdAt: 'asc' },
        });
        return res.json({
            exposures: exposures.map((exposure) => ({
                id: exposure.id,
                animalId: exposure.animalId,
                createdAt: exposure.createdAt.toISOString(),
                animal: serializeAnimal(exposure.animal),
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar expostas.' });
    }
});

app.post('/seasons/:id/exposures', async (req, res) => {
    const { id } = req.params;
    const { animalIds } = req.body || {};
    const uniqueAnimalIds = Array.isArray(animalIds)
        ? [...new Set(animalIds.map((animalId) => String(animalId)))]
        : [];

    if (!uniqueAnimalIds.length) {
        return res.status(400).json({ message: 'Informe as fêmeas expostas.' });
    }

    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        const animals = await prisma.animal.findMany({
            where: {
                id: { in: uniqueAnimalIds },
                farmId: season.farmId,
                farm: buildFarmRelationFilter(req),
                sexo: 'FEMEA',
            },
            select: { id: true },
        });

        const validIds = new Set(animals.map((animal) => animal.id));
        const invalidIds = uniqueAnimalIds.filter((animalId) => !validIds.has(animalId));
        if (invalidIds.length) {
            return res.status(400).json({ message: 'Apenas fêmeas da fazenda podem ser expostas.' });
        }

        const createResult = await prisma.exposure.createMany({
            data: animals.map((animal) => ({ seasonId: id, animalId: animal.id })),
            skipDuplicates: true,
        });

        const exposures = await prisma.exposure.findMany({
            where: { seasonId: id },
            include: { animal: true },
            orderBy: { createdAt: 'asc' },
        });
        const createdCount = createResult.count || 0;
        const existingCount = Math.max(validIds.size - createdCount, 0);
        return res.status(200).json({
            createdCount,
            existingCount,
            exposures: exposures.map((exposure) => ({
                id: exposure.id,
                animalId: exposure.animalId,
                createdAt: exposure.createdAt.toISOString(),
                animal: serializeAnimal(exposure.animal),
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar expostas.' });
    }
});

app.delete('/seasons/:id/exposures/:animalId', async (req, res) => {
    const { id, animalId } = req.params;
    try {
        const season = await prisma.breedingSeason.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!season) {
            return res.status(404).json({ message: 'Estação não encontrada.' });
        }

        await prisma.exposure.deleteMany({
            where: { seasonId: id, animalId },
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao remover exposta.' });
    }
});

app.get('/lots', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar lotes.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const lots = await prisma.lot.findMany({
            where: { farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ lots });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar lotes.' });
    }
});

app.post('/lots', requireNonFieldWorker, async (req, res) => {
    const { farmId, name, notes, objective, phase, status, startDate } = req.body || {};
    if (!farmId || !name?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e nome do lote.' });
    }
    const parsedStartDate = startDate ? parseDateValue(startDate) : null;
    if (startDate && !parsedStartDate) {
        return res.status(400).json({ message: 'Data de início inválida.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const lot = await prisma.lot.create({
            data: {
                farmId,
                name: name.trim(),
                notes: notes?.trim() || null,
                objective: objective?.trim() || null,
                phase: phase?.trim() || null,
                status: status?.trim() || 'ATIVO',
                startDate: parsedStartDate,
            },
        });
        logActivity(req, { action: 'LOTE_CRIADO', entity: 'Lot', entityId: lot.id, description: `Criou o lote "${lot.name}"`, farmId: lot.farmId });
        return res.status(201).json({ lot });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar lote.' });
    }
});

app.patch('/lots/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    const { name, notes, objective, phase, status, startDate } = req.body || {};
    if (!name?.trim()) {
        return res.status(400).json({ message: 'Informe o nome do lote.' });
    }
    const parsedStartDate = startDate ? parseDateValue(startDate) : null;
    if (startDate && !parsedStartDate) {
        return res.status(400).json({ message: 'Data de início inválida.' });
    }
    try {
        const lot = await prisma.lot.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!lot) return res.status(404).json({ message: 'Lote não encontrado.' });
        const updated = await prisma.lot.update({
            where: { id },
            data: {
                name: name.trim(),
                notes: notes?.trim() || null,
                objective: objective?.trim() || null,
                phase: phase?.trim() || null,
                status: status?.trim() || 'ATIVO',
                startDate: parsedStartDate,
            },
        });
        return res.json({ lot: updated });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao editar lote.' });
    }
});

app.delete('/lots/:id', requireNonFieldWorker, async (req, res) => {
    const { id } = req.params;
    try {
        const lot = await prisma.lot.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!lot) return res.status(404).json({ message: 'Lote não encontrado.' });
        await prisma.lot.delete({ where: { id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir lote.' });
    }
});

// ── HerdSettings ─────────────────────────────────────────────────────────────

app.get('/farms/:farmId/herd-settings', async (req, res) => {
    const { farmId } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const [settings, targets] = await Promise.all([
            prisma.herdSettings.findUnique({ where: { farmId } }),
            prisma.herdCategoryTarget.findMany({ where: { farmId }, orderBy: { categoria: 'asc' } }),
        ]);

        return res.json({
            weighingIntervalDays: settings?.weighingIntervalDays ?? 30,
            categoryTargets: targets.map(t => ({
                id: t.id,
                categoria: t.categoria,
                pesoAlvoKg: t.pesoAlvoKg,
            })),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao buscar configurações do rebanho.' });
    }
});

app.put('/farms/:farmId/herd-settings', async (req, res) => {
    const { farmId } = req.params;
    const { weighingIntervalDays } = req.body;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const intervalVal = parseInt(weighingIntervalDays, 10);
        if (isNaN(intervalVal) || intervalVal < 1 || intervalVal > 365) {
            return res.status(400).json({ message: 'Intervalo inválido (1–365 dias).' });
        }

        const settings = await prisma.herdSettings.upsert({
            where: { farmId },
            create: { farmId, weighingIntervalDays: intervalVal },
            update: { weighingIntervalDays: intervalVal },
        });

        return res.json({ weighingIntervalDays: settings.weighingIntervalDays });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao salvar configurações do rebanho.' });
    }
});

app.put('/farms/:farmId/herd-settings/category-targets', async (req, res) => {
    const { farmId } = req.params;
    const { targets } = req.body; // [{ categoria, pesoAlvoKg }]
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        if (!Array.isArray(targets)) {
            return res.status(400).json({ message: 'targets deve ser um array.' });
        }

        // Upsert cada categoria
        const upserts = targets.map(({ categoria, pesoAlvoKg }) =>
            prisma.herdCategoryTarget.upsert({
                where: { farmId_categoria: { farmId, categoria } },
                create: { farmId, categoria, pesoAlvoKg: pesoAlvoKg ?? null },
                update: { pesoAlvoKg: pesoAlvoKg ?? null },
            })
        );
        await Promise.all(upserts);

        const updated = await prisma.herdCategoryTarget.findMany({
            where: { farmId },
            orderBy: { categoria: 'asc' },
        });

        return res.json({
            categoryTargets: updated.map(t => ({
                id: t.id,
                categoria: t.categoria,
                pesoAlvoKg: t.pesoAlvoKg,
            })),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao salvar pesos alvo.' });
    }
});
// ─── Raças por fazenda ────────────────────────────────────────────────────────

app.get('/farms/:farmId/breeds', async (req, res) => {
    const { farmId } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const breeds = await prisma.breed.findMany({
            where: { farmId },
            orderBy: { name: 'asc' },
        });
        return res.json({ breeds: breeds.map(b => ({ id: b.id, name: b.name })) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar raças.' });
    }
});

app.post('/farms/:farmId/breeds', async (req, res) => {
    const { farmId } = req.params;
    const { name } = req.body || {};
    if (!name?.trim()) {
        return res.status(400).json({ message: 'Nome da raça é obrigatório.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const breed = await prisma.breed.create({
            data: { farmId, name: name.trim() },
        });
        return res.status(201).json({ breed: { id: breed.id, name: breed.name } });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ message: 'Raça já cadastrada nesta fazenda.' });
        }
        console.error(err);
        return res.status(500).json({ message: 'Erro ao cadastrar raça.' });
    }
});

app.delete('/farms/:farmId/breeds/:breedId', async (req, res) => {
    const { farmId, breedId } = req.params;
    try {
        const breed = await prisma.breed.findFirst({
            where: { id: breedId, farmId },
        });
        if (!breed) return res.status(404).json({ message: 'Raça não encontrada.' });

        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(403).json({ message: 'Sem permissão.' });

        await prisma.breed.delete({ where: { id: breedId } });
        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao remover raça.' });
    }
});
}
