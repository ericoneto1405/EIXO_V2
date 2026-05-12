import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../api';
import type { Farm } from '../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OnboardingChecklistProps {
    userId: string;
    farmId: string | null;
    farms: Farm[];
    onNavigate: (view: string, options?: { herdTab?: 'animals' | 'weighings' }) => void;
    contextView?: 'Fazendas' | 'Rebanho Comercial';
    onboardingCompletedAt?: string | null;
}

interface StepState {
    farm: boolean;
    paddocks: boolean;
    animals: boolean;
    weighings: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const dismissedKey = (userId: string) => `eixo_onboarding_dismissed_${userId}`;
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const isDismissedTemporarily = (userId: string) => {
    try {
        const raw = localStorage.getItem(dismissedKey(userId));
        if (!raw) return false;
        const dismissedAt = Number(raw);
        if (!Number.isFinite(dismissedAt)) return false;
        if (Date.now() - dismissedAt > DISMISS_TTL_MS) {
            localStorage.removeItem(dismissedKey(userId));
            return false;
        }
        return true;
    } catch {
        return false;
    }
};

const dismissTemporarily = (userId: string) => {
    try {
        localStorage.setItem(dismissedKey(userId), String(Date.now()));
    } catch { /* silencioso */ }
};

// ─── Componente ───────────────────────────────────────────────────────────────

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
    userId,
    farmId,
    farms,
    onNavigate,
    contextView = 'Fazendas',
    onboardingCompletedAt,
}) => {
    const [steps, setSteps] = useState<StepState>({ farm: false, paddocks: false, animals: false, weighings: false });
    const [loading, setLoading] = useState(true);
    const [visible, setVisible] = useState(true);
    const [allDone, setAllDone] = useState(false);

    useEffect(() => {
        // Guards dentro do effect — hooks sempre chamados, early return só no callback
        if (!visible || !!onboardingCompletedAt) return;
        if (isDismissedTemporarily(userId)) { setVisible(false); return; }

        const check = async () => {
            setLoading(true);
            const hasFarm = farms.length > 0;
            const hasPaddocks = farms.some((farm) => (farm.paddocks?.length ?? 0) > 0);
            const farmDone = hasFarm;
            const paddocksDone = hasPaddocks;
            let animalsDone = false;
            let weighingsDone = false;

            if (farmId) {
                try {
                    const [aRes, wRes] = await Promise.all([
                        fetch(buildApiUrl(`/animals?farmId=${farmId}&limit=1`), { credentials: 'include' }),
                        fetch(buildApiUrl(`/farms/${farmId}/weighings?limit=1`), { credentials: 'include' }),
                    ]);
                    const [aData, wData] = await Promise.all([
                        aRes.json().catch(() => ({})),
                        wRes.json().catch(() => ({})),
                    ]);
                    animalsDone = (aData?.total ?? aData?.animals?.length ?? 0) > 0;
                    weighingsDone = (wData?.total ?? wData?.weighings?.length ?? 0) > 0;
                } catch { /* silencioso */ }
            }

            const next = { farm: farmDone, paddocks: paddocksDone, animals: animalsDone, weighings: weighingsDone };
            setSteps(next);
            setLoading(false);

            if (next.farm && next.paddocks && next.animals && next.weighings) {
                setAllDone(true);
                // Salva conclusão no backend (persistência entre dispositivos)
                fetch(buildApiUrl('/auth/me/onboarding'), {
                    method: 'PATCH',
                    credentials: 'include',
                }).catch(() => { /* silencioso */ });
                // Mostra mensagem de conclusão por 2,5s antes de fechar
                setTimeout(() => setVisible(false), 2500);
            }
        };

        check();
    }, [userId, farmId, farms, visible, onboardingCompletedAt]);

    if (!visible || !!onboardingCompletedAt) return null;

    const handleDismiss = () => {
        dismissTemporarily(userId);
        setVisible(false);
    };

    const isHerdContext = contextView === 'Rebanho Comercial';

    const contextSteps = isHerdContext
        ? [steps.animals, steps.weighings]
        : [steps.farm, steps.paddocks];
    const completedCount = contextSteps.filter(Boolean).length;
    const progressPct = Math.round((completedCount / 2) * 100);

    const nextAction = isHerdContext
        ? (!steps.animals
            ? { label: 'Adicionar animais', onClick: () => onNavigate('Rebanho Comercial', { herdTab: 'animals' }) }
            : { label: 'Registrar pesagem', onClick: () => onNavigate('Rebanho Comercial', { herdTab: 'weighings' }) })
        : (!steps.farm
            ? { label: 'Cadastrar fazenda', onClick: () => onNavigate('Fazendas') }
            : { label: 'Cadastrar pastos', onClick: () => onNavigate('Fazendas') });

    return (
        <div className="mb-6 rounded-2xl border-2 border-[#B6E23A] bg-[var(--eixo-surface)] shadow-sm transition-all duration-200 hover:shadow-md">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--eixo-green-soft)]">
                        <svg className="h-5 w-5 text-[var(--eixo-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    </div>
                    <div>
                        {allDone ? (
                            <div className="flex items-center gap-2">
                                <svg className="h-5 w-5 flex-shrink-0 text-[var(--eixo-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l4 4 7-7M9 12.75l2 2 4-4" />
                                </svg>
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">
                                    {isHerdContext
                                        ? 'Base do manejo do rebanho configurada, volte aqui sempre que precisar registrar pesagens e acompanhar o desempenho.'
                                        : 'Estrutura da fazenda configurada, volte aqui sempre que precisar adicionar pastos ou atualizar os dados da propriedade.'}
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">
                                    {isHerdContext ? 'Evolução do Manejo do Rebanho' : 'Primeiros passos'} — {completedCount} de 2 concluídos
                                </p>
                                <p className="text-xs text-[var(--eixo-text-muted)]">
                                    {isHerdContext
                                        ? 'Conclua a base do manejo para operar o rebanho com segurança.'
                                        : 'Complete para começar a usar o sistema.'}
                                </p>
                            </>
                        )}
                    </div>
                </div>
                <button
                    onClick={handleDismiss}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[#a8a29e] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text-muted)]"
                    aria-label="Dispensar guia"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Barra de progresso */}
            <div className="h-1 bg-[var(--eixo-surface-soft)]">
                <div
                    className="h-1 rounded-full bg-[var(--eixo-green)] transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                />
            </div>

            {/* Passos */}
            {loading ? (
                <div className="px-5 py-4 text-sm text-[#a8a29e]">Verificando seu progresso…</div>
            ) : (
                <div className="divide-y divide-[var(--eixo-surface-soft)] px-5">
                    {isHerdContext ? (
                        <>
                            <StepRow
                                done={steps.animals}
                                number={1}
                                title="Cadastre ou importe os animais"
                                description="Monte o rebanho inicial da fazenda."
                            />
                            <StepRow
                                done={steps.weighings}
                                number={2}
                                title="Registre a primeira pesagem"
                                description="Comece a acompanhar o desempenho do rebanho."
                            />
                        </>
                    ) : (
                        <>
                            <StepRow
                                done={steps.farm}
                                number={1}
                                title="Cadastre a fazenda"
                                description="Registre o nome, localização e tamanho da propriedade."
                            />
                            <StepRow
                                done={steps.paddocks}
                                number={2}
                                title="Cadastre os pastos"
                                description="Divida a fazenda em áreas para organizar lotação e manejo."
                            />
                        </>
                    )}
                </div>
            )}
            {!loading && !allDone && nextAction.onClick && (
                <div className="border-t border-[var(--eixo-border)] px-5 py-4">
                    <button
                        type="button"
                        onClick={nextAction.onClick}
                        className="rounded-xl border-2 border-[#5a8c00] bg-[#B6E23A] px-3.5 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[#a3d130]"
                    >
                        {nextAction.label}
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── StepRow ──────────────────────────────────────────────────────────────────

interface StepRowProps {
    done: boolean;
    number: number;
    title: string;
    description: string;
}

const StepRow: React.FC<StepRowProps> = ({ done, number, title, description }) => (
    <div className="flex items-center gap-4 py-4">
        {/* Ícone de status */}
        <div className="flex-shrink-0">
            {done ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--eixo-green)]">
                    <svg className="h-4 w-4 text-[#1a1a1a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--eixo-border)] bg-[var(--eixo-surface)] text-xs font-bold text-[var(--eixo-text-muted)]">
                    {number}
                </div>
            )}
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${done ? 'text-[#a8a29e]' : 'text-[var(--eixo-text)]'}`}>
                {title}
            </p>
            <p className="mt-0.5 text-xs text-[#a8a29e]">{description}</p>
        </div>
    </div>
);

export default OnboardingChecklist;
