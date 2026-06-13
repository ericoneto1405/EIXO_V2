import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseNumber, parseDateValue } from '../utils/formatters.js';
import { logActivity } from '../utils/activityLog.js';
import { serializeHerdEvent, serializeSanitaryRecord } from '../utils/serializers.js';
import { HERD_EVENT_CATEGORY_MAP, SANITARY_CATEGORY_MAP } from '../config/env.js';
const prisma = new PrismaClient();

const VALID_EVENT_TYPES = ['NASCIMENTO', 'COMPRA', 'VENDA', 'MORTE'];
const VALID_SANITARY_TIPOS = ['VACINA', 'VERMIFUGO', 'TRATAMENTO'];

export function registerHerdRoutes(app) {
app.get('/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const events = await prisma.herdEvent.findMany({
            where: { animalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ events: events.map(serializeHerdEvent) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar eventos.' });
    }
});

app.post('/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    const { type, date, peso, valor, origem, destino, observacoes } = req.body || {};

    if (!VALID_EVENT_TYPES.includes(type?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use NASCIMENTO, COMPRA, VENDA ou MORTE.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do evento inválida.' });
    }

    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const eventType = type.toUpperCase();
        const event = await prisma.herdEvent.create({
            data: {
                farmId: animal.farmId,
                animalId: id,
                type: eventType,
                date: eventDate,
                peso: parseNumber(peso),
                valor: parseNumber(valor),
                origem: origem?.trim() || null,
                destino: destino?.trim() || null,
                observacoes: observacoes?.trim() || null,
            },
        });

        // Auto-lançamento financeiro para COMPRA e VENDA
        const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
        if (financialMap && valor) {
            const parsedValor = parseNumber(valor);
            if (parsedValor && parsedValor > 0) {
                await prisma.financialTransaction.create({
                    data: {
                        farmId: animal.farmId,
                        type: financialMap.type,
                        categoria: financialMap.categoria,
                        accountCategoryId: financialMap.categoryId,
                        valor: parsedValor,
                        data: eventDate,
                        descricao: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} de animal — ${animal.brinco || id}`,
                        herdEventId: event.id,
                        status: 'PAGO',
                    },
                });
            }
        }

        const eventLabels = { COMPRA: 'Registrou compra', VENDA: 'Registrou venda', MORTE: 'Registrou morte', NASCIMENTO: 'Registrou nascimento' };
        const label = eventLabels[eventType] || 'Registrou evento';
        const valorStr = parseNumber(valor) ? ` por R$ ${Number(parseNumber(valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '';
        logActivity(req, { action: `ANIMAL_${eventType}`, entity: 'Animal', entityId: id, description: `${label} do animal ${animal.brinco || id}${valorStr}`, farmId: animal.farmId });
        return res.status(201).json({ event: serializeHerdEvent(event) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar evento.' });
    }
});

// =============================================
// MANEJO SANITÁRIO — Rebanho Comercial
// =============================================

app.get('/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const records = await prisma.sanitaryRecord.findMany({
            where: { animalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ records: records.map(serializeSanitaryRecord) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar registros sanitários.' });
    }
});

app.post('/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    const { tipo, produto, date, dose, proximaAplicacao, observacoes, valorUnitario } = req.body || {};

    if (!VALID_SANITARY_TIPOS.includes(tipo?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use VACINA, VERMIFUGO ou TRATAMENTO.' });
    }
    if (!produto?.trim()) {
        return res.status(400).json({ message: 'Nome do produto é obrigatório.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do registro inválida.' });
    }

    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const tipoUpper = tipo.toUpperCase();
        const parsedValor = parseNumber(valorUnitario);
        const record = await prisma.sanitaryRecord.create({
            data: {
                farmId: animal.farmId,
                animalId: id,
                tipo: tipoUpper,
                produto: produto.trim(),
                date: eventDate,
                dose: dose?.trim() || null,
                proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null,
                valorUnitario: parsedValor || null,
            },
        });

        // Auto-lançamento financeiro se valorUnitario foi informado
        const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
        if (sanitaryMap && parsedValor && parsedValor > 0) {
            await prisma.financialTransaction.create({
                data: {
                    farmId: animal.farmId,
                    type: 'SAIDA',
                    categoria: sanitaryMap.categoria,
                    accountCategoryId: sanitaryMap.categoryId,
                    valor: parsedValor,
                    data: eventDate,
                    descricao: `${produto.trim()} — ${animal.brinco || id}`,
                    sanitaryRecordId: record.id,
                    status: 'PAGO',
                },
            });
        }

        return res.status(201).json({ record: serializeSanitaryRecord(record) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar registro sanitário.' });
    }
});

// =============================================
// EVENTOS DE INVENTÁRIO — Plantel P.O.
// =============================================

app.get('/po/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const events = await prisma.herdEvent.findMany({
            where: { poAnimalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ events: events.map(serializeHerdEvent) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar eventos.' });
    }
});

app.post('/po/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    const { type, date, peso, valor, origem, destino, observacoes } = req.body || {};

    if (!VALID_EVENT_TYPES.includes(type?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use NASCIMENTO, COMPRA, VENDA ou MORTE.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do evento inválida.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const eventType = type.toUpperCase();
        const event = await prisma.herdEvent.create({
            data: {
                farmId: animal.farmId,
                poAnimalId: id,
                type: eventType,
                date: eventDate,
                peso: parseNumber(peso),
                valor: parseNumber(valor),
                origem: origem?.trim() || null,
                destino: destino?.trim() || null,
                observacoes: observacoes?.trim() || null,
            },
        });

        const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
        if (financialMap && valor) {
            const parsedValor = parseNumber(valor);
            if (parsedValor && parsedValor > 0) {
                await prisma.financialTransaction.create({
                    data: {
                        farmId: animal.farmId,
                        type: financialMap.type,
                        categoria: financialMap.categoria,
                        accountCategoryId: financialMap.categoryId,
                        valor: parsedValor,
                        data: eventDate,
                        descricao: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} P.O. — ${animal.brinco || animal.nome || id}`,
                        herdEventId: event.id,
                        status: 'PAGO',
                    },
                });
            }
        }

        return res.status(201).json({ event: serializeHerdEvent(event) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar evento.' });
    }
});

// =============================================
// MANEJO SANITÁRIO — Plantel P.O.
// =============================================

app.get('/po/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const records = await prisma.sanitaryRecord.findMany({
            where: { poAnimalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ records: records.map(serializeSanitaryRecord) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar registros sanitários.' });
    }
});

app.post('/po/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    const { tipo, produto, date, dose, proximaAplicacao, observacoes, valorUnitario } = req.body || {};

    if (!VALID_SANITARY_TIPOS.includes(tipo?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use VACINA, VERMIFUGO ou TRATAMENTO.' });
    }
    if (!produto?.trim()) {
        return res.status(400).json({ message: 'Nome do produto é obrigatório.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do registro inválida.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const tipoUpper = tipo.toUpperCase();
        const parsedValor = parseNumber(valorUnitario);
        const record = await prisma.sanitaryRecord.create({
            data: {
                farmId: animal.farmId,
                poAnimalId: id,
                tipo: tipoUpper,
                produto: produto.trim(),
                date: eventDate,
                dose: dose?.trim() || null,
                proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null,
                valorUnitario: parsedValor || null,
            },
        });

        const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
        if (sanitaryMap && parsedValor && parsedValor > 0) {
            await prisma.financialTransaction.create({
                data: {
                    farmId: animal.farmId,
                    type: 'SAIDA',
                    categoria: sanitaryMap.categoria,
                    accountCategoryId: sanitaryMap.categoryId,
                    valor: parsedValor,
                    data: eventDate,
                    descricao: `${produto.trim()} P.O. — ${animal.brinco || animal.nome || id}`,
                    sanitaryRecordId: record.id,
                    status: 'PAGO',
                },
            });
        }

        return res.status(201).json({ record: serializeSanitaryRecord(record) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar registro sanitário.' });
    }
});
}
