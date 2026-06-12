import { PrismaClient } from '@prisma/client';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { buildEmptyMarketReplacementSnapshot, buildMarketReplacementSnapshot, resolveFarmMarketRegion } from '../market/marketHelpers.js';
const prisma = new PrismaClient();

export function registerOverviewRoutes(app) {
    app.get('/overview/dashboard', requireAuth, async (req, res) => {
        try {
            const scope = req.query?.scope === 'farm' ? 'farm' : 'all';
            const rawFarmId = typeof req.query?.farmId === 'string' ? req.query.farmId.trim() : '';
            const farmId = scope === 'farm' ? rawFarmId : '';
            const mes = Number(req.query?.mes) || (new Date().getMonth() + 1);
            const ano = Number(req.query?.ano) || new Date().getFullYear();

            if (scope === 'farm' && !farmId) {
                return res.status(400).json({ message: 'farmId é obrigatório quando scope=farm.' });
            }

            const farms = await prisma.farm.findMany({
                where: buildFarmScopeFilter(req, scope === 'farm' ? { id: farmId } : {}),
                select: { id: true, name: true, size: true, city: true, lat: true, lng: true, mapData: true },
            });
            if (scope === 'farm' && farms.length === 0) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }

            const farmIds = farms.map((farm) => farm.id);
            const selectedFarm = scope === 'farm' ? farms[0] : null;
            let marketReplacement = buildEmptyMarketReplacementSnapshot();
            try {
                marketReplacement = await buildMarketReplacementSnapshot({ scope, farm: selectedFarm });
            } catch (marketError) {
                const fallbackRegionContext = scope === 'farm' ? resolveFarmMarketRegion(selectedFarm) : null;
                console.error('[overview/dashboard] marketReplacement failed', {
                    scope,
                    farmId: farmId || null,
                    error: marketError?.message || 'unknown_error',
                });
                marketReplacement = buildEmptyMarketReplacementSnapshot({
                    region: fallbackRegionContext?.region || null,
                    state: fallbackRegionContext?.state || null,
                });
            }
            if (!farmIds.length) {
                return res.json({
                    kpis: {
                        totalAnimais: 0,
                        nascimentosMes: 0,
                        categorias: [],
                        taxaOcupacao: null,
                        gmdMedio: null,
                        entradas: null,
                        saidas: null,
                        saldoMes: null,
                        animaisSemPesagem: 0,
                        areaTotalHa: null,
                    },
                    marketReplacement,
                });
            }

            const animals = await prisma.animal.findMany({
                where: {
                    farmId: { in: farmIds },
                    farm: buildFarmRelationFilter(req),
                },
                select: { id: true, categoria: true, dataNascimento: true },
            });

            const totalAnimais = animals.length;
            const nascimentosMes = animals.filter((animal) => {
                if (!animal.dataNascimento) return false;
                const birthDate = new Date(animal.dataNascimento);
                if (Number.isNaN(birthDate.getTime())) return false;
                return birthDate.getMonth() + 1 === mes && birthDate.getFullYear() === ano;
            }).length;

            const catMap = new Map();
            for (const animal of animals) {
                const cat = animal.categoria || 'Sem categoria';
                catMap.set(cat, (catMap.get(cat) || 0) + 1);
            }
            const categorias = Array.from(catMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 4);

            const areaTotalHa = farms.reduce((sum, farm) => sum + (Number(farm.size) || 0), 0) || null;
            const taxaOcupacao = areaTotalHa && areaTotalHa > 0 && totalAnimais > 0
                ? totalAnimais / areaTotalHa
                : null;

            const animalIds = animals.map((animal) => animal.id);
            let gmdMedio = null;
            let animaisSemPesagem = totalAnimais;
            if (animalIds.length > 0) {
                const weighings = await prisma.weighing.findMany({
                    where: { animalId: { in: animalIds } },
                    orderBy: [{ animalId: 'asc' }, { data: 'desc' }],
                    select: { animalId: true, gmd: true, data: true },
                });
                const lastByAnimal = new Map();
                for (const item of weighings) {
                    if (!lastByAnimal.has(item.animalId)) {
                        lastByAnimal.set(item.animalId, { gmd: item.gmd, date: item.data });
                    }
                }
                const cutoff30 = new Date();
                cutoff30.setDate(cutoff30.getDate() - 30);
                animaisSemPesagem = animals.filter((animal) => {
                    const last = lastByAnimal.get(animal.id);
                    if (!last) return true;
                    return new Date(last.date) < cutoff30;
                }).length;
                const validGmds = Array.from(lastByAnimal.values())
                    .map((item) => item.gmd)
                    .filter((g) => g !== null && g > 0);
                gmdMedio = validGmds.length
                    ? validGmds.reduce((sum, value) => sum + value, 0) / validGmds.length
                    : null;
            }

            const start = new Date(ano, mes - 1, 1);
            const end = new Date(ano, mes, 1);
            const txs = await prisma.financialTransaction.findMany({
                where: {
                    farmId: { in: farmIds },
                    data: { gte: start, lt: end },
                    status: { not: 'CANCELADO' },
                },
                select: { type: true, valor: true },
            });
            const entradas = txs
                .filter((item) => item.type === 'ENTRADA')
                .reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
            const saidas = txs
                .filter((item) => item.type === 'SAIDA' || item.type === 'SAÍDA')
                .reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
            const saldoMes = entradas - saidas;

            return res.json({
                kpis: {
                    totalAnimais,
                    nascimentosMes,
                    categorias,
                    taxaOcupacao,
                    gmdMedio,
                    entradas,
                    saidas,
                    saldoMes,
                    animaisSemPesagem,
                    areaTotalHa,
                },
                marketReplacement,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar visão geral.' });
        }
    });
}
