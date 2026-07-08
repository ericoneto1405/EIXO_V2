import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseDateValue, normalizePregnant } from '../utils/formatters.js';
import { serializeCheckupSession, serializeCheckupRecord } from '../utils/serializers.js';

const prisma = new PrismaClient();

const ANIMAL_SELECT = { select: { id: true, brinco: true, nome: true } };

function cleanText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// ─── Reprodução: avaliações (toque) por sessão + KPIs de decisão ─────────────
export function registerReproRoutes(app) {
    // Criar sessão de avaliação com as fichas das vacas avaliadas
    app.post('/repro/checkups', async (req, res) => {
        const { farmId, occurredAt, responsibleName, seasonId, notes, records } = req.body || {};

        if (!farmId || !occurredAt) {
            return res.status(400).json({ message: 'Informe fazenda e data da avaliação.' });
        }
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ message: 'Inclua ao menos uma vaca avaliada.' });
        }

        const occurredDate = parseDateValue(occurredAt);
        if (!occurredDate) {
            return res.status(400).json({ message: 'Data da avaliação inválida.' });
        }

        try {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }

            // Estação é opcional; se vier, precisa ser da mesma fazenda
            let validSeasonId = null;
            if (seasonId) {
                const season = await prisma.breedingSeason.findFirst({
                    where: { id: String(seasonId), farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                });
                if (!season) {
                    return res.status(404).json({ message: 'Estação não encontrada.' });
                }
                validSeasonId = season.id;
            }

            // Valida cada animal: existe, é da fazenda e é fêmea
            const animalIds = [...new Set(records.map((r) => r?.animalId).filter(Boolean))];
            if (animalIds.length === 0) {
                return res.status(400).json({ message: 'Fichas sem animal informado.' });
            }
            const animals = await prisma.animal.findMany({
                where: { id: { in: animalIds }, farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                select: { id: true, sexo: true },
            });
            const animalById = new Map(animals.map((a) => [a.id, a]));

            for (const r of records) {
                const animal = animalById.get(r?.animalId);
                if (!animal) {
                    return res.status(404).json({ message: `Animal não encontrado: ${r?.animalId}` });
                }
                if (animal.sexo !== 'FEMEA') {
                    return res.status(400).json({ message: 'Avaliação reprodutiva é apenas para fêmeas.' });
                }
            }

            const sessionId = randomUUID();
            const recordsData = records.map((r) => {
                const pregnant = normalizePregnant(r?.pregnant);
                const previsaoParto = r?.previsaoParto ? parseDateValue(r.previsaoParto) : null;
                return {
                    id: randomUUID(),
                    farmId: String(farmId),
                    animalId: r.animalId,
                    aptitude: cleanText(r?.aptitude) || 'NAO_AVALIADA',
                    diagnosis: cleanText(r?.diagnosis),
                    pregnant,
                    previsaoParto: previsaoParto || null,
                    discardLight: cleanText(r?.discardLight),
                    discardReason: cleanText(r?.discardReason),
                    calfQuality: cleanText(r?.calfQuality),
                    veterinarianDecision: cleanText(r?.veterinarianDecision),
                    iatfCount: Number.isFinite(Number(r?.iatfCount)) ? Number(r.iatfCount) : 0,
                    bullId: cleanText(r?.bullId),
                    protocol: cleanText(r?.protocol),
                    notes: cleanText(r?.notes),
                };
            });

            // Integração com o Rebanho: o resultado volta pro status do animal.
            // PRENHE grava previsão de parto (se informada); VAZIA zera a previsão.
            // pregnant nulo (não avaliado) não altera o animal.
            const statusByAnimal = new Map();
            for (const r of recordsData) {
                if (r.pregnant === true) {
                    statusByAnimal.set(r.animalId, {
                        statusReprodutivo: 'PRENHE',
                        ...(r.previsaoParto ? { previsaoParto: r.previsaoParto } : {}),
                    });
                } else if (r.pregnant === false) {
                    statusByAnimal.set(r.animalId, { statusReprodutivo: 'VAZIA', previsaoParto: null });
                }
            }

            const [session] = await prisma.$transaction([
                prisma.reproCheckupSession.create({
                    data: {
                        id: sessionId,
                        farmId: String(farmId),
                        createdById: req.user.id,
                        occurredAt: occurredDate,
                        responsibleName: cleanText(responsibleName),
                        seasonId: validSeasonId,
                        notes: cleanText(notes),
                        records: { create: recordsData },
                    },
                    include: { records: { include: { animal: ANIMAL_SELECT } } },
                }),
                ...[...statusByAnimal.entries()].map(([animalId, data]) =>
                    prisma.animal.update({ where: { id: animalId }, data })),
            ]);

            return res.status(201).json({ session: serializeCheckupSession(session) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar avaliação reprodutiva.' });
        }
    });

    // Listar sessões da fazenda (filtros opcionais: estação e período)
    app.get('/repro/checkups', async (req, res) => {
        const { farmId, seasonId, from, to } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }

        try {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }

            const fromDate = from ? parseDateValue(from) : null;
            const toDate = to ? parseDateValue(to) : null;

            const sessions = await prisma.reproCheckupSession.findMany({
                where: {
                    farmId: String(farmId),
                    ...(seasonId ? { seasonId: String(seasonId) } : {}),
                    ...(fromDate || toDate
                        ? { occurredAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
                        : {}),
                },
                orderBy: { occurredAt: 'desc' },
                include: { _count: { select: { records: true } } },
            });

            return res.json({ sessions: sessions.map(serializeCheckupSession) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar avaliações.' });
        }
    });

    // Detalhar uma sessão com as fichas
    app.get('/repro/checkups/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const session = await prisma.reproCheckupSession.findFirst({
                where: { id, farm: buildFarmRelationFilter(req) },
                include: { records: { include: { animal: ANIMAL_SELECT }, orderBy: { createdAt: 'asc' } } },
            });
            if (!session) {
                return res.status(404).json({ message: 'Avaliação não encontrada.' });
            }
            return res.json({ session: serializeCheckupSession(session) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar avaliação.' });
        }
    });

    // Apagar uma sessão (fichas somem junto por cascade)
    app.delete('/repro/checkups/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const session = await prisma.reproCheckupSession.findFirst({
                where: { id, farm: buildFarmRelationFilter(req) },
            });
            if (!session) {
                return res.status(404).json({ message: 'Avaliação não encontrada.' });
            }
            await prisma.reproCheckupSession.delete({ where: { id } });
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao apagar avaliação.' });
        }
    });

    // Editar uma sessão: refaz as fichas e recalcula o status no Rebanho
    app.put('/repro/checkups/:id', async (req, res) => {
        const { id } = req.params;
        const { occurredAt, responsibleName, seasonId, notes, records } = req.body || {};

        if (!occurredAt) {
            return res.status(400).json({ message: 'Informe a data da avaliação.' });
        }
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ message: 'Inclua ao menos uma vaca avaliada.' });
        }
        const occurredDate = parseDateValue(occurredAt);
        if (!occurredDate) {
            return res.status(400).json({ message: 'Data da avaliação inválida.' });
        }

        try {
            const existing = await prisma.reproCheckupSession.findFirst({
                where: { id, farm: buildFarmRelationFilter(req) },
            });
            if (!existing) {
                return res.status(404).json({ message: 'Avaliação não encontrada.' });
            }
            const farmId = existing.farmId;

            let validSeasonId = null;
            if (seasonId) {
                const season = await prisma.breedingSeason.findFirst({
                    where: { id: String(seasonId), farmId, farm: buildFarmRelationFilter(req) },
                });
                if (!season) {
                    return res.status(404).json({ message: 'Estação não encontrada.' });
                }
                validSeasonId = season.id;
            }

            const animalIds = [...new Set(records.map((r) => r?.animalId).filter(Boolean))];
            if (animalIds.length === 0) {
                return res.status(400).json({ message: 'Fichas sem animal informado.' });
            }
            const animals = await prisma.animal.findMany({
                where: { id: { in: animalIds }, farmId, farm: buildFarmRelationFilter(req) },
                select: { id: true, sexo: true },
            });
            const animalById = new Map(animals.map((a) => [a.id, a]));

            for (const r of records) {
                const animal = animalById.get(r?.animalId);
                if (!animal) {
                    return res.status(404).json({ message: `Animal não encontrado: ${r?.animalId}` });
                }
                if (animal.sexo !== 'FEMEA') {
                    return res.status(400).json({ message: 'Avaliação reprodutiva é apenas para fêmeas.' });
                }
            }

            const recordsData = records.map((r) => {
                const pregnant = normalizePregnant(r?.pregnant);
                const previsaoParto = r?.previsaoParto ? parseDateValue(r.previsaoParto) : null;
                return {
                    id: randomUUID(),
                    farmId,
                    animalId: r.animalId,
                    aptitude: cleanText(r?.aptitude) || 'NAO_AVALIADA',
                    diagnosis: cleanText(r?.diagnosis),
                    pregnant,
                    previsaoParto: previsaoParto || null,
                    discardLight: cleanText(r?.discardLight),
                    discardReason: cleanText(r?.discardReason),
                    calfQuality: cleanText(r?.calfQuality),
                    veterinarianDecision: cleanText(r?.veterinarianDecision),
                    iatfCount: Number.isFinite(Number(r?.iatfCount)) ? Number(r.iatfCount) : 0,
                    bullId: cleanText(r?.bullId),
                    protocol: cleanText(r?.protocol),
                    notes: cleanText(r?.notes),
                };
            });

            const statusByAnimal = new Map();
            for (const r of recordsData) {
                if (r.pregnant === true) {
                    statusByAnimal.set(r.animalId, {
                        statusReprodutivo: 'PRENHE',
                        ...(r.previsaoParto ? { previsaoParto: r.previsaoParto } : {}),
                    });
                } else if (r.pregnant === false) {
                    statusByAnimal.set(r.animalId, { statusReprodutivo: 'VAZIA', previsaoParto: null });
                }
            }

            const results = await prisma.$transaction([
                prisma.reproCheckupRecord.deleteMany({ where: { sessionId: id } }),
                prisma.reproCheckupSession.update({
                    where: { id },
                    data: {
                        occurredAt: occurredDate,
                        responsibleName: cleanText(responsibleName),
                        seasonId: validSeasonId,
                        notes: cleanText(notes),
                        records: { create: recordsData },
                    },
                    include: { records: { include: { animal: ANIMAL_SELECT } } },
                }),
                ...[...statusByAnimal.entries()].map(([animalId, data]) =>
                    prisma.animal.update({ where: { id: animalId }, data })),
            ]);

            return res.json({ session: serializeCheckupSession(results[1]) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao editar avaliação.' });
        }
    });

    // KPIs de decisão do rebanho (opcionalmente por estação)
    app.get('/repro/kpis', async (req, res) => {
        const { farmId, seasonId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }

        try {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }

            const records = await prisma.reproCheckupRecord.findMany({
                where: {
                    farmId: String(farmId),
                    ...(seasonId ? { session: { seasonId: String(seasonId) } } : {}),
                },
                select: {
                    animalId: true,
                    pregnant: true,
                    discardLight: true,
                    veterinarianDecision: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'asc' },
            });

            let pregnant = 0;
            let empty = 0;
            const emptyByAnimal = new Map();
            const discardCandidates = new Set();

            for (const r of records) {
                if (r.pregnant === true) pregnant += 1;
                if (r.pregnant === false) {
                    empty += 1;
                    emptyByAnimal.set(r.animalId, (emptyByAnimal.get(r.animalId) || 0) + 1);
                }
                const decision = (r.veterinarianDecision || '').toUpperCase();
                if (r.discardLight || decision.includes('DESCART')) {
                    discardCandidates.add(r.animalId);
                }
            }

            // Vazias repetidas: fêmea com 2+ diagnósticos vazios → candidata a descarte
            const repeatEmpty = [];
            for (const [animalId, count] of emptyByAnimal.entries()) {
                if (count >= 2) {
                    repeatEmpty.push(animalId);
                    discardCandidates.add(animalId);
                }
            }

            const evaluated = pregnant + empty;
            const pregRate = evaluated > 0 ? Number(((pregnant / evaluated) * 100).toFixed(1)) : null;

            return res.json({
                kpis: {
                    evaluated,
                    pregnant,
                    empty,
                    pregRate,
                    repeatEmptyCount: repeatEmpty.length,
                    discardCandidateCount: discardCandidates.size,
                },
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao calcular indicadores.' });
        }
    });

    // Farol: classifica cada fêmea avaliada em verde / amarelo / vermelho
    app.get('/repro/farol', async (req, res) => {
        const { farmId, seasonId } = req.query || {};
        if (!farmId) {
            return res.status(400).json({ message: 'Informe a fazenda.' });
        }

        try {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }

            const records = await prisma.reproCheckupRecord.findMany({
                where: {
                    farmId: String(farmId),
                    ...(seasonId ? { session: { seasonId: String(seasonId) } } : {}),
                },
                select: {
                    animalId: true,
                    pregnant: true,
                    discardLight: true,
                    veterinarianDecision: true,
                    createdAt: true,
                    animal: { select: { id: true, brinco: true, nome: true } },
                },
                orderBy: { createdAt: 'asc' },
            });

            // Agrupa por animal para olhar o histórico e o último resultado
            const byAnimal = new Map();
            for (const r of records) {
                if (!byAnimal.has(r.animalId)) {
                    byAnimal.set(r.animalId, { animal: r.animal, emptyCount: 0, discard: false, latest: null });
                }
                const info = byAnimal.get(r.animalId);
                if (r.pregnant === false) info.emptyCount += 1;
                const decision = (r.veterinarianDecision || '').toUpperCase();
                if (r.discardLight || decision.includes('DESCART')) info.discard = true;
                if (r.pregnant === true || r.pregnant === false) info.latest = r.pregnant;
            }

            let green = 0;
            let yellow = 0;
            let red = 0;
            const redAnimals = [];

            for (const [animalId, info] of byAnimal.entries()) {
                if (info.latest === null) continue; // nunca avaliada de fato
                const label = info.animal?.brinco || info.animal?.nome || animalId;
                if (info.latest === true) {
                    green += 1;
                } else if (info.discard || info.emptyCount >= 2) {
                    red += 1;
                    redAnimals.push({
                        animalId,
                        label,
                        reason: info.discard ? 'Marcada para descarte' : 'Vazia repetida',
                    });
                } else {
                    yellow += 1;
                }
            }

            return res.json({ farol: { green, yellow, red }, redAnimals });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao calcular o farol.' });
        }
    });
}
