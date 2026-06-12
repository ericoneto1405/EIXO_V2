import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { requireAuth, requireNonFieldWorker } from '../../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../../middlewares/farmScope.js';
import { parseNumber, parseDateValue, parseInteger, normalizeSexo, normalizeSemenMoveType, normalizeEmbryoMoveType } from '../../utils/formatters.js';
import { logActivity } from '../../utils/activityLog.js';
import {
    serializePoAnimal, serializeSemenBatch, serializeEmbryoBatch,
    serializePaddockMove, serializeNutritionPlan,
} from '../../utils/serializers.js';
import { moveAnimalBetweenPaddocks, transferAnimalsToFarm, calculateGmdMetrics, diffDaysFloat } from '../animals/animalRoutes.js';
const prisma = new PrismaClient();

const verifyPasswordWithLegacySupport = async (user, password) => {
    if (!user?.password) return false;
    if (user.password.startsWith('$2')) {
        return bcrypt.compare(password, user.password);
    }
    const matches = user.password === password;
    if (matches) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });
    }
    return matches;
};

const recalculateAnimalWeighingChain = async (tx, animalId) => {
    const allWeighings = await tx.weighing.findMany({
        where: { animalId },
        orderBy: { data: 'asc' },
    });

    let previous = null;
    for (const row of allWeighings) {
        let gmdValue = 0;
        if (previous) {
            const interval = diffDaysFloat(row.data, previous.data);
            if (interval > 0) {
                gmdValue = (row.peso - previous.peso) / interval;
            }
        }
        if (row.gmd !== gmdValue) {
            await tx.weighing.update({
                where: { id: row.id },
                data: { gmd: gmdValue },
            });
        }
        previous = row;
    }

    if (!allWeighings.length) {
        await tx.animal.update({
            where: { id: animalId },
            data: {
                pesoAtual: null,
                gmd: null,
                gmd30: null,
            },
        });
        return;
    }

    const metrics = calculateGmdMetrics(
        allWeighings.map((item) => ({ date: item.data, weight: item.peso })),
    );
    const latest = allWeighings[allWeighings.length - 1];
    await tx.animal.update({
        where: { id: animalId },
        data: {
            pesoAtual: latest.peso,
            gmd: metrics.gmdLast,
            gmd30: metrics.gmd30,
        },
    });
};

