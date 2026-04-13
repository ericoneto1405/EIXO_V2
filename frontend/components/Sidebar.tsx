import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface SidebarProps {
    activeItem: string;
    setActiveItem: (item: string) => void;
    allowedModules?: string[];
}

interface NavSubItem {
    label: string;
    path: string;
}

interface NavItem {
    label: string;
    icon: React.ReactNode;
    badge?: string;
    subItems?: NavSubItem[];
}

interface NavSection {
    title: string;
    items: NavItem[];
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

const MedicineIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 7l8 8a4 4 0 01-5.657 5.657l-8-8A4 4 0 019 7z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 11l-4 4" />
    </svg>
);

const GrainIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 3h10l-1 3H8L7 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6h12l2 14H4L6 6z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11h6" />
    </svg>
);

const SupplementIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3l8 4v10l-8 4-8-4V7l8-4z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v18" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7l8 4 8-4" />
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

const MoneyUpIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 17V9" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.5 12.5l3.5-3.5 3.5 3.5" />
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

const SettingsIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="10" cy="18" r="2" />
    </svg>
);

const SidebarPanelIcon: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
    <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={collapsed ? 'M5 6h7M5 12h7M5 18h7' : 'M12 6h7M12 12h7M12 18h7'} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={collapsed ? 'M13 4l4 2-4 2M13 10l4 2-4 2M13 16l4 2-4 2' : 'M11 4L7 6l4 2M11 10l-4 2 4 2M11 16l-4 2 4 2'} />
    </svg>
);

const geneticsSubItems: NavSubItem[] = [
    { label: 'Plantel', path: '/genetics/plantel' },
    { label: 'Reprodução', path: '/genetics/reproducao' },
    { label: 'Seleção', path: '/genetics/selecao' },
    { label: 'Relatórios', path: '/genetics/relatorios' },
];

const navSections: NavSection[] = [
    {
        title: 'Principal',
        items: [
            { label: 'Mapa do Sistema', icon: <HomeIcon />, badge: 'Audit' },
            { label: 'Visão Geral', icon: <HomeIcon /> },
            { label: 'Fazendas', icon: <FarmIcon /> },
            { label: 'Rebanho Comercial', icon: <HerdCommercialIcon /> },
            { label: 'Plantel P.O.', icon: <HerdPoIcon /> },
            { label: 'Eixo Genetics', icon: <HerdGeneticIcon />, subItems: geneticsSubItems, badge: 'Módulo' },
        ],
    },
    {
        title: 'Cadastros',
        items: [
            { label: 'Fornecedores', icon: <SuppliersIcon /> },
            { label: 'Remédios', icon: <MedicineIcon /> },
            { label: 'Rações', icon: <GrainIcon /> },
            { label: 'Suplementos', icon: <SupplementIcon /> },
        ],
    },
    {
        title: 'Nutrição',
        items: [
            { label: 'Nutrição', icon: <NutritionIcon /> },
        ],
    },
    {
        title: 'Financeiro',
        items: [
            { label: 'Contas a Pagar', icon: <MoneyDownIcon /> },
            { label: 'Contas a Receber', icon: <MoneyUpIcon /> },
            { label: 'Fluxo de Caixa', icon: <ChartIcon /> },
            { label: 'DRE', icon: <ReportIcon /> },
        ],
    },
    {
        title: 'Operação',
        items: [
            { label: 'Operações', icon: <OperationsIcon /> },
            { label: 'Configurações', icon: <SettingsIcon /> },
        ],
    },
];

