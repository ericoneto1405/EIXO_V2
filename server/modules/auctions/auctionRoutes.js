import express from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ANIMAL_DOCUMENT_UPLOAD_ROOT } from '../config/env.js';
import { buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseDateValue, parseNumber } from '../utils/formatters.js';
import { logActivity } from '../utils/activityLog.js';
import { canUseDocumentReader, extractPdfText, hasEnoughText, readAuctionText } from './documentReader.js';

const prisma = new PrismaClient();

const DOCUMENT_TYPES = ['REGISTRO_ABCZ', 'CONTRATO', 'NOTA', 'CATALOGO', 'EXAME', 'OUTRO'];
const VALUATION_SOURCES = ['LEILAO', 'AVALIACAO', 'OFERTA'];
const DOCUMENT_MIMES = new Map([
    ['application/pdf', 'pdf'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
]);
// nginx aceita 10 MB por pedido; 7 MB de arquivo viram ~9,4 MB em base64.
const MAX_DOCUMENT_BYTES = 7 * 1024 * 1024;
const REVENUE_CLASSES = new Set(['OPERATING_REVENUE']);
// Parser grande só aqui, depois do login (ver ROTAS_JSON_GRANDE_PADRAO no index.js).
const parseLargeJson = express.json({ limit: '10mb' });

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const decodeBase64 = (value) => {
    const raw = String(value || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) return null;
    return Buffer.from(raw, 'base64');
};

// Vídeo só por link (YouTube, Vimeo, Drive etc.); arquivo de vídeo pesaria demais no servidor.
const normalizeVideoUrl = (value) => {
    const text = String(value || '').trim();
    if (!text) return null;
    try {
        const url = new URL(text);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
    } catch {
        return undefined;
    }
};

const findAnimal = (req, id, select) => prisma.animal.findFirst({
    where: { id, farm: buildFarmRelationFilter(req) },
    ...(select ? { select } : {}),
});

const partnerTotal = async (animalId, ignoreId) => {
    const partners = await prisma.animalPartner.findMany({
        where: { animalId, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
        select: { sharePct: true },
    });
    return partners.reduce((sum, p) => sum + Number(p.sharePct), 0);
};

const parsePartnerBody = (body = {}) => {
    const name = String(body.name || '').trim();
    const sharePct = parseNumber(body.sharePct);
    if (!name) return { error: 'Informe o nome do sócio.' };
    if (!(sharePct > 0) || sharePct > 100) return { error: 'A cota precisa ficar entre 0 e 100%.' };
    return {
        data: {
            name,
            sharePct: money(sharePct),
            isOwnFarm: Boolean(body.isOwnFarm),
            document: String(body.document || '').trim() || null,
            phone: String(body.phone || '').trim() || null,
            email: String(body.email || '').trim() || null,
            since: parseDateValue(body.since),
            notes: String(body.notes || '').trim() || null,
        },
    };
};

const serializePartner = (p) => ({
    id: p.id,
    name: p.name,
    document: p.document,
    phone: p.phone,
    email: p.email,
    sharePct: Number(p.sharePct),
    isOwnFarm: p.isOwnFarm,
    since: p.since ? p.since.toISOString() : null,
    notes: p.notes,
});

const serializeDocument = (d) => ({
    id: d.id,
    type: d.type,
    title: d.title,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt.toISOString(),
});

const serializeValuation = (v) => ({
    id: v.id,
    date: v.date.toISOString(),
    value: Number(v.value),
    source: v.source,
    notes: v.notes,
});

// Parte da fazenda: soma das cotas marcadas como "minha fazenda"; sem sócios cadastrados, 100%.
const ownSharePct = (partners) => {
    if (!partners.length) return 100;
    return partners.filter((p) => p.isOwnFarm).reduce((sum, p) => sum + Number(p.sharePct), 0);
};

// Compra e venda vêm dos eventos do Rebanho. Lançamentos do Financeiro ligados a esses
// eventos (parcelas, receita da venda, custo de aquisição) ficam de fora para não contar duas vezes.
const isTradeEntry = (entry) => Boolean(entry?.herdEventId || entry?.transaction?.herdEventId);

const sumEvents = (events, type) => events
    .filter((e) => e.type === type)
    .reduce((s, e) => s + Number(e.valor || 0), 0);

const buildMoneySummary = (tradeEvents, allocations, valuations, partners) => {
    const purchase = money(sumEvents(tradeEvents, 'COMPRA'));
    const sales = money(sumEvents(tradeEvents, 'VENDA'));
    let expenses = 0;
    let revenues = sales;
    for (const a of allocations) {
        if (a.resultEntry?.status !== 'ACTIVE' || isTradeEntry(a.resultEntry)) continue;
        if (REVENUE_CLASSES.has(a.resultEntry.resultClass)) revenues += Number(a.amount);
        else expenses += Number(a.amount);
    }
    const lastValuation = valuations[0] ? Number(valuations[0].value) : null;
    const invested = money(purchase + expenses);
    // Animal vendido não tem mais valor em pé; o resultado já está na receita da venda.
    const currentValue = sales > 0 ? 0 : (lastValuation ?? purchase);
    const result = money(revenues + currentValue - invested);
    const share = ownSharePct(partners);
    return {
        purchase,
        sales,
        expenses: money(expenses),
        revenues: money(revenues),
        invested,
        currentValue: money(currentValue),
        result,
        returnPct: invested > 0 ? money((result / invested) * 100) : null,
        ownSharePct: money(share),
        ownResult: money((result * share) / 100),
    };
};

export function registerAuctionRoutes(app) {
    app.get('/leiloes/plantel', async (req, res) => {
        try {
            const farmId = String(req.query.farmId || '').trim();
            const where = {
                farm: buildFarmRelationFilter(req, farmId ? { id: farmId } : {}),
                OR: [
                    { tipoCadastro: 'PO' },
                    { partners: { some: {} } },
                    { valuations: { some: {} } },
                    { documents: { some: {} } },
                ],
            };
            const animals = await prisma.animal.findMany({
                where,
                orderBy: [{ nome: 'asc' }, { brinco: 'asc' }],
                select: {
                    id: true, farmId: true, brinco: true, nome: true, registro: true, raca: true, sexo: true,
                    categoria: true, dataNascimento: true, status: true, videoUrl: true,
                    partners: true,
                    valuations: { orderBy: { date: 'desc' }, take: 1 },
                    herdEvents: { where: { type: { in: ['COMPRA', 'VENDA'] } }, select: { type: true, valor: true, date: true } },
                    financialAllocations: { select: { amount: true, resultEntry: { select: { resultClass: true, status: true, herdEventId: true, transaction: { select: { herdEventId: true } } } } } },
                    _count: { select: { documents: true } },
                },
            });
            const items = animals.map((a) => ({
                id: a.id,
                farmId: a.farmId,
                brinco: a.brinco,
                nome: a.nome,
                registro: a.registro,
                raca: a.raca,
                sexo: a.sexo,
                categoria: a.categoria,
                dataNascimento: a.dataNascimento ? a.dataNascimento.toISOString() : null,
                status: a.status,
                hasVideo: Boolean(a.videoUrl),
                partnersCount: a.partners.length,
                documentsCount: a._count.documents,
                money: buildMoneySummary(a.herdEvents, a.financialAllocations, a.valuations, a.partners),
            }));
            const totals = items.reduce((acc, item) => {
                const share = item.money.ownSharePct / 100;
                acc.invested += item.money.invested * share;
                acc.currentValue += item.money.currentValue * share;
                acc.result += item.money.ownResult;
                return acc;
            }, { invested: 0, currentValue: 0, result: 0 });
            return res.json({
                items,
                totals: {
                    animals: items.length,
                    invested: money(totals.invested),
                    currentValue: money(totals.currentValue),
                    result: money(totals.result),
                },
            });
        } catch (error) {
            console.error('Erro ao listar plantel de Meus Leilões:', error);
            return res.status(500).json({ message: 'Erro ao carregar o plantel.' });
        }
    });

    app.get('/leiloes/animais/:id', async (req, res) => {
        try {
            const animal = await prisma.animal.findFirst({
                where: { id: req.params.id, farm: buildFarmRelationFilter(req) },
                include: {
                    partners: { orderBy: [{ isOwnFarm: 'desc' }, { name: 'asc' }] },
                    documents: { orderBy: { createdAt: 'desc' } },
                    valuations: { orderBy: { date: 'desc' } },
                    herdEvents: { where: { type: { in: ['COMPRA', 'VENDA'] } }, orderBy: { date: 'desc' } },
                    financialAllocations: {
                        include: { resultEntry: { select: { id: true, resultClass: true, status: true, competenceDate: true, description: true, herdEventId: true, transaction: { select: { herdEventId: true } } } } },
                    },
                    semenBatches: { select: { id: true, lote: true, dosesTotal: true, dosesDisponiveis: true } },
                    embryoDonorBatches: { select: { id: true, lote: true, tecnica: true, quantidadeTotal: true, quantidadeDisponivel: true } },
                    reproEvents: { orderBy: { date: 'desc' }, take: 20, select: { id: true, type: true, date: true, notes: true } },
                },
            });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });

            const entries = animal.financialAllocations
                .filter((a) => a.resultEntry?.status === 'ACTIVE' && !isTradeEntry(a.resultEntry))
                .map((a) => ({
                    id: a.id,
                    date: a.resultEntry.competenceDate.toISOString(),
                    description: a.resultEntry.description,
                    kind: REVENUE_CLASSES.has(a.resultEntry.resultClass) ? 'RECEITA' : 'DESPESA',
                    amount: Number(a.amount),
                }))
                .sort((a, b) => b.date.localeCompare(a.date));

            return res.json({
                animal: {
                    id: animal.id,
                    farmId: animal.farmId,
                    brinco: animal.brinco,
                    nome: animal.nome,
                    registro: animal.registro,
                    raca: animal.raca,
                    sexo: animal.sexo,
                    categoria: animal.categoria,
                    dataNascimento: animal.dataNascimento ? animal.dataNascimento.toISOString() : null,
                    paiNome: animal.paiNome,
                    maeNome: animal.maeNome,
                    status: animal.status,
                    videoUrl: animal.videoUrl,
                },
                partners: animal.partners.map(serializePartner),
                documents: animal.documents.map(serializeDocument),
                valuations: animal.valuations.map(serializeValuation),
                trades: animal.herdEvents.map((e) => ({ id: e.id, type: e.type, date: e.date.toISOString(), value: e.valor, origem: e.origem, destino: e.destino })),
                entries,
                genetics: {
                    semenBatches: animal.semenBatches,
                    embryoBatches: animal.embryoDonorBatches,
                    reproEvents: animal.reproEvents.map((e) => ({ ...e, date: e.date.toISOString() })),
                },
                money: buildMoneySummary(animal.herdEvents, animal.financialAllocations, animal.valuations, animal.partners),
            });
        } catch (error) {
            console.error('Erro ao abrir ficha de Meus Leilões:', error);
            return res.status(500).json({ message: 'Erro ao carregar a ficha do animal.' });
        }
    });

    app.put('/leiloes/animais/:id/video', async (req, res) => {
        try {
            const animal = await findAnimal(req, req.params.id, { id: true, farmId: true });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            const videoUrl = normalizeVideoUrl(req.body?.videoUrl);
            if (videoUrl === undefined) return res.status(400).json({ message: 'Link de vídeo inválido.' });
            await prisma.animal.update({ where: { id: animal.id }, data: { videoUrl } });
            return res.json({ videoUrl });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar o vídeo.' });
        }
    });

    // ── Sócios ──────────────────────────────────────────────────────────
    app.post('/leiloes/animais/:id/socios', async (req, res) => {
        try {
            const animal = await findAnimal(req, req.params.id, { id: true, farmId: true });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            const parsed = parsePartnerBody(req.body);
            if (parsed.error) return res.status(400).json({ message: parsed.error });
            const total = await partnerTotal(animal.id);
            if (total + parsed.data.sharePct > 100.001) {
                return res.status(400).json({ message: `As cotas somariam ${money(total + parsed.data.sharePct)}%. O máximo é 100%.` });
            }
            const partner = await prisma.animalPartner.create({
                data: { id: randomUUID(), farmId: animal.farmId, animalId: animal.id, ...parsed.data },
            });
            await logActivity(prisma, req, { farmId: animal.farmId, entity: 'ANIMAL', entityId: animal.id, action: 'SOCIO_ADICIONADO', description: `Adicionou o sócio ${partner.name} (${Number(partner.sharePct)}%)` });
            return res.status(201).json({ partner: serializePartner(partner) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar o sócio.' });
        }
    });

    app.put('/leiloes/socios/:partnerId', async (req, res) => {
        try {
            const current = await prisma.animalPartner.findFirst({
                where: { id: req.params.partnerId, farm: buildFarmRelationFilter(req) },
            });
            if (!current) return res.status(404).json({ message: 'Sócio não encontrado.' });
            const parsed = parsePartnerBody(req.body);
            if (parsed.error) return res.status(400).json({ message: parsed.error });
            const total = await partnerTotal(current.animalId, current.id);
            if (total + parsed.data.sharePct > 100.001) {
                return res.status(400).json({ message: `As cotas somariam ${money(total + parsed.data.sharePct)}%. O máximo é 100%.` });
            }
            const partner = await prisma.animalPartner.update({ where: { id: current.id }, data: parsed.data });
            return res.json({ partner: serializePartner(partner) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao atualizar o sócio.' });
        }
    });

    app.delete('/leiloes/socios/:partnerId', async (req, res) => {
        try {
            const current = await prisma.animalPartner.findFirst({
                where: { id: req.params.partnerId, farm: buildFarmRelationFilter(req) },
            });
            if (!current) return res.status(404).json({ message: 'Sócio não encontrado.' });
            await prisma.animalPartner.delete({ where: { id: current.id } });
            return res.json({ success: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao remover o sócio.' });
        }
    });

    // ── Documentos ──────────────────────────────────────────────────────
    app.post('/leiloes/animais/:id/documentos', parseLargeJson, async (req, res) => {
        try {
            const animal = await findAnimal(req, req.params.id, { id: true, farmId: true });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            const { type, title, fileName, mimeType, contentBase64 } = req.body || {};
            const normalizedType = String(type || '').toUpperCase();
            const normalizedMime = String(mimeType || '').trim().toLowerCase();
            if (!DOCUMENT_TYPES.includes(normalizedType)) return res.status(400).json({ message: 'Tipo de documento inválido.' });
            const ext = DOCUMENT_MIMES.get(normalizedMime);
            if (!ext) return res.status(400).json({ message: 'Envie PDF, JPG, PNG ou WebP.' });
            const buffer = decodeBase64(contentBase64);
            if (!buffer || !buffer.length) return res.status(400).json({ message: 'Arquivo vazio ou inválido.' });
            if (buffer.length > MAX_DOCUMENT_BYTES) return res.status(400).json({ message: 'Arquivo maior que 7 MB.' });

            const id = randomUUID();
            const storageName = `${id}.${ext}`;
            const farmDir = path.join(ANIMAL_DOCUMENT_UPLOAD_ROOT, animal.farmId);
            await fs.mkdir(farmDir, { recursive: true });
            await fs.writeFile(path.join(farmDir, storageName), buffer);

            const safeFileName = path.basename(String(fileName || `documento.${ext}`)).slice(0, 180);
            const document = await prisma.animalDocument.create({
                data: {
                    id,
                    farmId: animal.farmId,
                    animalId: animal.id,
                    type: normalizedType,
                    title: String(title || '').trim() || null,
                    fileName: safeFileName,
                    storagePath: `${animal.farmId}/${storageName}`,
                    mimeType: normalizedMime,
                    sizeBytes: buffer.length,
                    uploadedById: req.user.id,
                },
            });
            await logActivity(prisma, req, { farmId: animal.farmId, entity: 'ANIMAL', entityId: animal.id, action: 'DOCUMENTO_ANEXADO', description: `Anexou ${safeFileName}` });
            return res.status(201).json({ document: serializeDocument(document) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar o documento.' });
        }
    });

    // Download passa pela API (com login), nunca por pasta pública.
    app.get('/leiloes/documentos/:documentId/arquivo', async (req, res) => {
        try {
            const document = await prisma.animalDocument.findFirst({
                where: { id: req.params.documentId, farm: buildFarmRelationFilter(req) },
            });
            if (!document) return res.status(404).json({ message: 'Documento não encontrado.' });
            const filePath = path.resolve(ANIMAL_DOCUMENT_UPLOAD_ROOT, document.storagePath);
            if (!filePath.startsWith(path.resolve(ANIMAL_DOCUMENT_UPLOAD_ROOT) + path.sep)) {
                return res.status(400).json({ message: 'Caminho inválido.' });
            }
            res.setHeader('Content-Type', document.mimeType);
            res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
            res.setHeader('Cache-Control', 'private, no-store');
            return res.sendFile(filePath);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao abrir o documento.' });
        }
    });

    app.delete('/leiloes/documentos/:documentId', async (req, res) => {
        try {
            const document = await prisma.animalDocument.findFirst({
                where: { id: req.params.documentId, farm: buildFarmRelationFilter(req) },
            });
            if (!document) return res.status(404).json({ message: 'Documento não encontrado.' });
            await prisma.animalDocument.delete({ where: { id: document.id } });
            await fs.unlink(path.resolve(ANIMAL_DOCUMENT_UPLOAD_ROOT, document.storagePath)).catch(() => {});
            return res.json({ success: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao remover o documento.' });
        }
    });

    // ── Leitura com IA ──────────────────────────────────────────────────
    app.get('/leiloes/leitura/status', (req, res) => res.json({ enabled: canUseDocumentReader(req) }));

    app.post('/leiloes/documentos/:documentId/ler', async (req, res) => {
        try {
            if (!canUseDocumentReader(req)) {
                return res.status(403).json({ message: 'A leitura automática ainda não está liberada para esta conta.' });
            }
            const document = await prisma.animalDocument.findFirst({
                where: { id: req.params.documentId, farm: buildFarmRelationFilter(req) },
            });
            if (!document) return res.status(404).json({ message: 'Documento não encontrado.' });
            if (document.mimeType !== 'application/pdf') {
                return res.status(422).json({ message: 'Foto não tem texto para ler. Preencha os dados na mão.' });
            }
            const buffer = await fs.readFile(path.resolve(ANIMAL_DOCUMENT_UPLOAD_ROOT, document.storagePath));
            const text = await extractPdfText(buffer);
            if (!hasEnoughText(text)) {
                return res.status(422).json({ message: 'Este PDF parece escaneado (sem texto). Preencha os dados na mão.' });
            }
            const result = await readAuctionText(text);
            await logActivity(prisma, req, { farmId: document.farmId, entity: 'ANIMAL', entityId: document.animalId, action: 'DOCUMENTO_LIDO_IA', description: `Leu ${document.fileName} com IA` });
            return res.json(result);
        } catch (error) {
            console.error('Erro na leitura com IA:', error);
            return res.status(502).json({ message: error.message?.startsWith('A IA') ? error.message : 'Não foi possível ler o documento agora.' });
        }
    });

    // Aplica o que o criador conferiu na tela. Tudo ou nada.
    app.post('/leiloes/animais/:id/aplicar-leitura', async (req, res) => {
        try {
            const animal = await findAnimal(req, req.params.id, { id: true, farmId: true });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            const body = req.body || {};

            const partners = [];
            for (const item of Array.isArray(body.partners) ? body.partners : []) {
                const parsed = parsePartnerBody(item);
                if (parsed.error) return res.status(400).json({ message: `${item?.name || 'Sócio'}: ${parsed.error}` });
                partners.push(parsed.data);
            }
            const newShares = partners.reduce((sum, p) => sum + p.sharePct, 0);
            const currentShares = partners.length ? await partnerTotal(animal.id) : 0;
            if (currentShares + newShares > 100.001) {
                return res.status(400).json({ message: `As cotas somariam ${money(currentShares + newShares)}%. Ajuste ou remova sócios antigos.` });
            }

            const valuationValue = parseNumber(body.valuation?.value);
            const purchaseValue = parseNumber(body.purchase?.value);
            const purchaseDate = parseDateValue(body.purchase?.date);
            if (body.purchase && (!(purchaseValue > 0) || !purchaseDate)) {
                return res.status(400).json({ message: 'Compra precisa de data e valor.' });
            }

            const summary = await prisma.$transaction(async (tx) => {
                const done = { partners: 0, valuation: false, purchase: false };
                for (const data of partners) {
                    await tx.animalPartner.create({ data: { id: randomUUID(), farmId: animal.farmId, animalId: animal.id, ...data } });
                    done.partners += 1;
                }
                if (valuationValue > 0) {
                    await tx.animalValuation.create({
                        data: {
                            id: randomUUID(),
                            farmId: animal.farmId,
                            animalId: animal.id,
                            date: parseDateValue(body.valuation.date) || new Date(),
                            value: money(valuationValue),
                            source: 'LEILAO',
                            notes: String(body.valuation.notes || '').trim().slice(0, 200) || null,
                        },
                    });
                    done.valuation = true;
                }
                if (body.purchase) {
                    const existing = await tx.herdEvent.findFirst({ where: { animalId: animal.id, type: 'COMPRA' } });
                    if (!existing) {
                        await tx.herdEvent.create({
                            data: {
                                farmId: animal.farmId,
                                animalId: animal.id,
                                type: 'COMPRA',
                                date: purchaseDate,
                                valor: money(purchaseValue),
                                origem: String(body.purchase.origem || '').trim().slice(0, 120) || null,
                                observacoes: 'Registrada pela leitura de documento (Meus Leilões)',
                            },
                        });
                        done.purchase = true;
                    }
                }
                return done;
            });
            await logActivity(prisma, req, { farmId: animal.farmId, entity: 'ANIMAL', entityId: animal.id, action: 'LEITURA_IA_APLICADA', description: `Aplicou leitura: ${summary.partners} sócio(s)${summary.valuation ? ', avaliação' : ''}${summary.purchase ? ', compra' : ''}` });
            return res.json({ applied: summary });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao aplicar a leitura.' });
        }
    });

    // ── Avaliações ──────────────────────────────────────────────────────
    app.post('/leiloes/animais/:id/avaliacoes', async (req, res) => {
        try {
            const animal = await findAnimal(req, req.params.id, { id: true, farmId: true });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            const value = parseNumber(req.body?.value);
            const date = parseDateValue(req.body?.date) || new Date();
            const source = String(req.body?.source || '').toUpperCase();
            if (!(value > 0)) return res.status(400).json({ message: 'Informe um valor maior que zero.' });
            if (!VALUATION_SOURCES.includes(source)) return res.status(400).json({ message: 'Origem da avaliação inválida.' });
            const valuation = await prisma.animalValuation.create({
                data: {
                    id: randomUUID(),
                    farmId: animal.farmId,
                    animalId: animal.id,
                    date,
                    value: money(value),
                    source,
                    notes: String(req.body?.notes || '').trim() || null,
                },
            });
            return res.status(201).json({ valuation: serializeValuation(valuation) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar a avaliação.' });
        }
    });

    app.delete('/leiloes/avaliacoes/:valuationId', async (req, res) => {
        try {
            const valuation = await prisma.animalValuation.findFirst({
                where: { id: req.params.valuationId, farm: buildFarmRelationFilter(req) },
            });
            if (!valuation) return res.status(404).json({ message: 'Avaliação não encontrada.' });
            await prisma.animalValuation.delete({ where: { id: valuation.id } });
            return res.json({ success: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao remover a avaliação.' });
        }
    });
}