const listPoWeighings = async (req, res, responseKey) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const pesagens = await prisma.poWeighing.findMany({
            where: { poAnimalId: id, farmId: animal.farmId },
            orderBy: { data: 'desc' },
        });

        if (responseKey === 'pesagens') {
            return res.json({
                pesagens: pesagens.map((pesagem) => ({
                    id: pesagem.id,
                    data: pesagem.data.toISOString(),
                    peso: pesagem.peso,
                    gmd: pesagem.gmd,
                })),
            });
        }
        return res.json({
            [responseKey]: pesagens.map((pesagem) => ({
                id: pesagem.id,
                date: pesagem.data.toISOString(),
                weightKg: pesagem.peso,
                gmd: pesagem.gmd,
                notes: pesagem.notes,
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar pesagens.' });
    }
};

const createPoWeighing = async (req, res, responseKey) => {
    const { id } = req.params;
    const { data, date, peso, weightKg, notes, forceReplace } = req.body || {};

    const weighingDate = parseDateValue(date || data);
    if (!weighingDate) {
        return res.status(400).json({ message: 'Data da pesagem inválida.' });
    }

    const parsedPeso = parseNumber(weightKg ?? peso);
    if (parsedPeso === null || parsedPeso <= 0) {
        return res.status(400).json({ message: 'Peso da pesagem inválido.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const pesagem = await prisma.$transaction(async (tx) => {
            if (forceReplace === true) {
                await tx.poWeighing.deleteMany({
                    where: { poAnimalId: id, data: weighingDate },
                });
            }

            const previousWeighing = await tx.poWeighing.findFirst({
                where: { poAnimalId: id, data: { lt: weighingDate } },
                orderBy: { data: 'desc' },
            });

            let gmdValue = 0;
            if (previousWeighing) {
                const diffDaysValue = diffDaysFloat(weighingDate, previousWeighing.data);
                if (diffDaysValue > 0) {
                    gmdValue = (parsedPeso - previousWeighing.peso) / diffDaysValue;
                }
            }

            const createdWeighing = await tx.poWeighing.create({
                data: {
                    poAnimalId: id,
                    farmId: animal.farmId,
                    data: weighingDate,
                    peso: parsedPeso,
                    gmd: gmdValue,
                    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
                },
            });

            const allWeighings = await tx.poWeighing.findMany({
                where: { poAnimalId: id },
                orderBy: { data: 'asc' },
            });
            const metrics = calculateGmdMetrics(
                allWeighings.map((row) => ({ date: row.data, weight: row.peso })),
            );
            const latest = allWeighings[allWeighings.length - 1];

            await tx.poAnimal.update({
                where: { id: animal.id },
                data: {
                    pesoAtual: latest?.peso ?? parsedPeso,
                    gmd: metrics.gmdLast,
                    gmd30: metrics.gmd30,
                },
            });

            return createdWeighing;
        });

        if (responseKey === 'pesagem') {
            return res.status(201).json({
                pesagem: {
                    id: pesagem.id,
                    data: pesagem.data.toISOString(),
                    peso: pesagem.peso,
                    gmd: pesagem.gmd,
                },
            });
        }
        return res.status(201).json({
            [responseKey]: {
                id: pesagem.id,
                date: pesagem.data.toISOString(),
                weightKg: pesagem.peso,
                gmd: pesagem.gmd,
                notes: pesagem.notes,
            },
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe pesagem cadastrada nesta data.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar pesagem.' });
    }
};

function serializeWeighingSession(s) {
    return {
        id: s.id,
        name: s.name,
        responsibleName: s.responsibleName ?? null,
        farmId: s.farmId,
        createdAt: s.createdAt,
        weighingsCount: s._count?.weighings ?? undefined,
    };
}

export function registerPORoutes(app) {
app.get('/po/animals', requireAuth, async (req, res) => {
    const { farmId, lotId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar animais P.O.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const animals = await prisma.poAnimal.findMany({
            where: {
                farmId: farm.id,
                ...(lotId ? { lotId: String(lotId) } : {}),
            },
            include: {
                currentPaddock: true,
                pesagens: {
                    orderBy: { data: 'desc' },
                    take: 1,
                    select: { data: true, peso: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const now = new Date();
        const animalIds = animals.map((animal) => animal.id);
        const lotIds = animals.map((animal) => animal.lotId).filter(Boolean);
        let nutritionByAnimal = new Map();
        let nutritionByLot = new Map();
        if (animalIds.length || lotIds.length) {
            const assignments = await prisma.nutritionAssignment.findMany({
                where: {
                    farmId: farm.id,
                    startAt: { lte: now },
                    OR: [{ endAt: null }, { endAt: { gte: now } }],
                    AND: [
                        {
                            OR: [
                                ...(animalIds.length ? [{ poAnimalId: { in: animalIds } }] : []),
                                ...(lotIds.length ? [{ poLotId: { in: lotIds } }] : []),
                            ],
                        },
                    ],
                },
                include: { plan: true },
            });
            const pickLatest = (map, key, assignment) => {
                if (!key) return;
                const existing = map.get(key);
                if (!existing || assignment.startAt > existing.startAt) {
                    map.set(key, assignment);
                }
            };
            assignments.forEach((assignment) => {
                if (assignment.poAnimalId) {
                    pickLatest(nutritionByAnimal, assignment.poAnimalId, assignment);
                }
                if (assignment.poLotId) {
                    pickLatest(nutritionByLot, assignment.poLotId, assignment);
                }
            });
        }
        const decisions = animalIds.length
            ? await prisma.selectionDecision.findMany({
                where: { farmId: farm.id, animalId: { in: animalIds } },
                select: { animalId: true, decision: true },
            })
            : [];
        const decisionByAnimal = new Map(decisions.map((decision) => [decision.animalId, decision.decision]));

        const enriched = animals.map((animal) => {
            const direct = nutritionByAnimal.get(animal.id);
            const lot = animal.lotId ? nutritionByLot.get(animal.lotId) : null;
            const plan = direct?.plan || lot?.plan || null;
            return {
                ...animal,
                currentNutritionPlan: plan ? serializeNutritionPlan(plan) : null,
                selectionDecision: decisionByAnimal.get(animal.id) || null,
            };
        });

        return res.json({ animals: enriched.map(serializePoAnimal) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar animais P.O.' });
    }
});

app.post('/po/animals', requireAuth, async (req, res) => {
    const { farmId, lotId, brinco, nome, raca, sexo, dataNascimento, registro, categoria, observacoes, ultimoPeso, paddockId, paddockStartAt } = req.body || {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pesoAtual')) {
        return res.status(400).json({ message: 'Campo inválido: use "ultimoPeso" no lugar de "pesoAtual".' });
    }
    if (!farmId || !nome?.trim() || !raca?.trim() || !sexo) {
        return res.status(400).json({ message: 'Dados obrigatórios do animal P.O. ausentes.' });
    }

    const sexoEnum = normalizeSexo(sexo);
    if (!sexoEnum) {
        return res.status(400).json({ message: 'Sexo inválido. Use Macho ou Fêmea.' });
    }

    const birthDate = dataNascimento ? parseDateValue(dataNascimento) : null;
    if (dataNascimento && !birthDate) {
        return res.status(400).json({ message: 'Data de nascimento inválida.' });
    }

    const trimmedBrinco = typeof brinco === 'string' ? brinco.trim() : '';
    const trimmedRegistro = typeof registro === 'string' ? registro.trim() : '';
    const trimmedCategoria = typeof categoria === 'string' ? categoria.trim() : '';
    const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';
    let parsedPesoAtual = 0;
    if (ultimoPeso !== undefined && ultimoPeso !== null && ultimoPeso !== '') {
        const parsed = parseNumber(ultimoPeso);
        if (parsed === null || parsed <= 0) {
            return res.status(400).json({ message: 'Peso atual inválido.' });
        }
        parsedPesoAtual = parsed;
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        let validLotId = null;
        if (lotId) {
            const lot = await prisma.poLot.findFirst({
                where: { id: String(lotId), farmId: farm.id },
            });
            if (!lot) {
                return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
            }
            validLotId = lot.id;
        }

        let validPaddockId = null;
        let moveStartAt = null;
        if (paddockId) {
            const paddock = await prisma.paddock.findFirst({
                where: { id: paddockId, farmId: farm.id, farm: buildFarmRelationFilter(req) },
            });
            if (!paddock) {
                return res.status(400).json({ message: 'Pasto inválido para esta fazenda.' });
            }

            moveStartAt = paddockStartAt ? parseDateValue(paddockStartAt) : new Date();
            if (paddockStartAt && !moveStartAt) {
                return res.status(400).json({ message: 'Data de entrada no pasto inválida.' });
            }
            validPaddockId = paddock.id;
        }

        const animal = await prisma.$transaction(async (tx) => {
            const created = await tx.poAnimal.create({
                data: {
                    farmId: farm.id,
                    lotId: validLotId,
                    brinco: trimmedBrinco || null,
                    nome: nome.trim(),
                    raca: raca.trim(),
                    sexo: sexoEnum,
                    dataNascimento: birthDate,
                    pesoAtual: parsedPesoAtual,
                    gmd: null,
                    gmd30: null,
                    registro: trimmedRegistro || null,
                    categoria: trimmedCategoria || null,
                    observacoes: trimmedObservacoes || null,
                    currentPaddockId: validPaddockId,
                },
            });
            if (validPaddockId && moveStartAt) {
                await tx.paddockMove.create({
                    data: {
                        farmId: farm.id,
                        paddockId: validPaddockId,
                        poAnimalId: created.id,
                        startAt: moveStartAt,
                    },
                });
            }
            return created;
        });

        return res.status(201).json({ animal: serializePoAnimal(animal) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar animal P.O.' });
    }
});

app.post('/po/animals/import-batch', requireAuth, async (req, res) => {
    const { farmId, items } = req.body || {};
    if (!farmId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'farmId e items são obrigatórios.' });
    }
    if (items.length > 500) {
        return res.status(400).json({ message: 'Limite de importação: até 500 animais por envio.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const results = [];
        let success = 0;

        for (let index = 0; index < items.length; index++) {
            const item = items[index] || {};
            const rowLabel = item.rowLabel || `Linha ${index + 2}`;
            const warnings = [];
            if (Object.prototype.hasOwnProperty.call(item, 'pesoAtual')) {
                results.push({ index, success: false, message: `${rowLabel}: campo inválido "pesoAtual". Use "ultimoPeso".` });
                continue;
            }

            const nome = String(item.nome || item.brinco || '').trim();
            const raca = String(item.raca || '').trim();
            const sexoEnum = normalizeSexo(item.sexo);
            const paddockId = String(item.paddockId || '').trim();

            if (!nome || !raca || !sexoEnum) {
                results.push({ index, success: false, message: `${rowLabel}: campos obrigatórios ausentes (nome, raça, sexo).` });
                continue;
            }

            const birthDate = item.dataNascimento ? parseDateValue(item.dataNascimento) : null;
            if (item.dataNascimento && !birthDate) {
                results.push({ index, success: false, message: `${rowLabel} (${nome}): data de nascimento inválida.` });
                continue;
            }

            let parsedPesoAtual = 0;
            if (item.ultimoPeso !== undefined && item.ultimoPeso !== null && item.ultimoPeso !== '') {
                const parsed = parseNumber(item.ultimoPeso);
                if (parsed === null || parsed <= 0) {
                    results.push({ index, success: false, message: `${rowLabel} (${nome}): peso atual inválido.` });
                    continue;
                }
                parsedPesoAtual = parsed;
            }

            try {
                const createdAnimal = await prisma.$transaction(async (tx) => {
                    let validLotId = null;
                    if (item.lotId) {
                        const lot = await tx.poLot.findFirst({
                            where: { id: String(item.lotId), farmId: String(farmId) },
                        });
                        if (!lot) throw new Error('Lote P.O. inválido.');
                        validLotId = lot.id;
                    }

                    let validPaddockId = null;
                    let moveStartAt = null;
                    if (paddockId) {
                        const paddock = await tx.paddock.findFirst({
                            where: { id: paddockId, farmId: String(farmId), farm: buildFarmRelationFilter(req) },
                        });
                        if (!paddock) throw new Error('Pasto inválido para esta fazenda.');

                        moveStartAt = item.paddockStartAt ? parseDateValue(item.paddockStartAt) : new Date();
                        if (item.paddockStartAt && !moveStartAt) throw new Error('Data de entrada no pasto inválida.');
                        validPaddockId = paddock.id;
                    }

                    const created = await tx.poAnimal.create({
                        data: {
                            farmId: String(farmId),
                            lotId: validLotId,
                            brinco: item.brinco ? String(item.brinco).trim() || null : null,
                            nome,
                            raca,
                            sexo: sexoEnum,
                            dataNascimento: birthDate,
                            pesoAtual: parsedPesoAtual,
                            gmd: null,
                            gmd30: null,
                            registro: item.registro ? String(item.registro).trim() || null : null,
                            categoria: item.categoria ? String(item.categoria).trim() || null : null,
                            observacoes: item.observacoes ? String(item.observacoes).trim() || null : null,
                            currentPaddockId: validPaddockId,
                        },
                    });

                    if (validPaddockId && moveStartAt) {
                        await tx.paddockMove.create({
                            data: { farmId: String(farmId), paddockId: validPaddockId, poAnimalId: created.id, startAt: moveStartAt },
                        });
                    }

                    const weighingsInput = Array.isArray(item.weighings) ? item.weighings : [];
                    const parsedWeighings = weighingsInput
                        .map((weighing) => {
                            const date = parseDateValue(weighing?.data);
                            const weight = parseNumber(weighing?.peso);
                            if (!date || weight === null || weight <= 0) return null;
                            return { date, weight };
                        })
                        .filter(Boolean)
                        .sort((left, right) => left.date.getTime() - right.date.getTime());

                    if (weighingsInput.length > 0 && parsedWeighings.length === 0) {
                        warnings.push(`${rowLabel} (${nome}): pesagens ignoradas por dados inválidos.`);
                    }
                    if (parsedWeighings.length === 0 && parsedPesoAtual > 0) {
                        parsedWeighings.push({ date: new Date(), weight: parsedPesoAtual });
                    }

                    let previous = null;
                    for (const weighing of parsedWeighings) {
                        let gmdValue = 0;
                        if (previous) {
                            const diffDaysValue = diffDaysFloat(weighing.date, previous.date);
                            if (diffDaysValue > 0) gmdValue = (weighing.weight - previous.weight) / diffDaysValue;
                        }
                        await tx.poWeighing.create({
                            data: {
                                poAnimalId: created.id,
                                farmId: String(farmId),
                                data: weighing.date,
                                peso: weighing.weight,
                                gmd: gmdValue,
                            },
                        });
                        previous = weighing;
                    }

                    if (parsedWeighings.length > 0) {
                        const allWeighings = await tx.poWeighing.findMany({
                            where: { poAnimalId: created.id },
                            orderBy: { data: 'asc' },
                        });
                        const metrics = calculateGmdMetrics(
                            allWeighings.map((row) => ({ date: row.data, weight: row.peso })),
                        );
                        const latest = allWeighings[allWeighings.length - 1];
                        await tx.poAnimal.update({
                            where: { id: created.id },
                            data: { pesoAtual: latest?.peso ?? created.pesoAtual, gmd: metrics.gmdLast, gmd30: metrics.gmd30 },
                        });
                    }

                    return created;
                });

                success += 1;
                results.push({ index, success: true, animalId: createdAnimal.id, nome, warnings });
            } catch (error) {
                if (error?.code === 'P2002') {
                    results.push({ index, success: false, message: `${rowLabel} (${nome}): brinco já cadastrado.` });
                } else {
                    results.push({ index, success: false, message: `${rowLabel} (${nome}): ${error?.message || 'erro ao importar.'}` });
                }
            }
        }

        if (success > 0) {
            logActivity(req, {
                action: 'PO_ANIMAL_IMPORT_BATCH',
                entity: 'PoAnimal',
                description: `Importou ${success} animal(is) P.O. em lote`,
                farmId: String(farmId),
            });
        }

        return res.status(200).json({ total: items.length, success, failures: items.length - success, results });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao importar animais P.O. em lote.' });
    }
});

app.patch('/po/animals/:id', async (req, res) => {
    const { id } = req.params;
    const { lotId, brinco, nome, raca, sexo, dataNascimento, registro, categoria, observacoes } = req.body || {};

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const updates = {};

        if (brinco !== undefined) {
            const trimmedBrinco = typeof brinco === 'string' ? brinco.trim() : '';
            updates.brinco = trimmedBrinco || null;
        }

        if (nome !== undefined) {
            if (!nome?.trim()) {
                return res.status(400).json({ message: 'Nome inválido.' });
            }
            updates.nome = nome.trim();
        }

        if (raca !== undefined) {
            if (!raca?.trim()) {
                return res.status(400).json({ message: 'Raça inválida.' });
            }
            updates.raca = raca.trim();
        }

        if (sexo !== undefined) {
            const sexoEnum = normalizeSexo(sexo);
            if (!sexoEnum) {
                return res.status(400).json({ message: 'Sexo inválido. Use Macho ou Fêmea.' });
            }
            updates.sexo = sexoEnum;
        }

        if (dataNascimento !== undefined) {
            if (dataNascimento === null || dataNascimento === '') {
                updates.dataNascimento = null;
            } else {
                const parsedDate = parseDateValue(dataNascimento);
                if (!parsedDate) {
                    return res.status(400).json({ message: 'Data de nascimento inválida.' });
                }
                updates.dataNascimento = parsedDate;
            }
        }

        if (registro !== undefined) {
            const trimmedRegistro = typeof registro === 'string' ? registro.trim() : '';
            updates.registro = trimmedRegistro || null;
        }

        if (categoria !== undefined) {
            const trimmedCategoria = typeof categoria === 'string' ? categoria.trim() : '';
            updates.categoria = trimmedCategoria || null;
        }

        if (observacoes !== undefined) {
            const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';
            updates.observacoes = trimmedObservacoes || null;
        }
        if (lotId !== undefined) {
            if (!lotId) {
                updates.lotId = null;
            } else {
                const lot = await prisma.poLot.findFirst({
                    where: { id: String(lotId), farmId: animal.farmId },
                });
                if (!lot) {
                    return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
                }
                updates.lotId = lot.id;
            }
        }

        const updated = await prisma.poAnimal.update({
            where: { id: animal.id },
            data: updates,
        });

        return res.json({ animal: serializePoAnimal(updated) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Brinco já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar animal P.O.' });
    }
});

app.delete('/po/animals/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        await prisma.poAnimal.delete({ where: { id: animal.id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir animal P.O.' });
    }
});

app.get('/po/lots', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar lotes P.O.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const lots = await prisma.poLot.findMany({
            where: { farmId: farm.id },
            orderBy: { createdAt: 'desc' },
        });
        return res.json({ lots });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar lotes P.O.' });
    }
});

app.post('/po/lots', async (req, res) => {
    const { farmId, name, notes } = req.body || {};
    if (!farmId || !name?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e nome do lote.' });
    }
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }
        const lot = await prisma.poLot.create({
            data: {
                farmId: farm.id,
                name: name.trim(),
                notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
            },
        });
        return res.status(201).json({ lot });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar lote P.O.' });
    }
});
app.get('/po/animals/:id/pesagens', (req, res) => listPoWeighings(req, res, 'pesagens'));
app.post('/po/animals/:id/pesagens', (req, res) => createPoWeighing(req, res, 'pesagem'));

app.get('/po/animals/:id/weighings', (req, res) => listPoWeighings(req, res, 'weighings'));
app.post('/po/animals/:id/weighings', (req, res) => createPoWeighing(req, res, 'weighing'));
app.get('/po/semen', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar sêmen.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const batches = await prisma.semenBatch.findMany({
            where: { farmId: farm.id },
            include: { bullAnimal: true, bullPoAnimal: true },
            orderBy: { createdAt: 'desc' },
        });

        return res.json({ batches: batches.map(serializeSemenBatch) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar sêmen.' });
    }
});

app.post('/po/semen', async (req, res) => {
    const {
        farmId,
        bullAnimalId,
        bullPoAnimalId,
        bullName,
        bullRegistry,
        fornecedor,
        lote,
        dataColeta,
        dosesTotal,
        dosesDisponiveis,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    if (!farmId || !lote?.trim()) {
        return res.status(400).json({ message: 'Informe fazenda e lote do sêmen.' });
    }

    const totalValue = parseInteger(dosesTotal);
    const availableValue = parseInteger(dosesDisponiveis);
    if (!totalValue || totalValue <= 0) {
        return res.status(400).json({ message: 'Doses totais inválidas.' });
    }
    if (availableValue === null || availableValue < 0) {
        return res.status(400).json({ message: 'Doses disponíveis inválidas.' });
    }
    if (availableValue > totalValue) {
        return res.status(400).json({ message: 'Doses disponíveis não podem exceder o total.' });
    }

    const trimmedName = typeof bullName === 'string' ? bullName.trim() : '';
    const trimmedRegistry = typeof bullRegistry === 'string' ? bullRegistry.trim() : '';
    const trimmedFornecedor = typeof fornecedor === 'string' ? fornecedor.trim() : '';
    const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
    const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

    const collectionDate = dataColeta ? parseDateValue(dataColeta) : null;
    if (dataColeta && !collectionDate) {
        return res.status(400).json({ message: 'Data de coleta inválida.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        let validAnimalBullId = null;
        if (bullAnimalId) {
            const bull = await findInventoryAnimal({ id: bullAnimalId, farmId: farm.id });
            if (!bull) {
                return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
            }
            validAnimalBullId = bull.id;
        }

        let validBullId = null;
        if (bullPoAnimalId) {
            const bull = await findLegacyPoAnimal({ id: bullPoAnimalId, farmId: farm.id });
            if (!bull) {
                return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
            }
            validBullId = bull.id;
        }

        if (!validAnimalBullId && !validBullId && !trimmedName) {
            return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
        }

        const batch = await prisma.semenBatch.create({
            data: {
                farmId: farm.id,
                bullAnimalId: validAnimalBullId,
                bullPoAnimalId: validBullId,
                bullName: validAnimalBullId || validBullId ? null : trimmedName,
                bullRegistry: validAnimalBullId || validBullId ? null : trimmedRegistry || null,
                fornecedor: trimmedFornecedor || null,
                lote: lote.trim(),
                dataColeta: collectionDate,
                dosesTotal: totalValue,
                dosesDisponiveis: availableValue,
                localArmazenamento: trimmedLocal || null,
                observacoes: trimmedObservacoes || null,
            },
        });

        return res.status(201).json({ batch: serializeSemenBatch({ ...batch, bullAnimal: null, bullPoAnimal: null }) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar sêmen.' });
    }
});

app.patch('/po/semen/:id', async (req, res) => {
    const { id } = req.params;
    const {
        bullAnimalId,
        bullPoAnimalId,
        bullName,
        bullRegistry,
        fornecedor,
        lote,
        dataColeta,
        dosesTotal,
        dosesDisponiveis,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    try {
        const batch = await prisma.semenBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de sêmen não encontrado.' });
        }

        const updates = {};
        const trimmedName = typeof bullName === 'string' ? bullName.trim() : '';
        const trimmedRegistry = typeof bullRegistry === 'string' ? bullRegistry.trim() : '';
        const trimmedFornecedor = typeof fornecedor === 'string' ? fornecedor.trim() : '';
        const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
        const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

        let nextAnimalBullId = batch.bullAnimalId;
        if (bullAnimalId !== undefined) {
            nextAnimalBullId = bullAnimalId ? String(bullAnimalId) : null;
            if (nextAnimalBullId) {
                const bull = await findInventoryAnimal({ id: nextAnimalBullId, farmId: batch.farmId });
                if (!bull) {
                    return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
                }
                updates.bullAnimalId = bull.id;
                updates.bullPoAnimalId = null;
                updates.bullName = bullName !== undefined ? trimmedName || null : null;
                updates.bullRegistry = bullRegistry !== undefined ? trimmedRegistry || null : null;
            } else {
                updates.bullAnimalId = null;
            }
        }

        let nextBullId = bullAnimalId !== undefined && bullAnimalId ? null : batch.bullPoAnimalId;
        if (bullPoAnimalId !== undefined) {
            nextBullId = bullPoAnimalId ? String(bullPoAnimalId) : null;
            if (nextBullId) {
                const bull = await findLegacyPoAnimal({ id: nextBullId, farmId: batch.farmId });
                if (!bull) {
                    return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
                }
                updates.bullPoAnimalId = bull.id;
                updates.bullAnimalId = null;
                updates.bullName = bullName !== undefined ? trimmedName || null : null;
                updates.bullRegistry = bullRegistry !== undefined ? trimmedRegistry || null : null;
            } else {
                updates.bullPoAnimalId = null;
            }
        }

        if (nextAnimalBullId === null && nextBullId === null) {
            const nextName = bullName !== undefined ? trimmedName : batch.bullName;
            if (!nextName) {
                return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
            }
            if (bullName !== undefined) {
                updates.bullName = trimmedName || null;
            }
            if (bullRegistry !== undefined) {
                updates.bullRegistry = trimmedRegistry || null;
            }
        }

        if (lote !== undefined) {
            if (!lote?.trim()) {
                return res.status(400).json({ message: 'Lote inválido.' });
            }
            updates.lote = lote.trim();
        }

        const totalValue = dosesTotal !== undefined ? parseInteger(dosesTotal) : batch.dosesTotal;
        const availableValue = dosesDisponiveis !== undefined ? parseInteger(dosesDisponiveis) : batch.dosesDisponiveis;
        if (dosesTotal !== undefined && (!totalValue || totalValue <= 0)) {
            return res.status(400).json({ message: 'Doses totais inválidas.' });
        }
        if (dosesDisponiveis !== undefined && (availableValue === null || availableValue < 0)) {
            return res.status(400).json({ message: 'Doses disponíveis inválidas.' });
        }
        if (availableValue > totalValue) {
            return res.status(400).json({ message: 'Doses disponíveis não podem exceder o total.' });
        }

        if (dosesTotal !== undefined) {
            updates.dosesTotal = totalValue;
        }
        if (dosesDisponiveis !== undefined) {
            updates.dosesDisponiveis = availableValue;
        }

        if (dataColeta !== undefined) {
            if (dataColeta === null || dataColeta === '') {
                updates.dataColeta = null;
            } else {
                const parsedDate = parseDateValue(dataColeta);
                if (!parsedDate) {
                    return res.status(400).json({ message: 'Data de coleta inválida.' });
                }
                updates.dataColeta = parsedDate;
            }
        }

        if (fornecedor !== undefined) {
            updates.fornecedor = trimmedFornecedor || null;
        }
        if (localArmazenamento !== undefined) {
            updates.localArmazenamento = trimmedLocal || null;
        }
        if (observacoes !== undefined) {
            updates.observacoes = trimmedObservacoes || null;
        }

        const updated = await prisma.semenBatch.update({
            where: { id: batch.id },
            data: updates,
        });

        const updatedWithBull = await prisma.semenBatch.findUnique({
            where: { id: updated.id },
            include: { bullAnimal: true, bullPoAnimal: true },
        });

        return res.json({ batch: serializeSemenBatch(updatedWithBull) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar sêmen.' });
    }
});

app.post('/po/semen/:id/move', async (req, res) => {
    const { id } = req.params;
    const { date, qty, type, notes } = req.body || {};

    const moveType = normalizeSemenMoveType(type);
    if (!moveType) {
        return res.status(400).json({ message: 'Tipo de movimentação inválido.' });
    }

    const qtyValue = parseInteger(qty);
    if (qtyValue === null || qtyValue === 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }
    if (moveType !== 'ADJUST' && qtyValue < 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }

    const moveDate = parseDateValue(date);
    if (!moveDate) {
        return res.status(400).json({ message: 'Data inválida.' });
    }

    try {
        const batch = await prisma.semenBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de sêmen não encontrado.' });
        }

        const delta = moveType === 'IN'
            ? qtyValue
            : moveType === 'OUT' || moveType === 'USE'
                ? -qtyValue
                : qtyValue;

        const nextAvailable = batch.dosesDisponiveis + delta;
        if (nextAvailable < 0 || nextAvailable > batch.dosesTotal) {
            return res.status(400).json({ message: 'Saldo disponível inválido para a movimentação.' });
        }

        const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';

        const [move] = await prisma.$transaction([
            prisma.semenMove.create({
                data: {
                    semenBatchId: batch.id,
                    date: moveDate,
                    qty: qtyValue,
                    type: moveType,
                    notes: trimmedNotes || null,
                },
            }),
            prisma.semenBatch.update({
                where: { id: batch.id },
                data: { dosesDisponiveis: nextAvailable },
            }),
        ]);

        return res.json({
            move: {
                id: move.id,
                semenBatchId: move.semenBatchId,
                date: move.date.toISOString(),
                qty: move.qty,
                type: move.type,
                notes: move.notes,
            },
            dosesDisponiveis: nextAvailable,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar sêmen.' });
    }
});

app.delete('/po/semen/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const batch = await prisma.semenBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de sêmen não encontrado.' });
        }

        const moveCount = await prisma.semenMove.count({
            where: { semenBatchId: batch.id },
        });
        if (moveCount > 0) {
            return res.status(409).json({ message: 'Lote possui movimentações.' });
        }
        if (batch.dosesDisponiveis !== batch.dosesTotal) {
            return res.status(409).json({ message: 'Lote possui saldo diferente do total.' });
        }

        await prisma.semenBatch.delete({ where: { id: batch.id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir lote de sêmen.' });
    }
});

app.get('/po/embryos', async (req, res) => {
    const { farmId } = req.query || {};
    if (!farmId) {
        return res.status(400).json({ message: 'Informe a fazenda para listar embriões.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        const batches = await prisma.embryoBatch.findMany({
            where: { farmId: farm.id },
            include: { donorAnimal: true, donorPoAnimal: true, sireAnimal: true, sirePoAnimal: true },
            orderBy: { createdAt: 'desc' },
        });

        return res.json({ batches: batches.map(serializeEmbryoBatch) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar embriões.' });
    }
});

app.post('/po/embryos', async (req, res) => {
    const {
        farmId,
        donorAnimalId,
        donorPoAnimalId,
        donorName,
        donorRegistry,
        sireAnimalId,
        sirePoAnimalId,
        sireName,
        sireRegistry,
        tecnica,
        estagio,
        qualidade,
        lote,
        quantidadeTotal,
        quantidadeDisponivel,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    if (!farmId || !lote?.trim() || !tecnica) {
        return res.status(400).json({ message: 'Informe fazenda, lote e técnica.' });
    }

    const tecnicaEnum = normalizeEmbryoTechnique(tecnica);
    if (!tecnicaEnum) {
        return res.status(400).json({ message: 'Técnica inválida.' });
    }

    const totalValue = parseInteger(quantidadeTotal);
    const availableValue = parseInteger(quantidadeDisponivel);
    if (!totalValue || totalValue <= 0) {
        return res.status(400).json({ message: 'Quantidade total inválida.' });
    }
    if (availableValue === null || availableValue < 0) {
        return res.status(400).json({ message: 'Quantidade disponível inválida.' });
    }
    if (availableValue > totalValue) {
        return res.status(400).json({ message: 'Quantidade disponível não pode exceder o total.' });
    }

    const trimmedDonorName = typeof donorName === 'string' ? donorName.trim() : '';
    const trimmedSireName = typeof sireName === 'string' ? sireName.trim() : '';
    const trimmedDonorRegistry = typeof donorRegistry === 'string' ? donorRegistry.trim() : '';
    const trimmedSireRegistry = typeof sireRegistry === 'string' ? sireRegistry.trim() : '';
    const trimmedEstagio = typeof estagio === 'string' ? estagio.trim() : '';
    const trimmedQualidade = typeof qualidade === 'string' ? qualidade.trim() : '';
    const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
    const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(farmId) }),
        });
        if (!farm) {
            return res.status(404).json({ message: 'Fazenda não encontrada.' });
        }

        let validDonorAnimalId = null;
        if (donorAnimalId) {
            const donor = await findInventoryAnimal({ id: donorAnimalId, farmId: farm.id });
            if (!donor) {
                return res.status(404).json({ message: 'Doadora não encontrada no rebanho.' });
            }
            validDonorAnimalId = donor.id;
        }

        let validDonorId = null;
        if (donorPoAnimalId) {
            const donor = await findLegacyPoAnimal({ id: donorPoAnimalId, farmId: farm.id });
            if (!donor) {
                return res.status(404).json({ message: 'Doadora P.O. não encontrada.' });
            }
            validDonorId = donor.id;
        }

        let validSireAnimalId = null;
        if (sireAnimalId) {
            const sire = await findInventoryAnimal({ id: sireAnimalId, farmId: farm.id });
            if (!sire) {
                return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
            }
            validSireAnimalId = sire.id;
        }

        let validSireId = null;
        if (sirePoAnimalId) {
            const sire = await findLegacyPoAnimal({ id: sirePoAnimalId, farmId: farm.id });
            if (!sire) {
                return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
            }
            validSireId = sire.id;
        }

        if (!validDonorAnimalId && !validDonorId && !trimmedDonorName) {
            return res.status(400).json({ message: 'Informe o nome da doadora externa.' });
        }
        if (!validSireAnimalId && !validSireId && !trimmedSireName) {
            return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
        }

        const batch = await prisma.embryoBatch.create({
            data: {
                farmId: farm.id,
                donorAnimalId: validDonorAnimalId,
                donorPoAnimalId: validDonorId,
                donorName: validDonorAnimalId || validDonorId ? null : trimmedDonorName,
                donorRegistry: validDonorAnimalId || validDonorId ? null : trimmedDonorRegistry || null,
                sireAnimalId: validSireAnimalId,
                sirePoAnimalId: validSireId,
                sireName: validSireAnimalId || validSireId ? null : trimmedSireName,
                sireRegistry: validSireAnimalId || validSireId ? null : trimmedSireRegistry || null,
                tecnica: tecnicaEnum,
                estagio: trimmedEstagio || null,
                qualidade: trimmedQualidade || null,
                lote: lote.trim(),
                quantidadeTotal: totalValue,
                quantidadeDisponivel: availableValue,
                localArmazenamento: trimmedLocal || null,
                observacoes: trimmedObservacoes || null,
            },
        });

        return res.status(201).json({ batch: serializeEmbryoBatch({ ...batch, donorAnimal: null, donorPoAnimal: null, sireAnimal: null, sirePoAnimal: null }) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar embriões.' });
    }
});

app.patch('/po/embryos/:id', async (req, res) => {
    const { id } = req.params;
    const {
        donorAnimalId,
        donorPoAnimalId,
        donorName,
        donorRegistry,
        sireAnimalId,
        sirePoAnimalId,
        sireName,
        sireRegistry,
        tecnica,
        estagio,
        qualidade,
        lote,
        quantidadeTotal,
        quantidadeDisponivel,
        localArmazenamento,
        observacoes,
    } = req.body || {};

    try {
        const batch = await prisma.embryoBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de embriões não encontrado.' });
        }

        const updates = {};
        const trimmedDonorName = typeof donorName === 'string' ? donorName.trim() : '';
        const trimmedSireName = typeof sireName === 'string' ? sireName.trim() : '';
        const trimmedDonorRegistry = typeof donorRegistry === 'string' ? donorRegistry.trim() : '';
        const trimmedSireRegistry = typeof sireRegistry === 'string' ? sireRegistry.trim() : '';
        const trimmedEstagio = typeof estagio === 'string' ? estagio.trim() : '';
        const trimmedQualidade = typeof qualidade === 'string' ? qualidade.trim() : '';
        const trimmedLocal = typeof localArmazenamento === 'string' ? localArmazenamento.trim() : '';
        const trimmedObservacoes = typeof observacoes === 'string' ? observacoes.trim() : '';

        let nextDonorAnimalId = batch.donorAnimalId;
        if (donorAnimalId !== undefined) {
            nextDonorAnimalId = donorAnimalId ? String(donorAnimalId) : null;
            if (nextDonorAnimalId) {
                const donor = await findInventoryAnimal({ id: nextDonorAnimalId, farmId: batch.farmId });
                if (!donor) {
                    return res.status(404).json({ message: 'Doadora não encontrada no rebanho.' });
                }
                updates.donorAnimalId = donor.id;
                updates.donorPoAnimalId = null;
                updates.donorName = donorName !== undefined ? trimmedDonorName || null : null;
                updates.donorRegistry = donorRegistry !== undefined ? trimmedDonorRegistry || null : null;
            } else {
                updates.donorAnimalId = null;
            }
        }

        let nextDonorId = donorAnimalId !== undefined && donorAnimalId ? null : batch.donorPoAnimalId;
        if (donorPoAnimalId !== undefined) {
            nextDonorId = donorPoAnimalId ? String(donorPoAnimalId) : null;
            if (nextDonorId) {
                const donor = await findLegacyPoAnimal({ id: nextDonorId, farmId: batch.farmId });
                if (!donor) {
                    return res.status(404).json({ message: 'Doadora P.O. não encontrada.' });
                }
                updates.donorPoAnimalId = donor.id;
                updates.donorAnimalId = null;
                updates.donorName = donorName !== undefined ? trimmedDonorName || null : null;
                updates.donorRegistry = donorRegistry !== undefined ? trimmedDonorRegistry || null : null;
            } else {
                updates.donorPoAnimalId = null;
            }
        }

        let nextSireAnimalId = batch.sireAnimalId;
        if (sireAnimalId !== undefined) {
            nextSireAnimalId = sireAnimalId ? String(sireAnimalId) : null;
            if (nextSireAnimalId) {
                const sire = await findInventoryAnimal({ id: nextSireAnimalId, farmId: batch.farmId });
                if (!sire) {
                    return res.status(404).json({ message: 'Reprodutor não encontrado no rebanho.' });
                }
                updates.sireAnimalId = sire.id;
                updates.sirePoAnimalId = null;
                updates.sireName = sireName !== undefined ? trimmedSireName || null : null;
                updates.sireRegistry = sireRegistry !== undefined ? trimmedSireRegistry || null : null;
            } else {
                updates.sireAnimalId = null;
            }
        }

        let nextSireId = sireAnimalId !== undefined && sireAnimalId ? null : batch.sirePoAnimalId;
        if (sirePoAnimalId !== undefined) {
            nextSireId = sirePoAnimalId ? String(sirePoAnimalId) : null;
            if (nextSireId) {
                const sire = await findLegacyPoAnimal({ id: nextSireId, farmId: batch.farmId });
                if (!sire) {
                    return res.status(404).json({ message: 'Reprodutor P.O. não encontrado.' });
                }
                updates.sirePoAnimalId = sire.id;
                updates.sireAnimalId = null;
                updates.sireName = sireName !== undefined ? trimmedSireName || null : null;
                updates.sireRegistry = sireRegistry !== undefined ? trimmedSireRegistry || null : null;
            } else {
                updates.sirePoAnimalId = null;
            }
        }

        if (nextDonorAnimalId === null && nextDonorId === null) {
            const nextName = donorName !== undefined ? trimmedDonorName : batch.donorName;
            if (!nextName) {
                return res.status(400).json({ message: 'Informe o nome da doadora externa.' });
            }
            if (donorName !== undefined) {
                updates.donorName = trimmedDonorName || null;
            }
            if (donorRegistry !== undefined) {
                updates.donorRegistry = trimmedDonorRegistry || null;
            }
        }

        if (nextSireAnimalId === null && nextSireId === null) {
            const nextName = sireName !== undefined ? trimmedSireName : batch.sireName;
            if (!nextName) {
                return res.status(400).json({ message: 'Informe o nome do reprodutor externo.' });
            }
            if (sireName !== undefined) {
                updates.sireName = trimmedSireName || null;
            }
            if (sireRegistry !== undefined) {
                updates.sireRegistry = trimmedSireRegistry || null;
            }
        }

        if (tecnica !== undefined) {
            const tecnicaEnum = normalizeEmbryoTechnique(tecnica);
            if (!tecnicaEnum) {
                return res.status(400).json({ message: 'Técnica inválida.' });
            }
            updates.tecnica = tecnicaEnum;
        }

        if (lote !== undefined) {
            if (!lote?.trim()) {
                return res.status(400).json({ message: 'Lote inválido.' });
            }
            updates.lote = lote.trim();
        }

        const totalValue = quantidadeTotal !== undefined ? parseInteger(quantidadeTotal) : batch.quantidadeTotal;
        const availableValue = quantidadeDisponivel !== undefined ? parseInteger(quantidadeDisponivel) : batch.quantidadeDisponivel;
        if (quantidadeTotal !== undefined && (!totalValue || totalValue <= 0)) {
            return res.status(400).json({ message: 'Quantidade total inválida.' });
        }
        if (quantidadeDisponivel !== undefined && (availableValue === null || availableValue < 0)) {
            return res.status(400).json({ message: 'Quantidade disponível inválida.' });
        }
        if (availableValue > totalValue) {
            return res.status(400).json({ message: 'Quantidade disponível não pode exceder o total.' });
        }

        if (quantidadeTotal !== undefined) {
            updates.quantidadeTotal = totalValue;
        }
        if (quantidadeDisponivel !== undefined) {
            updates.quantidadeDisponivel = availableValue;
        }

        if (estagio !== undefined) {
            updates.estagio = trimmedEstagio || null;
        }
        if (qualidade !== undefined) {
            updates.qualidade = trimmedQualidade || null;
        }
        if (localArmazenamento !== undefined) {
            updates.localArmazenamento = trimmedLocal || null;
        }
        if (observacoes !== undefined) {
            updates.observacoes = trimmedObservacoes || null;
        }

        const updated = await prisma.embryoBatch.update({
            where: { id: batch.id },
            data: updates,
        });

        const updatedWithRelations = await prisma.embryoBatch.findUnique({
            where: { id: updated.id },
            include: { donorAnimal: true, donorPoAnimal: true, sireAnimal: true, sirePoAnimal: true },
        });

        return res.json({ batch: serializeEmbryoBatch(updatedWithRelations) });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Lote já cadastrado para esta fazenda.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao atualizar embriões.' });
    }
});

app.post('/po/embryos/:id/move', async (req, res) => {
    const { id } = req.params;
    const { date, qty, type, notes } = req.body || {};

    const moveType = normalizeEmbryoMoveType(type);
    if (!moveType) {
        return res.status(400).json({ message: 'Tipo de movimentação inválido.' });
    }

    const qtyValue = parseInteger(qty);
    if (qtyValue === null || qtyValue === 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }
    if (moveType !== 'ADJUST' && qtyValue < 0) {
        return res.status(400).json({ message: 'Quantidade inválida.' });
    }

    const moveDate = parseDateValue(date);
    if (!moveDate) {
        return res.status(400).json({ message: 'Data inválida.' });
    }

    try {
        const batch = await prisma.embryoBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de embriões não encontrado.' });
        }

        const delta = moveType === 'IN'
            ? qtyValue
            : moveType === 'OUT' || moveType === 'TRANSFER'
                ? -qtyValue
                : qtyValue;

        const nextAvailable = batch.quantidadeDisponivel + delta;
        if (nextAvailable < 0 || nextAvailable > batch.quantidadeTotal) {
            return res.status(400).json({ message: 'Saldo disponível inválido para a movimentação.' });
        }

        const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';

        const [move] = await prisma.$transaction([
            prisma.embryoMove.create({
                data: {
                    embryoBatchId: batch.id,
                    date: moveDate,
                    qty: qtyValue,
                    type: moveType,
                    notes: trimmedNotes || null,
                },
            }),
            prisma.embryoBatch.update({
                where: { id: batch.id },
                data: { quantidadeDisponivel: nextAvailable },
            }),
        ]);

        return res.json({
            move: {
                id: move.id,
                embryoBatchId: move.embryoBatchId,
                date: move.date.toISOString(),
                qty: move.qty,
                type: move.type,
                notes: move.notes,
            },
            quantidadeDisponivel: nextAvailable,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar embriões.' });
    }
});

app.delete('/po/embryos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const batch = await prisma.embryoBatch.findFirst({
            where: { id: String(id), farm: buildFarmRelationFilter(req) },
        });
        if (!batch) {
            return res.status(404).json({ message: 'Lote de embriões não encontrado.' });
        }

        const moveCount = await prisma.embryoMove.count({
            where: { embryoBatchId: batch.id },
        });
        if (moveCount > 0) {
            return res.status(409).json({ message: 'Lote possui movimentações.' });
        }
        if (batch.quantidadeDisponivel !== batch.quantidadeTotal) {
            return res.status(409).json({ message: 'Lote possui saldo diferente do total.' });
        }

        await prisma.embryoBatch.delete({ where: { id: batch.id } });
        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir lote de embriões.' });
    }
});
app.post('/po/animals/bulk-delete', async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos um animal P.O.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.poAnimal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais P.O. não pertencem a esta conta.' });
        }
        await prisma.poAnimal.deleteMany({ where: { id: { in: ids.map(String) } } });
        return res.json({ deleted: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir animais P.O.' });
    }
});

app.post('/po/animals/bulk-move-lot', async (req, res) => {
    const { ids, lotId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos um animal P.O.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.poAnimal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true, farmId: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais P.O. não pertencem a esta conta.' });
        }
        if (lotId) {
            const farmId = animals[0].farmId;
            const lot = await prisma.poLot.findFirst({ where: { id: String(lotId), farmId } });
            if (!lot) return res.status(404).json({ message: 'Lote P.O. não encontrado.' });
        }
        await prisma.poAnimal.updateMany({
            where: { id: { in: ids.map(String) } },
            data: { lotId: lotId ? String(lotId) : null },
        });
        return res.json({ updated: ids.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao mover animais P.O. para lote.' });
    }
});

app.post('/po/animals/bulk-move-pasto', async (req, res) => {
    const { ids, pastoId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || !pastoId) {
        return res.status(400).json({ message: 'Informe ao menos um animal P.O. e o pasto.' });
    }
    try {
        const filter = buildFarmRelationFilter(req);
        const animals = await prisma.poAnimal.findMany({
            where: { id: { in: ids.map(String) }, farm: filter },
            select: { id: true },
        });
        if (animals.length !== ids.length) {
            return res.status(403).json({ message: 'Um ou mais animais P.O. não pertencem a esta conta.' });
        }
        const results = [];
        for (const animal of animals) {
            const { error, result } = await moveAnimalBetweenPaddocks({
                animalId: animal.id,
                paddockId: String(pastoId),
                scopeFilter: filter,
                isPo: true,
            });
            if (!error) results.push(result);
        }
        return res.json({ updated: results.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao mover animais P.O. para pasto.' });
    }
});

app.post('/po/animals/bulk-transfer-farm', async (req, res) => {
    const { ids, targetFarmId, targetPaddockId, transferDate, notes } = req.body || {};
    try {
        const { error, result } = await transferAnimalsToFarm({
            ids,
            targetFarmId,
            targetPaddockId,
            transferDate,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            farmScopeFilter: buildFarmScopeFilter(req, { id: String(targetFarmId || '') }),
            isPo: true,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        return res.json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao transferir animais P.O. para outra fazenda.' });
    }
});
app.get('/po/animals/:id/paddock-moves', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }

        const moves = await prisma.paddockMove.findMany({
            where: { poAnimalId: id },
            include: { paddock: true },
            orderBy: { startAt: 'desc' },
        });

        const items = moves.map(serializePaddockMove);
        return res.json({ moves: items, items, total: items.length });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar movimentações de pasto.' });
    }
});

app.post('/po/animals/:id/paddock-moves', async (req, res) => {
    const { id } = req.params;
    const { paddockId, startAt, notes } = req.body || {};

    try {
        if (!paddockId) {
            return res.status(400).json({ message: 'Pasto obrigatório para movimentação.' });
        }
        const { error, result } = await moveAnimalBetweenPaddocks({
            animalId: id,
            paddockId,
            startAt,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: true,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        const payload = serializePaddockMove(result.move);
        return res.status(201).json({
            move: { ...payload, fromPaddockId: result.fromPaddockId, toPaddockId: result.toPaddockId },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar animal entre pastos.' });
    }
});

app.post('/animals/:id/move-pasto', async (req, res) => {
    const { id } = req.params;
    const { pastoId, paddockId, date, startAt, notes, farmId } = req.body || {};
    const targetPaddockId = pastoId || paddockId;
    if (!targetPaddockId) {
        return res.status(400).json({ message: 'Pasto obrigatório para movimentação.' });
    }
    try {
        if (farmId) {
            const animal = await prisma.animal.findFirst({
                where: { id, farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal não encontrado para a fazenda informada.' });
            }
        }
        const { error, result } = await moveAnimalBetweenPaddocks({
            animalId: id,
            paddockId: targetPaddockId,
            startAt: startAt || date,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: false,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        const payload = serializePaddockMove(result.move);
        return res.status(201).json({
            item: { ...payload, fromPaddockId: result.fromPaddockId, toPaddockId: result.toPaddockId },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar animal entre pastos.' });
    }
});

app.post('/po/animals/:id/move-pasto', async (req, res) => {
    const { id } = req.params;
    const { pastoId, paddockId, date, startAt, notes, farmId } = req.body || {};
    const targetPaddockId = pastoId || paddockId;
    if (!targetPaddockId) {
        return res.status(400).json({ message: 'Pasto obrigatório para movimentação.' });
    }
    try {
        if (farmId) {
            const animal = await prisma.poAnimal.findFirst({
                where: { id, farmId: String(farmId), farm: buildFarmRelationFilter(req) },
            });
            if (!animal) {
                return res.status(404).json({ message: 'Animal P.O. não encontrado para a fazenda informada.' });
            }
        }
        const { error, result } = await moveAnimalBetweenPaddocks({
            animalId: id,
            paddockId: targetPaddockId,
            startAt: startAt || date,
            notes,
            scopeFilter: buildFarmRelationFilter(req),
            isPo: true,
        });
        if (error) {
            return res.status(error.status).json({ message: error.message });
        }
        const payload = serializePaddockMove(result.move);
        return res.status(201).json({
            item: { ...payload, fromPaddockId: result.fromPaddockId, toPaddockId: result.toPaddockId },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao movimentar animal entre pastos.' });
    }
});
app.patch('/farms/:farmId/weighings/:weighingId', requireAuth, async (req, res) => {
    const { farmId, weighingId } = req.params;
    const { animalId, data, peso } = req.body || {};

    const weighingDate = parseDateValue(data);
    if (!weighingDate) {
        return res.status(400).json({ message: 'Data da pesagem inválida.' });
    }
    const parsedPeso = parseNumber(peso);
    if (parsedPeso === null || parsedPeso <= 0) {
        return res.status(400).json({ message: 'Peso da pesagem inválido.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const weighing = await prisma.weighing.findFirst({
            where: { id: weighingId, animal: { farmId: farm.id } },
            select: { id: true, animalId: true, weighingSessionId: true },
        });
        if (!weighing) return res.status(404).json({ message: 'Pesagem não encontrada.' });

        const targetAnimalId = String(animalId || weighing.animalId);
        const targetAnimal = await prisma.animal.findFirst({
            where: { id: targetAnimalId, farmId: farm.id },
            select: { id: true },
        });
        if (!targetAnimal) return res.status(400).json({ message: 'Animal inválido para esta fazenda.' });

        const updated = await prisma.$transaction(async (tx) => {
            await tx.weighing.update({
                where: { id: weighing.id },
                data: {
                    animalId: targetAnimalId,
                    data: weighingDate,
                    peso: parsedPeso,
                },
            });

            await recalculateAnimalWeighingChain(tx, targetAnimalId);
            if (weighing.animalId !== targetAnimalId) {
                await recalculateAnimalWeighingChain(tx, weighing.animalId);
            }

            return tx.weighing.findUnique({
                where: { id: weighing.id },
                include: {
                    animal: { select: { id: true, brinco: true, categoria: true } },
                },
            });
        });

        return res.json({
            weighing: {
                id: updated.id,
                date: updated.data.toISOString(),
                weightKg: updated.peso,
                gmd: updated.gmd,
                animal: {
                    id: updated.animal.id,
                    brinco: updated.animal.brinco,
                    categoria: updated.animal.categoria || null,
                },
            },
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe pesagem cadastrada nesta data para este animal.' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Erro ao editar pesagem.' });
    }
});

app.delete('/farms/:farmId/weighings/:weighingId', requireAuth, async (req, res) => {
    const { farmId, weighingId } = req.params;
    const { masterPassword } = req.body || {};

    if (!masterPassword || String(masterPassword).trim().length < 1) {
        return res.status(400).json({ message: 'Informe a senha do usuário master.' });
    }

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const weighing = await prisma.weighing.findFirst({
            where: { id: weighingId, animal: { farmId: farm.id } },
            select: { id: true, animalId: true },
        });
        if (!weighing) return res.status(404).json({ message: 'Pesagem não encontrada.' });

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(403).json({ message: 'Organização não identificada para validação.' });
        }

        const owners = await prisma.organizationMembership.findMany({
            where: { organizationId, role: 'OWNER' },
            select: {
                user: { select: { id: true, password: true } },
            },
        });

        let authorized = false;
        for (const owner of owners) {
            if (await verifyPasswordWithLegacySupport(owner.user, String(masterPassword))) {
                authorized = true;
                break;
            }
        }

        if (!authorized) {
            return res.status(401).json({ message: 'Senha do usuário master inválida.' });
        }

        await prisma.$transaction(async (tx) => {
            await tx.weighing.delete({ where: { id: weighing.id } });
            await recalculateAnimalWeighingChain(tx, weighing.animalId);
        });

        return res.json({ ok: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao excluir pesagem.' });
    }
});


// ── Pesagens da fazenda (listagem central) ──────────────────────────────────
function serializeWeighingSession(s) {
    return {
        id: s.id,
        name: s.name,
        responsibleName: s.responsibleName ?? null,
        farmId: s.farmId,
        createdAt: s.createdAt,
        weighingsCount: s._count?.weighings ?? undefined,
    };
}

app.post('/farms/:farmId/weighing-sessions', requireAuth, async (req, res) => {
    try {
        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const { name, responsibleName } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: 'Nome da sessão é obrigatório.' });

        const session = await prisma.weighingSession.create({
            data: {
                name: name.trim(),
                responsibleName: responsibleName?.trim() ? responsibleName.trim() : null,
                farmId: farm.id,
            },
        });
        res.status(201).json(serializeWeighingSession(session));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao criar sessão.' });
    }
});

app.get('/farms/:farmId/weighing-sessions', requireAuth, async (req, res) => {
    try {
        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const sessions = await prisma.weighingSession.findMany({
            where: { farmId: farm.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { _count: { select: { weighings: true } } },
        });
        res.json({ sessions: sessions.map(serializeWeighingSession) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao listar sessões.' });
    }
});

app.patch('/farms/:farmId/weighing-sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const session = await prisma.weighingSession.findFirst({
            where: { id: req.params.sessionId, farmId: farm.id },
        });
        if (!session) return res.status(404).json({ message: 'Sessão de pesagem não encontrada.' });

        const { name, responsibleName } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ message: 'Nome da sessão é obrigatório.' });
        if (!responsibleName?.trim()) return res.status(400).json({ message: 'Responsável é obrigatório.' });

        const updated = await prisma.weighingSession.update({
            where: { id: session.id },
            data: {
                name: name.trim(),
                responsibleName: responsibleName.trim(),
            },
            include: { _count: { select: { weighings: true } } },
        });

        return res.json(serializeWeighingSession(updated));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao editar sessão.' });
    }
});

app.delete('/farms/:farmId/weighing-sessions/:sessionId', requireAuth, async (req, res) => {
    try {
        const { masterPassword } = req.body || {};
        if (!masterPassword || String(masterPassword).trim().length < 1) {
            return res.status(400).json({ message: 'Informe a senha do usuário master.' });
        }

        const scopeFilter = buildFarmScopeFilter(req);
        const farm = await prisma.farm.findFirst({ where: { id: req.params.farmId, ...scopeFilter } });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const session = await prisma.weighingSession.findFirst({
            where: { id: req.params.sessionId, farmId: farm.id },
        });
        if (!session) return res.status(404).json({ message: 'Sessão de pesagem não encontrada.' });

        const organizationId = req.saas?.organizationId || null;
        if (!organizationId) {
            return res.status(403).json({ message: 'Organização não identificada para validação.' });
        }

        const owners = await prisma.organizationMembership.findMany({
            where: { organizationId, role: 'OWNER' },
            select: {
                user: { select: { id: true, password: true } },
            },
        });

        let authorized = false;
        for (const owner of owners) {
            if (await verifyPasswordWithLegacySupport(owner.user, String(masterPassword))) {
                authorized = true;
                break;
            }
        }

        if (!authorized) {
            return res.status(401).json({ message: 'Senha do usuário master inválida.' });
        }

        await prisma.weighingSession.delete({
            where: { id: session.id },
        });

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao excluir sessão.' });
    }
});

app.get('/farms/:farmId/weighing-sessions/summary', requireAuth, async (req, res) => {
    const { farmId } = req.params;
    const { limit = 30, offset = 0, lotId, startDate, endDate, search } = req.query;

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const where = { farmId: farm.id };
        if (search) where.name = { contains: String(search), mode: 'insensitive' };

        const take = Math.min(Math.max(parseInt(String(limit), 10) || 30, 1), 200);
        const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

        const [total, sessions] = await Promise.all([
            prisma.weighingSession.count({ where }),
            prisma.weighingSession.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
                skip,
                include: {
                    weighings: {
                        include: {
                            animal: {
                                select: {
                                    id: true,
                                    lotId: true,
                                    lot: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        const startFilter = startDate ? new Date(String(startDate)) : null;
        const endFilter = endDate ? new Date(String(endDate)) : null;
        if (endFilter) endFilter.setHours(23, 59, 59, 999);

        const mapped = sessions
            .map((session) => {
                const weighings = session.weighings || [];
                if (weighings.length === 0) {
                    return {
                        sessionId: session.id,
                        sessionName: session.name,
                        sessionType: 'INDIVIDUAL',
                        sessionDateTime: session.createdAt.toISOString(),
                        farmId: farm.id,
                        farmName: farm.name,
                        lotId: null,
                        lotName: null,
                        animalsCount: 0,
                        totalWeightKg: 0,
                        averageWeightKg: null,
                        responsibleUserId: null,
                        responsibleUserName: session.responsibleName ?? null,
                    };
                }

                const animalIds = new Set(weighings.map((item) => item.animalId));
                const lotMap = new Map();
                weighings.forEach((item) => {
                    if (item.animal?.lot?.id) {
                        lotMap.set(item.animal.lot.id, item.animal.lot.name);
                    }
                });
                const totalWeightKg = weighings.reduce((sum, item) => sum + (item.peso || 0), 0);
                const animalsCount = animalIds.size;
                const averageWeightKg = animalsCount > 0 ? totalWeightKg / animalsCount : null;
                const sessionDate = weighings.reduce((latest, item) => (
                    !latest || item.data > latest ? item.data : latest
                ), null) || session.createdAt;
                const sessionType = animalsCount > 1 ? 'GROUP' : 'INDIVIDUAL';
                let lotName = null;
                let lotIdValue = null;
                if (lotMap.size === 1) {
                    const [firstLotId, firstLotName] = Array.from(lotMap.entries())[0];
                    lotIdValue = firstLotId;
                    lotName = firstLotName;
                } else if (lotMap.size > 1) {
                    lotName = 'Múltiplos lotes';
                }

                return {
                    sessionId: session.id,
                    sessionName: session.name,
                    sessionType,
                    sessionDateTime: sessionDate.toISOString(),
                    farmId: farm.id,
                    farmName: farm.name,
                    lotId: lotIdValue,
                    lotName,
                    animalsCount,
                    totalWeightKg,
                    averageWeightKg,
                    responsibleUserId: null,
                    responsibleUserName: session.responsibleName ?? null,
                };
            })
            .filter((session) => {
                if (lotId && session.lotId !== String(lotId)) return false;
                if (startFilter && new Date(session.sessionDateTime) < startFilter) return false;
                if (endFilter && new Date(session.sessionDateTime) > endFilter) return false;
                return true;
            });

        return res.json({ total, sessions: mapped });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar resumo de sessões de pesagem.' });
    }
});

app.get('/farms/:farmId/weighing-sessions/:sessionId/items', requireAuth, async (req, res) => {
    const { farmId, sessionId } = req.params;
    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const session = await prisma.weighingSession.findFirst({
            where: { id: sessionId, farmId: farm.id },
        });
        if (!session) return res.status(404).json({ message: 'Sessão de pesagem não encontrada.' });

        const weighings = await prisma.weighing.findMany({
            where: { weighingSessionId: session.id, animal: { farmId: farm.id } },
            orderBy: { data: 'desc' },
            include: {
                animal: {
                    select: {
                        id: true,
                        brinco: true,
                        categoria: true,
                        lot: { select: { id: true, name: true } },
                    },
                },
            },
        });

        const animalIds = [...new Set(weighings.map((item) => item.animalId))];
        const previousMap = {};
        await Promise.all(
            animalIds.map(async (animalId) => {
                const history = await prisma.weighing.findMany({
                    where: { animalId },
                    orderBy: { data: 'asc' },
                    select: { id: true, data: true, peso: true },
                });
                previousMap[animalId] = history;
            }),
        );

        const totalWeightKg = weighings.reduce((sum, item) => sum + (item.peso || 0), 0);
        const animalsCount = animalIds.length;
        const averageWeightKg = animalsCount > 0 ? totalWeightKg / animalsCount : null;
        const sessionDate = weighings.reduce((latest, item) => (
            !latest || item.data > latest ? item.data : latest
        ), null) || session.createdAt;
        const lotMap = new Map();
        weighings.forEach((item) => {
            if (item.animal?.lot?.id) {
                lotMap.set(item.animal.lot.id, item.animal.lot.name);
            }
        });
        const lotName = lotMap.size === 1
            ? Array.from(lotMap.values())[0]
            : lotMap.size > 1
                ? 'Múltiplos lotes'
                : null;

        return res.json({
            session: {
                sessionId: session.id,
                sessionName: session.name,
                sessionType: animalsCount > 1 ? 'GROUP' : 'INDIVIDUAL',
                sessionDateTime: sessionDate.toISOString(),
                farmName: farm.name,
                lotName,
                animalsCount,
                totalWeightKg,
                averageWeightKg,
                responsibleUserName: session.responsibleName ?? null,
            },
            items: weighings.map((item) => {
                const history = previousMap[item.animalId] || [];
                const idx = history.findIndex((h) => h.id === item.id);
                const prev = idx > 0 ? history[idx - 1] : null;
                return {
                    weighingId: item.id,
                    animalId: item.animal.id,
                    animalCode: item.animal.brinco,
                    animalName: null,
                    category: item.animal.categoria || null,
                    weightKg: item.peso,
                    previousWeightKg: prev ? prev.peso : null,
                    gainKg: prev ? item.peso - prev.peso : null,
                    gmd: item.gmd,
                    weighedAt: item.data.toISOString(),
                };
            }),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar itens da sessão de pesagem.' });
    }
});

app.get('/farms/:farmId/weighings', async (req, res) => {
    const { farmId } = req.params;
    const { limit = 50, offset = 0, animalId, startDate, endDate, lotId, weighingSessionId } = req.query;

    try {
        const farm = await prisma.farm.findFirst({
            where: { id: farmId, ...buildFarmRelationFilter(req) },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });

        const where = { animal: { farmId } };
        if (animalId) where.animalId = String(animalId);
        if (lotId) where.animal = { ...where.animal, lotId: String(lotId) };
        if (weighingSessionId) where.weighingSessionId = String(weighingSessionId);
        if (startDate || endDate) {
            where.data = {};
            if (startDate) where.data.gte = new Date(String(startDate));
            if (endDate) {
                const end = new Date(String(endDate));
                end.setHours(23, 59, 59, 999);
                where.data.lte = end;
            }
        }

        const take = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
        const skip = Math.max(parseInt(String(offset), 10) || 0, 0);

        const [total, weighings] = await Promise.all([
            prisma.weighing.count({ where }),
            prisma.weighing.findMany({
                where,
                orderBy: { data: 'desc' },
                take,
                skip,
                include: {
                    animal: {
                        select: {
                            id: true,
                            brinco: true,
                            raca: true,
                            sexo: true,
                            categoria: true,
                            lotId: true,
                            lot: { select: { name: true } },
                        },
                    },
                    weighingSession: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            }),
        ]);

        // Para cada pesagem, buscar o peso anterior do mesmo animal
        const animalIds = [...new Set(weighings.map((w) => w.animalId))];
        const previousMap = {};
        await Promise.all(
            animalIds.map(async (aid) => {
                const allForAnimal = await prisma.weighing.findMany({
                    where: { animalId: aid },
                    orderBy: { data: 'asc' },
                    select: { id: true, data: true, peso: true },
                });
                previousMap[aid] = allForAnimal;
            }),
        );

        // Calcular stats em uma única query (sem filtros de paginação)
        const allWeighingsForStats = await prisma.weighing.findMany({
            where: { animal: { farmId } },
            select: { data: true, gmd: true, animalId: true },
        });
        const todayStr = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const statsGmds = allWeighingsForStats.map((w) => w.gmd).filter((g) => g != null);
        const stats = {
            todayCount: allWeighingsForStats.filter((w) => w.data.toISOString().slice(0, 10) === todayStr).length,
            weekCount: allWeighingsForStats.filter((w) => w.data >= weekAgo).length,
            uniqueAnimals: new Set(allWeighingsForStats.map((w) => w.animalId)).size,
            avgGmd: statsGmds.length ? statsGmds.reduce((a, b) => a + b, 0) / statsGmds.length : null,
        };

        return res.json({
            total,
            stats,
            weighings: weighings.map((w) => {
                const animalHistory = previousMap[w.animalId] || [];
                const idx = animalHistory.findIndex((h) => h.id === w.id);
                const prev = idx > 0 ? animalHistory[idx - 1] : null;
                return {
                    id: w.id,
                    date: w.data.toISOString(),
                    weightKg: w.peso,
                    gmd: w.gmd,
                    weighingSessionId: w.weighingSessionId,
                    weighingSessionName: w.weighingSession?.name || null,
                    previousWeightKg: prev ? prev.peso : null,
                    gainKg: prev ? w.peso - prev.peso : null,
                    animal: {
                        id: w.animal.id,
                        brinco: w.animal.brinco,
                        raca: w.animal.raca,
                        sexo: w.animal.sexo,
                        categoria: w.animal.categoria,
                        lotId: w.animal.lotId,
                        lotName: w.animal.lot?.name || null,
                    },
                };
            }),
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Erro ao listar pesagens da fazenda.' });
    }
});
}
