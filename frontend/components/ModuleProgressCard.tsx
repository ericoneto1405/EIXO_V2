import React, { useEffect, useRef, useState } from 'react';
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

// ─── Persistência de módulos concluídos ───────────────────────────────────────
const moduleDoneKey = (farmId: string, view: string) => `eixo_module_done_${farmId}_${view.replace(/\s/g, '_')}`;
const isModuleDone = (farmId: string, view: string) => { try { return localStorage.getItem(moduleDoneKey(farmId, view)) === '1'; } catch { return false; } };
const markModuleDone = (farmId: string, view: string) => { try { localStorage.setItem(moduleDoneKey(farmId, view), '1'); } catch { /* silencioso */ } };

// ─── Cache de métricas (30s TTL por farmId+view) ──────────────────────────────
const metricsCache = new Map<string, { data: MetricsState; ts: number }>();
const CACHE_TTL_MS = 30_000;
const FINANCIAL_PROGRESS_EVENT = 'eixo:financial-transactions-changed';

const getCached = (key: string): MetricsState | null => {
    const entry = metricsCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) { metricsCache.delete(key); return null; }
    return entry.data;
};

const setCache = (key: string, data: MetricsState) => {
    metricsCache.set(key, { data, ts: Date.now() });
};

// ─── Config por módulo ────────────────────────────────────────────────────────

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
                    { title: 'Registrar ao menos 3 lançamentos', description: 'Com 3 ou mais lançamentos, o fluxo do mês fica representativo.', done: metrics.transactions >= 3 },
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
                    { title: 'Cadastrar rebanho', description: 'Inclua os animais da fazenda no estoque único.', done: metrics.animals > 0 },
                    { title: 'Classificar animais P.O.', description: 'Marque como P.O. os animais registrados quando existirem.', done: metrics.poAnimals > 0 },
                ],
            };
        default:
            return null;
    }
};

// ─── CTA por módulo (próximo passo pendente) ──────────────────────────────────

const getNextCta = (activeView: string, steps: StepItem[]): string | null => {
    const nextPending = steps.find((s) => !s.done);
    if (!nextPending) return null;

    const ctaMap: Record<string, string> = {
        'Selecionar fazenda': 'Selecione uma fazenda no menu superior para continuar.',
        'Ter animais cadastrados': 'Acesse Rebanho Comercial e cadastre ou importe animais.',
        'Registrar a primeira pesagem': 'Acesse Rebanho Comercial → Pesagens para registrar.',
        'Lançar primeira transação': 'Registre uma entrada ou saída no módulo Financeiro.',
        'Registrar ao menos 3 lançamentos': 'Lance mais lançamentos para o fluxo do mês ficar representativo.',
        'Receber a primeira ocorrência': 'Abra o EIXO Campo no celular e registre uma ocorrência.',
        'Iniciar rotina de análise': 'Classifique as ocorrências recebidas nesta tela.',
        'Cadastrar rebanho': 'Acesse Manejo do Rebanho e cadastre ou importe os animais.',
        'Classificar animais P.O.': 'Na aba Animais, use o campo Tipo de cadastro para marcar P.O. quando houver registro.',
    };

    return ctaMap[nextPending.title] ?? null;
};

// ─── Componente ───────────────────────────────────────────────────────────────

