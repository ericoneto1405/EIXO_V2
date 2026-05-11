import React, { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../api';
import { Alert } from '../types';

// ---- Icons ----
const ChevronDownIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
);

const LocationIcon: React.FC = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const HouseIcon: React.FC = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);

const UserIcon: React.FC = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const LogoutIcon: React.FC = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

const UsersIcon: React.FC = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const CheckIcon: React.FC = () => (
    <svg className="w-4 h-4 text-[var(--eixo-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);

const BellIcon: React.FC = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
);

// ---- Helpers ----
const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const getFirstName = (name: string) => String(name || '').trim().split(/\s+/)[0] || '';

// ---- Types ----
interface Farm {
    id: string;
    name: string;
}

interface HeaderProps {
    farms: Farm[];
    selectedFarmId: string | null;
    onSelectFarm: (farmId: string | null) => void;
    currentUser?: { name: string; email: string; phone?: string | null; avatarUrl?: string | null } | null;
    onLogout?: () => void;
    canRegisterUsers?: boolean;
    onOpenUserRegister?: () => void;
    onOpenProfile?: () => void;
    onAlertAction?: (alert: Alert) => boolean;
}

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
        case 'WEIGHING':
            return normalizeWeighingLabel(message);
        case 'COCHO':
            return message.replace(/^COCHO:\s*/i, '').trim();
        case 'AGUA':
            return message.replace(/^AGUA:\s*/i, '').trim();
        case 'NASCEU':
            return message.replace(/^NASCEU:\s*/i, '').trim();
        case 'MORREU':
            return message.replace(/^MORREU:\s*/i, '').trim();
        case 'DOENTE':
            return message.replace(/^DOENTE:\s*/i, '').trim();
        case 'AVARIA':
            return message.replace(/^AVARIA:\s*/i, '').trim();
        default:
            return message;
    }
};

const normalizeAlertMeta = (alert: Alert): OperationalAlert => {
    const severity: AlertSeverity = alert.type === 'critical'
        ? 'high'
        : alert.type === 'warning'
            ? 'medium'
            : 'info';

    const sourceLabel = alert.source === 'APP_MANEJO' ? 'App do Manejo' : alert.source === 'FINANCEIRO' ? 'Financeiro' : 'Sistema';
    const chipLabel = normalizeShortAlertText(alert);
    const baseDescription = cleanTrailingPeriod(alert.message);

    switch (alert.sourceType) {
        case 'WEIGHING':
            return {
                ...alert,
                severity,
                chipLabel,
                title: 'Animais sem pesagem',
                description: `${baseDescription}. Abra a área de Pesagens para revisar as pendências.`,
                sourceLabel,
                actionLabel: 'Abrir Pesagens',
            };
        case 'GMD':
            return {
                ...alert,
                severity: 'high',
                chipLabel,
                title: 'Peso fora do esperado',
                description: `${baseDescription}. Vale revisar a última pesagem desses animais.`,
                sourceLabel,
                actionLabel: 'Abrir Pesagens',
            };
        case 'COCHO':
            return {
                ...alert,
                severity,
                chipLabel,
                title: 'Cocho sem atualização',
                description: `${baseDescription}. Água e comida precisam andar juntas na rotina operacional.`,
                sourceLabel,
                hoursToRespond: 24,
                actionLabel: 'Entendido',
            };
        case 'AGUA':
            return {
                ...alert,
                severity,
                chipLabel,
                title: 'Bebedouro sem atualização',
                description: `${baseDescription}. Sem registro de água no período, o alerta precisa de resposta rápida.`,
                sourceLabel,
                hoursToRespond: 24,
                actionLabel: 'Entendido',
            };
        case 'NASCEU':
            return {
                ...alert,
                severity: 'info',
                chipLabel,
                title: 'Nascimento informado',
                description: `${baseDescription}. Esse registro veio do campo e aguarda conferência da fazenda.`,
                sourceLabel,
                hoursToRespond: 24,
                actionLabel: 'Entendido',
            };
        case 'MORREU':
            return {
                ...alert,
                severity: 'high',
                chipLabel,
                title: 'Morte informada aguardando confirmação',
                description: `${baseDescription}. Revise o caso e registre a confirmação quando a área estiver pronta.`,
                sourceLabel,
                hoursToRespond: 24,
                actionLabel: 'Entendido',
            };
        case 'DOENTE':
            return {
                ...alert,
                severity: 'high',
                chipLabel,
                title: 'Doença informada no campo',
                description: `${baseDescription}. A fazenda precisa revisar esse registro com prioridade.`,
                sourceLabel,
                hoursToRespond: 24,
                actionLabel: 'Entendido',
            };
        case 'AVARIA':
            return {
                ...alert,
                severity: 'high',
                chipLabel,
                title: 'Ocorrência operacional aguardando análise',
                description: `${baseDescription}. Essa pendência veio do campo e precisa de retorno da operação.`,
                sourceLabel,
                hoursToRespond: 24,
                actionLabel: 'Entendido',
            };
        case 'FINANCEIRO':
            return {
                ...alert,
                severity,
                chipLabel,
                title: 'Pendência financeira próxima do vencimento',
                description: `${baseDescription}. Use o módulo Financeiro para revisar os lançamentos.`,
                sourceLabel,
                actionLabel: 'Ver detalhes',
            };
        default:
            return {
                ...alert,
                severity,
                chipLabel,
                title: 'Alerta operacional',
                description: `${baseDescription}.`,
                sourceLabel,
                actionLabel: 'Entendido',
            };
    }
};

