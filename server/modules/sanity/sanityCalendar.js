// Busca no banco o que os lembretes precisam e chama as regras puras (sanityAlerts.js).
import { PrismaClient } from '@prisma/client';
import { findCatalogItem } from '../pharmacy/pharmacyCatalog.js';
import { marcacoesDoProduto } from './sanityRules.js';
import { gerarLembretes } from './sanityAlerts.js';
import { infoDoEstado } from './sanityRegion.js';

const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

export const RABIES_OPTIONS = new Set(['SIM', 'NAO', 'NAO_SEI']);

export function settingsPadrao(estado) {
    return {
        rabiesRequired: 'NAO_SEI',
        clostridialEnabled: true,
        reproductiveEnabled: true,
        dewormEnabled: true,
        dewormMonths: estado.vermifugo,
        tickEnabled: false,
        tickMonths: estado.carrapato,
    };
}

export async function carregarConfiguracao(farmId) {
    const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { uf: true, sanitarySettings: true } });
    const estado = infoDoEstado(farm?.uf);
    const salvo = farm?.sanitarySettings;
    const settings = salvo
        ? {
            rabiesRequired: salvo.rabiesRequired,
            clostridialEnabled: salvo.clostridialEnabled,
            reproductiveEnabled: salvo.reproductiveEnabled,
            dewormEnabled: salvo.dewormEnabled,
            dewormMonths: salvo.dewormMonths?.length ? salvo.dewormMonths : estado.vermifugo,
            tickEnabled: salvo.tickEnabled,
            tickMonths: salvo.tickMonths?.length ? salvo.tickMonths : estado.carrapato,
        }
        : settingsPadrao(estado);
    return { settings, estado, salvo: Boolean(salvo) };
}

// Animais ainda em carência para abate. Carência preenchida depois na Farmácia
// libera o registro antigo "sem carência".
export async function calcularCarencias(farmId, agora = new Date()) {
    const registros = await prisma.sanitaryApplication.findMany({
        where: {
            farmId,
            animal: { status: 'VIVO' },
            OR: [{ slaughterWithdrawalUntil: { gt: agora } }, { withdrawalUnknown: true }],
        },
        select: {
            animalId: true, slaughterWithdrawalUntil: true, withdrawalUnknown: true, appliedAt: true,
            animal: { select: { brinco: true, lotId: true } },
            product: { select: { name: true, slaughterWithdrawalDays: true } },
        },
    });
    const porAnimal = new Map();
    for (const registro of registros) {
        let ate = registro.slaughterWithdrawalUntil;
        let desconhecida = registro.withdrawalUnknown;
        if (desconhecida && Number.isInteger(registro.product.slaughterWithdrawalDays)) {
            ate = new Date(new Date(registro.appliedAt).getTime() + registro.product.slaughterWithdrawalDays * DAY_MS);
            desconhecida = false;
            if (ate <= agora) continue;
        }
        const atual = porAnimal.get(registro.animalId) || {
            animalId: registro.animalId, brinco: registro.animal.brinco, lotId: registro.animal.lotId,
            liberaEm: null, semCarencia: false, produtos: [],
        };
        if (desconhecida) atual.semCarencia = true;
        if (ate && (!atual.liberaEm || ate > atual.liberaEm)) atual.liberaEm = ate;
        if (!atual.produtos.includes(registro.product.name)) atual.produtos.push(registro.product.name);
        porAnimal.set(registro.animalId, atual);
    }
    return [...porAnimal.values()];
}

// Doses disponíveis por marcação (ex.: BRUCELOSE_B19), quando dá para calcular.
function dosesPorMarcacao(products) {
    const estoque = {};
    for (const product of products) {
        const catalogItem = findCatalogItem(product.catalogKey);
        const tags = marcacoesDoProduto(product, catalogItem);
        if (!tags.size) continue;
        const saldo = product.batches.reduce((soma, batch) => soma + Number(batch.quantity || 0), 0);
        let doses = null;
        if (product.unit === 'dose') doses = saldo;
        else {
            const doseMl = Number(String(catalogItem?.dose || '').match(/^([\d.,]+)\s*m[lL]\b/)?.[1]?.replace(',', '.'));
            const rende = product.unit === product.applicationUnit ? 1 : Number(product.applicationPerUnit);
            if (product.applicationUnit === 'dose' && rende > 0) doses = saldo * rende;
            else if (doseMl > 0 && rende > 0) doses = (saldo * rende) / doseMl;
        }
        if (doses === null) continue;
        for (const tag of tags) estoque[tag] = (estoque[tag] || 0) + doses;
    }
    return estoque;
}

export async function carregarLembretes(farmId, hoje = new Date()) {
    const umAnoEMeio = new Date(hoje.getTime() - 550 * DAY_MS);
    const [config, animais, aplicacoes, estacoes, carencias, products] = await Promise.all([
        carregarConfiguracao(farmId),
        prisma.animal.findMany({
            where: { farmId, status: 'VIVO' },
            select: { id: true, brinco: true, sexo: true, status: true, dataNascimento: true },
        }),
        prisma.sanitaryApplication.findMany({
            where: { farmId, appliedAt: { gte: umAnoEMeio } },
            select: { animalId: true, appliedAt: true, product: { select: { name: true, activeIngredient: true, category: true, catalogKey: true } } },
        }),
        prisma.breedingSeason.findMany({
            where: { farmId, startAt: { gte: hoje } },
            select: { id: true, name: true, startAt: true },
        }),
        calcularCarencias(farmId, hoje),
        prisma.pharmacyProduct.findMany({
            where: { farmId, active: true },
            include: { batches: { where: { quantity: { gt: 0 } } } },
        }),
    ]);
    const tagCache = new Map();
    const comTags = aplicacoes.map((aplicacao) => {
        const key = `${aplicacao.product.catalogKey}|${aplicacao.product.name}|${aplicacao.product.category}`;
        if (!tagCache.has(key)) tagCache.set(key, marcacoesDoProduto(aplicacao.product, findCatalogItem(aplicacao.product.catalogKey)));
        return { animalId: aplicacao.animalId, appliedAt: aplicacao.appliedAt, category: aplicacao.product.category, tags: tagCache.get(key) };
    });
    const lotes = products.flatMap((product) => product.batches.map((batch) => ({
        id: batch.id, lotNumber: batch.lotNumber, quantity: batch.quantity, expiresAt: batch.expiresAt,
        productName: product.name, unit: product.unit,
    })));
    const lembretes = gerarLembretes({
        hoje,
        animais,
        aplicacoes: comTags,
        settings: config.settings,
        estado: config.estado,
        estacoes,
        carencias,
        lotes,
        estoque: dosesPorMarcacao(products),
    });
    return { lembretes, config };
}

// A barra de alertas consulta a cada minuto; guarda o resultado por 5 minutos por fazenda.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

export async function carregarLembretesComCache(farmId) {
    const atual = cache.get(farmId);
    if (atual && Date.now() - atual.em < CACHE_MS) return atual.valor;
    const valor = await carregarLembretes(farmId);
    cache.set(farmId, { em: Date.now(), valor });
    return valor;
}

export function limparCacheLembretes(farmId) {
    cache.delete(farmId);
}
