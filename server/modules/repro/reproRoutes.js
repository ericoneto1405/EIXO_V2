import { PrismaClient } from '@prisma/client';
import { requireBillingAccess, requireEntitlement, requireModule, requireNonFieldWorker } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import { PLAN_ENTITLEMENTS, getPlanLimits } from '../utils/saasContext.js';
import { logActivity } from '../utils/activityLog.js';
import { findCatalogItem } from '../pharmacy/pharmacyCatalog.js';
import { marcacoesDoProduto } from '../sanity/sanityRules.js';
import { normalizeAnimalIdentityKey } from '../utils/formatters.js';
import { buildProvisionalIdentification } from '../animals/herdIntegrityService.js';
import { weanCalf } from '../animals/animalRoutes.js';
import {
    DECISOES_VAZIA, METODOS_DIAGNOSTICO, MOTIVOS_DESCARTE, TIPOS_MANUAIS, aguardaDecisao, avaliarCandidata,
    bloqueiosLiberacao, calcularSituacao, normalizarIdent, numerosDaVaca, processarToque, temBrucelose, validarEvento,
    DESMAMA_PRECOCE_DIAS, pesoAjustado205, prontoParaDesmama, statusPrevisao, validarParto,
} from './reproRules.js';

const prisma = new PrismaClient();
const MAX_LOTE = 2000;
const CONFIG_CAMPOS = {
    idadeMinMeses: 'int', pesoMinKg: 'float', eccMin: 'float', gestacaoDias: 'int',
    desmamaIdadeMeses: 'int', desmamaPesoKg: 'float', pesoNascerKg: 'float', minVacasIndicador: 'int',
    vaziasSeguidasLimite: 'int', iepMaxMeses: 'int', pesoMinDesmamaFarol: 'float',
};

// Farol e indicadores são do EIXO Performance.
const temPerformance = (req) => {
    if (req.user?.roles?.includes('SUPER_ADMIN')) return true;
    const codes = PLAN_ENTITLEMENTS[getPlanLimits(req.saas?.planCode).code] || [];
    return codes.includes('EIXO_DECISAO') || (req.saas?.entitlements || []).includes('EIXO_DECISAO');
};

const parseData = (value) => {
    if (!value) return null;
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};

const attachReproFarm = async (req, res, next) => {
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(req.params.farmId) }),
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        req.reproFarm = farm;
        return next();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar a fazenda.' });
    }
};

const carregarConfig = (farmId) => prisma.reproSettings.findUnique({ where: { farmId } });

// Quais animais têm vacina de brucelose registrada na Sanidade.
async function animaisComBrucelose(farmId, animalIds) {
    if (!animalIds.length) return new Set();
    const aplicacoes = await prisma.sanitaryApplication.findMany({
        where: { farmId, animalId: { in: animalIds }, product: { category: 'VACINA' } },
        select: { animalId: true, product: { select: { name: true, activeIngredient: true, category: true, catalogKey: true } } },
    });
    const ids = new Set();
    for (const a of aplicacoes) {
        const tags = marcacoesDoProduto(a.product, findCatalogItem(a.product.catalogKey));
        if (tags.has('BRUCELOSE_B19') || tags.has('BRUCELOSE_RB51')) ids.add(a.animalId);
    }
    return ids;
}

async function ultimosPesosEEcc(animalIds) {
    const [pesagens, eccs] = await Promise.all([
        prisma.weighing.findMany({
            where: { animalId: { in: animalIds } },
            orderBy: { data: 'desc' },
            distinct: ['animalId'],
            select: { animalId: true, peso: true, data: true },
        }),
        prisma.reproEvent.findMany({
            where: { animalId: { in: animalIds }, type: 'ECC' },
            orderBy: { date: 'desc' },
            distinct: ['animalId'],
            select: { animalId: true, payload: true },
        }),
    ]);
    return {
        pesos: new Map(pesagens.map((p) => [p.animalId, p])),
        eccs: new Map(eccs.map((e) => [e.animalId, Number(e.payload?.ecc) || null])),
    };
}

// Refaz situação e previsão de parto da vaca a partir da linha do tempo.
async function recalcularVaca(tx, animalId, config) {
    const eventos = await tx.reproEvent.findMany({ where: { animalId }, orderBy: { date: 'asc' } });
    const s = calcularSituacao(eventos, config || {});
    await tx.animal.update({
        where: { id: animalId },
        data: { statusReprodutivo: s.situacao, previsaoParto: s.previsaoParto },
    });
    return s;
}

const serializarEvento = (e) => ({
    id: e.id, type: e.type, date: e.date, payload: e.payload || {}, notes: e.notes,
    lotId: e.lotId, createdById: e.createdById, createdAt: e.createdAt, updatedAt: e.updatedAt,
});

