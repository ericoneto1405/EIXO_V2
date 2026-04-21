import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AssistantChat from './AssistantChat'; // Added AssistantChat import

interface SidebarProps {
    activeItem: string;
    setActiveItem: (item: string) => void;
    allowedModules?: string[];
}

interface NavSubItem {
    label: string;
    value: string;
    path?: string;
    allowedLabels?: string[];
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
    { label: 'Visão Geral', icon: <HomeIcon />, value: 'Visão Geral' },
    { label: 'Estrutura da Fazenda', icon: <FarmIcon />, value: 'Fazendas', allowedLabels: ['Fazendas'] },
    {
        label: 'Manejo do Rebanho',
        icon: <HerdCommercialIcon />,
        value: 'Rebanho Comercial',
        allowedLabels: ['Rebanho Comercial', 'Plantel P.O.'],
        subItems: [
            { label: 'Rebanho', value: 'Rebanho Comercial', allowedLabels: ['Rebanho Comercial'] },
            { label: 'Plantel P.O.', value: 'Plantel P.O.', allowedLabels: ['Plantel P.O.'] },
        ],
    },
    { label: 'Nutrição', icon: <NutritionIcon />, value: 'Nutrição' },
    { label: 'Confinamento e Contratos', icon: <OperationsIcon />, value: 'Operações', allowedLabels: ['Operações'] },
    { label: 'Reprodução', icon: <HerdPoIcon />, value: 'Eixo Genetics', path: '/genetics/reproducao', allowedLabels: ['Eixo Genetics'] },
    {
        label: 'Eixo Acasalamento',
        icon: <HerdGeneticIcon />,
        value: 'Eixo Genetics',
        allowedLabels: ['Eixo Genetics'],
        subItems: geneticsSubItems,
    },
    {
        label: 'Estoque e Equipamentos',
        icon: <SuppliersIcon />,
        value: 'Fornecedores',
        allowedLabels: ['Fornecedores', 'Remédios', 'Rações', 'Suplementos'],
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
        value: 'Contas a Pagar',
        allowedLabels: ['Contas a Pagar', 'Contas a Receber', 'Fluxo de Caixa', 'DRE'],
        subItems: [
            { label: 'Contas a Pagar', value: 'Contas a Pagar', allowedLabels: ['Contas a Pagar'] },
            { label: 'Contas a Receber', value: 'Contas a Receber', allowedLabels: ['Contas a Receber'] },
            { label: 'Fluxo de Caixa', value: 'Fluxo de Caixa', allowedLabels: ['Fluxo de Caixa'] },
            { label: 'DRE', value: 'DRE', allowedLabels: ['DRE'] },
        ],
    },
    { label: 'Gestão Comercial', icon: <ChartIcon />, badge: 'Em breve', disabled: true },
    { label: 'Registro de Atividades', icon: <ReportIcon />, badge: 'Em breve', disabled: true },
];

