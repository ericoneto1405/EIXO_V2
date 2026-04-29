import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../api';
import type { Farm } from '../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OnboardingChecklistProps {
    userId: string;
    farmId: string | null;
    farms: Farm[];
    onNavigate: (view: string, options?: { herdTab?: 'animals' | 'weighings' }) => void;
}

interface StepState {
    farm: boolean;
    animals: boolean;
    weighings: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const storageKey = (userId: string) => `eixo_onboarding_done_${userId}`;

const isDismissed = (userId: string) => {
    try {
        return localStorage.getItem(storageKey(userId)) === '1';
    } catch {
        return false;
    }
};

const dismiss = (userId: string) => {
    try {
        localStorage.setItem(storageKey(userId), '1');
    } catch { /* silencioso */ }
};

// ─── Componente ───────────────────────────────────────────────────────────────

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
    userId,
    farmId,
    farms,
    onNavigate,
}) => {
    const [steps, setSteps] = useState<StepState>({ farm: false, animals: false, weighings: false });
    const [loading, setLoading] = useState(true);
    const [visible, setVisible] = useState(true);
    const [allDone, setAllDone] = useState(false);

    // Se já foi dispensado, não renderiza
    if (!visible || isDismissed(userId)) return null;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        if (isDismissed(userId)) { setVisible(false); return; }

        const check = async () => {
            setLoading(true);
            const hasFarm = farms.length > 0;
            const hasPaddocks = farms.some((farm) => (farm.paddocks?.length ?? 0) > 0);
            const farmDone = hasFarm && hasPaddocks;
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

            const next = { farm: farmDone, animals: animalsDone, weighings: weighingsDone };
            setSteps(next);
            setLoading(false);

            if (next.farm && next.animals && next.weighings) {
                setAllDone(true);
                dismiss(userId);
                setVisible(false);
            }
        };

        check();
    }, [userId, farmId, farms]);

    if (!visible) return null;

    const handleDismiss = () => {
        dismiss(userId);
        setVisible(false);
    };

    const completedCount = [steps.farm, steps.animals, steps.weighings].filter(Boolean).length;
    const progressPct = Math.round((completedCount / 3) * 100);
    const nextAction = !steps.farm
        ? { label: 'Cadastrar pastos', onClick: () => onNavigate('Fazendas') }
        : !steps.animals
            ? { label: 'Adicionar animais', onClick: () => onNavigate('Rebanho Comercial', { herdTab: 'animals' }) }
            : !steps.weighings
                ? { label: 'Ir para Pesagens', onClick: () => onNavigate('Rebanho Comercial', { herdTab: 'weighings' }) }
                : { label: 'Concluído', onClick: undefined };

    return (
        <div className="mb-6 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
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
                            <p className="text-sm font-semibold text-[var(--eixo-text)]">
                                Tudo pronto! Bem-vindo ao EIXO. 🎉
                            </p>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">
                                    Primeiros passos — {completedCount} de 3 concluídos
                                </p>
                                <p className="text-xs text-[var(--eixo-text-muted)]">Complete para começar a usar o sistema.</p>
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
                    <StepRow
                        done={steps.farm}
                        number={1}
                        title="Cadastre a fazenda e os pastos"
                        description="Defina a base territorial da operação."
                    />
                    <StepRow
                        done={steps.animals}
                        number={2}
                        title="Cadastre ou importe os animais"
                        description="Monte o rebanho inicial da fazenda."
                    />
                    <StepRow
                        done={steps.weighings}
                        number={3}
                        title="Registre a primeira pesagem"
                        description="Comece a acompanhar o desempenho do rebanho."
                    />
                </div>
            )}
            {!loading && !allDone && nextAction.onClick && (
                <div className="border-t border-[var(--eixo-border)] px-5 py-4">
                    <button
                        type="button"
                        onClick={nextAction.onClick}
                        className="rounded-xl border border-[var(--eixo-green)] px-3.5 py-2 text-sm font-semibold text-[var(--eixo-green)] transition-colors hover:bg-[var(--eixo-green-soft)]"
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
                    <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <p className={`text-sm font-semibold ${done ? 'text-[#a8a29e] line-through' : 'text-[var(--eixo-text)]'}`}>
                {title}
            </p>
            <p className="mt-0.5 text-xs text-[#a8a29e]">{description}</p>
        </div>
    </div>
);

export default OnboardingChecklist;
