const BASE_SYSTEM_ACCOUNT_CATEGORIES = [
    { id: 'sys-venda-animais', farmId: null, name: 'Venda de Animais', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-bezerros', farmId: null, name: 'Venda de Bezerros', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-garrotes', farmId: null, name: 'Venda de Garrotes', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-novilhas', farmId: null, name: 'Venda de Novilhas', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-bois', farmId: null, name: 'Venda de Bois', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-vacas', farmId: null, name: 'Venda de Vacas', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-touros', farmId: null, name: 'Venda de Touros', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-matrizes', farmId: null, name: 'Venda de Matrizes', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-reprodutores', farmId: null, name: 'Venda de Reprodutores P.O.', group: 'Genética', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-descarte', farmId: null, name: 'Venda de Animais para Descarte', group: 'Rebanho', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-semen', farmId: null, name: 'Venda de Sêmen', group: 'Genética', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-embrioes', farmId: null, name: 'Venda de Embriões', group: 'Genética', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-adubo-organico', farmId: null, name: 'Venda de Esterco ou Adubo Orgânico', group: 'Outras Receitas', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-venda-leite', farmId: null, name: 'Venda de Leite', group: 'Outras Receitas', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-servicos-agropecuarios', farmId: null, name: 'Prestação de Serviços Agropecuários', group: 'Serviços', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-servicos-maquinas', farmId: null, name: 'Prestação de Serviços com Máquinas', group: 'Serviços', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-aluguel-pasto', farmId: null, name: 'Aluguel de Pasto', group: 'Serviços', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-aluguel-equipamentos', farmId: null, name: 'Aluguel de Máquinas e Equipamentos', group: 'Serviços', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-arrendamento-recebido', farmId: null, name: 'Arrendamento Recebido', group: 'Serviços', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-bonificacoes-comerciais', farmId: null, name: 'Bonificações Comerciais', group: 'Outras Receitas', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-premiacoes', farmId: null, name: 'Premiações', group: 'Outras Receitas', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-reembolso-despesas', farmId: null, name: 'Reembolso de Despesas', group: 'Administrativo', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-indenizacao-seguro', farmId: null, name: 'Indenização de Seguro', group: 'Administrativo', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-restituicao-impostos', farmId: null, name: 'Restituição de Impostos', group: 'Administrativo', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-juros-recebidos', farmId: null, name: 'Juros Recebidos', group: 'Financeiro', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-rendimentos-financeiros', farmId: null, name: 'Rendimentos Financeiros', group: 'Financeiro', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-creditos-diversos', farmId: null, name: 'Créditos Diversos', group: 'Financeiro', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-aporte-socios', farmId: null, name: 'Aporte dos Sócios', group: 'Financeiro', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-emprestimos-recebidos', farmId: null, name: 'Empréstimos Recebidos', group: 'Financeiro', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-transferencias-recebidas', farmId: null, name: 'Transferências Recebidas', group: 'Financeiro', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-outras-receitas', farmId: null, name: 'Outras Receitas Operacionais', group: 'Outras Receitas', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-outras-receitas-nao-operacionais', farmId: null, name: 'Outras Receitas Não Operacionais', group: 'Outras Receitas', type: 'ENTRADA', isSystem: true, isActive: true },
    { id: 'sys-compra-animais', farmId: null, name: 'Compra de Animais', group: 'Rebanho', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-animais-producao', farmId: null, name: 'Compra de Animais para Produção', group: 'Rebanho', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-bezerros', farmId: null, name: 'Compra de Bezerros', group: 'Rebanho', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-garrotes', farmId: null, name: 'Compra de Garrotes', group: 'Rebanho', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-novilhas', farmId: null, name: 'Compra de Novilhas', group: 'Rebanho', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-matrizes', farmId: null, name: 'Compra de Matrizes', group: 'Rebanho', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-reprodutores', farmId: null, name: 'Compra de Reprodutores', group: 'Genética', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-semen', farmId: null, name: 'Compra de Sêmen', group: 'Genética', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-compra-embrioes', farmId: null, name: 'Compra de Embriões', group: 'Genética', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-racao', farmId: null, name: 'Ração / Concentrado', group: 'Nutrição', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-sal-mineral', farmId: null, name: 'Sal Mineral', group: 'Nutrição', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-suplementacao', farmId: null, name: 'Suplementação Mineral', group: 'Nutrição', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-medicamentos-veterinarios', farmId: null, name: 'Medicamentos Veterinários', group: 'Sanidade', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-medicamentos-estoque', farmId: null, name: 'Compra de Medicamentos para Estoque', group: 'Sanidade', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-vacinas', farmId: null, name: 'Vacinas', group: 'Sanidade', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-vermifugos', farmId: null, name: 'Vermífugos', group: 'Sanidade', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-tratamentos', farmId: null, name: 'Tratamentos Veterinários', group: 'Sanidade', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-material-manejo', farmId: null, name: 'Material de Manejo', group: 'Operação', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-pastagem', farmId: null, name: 'Pastagem e Forragem', group: 'Nutrição', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-cercas-estruturas', farmId: null, name: 'Cercas e Estruturas Rurais', group: 'Estrutura', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-construcao-cercas', farmId: null, name: 'Construção de Cercas', group: 'Investimentos', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-benfeitorias', farmId: null, name: 'Construção de Benfeitorias', group: 'Investimentos', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-maquinas-equipamentos', farmId: null, name: 'Compra de Máquinas e Equipamentos', group: 'Investimentos', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-manutencao-cercas', farmId: null, name: 'Manutenção de Cercas', group: 'Operação', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-combustivel', farmId: null, name: 'Combustível', group: 'Operação', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-equip-manut', farmId: null, name: 'Manutenção de Máquinas e Equipamentos', group: 'Operação', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-manutencao-veiculos', farmId: null, name: 'Manutenção de Veículos', group: 'Operação', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-energia', farmId: null, name: 'Energia Elétrica', group: 'Estrutura', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-agua', farmId: null, name: 'Água', group: 'Estrutura', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-fretes-transportes', farmId: null, name: 'Fretes e Transportes', group: 'Operação', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-salarios', farmId: null, name: 'Folha de Pagamento', group: 'Pessoal', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-encargos-trabalhistas', farmId: null, name: 'Encargos Trabalhistas', group: 'Pessoal', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-servicos-terc', farmId: null, name: 'Honorários e Consultorias', group: 'Pessoal', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-impostos-taxas', farmId: null, name: 'Impostos e Taxas', group: 'Administrativo', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-despesas-financeiras', farmId: null, name: 'Despesas Financeiras', group: 'Financeiro', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-pagamento-emprestimos', farmId: null, name: 'Pagamento de Empréstimos', group: 'Financeiro', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-transferencias-enviadas', farmId: null, name: 'Transferências Enviadas', group: 'Financeiro', type: 'SAIDA', isSystem: true, isActive: true },
    { id: 'sys-despesas-gerais', farmId: null, name: 'Despesas Gerais', group: 'Administrativo', type: 'SAIDA', isSystem: true, isActive: true },
];

const FINANCIAL_RESULT_IDS = new Set(['sys-juros-recebidos', 'sys-rendimentos-financeiros', 'sys-despesas-financeiras']);
const OTHER_RESULT_IDS = new Set(['sys-premiacoes', 'sys-reembolso-despesas', 'sys-indenizacao-seguro', 'sys-restituicao-impostos', 'sys-outras-receitas-nao-operacionais']);
const FINANCING_IDS = new Set(['sys-aporte-socios', 'sys-emprestimos-recebidos', 'sys-pagamento-emprestimos', 'sys-transferencias-recebidas', 'sys-transferencias-enviadas']);
const INVESTING_IDS = new Set(['sys-compra-matrizes', 'sys-compra-reprodutores', 'sys-cercas-estruturas', 'sys-construcao-cercas', 'sys-benfeitorias', 'sys-maquinas-equipamentos']);
const ANIMAL_ACQUISITION_IDS = new Set(['sys-compra-animais', 'sys-compra-animais-producao', 'sys-compra-bezerros', 'sys-compra-garrotes', 'sys-compra-novilhas']);
const STOCK_ONLY_IDS = new Set(['sys-medicamentos-estoque']);
const NUTRITION_CONSUMPTION_IDS = new Set(['sys-racao', 'sys-sal-mineral', 'sys-suplementacao']);
const PRODUCTION_COST_IDS = new Set([
    'sys-compra-semen', 'sys-compra-embrioes', 'sys-medicamentos-veterinarios', 'sys-vacinas',
    'sys-vermifugos', 'sys-tratamentos', 'sys-material-manejo', 'sys-pastagem', 'sys-combustivel',
    'sys-fretes-transportes', 'sys-salarios', 'sys-encargos-trabalhistas',
]);
const DEPRECATED_IDS = new Set(['sys-creditos-diversos', 'sys-despesas-gerais', 'sys-compra-animais', 'sys-medicamentos-veterinarios', 'sys-cercas-estruturas']);

const classifySystemCategory = (category) => {
    if (FINANCING_IDS.has(category.id)) {
        return { cashFlowClass: 'FINANCING', resultClass: null, recognitionRule: 'NOT_IN_RESULT' };
    }
    if (INVESTING_IDS.has(category.id)) {
        return { cashFlowClass: 'INVESTING', resultClass: null, recognitionRule: 'NOT_IN_RESULT' };
    }
    if (ANIMAL_ACQUISITION_IDS.has(category.id)) {
        return { cashFlowClass: 'OPERATING', resultClass: 'PRODUCTION_COST', recognitionRule: 'ON_ANIMAL_SALE' };
    }
    if (NUTRITION_CONSUMPTION_IDS.has(category.id)) {
        return { cashFlowClass: 'OPERATING', resultClass: 'PRODUCTION_COST', recognitionRule: 'ON_NUTRITION_CONSUMPTION' };
    }
    if (STOCK_ONLY_IDS.has(category.id)) {
        return { cashFlowClass: 'OPERATING', resultClass: null, recognitionRule: 'NOT_IN_RESULT' };
    }
    if (FINANCIAL_RESULT_IDS.has(category.id)) {
        return { cashFlowClass: 'OPERATING', resultClass: 'FINANCIAL_RESULT', recognitionRule: 'IMMEDIATE' };
    }
    if (OTHER_RESULT_IDS.has(category.id)) {
        return { cashFlowClass: 'OPERATING', resultClass: 'OTHER_RESULT', recognitionRule: 'IMMEDIATE' };
    }
    if (category.type === 'ENTRADA') {
        return { cashFlowClass: 'OPERATING', resultClass: 'OPERATING_REVENUE', recognitionRule: 'IMMEDIATE' };
    }
    return {
        cashFlowClass: 'OPERATING',
        resultClass: PRODUCTION_COST_IDS.has(category.id) ? 'PRODUCTION_COST' : 'OPERATING_EXPENSE',
        recognitionRule: 'IMMEDIATE',
    };
};

export const SYSTEM_ACCOUNT_CATEGORIES = BASE_SYSTEM_ACCOUNT_CATEGORIES.map((category) => ({
    ...category,
    ...classifySystemCategory(category),
    isConfigured: true,
    deprecatedAt: DEPRECATED_IDS.has(category.id) ? new Date('2026-07-22T00:00:00.000Z') : null,
}));

export const upsertSystemAccountCategories = async (prisma) => {
    for (const category of SYSTEM_ACCOUNT_CATEGORIES) {
        await prisma.accountCategory.upsert({
            where: { id: category.id },
            update: {
                name: category.name,
                group: category.group,
                type: category.type,
                isSystem: true,
                isActive: true,
                farmId: null,
                cashFlowClass: category.cashFlowClass,
                resultClass: category.resultClass,
                recognitionRule: category.recognitionRule,
                isConfigured: true,
                deprecatedAt: category.deprecatedAt,
            },
            create: category,
        });
    }
};
