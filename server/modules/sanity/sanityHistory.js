import { createHash, randomUUID } from 'node:crypto';
import { calcularCarencia, marcacoesDoProduto, validarAnimal, idadeEmDias } from './sanityRules.js';
import { findCatalogItem } from '../pharmacy/pharmacyCatalog.js';
import { logActivity } from '../utils/activityLog.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function normalizeHistory(body, now = new Date()) {
    const date = typeof body.appliedAt === 'string' ? body.appliedAt : '';
    const appliedAt = new Date(`${date}T12:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(appliedAt.getTime()) || appliedAt.toISOString().slice(0, 10) !== date) fail('Informe uma data válida.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (date > today) fail('A data da aplicação não pode ser no futuro.');
    if (body.dose != null && typeof body.dose !== 'number' && typeof body.dose !== 'string') fail('Dose inválida.');
    const dose = body.dose === null || body.dose === undefined || body.dose === '' ? null : Number(body.dose);
    if (dose !== null && (!Number.isFinite(dose) || dose <= 0)) fail('Informe uma dose positiva ou deixe sem informação.');
    const selecao = body.selecao || {};
    for (const key of ['animalIds', 'brincos']) {
        if (selecao[key] !== undefined && (!Array.isArray(selecao[key]) || selecao[key].length > 2000 || selecao[key].some(v => typeof v !== 'string' || !v.trim()))) fail('Seleção inválida ou acima de 2.000 animais.');
    }
    const clean = value => typeof value === 'string' ? value.trim() : '';
    return {
        productId: clean(body.productId), appliedAt: date, dose, doseUnit: dose === null ? null : clean(body.doseUnit),
        appliedByName: clean(body.appliedByName), notes: clean(body.notes),
        selecao: { animalIds: [...new Set(selecao.animalIds || [])].sort(), brincos: [...new Set((selecao.brincos || []).map(v => v.trim().toUpperCase()))].sort(), lotId: clean(selecao.lotId) },
    };
}
export const historyHash = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');
export function historyPreview(input, product, selection) {
    if (input.dose !== null && input.doseUnit !== (product.applicationUnit || 'ml')) fail('Unidade da dose incompatível com o produto.');
    const appliedAt = new Date(`${input.appliedAt}T12:00:00.000Z`);
    const tags = marcacoesDoProduto(product, findCatalogItem(product.catalogKey));
    const linhas = selection.animais.map(animal => {
        const rules = validarAnimal({ animal, tags, appliedAt });
        if (animal.dataNascimento && new Date(animal.dataNascimento) > appliedAt) rules.bloqueios.push('Aplicação anterior ao nascimento.');
        return { animalId: animal.id, brinco: animal.brinco, sexo: animal.sexo, peso: null, idadeDias: idadeEmDias(animal.dataNascimento, appliedAt), dose: input.dose, apto: rules.bloqueios.length === 0, ...rules };
    });
    const carencia = calcularCarencia(appliedAt, product);
    const bloqueiosGerais = [];
    if (!linhas.length) bloqueiosGerais.push('Nenhum animal selecionado.');
    if (linhas.length > 2000) bloqueiosGerais.push('Selecione no máximo 2.000 animais. Divida a seleção em grupos.');
    if (selection.naoEncontrados.length || selection.repetidos.length) bloqueiosGerais.push('Corrija as identificações não encontradas ou repetidas.');
    return { linhas, resumo: { total: linhas.length, aptos: linhas.filter(v => v.apto).length, bloqueados: linhas.filter(v => !v.apto).length, doseTotal: input.dose === null ? null : input.dose * linhas.length, unidadeDose: product.applicationUnit || 'ml', consumoEstoque: null, unidadeEstoque: null, custoTotal: null, carenciaAte: carencia.ate, carenciaDias: carencia.dias, carenciaDesconhecida: carencia.desconhecida }, bloqueiosGerais, avisosGerais: carencia.desconhecida ? ['Carência desconhecida: o histórico não libera os animais para abate.'] : [], naoEncontrados: selection.naoEncontrados, repetidos: selection.repetidos };
}
export async function saveHistory(prisma, req, input, requestId, resolveSelection) {
    if (typeof requestId !== 'string' || !/^[\w-]{8,100}$/.test(requestId)) fail('Identificador da operação inválido.');
    const farmId = req.sanityFarm.id;
    const payloadHash = historyHash(input);
    const key = { farmId_requestId: { farmId, requestId } };
    const replay = record => {
        if (record.payloadHash !== payloadHash) fail('Este identificador já foi usado com outro conteúdo.', 409);
        return record.result;
    };
    const existing = await prisma.sanitaryHistoryRequest.findUnique({ where: key });
    if (existing) return replay(existing);
    try {
        return await prisma.$transaction(async tx => {
            const product = await tx.pharmacyProduct.findFirst({ where: { id: input.productId, farmId, active: true } });
            if (!product) fail('Escolha um produto da Farmácia.');
            const selection = await resolveSelection(farmId, input.selecao, tx);
            const previa = historyPreview(input, product, selection);
            if (previa.bloqueiosGerais.length || previa.resumo.bloqueados) throw Object.assign(new Error(previa.bloqueiosGerais[0] || 'Corrija os animais bloqueados antes de salvar.'), { status: 409, previa });
            const groupId = randomUUID();
            const result = { groupId, aplicados: previa.linhas.length, ignorados: 0, consumoEstoque: 0, custoTotal: null, carenciaAte: previa.resumo.carenciaAte?.toISOString() || null };
            // A chave única é gravada na mesma transação; uma repetição concorrente desfaz o segundo envio inteiro.
            await tx.sanitaryHistoryRequest.create({ data: { farmId, requestId, payloadHash, groupId, result } });
            await tx.sanitaryApplication.createMany({ data: previa.linhas.map(linha => ({ farmId, groupId, animalId: linha.animalId, productId: product.id, origin: 'HISTORY', batchId: null, appliedAt: new Date(`${input.appliedAt}T12:00:00.000Z`), dose: input.dose, doseUnit: input.doseUnit || product.applicationUnit || 'ml', appliedByName: input.appliedByName || null, notes: input.notes || null, slaughterWithdrawalUntil: previa.resumo.carenciaAte, withdrawalUnknown: previa.resumo.carenciaDesconhecida, unitCost: null })) });
            await logActivity(tx, req, { action: 'SANIDADE_HISTORICO', entity: 'SanitaryApplication', entityId: groupId, farmId, description: `Registrou aplicação anterior de ${product.name} em ${previa.linhas.length} animais`, required: true });
            return result;
        });
    } catch (error) {
        if (error.code === 'P2002') {
            const record = await prisma.sanitaryHistoryRequest.findUnique({ where: key });
            if (record) return replay(record);
        }
        throw error;
    }
}
