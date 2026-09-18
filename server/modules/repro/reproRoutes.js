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
    calcularIndicadores, farolVaca, mantidaAteProximoToque,
    agendaDoProtocolo, alertasBotijao, faltaDose, podeEntrarNoProtocolo, validarProtocolo,
} from './reproRules.js';

const prisma = new PrismaClient();
const MAX_LOTE = 2000;
const CONFIG_CAMPOS = {
    idadeMinMeses: 'int', pesoMinKg: 'float', eccMin: 'float', gestacaoDias: 'int',
    desmamaIdadeMeses: 'int', desmamaPesoKg: 'float', pesoNascerKg: 'float', minVacasIndicador: 'int',
    vaziasSeguidasLimite: 'int', iepMaxMeses: 'int', pesoMinDesmamaFarol: 'float',
    metaPrenhez: 'float', metaNatalidade: 'float', metaDesmama: 'float', metaIepMeses: 'float', metaIdadePrimeiroParto: 'float',
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

async function montarCandidatas(req, farmId, lotId) {
    const where = { farmId, sexo: 'FEMEA', status: 'VIVO', reproEvents: { none: { type: { in: ['LIBERACAO', 'DESCARTE'] } } } };
    if (lotId) where.lotId = String(lotId);
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
    return { lista, performance, config };
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
            const { lista, performance, config } = await montarCandidatas(req, req.reproFarm.id, req.query.lotId);
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
                farol: performance ? farolVaca(eventos, config || {}, new Date(), { animal }) : null,
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

    // ---------- Fase 4: indicadores, farol e painel (EIXO Performance) ----------

    const exigirPerformance = (req, res, next) => {
        if (temPerformance(req)) return next();
        return res.status(403).json({ code: 'entitlement_required', message: 'Indicadores e farol fazem parte do EIXO Performance.' });
    };

    const CATEGORIAS = ['Novilha', 'Primípara', 'Multípara'];

    async function carregarVacasComEventos(farmId, { lotId, categoria, incluirDescartadas = true } = {}) {
        const where = { farmId, sexo: 'FEMEA', reproEvents: { some: { type: 'LIBERACAO' } } };
        if (lotId) where.lotId = String(lotId);
        const vacas = await prisma.animal.findMany({
            where,
            select: { id: true, brinco: true, status: true, dataNascimento: true, lotId: true, lot: { select: { name: true } }, reproEvents: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] } },
        });
        return vacas
            .map((v) => ({ ...v, eventos: v.reproEvents, categoria: calcularSituacao(v.reproEvents).categoria }))
            .filter((v) => (!categoria || v.categoria === categoria))
            .filter((v) => incluirDescartadas || (v.status === 'VIVO' && !v.eventos.some((e) => e.type === 'DESCARTE')));
    }

    app.get('/farms/:farmId/reproducao/indicadores', exigirPerformance, async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const categoria = CATEGORIAS.includes(req.query.categoria) ? req.query.categoria : null;
            const [config, vacas, lotes] = await Promise.all([
                carregarConfig(farmId),
                carregarVacasComEventos(farmId, { lotId: req.query.lotId, categoria }),
                prisma.lot.findMany({ where: { farmId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
            ]);
            res.json({
                indicadores: calcularIndicadores(vacas, config || {}),
                janela: 'Últimos 12 meses',
                minimo: config?.minVacasIndicador || 10,
                totalVacas: vacas.length,
                lotes,
                categorias: CATEGORIAS,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao calcular os indicadores.' });
        }
    });

    app.get('/farms/:farmId/reproducao/farol', exigirPerformance, async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const config = await carregarConfig(farmId);
            const vacas = await carregarVacasComEventos(farmId, { incluirDescartadas: false });
            const agora = new Date();
            const lista = vacas.map((v) => {
                const f = farolVaca(v.eventos, config || {}, agora, { animal: v });
                return { id: v.id, brinco: v.brinco, lote: v.lot?.name || null, categoria: v.categoria, cor: f?.cor || null, motivos: f?.motivos || [], mantida: mantidaAteProximoToque(v.eventos) };
            });
            const resumo = { VERDE: 0, AMARELO: 0, VERMELHO: 0 };
            for (const v of lista) if (v.cor) resumo[v.cor] += 1;
            res.json({
                vacas: lista.filter((v) => v.cor !== 'VERDE').sort((a, b) => (a.cor === b.cor ? a.brinco.localeCompare(b.brinco) : a.cor === 'VERMELHO' ? -1 : 1)),
                descarte: lista.filter((v) => v.cor === 'VERMELHO' && !v.mantida),
                resumo,
                limitesDefinidos: Boolean(config && (config.vaziasSeguidasLimite || config.iepMaxMeses || config.pesoMinDesmamaFarol)),
                motivosDescarte: MOTIVOS_DESCARTE,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao montar o farol.' });
        }
    });

    // Manter: o produtor explica por que fica; some da lista até o próximo toque.
    app.post('/farms/:farmId/reproducao/farol/manter', exigirPerformance, async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const justificativa = String(req.body?.justificativa || '').trim().slice(0, 500);
            if (justificativa.length < 3) return res.status(400).json({ message: 'Escreva por que a vaca vai ficar.' });
            const vaca = await prisma.animal.findFirst({ where: { id: String(req.body?.animalId || ''), farmId, sexo: 'FEMEA' }, select: { id: true, brinco: true, lotId: true } });
            if (!vaca) return res.status(404).json({ message: 'Vaca não encontrada.' });
            await prisma.reproEvent.create({
                data: { farmId, animalId: vaca.id, type: 'OBSERVACAO', date: new Date(), lotId: vaca.lotId, createdById: req.user?.id || null, payload: { manter: true, justificativa }, notes: `Mantida no rebanho: ${justificativa}` },
            });
            void logActivity(prisma, req, { action: 'REPRO_MANTER', entity: 'Animal', entityId: vaca.id, description: `Manteve a ${vaca.brinco} apesar do farol vermelho`, farmId });
            res.json({ ok: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar.' });
        }
    });

    app.get('/farms/:farmId/reproducao/painel', exigirPerformance, async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const agora = new Date();
            const [config, vacas, candidatas, bezerros] = await Promise.all([
                carregarConfig(farmId),
                carregarVacasComEventos(farmId, { incluirDescartadas: false }),
                montarCandidatas(req, farmId, null),
                prisma.animal.findMany({
                    where: { farmId, status: 'VIVO', desmamadoEm: null, OR: [{ maeId: { not: null } }, { matrizResponsavelId: { not: null } }], dataNascimento: { gte: new Date(agora.getTime() - 540 * 86400000) } },
                    select: { dataNascimento: true, pesoAtual: true },
                }),
            ]);
            let vazias = 0;
            let atrasados = 0;
            let vermelhas = 0;
            for (const v of vacas) {
                if (aguardaDecisao(v.eventos)) vazias += 1;
                const s = calcularSituacao(v.eventos, config || {});
                if (s.situacao === 'PRENHE' && statusPrevisao(s.previsaoParto, agora) === 'ATRASADO') atrasados += 1;
                const f = farolVaca(v.eventos, config || {}, agora, { animal: v });
                if (f?.cor === 'VERMELHO' && !mantidaAteProximoToque(v.eventos)) vermelhas += 1;
            }
            const aptas = candidatas.lista.filter((c) => !c.bloqueios.length && c.farol?.cor === 'VERDE').length;
            const prontos = bezerros.filter((b) => prontoParaDesmama({ idadeDias: Math.floor((agora - b.dataNascimento) / 86400000), peso: b.pesoAtual }, config || {})).length;
            res.json({
                itens: [
                    { chave: 'vermelhas', titulo: 'Vacas no vermelho', total: vermelhas, aba: 'PAINEL' },
                    { chave: 'atrasados', titulo: 'Partos atrasados', total: atrasados, aba: 'PARTOS' },
                    { chave: 'vazias', titulo: 'Vazias para decidir', total: vazias, aba: 'DECIDIR' },
                    { chave: 'aptas', titulo: 'Fêmeas aptas para liberar', total: aptas, aba: 'CANDIDATAS' },
                    { chave: 'desmama', titulo: 'Bezerros prontos para desmama', total: prontos, aba: 'DESMAMA' },
                ],
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao montar o painel.' });
        }
    });

    // ---------- Fase 5: cobertura (monta natural e IATF) e botijão ----------

    // Protocolos ----------------------------------------------------------

    app.get('/farms/:farmId/reproducao/protocolos', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const [protocolos, produtos] = await Promise.all([
                prisma.reproProtocol.findMany({ where: { farmId }, orderBy: { nome: 'asc' } }),
                prisma.pharmacyProduct.findMany({
                    where: { farmId, active: true },
                    select: { id: true, name: true, unit: true, applicationUnit: true, batches: { select: { id: true, lotNumber: true, quantity: true, expiresAt: true } } },
                    orderBy: { name: 'asc' },
                }),
            ]);
            res.json({ protocolos, produtos });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar os protocolos.' });
        }
    });

    app.post('/farms/:farmId/reproducao/protocolos', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const nome = String(req.body?.nome || '').trim().slice(0, 120);
            const passos = (Array.isArray(req.body?.passos) ? req.body.passos : []).map((p) => ({
                dia: Number.parseInt(p?.dia, 10),
                titulo: String(p?.titulo || '').trim().slice(0, 160),
                produtoId: p?.produtoId ? String(p.produtoId) : null,
                dose: p?.dose === '' || p?.dose == null ? null : Number(p.dose),
            }));
            const { erros } = validarProtocolo({ nome, passos });
            if (erros.length) return res.status(400).json({ message: erros[0], erros });
            const protocolo = req.body?.id
                ? await prisma.reproProtocol.update({ where: { id: String(req.body.id) }, data: { nome, passos } })
                : await prisma.reproProtocol.create({ data: { farmId, nome, passos } });
            void logActivity(prisma, req, { action: 'REPRO_PROTOCOLO', entity: 'ReproProtocol', entityId: protocolo.id, description: `Protocolo ${nome}`, farmId });
            res.json({ protocolo });
        } catch (error) {
            if (error?.code === 'P2002') return res.status(409).json({ message: 'Já existe um protocolo com esse nome.' });
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar o protocolo.' });
        }
    });

    app.delete('/farms/:farmId/reproducao/protocolos/:id', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const protocolo = await prisma.reproProtocol.findFirst({ where: { id: String(req.params.id), farmId }, select: { id: true } });
            if (!protocolo) return res.status(404).json({ message: 'Protocolo não encontrado.' });
            const emUso = await prisma.iatfSession.count({ where: { protocolId: protocolo.id } });
            if (emUso) {
                await prisma.reproProtocol.update({ where: { id: protocolo.id }, data: { ativo: false } });
                return res.json({ ok: true, desativado: true });
            }
            await prisma.reproProtocol.delete({ where: { id: protocolo.id } });
            res.json({ ok: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao apagar o protocolo.' });
        }
    });

    // Botijão e estoque de sêmen (mesmas tabelas do Eixo Acasalamento) -----

    app.get('/farms/:farmId/reproducao/botijao', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const [tanques, partidas] = await Promise.all([
                prisma.semenTank.findMany({ where: { farmId }, include: { readings: { orderBy: { date: 'desc' }, take: 10 } }, orderBy: { name: 'asc' } }),
                prisma.semenBatch.findMany({
                    where: { farmId },
                    select: {
                        id: true, lote: true, bullName: true, bullRegistry: true, fornecedor: true, dosesTotal: true,
                        dosesDisponiveis: true, tankId: true, caneca: true, custoDose: true, dataColeta: true,
                        bullAnimal: { select: { brinco: true } },
                    },
                    orderBy: { lote: 'asc' },
                }),
            ]);
            res.json({
                tanques: tanques.map((t) => ({ ...t, readings: [...t.readings].reverse() })),
                partidas: partidas.map((p) => ({ ...p, touro: p.bullName || p.bullAnimal?.brinco || 'Sem nome' })),
                alertas: alertasBotijao(tanques.map((t) => ({ ...t, readings: [...t.readings].reverse() }))),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao carregar o botijão.' });
        }
    });

    app.post('/farms/:farmId/reproducao/botijao/tanques', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const dados = {
                name: String(req.body?.name || '').trim().slice(0, 80),
                canecas: Number.parseInt(req.body?.canecas, 10) || null,
                nivelMinCm: req.body?.nivelMinCm ? Number(req.body.nivelMinCm) : null,
                intervaloMedicaoDias: Number.parseInt(req.body?.intervaloMedicaoDias, 10) || null,
                ultimaRecargaEm: parseData(req.body?.ultimaRecargaEm),
                notes: req.body?.notes ? String(req.body.notes).slice(0, 500) : null,
            };
            if (!dados.name) return res.status(400).json({ message: 'Dê um nome ao botijão.' });
            const tanque = req.body?.id
                ? await prisma.semenTank.update({ where: { id: String(req.body.id) }, data: dados })
                : await prisma.semenTank.create({ data: { farmId, ...dados } });
            res.json({ tanque });
        } catch (error) {
            if (error?.code === 'P2002') return res.status(409).json({ message: 'Já existe um botijão com esse nome.' });
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar o botijão.' });
        }
    });

    app.post('/farms/:farmId/reproducao/botijao/tanques/:id/medicoes', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const tanque = await prisma.semenTank.findFirst({ where: { id: String(req.params.id), farmId }, select: { id: true, name: true } });
            if (!tanque) return res.status(404).json({ message: 'Botijão não encontrado.' });
            const data = parseData(req.body?.data) || new Date();
            const nivelCm = req.body?.nivelCm === '' || req.body?.nivelCm == null ? null : Number(req.body.nivelCm);
            if (nivelCm != null && !(nivelCm >= 0)) return res.status(400).json({ message: 'Nível inválido.' });
            const recarregado = Boolean(req.body?.recarregado);
            await prisma.$transaction(async (tx) => {
                await tx.semenTankReading.create({
                    data: { tankId: tanque.id, date: data, nivelCm, recarregado, notes: req.body?.notes ? String(req.body.notes).slice(0, 300) : null, createdById: req.user?.id || null },
                });
                if (recarregado) await tx.semenTank.update({ where: { id: tanque.id }, data: { ultimaRecargaEm: data } });
            });
            res.json({ ok: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar a medição.' });
        }
    });

    app.post('/farms/:farmId/reproducao/botijao/partidas', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const lote = String(req.body?.lote || '').trim().slice(0, 80);
            const doses = Number.parseInt(req.body?.doses, 10);
            if (!lote) return res.status(400).json({ message: 'Informe a partida (lote) do sêmen.' });
            if (!(doses > 0)) return res.status(400).json({ message: 'Informe quantas doses entraram.' });
            const dados = {
                bullName: req.body?.touro ? String(req.body.touro).trim().slice(0, 120) : null,
                bullRegistry: req.body?.registro ? String(req.body.registro).trim().slice(0, 60) : null,
                fornecedor: req.body?.fornecedor ? String(req.body.fornecedor).trim().slice(0, 120) : null,
                dataColeta: parseData(req.body?.dataColeta),
                tankId: req.body?.tankId ? String(req.body.tankId) : null,
                caneca: req.body?.caneca ? String(req.body.caneca).trim().slice(0, 40) : null,
                custoDose: req.body?.custoDose ? Number(req.body.custoDose) : null,
            };
            if (dados.tankId && !(await prisma.semenTank.findFirst({ where: { id: dados.tankId, farmId }, select: { id: true } }))) {
                return res.status(400).json({ message: 'Botijão inválido.' });
            }
            const partida = await prisma.$transaction(async (tx) => {
                const criada = await tx.semenBatch.create({ data: { farmId, lote, dosesTotal: doses, dosesDisponiveis: doses, ...dados } });
                await tx.semenMove.create({ data: { semenBatchId: criada.id, date: new Date(), qty: doses, type: 'IN', notes: 'Entrada pela Reprodução' } });
                return criada;
            });
            void logActivity(prisma, req, { action: 'REPRO_SEMEN_ENTRADA', entity: 'SemenBatch', entityId: partida.id, description: `Entrada de ${doses} doses (${lote})`, farmId });
            res.status(201).json({ partida });
        } catch (error) {
            if (error?.code === 'P2002') return res.status(409).json({ message: 'Já existe uma partida com esse nome.' });
            console.error(error);
            res.status(500).json({ message: 'Erro ao lançar a entrada de sêmen.' });
        }
    });

    app.put('/farms/:farmId/reproducao/botijao/partidas/:id', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const partida = await prisma.semenBatch.findFirst({ where: { id: String(req.params.id), farmId }, select: { id: true } });
            if (!partida) return res.status(404).json({ message: 'Partida não encontrada.' });
            const data = {};
            if ('tankId' in req.body) data.tankId = req.body.tankId ? String(req.body.tankId) : null;
            if ('caneca' in req.body) data.caneca = req.body.caneca ? String(req.body.caneca).trim().slice(0, 40) : null;
            if ('custoDose' in req.body) data.custoDose = req.body.custoDose === '' || req.body.custoDose == null ? null : Number(req.body.custoDose);
            if (data.tankId && !(await prisma.semenTank.findFirst({ where: { id: data.tankId, farmId }, select: { id: true } }))) {
                return res.status(400).json({ message: 'Botijão inválido.' });
            }
            res.json({ partida: await prisma.semenBatch.update({ where: { id: partida.id }, data }) });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao salvar a partida.' });
        }
    });

    // Perda, descarte e acerto de contagem. Inseminação baixa sozinha.
    app.post('/farms/:farmId/reproducao/botijao/partidas/:id/movimentos', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const tipo = ['OUT', 'ADJUST'].includes(req.body?.tipo) ? req.body.tipo : null;
            if (!tipo) return res.status(400).json({ message: 'Informe perda/descarte (OUT) ou acerto de contagem (ADJUST).' });
            const qtd = Number.parseInt(req.body?.quantidade, 10);
            if (!Number.isInteger(qtd) || qtd === 0) return res.status(400).json({ message: 'Quantidade inválida.' });
            if (tipo === 'OUT' && qtd < 0) return res.status(400).json({ message: 'Quantidade inválida.' });
            const motivo = String(req.body?.motivo || '').trim().slice(0, 200);
            if (!motivo) return res.status(400).json({ message: 'Escreva o motivo.' });
            const partida = await prisma.semenBatch.findFirst({ where: { id: String(req.params.id), farmId } });
            if (!partida) return res.status(404).json({ message: 'Partida não encontrada.' });
            const delta = tipo === 'OUT' ? -qtd : qtd;
            const saldo = partida.dosesDisponiveis + delta;
            if (saldo < 0) return res.status(400).json({ message: `O botijão tem ${partida.dosesDisponiveis} dose(s) desta partida.` });
            await prisma.$transaction(async (tx) => {
                await tx.semenBatch.update({ where: { id: partida.id }, data: { dosesDisponiveis: saldo } });
                await tx.semenMove.create({ data: { semenBatchId: partida.id, date: new Date(), qty: Math.abs(qtd), type: tipo, notes: motivo } });
            });
            res.json({ ok: true, dosesDisponiveis: saldo });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao movimentar as doses.' });
        }
    });

    // Monta natural -------------------------------------------------------

    app.post('/farms/:farmId/reproducao/coberturas/monta-natural', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const inicio = parseData(req.body?.inicio);
            const fim = parseData(req.body?.fim);
            const touro = String(req.body?.touro || '').trim().slice(0, 120);
            if (!inicio) return res.status(400).json({ message: 'Informe quando o touro entrou no lote.' });
            if (fim && fim < inicio) return res.status(400).json({ message: 'A saída do touro não pode ser antes da entrada.' });
            if (!touro) return res.status(400).json({ message: 'Informe o touro.' });
            const lotId = req.body?.lotId ? String(req.body.lotId) : null;
            const where = { farmId, sexo: 'FEMEA', status: 'VIVO', reproEvents: { some: { type: 'LIBERACAO' }, none: { type: 'DESCARTE' } } };
            if (lotId) where.lotId = lotId;
            else if (Array.isArray(req.body?.animalIds) && req.body.animalIds.length) where.id = { in: req.body.animalIds.map(String) };
            else return res.status(400).json({ message: 'Escolha o lote ou as vacas.' });
            const vacas = await prisma.animal.findMany({ where, select: { id: true, brinco: true, lotId: true }, take: MAX_LOTE });
            if (!vacas.length) return res.status(400).json({ message: 'Nenhuma vaca liberada nesse lote.' });
            const config = await carregarConfig(farmId);
            await prisma.$transaction(async (tx) => {
                for (const v of vacas) {
                    await tx.reproEvent.create({
                        data: {
                            farmId, animalId: v.id, type: 'COBERTURA', date: inicio, lotId: v.lotId, createdById: req.user?.id || null,
                            notes: req.body?.notes ? String(req.body.notes).slice(0, 500) : null,
                            payload: { tipo: 'MONTA_NATURAL', touro, inicio, fim: fim || null, repasse: Boolean(req.body?.repasse) },
                        },
                    });
                    await recalcularVaca(tx, v.id, config);
                }
            }, { timeout: 60000 });
            void logActivity(prisma, req, { action: 'REPRO_MONTA_NATURAL', entity: 'Animal', entityId: vacas[0].id, description: `Touro ${touro} em ${vacas.length} vaca(s)`, farmId });
            res.status(201).json({ total: vacas.length });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao registrar a monta natural.' });
        }
    });

    // IATF ----------------------------------------------------------------

    app.get('/farms/:farmId/reproducao/iatf', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const sessoes = await prisma.iatfSession.findMany({
                where: { farmId },
                include: { protocol: { select: { nome: true, passos: true } } },
                orderBy: { dia0: 'desc' },
                take: 50,
            });
            const agora = new Date();
            res.json({
                sessoes: sessoes.map((s) => ({
                    id: s.id, dia0: s.dia0, status: s.status, responsavel: s.responsavel, lotId: s.lotId,
                    protocolo: s.protocol?.nome || null,
                    vacas: Array.isArray(s.vacas) ? s.vacas : [],
                    passosFeitos: Array.isArray(s.passosFeitos) ? s.passosFeitos : [],
                    agenda: s.protocol?.passos ? agendaDoProtocolo(s.protocol.passos, s.dia0, agora) : [],
                    resumo: s.resumo || null,
                })),
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao listar as IATF.' });
        }
    });

    app.post('/farms/:farmId/reproducao/iatf', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const clientId = req.body?.clientId ? String(req.body.clientId).slice(0, 64) : null;
            if (clientId) {
                const existente = await prisma.iatfSession.findUnique({ where: { farmId_clientId: { farmId, clientId } } });
                if (existente) return res.json({ sessao: existente, repetido: true });
            }
            const dia0 = parseData(req.body?.dia0);
            if (!dia0) return res.status(400).json({ message: 'Informe o dia 0 do protocolo.' });
            const protocolId = req.body?.protocolId ? String(req.body.protocolId) : null;
            const protocolo = protocolId ? await prisma.reproProtocol.findFirst({ where: { id: protocolId, farmId } }) : null;
            if (protocolId && !protocolo) return res.status(400).json({ message: 'Protocolo inválido.' });
            const lotId = req.body?.lotId ? String(req.body.lotId) : null;
            const where = { farmId, sexo: 'FEMEA', status: 'VIVO' };
            if (lotId) where.lotId = lotId;
            else if (Array.isArray(req.body?.animalIds) && req.body.animalIds.length) where.id = { in: req.body.animalIds.map(String) };
            else return res.status(400).json({ message: 'Escolha o lote ou as vacas.' });
            const candidatas = await prisma.animal.findMany({ where, include: { reproEvents: { orderBy: { date: 'asc' } } }, take: MAX_LOTE });
            const config = await carregarConfig(farmId);
            const abertas = await prisma.iatfSession.findMany({ where: { farmId, status: 'ABERTO' }, select: { vacas: true } });
            const jaEmProtocolo = new Set(abertas.flatMap((s) => (Array.isArray(s.vacas) ? s.vacas.map((v) => v.animalId) : [])));

            const dentro = [];
            const fora = [];
            for (const a of candidatas) {
                if (jaEmProtocolo.has(a.id)) { fora.push({ brinco: a.brinco, motivo: 'Já está em outro protocolo aberto' }); continue; }
                const r = podeEntrarNoProtocolo(a.reproEvents, config || {}, dia0);
                if (!r.ok) { fora.push({ brinco: a.brinco, motivo: r.motivo }); continue; }
                dentro.push({ animalId: a.id, brinco: a.brinco, avisos: r.avisos || [] });
            }
            if (!dentro.length) return res.status(400).json({ message: 'Nenhuma vaca pode entrar neste protocolo.', fora });

            // Sêmen e hormônio: avisa antes, não bloqueia o protocolo.
            const alertas = [];
            const doses = await prisma.semenBatch.aggregate({ where: { farmId }, _sum: { dosesDisponiveis: true } });
            const falta = faltaDose({ dosesDisponiveis: doses._sum.dosesDisponiveis || 0, vacas: dentro.length });
            if (falta) alertas.push(`Faltam ${falta} dose(s) de sêmen no botijão para ${dentro.length} vaca(s).`);
            for (const passo of (protocolo?.passos || []).filter((p) => p.produtoId && p.dose)) {
                const estoque = await prisma.pharmacyBatch.aggregate({ where: { farmId, productId: passo.produtoId }, _sum: { quantity: true } });
                const precisa = Number(passo.dose) * dentro.length;
                if ((estoque._sum.quantity || 0) < precisa) alertas.push(`Hormônio do dia ${passo.dia}: faltam ${Math.ceil(precisa - (estoque._sum.quantity || 0))} na Farmácia.`);
            }

            const sessao = await prisma.iatfSession.create({
                data: {
                    farmId, clientId, protocolId, dia0, lotId,
                    responsavel: req.body?.responsavel ? String(req.body.responsavel).slice(0, 120) : null,
                    vacas: dentro, resumo: { fora, alertas }, createdById: req.user?.id || null,
                },
            });
            void logActivity(prisma, req, { action: 'REPRO_IATF_ABERTA', entity: 'IatfSession', entityId: sessao.id, description: `IATF com ${dentro.length} vaca(s)`, farmId });
            res.status(201).json({ sessao, dentro, fora, alertas });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao abrir o protocolo.' });
        }
    });

    // Marca o passo do protocolo como feito e baixa o hormônio da Farmácia.
    app.post('/farms/:farmId/reproducao/iatf/:id/passos/:dia', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const sessao = await prisma.iatfSession.findFirst({ where: { id: String(req.params.id), farmId }, include: { protocol: true } });
            if (!sessao) return res.status(404).json({ message: 'Protocolo não encontrado.' });
            const dia = Number.parseInt(req.params.dia, 10);
            const passo = (sessao.protocol?.passos || []).find((p) => Number(p.dia) === dia);
            if (!passo) return res.status(404).json({ message: 'Passo não encontrado.' });
            const feitos = Array.isArray(sessao.passosFeitos) ? sessao.passosFeitos : [];
            if (feitos.some((f) => Number(f.dia) === dia)) return res.status(400).json({ message: 'Este passo já foi marcado.' });
            const vacas = Array.isArray(sessao.vacas) ? sessao.vacas : [];
            const consumo = passo.produtoId && passo.dose ? Number(passo.dose) * vacas.length : 0;
            let baixa = null;

            if (consumo > 0) {
                const lotes = await prisma.pharmacyBatch.findMany({
                    where: { farmId, productId: passo.produtoId, quantity: { gt: 0 } },
                    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
                });
                const total = lotes.reduce((s, l) => s + l.quantity, 0);
                if (total < consumo) return res.status(400).json({ message: `Farmácia: faltam ${Math.ceil(consumo - total)} para este passo.` });
                baixa = [];
                let restante = consumo;
                for (const l of lotes) {
                    if (restante <= 0) break;
                    const usar = Math.min(l.quantity, restante);
                    baixa.push({ batchId: l.id, usar, unitCost: l.unitCost });
                    restante -= usar;
                }
            }

            await prisma.$transaction(async (tx) => {
                for (const b of baixa || []) {
                    await tx.pharmacyBatch.update({ where: { id: b.batchId }, data: { quantity: { decrement: b.usar } } });
                    await tx.pharmacyMovement.create({
                        data: { farmId, productId: passo.produtoId, batchId: b.batchId, type: 'EXIT', quantity: b.usar, unitCost: b.unitCost, notes: `IATF dia ${dia}: ${vacas.length} vaca(s)` },
                    });
                }
                await tx.iatfSession.update({
                    where: { id: sessao.id },
                    data: { passosFeitos: [...feitos, { dia, data: new Date(), consumo, vacas: vacas.length }] },
                });
            });
            res.json({ ok: true, consumo });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao marcar o passo.' });
        }
    });

    app.post('/farms/:farmId/reproducao/iatf/:id/inseminacao', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const sessao = await prisma.iatfSession.findFirst({ where: { id: String(req.params.id), farmId } });
            if (!sessao) return res.status(404).json({ message: 'Protocolo não encontrado.' });
            if (sessao.status === 'INSEMINADO') return res.json({ repetido: true, message: 'Esta IATF já foi lançada.' });
            const data = parseData(req.body?.data) || new Date();
            const linhas = (Array.isArray(req.body?.linhas) ? req.body.linhas : []).slice(0, MAX_LOTE);
            if (!linhas.length) return res.status(400).json({ message: 'Nenhuma vaca inseminada.' });
            const vacas = new Map((Array.isArray(sessao.vacas) ? sessao.vacas : []).map((v) => [normalizarIdent(v.brinco), v]));
            const partidas = new Map((await prisma.semenBatch.findMany({ where: { farmId } })).map((p) => [p.id, p]));
            const config = await carregarConfig(farmId);

            const feitas = [];
            const pendencias = [];
            const usoPorPartida = new Map();
            for (const l of linhas) {
                const chave = normalizarIdent(l?.brinco);
                const vaca = vacas.get(chave);
                if (!vaca) { pendencias.push({ brinco: l?.brinco || '', motivo: 'Não está neste protocolo' }); continue; }
                if (feitas.some((f) => f.animalId === vaca.animalId)) { pendencias.push({ brinco: chave, motivo: 'Lançada duas vezes' }); continue; }
                const partida = partidas.get(String(l?.semenBatchId || ''));
                if (!partida) { pendencias.push({ brinco: chave, motivo: 'Partida de sêmen não encontrada' }); continue; }
                const usadas = (usoPorPartida.get(partida.id) || 0) + 1;
                if (usadas > partida.dosesDisponiveis) { pendencias.push({ brinco: chave, motivo: `Sem dose da partida ${partida.lote}` }); continue; }
                usoPorPartida.set(partida.id, usadas);
                feitas.push({ animalId: vaca.animalId, brinco: chave, partida, inseminador: l?.inseminador ? String(l.inseminador).slice(0, 120) : null });
            }
            if (!feitas.length) return res.status(400).json({ message: pendencias[0]?.motivo || 'Nada para lançar.', pendencias });

            await prisma.$transaction(async (tx) => {
                for (const f of feitas) {
                    await tx.reproEvent.create({
                        data: {
                            farmId, animalId: f.animalId, type: 'COBERTURA', date: data, lotId: sessao.lotId, createdById: req.user?.id || null,
                            protocol: sessao.protocolId, seasonId: sessao.seasonId,
                            payload: {
                                tipo: 'IATF', touro: f.partida.bullName || f.partida.lote, semenBatchId: f.partida.id, partida: f.partida.lote,
                                inseminador: f.inseminador, iatfSessionId: sessao.id, custoDose: f.partida.custoDose ?? null,
                            },
                        },
                    });
                    await recalcularVaca(tx, f.animalId, config);
                }
                for (const [partidaId, qtd] of usoPorPartida) {
                    await tx.semenBatch.update({ where: { id: partidaId }, data: { dosesDisponiveis: { decrement: qtd } } });
                    await tx.semenMove.create({ data: { semenBatchId: partidaId, date: data, qty: qtd, type: 'USE', notes: `IATF ${sessao.id.slice(0, 8)}` } });
                }
                await tx.iatfSession.update({
                    where: { id: sessao.id },
                    data: { status: 'INSEMINADO', resumo: { ...(sessao.resumo || {}), inseminadas: feitas.length, pendencias, dataInseminacao: data } },
                });
            }, { timeout: 60000 });
            void logActivity(prisma, req, { action: 'REPRO_IATF_INSEMINACAO', entity: 'IatfSession', entityId: sessao.id, description: `Inseminou ${feitas.length} vaca(s)`, farmId });
            res.json({ inseminadas: feitas.length, pendencias });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao lançar a inseminação.' });
        }
    });

    app.delete('/farms/:farmId/reproducao/iatf/:id', async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const sessao = await prisma.iatfSession.findFirst({ where: { id: String(req.params.id), farmId } });
            if (!sessao) return res.status(404).json({ message: 'Protocolo não encontrado.' });
            if (sessao.status === 'INSEMINADO') return res.status(400).json({ message: 'Já tem inseminação lançada: apague as coberturas pela ficha das vacas.' });
            await prisma.iatfSession.delete({ where: { id: sessao.id } });
            res.json({ ok: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Erro ao apagar o protocolo.' });
        }
    });
}
