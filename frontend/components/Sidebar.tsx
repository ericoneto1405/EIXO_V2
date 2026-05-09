import React from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

// ─── Dados dos módulos bloqueados ───────────────────────────────────────────

type NavStatus = 'available' | 'plan_locked' | 'coming_soon' | 'needs_setup';

interface ModuleInfo {
    plan: 'PRO' | 'PLUS';
    title: string;
    description: string;
    cta: string;
}

const MODULE_INFO: Record<string, ModuleInfo> = {
    'Visão Geral': {
        plan: 'PRO',
        title: 'Disponível no Plano Gestão',
        description: 'Este módulo faz parte dos recursos avançados para gestão da fazenda.',
        cta: 'Conhecer Plano Gestão',
    },
    'Nutrição': {
        plan: 'PRO',
        title: 'Disponível no Plano Gestão',
        description: 'Este módulo faz parte dos recursos avançados para gestão da fazenda.',
        cta: 'Conhecer Plano Gestão',
    },
    'Registro de Atividades': {
        plan: 'PRO',
        title: 'Disponível no Plano Gestão',
        description: 'Este módulo faz parte dos recursos avançados para gestão da fazenda.',
        cta: 'Conhecer Plano Gestão',
    },
    'Confinamento e Contratos': {
        plan: 'PLUS',
        title: 'Disponível no Plano Decisão',
        description: 'Este módulo faz parte dos recursos avançados para análise e decisão.',
        cta: 'Conhecer Plano Decisão',
    },
    'Reprodução': {
        plan: 'PLUS',
        title: 'Disponível no Plano Decisão',
        description: 'Este módulo faz parte dos recursos avançados para análise e decisão.',
        cta: 'Conhecer Plano Decisão',
    },
    'Eixo Acasalamento': {
        plan: 'PLUS',
        title: 'Disponível no Plano Decisão',
        description: 'Este módulo faz parte dos recursos avançados para análise e decisão.',
        cta: 'Conhecer Plano Decisão',
    },
    'Estoque e Equipamentos': {
        plan: 'PLUS',
        title: 'Disponível no Plano Decisão',
        description: 'Controle botijão de sêmen e estoque técnico usado nas decisões do EIXO.',
        cta: 'Conhecer Plano Decisão',
    },
    'Gestão Comercial': {
        plan: 'PLUS',
        title: 'Disponível no Plano Decisão',
        description: 'Este módulo faz parte dos recursos avançados para análise e decisão.',
        cta: 'Conhecer Plano Decisão',
    },
};

interface InformationalStateInfo {
    title: string;
    description: string;
    cta: string;
}

const STATUS_INFO: Record<Exclude<NavStatus, 'available' | 'plan_locked'>, InformationalStateInfo> = {
    coming_soon: {
        title: 'Em desenvolvimento',
        description: 'Este módulo ainda está sendo preparado para uso no EIXO.',
        cta: 'Entendido',
    },
    needs_setup: {
        title: 'Complete os primeiros passos',
        description: 'Cadastre os dados básicos da fazenda para liberar esta área.',
        cta: 'Ver primeiros passos',
    },
};

// ─── Popover de upgrade ──────────────────────────────────────────────────────

interface SidebarPopoverState {
    type: Exclude<NavStatus, 'available'>;
    itemLabel: string;
    title: string;
    description: string;
    cta: string;
    plan?: 'PRO' | 'PLUS';
    ctaAction?: 'plans' | 'setup' | 'close';
}

interface StatusPopoverProps {
    state: SidebarPopoverState;
    pos: { top: number; left: number };
    onClose: () => void;
    popoverRef: React.RefObject<HTMLDivElement | null>;
}