const ChevronIndicator: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <span className="text-xs text-current">{isOpen ? '▾' : '▸'}</span>
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
}) => {
    const baseClasses = `w-full flex items-center ${
        isCollapsed ? 'justify-center' : 'justify-start'
    } ${isSubItem ? 'py-1.5' : 'py-2.5'} ${isSubItem ? (isCollapsed ? 'px-3' : 'pl-11 pr-3') : 'px-3.5'} ${
        isSubItem ? 'text-[13px]' : 'text-sm'
    } font-medium transition-all duration-150 rounded-2xl active:translate-y-[1px] ${
        isActive
            ? 'translate-y-[1px] border border-amber-300/60 bg-amber-100 text-stone-900 shadow-[inset_0_2px_6px_rgba(120,95,58,0.14)]'
            : 'text-stone-600 shadow-[inset_0_0_0_rgba(0,0,0,0)] hover:translate-y-[1px] hover:border hover:border-stone-200 hover:bg-stone-100 hover:text-stone-900 hover:shadow-[inset_0_2px_5px_rgba(120,95,58,0.08)]'
    }`;

    return (
        <button
            type="button"
            onClick={onClick}
            className={baseClasses}
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
    const [isAssistantVisible, setIsAssistantVisible] = React.useState(true);
    const [isAssistantMinimized, setIsAssistantMinimized] = React.useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const isGeneticsRoute = location.pathname.startsWith('/genetics');
    const [isGeneticsOpen, setIsGeneticsOpen] = React.useState(false);

    const handleSelect = (label: string) => {
        setActiveItem(label);
        if (isGeneticsRoute) {
            navigate('/');
        }
    };

    const isModuleAllowed = (label: string) => {
        if (!allowedModules || allowedModules.length === 0) {
            return true;
        }
        return allowedModules.includes(label);
    };

    React.useEffect(() => {
        if (isGeneticsRoute) {
            setIsGeneticsOpen(true);
        }
    }, [isGeneticsRoute]);

    const isGeneticsExpanded = isGeneticsRoute || isGeneticsOpen;

    const handleToggleGenetics = () => {
        if (isGeneticsRoute) {
            return;
        }
        setIsGeneticsOpen((prev) => !prev);
    };

    return (
        <aside
            className={`hidden lg:flex lg:shrink-0 flex-col px-4 py-5 transition-all duration-200 ${
                isCollapsed ? 'w-20' : 'w-72'
            }`}
        >
            <div className="flex h-full flex-col rounded-[30px] border border-stone-200/80 bg-white/78 shadow-[0_18px_60px_rgba(120,95,58,0.10)] backdrop-blur">
            <div className="flex items-start justify-between px-5 pb-2 pt-6">
                <div className="flex-1">
                    {!isCollapsed && (
                        <div className="min-h-[124px]">
                            <p className="text-[3.6rem] font-black leading-[0.9] text-stone-900">eixo</p>
                            <p className="mt-3 pl-[2px] text-[11px] uppercase tracking-[0.16em] text-stone-600">
                                Gestão Pecuária de Corte
                            </p>
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setIsCollapsed((prev) => !prev)}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-2 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
                    aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
                >
                    <SidebarPanelIcon collapsed={isCollapsed} />
                </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-0 space-y-5">
                {navSections.map((section) => (
                    <div key={section.title}>
                        {!isCollapsed && (
                            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                                {section.title}
                            </p>
                        )}
                        <ul className="space-y-1">
                            {section.items.map((item) => {
                                if (!isModuleAllowed(item.label)) {
                                    return null;
                                }
                                const isDropdown = Boolean(item.subItems?.length);
                                if (!isDropdown) {
                                    const isActive = !isGeneticsRoute && activeItem === item.label;
                                    return (
                                        <li key={item.label}>
                                            <SidebarButton
                                                label={item.label}
                                                icon={item.icon}
                                                isActive={isActive}
                                                isCollapsed={isCollapsed}
                                                onClick={() => handleSelect(item.label)}
                                                badge={item.badge}
                                            />
                                        </li>
                                    );
                                }

                                const isParentActive = isGeneticsRoute;
                                return (
                                    <li key={item.label}>
                                        <SidebarButton
                                            label={item.label}
                                            icon={item.icon}
                                            isActive={isParentActive}
                                            isCollapsed={isCollapsed}
                                            onClick={handleToggleGenetics}
                                            suffix={<ChevronIndicator isOpen={isGeneticsExpanded} />}
                                        />
                                        {!isCollapsed && isGeneticsExpanded && (
                                            <ul className="mt-1 space-y-1">
                                                {item.subItems?.map((subItem) => {
                                                    const isSubActive =
                                                        location.pathname === subItem.path ||
                                                        location.pathname.startsWith(`${subItem.path}/`);
                                                    return (
                                                        <li key={subItem.label}>
                                                            <SidebarButton
                                                                label={subItem.label}
                                                                isActive={isSubActive}
                                                                isCollapsed={isCollapsed}
                                                                isSubItem
                                                                onClick={() => {
                                                                    navigate(subItem.path);
                                                                    setIsGeneticsOpen(true);
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

            {!isCollapsed && isAssistantVisible && (
                <div className="px-5 pb-6">
                    <div className="rounded-3xl border border-stone-200 bg-stone-900 p-4 text-white shadow-lg">
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
                                    onClick={() => setIsAssistantVisible(false)}
                                    aria-label="Fechar assistente"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                        {!isAssistantMinimized && (
                            <button className="mt-4 w-full py-2 rounded-xl bg-white/15 text-sm font-semibold hover:bg-white/25 transition-colors">
                                Abrir chat
                            </button>
                        )}
                    </div>
                </div>
            )}
            </div>
        </aside>
    );
};

export default Sidebar;
