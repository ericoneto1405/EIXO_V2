import React, { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../api';
import type { Alert } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertSeverity = 'high' | 'medium' | 'info';

interface OperationalAlert extends Alert {
    severity: AlertSeverity;
    chipLabel: string;
    title: string;
    description: string;
    sourceLabel: string;
    hoursToRespond?: number;
    actionLabel: string;
}

interface AlertsBarProps {
    selectedFarmId: string | null;
    onAlertAction?: (alert: Alert) => boolean;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ALERT_PANEL_STYLE: Record<AlertSeverity, string> = {
    high: 'border-[rgba(184,66,50,0.18)] bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]',
    medium: 'border-[rgba(197,138,32,0.18)] bg-[rgba(197,138,32,0.10)] text-[#966d1f]',
    info: 'border-[rgba(109,101,88,0.16)] bg-[rgba(255,250,241,0.72)] text-[var(--eixo-text)]',
};

const ALERT_PANEL_DOT: Record<AlertSeverity, string> = {
    high: 'bg-[var(--eixo-danger)]',
    medium: 'bg-[var(--eixo-warning)]',
    info: 'bg-[var(--eixo-text-muted)]',
};

const ALERT_PANEL_BADGE: Record<AlertSeverity, string> = {
    high: 'border-[rgba(184,66,50,0.18)] bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]',
    medium: 'border-[rgba(197,138,32,0.18)] bg-[rgba(197,138,32,0.10)] text-[#966d1f]',
    info: 'border-[var(--eixo-border)] bg-[rgba(255,250,241,0.88)] text-[var(--eixo-text-muted)]',
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const BellIcon: React.FC = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const cleanTrailingPeriod = (value: string) => value.trim().replace(/\.$/, '');

const normalizeWeighingLabel = (message: string) => {
    const match = message.match(/^(\d+)\s+(animal sem pesagem|animais sem pesagem)\s+nos últimos\s+(\d+)\s+dias(?:\s+\((.+)\))?/i);
    if (!match) return cleanTrailingPeriod(message);
    const [, count, label, days, farmName] = match;
    return `${count} ${label} há ${days}+ dias${farmName ? ` (${farmName})` : ''}`;
};

const normalizeShortAlertText = (alert: Alert) => {
    const message = cleanTrailingPeriod(alert.message);
    switch (alert.sourceType) {
        case 'WEIGHING': return normalizeWeighingLabel(message);
        case 'COCHO':    return message.replace(/^COCHO:\s*/i, '').trim();
        case 'AGUA':     return message.replace(/^AGUA:\s*/i, '').trim();
        case 'NASCEU':   return message.replace(/^NASCEU:\s*/i, '').trim();
        case 'MORREU':   return message.replace(/^MORREU:\s*/i, '').trim();
        case 'DOENTE':   return message.replace(/^DOENTE:\s*/i, '').trim();
        case 'AVARIA':   return message.replace(/^AVARIA:\s*/i, '').trim();
        default:         return message;
    }
};

const normalizeAlertMeta = (alert: Alert): OperationalAlert => {
    const severity: AlertSeverity = alert.type === 'critical' ? 'high' : alert.type === 'warning' ? 'medium' : 'info';
    const sourceLabel = alert.source === 'APP_MANEJO' ? 'App do Manejo' : alert.source === 'FINANCEIRO' ? 'Financeiro' : 'Sistema';
    const chipLabel = normalizeShortAlertText(alert);
    const baseDescription = cleanTrailingPeriod(alert.message);

    switch (alert.sourceType) {
        case 'WEIGHING': return { ...alert, severity, chipLabel, title: 'Animais sem pesagem', description: `${baseDescription}. Abra a área de Pesagens para revisar as pendências.`, sourceLabel, actionLabel: 'Abrir Pesagens' };
        case 'GMD':      return { ...alert, severity: 'high', chipLabel, title: 'Peso fora do esperado', description: `${baseDescription}. Vale revisar a última pesagem desses animais.`, sourceLabel, actionLabel: 'Abrir Pesagens' };
        case 'COCHO':    return { ...alert, severity, chipLabel, title: 'Cocho sem atualização', description: `${baseDescription}. Água e comida precisam andar juntas na rotina operacional.`, sourceLabel, hoursToRespond: 24, actionLabel: 'Entendido' };
        case 'AGUA':     return { ...alert, severity, chipLabel, title: 'Bebedouro sem atualização', description: `${baseDescription}. Sem registro de água no período, o alerta precisa de resposta rápida.`, sourceLabel, hoursToRespond: 24, actionLabel: 'Entendido' };
        case 'NASCEU':   return { ...alert, severity: 'info', chipLabel, title: 'Nascimento informado', description: `${baseDescription}. Esse registro veio do campo e aguarda conferência da fazenda.`, sourceLabel, hoursToRespond: 24, actionLabel: 'Entendido' };
        case 'MORREU':   return { ...alert, severity: 'high', chipLabel, title: 'Morte informada aguardando confirmação', description: `${baseDescription}. Revise o caso e registre a confirmação quando a área estiver pronta.`, sourceLabel, hoursToRespond: 24, actionLabel: 'Entendido' };
        case 'DOENTE':   return { ...alert, severity: 'high', chipLabel, title: 'Doença informada no campo', description: `${baseDescription}. A fazenda precisa revisar esse registro com prioridade.`, sourceLabel, hoursToRespond: 24, actionLabel: 'Entendido' };
        case 'AVARIA':   return { ...alert, severity: 'high', chipLabel, title: 'Ocorrência operacional aguardando análise', description: `${baseDescription}. Essa pendência veio do campo e precisa de retorno da operação.`, sourceLabel, hoursToRespond: 24, actionLabel: 'Entendido' };
        case 'FINANCEIRO_VENCIDO_PAGAR': return { ...alert, severity: 'high', chipLabel, title: 'Contas a pagar vencidas', description: `${baseDescription}. Acesse o módulo Financeiro → Contas a Pagar para regularizar.`, sourceLabel: 'Financeiro', actionLabel: 'Ver contas' };
        case 'FINANCEIRO_VENCIDO_RECEBER': return { ...alert, severity: 'medium', chipLabel, title: 'Contas a receber vencidas', description: `${baseDescription}. Acesse o módulo Financeiro → Contas a Receber para cobrar.`, sourceLabel: 'Financeiro', actionLabel: 'Ver contas' };
        case 'FINANCEIRO_SALDO_NEGATIVO': return { ...alert, severity: 'medium', chipLabel, title: 'Saldo do mês negativo', description: `${baseDescription}. Acesse Fluxo de Caixa para entender a origem do déficit.`, sourceLabel: 'Financeiro', actionLabel: 'Ver fluxo' };
        case 'FINANCEIRO': return { ...alert, severity, chipLabel, title: 'Pendência financeira próxima do vencimento', description: `${baseDescription}. Use o módulo Financeiro para revisar os lançamentos.`, sourceLabel, actionLabel: 'Ver detalhes' };
        default:         return { ...alert, severity, chipLabel, title: 'Alerta operacional', description: `${baseDescription}.`, sourceLabel, actionLabel: 'Entendido' };
    }
};

// ── Componente ────────────────────────────────────────────────────────────────

const AlertsBar: React.FC<AlertsBarProps> = ({ selectedFarmId, onAlertAction }) => {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [selectedAlert, setSelectedAlert] = useState<OperationalAlert | null>(null);
    const [selectedAlertAnchor, setSelectedAlertAnchor] = useState<{ top: number; left: number } | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const alertsRowRef = useRef<HTMLDivElement>(null);
    const alertPopoverRef = useRef<HTMLDivElement>(null);

    const updateScrollState = () => {
        const el = alertsRowRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const q = selectedFarmId ? `?farmId=${encodeURIComponent(selectedFarmId)}` : '';
                const res = await fetch(buildApiUrl(`/alerts${q}`), { credentials: 'include' });
                const payload = await res.json().catch(() => ({}));
                if (active && res.ok) setAlerts(Array.isArray(payload?.alerts) ? payload.alerts : []);
            } catch {
                if (active) setAlerts([]);
            }
        };
        void load();
        const id = window.setInterval(load, 60_000);
        return () => { active = false; window.clearInterval(id); };
    }, [selectedFarmId]);

    useEffect(() => {
        const el = alertsRowRef.current;
        if (!el) return;
        requestAnimationFrame(updateScrollState);
    }, [alerts]);

    useEffect(() => {
        window.addEventListener('resize', updateScrollState);
        return () => window.removeEventListener('resize', updateScrollState);
    }, []);

    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (alertPopoverRef.current && !alertPopoverRef.current.contains(e.target as Node)) {
                setSelectedAlert(null);
                setSelectedAlertAnchor(null);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    const operationalAlerts = alerts.map(normalizeAlertMeta);

    if (operationalAlerts.length === 0) return null;

    const handleAlertClick = (alert: OperationalAlert, event: React.MouseEvent<HTMLButtonElement>) => {
        if (onAlertAction?.(alert)) {
            setSelectedAlert(null);
            setSelectedAlertAnchor(null);
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const width = 320;
        const viewportPadding = 16;
        const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
        setSelectedAlert(alert);
        setSelectedAlertAnchor({ top: rect.bottom + 10, left });
    };

    return (
        <>
            <div className="mt-[10px] rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                <div className="flex items-center gap-2 px-4 py-3">
                    <div className="flex shrink-0 items-center gap-2 pr-1">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDEDED] text-[var(--eixo-text-muted)]">
                            <BellIcon />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">Alertas</p>
                            <p className="text-xs font-medium text-[var(--eixo-text-muted)]">
                                {operationalAlerts.length} {operationalAlerts.length === 1 ? 'pendente' : 'pendentes'}
                            </p>
                        </div>
                    </div>

                    <div className="h-7 w-px shrink-0 bg-[var(--eixo-border)]" />

                    {canScrollLeft && (
                        <button
                            type="button"
                            onClick={() => alertsRowRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--eixo-border)]/70 bg-[var(--eixo-surface)]/88 text-[var(--eixo-text-soft)] transition-colors hover:bg-[#EDEDED]"
                            aria-label="Rolar alertas para a esquerda"
                        >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}

                    <div
                        ref={alertsRowRef}
                        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"
                        style={{ scrollbarWidth: 'none' }}
                        onScroll={updateScrollState}
                    >
                        {operationalAlerts.map((alert) => (
                            <button
                                key={alert.id}
                                type="button"
                                onClick={(e) => handleAlertClick(alert, e)}
                                title={alert.description}
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[14px] font-semibold leading-none transition-colors hover:brightness-[0.98] ${ALERT_PANEL_STYLE[alert.severity]}`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ALERT_PANEL_DOT[alert.severity]}`} />
                                <span className="whitespace-nowrap">{alert.chipLabel}</span>
                            </button>
                        ))}
                    </div>

                    {canScrollRight && (
                        <button
                            type="button"
                            onClick={() => alertsRowRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--eixo-border)]/70 bg-[var(--eixo-surface)]/88 text-[var(--eixo-text-soft)] transition-colors hover:bg-[#EDEDED]"
                            aria-label="Rolar alertas para a direita"
                        >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {selectedAlert && selectedAlertAnchor && (
                <div
                    ref={alertPopoverRef}
                    className="fixed z-50 w-80 rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-2xl"
                    style={{ top: selectedAlertAnchor.top, left: selectedAlertAnchor.left }}
                >
                    <button
                        type="button"
                        onClick={() => { setSelectedAlert(null); setSelectedAlertAnchor(null); }}
                        className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full text-[var(--eixo-text-soft)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]"
                        aria-label="Fechar detalhe do alerta"
                    >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>

                    <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${ALERT_PANEL_BADGE[selectedAlert.severity]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${ALERT_PANEL_DOT[selectedAlert.severity]}`} />
                        {selectedAlert.severity === 'high' ? 'Alerta alto' : selectedAlert.severity === 'medium' ? 'Atenção' : 'Informativo'}
                    </div>

                    <h3 className="pr-6 font-brand text-[15px] font-extrabold leading-snug text-[var(--eixo-text)]">
                        {selectedAlert.title}
                    </h3>

                    <p className="mt-2 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                        {selectedAlert.description}
                    </p>

                    <div className="mt-4 space-y-1.5 text-xs text-[var(--eixo-text-muted)]">
                        <p><span className="font-semibold text-[var(--eixo-text)]">Origem:</span> {selectedAlert.sourceLabel}</p>
                        {selectedAlert.hoursToRespond && (
                            <p><span className="font-semibold text-[var(--eixo-text)]">Prazo:</span> responder em até {selectedAlert.hoursToRespond}h</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => { setSelectedAlert(null); setSelectedAlertAnchor(null); }}
                        className="mt-4 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-bg)]"
                    >
                        {selectedAlert.actionLabel}
                    </button>
                </div>
            )}
        </>
    );
};

export default AlertsBar;