const ModuleProgressCard: React.FC<ModuleProgressCardProps> = ({ activeView, farmId }) => {
    const [loading, setLoading] = useState(false);
    const [visible, setVisible] = useState(true);
    const [metrics, setMetrics] = useState<MetricsState>({
        animals: 0,
        weighings: 0,
        transactions: 0,
        occurrences: 0,
        poAnimals: 0,
    });

    const hasFarm = Boolean(farmId);
    const config = cardConfig(activeView, hasFarm, metrics);
    const prevViewRef = useRef<string>('');
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        // Resetar visibilidade ao trocar de módulo (exceto se já concluído)
        if (prevViewRef.current !== activeView) {
            prevViewRef.current = activeView;
            if (!farmId || !isModuleDone(farmId, activeView)) {
                setVisible(true);
            }
        }

        if (!config || !farmId) return;

        const cacheKey = `${activeView}::${farmId}`;
        const cached = getCached(cacheKey);
        if (cached) {
            setMetrics(cached);
            return;
        }

        let isActive = true;
        const run = async () => {
            setLoading(true);
            try {
                const [animalsRes, weighingsRes, transactionsRes, occurrencesRes] = await Promise.all([
                    fetch(buildApiUrl(`/animals?farmId=${farmId}`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/farms/${farmId}/weighings?limit=1`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/financial/transactions?farmId=${farmId}&limit=3`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/field-occurrences?farmId=${farmId}&limit=1`), { credentials: 'include' }),
                ]);
                const [animalsData, weighingsData, transactionsData, occurrencesData] = await Promise.all([
                    animalsRes.json().catch(() => ({})),
                    weighingsRes.json().catch(() => ({})),
                    transactionsRes.json().catch(() => ({})),
                    occurrencesRes.json().catch(() => ({})),
                ]);
                const animals = Array.isArray(animalsData?.animals) ? animalsData.animals : [];
                if (!isActive) return;
                const data: MetricsState = {
                    animals: Number(animalsData?.total ?? animalsData?.animals?.length ?? 0),
                    weighings: Number(weighingsData?.total ?? weighingsData?.weighings?.length ?? 0),
                    transactions: Number(transactionsData?.total ?? transactionsData?.transactions?.length ?? 0),
                    occurrences: Number(occurrencesData?.total ?? occurrencesData?.items?.length ?? occurrencesData?.occurrences?.length ?? 0),
                    poAnimals: animals.filter((animal: any) => animal?.tipoCadastro === 'PO').length,
                };
                setMetrics(data);
                setCache(cacheKey, data);
            } finally {
                if (isActive) setLoading(false);
            }
        };
        void run();
        return () => { isActive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeView, farmId, refreshTick]);

    useEffect(() => {
        const handleFinancialChange = () => {
            if (activeView !== 'Financeiro' || !farmId) return;
            metricsCache.delete(`${activeView}::${farmId}`);
            setRefreshTick((current) => current + 1);
        };
        window.addEventListener(FINANCIAL_PROGRESS_EVENT, handleFinancialChange);
        return () => {
            window.removeEventListener(FINANCIAL_PROGRESS_EVENT, handleFinancialChange);
        };
    }, [activeView, farmId]);

    useEffect(() => {
        if (!config || !visible) return;
        const completedCount = config.steps.filter((step) => step.done).length;
        const doneNow = completedCount === config.steps.length;
        if (!doneNow) return;
        const timeoutId = window.setTimeout(() => { if (farmId) markModuleDone(farmId, activeView); setVisible(false); }, 1500);
        return () => window.clearTimeout(timeoutId);
    }, [config, visible]);

    if (!config || !visible) return null;

    const completedCount = config.steps.filter((step) => step.done).length;
    const allDone = completedCount === config.steps.length;
    const progressPct = Math.round((completedCount / config.steps.length) * 100);
    const ctaHint = !allDone ? getNextCta(activeView, config.steps) : null;

    return (
        <div className="mb-6 rounded-2xl border-2 border-[#B6E23A] bg-[var(--eixo-surface)] shadow-sm transition-all duration-200 hover:shadow-md">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-4">
                <div>
                    {allDone ? (
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">
                            Módulo configurado! Tudo pronto para uso. 🎉
                        </p>
                    ) : (
                        <>
                            <p className="text-sm font-semibold text-[var(--eixo-text)]">
                                {config.title} — {completedCount} de {config.steps.length}
                            </p>
                            <p className="text-xs text-[var(--eixo-text-muted)]">Acompanhe a evolução mínima para uso completo deste módulo.</p>
                        </>
                    )}
                </div>
                <button
                    onClick={() => { if (farmId) markModuleDone(farmId, activeView); setVisible(false); }}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[#a8a29e] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text-muted)]"
                    aria-label="Fechar"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Barra de progresso */}
            <div className="h-1 bg-[var(--eixo-surface-soft)]">
                <div className="h-1 rounded-full bg-[var(--eixo-green)] transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>

            {/* Passos */}
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
                                <p className={`text-sm font-semibold ${step.done ? 'text-[#a8a29e]' : 'text-[var(--eixo-text)]'}`}>
                                    {step.title}
                                </p>
                                <p className="mt-0.5 text-xs text-[#a8a29e]">{step.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* CTA — próximo passo */}
            {!loading && ctaHint && (
                <div className="border-t border-[var(--eixo-border)] px-5 py-3">
                    <p className="text-xs text-[var(--eixo-text-muted)]">
                        <span className="font-semibold text-[var(--eixo-text)]">Próximo passo: </span>
                        {ctaHint}
                    </p>
                </div>
            )}
        </div>
    );
};

export default ModuleProgressCard;