// ---- Header ----
const Header: React.FC<HeaderProps> = ({
    farms,
    selectedFarmId,
    onSelectFarm,
    currentUser,
    onLogout,
    canRegisterUsers,
    onOpenUserRegister,
    onOpenProfile,
    onAlertAction,
}) => {
    const [farmOpen, setFarmOpen] = useState(false);
    const [userOpen, setUserOpen] = useState(false);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [selectedAlert, setSelectedAlert] = useState<OperationalAlert | null>(null);
    const [selectedAlertAnchor, setSelectedAlertAnchor] = useState<{ top: number; left: number } | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const alertsRowRef = useRef<HTMLDivElement>(null);
    const alertPopoverRef = useRef<HTMLDivElement>(null);

    const farmRef = useRef<HTMLDivElement>(null);
    const userRef = useRef<HTMLDivElement>(null);

    const hasFarms = farms.length > 0;
    const hasMultipleFarms = farms.length > 1;
    const selectedFarm = farms.find((f) => f.id === selectedFarmId) ?? null;
    // "Todas as fazendas" só é válido quando o usuário escolheu explicitamente
    // (selectedFarmId===null) e há mais de uma fazenda cadastrada
    const allFarmsSelected = hasMultipleFarms && selectedFarmId === null;

    // Rótulo do botão de seleção de fazenda
    const farmLabel = allFarmsSelected
        ? 'Todas as fazendas'
        : selectedFarm?.name
        ?? (hasFarms ? farms[0]?.name : 'Nenhuma cadastrada');

    const farmSubLabel = allFarmsSelected ? 'Visualizando' : 'Fazenda selecionada';

    const farmAvatar = allFarmsSelected ? (
        <HouseIcon />
    ) : selectedFarm ? (
        getInitials(selectedFarm.name)
    ) : (
        <LocationIcon />
    );

    const operationalAlerts = alerts.map(normalizeAlertMeta);

    const updateScrollState = () => {
        const el = alertsRowRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    // Alertas — recarrega quando muda a fazenda selecionada
    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const q = selectedFarmId ? `?farmId=${encodeURIComponent(selectedFarmId)}` : '';
                const res = await fetch(buildApiUrl(`/alerts${q}`), { credentials: 'include' });
                const payload = await res.json().catch(() => ({}));
                if (active && res.ok) {
                    setAlerts(Array.isArray(payload?.alerts) ? payload.alerts : []);
                }
            } catch {
                if (active) setAlerts([]);
            }
        };
        void load();
        const id = window.setInterval(load, 60_000);
        return () => { active = false; window.clearInterval(id); };
    }, [selectedFarmId]);

    // Atualiza visibilidade das setas quando os alertas mudam
    useEffect(() => {
        const el = alertsRowRef.current;
        if (!el) return;
        requestAnimationFrame(updateScrollState);
    }, [alerts]);

    useEffect(() => {
        const handleResize = () => updateScrollState();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Fechar dropdowns ao clicar fora
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (farmRef.current && !farmRef.current.contains(e.target as Node)) setFarmOpen(false);
            if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
            if (alertPopoverRef.current && !alertPopoverRef.current.contains(e.target as Node)) {
                setSelectedAlert(null);
                setSelectedAlertAnchor(null);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    const handleAlertClick = (alert: OperationalAlert, event: React.MouseEvent<HTMLButtonElement>) => {
        if (onAlertAction?.(alert)) {
            setSelectedAlert(null);
            setSelectedAlertAnchor(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const width = 320;
        const viewportPadding = 16;
        const preferredLeft = rect.left;
        const left = Math.min(
            Math.max(viewportPadding, preferredLeft),
            window.innerWidth - width - viewportPadding,
        );

        setSelectedAlert(alert);
        setSelectedAlertAnchor({
            top: rect.bottom + 10,
            left,
        });
    };

    return (
        <header className="relative z-20 rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">

            {/* ── Linha principal ──────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-3 lg:px-6">

                {/* Seletor de Fazenda */}
                <div className="relative shrink-0" ref={farmRef}>
                    <button
                        onClick={() => setFarmOpen((v) => !v)}
                        className="flex max-w-[270px] items-center gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5 transition-colors hover:bg-[#EDEDED]"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--eixo-text)] text-sm font-bold text-white">
                            {farmAvatar}
                        </div>
                        <div className="hidden min-w-0 flex-1 text-left sm:block">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">
                                {farmSubLabel}
                            </p>
                            <p className="max-w-[180px] truncate text-sm font-bold text-[var(--eixo-text)]">
                                {farmLabel}
                            </p>
                        </div>
                        <ChevronDownIcon isOpen={farmOpen} />
                    </button>

                    {farmOpen && (
                        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-xl">
                            <div className="border-b border-[var(--eixo-border)] px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Suas fazendas</p>
                            </div>
                            <ul className="max-h-64 overflow-y-auto py-2">
                                {hasFarms ? (
                                    <>
                                        {/* "Todas as fazendas" — só aparece quando há mais de uma */}
                                        {hasMultipleFarms && (
                                            <>
                                                <li>
                                                    <button
                                                        type="button"
                                                        onClick={() => { onSelectFarm(null); setFarmOpen(false); }}
                                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                                    >
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--eixo-text)] text-white">
                                                            <HouseIcon />
                                                        </div>
                                                        <span className="flex-1 font-medium">Todas as fazendas</span>
                                                        {allFarmsSelected && <CheckIcon />}
                                                    </button>
                                                </li>
                                                <li className="mx-4 my-1 border-t border-[var(--eixo-border)]" />
                                            </>
                                        )}
                                        {farms.map((farm) => (
                                            <li key={farm.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => { onSelectFarm(farm.id); setFarmOpen(false); }}
                                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                                >
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--eixo-text)] text-xs font-bold text-white">
                                                        {getInitials(farm.name)}
                                                    </div>
                                                    <span className="flex-1 font-medium">{farm.name}</span>
                                                    {farm.id === selectedFarmId && <CheckIcon />}
                                                </button>
                                            </li>
                                        ))}
                                    </>
                                ) : (
                                    <li className="px-4 py-3 text-sm text-[var(--eixo-text-muted)]">Nenhuma fazenda cadastrada.</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Central de alertas */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2.5">
                        <div className="flex shrink-0 items-center gap-2 pr-1">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EDEDED] text-[var(--eixo-text-muted)]">
                                <BellIcon />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">
                                    Alertas
                                </p>
                                <p className="text-xs font-medium text-[var(--eixo-text-muted)]">
                                    {operationalAlerts.length > 0
                                        ? `${operationalAlerts.length} ${operationalAlerts.length === 1 ? 'pendente' : 'pendentes'}`
                                        : 'Nenhum alerta no momento'}
                                </p>
                            </div>
                        </div>

                        <div className="h-7 w-px shrink-0 bg-[var(--eixo-border)]" />

                        {canScrollLeft && (
                            <button
                                type="button"
                                onClick={() => alertsRowRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--eixo-border)]/70 bg-[var(--eixo-surface)]/88 text-[var(--eixo-text-soft)] transition-colors hover:bg-[#EDEDED] hover:text-[var(--eixo-text-muted)]"
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
                            {operationalAlerts.length > 0 ? operationalAlerts.map((alert) => (
                                <button
                                    key={alert.id}
                                    type="button"
                                    onClick={(event) => handleAlertClick(alert, event)}
                                    title={alert.description}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[14px] font-semibold leading-none transition-colors hover:brightness-[0.98] ${ALERT_PANEL_STYLE[alert.severity]}`}
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ALERT_PANEL_DOT[alert.severity]}`} />
                                    <span className="whitespace-nowrap">{alert.chipLabel}</span>
                                </button>
                            )) : (
                                <span className="whitespace-nowrap text-sm text-[var(--eixo-text-muted)]">
                                    Nenhum alerta no momento
                                </span>
                            )}
                        </div>

                        {canScrollRight && (
                            <button
                                type="button"
                                onClick={() => alertsRowRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--eixo-border)]/70 bg-[var(--eixo-surface)]/88 text-[var(--eixo-text-soft)] transition-colors hover:bg-[#EDEDED] hover:text-[var(--eixo-text-muted)]"
                                aria-label="Rolar alertas para a direita"
                            >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Lado direito — usuário */}
                {currentUser && (
                    <div className="relative shrink-0" ref={userRef}>
                        <button
                            onClick={() => setUserOpen((v) => !v)}
                            className="flex max-w-[138px] items-center gap-2.5 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2.5 transition-colors hover:bg-[#EDEDED]"
                        >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--eixo-text)] text-xs font-bold text-[#f5f0e8]">
                                {currentUser.avatarUrl
                                    ? <img src={currentUser.avatarUrl} alt={currentUser.name} className="h-full w-full object-cover" />
                                    : getInitials(currentUser.name)
                                }
                            </div>
                            <div className="hidden min-w-0 flex-1 text-left sm:block">
                                <p className="max-w-[62px] truncate text-sm font-semibold leading-tight text-[var(--eixo-text)]">
                                    {getFirstName(currentUser.name)}
                                </p>
                            </div>
                            <ChevronDownIcon isOpen={userOpen} />
                        </button>

                        {userOpen && (
                            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-xl">
                                <div className="border-b border-[var(--eixo-border)] px-4 py-3">
                                    <p className="text-sm font-semibold text-[var(--eixo-text)]">{currentUser.name}</p>
                                    <p className="truncate text-xs text-[var(--eixo-text-muted)]">{currentUser.email}</p>
                                </div>
                                <ul className="py-2">
                                    <li>
                                        <button
                                            type="button"
                                            onClick={() => { onOpenProfile?.(); setUserOpen(false); }}
                                            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                        >
                                            <UserIcon />
                                            <span>Meu Perfil</span>
                                        </button>
                                    </li>
                                    {canRegisterUsers && (
                                        <>
                                            <li className="my-1 border-t border-[var(--eixo-border)]" />
                                            <li>
                                                <button
                                                    type="button"
                                                    onClick={() => { onOpenUserRegister?.(); setUserOpen(false); }}
                                                    className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                                >
                                                    <UsersIcon />
                                                    <span>Cadastrar usuários</span>
                                                </button>
                                            </li>
                                        </>
                                    )}
                                    <li className="my-1 border-t border-[var(--eixo-border)]" />
                                    <li>
                                        <button
                                            type="button"
                                            onClick={() => { onLogout?.(); setUserOpen(false); }}
                                            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[var(--eixo-danger)] transition-colors hover:bg-[#fff2ef]"
                                        >
                                            <LogoutIcon />
                                            <span>Sair</span>
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {selectedAlert && selectedAlertAnchor && (
                <div
                    ref={alertPopoverRef}
                    className="fixed z-50 w-80 rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-2xl"
                    style={{ top: selectedAlertAnchor.top, left: selectedAlertAnchor.left }}
                >
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedAlert(null);
                            setSelectedAlertAnchor(null);
                        }}
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
                        {selectedAlert.hoursToRespond ? (
                            <p><span className="font-semibold text-[var(--eixo-text)]">Prazo:</span> responder em até {selectedAlert.hoursToRespond}h</p>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setSelectedAlert(null);
                            setSelectedAlertAnchor(null);
                        }}
                        className="mt-4 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-bg)]"
                    >
                        {selectedAlert.actionLabel}
                    </button>
                </div>
            )}
        </header>
    );
};

export default Header;
