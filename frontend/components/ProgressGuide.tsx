import React, { useEffect, useId, useRef } from 'react';

export interface GuideStep {
    title: string;
    description: string;
    done: boolean;
    unavailable?: boolean;
}

export const guideButtonClass = 'rounded-xl border-2 border-[#5a8c00] bg-primary px-3.5 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-primary-dark focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--eixo-green-dark) disabled:opacity-60';

interface Props {
    title: string;
    moduleName?: string;
    description: string;
    farmName?: string | null;
    steps: GuideStep[];
    loading: boolean;
    error: boolean;
    hasData: boolean;
    collapsed: boolean;
    onCollapse: (value: boolean) => void;
    onRetry: () => void;
    requiresConfirmation?: boolean;
    detailsNote?: React.ReactNode;
    children?: React.ReactNode;
}

const ProgressGuide: React.FC<Props> = ({
    title, moduleName, description, farmName, steps, loading, error, hasData,
    collapsed, onCollapse, onRetry, requiresConfirmation = false, detailsNote, children,
}) => {
    const contentId = useId();
    const toggleRef = useRef<HTMLButtonElement>(null);
    const focusRequested = useRef(false);
    const toggle = () => {
        focusRequested.current = true;
        onCollapse(!collapsed);
    };
    useEffect(() => {
        if (focusRequested.current) {
            toggleRef.current?.focus();
            focusRequested.current = false;
        }
    }, [collapsed]);

    const applicable = steps.filter((step) => !step.unavailable);
    const unavailable = steps.filter((step) => step.unavailable);
    const completed = applicable.filter((step) => step.done).length;
    const allDone = hasData && completed === applicable.length;
    const next = applicable.find((step) => !step.done);
    const count = `${completed} de ${applicable.length} concluídos`;
    const summary = loading ? 'Verificando…'
        : error ? 'Não foi possível verificar'
        : hasData && allDone && requiresConfirmation ? `${completed} de ${applicable.length} passos concluídos — confirme para finalizar`
        : hasData && allDone ? `${count} — Primeiros passos concluídos`
        : hasData ? count : 'Progresso ainda não verificado';
    const label = moduleName ? `${title} — ${moduleName}` : title;

    return (
        <section aria-label={label} className="mb-4 rounded-2xl border border-(--eixo-border-strong) bg-(--eixo-surface)">
            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h2 className="text-sm font-semibold text-(--eixo-text)">{title}</h2>
                        {moduleName && <span className="text-xs text-(--eixo-text-muted)">{moduleName}</span>}
                    </div>
                    <p className="mt-1 wrap-break-word text-xs text-(--eixo-text-muted)">
                        {farmName ? `Fazenda: ${farmName}` : 'Nenhuma fazenda selecionada'}
                    </p>
                    <div role="status" aria-live="polite" className={`mt-1 text-xs ${error ? 'text-(--eixo-danger)' : 'text-(--eixo-text-muted)'}`}>
                        {summary}
                        {error && hasData && <p className="mt-1 text-(--eixo-text-muted)">Últimos dados válidos: {count}.</p>}
                    </div>
                </div>
                <button
                    type="button" ref={toggleRef} onClick={toggle}
                    aria-expanded={!collapsed} aria-controls={contentId}
                    aria-label={`${collapsed ? 'Abrir' : 'Recolher'} guia${moduleName ? ` de ${moduleName}` : ''}`}
                    className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-(--eixo-text) hover:bg-(--eixo-surface-soft) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--eixo-text)"
                >
                    {collapsed ? 'Abrir guia' : 'Recolher guia'}
                    <svg aria-hidden="true" className={`h-4 w-4 ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                    </svg>
                </button>
            </div>

            <div id={contentId} hidden={collapsed} className="border-t border-(--eixo-border) px-4 py-4">
                {error && (
                    <div className="mb-4">
                        {hasData && <p className="mb-3 text-sm text-(--eixo-text-muted)">Os últimos dados verificados foram preservados.</p>}
                        <button type="button" className={guideButtonClass} onClick={onRetry}>Tentar novamente</button>
                    </div>
                )}
                {!loading && !error && hasData && (
                    <div className="mb-4">
                        {next && (
                            <div className="mb-3">
                                <h3 className="text-base font-semibold text-(--eixo-text)">{next.title}</h3>
                                <p className="mt-1 text-sm text-(--eixo-text-muted)">
                                    {farmName ? next.description : 'Selecione uma fazenda no menu superior para continuar.'}
                                </p>
                            </div>
                        )}
                        {children}
                    </div>
                )}
                {hasData && (
                    <details>
                        <summary className="w-fit cursor-pointer rounded-lg py-2 text-sm font-semibold text-(--eixo-text) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--eixo-text)">
                            {allDone && !requiresConfirmation ? 'Revisar os passos' : 'Ver todos os passos'}
                        </summary>
                        <p className="mb-3 mt-2 text-xs text-(--eixo-text-muted)">{description}</p>
                        <ol role="list" className="divide-y divide-(--eixo-border)">
                            {applicable.map((step, index) => (
                                <li key={step.title} aria-current={step === next ? 'step' : undefined} className="flex items-start gap-3 py-3">
                                    <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-(--eixo-green) text-[#1a1a1a]' : 'border border-(--eixo-border-strong) text-(--eixo-text-muted)'}`}>
                                        {step.done ? '✓' : index + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <p className={`text-sm ${step === next ? 'font-semibold text-(--eixo-text)' : 'text-(--eixo-text-muted)'}`}>
                                            {step.title}{' '}
                                            <span className="ml-1 text-xs font-normal text-(--eixo-text-muted)">
                                                {step.done ? 'Concluído' : step === next ? 'Etapa atual' : 'Pendente'}
                                            </span>
                                        </p>
                                        {farmName && <p className="mt-1 text-xs text-(--eixo-text-muted)">{step.description}</p>}
                                    </div>
                                </li>
                            ))}
                        </ol>
                        {unavailable.length > 0 && (
                            <div className="mt-3 border-t border-(--eixo-border) pt-3">
                                <h3 className="text-sm font-semibold text-(--eixo-text-muted)">Recursos indisponíveis no plano</h3>
                                <ul className="mt-2 space-y-2">
                                    {unavailable.map((step) => (
                                        <li key={step.title} className="text-sm text-(--eixo-text-muted)">
                                            <p>{step.title}</p>
                                            <p className="mt-1 text-xs">{step.description}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {detailsNote}
                    </details>
                )}
            </div>
        </section>
    );
};

export default ProgressGuide;
