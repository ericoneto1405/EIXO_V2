import React from 'react';

const PLAN_NAMES: Record<string, string> = {
    PRO: 'Eixo Gestão',
    PLUS: 'Eixo Decisão',
};

interface UpgradeScreenProps {
    moduleName: string;
    icon: React.ReactNode;
    tagline: string;
    benefits: string[];
    requiredPlan: string;
    previewItems: string[];
    onUpgrade: () => void;
}

const UpgradeScreen: React.FC<UpgradeScreenProps> = ({
    moduleName,
    icon,
    tagline,
    benefits,
    requiredPlan,
    previewItems,
    onUpgrade,
}) => {
    return (
        <div className="grid h-full gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <section className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 lg:p-8">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite-dark)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                    Desbloqueie no {PLAN_NAMES[requiredPlan] ?? requiredPlan}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] text-[var(--eixo-text-muted)]">
                        {icon}
                    </div>
                    <div>
                        <h1 className="font-brand text-2xl font-extrabold text-[var(--eixo-graphite-dark)]">{moduleName}</h1>
                        <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">{tagline}</p>
                    </div>
                </div>

                <div className="mt-8 space-y-3">
                    {benefits.map((benefit) => (
                        <div
                            key={benefit}
                            className="flex items-start gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3"
                        >
                            <span className="mt-1 h-2 w-2 rounded-full bg-[var(--eixo-green)]" />
                            <p className="text-sm leading-relaxed text-[var(--eixo-text-muted)]">{benefit}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onUpgrade}
                        className="inline-flex items-center rounded-2xl bg-[var(--eixo-green)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#8f7144]"
                    >
                        Fazer upgrade
                    </button>
                    <p className="text-sm text-[var(--eixo-text-muted)]">Libere esse módulo sem sair da operação da fazenda.</p>
                </div>
            </section>

            <aside className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6">
                <div className="rounded-[20px] border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">Prévia do módulo</p>
                    <div className="mt-4 space-y-3">
                        {previewItems.map((item, index) => (
                            <div
                                key={`${moduleName}-${item}`}
                                className={`rounded-2xl border border-white/80 bg-[var(--eixo-surface)]/80 px-4 py-3 backdrop-blur-sm ${
                                    index === 0 ? 'blur-[0.2px]' : 'blur-[0.6px]'
                                }`}
                            >
                                <div className="mb-2 h-2.5 w-24 rounded-full bg-[var(--eixo-border)]" />
                                <div className="h-3 w-full rounded-full bg-[var(--eixo-bg)]" />
                                <div className="mt-2 h-3 w-4/5 rounded-full bg-[var(--eixo-bg)]" />
                                <p className="mt-3 text-sm font-medium text-[var(--eixo-text-muted)]">{item}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>
        </div>
    );
};

export default UpgradeScreen;
