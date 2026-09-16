import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { requireBillingAccess, requireEntitlement, requireModule, requireNonFieldWorker } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import { logActivity } from '../utils/activityLog.js';
import { findCatalogItem } from '../pharmacy/pharmacyCatalog.js';
import { calcularCarencia, extrairDosePorPeso, marcacoesDoProduto, montarPrevia } from './sanityRules.js';
import { RABIES_OPTIONS, calcularCarencias, carregarConfiguracao, carregarLembretes, limparCacheLembretes } from './sanityCalendar.js';

const prisma = new PrismaClient();
const MAX_ANIMAIS = 2000;
const ROUTES = new Set(['SUBCUTANEA', 'INTRAMUSCULAR', 'INTRAVENOSA', 'ORAL', 'POUR_ON', 'PULVERIZACAO', 'IMERSAO', 'OUTRA']);

const ANIMAL_SELECT = {
    id: true, brinco: true, sexo: true, status: true, dataNascimento: true,
    dataNascimentoEstimada: true, pesoAtual: true, lotId: true, currentPaddockId: true,
};

const normalizarBrinco = (value) => String(value ?? '').trim().toUpperCase();

const parseDataAplicacao = (value) => {
    if (!value) return new Date();
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const attachSanityFarm = async (req, res, next) => {
    try {
        const farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: String(req.params.farmId) }),
            select: { id: true, name: true },
        });
        if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
        req.sanityFarm = farm;
        return next();
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao validar a fazenda.' });
    }
};

// Busca os animais pela identificação digitada no curral (ou por lote/lista).
// Identificação que não existe ou que se repete volta para a tela — nunca some em silêncio.
async function resolverSelecao(farmId, selecao = {}) {
    const digitados = (Array.isArray(selecao.brincos) ? selecao.brincos : []).map((value) => String(value ?? '').trim()).filter(Boolean);
    const brincos = [...new Set(digitados.map(normalizarBrinco))];
    const variantes = [...new Set(digitados.flatMap((value) => [value, value.toUpperCase(), value.toLowerCase()]))];
    const animalIds = [...new Set((Array.isArray(selecao.animalIds) ? selecao.animalIds : []).map(String).filter(Boolean))];
    const lotId = selecao.lotId ? String(selecao.lotId) : null;

    const encontrados = new Map();
    const naoEncontrados = [];
    const repetidos = [];

    if (brincos.length) {
        const candidatos = await prisma.animal.findMany({
            where: { farmId, brinco: { in: variantes } },
            select: ANIMAL_SELECT,
        });
        for (const brinco of brincos) {
            const matches = candidatos.filter((animal) => normalizarBrinco(animal.brinco) === brinco);
            const vivos = matches.filter((animal) => animal.status === 'VIVO');
            if (!matches.length) naoEncontrados.push(brinco);
            else if (vivos.length > 1 || (!vivos.length && matches.length > 1)) repetidos.push(brinco);
            else {
                const animal = vivos[0] || matches[0];
                encontrados.set(animal.id, animal);
            }
        }
    }
    if (animalIds.length) {
        const porId = await prisma.animal.findMany({ where: { farmId, id: { in: animalIds } }, select: ANIMAL_SELECT });
        porId.forEach((animal) => encontrados.set(animal.id, animal));
    }
    if (lotId) {
        const doLote = await prisma.animal.findMany({ where: { farmId, lotId, status: 'VIVO' }, select: ANIMAL_SELECT });
        doLote.forEach((animal) => encontrados.set(animal.id, animal));
    }
    return { animais: [...encontrados.values()], naoEncontrados, repetidos };
}

