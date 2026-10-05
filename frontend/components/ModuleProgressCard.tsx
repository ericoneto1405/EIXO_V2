import React, { useCallback } from 'react';
import { listAnimals } from '../adapters/herdApi';
import { listTransactions } from '../adapters/financialApi';
import { listFieldOccurrences } from '../adapters/fieldOccurrencesApi';
import ProgressGuide, { GuideStep, guideButtonClass } from './ProgressGuide';
import { FINANCIAL_RESULT_EVENT, financialResultKey, GuideNavigation, hasFarmWeighings, readFlag, useGuideCollapsed, useGuideData } from './progressGuideState';

interface ModuleProgressCardProps {
    activeView: string;
    userId: string;
    farmId: string | null;
    farmName?: string | null;
    canViewFinancialResult: boolean;
    canEditAnimals: boolean;
    canNavigateHerd: boolean;
    onNavigate: GuideNavigation;
    onFinanceAction: (action: 'SAIDA' | 'ENTRADA' | 'RESULTADO') => void;
}
const supportedViews = ['Nutrição', 'Financeiro', 'Ocorrências do EIXO Campo', 'Eixo Genetics', 'Reprodução', 'Eixo Acasalamento'];

const ModuleProgressCard: React.FC<ModuleProgressCardProps> = ({ activeView, userId, farmId, farmName, canViewFinancialResult, canEditAnimals, canNavigateHerd, onNavigate, onFinanceAction }) => {
    const supported = supportedViews.includes(activeView);
    const genetics = ['Eixo Genetics', 'Reprodução', 'Eixo Acasalamento'].includes(activeView);
    const [collapsed, setCollapsed] = useGuideCollapsed(userId, farmId, activeView);
    const context = JSON.stringify([userId, farmId, activeView, canViewFinancialResult]);
    const load = useCallback(async () => {
        const empty = { animals: false, weighings: false, expenses: false, incomes: false, occurrences: false, resultViewed: false };
        if (!supported || !farmId) return empty;
        if (activeView === 'Financeiro') {
            const transactions = await listTransactions(farmId);
            return { ...empty, expenses: transactions.some((item) => item.type === 'SAIDA'), incomes: transactions.some((item) => item.type === 'ENTRADA'), resultViewed: readFlag(financialResultKey(userId, farmId)) };
        }
        if (activeView === 'Ocorrências do EIXO Campo') {
            const occurrences = await listFieldOccurrences({ farmId, limit: 1 });
            return { ...empty, occurrences: occurrences.some((item) => item.farmId === farmId) };
        }
        const [animals, weighings] = await Promise.all([listAnimals(farmId, 'COMMERCIAL'), activeView === 'Nutrição' ? hasFarmWeighings(farmId) : false]);
        return { ...empty, animals: animals.length > 0, weighings };
    }, [supported, farmId, activeView, userId]);
    const { data, loading, error, retry } = useGuideData(context, load, ['eixo:herd-onboarding-progress-changed', 'eixo:financial-transactions-changed', FINANCIAL_RESULT_EVENT]);
    if (!supported) return null;
    const steps: GuideStep[] = [{ title: 'Selecionar fazenda', description: 'Defina a fazenda ativa para continuar.', done: Boolean(farmId) }];
    if (activeView === 'Financeiro') steps.push(
        { title: 'Registrar uma despesa', description: 'Comece registrando um custo real da fazenda.', done: Boolean(data?.expenses) },
        { title: 'Registrar uma receita', description: 'Registre uma entrada da operação.', done: Boolean(data?.incomes) },
        { title: 'Conferir o resultado financeiro', description: 'Consulte receitas, despesas e resultado no DRE anual.', done: Boolean(data?.resultViewed), unavailable: !canViewFinancialResult },
    );
    else if (activeView === 'Ocorrências do EIXO Campo') steps.push({ title: 'Receber a primeira ocorrência', description: 'Abra o EIXO Campo no celular e registre uma ocorrência nesta fazenda.', done: Boolean(data?.occurrences) });
    else {
        steps.push({ title: 'Cadastrar animais', description: 'Cadastre ou importe a base inicial do rebanho.', done: Boolean(data?.animals) });
        if (activeView === 'Nutrição') steps.push({ title: 'Registrar a primeira pesagem', description: 'Prepare a base para acompanhar o desempenho.', done: Boolean(data?.weighings) });
    }
    const next = steps.find((step) => !step.done && !step.unavailable);
    const financeAction = next?.title === 'Registrar uma despesa' ? 'SAIDA' : next?.title === 'Registrar uma receita' ? 'ENTRADA' : 'RESULTADO';
    return <ProgressGuide key={context} title="Primeiros passos" moduleName={activeView === 'Ocorrências do EIXO Campo' ? 'Ocorrências' : activeView} detailsNote={genetics ? <p className="mt-3 text-xs text-(--eixo-text-muted)">Opcional: classifique animais como P.O. quando houver registro.</p> : undefined} description="Prepare a base inicial para começar a usar este módulo." farmName={farmName} steps={steps} loading={loading} error={error} hasData={Boolean(data)} collapsed={collapsed} onCollapse={setCollapsed} onRetry={retry}>
        {farmId && next && <>
            {activeView === 'Financeiro' && <button type="button" className={guideButtonClass} onClick={() => onFinanceAction(financeAction)}>{financeAction === 'SAIDA' ? 'Registrar despesa' : financeAction === 'ENTRADA' ? 'Registrar receita' : 'Ver resultado financeiro'}</button>}
            {next.title === 'Cadastrar animais' && canNavigateHerd && canEditAnimals && <button type="button" className={guideButtonClass} onClick={() => onNavigate('Rebanho Comercial', { herdTab: 'animals', openAnimalForm: true })}>Cadastrar animais</button>}
            {next.title === 'Registrar a primeira pesagem' && canNavigateHerd && canEditAnimals && <button type="button" className={guideButtonClass} onClick={() => onNavigate('Rebanho Comercial', { herdTab: 'weighings' })}>Registrar pesagem</button>}
            {((next.title === 'Cadastrar animais' && (!canNavigateHerd || !canEditAnimals)) || (next.title === 'Registrar a primeira pesagem' && (!canNavigateHerd || !canEditAnimals))) && <p className="text-sm text-(--eixo-text-muted)">Peça a um responsável com acesso para concluir este passo.</p>}
            {activeView === 'Ocorrências do EIXO Campo' && <button type="button" className={guideButtonClass} onClick={retry}>Verificar recebimento novamente</button>}
        </>}
    </ProgressGuide>;
};
export default ModuleProgressCard;
