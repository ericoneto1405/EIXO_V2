import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseDateValue, normalizePregnant } from '../utils/formatters.js';
import { serializeCheckupSession, serializeCheckupRecord } from '../utils/serializers.js';
import { logActivity } from '../utils/activityLog.js';

const prisma = new PrismaClient();

const ANIMAL_SELECT = { select: { id: true, brinco: true, nome: true } };

function cleanText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function animalSnapshot(animal) {
    return cleanText(animal?.brinco) || cleanText(animal?.registro) || cleanText(animal?.nome);
}

function stableExternalReference(registry, name) {
    return cleanText(registry) || cleanText(name);
}

// ─── Reprodução: avaliações (toque) por sessão + KPIs de decisão ─────────────
export function registerReproRoutes(app) {
    app.get('/repro/embryo-transfers', async (req, res) => {
        const { farmId, herdType = 'COMMERCIAL', status = 'PENDING' } = req.query || {};
        if (!farmId || !['COMMERCIAL', 'PO'].includes(String(herdType))) {
            return res.status(400).json({ message: 'Informe fazenda e tipo de rebanho válidos.' });
        }
        try {
            const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const transfers = await prisma.embryoTransfer.findMany({
                where: { farmId: farm.id, herdType: String(herdType), ...(status ? { status: String(status) } : {}) },
                include: { embryoBatch: { select: { id: true, lote: true, tecnica: true } } },
                orderBy: { transferredAt: 'desc' },
            });
            return res.json({ transfers });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar transferências de embrião.' });
        }
    });

    app.post('/repro/embryo-transfers', async (req, res) => {
        const { farmId, herdType = 'COMMERCIAL', embryoBatchId, recipientId, transferredAt, date, notes } = req.body || {};
        const normalizedHerdType = String(herdType).toUpperCase();
        const transferDate = parseDateValue(transferredAt || date);
        if (!farmId || !embryoBatchId || !recipientId || !transferDate || !['COMMERCIAL', 'PO'].includes(normalizedHerdType)) {
            return res.status(400).json({ message: 'Informe fazenda, rebanho, lote, receptora e data válidos.' });
        }
        try {
            const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

            const batch = await prisma.embryoBatch.findFirst({
                where: { id: String(embryoBatchId), farmId: farm.id },
                include: { donorAnimal: true, donorPoAnimal: true, sireAnimal: true, sirePoAnimal: true },
            });
            if (!batch || batch.tecnica !== 'TE') return res.status(400).json({ message: 'Lote de embrião TE inválido.' });
            if (batch.quantidadeDisponivel < 1) return res.status(409).json({ message: 'O lote não possui embrião disponível.' });
            if ((batch.donorAnimal && batch.donorAnimal.sexo !== 'FEMEA') || (batch.donorPoAnimal && batch.donorPoAnimal.sexo !== 'FEMEA')) {
                return res.status(400).json({ message: 'A doadora vinculada ao lote precisa ser fêmea.' });
            }
            if ((batch.sireAnimal && batch.sireAnimal.sexo !== 'MACHO') || (batch.sirePoAnimal && batch.sirePoAnimal.sexo !== 'MACHO')) {
                return res.status(400).json({ message: 'O touro vinculado ao lote precisa ser macho.' });
            }

            const recipientModel = normalizedHerdType === 'PO' ? prisma.poAnimal : prisma.animal;
            const recipient = await recipientModel.findFirst({ where: { id: String(recipientId), farmId: farm.id, sexo: 'FEMEA' } });
            const recipientSnapshot = animalSnapshot(recipient);
            if (!recipient || !recipientSnapshot) return res.status(400).json({ message: 'Receptora inválida para esta fazenda.' });

            const donorSnapshot = animalSnapshot(batch.donorAnimal)
                || animalSnapshot(batch.donorPoAnimal)
                || stableExternalReference(batch.donorRegistry, batch.donorName);
            if (!donorSnapshot) return res.status(400).json({ message: 'A doadora precisa de identificação ou registro estável.' });
            const donorKey = batch.donorAnimalId
                ? `ANIMAL:${batch.donorAnimalId}`
                : batch.donorPoAnimalId
                    ? `PO:${batch.donorPoAnimalId}`
                    : `EXTERNAL:${donorSnapshot.toUpperCase()}`;
            const sireSnapshot = animalSnapshot(batch.sireAnimal)
                || animalSnapshot(batch.sirePoAnimal)
                || stableExternalReference(batch.sireRegistry, batch.sireName);

            const pendingRecipientWhere = normalizedHerdType === 'PO'
                ? { recipientPoAnimalId: recipient.id }
                : { recipientAnimalId: recipient.id };
            const pending = await prisma.embryoTransfer.findFirst({
                where: { farmId: farm.id, herdType: normalizedHerdType, status: 'PENDING', ...pendingRecipientWhere },
                select: { id: true },
            });
            if (pending) return res.status(409).json({ message: 'A receptora já possui uma transferência pendente.' });

            const transfer = await prisma.$transaction(async (tx) => {
                const stockUpdate = await tx.embryoBatch.updateMany({
                    where: { id: batch.id, farmId: farm.id, quantidadeDisponivel: { gte: 1 } },
                    data: { quantidadeDisponivel: { decrement: 1 } },
                });
                if (stockUpdate.count !== 1) throw new Error('EMBRYO_STOCK_UNAVAILABLE');
                await tx.embryoMove.create({
                    data: { embryoBatchId: batch.id, date: transferDate, qty: 1, type: 'TRANSFER', notes: cleanText(notes) },
                });
                return tx.embryoTransfer.create({
                    data: {
                        farmId: farm.id,
                        herdType: normalizedHerdType,
                        embryoBatchId: batch.id,
                        recipientAnimalId: normalizedHerdType === 'COMMERCIAL' ? recipient.id : null,
                        recipientPoAnimalId: normalizedHerdType === 'PO' ? recipient.id : null,
                        transferredAt: transferDate,
                        recipientSnapshot,
                        donorKey,
                        donorSnapshot,
                        sireSnapshot,
                        notes: cleanText(notes),
                    },
                });
            });
            await logActivity(prisma, req, { action: 'TRANSFERENCIA_EMBRIAO_REGISTRADA', entity: 'EmbryoTransfer', entityId: transfer.id, description: `Registrou TE na receptora ${recipientSnapshot}`, farmId: farm.id });
            return res.status(201).json({ transfer });
        } catch (error) {
            if (error?.message === 'EMBRYO_STOCK_UNAVAILABLE') return res.status(409).json({ message: 'O lote não possui embrião disponível.' });
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar transferência de embrião.' });
        }
    });

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

            await logActivity(prisma, req, {
                action: 'AVALIACAO_REPRODUTIVA_REGISTRADA',
                entity: 'ReproCheckupSession',
                entityId: session.id,
                description: `Registrou avaliação reprodutiva de ${recordsData.length} animal(is)`,
                farmId: String(farmId),
            });

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

            // Consolida por vaca: vale o ÚLTIMO diagnóstico de cada uma (não cada registro)
            const byAnimal = new Map();
            for (const r of records) {
                if (!byAnimal.has(r.animalId)) {
                    byAnimal.set(r.animalId, { latest: null, emptyCount: 0, discard: false });
                }
                const info = byAnimal.get(r.animalId);
                if (r.pregnant === false) info.emptyCount += 1;
                const decision = (r.veterinarianDecision || '').toUpperCase();
                if (r.discardLight || decision.includes('DESCART')) info.discard = true;
                if (r.pregnant === true || r.pregnant === false) info.latest = r.pregnant;
            }

            let pregnant = 0;
            let empty = 0;
            const discardCandidates = new Set();
            const repeatEmpty = [];
            for (const [animalId, info] of byAnimal.entries()) {
                if (info.latest === true) pregnant += 1;
                else if (info.latest === false) empty += 1;
                if (info.emptyCount >= 2) repeatEmpty.push(animalId);
                if (info.discard || info.emptyCount >= 2) discardCandidates.add(animalId);
            }

            const evaluated = pregnant + empty;
            const pregRate = evaluated > 0 ? Number(((pregnant / evaluated) * 100).toFixed(1)) : null;

            // Natalidade e desmama: partos/desmamas dos ÚLTIMOS 12 MESES ÷ fêmeas do rebanho
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
            const [birthCount, femaleCount, weanings] = await Promise.all([
                prisma.reproEvent.count({
                    where: { farmId: String(farmId), type: 'PARTO', date: { gte: twelveMonthsAgo } },
                }),
                prisma.animal.count({ where: { farmId: String(farmId), sexo: 'FEMEA' } }),
                prisma.reproEvent.findMany({
                    where: { farmId: String(farmId), type: 'DESMAME', date: { gte: twelveMonthsAgo } },
                    select: { payload: true },
                }),
            ]);
            const birthRate = femaleCount > 0 ? Number(((birthCount / femaleCount) * 100).toFixed(1)) : null;

            const weaningCount = weanings.length;
            const weaningRate = femaleCount > 0 ? Number(((weaningCount / femaleCount) * 100).toFixed(1)) : null;
            const weaningWeights = weanings
                .map((w) => Number(w.payload?.weightKg))
                .filter((n) => Number.isFinite(n) && n > 0);
            const avgWeaningWeight = weaningWeights.length
                ? Number((weaningWeights.reduce((a, b) => a + b, 0) / weaningWeights.length).toFixed(1))
                : null;

            return res.json({
                kpis: {
                    evaluated,
                    pregnant,
                    empty,
                    pregRate,
                    repeatEmptyCount: repeatEmpty.length,
                    discardCandidateCount: discardCandidates.size,
                    births: birthCount,
                    birthRate,
                    weanings: weaningCount,
                    weaningRate,
                    avgWeaningWeight,
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

    // ── Partos ──────────────────────────────────────────────────────────────
    const serializeParto = (event) => ({
        id: event.id,
        farmId: event.farmId,
        animalId: event.animalId,
        animal: event.animal
            ? { id: event.animal.id, brinco: event.animal.brinco || null, nome: event.animal.nome || null }
            : undefined,
        date: event.date.toISOString(),
        calfSex: event.payload?.calfSex || null,
        notes: event.notes || null,
        createdAt: event.createdAt.toISOString(),
    });

    // Registrar parto (grava como ReproEvent PARTO e atualiza a vaca no Rebanho)
    app.post('/repro/partos', async (req, res) => {
        const { farmId, animalId, date, calfSex, notes } = req.body || {};
        if (!farmId || !animalId || !date) {
            return res.status(400).json({ message: 'Informe fazenda, vaca e data do parto.' });
        }
        const partoDate = parseDateValue(date);
        if (!partoDate) {
            return res.status(400).json({ message: 'Data do parto inválida.' });
        }

        try {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const animal = await prisma.animal.findFirst({
                where: { id: String(animalId), farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                select: { id: true, sexo: true },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal não encontrado.' });
            }
            if (animal.sexo !== 'FEMEA') {
                return res.status(400).json({ message: 'Parto é registrado apenas para fêmeas.' });
            }

            const cleanCalfSex = cleanText(calfSex);
            const [event] = await prisma.$transaction([
                prisma.reproEvent.create({
                    data: {
                        farmId: String(farmId),
                        animalId: String(animalId),
                        type: 'PARTO',
                        date: partoDate,
                        payload: cleanCalfSex ? { calfSex: cleanCalfSex } : undefined,
                        notes: cleanText(notes),
                    },
                    include: { animal: { select: { id: true, brinco: true, nome: true } } },
                }),
                prisma.animal.update({
                    where: { id: String(animalId) },
                    data: { statusReprodutivo: 'VAZIA', previsaoParto: null },
                }),
            ]);

            await logActivity(prisma, req, {
                action: 'PARTO_REGISTRADO',
                entity: 'ReproEvent',
                entityId: event.id,
                description: `Registrou parto do animal ${event.animal?.brinco || event.animal?.nome || animalId}`,
                farmId: String(farmId),
            });

            return res.status(201).json({ parto: serializeParto(event) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar parto.' });
        }
    });

    // Listar partos da fazenda
    app.get('/repro/partos', async (req, res) => {
        const { farmId } = req.query || {};
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
            const partos = await prisma.reproEvent.findMany({
                where: { farmId: String(farmId), type: 'PARTO' },
                orderBy: { date: 'desc' },
                include: { animal: { select: { id: true, brinco: true, nome: true } } },
            });
            return res.json({ partos: partos.map(serializeParto) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar partos.' });
        }
    });

    // Apagar um parto (não reverte o status já gravado na vaca)
    app.delete('/repro/partos/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const event = await prisma.reproEvent.findFirst({
                where: { id, type: 'PARTO', farm: buildFarmRelationFilter(req) },
            });
            if (!event) {
                return res.status(404).json({ message: 'Parto não encontrado.' });
            }
            await prisma.reproEvent.delete({ where: { id } });
            await logActivity(prisma, req, {
                action: 'PARTO_EXCLUIDO',
                entity: 'ReproEvent',
                entityId: id,
                description: `Excluiu registro de parto do animal ${event.animalId}`,
                farmId: event.farmId,
            });
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao apagar parto.' });
        }
    });

    // ── Desmamas ────────────────────────────────────────────────────────────
    const serializeDesmama = (event) => ({
        id: event.id,
        farmId: event.farmId,
        animalId: event.animalId,
        animal: event.animal
            ? { id: event.animal.id, brinco: event.animal.brinco || null, nome: event.animal.nome || null }
            : undefined,
        date: event.date.toISOString(),
        weightKg: Number.isFinite(Number(event.payload?.weightKg)) ? Number(event.payload.weightKg) : null,
        notes: event.notes || null,
        createdAt: event.createdAt.toISOString(),
    });

    // Registrar desmama (ReproEvent DESMAME, com peso à desmama opcional)
    app.post('/repro/desmamas', async (req, res) => {
        const { farmId, animalId, date, weightKg, notes } = req.body || {};
        if (!farmId || !animalId || !date) {
            return res.status(400).json({ message: 'Informe fazenda, vaca e data da desmama.' });
        }
        const desmamaDate = parseDateValue(date);
        if (!desmamaDate) {
            return res.status(400).json({ message: 'Data da desmama inválida.' });
        }
        const weight = Number(weightKg);
        const validWeight = Number.isFinite(weight) && weight > 0 ? weight : null;

        try {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }
            const animal = await prisma.animal.findFirst({
                where: { id: String(animalId), farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                select: { id: true, sexo: true },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal não encontrado.' });
            }
            if (animal.sexo !== 'FEMEA') {
                return res.status(400).json({ message: 'Desmama é registrada na matriz (fêmea).' });
            }

            const event = await prisma.reproEvent.create({
                data: {
                    farmId: String(farmId),
                    animalId: String(animalId),
                    type: 'DESMAME',
                    date: desmamaDate,
                    payload: validWeight ? { weightKg: validWeight } : undefined,
                    notes: cleanText(notes),
                },
                include: { animal: { select: { id: true, brinco: true, nome: true } } },
            });

            await logActivity(prisma, req, {
                action: 'DESMAMA_REPRO_REGISTRADA',
                entity: 'ReproEvent',
                entityId: event.id,
                description: `Registrou desmama do animal ${event.animal?.brinco || event.animal?.nome || animalId}`,
                farmId: String(farmId),
            });

            return res.status(201).json({ desmama: serializeDesmama(event) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar desmama.' });
        }
    });

    // Listar desmamas da fazenda
    app.get('/repro/desmamas', async (req, res) => {
        const { farmId } = req.query || {};
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
            const desmamas = await prisma.reproEvent.findMany({
                where: { farmId: String(farmId), type: 'DESMAME' },
                orderBy: { date: 'desc' },
                include: { animal: { select: { id: true, brinco: true, nome: true } } },
            });
            return res.json({ desmamas: desmamas.map(serializeDesmama) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar desmamas.' });
        }
    });

    // Apagar uma desmama
    app.delete('/repro/desmamas/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const event = await prisma.reproEvent.findFirst({
                where: { id, type: 'DESMAME', farm: buildFarmRelationFilter(req) },
            });
            if (!event) {
                return res.status(404).json({ message: 'Desmama não encontrada.' });
            }
            await prisma.reproEvent.delete({ where: { id } });
            return res.json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao apagar desmama.' });
        }
    });
}
