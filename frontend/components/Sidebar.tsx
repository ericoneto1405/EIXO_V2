import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
    disabled?: boolean;
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
    disabled?: boolean;
    requiredPlanBadge?: 'PRO' | 'PLUS';
}

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

const geneticsSubItems: NavSubItem[] = [
    { label: 'Plantel', value: 'Eixo Genetics', path: '/genetics/plantel', allowedLabels: ['Eixo Genetics'] },
    { label: 'Seleção', value: 'Eixo Genetics', path: '/genetics/selecao', allowedLabels: ['Eixo Genetics'] },
    { label: 'Relatórios', value: 'Eixo Genetics', path: '/genetics/relatorios', allowedLabels: ['Eixo Genetics'] },
];

const navItems: NavItem[] = [
    { label: 'Visão Geral', icon: <HomeIcon />, value: 'Visão Geral', requiredPlanBadge: 'PRO' },
    { label: 'Estrutura da Fazenda', icon: <FarmIcon />, value: 'Fazendas', allowedLabels: ['Fazendas'] },
    {
        label: 'Manejo do Rebanho',
        icon: <HerdCommercialIcon />,
        value: 'Rebanho Comercial',
        allowedLabels: ['Rebanho Comercial'],
    },
    { label: 'Nutrição', icon: <NutritionIcon />, value: 'Nutrição', allowedLabels: ['Nutrição'], requiredPlanBadge: 'PRO' },
    { label: 'Confinamento e Contratos', icon: <OperationsIcon />, value: 'Confinamento e Contratos', allowedLabels: ['Operações'], requiredPlanBadge: 'PLUS' },
    { label: 'Reprodução', icon: <HerdPoIcon />, value: 'Reprodução', path: '/genetics/reproducao', allowedLabels: ['Eixo Genetics'], requiredPlanBadge: 'PLUS' },
    {
        label: 'Eixo Acasalamento',
        icon: <HerdGeneticIcon />,
        value: 'Eixo Acasalamento',
        allowedLabels: ['Eixo Genetics'],
        requiredPlanBadge: 'PLUS',
        subItems: geneticsSubItems,
    },
    {
        label: 'Estoque e Equipamentos',
        icon: <SuppliersIcon />,
        value: 'Estoque e Equipamentos',
        allowedLabels: ['Fornecedores', 'Remédios', 'Rações', 'Suplementos'],
        requiredPlanBadge: 'PLUS',
        subItems: [
            { label: 'Fornecedores', value: 'Fornecedores', allowedLabels: ['Fornecedores'] },
            { label: 'Remédios', value: 'Remédios', allowedLabels: ['Remédios'] },
            { label: 'Rações', value: 'Rações', allowedLabels: ['Rações'] },
            { label: 'Suplementos', value: 'Suplementos', allowedLabels: ['Suplementos'] },
        ],
    },
    {
        label: 'Financeiro',
        icon: <MoneyDownIcon />,
        value: 'Financeiro',
        allowedLabels: ['Financeiro'],
    },
    { label: 'Gestão Comercial', icon: <ChartIcon />, value: 'Gestão Comercial', allowedLabels: ['Gestão Comercial'], requiredPlanBadge: 'PLUS' },
    { label: 'Registro de Atividades', icon: <ReportIcon />, value: 'Registro de Atividades', allowedLabels: ['Registro de Atividades'], requiredPlanBadge: 'PRO' },
];

const navItemsWithStructureSubItems: NavItem[] = navItems.map((item) =>
    item.label === 'Estrutura da Fazenda'
        ? {
              ...item,
              subItems: [
                  { label: 'Fazendas e Pastos', value: 'Fazendas', allowedLabels: ['Fazendas'] },
                  { label: 'Mapa da Fazenda', value: 'Mapa da Fazenda', badge: 'Em breve', disabled: true },
                  { label: 'Estruturas da Fazenda', value: 'Estruturas da Fazenda', badge: 'Em breve', disabled: true },
                  { label: 'Usuários e Permissões', value: 'Usuários e Permissões', allowedLabels: ['Fazendas'] },
              ],
          }
        : item,
);

const ChevronIndicator: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <span className="text-xl leading-none text-current">{isOpen ? '▾' : '▸'}</span>
);

