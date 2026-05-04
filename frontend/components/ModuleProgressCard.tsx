import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../api';

interface ModuleProgressCardProps {
    activeView: string;
    farmId: string | null;
}

interface MetricsState {
    animals: number;
    weighings: number;
    transactions: number;
    occurrences: number;
    poAnimals: number;
}

interface StepItem {
    title: string;
    description: string;
    done: boolean;
}

const cardConfig = (activeView: string, hasFarm: boolean, metrics: MetricsState): { title: string; steps: StepItem[] } | null => {
    switch (activeView) {
        case 'Nutrição':
            return {
                title: 'Progresso de Implantação — Nutrição',
                steps: [
                    { title: 'Selecionar fazenda', description: 'Defina a fazenda ativa para trabalhar no módulo.', done: hasFarm },
                    { title: 'Ter animais cadastrados', description: 'Base mínima para planejamento e execução nutricional.', done: metrics.animals > 0 },
                    { title: 'Registrar a primeira pesagem', description: 'Pesagem inicial para apoiar evolução de desempenho.', done: metrics.weighings > 0 },
                ],
            };
        case 'Financeiro':
            return {
                title: 'Progresso de Implantação — Financeiro',
                steps: [
                    { title: 'Selecionar fazenda', description: 'Ative a fazenda para controlar as movimentações.', done: hasFarm },
                    { title: 'Lançar primeira transação', description: 'Registre ao menos uma entrada ou saída.', done: metrics.transactions > 0 },
                    { title: 'Consolidar fluxo do mês', description: 'Com lançamentos, o saldo mensal fica disponível.', done: metrics.transactions > 0 },
                ],
            };
        case 'Ocorrências do EIXO Campo':
            return {
                title: 'Progresso de Implantação — Ocorrências',
                steps: [
                    { title: 'Selecionar fazenda', description: 'Defina o escopo para receber ocorrências do campo.', done: hasFarm },
                    { title: 'Receber a primeira ocorrência', description: 'Integração inicial do app de campo com o web.', done: metrics.occurrences > 0 },
                    { title: 'Iniciar rotina de análise', description: 'Classifique e trate os registros recebidos.', done: metrics.occurrences > 0 },
                ],
            };
        case 'Eixo Genetics':
        case 'Reprodução':
        case 'Eixo Acasalamento':
            return {
                title: 'Progresso de Implantação — Genetics',
                steps: [
                    { title: 'Selecionar fazenda', description: 'Ative a fazenda para iniciar o controle genético.', done: hasFarm },
                    { title: 'Cadastrar plantel P.O.', description: 'Inclua os primeiros animais P.O. no sistema.', done: metrics.poAnimals > 0 },
                    { title: 'Registrar evolução genética', description: 'Avance com registros reprodutivos e de seleção.', done: metrics.poAnimals > 0 },
                ],
            };
        default:
            return null;
    }
};

const ModuleProgressCard: React.FC<ModuleProgressCardProps> = ({ activeView, farmId }) => {
    const [loading, setLoading] = useState(false);
    const [metrics, setMetrics] = useState<MetricsState>({
        animals: 0,
        weighings: 0,
        transactions: 0,
        occurrences: 0,
        poAnimals: 0,
    });

    const hasFarm = Boolean(farmId);
    const config = cardConfig(activeView, hasFarm, metrics);

    useEffect(() => {
        if (!config || !farmId) return;
        let isActive = true;
        const run = async () => {
            setLoading(true);
            try {
                const now = new Date();
                const mes = now.getMonth() + 1;
                const ano = now.getFullYear();
                const [animalsRes, weighingsRes, transactionsRes, occurrencesRes, poAnimalsRes] = await Promise.all([
                    fetch(buildApiUrl(`/animals?farmId=${farmId}&limit=1`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/farms/${farmId}/weighings?limit=1`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/financial/transactions?farmId=${farmId}&mes=${mes}&ano=${ano}&limit=1`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/field-occurrences?farmId=${farmId}&limit=1`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/po/animals?farmId=${farmId}&limit=1`), { credentials: 'include' }),
                ]);
                const [animalsData, weighingsData, transactionsData, occurrencesData, poAnimalsData] = await Promise.all([
                    animalsRes.json().catch(() => ({})),
                    weighingsRes.json().catch(() => ({})),
                    transactionsRes.json().catch(() => ({})),
                    occurrencesRes.json().catch(() => ({})),
                    poAnimalsRes.json().catch(() => ({})),
                ]);
                if (!isActive) return;
                setMetrics({
                    animals: Number(animalsData?.total ?? animalsData?.animals?.length ?? 0),
                    weighings: Number(weighingsData?.total ?? weighingsData?.weighings?.length ?? 0),
                    transactions: Number(transactionsData?.total ?? transactionsData?.transactions?.length ?? 0),
                    occurrences: Number(occurrencesData?.total ?? occurrencesData?.items?.length ?? occurrencesData?.occurrences?.length ?? 0),
                    poAnimals: Number(poAnimalsData?.total ?? poAnimalsData?.animals?.length ?? poAnimalsData?.poAnimals?.length ?? poAnimalsData?.items?.length ?? 0),
                });
            } finally {
                if (isActive) setLoading(false);
            }
        };
        void run();
        return () => { isActive = false; };
    }, [config, farmId]);

    if (!config) return null;

    const completedCount = config.steps.filter((step) => step.done).length;
    const progressPct = Math.round((completedCount / config.steps.length) * 100);

    return (
        <div className="mb-6 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
            <div className="border-b border-[var(--eixo-border)] px-5 py-4">
                <p className="text-sm font-semibold text-[var(--eixo-text)]">
                    {config.title} — {completedCount} de {config.steps.length}
                </p>
                <p className="text-xs text-[var(--eixo-text-muted)]">Acompanhe a evolução mínima para uso completo deste módulo.</p>
            </div>

            <div className="h-1 bg-[var(--eixo-surface-soft)]">
                <div className="h-1 rounded-full bg-[var(--eixo-green)] transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>

            {loading ? (
                <div className="px-5 py-4 text-sm text-[#a8a29e]">Verificando progresso do módulo…</div>
            ) : (
                <div className="divide-y divide-[var(--eixo-surface-soft)] px-5">
                    {config.steps.map((step, index) => (
                        <div key={step.title} className="flex items-center gap-4 py-4">
                            <div className="flex-shrink-0">
                                {step.done ? (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--eixo-green)]">
                                        <svg className="h-4 w-4 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                ) : (
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--eixo-border)] bg-[var(--eixo-surface)] text-xs font-bold text-[var(--eixo-text-muted)]">
                                        {index + 1}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${step.done ? 'text-[#a8a29e] line-through' : 'text-[var(--eixo-text)]'}`}>
                                    {step.title}
                                </p>
                                <p className="mt-0.5 text-xs text-[#a8a29e]">{step.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModuleProgressCard;