const navItemsWithStructureSubItems: NavItem[] = navItems.map((item) =>
    item.label === 'Estrutura da Fazenda'
        ? {
              ...item,
              subItems: [
                  { label: 'Fazendas e Pastos', value: 'Fazendas', allowedLabels: ['Fazendas'] },
                  { label: 'Mapa da Fazenda', value: 'Mapa da Fazenda', allowedLabels: ['Fazendas'] },
                  { label: 'Estruturas da Fazenda', value: 'Estruturas da Fazenda' },
                  { label: 'Equipe e Permissões', value: 'Equipe e Permissões' },
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
    const baseClasses = `w-full flex items-center ${
        isCollapsed ? 'justify-center' : 'justify-start'
    } ${isSubItem ? 'py-1.5' : 'py-2.5'} ${isSubItem ? (isCollapsed ? 'px-3' : 'pl-11 pr-3') : 'px-3.5'} ${
        isSubItem ? 'text-[13px]' : 'text-sm'
    } font-medium transition-all duration-150 rounded-2xl ${disabled ? 'cursor-not-allowed opacity-70' : 'active:translate-y-[2px]'} ${
        disabled
            ? 'border border-dashed border-[#8b765d] bg-[#5f503d]/55 text-[#e3d7c1]'
            :
        isActive
            ? 'translate-y-[2px] border border-[#c7a56a] bg-[#d9b878] text-[#3e3122] shadow-[inset_0_3px_7px_rgba(120,95,58,0.22),0_1px_1px_rgba(255,255,255,0.20)]'
            : 'border border-transparent text-[#f1e7d7] shadow-[inset_0_0_0_rgba(0,0,0,0)] hover:translate-y-[2px] hover:border-[#6e5e47] hover:bg-[#5a4c39] hover:text-white hover:shadow-[inset_0_3px_7px_rgba(34,24,16,0.24)] active:bg-[#5a4c39]'
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
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
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

const Sidebar: React.FC<SidebarProps> = ({ activeItem, setActiveItem, allowedModules }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);
    const [isAssistantPanelVisible, setIsAssistantPanelVisible] = React.useState(true);
    const [isAssistantMinimized, setIsAssistantMinimized] = React.useState(false);
    const [isChatOpen, setIsChatOpen] = React.useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const isGeneticsRoute = location.pathname.startsWith('/genetics');
    const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

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

    React.useEffect(() => {
        if (isGeneticsRoute) {
            setOpenGroups((current) => ({ ...current, 'Eixo Genetics': true }));
        }
    }, [isGeneticsRoute]);

    return (
        <>
            <aside
                className={`hidden lg:flex lg:shrink-0 flex-col px-4 py-5 transition-all duration-200 ${
                    isCollapsed ? 'w-20' : 'w-72'
                }`}
            >
                <div className="flex h-full flex-col rounded-[30px] border border-[#6a5a46] bg-[#4c4030] shadow-[0_14px_40px_rgba(66,46,24,0.14)] backdrop-blur">
                <div className="flex items-start justify-between px-5 pb-2 pt-6">
                    <div className="flex-1">
                        {!isCollapsed && (
                            <div className="min-h-[124px]">
                                <p className="text-[3.6rem] font-black leading-[0.9] text-[#f4eadb]">eixo</p>
                                <p className="mt-3 pl-[2px] text-[11px] uppercase tracking-[0.16em] text-[#cdbfa8]">
                                    Gestão Pecuária de Corte
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsCollapsed((prev) => !prev)}
                        className="rounded-md border border-[#6e5e47] bg-[#5a4c39] p-1.5 text-[#e8dcc7] transition-colors hover:bg-[#665742] hover:text-white"
                        aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
                    >
                        <SidebarPanelIcon collapsed={isCollapsed} />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-0">
                    <ul className="space-y-1.5">
                        {navItemsWithStructureSubItems.map((item) => {
                            if (!item.disabled && !isModuleAllowed(item.allowedLabels || (item.value ? [item.value] : undefined))) {
                                return null;
                            }

                            const visibleSubItems = item.subItems?.filter((subItem) => {
                                if (!subItem.allowedLabels?.length && !subItem.path) {
                                    return true;
                                }
                                return isModuleAllowed(subItem.allowedLabels || [subItem.value]);
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
                                        isActive={isParentActive}
                                        isCollapsed={isCollapsed}
                                        badge={item.badge}
                                        disabled={item.disabled}
                                        suffix={hasSubItems ? <ChevronIndicator isOpen={isExpanded} /> : undefined}
                                        onClick={() => {
                                            if (item.disabled) {
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
                                                const isComingSoon = !subItem.path && !isModuleAllowed(subItem.allowedLabels || [subItem.value]);
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
                                                            badge={isComingSoon ? 'Em breve' : undefined}
                                                            disabled={isComingSoon}
                                                            onClick={() => {
                                                                if (isComingSoon) {
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
                </nav>

                {!isCollapsed && isAssistantPanelVisible && (
                    <div className="px-5 pb-6">
                        <div className="rounded-3xl border border-[#6e5e47] bg-[#2f261d] p-4 text-white shadow-lg">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-semibold">Assistente Virtual</p>
                                    {!isAssistantMinimized && (
                                        <p className="mt-1 text-xs text-white/75">
                                            Tire dúvidas sobre o rebanho, finanças ou cadastros com o Eixo Copiloto.
                                        </p>
                                    )}
                                </div>
                                <div className="flex space-x-1">
                                    <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15 text-xs font-bold transition-colors hover:bg-white/25"
                                        onClick={() => setIsAssistantMinimized((prev) => !prev)}
                                        aria-label={isAssistantMinimized ? 'Expandir assistente' : 'Minimizar assistente'}
                                    >
                                        _
                                    </button>
                                    <button
                                        type="button"
                                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15 text-xs font-bold transition-colors hover:bg-white/25"
                                        onClick={() => setIsAssistantPanelVisible(false)}
                                        aria-label="Fechar assistente"
                                    >
                                        x
                                    </button>
                                </div>
                            </div>
                            {!isAssistantMinimized && (
                                <button
                                    className="mt-4 w-full py-2 rounded-xl bg-white/15 text-sm font-semibold hover:bg-white/25 transition-colors"
                                    onClick={() => setIsChatOpen(true)}
                                >
                                    Abrir chat
                                </button>
                            )}
                        </div>
                    </div>
                )}
                </div>
            </aside>

            {isChatOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="relative w-full max-w-md h-[80vh] flex flex-col">
                        <AssistantChat onClose={() => setIsChatOpen(false)} farmId={null} />
                    </div>
                </div>
            )}
        </>
    );
};

export default Sidebar;