interface SidebarButtonProps {
    label: string;
    icon?: React.ReactNode;
    isActive: boolean;
    isCollapsed: boolean;
    onClick: () => void;
    badge?: string;
    suffix?: React.ReactNode;
    isSubItem?: boolean;
    disabled?: boolean;
}

const SidebarButton: React.FC<SidebarButtonProps> = ({
    label,
    icon,
    isActive,
    isCollapsed,
    onClick,
    badge,
    suffix,
    isSubItem,
    disabled,
}) => {
    const baseClasses = `w-full flex items-center font-brand ${
        isCollapsed ? 'justify-center' : 'justify-start'
    } ${isSubItem ? 'py-1.5' : 'py-2.5'} ${isSubItem ? (isCollapsed ? 'px-3' : 'pl-11 pr-3') : 'px-3.5'} ${
        isSubItem ? 'text-[13px]' : 'text-sm'
    } ${isSubItem ? 'font-medium' : 'font-semibold'} transition-all duration-150 rounded-2xl ${disabled ? 'cursor-not-allowed opacity-70' : 'active:translate-y-[2px]'} ${
        disabled
            ? 'border border-dashed border-[#3c3a38] bg-transparent text-[#57534e]'
            :
        isActive
            ? 'translate-y-[2px] border border-transparent bg-[#a8442a] text-[#fafaf9] font-bold'
            : 'border border-transparent text-[#a8a29e] hover:translate-y-[2px] hover:border-transparent hover:bg-[#292524] hover:text-[#e7e5e4] active:bg-[#292524]'
    }`;

    return (
        <button
            type="button"
            onClick={onClick}
            className={baseClasses}
            disabled={disabled}
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
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            badge === 'Em breve'
                                ? 'bg-[#292524] text-[#a8a29e]'
                                : 'bg-[#faeee8] text-[#a8442a]'
                        }`}>
                            {badge}
                        </span>
                    )}
                    {suffix && <span className="ml-2">{suffix}</span>}
                </>
            )}
            {isCollapsed && icon ? (
                <span className="flex items-center justify-center text-current">{icon}</span>
            ) : null}
        </button>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ activeItem, setActiveItem, allowedModules, lockedModules }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const isGeneticsRoute = location.pathname.startsWith('/genetics');
    const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
    const comingSoonItems = navItemsWithStructureSubItems.filter((item) => item.disabled);

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

    // Retorna true se o módulo deve aparecer com cadeado (plano pago necessário)
    const isModuleLockedByPlan = (labels?: string[]) => {
        if (!lockedModules?.length || !labels?.length) return false;
        return labels.some((label) => lockedModules.includes(label));
    };

    React.useEffect(() => {
        if (isGeneticsRoute) {
            setOpenGroups((current) => ({ ...current, 'Eixo Genetics': true }));
        }
    }, [isGeneticsRoute]);

    // Auto-expandir o grupo pai quando um subitem está ativo
    React.useEffect(() => {
        navItemsWithStructureSubItems.forEach((item) => {
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
                <div className="flex h-full flex-col rounded-[30px] border border-[#292524] bg-[#1c1917]">
                <div className="flex items-start justify-between px-5 pb-2 pt-0">
                    <div className="flex-1">
                        {!isCollapsed && (
                            <div className="min-h-[124px]">
                                <img src="/logo_eixo_white.svg" alt="eixo" className="w-full h-auto" />
                                <p className="mt-1 whitespace-nowrap pl-1 text-[13px] font-semibold uppercase tracking-[0.05em] text-[#c4bdb5]">
                                    Gestão Pecuária de Corte
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsCollapsed((prev) => !prev)}
                        className="rounded-md border border-[#3c3a38] bg-[#292524] p-1.5 text-[#a8a29e] transition-colors hover:bg-[#3c3a38] hover:text-white"
                        aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
                    >
                        <SidebarPanelIcon collapsed={isCollapsed} />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-0">
                    <ul className="space-y-1.5">
                        {navItemsWithStructureSubItems.filter(item => !item.disabled).map((item) => {
                            const itemLabels = item.allowedLabels || (item.value ? [item.value] : undefined);
                            const isPlanLocked = !item.disabled && isModuleLockedByPlan(itemLabels);
                            const visibleSubItems = item.subItems?.filter((subItem) => {
                                const subItemPlanLocked = isModuleLockedByPlan(subItem.allowedLabels || [subItem.value]);
                                if (!subItem.allowedLabels?.length && !subItem.path && !subItemPlanLocked) {
                                    return true;
                                }
                                return subItemPlanLocked || isModuleAllowed(subItem.allowedLabels || [subItem.value]);
                            }) || [];
                            const hasSubItems = visibleSubItems.length > 0;
                            const isExpanded = isGeneticsRoute && item.label === 'Eixo Acasalamento'
                                ? true
                                : Boolean(openGroups[item.label]);
                            const isDirectPathActive = item.path
                                ? location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                                : false;
                            const isSubItemActive = visibleSubItems.some((subItem) =>
                                subItem.path
                                    ? location.pathname === subItem.path || location.pathname.startsWith(`${subItem.path}/`)
                                    : activeItem === subItem.value,
                            );
                            const isParentActive = isDirectPathActive || isSubItemActive || (!!item.value && activeItem === item.value);
                            return (
                                <li key={item.label}>
                                    <SidebarButton
                                        label={item.label}
                                        icon={item.icon}
                                        isActive={isParentActive && !isSubItemActive}
                                        isCollapsed={isCollapsed}
                                        badge={item.badge || (isPlanLocked ? item.requiredPlanBadge : undefined)}
                                        disabled={item.disabled}
                                        suffix={hasSubItems ? <ChevronIndicator isOpen={isExpanded} /> : undefined}
                                        onClick={() => {
                                            if (item.disabled) return;
                                            if (hasSubItems) {
                                                setOpenGroups((current) => ({ ...current, [item.label]: !isExpanded }));
                                            }
                                            if (item.value) {
                                                handleSelect(item.value, isPlanLocked ? undefined : (item.path || visibleSubItems[0]?.path));
                                            }
                                        }}
                                    />
                                    {!isCollapsed && hasSubItems && isExpanded && (
                                        <ul className="mt-1 space-y-1">
                                            {visibleSubItems.map((subItem) => {
                                                const isPlanLockedSubItem = isModuleLockedByPlan(subItem.allowedLabels || [subItem.value]);
                                                const isComingSoon =
                                                    Boolean(subItem.disabled) ||
                                                    (!subItem.path && !isPlanLockedSubItem && !isModuleAllowed(subItem.allowedLabels || [subItem.value]));
                                                const isSubActive = subItem.path
                                                    ? location.pathname === subItem.path || location.pathname.startsWith(`${subItem.path}/`)
                                                    : activeItem === subItem.value;
                                                return (
                                                    <li key={subItem.label}>
                                                        <SidebarButton
                                                            label={subItem.label}
                                                            isActive={isSubActive}
                                                            isCollapsed={isCollapsed}
                                                            isSubItem
                                                            badge={subItem.badge || (isComingSoon ? 'Em breve' : isPlanLockedSubItem ? (subItem.requiredPlanBadge || item.requiredPlanBadge) : undefined)}
                                                            disabled={isComingSoon}
                                                            onClick={() => {
                                                                if (isComingSoon) {
                                                                    return;
                                                                }
                                                                handleSelect(isPlanLockedSubItem ? (item.value || subItem.value) : subItem.value, isPlanLockedSubItem ? undefined : subItem.path);
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

                    {/* Módulos em desenvolvimento */}
                    {!isCollapsed && comingSoonItems.length > 0 && (
                        <div className="mt-4 border-t border-[#292524] pt-4">
                            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#57534e]">
                                Em desenvolvimento
                            </p>
                            <ul className="space-y-1">
                                {comingSoonItems.map((item) => {
                                    return (
                                        <li key={item.label}>
                                            <SidebarButton
                                                label={item.label}
                                                icon={item.icon}
                                                isActive={false}
                                                isCollapsed={isCollapsed}
                                                disabled={item.disabled}
                                                onClick={() => { if (item.disabled) return; }}
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </nav>

                </div>
            </aside>

        </>
    );
};

export default Sidebar;