const StatusPopover: React.FC<StatusPopoverProps> = ({ state, pos, onClose, popoverRef }) => {
    // Ajusta verticalmente se sair da tela
    const adjustedTop = Math.min(pos.top, window.innerHeight - 320);
    const badgeLabel = state.type === 'plan_locked'
        ? state.plan === 'PRO' ? 'Plano Gestão' : 'Plano Decisão'
        : state.type === 'coming_soon'
            ? 'Em breve'
            : 'Primeiros passos';

    return createPortal(
        <div
            ref={popoverRef}
            style={{ top: adjustedTop, left: pos.left }}
            className="fixed z-50 w-72 rounded-3xl border-2 border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-2xl"
        >
            {/* Botão fechar */}
            <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full text-[var(--eixo-text-soft)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]"
                aria-label="Fechar"
            >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>

            {/* Badge do estado */}
            <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                state.type === 'plan_locked'
                    ? 'border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]'
                    : state.type === 'coming_soon'
                        ? 'border-[#4a4944] bg-[rgba(255,255,255,0.04)] text-[#b9b3a8]'
                        : 'border-[var(--eixo-border)] bg-[rgba(255,250,241,0.78)] text-[var(--eixo-graphite)]'
            }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                    state.type === 'coming_soon'
                        ? 'bg-[#b9b3a8]'
                        : 'bg-[var(--eixo-green)]'
                }`} />
                {badgeLabel}
            </div>

            {/* Nome do módulo */}
            <h3 className="pr-6 font-brand text-[15px] font-extrabold leading-snug text-[var(--eixo-text)]">
                {state.title}
            </h3>

            <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[var(--eixo-text-soft)]">
                {state.itemLabel}
            </p>

            <p className="mt-2 text-sm leading-relaxed text-[var(--eixo-text-muted)]">{state.description}</p>

            {/* CTA */}
            <button
                type="button"
                onClick={() => {
                    if (state.ctaAction === 'plans') {
                        onClose();
                        window.location.href = '/planos';
                        return;
                    }
                    if (state.ctaAction === 'setup') {
                        onClose();
                        return;
                    }
                    onClose();
                }}
                className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors active:translate-y-[1px] ${
                    state.type === 'coming_soon'
                        ? 'border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text)] hover:bg-[var(--eixo-bg)]'
                        : state.type === 'needs_setup'
                            ? 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text)] hover:bg-[var(--eixo-bg)]'
                            : 'bg-[var(--eixo-green)] text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]'
                }`}
            >
                {state.cta}
            </button>
        </div>,
        document.body,
    );
};

// ─── Tipos e constantes de navegação ────────────────────────────────────────

interface SidebarProps {
    activeItem: string;
    setActiveItem: (item: string) => void;
    allowedModules?: string[];
    lockedModules?: string[];
}

interface NavSubItem {
    label: string;
    value: string;
    path?: string;
    allowedLabels?: string[];
    badge?: string;
    status?: Exclude<NavStatus, 'plan_locked'>;
    requiredPlanBadge?: 'PRO' | 'PLUS';
}

interface NavItem {
    label: string;
    icon: React.ReactNode;
    badge?: string;
    subItems?: NavSubItem[];
    value?: string;
    path?: string;
    allowedLabels?: string[];
    status?: Exclude<NavStatus, 'plan_locked'>;
    requiredPlanBadge?: 'PRO' | 'PLUS';
}

// ─── Ícones ──────────────────────────────────────────────────────────────────

const HomeIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z"
        />
    </svg>
);

const FarmIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 21c4-4 7-7.5 7-11a7 7 0 10-14 0c0 3.5 3 7 7 11z"
        />
        <circle cx="12" cy="10" r="2.5" />
    </svg>
);

const HerdCommercialIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M7 7a2 2 0 012-2h5.586a2 2 0 011.414.586l5.414 5.414a2 2 0 010 2.828l-4.172 4.172a2 2 0 01-2.828 0L7 11.414A2 2 0 016.414 10L7 7z"
        />
        <circle cx="11" cy="9" r="1.5" />
    </svg>
);

const HerdGeneticIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3h6" />
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10 3v4.5l-3.5 9A3.5 3.5 0 009.8 21h4.4a3.5 3.5 0 003.3-4.5l-3.5-9V3"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.5 14h7" />
    </svg>
);

const HerdPoIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="8" cy="7" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="16" cy="17" r="1.5" />
    </svg>
);

const SuppliersIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h11v8H3V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.5l2.5 3v2H14v-5z" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
    </svg>
);

const NutritionIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 4h8" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 4v6a3 3 0 003 3 3 3 0 003-3V4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 20h12" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14h8" />
    </svg>
);

const MoneyDownIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v8" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.5 11.5l3.5 3.5 3.5-3.5" />
    </svg>
);

const ChartIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h10" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 3l4 4-4 4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17H7" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 21l-4-4 4-4" />
    </svg>
);

const ReportIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4h7l4 4v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 4v4h4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9h2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17h6" />
    </svg>
);

const OperationsIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
);

const SidebarPanelIcon: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
    <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
    >
        {collapsed ? (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M10 3L2 12L10 21" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M16 3L8 12L16 21" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M22 3L14 12L22 21" />
            </>
        ) : (
            <>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M2 3L10 12L2 21" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M8 3L16 12L8 21" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M14 3L22 12L14 21" />
            </>
        )}
    </svg>
);

// ─── Dados de navegação ──────────────────────────────────────────────────────

interface NavSection {
    sectionLabel: string;
    items: NavItem[];
}

const navSections: NavSection[] = [
    {
        sectionLabel: 'Principal',
        items: [
            { label: 'Visão Geral', icon: <HomeIcon />, value: 'Visão Geral' },
            { label: 'Estrutura da Fazenda', icon: <FarmIcon />, value: 'Fazendas', allowedLabels: ['Fazendas'] },
            { label: 'Manejo do Rebanho', icon: <HerdCommercialIcon />, value: 'Rebanho Comercial', allowedLabels: ['Rebanho Comercial'] },
            { label: 'Financeiro', icon: <MoneyDownIcon />, value: 'Financeiro' },
        ],
    },
    {
        sectionLabel: 'Produção',
        items: [
            { label: 'Nutrição', icon: <NutritionIcon />, value: 'Nutrição', allowedLabels: ['Nutrição'], requiredPlanBadge: 'PRO' },
            { label: 'Eixo Acasalamento', icon: <HerdGeneticIcon />, value: 'Eixo Acasalamento', path: '/genetics/acasalamento', allowedLabels: ['Eixo Genetics'], requiredPlanBadge: 'PLUS' },
            { label: 'Reprodução', icon: <HerdPoIcon />, value: 'Reprodução', path: '/genetics/reproducao', allowedLabels: ['Eixo Genetics'], requiredPlanBadge: 'PLUS' },
            { label: 'Confinamento e Contratos', icon: <OperationsIcon />, value: 'Confinamento e Contratos' },
        ],
    },
    {
        sectionLabel: 'Gestão',
        items: [
            { label: 'Gestão Comercial', icon: <ChartIcon />, value: 'Gestão Comercial', allowedLabels: ['Gestão Comercial'], requiredPlanBadge: 'PLUS' },
            { label: 'Registro de Atividades', icon: <ReportIcon />, value: 'Registro de Atividades', status: 'coming_soon' },
            { label: 'Ocorrências do EIXO Campo', icon: <ReportIcon />, value: 'Ocorrências do EIXO Campo', allowedLabels: ['Operações'] },
            { label: 'Botijão de Sêmen', icon: <SuppliersIcon />, value: 'Estoque e Equipamentos' },
        ],
    },
];

const navSectionsWithSubItems: NavSection[] = navSections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
        item.label === 'Estrutura da Fazenda'
            ? {
                  ...item,
                  subItems: [
                      { label: 'Fazendas e Pastos', value: 'Fazendas', allowedLabels: ['Fazendas'] },
                      { label: 'Mapa da Fazenda', value: 'Mapa da Fazenda', badge: 'Em breve', status: 'coming_soon' as const },
                      { label: 'Estruturas da Fazenda', value: 'Estruturas da Fazenda', badge: 'Em breve', status: 'coming_soon' as const },
                      { label: 'Usuários e Permissões', value: 'Usuários e Permissões', allowedLabels: ['Fazendas'] },
                  ],
              }
            : item,
    ),
}));

// ─── SidebarButton ───────────────────────────────────────────────────────────

const ChevronIndicator: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <span className="text-xl leading-none text-current">{isOpen ? '▾' : '▸'}</span>
);

interface SidebarButtonProps {
    label: string;
    icon?: React.ReactNode;
    isActive: boolean;
    isCollapsed: boolean;
    onClick: () => void;
    onLockClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    badge?: string;
    suffix?: React.ReactNode;
    isSubItem?: boolean;
    status?: Exclude<NavStatus, 'available'>;
}