async function montarContexto(req, res) {
    const farm = req.sanityFarm;
    const body = req.body || {};
    const appliedAt = parseDataAplicacao(body.appliedAt);
    if (!appliedAt) {
        res.status(400).json({ message: 'Data da aplicação inválida.' });
        return null;
    }
    if (appliedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        res.status(400).json({ message: 'A data da aplicação não pode ser no futuro.' });
        return null;
    }
    const doseModo = body.doseModo === 'POR_PESO' ? 'POR_PESO' : 'FIXA';
    const doseFixa = Number(body.doseFixa);
    const dosePorKg = Number(body.dosePorKg);
    const applicationPerUnitInformado = body.applicationPerUnit === '' || body.applicationPerUnit == null ? null : Number(body.applicationPerUnit);
    if (applicationPerUnitInformado !== null && !(applicationPerUnitInformado > 0)) {
        res.status(400).json({ message: 'Rendimento por unidade inválido.' });
        return null;
    }

    const product = await prisma.pharmacyProduct.findFirst({
        where: { id: String(body.productId || ''), farmId: farm.id, active: true },
    });
    if (!product) {
        res.status(400).json({ message: 'Escolha um produto da Farmácia.' });
        return null;
    }
    const batch = body.batchId
        ? await prisma.pharmacyBatch.findFirst({ where: { id: String(body.batchId), productId: product.id, farmId: farm.id } })
        : null;

    const selecao = await resolverSelecao(farm.id, body.selecao);
    if (selecao.animais.length > MAX_ANIMAIS) {
        res.status(400).json({ message: `Selecione no máximo ${MAX_ANIMAIS} animais por aplicação.` });
        return null;
    }
    const catalogItem = findCatalogItem(product.catalogKey);
    const previa = montarPrevia({
        animais: selecao.animais,
        product,
        catalogItem,
        batch,
        appliedAt,
        doseModo,
        doseFixa,
        dosePorKg,
        applicationPerUnit: applicationPerUnitInformado ?? product.applicationPerUnit,
    });
    return { farm, body, appliedAt, product, batch, catalogItem, selecao, previa, applicationPerUnitInformado };
}

const responderPrevia = (ctx) => ({
    ...ctx.previa,
    naoEncontrados: ctx.selecao.naoEncontrados,
    repetidos: ctx.selecao.repetidos,
});