export function registerReproRoutes(app) {
    // /farms já passa por requireAuth (prefixo em authRoutes).
    app.use(
        '/farms/:farmId/reproducao',
        requireNonFieldWorker,
        requireBillingAccess,
        requireEntitlement('EIXO_GESTAO', 'EIXO_DECISAO'),
        requireModule('Reprodução'),
        attachReproFarm,
    );

    app.get('/farms/:farmId/reproducao/config', async (req, res) => {
        try {
            const config = await carregarConfig(req.reproFarm.id);
            res.json({ config: config || null, performance: temPerformance(req), motivosDescarte: MOTIVOS_DESCARTE, tiposManuais: TIPOS_MANUAIS });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao carregar os critérios.' });
        }
    });

    app.put('/farms/:farmId/reproducao/config', async (req, res) => {
        try {
            const data = {};
            for (const [campo, tipo] of Object.entries(CONFIG_CAMPOS)) {
                if (!(campo in (req.body || {}))) continue;
                const bruto = req.body[campo];
                if (bruto === null || bruto === '') { data[campo] = null; continue; }
                const n = tipo === 'int' ? Number.parseInt(bruto, 10) : Number(bruto);
                if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: `Valor inválido em ${campo}.` });
                data[campo] = n;
            }
            if (data.eccMin != null && (data.eccMin < 1 || data.eccMin > 5)) return res.status(400).json({ message: 'ECC vai de 1 a 5.' });
            if ('minVacasIndicador' in data && data.minVacasIndicador == null) delete data.minVacasIndicador;
            const farmId = req.reproFarm.id;
            const config = await prisma.reproSettings.upsert({ where: { farmId }, create: { farmId, ...data }, update: data });
            void logActivity(prisma, req, { action: 'REPRO_CONFIGURACAO', entity: 'ReproSettings', entityId: config.id, description: 'Atualizou os critérios da Reprodução', farmId });
            res.json({ config });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar os critérios.' });
        }
    });

    // Parte 0 — fêmeas que ainda não entraram na reprodução.
    app.get('/farms/:farmId/reproducao/candidatas', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const where = { farmId, sexo: 'FEMEA', status: 'VIVO', reproEvents: { none: { type: { in: ['LIBERACAO', 'DESCARTE'] } } } };
            if (req.query.lotId) where.lotId = String(req.query.lotId);
            const animais = await prisma.animal.findMany({
                where,
                select: { id: true, brinco: true, sexo: true, status: true, raca: true, dataNascimento: true, dataNascimentoEstimada: true, pesoAtual: true, lotId: true, lot: { select: { name: true } } },
                orderBy: { brinco: 'asc' },
                take: MAX_LOTE,
            });
            const ids = animais.map((a) => a.id);
            const [config, brucelose, extras] = await Promise.all([carregarConfig(farmId), animaisComBrucelose(farmId, ids), ultimosPesosEEcc(ids)]);
            const informadas = new Map((await prisma.animal.findMany({
                where: { id: { in: ids }, bruceloseInformadaEm: { not: null } },
                select: { id: true, bruceloseInformadaEm: true },
            })).map((a) => [a.id, a.bruceloseInformadaEm]));
            const performance = temPerformance(req);
            const lista = animais.map((a) => {
                const pesagem = extras.pesos.get(a.id);
                const ecc = extras.eccs.get(a.id) ?? null;
                const temB = temBrucelose({ aplicacoesBrucelose: brucelose.has(a.id) ? 1 : 0, bruceloseInformadaEm: informadas.get(a.id) });
                const base = {
                    id: a.id, brinco: a.brinco, raca: a.raca, dataNascimento: a.dataNascimento,
                    dataNascimentoEstimada: a.dataNascimentoEstimada, lote: a.lot?.name || null, lotId: a.lotId,
                    peso: pesagem?.peso ?? a.pesoAtual ?? null, pesadoEm: pesagem?.data ?? null, ecc,
                    brucelose: temB,
                    bloqueios: bloqueiosLiberacao(a, { brucelose: temB }),
                };
                if (performance) {
                    base.farol = avaliarCandidata({ dataNascimento: a.dataNascimento, pesoAtual: base.peso, pesadoEm: base.pesadoEm, ecc }, config);
                    if (config?.pesoMinKg != null && base.peso != null) base.faltaKg = Math.max(0, Math.ceil(config.pesoMinKg - base.peso));
                }
                return base;
            });
            res.json({ candidatas: lista, performance, criteriosDefinidos: Boolean(config && (config.idadeMinMeses != null || config.pesoMinKg != null || config.eccMin != null)) });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar as candidatas.' });
        }
    });

    // Produtor informa vacina de brucelose aplicada antes do EIXO.
    app.post('/farms/:farmId/reproducao/animais/:animalId/brucelose', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const data = parseData(req.body?.data);
            const vacina = String(req.body?.vacina || '').toUpperCase();
            if (!data || data > new Date()) return res.status(400).json({ message: 'Informe a data da vacina (não pode ser futura).' });
            if (!['B19', 'RB51'].includes(vacina)) return res.status(400).json({ message: 'Informe a vacina: B19 ou RB51.' });
            const animal = await prisma.animal.findFirst({ where: { id: String(req.params.animalId), farmId }, select: { id: true, sexo: true, brinco: true } });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            if (animal.sexo !== 'FEMEA') return res.status(400).json({ message: 'Vacina de brucelose é só para fêmea.' });
            await prisma.animal.update({ where: { id: animal.id }, data: { bruceloseInformadaEm: data, bruceloseInformadaVacina: vacina } });
            void logActivity(prisma, req, { action: 'REPRO_BRUCELOSE_INFORMADA', entity: 'Animal', entityId: animal.id, description: `Informou brucelose ${vacina} anterior da ${animal.brinco}`, farmId });
            res.json({ ok: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar a vacina.' });
        }
    });

    app.post('/farms/:farmId/reproducao/candidatas/liberar', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const ids = [...new Set((Array.isArray(req.body?.animalIds) ? req.body.animalIds : []).map(String))].slice(0, MAX_LOTE);
            const data = parseData(req.body?.data) || new Date();
            if (!ids.length) return res.status(400).json({ message: 'Selecione ao menos uma fêmea.' });
            if (data > new Date(Date.now() + 86400000)) return res.status(400).json({ message: 'Data no futuro não é permitida.' });
            const historicoDesconhecido = Boolean(req.body?.historicoDesconhecido);
            const partosAnteriores = historicoDesconhecido ? Math.max(0, Number.parseInt(req.body?.partosAnteriores, 10) || 0) : 0;
            const situacaoAtual = historicoDesconhecido && ['VAZIA', 'PRENHE', 'PARIDA'].includes(req.body?.situacaoAtual) ? req.body.situacaoAtual : null;

            const animais = await prisma.animal.findMany({
                where: { farmId, id: { in: ids } },
                select: {
                    id: true, brinco: true, sexo: true, status: true, bruceloseInformadaEm: true, lotId: true,
                    reproEvents: { where: { type: { in: ['LIBERACAO', 'DESCARTE'] } }, select: { type: true } },
                },
            });
            const [brucelose, extras, config] = await Promise.all([animaisComBrucelose(farmId, ids), ultimosPesosEEcc(ids), carregarConfig(farmId)]);
            const liberadas = [];
            const bloqueadas = [];
            for (const a of animais) {
                if (a.reproEvents.some((e) => e.type === 'LIBERACAO')) { bloqueadas.push({ id: a.id, brinco: a.brinco, motivos: ['Já liberada'] }); continue; }
                const temB = temBrucelose({ aplicacoesBrucelose: brucelose.has(a.id) ? 1 : 0, bruceloseInformadaEm: a.bruceloseInformadaEm });
                const motivos = bloqueiosLiberacao({ ...a, descartada: a.reproEvents.some((e) => e.type === 'DESCARTE') }, { brucelose: temB });
                if (motivos.length) { bloqueadas.push({ id: a.id, brinco: a.brinco, motivos }); continue; }
                liberadas.push(a);
            }
            const naoEncontradas = ids.filter((id) => !animais.some((a) => a.id === id));

            await prisma.$transaction(async (tx) => {
                for (const a of liberadas) {
                    const pesagem = extras.pesos.get(a.id);
                    await tx.reproEvent.create({
                        data: {
                            farmId, animalId: a.id, type: 'LIBERACAO', date: data, lotId: a.lotId, createdById: req.user?.id || null,
                            payload: { peso: pesagem?.peso ?? null, ecc: extras.eccs.get(a.id) ?? null, historicoDesconhecido, partosAnteriores, situacaoAtual },
                        },
                    });
                    await recalcularVaca(tx, a.id, config);
                }
            });
            if (liberadas.length) {
                void logActivity(prisma, req, { action: 'REPRO_LIBERACAO', entity: 'ReproEvent', entityId: liberadas[0].id, description: `Liberou ${liberadas.length} fêmea(s) para reprodução`, farmId });
            }
            res.json({ liberadas: liberadas.map((a) => ({ id: a.id, brinco: a.brinco })), bloqueadas, naoEncontradas });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao liberar as fêmeas.' });
        }
    });

    // Parte 1 — vacas já na reprodução (para abrir a ficha).
    app.get('/farms/:farmId/reproducao/vacas', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const busca = String(req.query.busca || '').trim();
            const where = { farmId, sexo: 'FEMEA', reproEvents: { some: { type: 'LIBERACAO' } } };
            if (busca) where.brinco = { contains: busca, mode: 'insensitive' };
            if (req.query.lotId) where.lotId = String(req.query.lotId);
            const vacas = await prisma.animal.findMany({
                where,
                select: { id: true, brinco: true, status: true, statusReprodutivo: true, previsaoParto: true, lot: { select: { name: true } } },
                orderBy: { brinco: 'asc' },
                take: 500,
            });
            res.json({ vacas: vacas.map((v) => ({ id: v.id, brinco: v.brinco, status: v.status, situacao: v.statusReprodutivo, previsaoParto: v.previsaoParto, lote: v.lot?.name || null })) });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar as vacas.' });
        }
    });

    app.get('/farms/:farmId/reproducao/vacas/:animalId', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const animal = await prisma.animal.findFirst({
                where: { id: String(req.params.animalId), farmId },
                select: { id: true, brinco: true, sexo: true, status: true, raca: true, dataNascimento: true, dataNascimentoEstimada: true, previsaoParto: true, lot: { select: { name: true } } },
            });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            if (animal.sexo !== 'FEMEA') return res.status(400).json({ message: 'Macho não tem ficha reprodutiva.' });
            const [eventos, config] = await Promise.all([
                prisma.reproEvent.findMany({ where: { animalId: animal.id, farmId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
                carregarConfig(farmId),
            ]);
            const s = calcularSituacao(eventos, config || {});
            const performance = temPerformance(req);
            res.json({
                vaca: { ...animal, lote: animal.lot?.name || null, situacao: s.situacao, previsaoParto: s.previsaoParto, categoria: s.categoria, historicoDesconhecido: s.historicoDesconhecido },
                eventos: eventos.map(serializarEvento).reverse(),
                numeros: performance ? numerosDaVaca(eventos, animal) : null,
                performance,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao abrir a ficha.' });
        }
    });

    const lerEvento = (body = {}) => ({
        type: String(body.type || ''),
        date: parseData(body.date),
        payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
        notes: body.notes ? String(body.notes).slice(0, 1000) : null,
    });

    app.post('/farms/:farmId/reproducao/vacas/:animalId/eventos', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const animal = await prisma.animal.findFirst({ where: { id: String(req.params.animalId), farmId }, select: { id: true, sexo: true, lotId: true, brinco: true } });
            if (!animal) return res.status(404).json({ message: 'Animal não encontrado.' });
            const evento = lerEvento(req.body);
            const eventos = await prisma.reproEvent.findMany({ where: { animalId: animal.id } });
            if (!eventos.some((e) => e.type === 'LIBERACAO')) return res.status(400).json({ message: 'Libere a fêmea para reprodução antes de lançar eventos.' });
            const { erros, avisos } = validarEvento(evento, { eventos, sexo: animal.sexo });
            if (erros.length) return res.status(400).json({ message: erros[0], erros });
            const config = await carregarConfig(farmId);
            const criado = await prisma.$transaction(async (tx) => {
                const e = await tx.reproEvent.create({ data: { farmId, animalId: animal.id, ...evento, lotId: animal.lotId, createdById: req.user?.id || null } });
                await recalcularVaca(tx, animal.id, config);
                return e;
            });
            void logActivity(prisma, req, { action: 'REPRO_EVENTO', entity: 'ReproEvent', entityId: criado.id, description: `Lançou ${evento.type} na ${animal.brinco}`, farmId });
            res.status(201).json({ evento: serializarEvento(criado), avisos });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao lançar o evento.' });
        }
    });

    app.put('/farms/:farmId/reproducao/eventos/:eventId', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const atual = await prisma.reproEvent.findFirst({ where: { id: String(req.params.eventId), farmId }, include: { animal: { select: { sexo: true } } } });
            if (!atual) return res.status(404).json({ message: 'Evento não encontrado.' });
            if (!TIPOS_MANUAIS.includes(atual.type)) return res.status(400).json({ message: 'Este evento é editado na tela de origem.' });
            const evento = { ...lerEvento({ ...req.body, type: atual.type }) };
            const outros = await prisma.reproEvent.findMany({ where: { animalId: atual.animalId, id: { not: atual.id } } });
            const { erros, avisos } = validarEvento(evento, { eventos: outros, sexo: atual.animal.sexo });
            if (erros.length) return res.status(400).json({ message: erros[0], erros });
            const config = await carregarConfig(farmId);
            const salvo = await prisma.$transaction(async (tx) => {
                const e = await tx.reproEvent.update({ where: { id: atual.id }, data: { date: evento.date, payload: evento.payload, notes: evento.notes } });
                await recalcularVaca(tx, atual.animalId, config);
                return e;
            });
            res.json({ evento: serializarEvento(salvo), avisos });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao editar o evento.' });
        }
    });

    app.delete('/farms/:farmId/reproducao/eventos/:eventId', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const atual = await prisma.reproEvent.findFirst({ where: { id: String(req.params.eventId), farmId } });
            if (!atual) return res.status(404).json({ message: 'Evento não encontrado.' });
            if (!TIPOS_MANUAIS.includes(atual.type) && atual.type !== 'LIBERACAO') return res.status(400).json({ message: 'Este evento é apagado na tela de origem.' });
            if (atual.type === 'LIBERACAO') {
                const outros = await prisma.reproEvent.count({ where: { animalId: atual.animalId, id: { not: atual.id } } });
                if (outros) return res.status(400).json({ message: 'Apague os outros eventos da vaca antes de desfazer a liberação.' });
            }
            const config = await carregarConfig(farmId);
            await prisma.$transaction(async (tx) => {
                if (atual.type === 'DIAGNOSTICO_PRENHEZ') {
                    await tx.reproEvent.deleteMany({ where: { animalId: atual.animalId, type: 'PERDA', payload: { path: ['origemDiagnosticoId'], equals: atual.id } } });
                }
                await tx.reproEvent.delete({ where: { id: atual.id } });
                await recalcularVaca(tx, atual.animalId, config);
            });
            void logActivity(prisma, req, { action: 'REPRO_EVENTO_APAGADO', entity: 'ReproEvent', entityId: atual.id, description: `Apagou ${atual.type}`, farmId });
            res.json({ ok: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao apagar o evento.' });
        }
    });

    // ---------- Fase 2: toque/ultrassom em lote ----------

    // Lista para o celular levar ao curral (funciona sem internet depois de baixada).
    app.get('/farms/:farmId/reproducao/toque/vacas', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const vacas = await prisma.animal.findMany({
                where: { farmId, sexo: 'FEMEA', status: 'VIVO', reproEvents: { some: { type: 'LIBERACAO' }, none: { type: 'DESCARTE' } } },
                select: { id: true, brinco: true, statusReprodutivo: true, lotId: true, lot: { select: { name: true } }, reproEvents: { where: { type: { in: ['LIBERACAO', 'PARTO'] } }, select: { type: true, payload: true } } },
                orderBy: { brinco: 'asc' },
            });
            res.json({
                baixadoEm: new Date().toISOString(),
                vacas: vacas.map((v) => {
                    const s = calcularSituacao(v.reproEvents.map((e) => ({ ...e, date: new Date(0) })));
                    return { id: v.id, brinco: v.brinco, situacao: v.statusReprodutivo, categoria: s.categoria, lotId: v.lotId, lote: v.lot?.name || null };
                }),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao baixar as vacas.' });
        }
    });

    async function carregarContextoToque(farmId, idents) {
        const variantes = [...new Set(idents.flatMap((v) => [v, v.toUpperCase(), v.toLowerCase()]))];
        const animais = await prisma.animal.findMany({
            where: { farmId, brinco: { in: variantes } },
            select: { id: true, brinco: true, sexo: true, status: true, reproEvents: { orderBy: { date: 'asc' } } },
        });
        const vacas = new Map();
        const eventosPorVaca = new Map();
        const repetidas = new Set();
        for (const a of animais) {
            const chave = normalizarIdent(a.brinco);
            if (vacas.has(chave)) repetidas.add(chave);
            vacas.set(chave, {
                id: a.id,
                sexo: a.sexo,
                vivo: a.status === 'VIVO',
                liberada: a.reproEvents.some((e) => e.type === 'LIBERACAO'),
                descartada: a.reproEvents.some((e) => e.type === 'DESCARTE'),
            });
            eventosPorVaca.set(a.id, a.reproEvents);
        }
        // Identificação repetida no rebanho não pode ser adivinhada: vira pendência.
        for (const chave of repetidas) vacas.delete(chave);
        return { vacas, eventosPorVaca, repetidas };
    }

    async function gravarDiagnosticos(tx, { farmId, sessao, validas, data, metodo, vetName, userId, config }) {
        for (const l of validas) {
            const diag = await tx.reproEvent.create({
                data: {
                    farmId, animalId: l.animalId, type: 'DIAGNOSTICO_PRENHEZ', date: data, diagnosisSessionId: sessao.id,
                    seasonId: sessao.seasonId, lotId: sessao.lotId, createdById: userId, notes: l.obs,
                    payload: { resultado: l.resultado, diasGestacao: l.diasGestacao, faixa: l.faixa, metodo, veterinario: vetName, avisos: l.avisos },
                },
            });
            if (l.perda) {
                await tx.reproEvent.create({
                    data: {
                        farmId, animalId: l.animalId, type: 'PERDA', date: data, diagnosisSessionId: sessao.id, createdById: userId,
                        payload: { automatica: true, origemDiagnosticoId: diag.id, motivo: 'Prenhe no diagnóstico anterior e vazia neste' },
                    },
                });
            }
            if (l.ecc != null) {
                await tx.reproEvent.create({
                    data: { farmId, animalId: l.animalId, type: 'ECC', date: data, diagnosisSessionId: sessao.id, createdById: userId, payload: { ecc: l.ecc } },
                });
            }
            await recalcularVaca(tx, l.animalId, config);
        }
    }

    app.post('/farms/:farmId/reproducao/toque/sessoes', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const body = req.body || {};
            const clientId = body.clientId ? String(body.clientId).slice(0, 64) : null;
            if (clientId) {
                const existente = await prisma.reproDiagnosisSession.findUnique({ where: { farmId_clientId: { farmId, clientId } } });
                if (existente) return res.json({ sessao: existente, repetido: true });
            }
            const data = parseData(body.data);
            if (!data || data > new Date(Date.now() + 86400000)) return res.status(400).json({ message: 'Data do toque inválida.' });
            const metodo = METODOS_DIAGNOSTICO.includes(body.metodo) ? body.metodo : null;
            if (!metodo) return res.status(400).json({ message: 'Informe toque ou ultrassom.' });
            const linhas = Array.isArray(body.linhas) ? body.linhas.slice(0, MAX_LOTE) : [];
            if (!linhas.length) return res.status(400).json({ message: 'Nenhuma vaca lançada.' });
            let lotId = body.lotId ? String(body.lotId) : null;
            if (lotId && !(await prisma.lot.findFirst({ where: { id: lotId, farmId }, select: { id: true } }))) lotId = null;

            const idents = linhas.map((l) => normalizarIdent(l?.brinco)).filter(Boolean);
            const ctx = await carregarContextoToque(farmId, idents);
            const r = processarToque(linhas, { data, vacas: ctx.vacas, eventosPorVaca: ctx.eventosPorVaca });
            for (const p of r.pendencias) {
                if (p.motivo === 'Identificação não encontrada' && ctx.repetidas.has(p.brinco)) p.motivo = 'Identificação repetida no rebanho';
            }

            let naoPassaram = [];
            if (lotId) {
                const doLote = await prisma.animal.findMany({
                    where: { farmId, lotId, sexo: 'FEMEA', status: 'VIVO', reproEvents: { some: { type: 'LIBERACAO' }, none: { type: 'DESCARTE' } } },
                    select: { id: true, brinco: true },
                });
                const lancadas = new Set(r.validas.map((l) => l.animalId));
                naoPassaram = doLote.filter((a) => !lancadas.has(a.id)).map((a) => a.brinco);
            }
            const resumo = { ...r.resumo, naoPassaram };
            const vetName = body.veterinario ? String(body.veterinario).slice(0, 120) : null;
            const config = await carregarConfig(farmId);
            const userId = req.user?.id || null;

            const sessao = await prisma.$transaction(async (tx) => {
                const s = await tx.reproDiagnosisSession.create({
                    data: {
                        farmId, clientId, date: data, metodo, vetName,
                        vetCrmv: body.crmv ? String(body.crmv).slice(0, 30) : null,
                        lotId, notes: body.notes ? String(body.notes).slice(0, 1000) : null,
                        pendencias: r.pendencias, resumo, createdById: userId,
                    },
                });
                await gravarDiagnosticos(tx, { farmId, sessao: s, validas: r.validas, data, metodo, vetName, userId, config });
                return s;
            }, { timeout: 60000 });
            void logActivity(prisma, req, { action: 'REPRO_TOQUE', entity: 'ReproDiagnosisSession', entityId: sessao.id, description: `Toque: ${resumo.prenhes} prenhes, ${resumo.vazias} vazias, ${resumo.pendencias} pendências`, farmId });
            res.status(201).json({ sessao, resumo, pendencias: r.pendencias, avisos: r.validas.filter((l) => l.avisos.length).map((l) => ({ brinco: l.brinco, avisos: l.avisos })) });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar o toque.' });
        }
    });

    app.get('/farms/:farmId/reproducao/toque/sessoes', async (req, res) => {
        try {
            const sessoes = await prisma.reproDiagnosisSession.findMany({
                where: { farmId: req.reproFarm.id },
                orderBy: { date: 'desc' },
                take: 100,
                select: { id: true, date: true, metodo: true, vetName: true, lotId: true, resumo: true, pendencias: true, createdAt: true },
            });
            const lotes = new Map((await prisma.lot.findMany({ where: { farmId: req.reproFarm.id }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
            res.json({
                sessoes: sessoes.map((s) => ({ ...s, lote: s.lotId ? lotes.get(s.lotId) || null : null, pendencias: Array.isArray(s.pendencias) ? s.pendencias : [] })),
                lotes: [...lotes].map(([id, name]) => ({ id, name })),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar os toques.' });
        }
    });

    app.get('/farms/:farmId/reproducao/toque/sessoes/:id', async (req, res) => {
        try {
            const sessao = await prisma.reproDiagnosisSession.findFirst({
                where: { id: String(req.params.id), farmId: req.reproFarm.id },
                include: { events: { where: { type: 'DIAGNOSTICO_PRENHEZ' }, include: { animal: { select: { brinco: true } } }, orderBy: { createdAt: 'asc' } } },
            });
            if (!sessao) return res.status(404).json({ message: 'Toque não encontrado.' });
            res.json({
                sessao: { ...sessao, events: undefined, pendencias: Array.isArray(sessao.pendencias) ? sessao.pendencias : [] },
                diagnosticos: sessao.events.map((e) => ({ id: e.id, animalId: e.animalId, brinco: e.animal.brinco, ...e.payload, obs: e.notes })),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao abrir o toque.' });
        }
    });

    app.delete('/farms/:farmId/reproducao/toque/sessoes/:id', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const sessao = await prisma.reproDiagnosisSession.findFirst({ where: { id: String(req.params.id), farmId }, include: { events: { select: { animalId: true } } } });
            if (!sessao) return res.status(404).json({ message: 'Toque não encontrado.' });
            const animalIds = [...new Set(sessao.events.map((e) => e.animalId))];
            const config = await carregarConfig(farmId);
            await prisma.$transaction(async (tx) => {
                await tx.reproEvent.deleteMany({ where: { diagnosisSessionId: sessao.id } });
                await tx.reproDiagnosisSession.delete({ where: { id: sessao.id } });
                for (const id of animalIds) await recalcularVaca(tx, id, config);
            }, { timeout: 60000 });
            void logActivity(prisma, req, { action: 'REPRO_TOQUE_APAGADO', entity: 'ReproDiagnosisSession', entityId: sessao.id, description: `Apagou toque de ${sessao.date.toISOString().slice(0, 10)}`, farmId });
            res.json({ ok: true, vacasRecalculadas: animalIds.length });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao apagar o toque.' });
        }
    });

    // Resolve uma pendência: o produtor diz de qual vaca era a linha.
    app.post('/farms/:farmId/reproducao/toque/sessoes/:id/pendencias/:indice', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const sessao = await prisma.reproDiagnosisSession.findFirst({ where: { id: String(req.params.id), farmId } });
            if (!sessao) return res.status(404).json({ message: 'Toque não encontrado.' });
            const pendencias = Array.isArray(sessao.pendencias) ? [...sessao.pendencias] : [];
            const indice = Number.parseInt(req.params.indice, 10);
            const pendencia = pendencias[indice];
            if (!pendencia) return res.status(404).json({ message: 'Pendência não encontrada.' });
            if (req.body?.descartar) {
                pendencias.splice(indice, 1);
                await prisma.reproDiagnosisSession.update({ where: { id: sessao.id }, data: { pendencias } });
                return res.json({ ok: true, pendencias });
            }
            const animal = await prisma.animal.findFirst({
                where: { id: String(req.body?.animalId || ''), farmId },
                select: { id: true, brinco: true, sexo: true, status: true, reproEvents: { orderBy: { date: 'asc' } } },
            });
            if (!animal) return res.status(400).json({ message: 'Escolha a vaca.' });
            const chave = normalizarIdent(animal.brinco);
            const vacas = new Map([[chave, {
                id: animal.id, sexo: animal.sexo, vivo: animal.status === 'VIVO',
                liberada: animal.reproEvents.some((e) => e.type === 'LIBERACAO'),
                descartada: animal.reproEvents.some((e) => e.type === 'DESCARTE'),
            }]]);
            const eventosPorVaca = new Map([[animal.id, animal.reproEvents]]);
            const jaNoToque = await prisma.reproEvent.count({ where: { diagnosisSessionId: sessao.id, animalId: animal.id, type: 'DIAGNOSTICO_PRENHEZ' } });
            if (jaNoToque) return res.status(400).json({ message: 'Esta vaca já tem diagnóstico neste toque.' });
            const r = processarToque([{ ...pendencia, brinco: animal.brinco }], { data: sessao.date, vacas, eventosPorVaca });
            if (!r.validas.length) return res.status(400).json({ message: r.pendencias[0]?.motivo || 'Não foi possível lançar.' });
            pendencias.splice(indice, 1);
            const config = await carregarConfig(farmId);
            await prisma.$transaction(async (tx) => {
                await gravarDiagnosticos(tx, { farmId, sessao, validas: r.validas, data: sessao.date, metodo: sessao.metodo, vetName: sessao.vetName, userId: req.user?.id || null, config });
                await tx.reproDiagnosisSession.update({ where: { id: sessao.id }, data: { pendencias } });
            });
            res.json({ ok: true, pendencias });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao resolver a pendência.' });
        }
    });

    // Vazias aguardando decisão do produtor.
    app.get('/farms/:farmId/reproducao/decidir', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const vacas = await prisma.animal.findMany({
                where: { farmId, sexo: 'FEMEA', status: 'VIVO', reproEvents: { some: { type: 'DIAGNOSTICO_PRENHEZ' }, none: { type: 'DESCARTE' } } },
                select: { id: true, brinco: true, lot: { select: { name: true } }, reproEvents: { orderBy: { date: 'asc' } } },
            });
            const lista = [];
            for (const v of vacas) {
                const diag = aguardaDecisao(v.reproEvents);
                if (!diag) continue;
                const n = numerosDaVaca(v.reproEvents);
                const s = calcularSituacao(v.reproEvents);
                lista.push({ id: v.id, brinco: v.brinco, lote: v.lot?.name || null, vaziaEm: diag.date, categoria: s.categoria, vaziasSeguidas: n.vaziasSeguidas, perdaRecente: v.reproEvents.some((e) => e.type === 'PERDA' && e.payload?.origemDiagnosticoId === diag.id) });
            }
            lista.sort((a, b) => new Date(a.vaziaEm) - new Date(b.vaziaEm));
            res.json({ vacas: lista, decisoes: DECISOES_VAZIA, motivosDescarte: MOTIVOS_DESCARTE });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar as vazias.' });
        }
    });

    app.post('/farms/:farmId/reproducao/decidir', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const decisao = String(req.body?.decisao || '');
            const ids = [...new Set((Array.isArray(req.body?.animalIds) ? req.body.animalIds : []).map(String))].slice(0, MAX_LOTE);
            if (!ids.length) return res.status(400).json({ message: 'Selecione ao menos uma vaca.' });
            if (![...DECISOES_VAZIA, 'DESCARTE'].includes(decisao)) return res.status(400).json({ message: 'Decisão inválida.' });
            const motivo = decisao === 'DESCARTE' ? String(req.body?.motivo || '') : null;
            if (decisao === 'DESCARTE' && !MOTIVOS_DESCARTE.includes(motivo)) return res.status(400).json({ message: 'Informe o motivo do descarte.' });
            const vacas = await prisma.animal.findMany({ where: { farmId, id: { in: ids }, sexo: 'FEMEA' }, select: { id: true, lotId: true } });
            const data = new Date();
            const config = await carregarConfig(farmId);
            await prisma.$transaction(async (tx) => {
                for (const v of vacas) {
                    await tx.reproEvent.create({
                        data: decisao === 'DESCARTE'
                            ? { farmId, animalId: v.id, type: 'DESCARTE', date: data, lotId: v.lotId, createdById: req.user?.id || null, payload: { motivo } }
                            : { farmId, animalId: v.id, type: 'OBSERVACAO', date: data, lotId: v.lotId, createdById: req.user?.id || null, payload: { decisao } },
                    });
                    await recalcularVaca(tx, v.id, config);
                }
            }, { timeout: 60000 });
            void logActivity(prisma, req, { action: 'REPRO_DECISAO_VAZIA', entity: 'Animal', entityId: vacas[0]?.id, description: `Decisão ${decisao} para ${vacas.length} vaca(s)`, farmId });
            res.json({ ok: true, total: vacas.length });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar a decisão.' });
        }
    });

    // ---------- Fase 3: parto e desmama ----------

    const DIA = 24 * 60 * 60 * 1000;

    app.get('/farms/:farmId/reproducao/partos', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const agora = new Date();
            const prenhes = await prisma.animal.findMany({
                where: { farmId, sexo: 'FEMEA', status: 'VIVO', statusReprodutivo: 'PRENHE' },
                select: { id: true, brinco: true, previsaoParto: true, lot: { select: { name: true } } },
                orderBy: { previsaoParto: 'asc' },
            });
            const previstos = [];
            let semPrevisao = 0;
            for (const v of prenhes) {
                if (!v.previsaoParto) { semPrevisao += 1; continue; }
                const status = statusPrevisao(v.previsaoParto, agora);
                if (status) previstos.push({ id: v.id, brinco: v.brinco, lote: v.lot?.name || null, previsaoParto: v.previsaoParto, status });
            }
            const recentes = await prisma.reproEvent.findMany({
                where: { farmId, type: 'PARTO', date: { gte: new Date(agora.getTime() - 90 * DIA) } },
                include: { animal: { select: { brinco: true } } },
                orderBy: { date: 'desc' },
                take: 200,
            });
            res.json({
                previstos,
                semPrevisao,
                recentes: recentes.map((e) => ({ id: e.id, vacaId: e.animalId, brinco: e.animal.brinco, date: e.date, payload: e.payload || {} })),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar os partos.' });
        }
    });

    app.post('/farms/:farmId/reproducao/partos', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const body = req.body || {};
            const clientId = body.clientId ? String(body.clientId).slice(0, 64) : null;
            if (clientId) {
                const existente = await prisma.reproEvent.findFirst({ where: { farmId, type: 'PARTO', payload: { path: ['clientId'], equals: clientId } }, select: { id: true } });
                if (existente) return res.json({ repetido: true, eventoId: existente.id });
            }
            const identVaca = normalizarIdent(body.brinco);
            const candidatas = await prisma.animal.findMany({
                where: body.vacaId ? { id: String(body.vacaId), farmId } : { farmId, brinco: { in: [identVaca, String(body.brinco || '').trim(), String(body.brinco || '').trim().toLowerCase()] } },
                include: { reproEvents: { orderBy: { date: 'asc' } } },
            });
            if (candidatas.length !== 1) {
                return res.status(400).json({ message: candidatas.length ? `Identificação ${body.brinco} repetida no rebanho — abra pela ficha.` : `Vaca ${body.brinco || ''} não encontrada.` });
            }
            const mae = candidatas[0];
            const data = parseData(body.data);
            const crias = (Array.isArray(body.crias) ? body.crias : []).map((c) => ({
                sexo: String(c?.sexo || '').toUpperCase(),
                vivo: c?.vivo !== false,
                peso: c?.peso === '' || c?.peso == null ? null : Number(c.peso),
                identificacao: c?.identificacao ? String(c.identificacao).trim().slice(0, 40) : null,
            }));
            const { erros, avisos } = validarParto({ data, crias, tipoParto: body.tipoParto }, { eventos: mae.reproEvents, sexo: mae.sexo });
            if (mae.status !== 'VIVO') erros.push('Vaca vendida ou morta.');
            if (erros.length) return res.status(400).json({ message: erros[0], erros });

            for (const c of crias.filter((x) => x.vivo && x.identificacao)) {
                const dup = await prisma.animal.findFirst({ where: { farmId, identityKey: normalizeAnimalIdentityKey(c.identificacao) }, select: { id: true } });
                if (dup) return res.status(409).json({ message: `Identificação ${c.identificacao} já existe na fazenda.` });
            }

            const cobertura = mae.reproEvents.filter((e) => (e.type === 'COBERTURA' || e.type === 'IATF') && new Date(e.date) <= data).pop();
            const paiNome = cobertura?.payload?.touro ? String(cobertura.payload.touro) : null;
            const ecc = Number(body.ecc) >= 1 && Number(body.ecc) <= 5 ? Number(body.ecc) : null;
            const config = await carregarConfig(farmId);

            const resultado = await prisma.$transaction(async (tx) => {
                const criadas = [];
                for (const c of crias) {
                    if (!c.vivo) { criadas.push({ sexo: c.sexo, vivo: false, peso: c.peso }); continue; }
                    const seq = await tx.animal.update({ where: { id: mae.id }, data: { ultimaSequenciaCria: { increment: 1 } }, select: { ultimaSequenciaCria: true, brinco: true } });
                    const provisoria = buildProvisionalIdentification(seq.brinco || mae.id, seq.ultimaSequenciaCria);
                    const brinco = c.identificacao || provisoria;
                    const bezerro = await tx.animal.create({
                        data: {
                            farmId, brinco, identityKey: normalizeAnimalIdentityKey(brinco),
                            raca: mae.raca || 'Não informada', sexo: c.sexo, dataNascimento: data,
                            pesoAtual: c.peso, currentPaddockId: mae.currentPaddockId, lotId: mae.lotId,
                            maeId: mae.id, paiNome, matrizResponsavelId: mae.id,
                            identificacaoProvisoria: !c.identificacao, identificacaoProvisoriaOriginal: provisoria,
                            identificacaoMatrizSnapshot: seq.brinco, sequenciaMatriz: seq.ultimaSequenciaCria,
                            origemNascimento: 'NATURAL', receptoraGestacionalId: mae.id, receptoraGestacionalSnapshot: seq.brinco,
                            touroSnapshot: paiNome,
                        },
                    });
                    if (mae.currentPaddockId) {
                        await tx.paddockMove.create({ data: { farmId, paddockId: mae.currentPaddockId, animalId: bezerro.id, startAt: data } });
                    }
                    await tx.herdEvent.create({
                        data: { farmId, animalId: bezerro.id, type: 'NASCIMENTO', date: data, peso: c.peso, observacoes: `Nascimento registrado na Reprodução — mãe: ${seq.brinco}` },
                    });
                    criadas.push({ sexo: c.sexo, vivo: true, peso: c.peso, calfAnimalId: bezerro.id, brinco });
                }
                const primeira = criadas.find((c) => c.vivo);
                const evento = await tx.reproEvent.create({
                    data: {
                        farmId, animalId: mae.id, type: 'PARTO', date: data, lotId: mae.lotId, createdById: req.user?.id || null,
                        notes: body.obs ? String(body.obs).slice(0, 1000) : null,
                        payload: {
                            clientId, tipoParto: body.tipoParto, ecc, gemeos: crias.length > 1, crias: criadas,
                            calfAnimalId: primeira?.calfAnimalId || null, calfSex: primeira?.sexo || null, birthOrigin: 'NATURAL', avisos,
                        },
                    },
                });
                await recalcularVaca(tx, mae.id, config);
                return { evento, criadas };
            }, { timeout: 60000 });
            void logActivity(prisma, req, { action: 'REPRO_PARTO', entity: 'ReproEvent', entityId: resultado.evento.id, description: `Parto da ${mae.brinco}: ${resultado.criadas.length} cria(s)`, farmId });
            res.status(201).json({ eventoId: resultado.evento.id, crias: resultado.criadas, avisos });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar o parto.' });
        }
    });

    app.delete('/farms/:farmId/reproducao/partos/:eventId', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const evento = await prisma.reproEvent.findFirst({ where: { id: String(req.params.eventId), farmId, type: 'PARTO' } });
            if (!evento) return res.status(404).json({ message: 'Parto não encontrado.' });
            const ids = (Array.isArray(evento.payload?.crias) ? evento.payload.crias : []).map((c) => c.calfAnimalId).filter(Boolean);
            if (!ids.length && evento.payload?.calfAnimalId) ids.push(evento.payload.calfAnimalId);
            for (const id of ids) {
                const [pesagens, eventosHerd, repro, sanidade, filhos, bez] = await Promise.all([
                    prisma.weighing.count({ where: { animalId: id } }),
                    prisma.herdEvent.count({ where: { animalId: id, NOT: { type: 'NASCIMENTO' } } }),
                    prisma.reproEvent.count({ where: { animalId: id } }),
                    prisma.sanitaryApplication.count({ where: { animalId: id } }),
                    prisma.animal.count({ where: { maeId: id } }),
                    prisma.animal.findUnique({ where: { id }, select: { desmamadoEm: true, status: true } }),
                ]);
                if (pesagens || eventosHerd || repro || sanidade || filhos || bez?.desmamadoEm || (bez && bez.status !== 'VIVO')) {
                    return res.status(400).json({ message: 'O bezerro deste parto já tem outros registros (pesagem, vacina, desmama ou venda). Corrija pelo Rebanho.' });
                }
            }
            const config = await carregarConfig(farmId);
            await prisma.$transaction(async (tx) => {
                for (const id of ids) {
                    await tx.herdEvent.deleteMany({ where: { animalId: id } });
                    await tx.animal.deleteMany({ where: { id, farmId } });
                }
                await tx.reproEvent.delete({ where: { id: evento.id } });
                await recalcularVaca(tx, evento.animalId, config);
            });
            void logActivity(prisma, req, { action: 'REPRO_PARTO_APAGADO', entity: 'ReproEvent', entityId: evento.id, description: `Apagou parto e ${ids.length} bezerro(s)`, farmId });
            res.json({ ok: true, bezerrosApagados: ids.length });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao apagar o parto.' });
        }
    });

    async function pesosAoNascer(animalIds) {
        const eventos = await prisma.herdEvent.findMany({
            where: { animalId: { in: animalIds }, type: 'NASCIMENTO', peso: { not: null } },
            select: { animalId: true, peso: true },
        });
        return new Map(eventos.map((e) => [e.animalId, e.peso]));
    }

    app.get('/farms/:farmId/reproducao/desmama', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const agora = new Date();
            const config = await carregarConfig(farmId);
            const bezerros = await prisma.animal.findMany({
                where: {
                    farmId, status: 'VIVO', desmamadoEm: null,
                    OR: [{ maeId: { not: null } }, { matrizResponsavelId: { not: null } }],
                    dataNascimento: { gte: new Date(agora.getTime() - 540 * DIA) },
                },
                select: {
                    id: true, brinco: true, sexo: true, dataNascimento: true, pesoAtual: true, lotId: true,
                    mae: { select: { id: true, brinco: true } }, matrizResponsavel: { select: { id: true, brinco: true } },
                },
                orderBy: { dataNascimento: 'asc' },
            });
            const lista = bezerros.map((b) => {
                const idadeDias = b.dataNascimento ? Math.floor((agora - b.dataNascimento) / DIA) : null;
                const mae = b.matrizResponsavel || b.mae;
                return {
                    id: b.id, brinco: b.brinco, sexo: b.sexo, idadeDias, peso: b.pesoAtual,
                    mae: mae?.brinco || null, pronto: prontoParaDesmama({ idadeDias, peso: b.pesoAtual }, config || {}),
                };
            });
            const recentes = await prisma.reproEvent.findMany({
                where: { farmId, type: 'DESMAME', date: { gte: new Date(agora.getTime() - 90 * DIA) } },
                include: { animal: { select: { brinco: true } } },
                orderBy: { date: 'desc' },
                take: 300,
            });
            res.json({
                bezerros: lista,
                criteriosDefinidos: Boolean(config && (config.desmamaIdadeMeses != null || config.desmamaPesoKg != null)),
                recentes: recentes.map((e) => ({ id: e.id, mae: e.animal.brinco, date: e.date, payload: e.payload || {} })),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar os bezerros.' });
        }
    });

    app.post('/farms/:farmId/reproducao/desmama', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const body = req.body || {};
            const data = parseData(body.data);
            if (!data || data > new Date(Date.now() + DIA)) return res.status(400).json({ message: 'Data da desmama inválida.' });
            const linhas = (Array.isArray(body.linhas) ? body.linhas : []).slice(0, MAX_LOTE);
            if (!linhas.length) return res.status(400).json({ message: 'Nenhum bezerro lançado.' });
            const config = await carregarConfig(farmId);
            const feitos = [];
            const erros = [];
            for (const l of linhas) {
                const ident = String(l?.brinco || '').trim();
                const where = l?.animalId ? { id: String(l.animalId), farmId } : { farmId, brinco: { in: [ident, ident.toUpperCase(), ident.toLowerCase()] } };
                const achados = await prisma.animal.findMany({
                    where,
                    select: { id: true, brinco: true, dataNascimento: true, desmamadoEm: true, maeId: true, matrizResponsavelId: true },
                    take: 2,
                });
                if (achados.length !== 1) { erros.push({ brinco: ident, motivo: achados.length ? 'Identificação repetida' : 'Não encontrado' }); continue; }
                const b = achados[0];
                if (b.desmamadoEm) {
                    // Reenvio de toque feito sem internet: já está gravado, não é erro.
                    if (new Date(b.desmamadoEm).toISOString().slice(0, 10) === data.toISOString().slice(0, 10)) { feitos.push({ brinco: b.brinco, repetido: true }); continue; }
                    erros.push({ brinco: b.brinco, motivo: 'Desmama já registrada' });
                    continue;
                }
                const peso = Number(l?.peso);
                const r = await weanCalf({
                    req: { ...req, body: { date: body.data, peso, lotId: body.lotId || null, paddockId: body.paddockId || null } },
                    animalId: b.id,
                });
                if (r?.error) { erros.push({ brinco: b.brinco, motivo: r.error.message }); continue; }
                const idadeDias = b.dataNascimento ? Math.floor((data - b.dataNascimento) / DIA) : null;
                const pn = (await pesosAoNascer([b.id])).get(b.id) ?? config?.pesoNascerKg ?? null;
                const ajustado = pesoAjustado205({ peso, idadeDias, pesoNascer: pn });
                const precoce = idadeDias != null && idadeDias < DESMAMA_PRECOCE_DIAS;
                const maeId = b.matrizResponsavelId || b.maeId;
                if (maeId) {
                    await prisma.reproEvent.create({
                        data: {
                            farmId, animalId: maeId, type: 'DESMAME', date: data, createdById: req.user?.id || null,
                            payload: { bezerroId: b.id, bezerro: b.brinco, peso, idadeDias, pesoNascerUsado: pn, pesoAjustado205: ajustado, precoce },
                        },
                    });
                }
                feitos.push({ brinco: b.brinco, peso, pesoAjustado205: ajustado, precoce, semMae: !maeId });
            }
            void logActivity(prisma, req, { action: 'REPRO_DESMAMA', entity: 'Animal', entityId: null, description: `Desmama: ${feitos.length} bezerro(s), ${erros.length} com erro`, farmId });
            res.json({ feitos, erros });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar a desmama.' });
        }
    });

    // Desfaz a desmama (pesagem, evento do Rebanho e registro na ficha da mãe). Lote/pasto não voltam sozinhos.
    app.delete('/farms/:farmId/reproducao/desmama/:eventId', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const evento = await prisma.reproEvent.findFirst({ where: { id: String(req.params.eventId), farmId, type: 'DESMAME' } });
            if (!evento) return res.status(404).json({ message: 'Desmama não encontrada.' });
            const bezerroId = evento.payload?.bezerroId;
            const dia = new Date(evento.date);
            const inicio = new Date(dia.getTime() - DIA);
            const fim = new Date(dia.getTime() + DIA);
            await prisma.$transaction(async (tx) => {
                if (bezerroId) {
                    await tx.herdEvent.deleteMany({ where: { animalId: bezerroId, type: 'DESMAMA', date: { gte: inicio, lte: fim } } });
                    await tx.weighing.deleteMany({ where: { animalId: bezerroId, data: { gte: inicio, lte: fim }, peso: Number(evento.payload?.peso) || -1 } });
                    await tx.animal.updateMany({ where: { id: bezerroId, farmId }, data: { desmamadoEm: null, pesoDesmamaKg: null } });
                }
                await tx.reproEvent.delete({ where: { id: evento.id } });
            });
            res.json({ ok: true, aviso: 'Desmama desfeita. Se o bezerro mudou de lote ou pasto, ajuste no Rebanho.' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao desfazer a desmama.' });
        }
    });
}