const SidebarButton: React.FC<SidebarButtonProps> = ({
    label,
    icon,
    isActive,
    isCollapsed,
    onClick,
    onLockClick,
    badge,
    suffix,
    isSubItem,
    status,
}) => {
    const isLocked = status === 'plan_locked';
    const isComingSoon = status === 'coming_soon';
    const isNeedsSetup = status === 'needs_setup';

    const baseClasses = `w-full flex items-center font-brand ${
        isCollapsed ? 'justify-center' : 'justify-start'
    } ${isSubItem ? 'py-1.5' : 'py-2.5'} ${isSubItem ? (isCollapsed ? 'px-3' : 'pl-11 pr-3') : 'px-3.5'} ${
        isSubItem ? 'text-[14px]' : 'text-[16px]'
    } ${isSubItem ? 'font-medium' : 'font-semibold'} transition-all duration-150 rounded-2xl ${status ? 'cursor-pointer' : 'active:translate-y-[2px]'} ${
        isComingSoon
            ? 'border border-dashed border-[#4a4944] bg-transparent text-[#8c8579]'
            : isNeedsSetup
                ? 'border border-[rgba(199,206,199,0.18)] bg-[rgba(255,255,255,0.02)] text-[#c3cbc5]'
            : isLocked
                ? 'border border-[rgba(199,206,199,0.08)] bg-[rgba(255,255,255,0.01)] text-[#bfc6bf] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#eef2ec]'
                :
        false
            ? ''
            :
        isActive
            ? 'translate-y-[2px] border border-transparent bg-[var(--eixo-green)] text-[#1a1a1a] font-bold'
            : 'border border-transparent text-white/75 hover:translate-y-[2px] hover:border-transparent hover:bg-white/8 hover:text-white active:bg-white/8'
    }`;

    return (
        <button
            type="button"
            onClick={onClick}
            className={baseClasses}
            aria-disabled={status ? 'true' : undefined}
        >
            {!isCollapsed && icon ? (
                <span className="flex items-center justify-center mr-3 text-current">{icon}</span>
            ) : null}
            {!isCollapsed && !icon && isSubItem ? (
                <span className="mr-3 h-1.5 w-1.5 rounded-full bg-current" />
            ) : null}
            {!isCollapsed && (
                <>
                    <span className="flex-1 text-left">{label}</span>
                    {badge && (
                        badge === 'Em breve' ? (
                            <span className="ml-2 rounded-full border border-[#4a4944] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b9b3a8]">
                                Em breve
                            </span>
                        ) : (
                            // Cadeado clicável
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLockClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.stopPropagation();
                                        onLockClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
                                    }
                                }}
                                className="ml-2 flex items-center justify-center rounded-md p-0.5 text-[#bfc6bf] transition-colors hover:text-[#eef2ec] cursor-pointer"
                                aria-label={`Saber mais sobre ${label}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </span>
                        )
                    )}
                    {!isLocked && suffix && <span className="ml-2">{suffix}</span>}
                    {isLocked && suffix && <span className="ml-1">{suffix}</span>}
                </>
            )}
            {isCollapsed && icon ? (
                <span className="flex items-center justify-center text-current">{icon}</span>
            ) : null}
        </button>
    );
};

// ─── Sidebar principal ───────────────────────────────────────────────────────

const Sidebar: React.FC<SidebarProps> = ({ activeItem, setActiveItem, allowedModules, lockedModules }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const isGeneticsRoute = location.pathname.startsWith('/genetics');
    const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
    const isPathActive = React.useCallback((path?: string) => (
        Boolean(path && (location.pathname === path || location.pathname.startsWith(`${path}/`)))
    ), [location.pathname]);
    const hasActiveRoutePath = React.useMemo(() => (
        navSectionsWithSubItems.flatMap((s) => s.items).some((item) => (
            isPathActive(item.path) || item.subItems?.some((subItem) => isPathActive(subItem.path))
        ))
    ), [isPathActive]);

    // Estado do popover de upgrade
    const [openPopover, setOpenPopover] = React.useState<SidebarPopoverState | null>(null);
    const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const popoverRef = React.useRef<HTMLDivElement | null>(null);

    // Fechar popover ao clicar fora
    React.useEffect(() => {
        if (!openPopover) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setOpenPopover(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openPopover]);

    const getPopoverState = (itemLabel: string, status: Exclude<NavStatus, 'available'>): SidebarPopoverState | null => {
        if (status === 'plan_locked') {
            const info = MODULE_INFO[itemLabel];
            if (!info) return null;
            return {
                type: status,
                itemLabel,
                title: info.title,
                description: info.description,
                cta: info.cta,
                plan: info.plan,
                ctaAction: 'plans',
            };
        }
        const info = STATUS_INFO[status];
        if (!info) return null;
        return {
            type: status,
            itemLabel,
            title: info.title,
            description: info.description,
            cta: info.cta,
            ctaAction: status === 'needs_setup' ? 'setup' : 'close',
        };
    };

    const handleStatusClick = (itemLabel: string, status: Exclude<NavStatus, 'available'>, e: React.MouseEvent) => {
        const nextState = getPopoverState(itemLabel, status);
        if (!nextState) return;
        if (openPopover?.itemLabel === itemLabel && openPopover.type === status) {
            setOpenPopover(null);
            return;
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPopoverPos({ top: rect.top - 8, left: rect.right + 12 });
        setOpenPopover(nextState);
    };

    const handleSelect = (value: string, path?: string) => {
        setActiveItem(value);
        if (path) {
            navigate(path);
            return;
        }
        if (isGeneticsRoute) {
            navigate('/');
        }
    };

    const isModuleAllowed = (labels?: string[]) => {
        if (!allowedModules || allowedModules.length === 0) {
            return true;
        }
        if (!labels?.length) {
            return true;
        }
        return labels.some((label) => allowedModules.includes(label));
    };

    const isModuleLockedByPlan = (labels?: string[]) => {
        if (!lockedModules?.length || !labels?.length) return false;
        return labels.some((label) => lockedModules.includes(label));
    };

    React.useEffect(() => {
        if (isGeneticsRoute) {
            setOpenGroups((current) => ({ ...current, 'Eixo Acasalamento': true }));
        }
    }, [isGeneticsRoute]);

    React.useEffect(() => {
        navSectionsWithSubItems.flatMap((s) => s.items).forEach((item) => {
            if (!item.subItems) return;
            const hasActiveChild = item.subItems.some((sub) => sub.value === activeItem);
            if (hasActiveChild) {
                setOpenGroups((current) => ({ ...current, [item.label]: true }));
            }
        });
    }, [activeItem]);

    return (
        <>
            <aside
                className={`hidden lg:flex lg:shrink-0 flex-col px-4 py-5 transition-all duration-200 ${
                    isCollapsed ? 'w-20' : 'w-72'
                }`}
            >
                <div
                    className="flex h-full flex-col rounded-[30px] border border-[var(--eixo-graphite)]"
                    style={{ backgroundColor: 'var(--eixo-text)' }}
                >
                <div className="px-5 pb-5 pt-4">
                    <div className="mb-4 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setIsCollapsed((prev) => !prev)}
                            className="rounded-md border border-[var(--eixo-border-strong)]/20 bg-[var(--eixo-graphite)] p-1.5 text-[var(--eixo-text-soft)] transition-colors hover:bg-[var(--eixo-graphite)] hover:text-white"
                            aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
                        >
                            <SidebarPanelIcon collapsed={isCollapsed} />
                        </button>
                    </div>
                    <div className="flex items-center justify-center">
                        {!isCollapsed && (
                            <div className="flex min-h-[108px] w-[88%] flex-col items-center justify-center">
                                <img src="/logo_eixo_official.svg" alt="EIXO" className="h-auto w-full max-w-[236px]" />
                                <p className="mt-2 w-full max-w-[236px] text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-border-strong)]">
                                    Gestão Pecuária de Corte
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-0">
                    {navSectionsWithSubItems.map((section, sectionIdx) => (
                        <div
                            key={section.sectionLabel}
                            className={sectionIdx > 0 ? 'mt-4 border-t border-[var(--eixo-graphite)] pt-4' : ''}
                        >
                            {!isCollapsed && (
                                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#57534e]">
                                    {section.sectionLabel}
                                </p>
                            )}
                            <ul className="space-y-1.5">
                                {section.items.map((item) => {
                                    const itemLabels = item.allowedLabels || (item.value ? [item.value] : undefined);
                                    const isPlanLocked = isModuleLockedByPlan(itemLabels);
                                    const itemStatus: Exclude<NavStatus, 'available'> | 'available' = item.status || (isPlanLocked ? 'plan_locked' : 'available');
                                    const visibleSubItems = item.subItems?.filter((subItem) => {
                                        const subItemPlanLocked = isModuleLockedByPlan(subItem.allowedLabels || [subItem.value]);
                                        if (subItem.status === 'coming_soon' || subItem.status === 'needs_setup') {
                                            return true;
                                        }
                                        if (!subItem.allowedLabels?.length && !subItem.path && !subItemPlanLocked) {
                                            return true;
                                        }
                                        return subItemPlanLocked || isModuleAllowed(subItem.allowedLabels || [subItem.value]);
                                    }) || [];
                                    const hasSubItems = visibleSubItems.length > 0;
                                    const isExpanded = isGeneticsRoute && item.label === 'Eixo Acasalamento'
                                        ? true
                                        : Boolean(openGroups[item.label]);
                                    const isDirectPathActive = isPathActive(item.path);
                                    const isSubItemActive = visibleSubItems.some((subItem) =>
                                        subItem.path
                                            ? isPathActive(subItem.path)
                                            : activeItem === subItem.value,
                                    );
                                    const isParentActive = isDirectPathActive || isSubItemActive || (!hasActiveRoutePath && !!item.value && activeItem === item.value);
                                    return (
                                        <li key={item.label}>
                                            <SidebarButton
                                                label={item.label}
                                                icon={item.icon}
                                                isActive={isParentActive && !isSubItemActive}
                                                isCollapsed={isCollapsed}
                                                badge={item.badge || (itemStatus === 'plan_locked' ? item.requiredPlanBadge : undefined)}
                                                status={itemStatus === 'available' ? undefined : itemStatus}
                                                suffix={hasSubItems ? <ChevronIndicator isOpen={isExpanded} /> : undefined}
                                                onLockClick={(e) => handleStatusClick(item.label, 'plan_locked', e)}
                                                onClick={(e) => {
                                                    if (itemStatus !== 'available') {
                                                        handleStatusClick(item.label, itemStatus, e);
                                                        return;
                                                    }
                                                    if (hasSubItems) {
                                                        setOpenGroups((current) => ({ ...current, [item.label]: !isExpanded }));
                                                    }
                                                    if (item.value) {
                                                        handleSelect(item.value, item.path || visibleSubItems[0]?.path);
                                                    }
                                                }}
                                            />
                                            {!isCollapsed && hasSubItems && isExpanded && (
                                                <ul className="mt-1 space-y-1">
                                                    {visibleSubItems.map((subItem) => {
                                                        const isPlanLockedSubItem = isModuleLockedByPlan(subItem.allowedLabels || [subItem.value]);
                                                        const subItemStatus: Exclude<NavStatus, 'available'> | 'available' =
                                                            subItem.status
                                                                || (isPlanLockedSubItem ? 'plan_locked'
                                                                    : (!subItem.path && !isModuleAllowed(subItem.allowedLabels || [subItem.value]) ? 'needs_setup' : 'available'));
                                                        const isSubActive = subItem.path
                                                            ? isPathActive(subItem.path)
                                                            : activeItem === subItem.value;
                                                        return (
                                                            <li key={subItem.label}>
                                                                <SidebarButton
                                                                    label={subItem.label}
                                                                    isActive={isSubActive}
                                                                    isCollapsed={isCollapsed}
                                                                    isSubItem
                                                                    badge={subItem.badge || (subItemStatus === 'coming_soon' ? 'Em breve' : subItemStatus === 'plan_locked' ? (subItem.requiredPlanBadge || item.requiredPlanBadge) : undefined)}
                                                                    status={subItemStatus === 'available' ? undefined : subItemStatus}
                                                                    onLockClick={(e) => handleStatusClick(subItem.label, 'plan_locked', e)}
                                                                    onClick={(e) => {
                                                                        if (subItemStatus !== 'available') {
                                                                            handleStatusClick(subItem.label, subItemStatus, e);
                                                                            return;
                                                                        }
                                                                        handleSelect(subItem.value, subItem.path);
                                                                    }}
                                                                />
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>

                </div>
            </aside>

            {/* Popover de upgrade — renderizado via portal fora da sidebar */}
            {openPopover && (
                <StatusPopover
                    state={openPopover}
                    pos={popoverPos}
                    onClose={() => setOpenPopover(null)}
                    popoverRef={popoverRef}
                />
            )}
        </>
    );
};

export default Sidebar;