export function registerSanityRoutes(app) {
    // /farms já passa por requireAuth (prefixo em authRoutes); aqui entra a trava de plano,
    // senão o plano gratuito alcançaria as rotas direto pela API.
    app.use(
        '/farms/:farmId/sanidade',
        requireNonFieldWorker,
        requireBillingAccess,
        requireEntitlement('EIXO_GESTAO', 'EIXO_DECISAO'),
        requireModule('Sanidade'),
        attachSanityFarm,
    );

    app.get('/farms/:farmId/sanidade/opcoes', async (req, res) => {
        const farm = req.sanityFarm;
        try {
            const [products, lots] = await Promise.all([
                prisma.pharmacyProduct.findMany({
                    where: { farmId: farm.id, active: true },
                    include: { batches: { where: { quantity: { gt: 0 } }, orderBy: { expiresAt: 'asc' } } },
                    orderBy: { name: 'asc' },
                }),
                prisma.lot.findMany({
                    where: { farmId: farm.id, status: 'ATIVO' },
                    select: { id: true, name: true, _count: { select: { animals: { where: { status: 'VIVO' } } } } },
                    orderBy: { name: 'asc' },
                }),
            ]);
            return res.json({
                products: products.map((product) => {
                    const catalogItem = findCatalogItem(product.catalogKey);
                    return {
                        id: product.id,
                        name: product.name,
                        manufacturer: product.manufacturer,
                        activeIngredient: product.activeIngredient,
                        category: product.category,
                        unit: product.unit,
                        applicationUnit: product.applicationUnit || 'ml',
                        applicationPerUnit: product.applicationPerUnit,
                        slaughterWithdrawalDays: product.slaughterWithdrawalDays,
                        suggestedRoute: catalogItem?.route || null,
                        suggestedDose: catalogItem?.dose || null,
                        suggestedDosePerKg: extrairDosePorPeso(catalogItem?.dose),
                        tags: [...marcacoesDoProduto(product, catalogItem)],
                        batches: product.batches.map((batch) => ({
                            id: batch.id,
                            lotNumber: batch.lotNumber,
                            expiresAt: batch.expiresAt,
                            quantity: Number(batch.quantity || 0),
                            unitCost: batch.unitCost,
                        })),
                    };
                }),
                lots: lots.map((lot) => ({ id: lot.id, name: lot.name, animals: lot._count.animals })),
                routes: [...ROUTES],
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar produtos e lotes.' });
        }
    });

    app.post('/farms/:farmId/sanidade/aplicacoes/preview', async (req, res) => {
        try {
            const ctx = await montarContexto(req, res);
            if (!ctx) return undefined;
            return res.json(responderPrevia(ctx));
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao conferir a aplicação.' });
        }
    });

    app.post('/farms/:farmId/sanidade/aplicacoes', async (req, res) => {
        try {
            const ctx = await montarContexto(req, res);
            if (!ctx) return undefined;
            const { farm, body, appliedAt, product, batch, previa, applicationPerUnitInformado } = ctx;
            const route = body.route ? String(body.route).toUpperCase() : null;
            if (route && !ROUTES.has(route)) return res.status(400).json({ message: 'Via de aplicação inválida.' });
            if (ctx.selecao.naoEncontrados.length || ctx.selecao.repetidos.length) {
                return res.status(409).json({ message: 'Há identificações não encontradas ou repetidas. Corrija antes de salvar.', ...responderPrevia(ctx) });
            }
            if (previa.bloqueiosGerais.length) {
                return res.status(409).json({ message: previa.bloqueiosGerais[0], ...responderPrevia(ctx) });
            }
            if (previa.resumo.bloqueados > 0 && body.aplicarSomenteAptos !== true) {
                return res.status(409).json({ message: 'Alguns animais não podem receber este produto.', ...responderPrevia(ctx) });
            }
            const aptos = previa.linhas.filter((linha) => linha.apto);
            if (!aptos.length) return res.status(409).json({ message: 'Nenhum animal pode receber este produto.', ...responderPrevia(ctx) });

            const groupId = randomUUID();
            const carencia = calcularCarencia(appliedAt, product);
            const consumo = previa.resumo.consumoEstoque;
            const custoPorDose = previa.resumo.custoTotal > 0 && previa.resumo.doseTotal > 0
                ? previa.resumo.custoTotal / previa.resumo.doseTotal
                : null;
            const text = (value) => String(value ?? '').trim() || null;

            await prisma.$transaction(async (tx) => {
                // Relê o saldo dentro da transação: duas lidas ao mesmo tempo não podem gastar o mesmo frasco.
                const updated = await tx.pharmacyBatch.updateMany({
                    where: { id: batch.id, quantity: { gte: consumo } },
                    data: { quantity: { decrement: consumo } },
                });
                if (updated.count !== 1) throw Object.assign(new Error('Estoque insuficiente.'), { status: 409 });

                if (applicationPerUnitInformado !== null && applicationPerUnitInformado !== product.applicationPerUnit) {
                    await tx.pharmacyProduct.update({ where: { id: product.id }, data: { applicationPerUnit: applicationPerUnitInformado } });
                }

                await tx.sanitaryApplication.createMany({
                    data: aptos.map((linha) => ({
                        farmId: farm.id,
                        groupId,
                        animalId: linha.animalId,
                        productId: product.id,
                        batchId: batch.id,
                        appliedAt,
                        dose: linha.dose,
                        doseUnit: previa.resumo.unidadeDose,
                        route,
                        appliedByName: text(body.appliedByName) || req.user?.name || null,
                        vetName: text(body.vetName),
                        vetCrmv: text(body.vetCrmv),
                        slaughterWithdrawalUntil: carencia.ate,
                        withdrawalUnknown: carencia.desconhecida,
                        unitCost: custoPorDose === null ? null : Math.round(custoPorDose * linha.dose * 100) / 100,
                        notes: text(body.notes),
                        createdByUserId: req.user?.id || null,
                    })),
                });

                await tx.pharmacyMovement.create({
                    data: {
                        farmId: farm.id,
                        productId: product.id,
                        batchId: batch.id,
                        type: 'EXIT',
                        quantity: consumo,
                        unitCost: batch.unitCost,
                        notes: `Sanidade: ${aptos.length} animais (aplicação ${groupId.slice(0, 8)})`,
                    },
                });

                // O custo já entrou no resultado da fazenda na compra. Aqui ele só fica guardado
                // por animal (unitCost) para o relatório de custo sanitário por lote e animal.
            });

            limparCacheLembretes(farm.id);
            void logActivity(prisma, req, {
                action: 'SANIDADE_APLICACAO',
                entity: 'SanitaryApplication',
                entityId: groupId,
                description: `Aplicou ${product.name} (lote ${batch.lotNumber}) em ${aptos.length} animais`,
                farmId: farm.id,
            });

            return res.status(201).json({
                groupId,
                aplicados: aptos.length,
                ignorados: previa.resumo.bloqueados,
                consumoEstoque: consumo,
                custoTotal: previa.resumo.custoTotal,
                carenciaAte: carencia.ate,
            });
        } catch (error) {
            if (error?.status === 409) return res.status(409).json({ message: error.message });
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar a aplicação.' });
        }
    });

    app.get('/farms/:farmId/sanidade/aplicacoes', async (req, res) => {
        const farm = req.sanityFarm;
        const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
        try {
            const grupos = await prisma.sanitaryApplication.groupBy({
                by: ['groupId'],
                where: { farmId: farm.id },
                _count: { _all: true },
                _sum: { dose: true, unitCost: true },
                _max: { appliedAt: true, createdAt: true },
                orderBy: { _max: { createdAt: 'desc' } },
                take: limit,
            });
            const primeiros = grupos.length
                ? await prisma.sanitaryApplication.findMany({
                    where: { groupId: { in: grupos.map((grupo) => grupo.groupId) } },
                    distinct: ['groupId'],
                    select: {
                        groupId: true, doseUnit: true, route: true, appliedByName: true, vetName: true,
                        slaughterWithdrawalUntil: true, withdrawalUnknown: true,
                        product: { select: { name: true, category: true } },
                        batch: { select: { lotNumber: true } },
                    },
                })
                : [];
            const porGrupo = new Map(primeiros.map((item) => [item.groupId, item]));
            return res.json({
                aplicacoes: grupos.map((grupo) => {
                    const info = porGrupo.get(grupo.groupId);
                    return {
                        groupId: grupo.groupId,
                        appliedAt: grupo._max.appliedAt,
                        animais: grupo._count._all,
                        doseTotal: grupo._sum.dose,
                        doseUnit: info?.doseUnit || null,
                        custoTotal: grupo._sum.unitCost,
                        produto: info?.product?.name || null,
                        categoria: info?.product?.category || null,
                        loteFrasco: info?.batch?.lotNumber || null,
                        via: info?.route || null,
                        aplicadoPor: info?.appliedByName || null,
                        veterinario: info?.vetName || null,
                        carenciaAte: info?.slaughterWithdrawalUntil || null,
                        carenciaDesconhecida: Boolean(info?.withdrawalUnknown),
                    };
                }),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar aplicações.' });
        }
    });

    // Custo sanitário por lote e por animal (gerencial). Não é lançamento no resultado:
    // o custo já entrou no resultado geral da fazenda na compra.
    app.get('/farms/:farmId/sanidade/custos', async (req, res) => {
        const farm = req.sanityFarm;
        const parse = (value, fim) => {
            if (!value) return null;
            const parsed = new Date(`${String(value).slice(0, 10)}T${fim ? '23:59:59.999' : '00:00:00.000'}Z`);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };
        const de = parse(req.query.de, false);
        const ate = parse(req.query.ate, true);
        try {
            const registros = await prisma.sanitaryApplication.findMany({
                where: {
                    farmId: farm.id,
                    ...(de || ate ? { appliedAt: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}),
                },
                select: {
                    unitCost: true,
                    animalId: true,
                    animal: { select: { brinco: true, lotId: true, lot: { select: { name: true } } } },
                },
            });
            const porLote = new Map();
            const porAnimal = new Map();
            let total = 0;
            for (const registro of registros) {
                const valor = Number(registro.unitCost || 0);
                total += valor;
                const loteKey = registro.animal.lotId || 'SEM_LOTE';
                const lote = porLote.get(loteKey) || { lotId: registro.animal.lotId, lote: registro.animal.lot?.name || 'Sem lote', custo: 0, aplicacoes: 0, animais: new Set() };
                lote.custo += valor;
                lote.aplicacoes += 1;
                lote.animais.add(registro.animalId);
                porLote.set(loteKey, lote);
                const animal = porAnimal.get(registro.animalId) || { animalId: registro.animalId, brinco: registro.animal.brinco, lote: registro.animal.lot?.name || null, custo: 0, aplicacoes: 0 };
                animal.custo += valor;
                animal.aplicacoes += 1;
                porAnimal.set(registro.animalId, animal);
            }
            const arred = (valor) => Math.round(valor * 100) / 100;
            return res.json({
                total: arred(total),
                porLote: [...porLote.values()]
                    .map((lote) => ({ lotId: lote.lotId, lote: lote.lote, custo: arred(lote.custo), aplicacoes: lote.aplicacoes, animais: lote.animais.size, custoPorAnimal: arred(lote.custo / lote.animais.size) }))
                    .sort((a, b) => b.custo - a.custo),
                porAnimal: [...porAnimal.values()]
                    .map((animal) => ({ ...animal, custo: arred(animal.custo) }))
                    .sort((a, b) => b.custo - a.custo)
                    .slice(0, 200),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao calcular o custo sanitário.' });
        }
    });

    // Animais que ainda não podem ir para o abate. A etapa 3 usa isto para travar a venda.
    app.get('/farms/:farmId/sanidade/carencia', async (req, res) => {
        try {
            return res.json({ animais: await calcularCarencias(req.sanityFarm.id) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao consultar carência.' });
        }
    });

    app.get('/farms/:farmId/sanidade/lembretes', async (req, res) => {
        try {
            const { lembretes, config } = await carregarLembretes(req.sanityFarm.id);
            return res.json({ lembretes, estado: config.estado, configurada: config.salvo });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao montar o calendário sanitário.' });
        }
    });

    app.get('/farms/:farmId/sanidade/configuracao', async (req, res) => {
        try {
            const config = await carregarConfiguracao(req.sanityFarm.id);
            return res.json({ ...config.settings, estado: config.estado, configurada: config.salvo });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar a configuração.' });
        }
    });

    app.put('/farms/:farmId/sanidade/configuracao', requireNonFieldWorker, async (req, res) => {
        const body = req.body || {};
        const rabiesRequired = String(body.rabiesRequired || '').toUpperCase();
        if (!RABIES_OPTIONS.has(rabiesRequired)) return res.status(400).json({ message: 'Responda se a raiva é obrigatória: Sim, Não ou Não sei.' });
        const meses = (value) => {
            const lista = Array.isArray(value) ? value.map(Number) : [];
            if (lista.some((mes) => !Number.isInteger(mes) || mes < 1 || mes > 12)) return null;
            return [...new Set(lista)].sort((a, b) => a - b);
        };
        const dewormMonths = meses(body.dewormMonths);
        const tickMonths = meses(body.tickMonths);
        if (!dewormMonths || !tickMonths) return res.status(400).json({ message: 'Meses inválidos.' });
        const data = {
            rabiesRequired,
            clostridialEnabled: body.clostridialEnabled !== false,
            reproductiveEnabled: body.reproductiveEnabled !== false,
            dewormEnabled: body.dewormEnabled !== false,
            dewormMonths,
            tickEnabled: body.tickEnabled === true,
            tickMonths,
        };
        try {
            await prisma.sanitarySettings.upsert({
                where: { farmId: req.sanityFarm.id },
                update: data,
                create: { farmId: req.sanityFarm.id, ...data },
            });
            limparCacheLembretes(req.sanityFarm.id);
            void logActivity(prisma, req, {
                action: 'SANIDADE_CONFIGURACAO',
                entity: 'SanitarySettings',
                entityId: req.sanityFarm.id,
                description: `Atualizou o calendário sanitário (raiva: ${rabiesRequired})`,
                farmId: req.sanityFarm.id,
            });
            const config = await carregarConfiguracao(req.sanityFarm.id);
            return res.json({ ...config.settings, estado: config.estado, configurada: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar a configuração.' });
        }
    });
}
