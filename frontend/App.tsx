import React, { Suspense, useState, useRef, useEffect } from 'react';
import AssistantChat from './components/AssistantChat';
import ActivityModule from './components/ActivityModule';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { buildApiUrl } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Operations from './components/Operations';
import FieldOccurrences from './components/FieldOccurrences';
import ConfinementContracts from './components/ConfinementContracts';
import Settings from './components/Settings';
import Header from './components/Header';
import Farms from './components/Farms';
import Suppliers from './components/Suppliers';
import Medicines from './components/Medicines';
import Feeds from './components/Feeds';
import Supplements from './components/Supplements';
import SemenTankModule from './components/SemenTankModule';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import RecoverEmail from './components/RecoverEmail';
import ResetPassword from './components/ResetPassword';
import AcceptInvite from './components/AcceptInvite';
import PublicLanding from './components/PublicLanding';
import PlansPage from './components/PlansPage';
import OnboardingChecklist from './components/OnboardingChecklist';
import ModuleProgressCard from './components/ModuleProgressCard';
import UserRegisterModal from './components/UserRegisterModal';
import TeamPermissions from './components/TeamPermissions';
import UpgradeScreen from './components/UpgradeScreen';
import ProfileModal from './components/ProfileModal';
import OnboardingSpotlight from './components/OnboardingSpotlight';
import AlertsBar from './components/AlertsBar';
import { Alert, Farm, WebUserCreatePayload } from './types';
import { createWebUser } from './adapters/usersApi';

const HerdModule = React.lazy(() => import('./components/HerdModule'));
const FinanceModule = React.lazy(() => import('./components/FinanceModule'));
const FarmMap = React.lazy(() => import('./components/FarmMap'));
const GeneticsReproducao = React.lazy(() => import('./components/GeneticsReproducao'));
const EixoAcasalamento = React.lazy(() => import('./components/EixoAcasalamento'));
const NutritionModule = React.lazy(() => import('./components/NutritionModule'));
const HQPage = React.lazy(() => import('./components/HQPage'));

const WEB_DEVICE_KEY_STORAGE = 'eixo:web:device-key';
const getWebDeviceKey = () => {
    try {
        const existing = window.localStorage.getItem(WEB_DEVICE_KEY_STORAGE);
        if (existing && existing.trim()) {
            return existing.trim();
        }
        const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(WEB_DEVICE_KEY_STORAGE, generated);
        return generated;
    } catch {
        return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
};

interface User {
    id: string;
    name: string;
    email: string;
    modules: string[];
    accessType?: 'WEB' | 'APP_MANEJO' | 'WEB_APP';
    fieldProfile?: 'VAQUEIRO' | 'ADMIN_CAMPO' | null;
    appActivationStatus?: 'PENDENTE_ATIVACAO' | 'ATIVO' | 'CODIGO_EXPIRADO' | 'BLOQUEADO' | 'APARELHO_REVOGADO' | null;
    allowedModules?: string[];
    roles?: string[];
    membershipRole?: string | null;
    lastFarmId?: string | null;
    allowedFarmIds?: string[];
    defaultFarmId?: string | null;
    appContext?: {
        profile: string;
        mode: string;
    };
    entitlements?: string[];
    onboardingCompletedAt?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
}

const MODULE_CATEGORIES = [
    {
        title: 'Principal',
        modules: ['Mapa do Sistema', 'Visão Geral', 'Fazendas', 'Mapa da Fazenda', 'Rebanho Comercial', 'Eixo Genetics'],
    },
    {
        title: 'Cadastros',
        modules: ['Fornecedores', 'Remédios', 'Rações', 'Suplementos'],
    },
    {
        title: 'Nutrição',
        modules: ['Nutrição'],
    },
    {
        title: 'Financeiro',
        modules: ['Financeiro'],
    },
    {
        title: 'Operação',
        modules: ['Operações', 'Configurações', 'Registro de Atividades'],
    },
];

const ALL_MODULES = MODULE_CATEGORIES.flatMap((category) => category.modules);
type HerdNavigationTab = 'overview' | 'lots' | 'animals' | 'weighings' | 'settings';

const SUB_VIEW_PARENT: Record<string, string> = {
    'Mapa da Fazenda': 'Fazendas',
    'Usuários e Permissões': 'Fazendas',
    'Ocorrências do EIXO Campo': 'Operações',
};

const UpgradeHomeIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />
    </svg>
);

const UpgradeNutritionIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 4h8M9 4v6a3 3 0 003 3 3 3 0 003-3V4M6 20h12M8 14h8" />
    </svg>
);

const UpgradeOperationsIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
);

const UpgradeGeneticsIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 3h6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10 3v4.5l-3.5 9A3.5 3.5 0 009.8 21h4.4a3.5 3.5 0 003.3-4.5l-3.5-9V3" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8.5 14h7" />
    </svg>
);

const UpgradeSuppliersIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 7h11v8H3V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M14 10h4.5l2.5 3v2H14v-5z" />
        <circle cx="6" cy="19" r="1.6" />
        <circle cx="18" cy="19" r="1.6" />
    </svg>
);

const UpgradeFinanceIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 7v8M8.5 11.5l3.5 3.5 3.5-3.5" />
    </svg>
);

const UpgradeChartIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 7h10M13 3l4 4-4 4M17 17H7M11 21l-4-4 4-4" />
    </svg>
);

const UpgradeReportIcon: React.FC = () => (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 4h7l4 4v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M14 4v4h4M9 9h2M9 13h6M9 17h6" />
    </svg>
);

const UPGRADE_CONTENT: Record<string, {
    accessLabels?: string[];
    requiredPlan: 'PRO' | 'PLUS';
    moduleName: string;
    tagline: string;
    benefits: string[];
    previewItems: string[];
    icon: React.ReactNode;
}> = {
    'Nutrição': {
        accessLabels: ['Nutrição'],
        requiredPlan: 'PRO',
        moduleName: 'Nutrição',
        tagline: 'Controle o custo do cocho e o ganho de peso do lote',
        benefits: [
            'Monitore dietas, custo por lote e consumo planejado.',
            'Cruze estratégia nutricional com desempenho do rebanho.',
            'Tenha histórico para comparar safra, lote e fornecedor.',
        ],
        previewItems: ['Planos nutricionais por fase', 'Custos e consumo por lote', 'Comparativo de desempenho e meta'],
        icon: <UpgradeNutritionIcon />,
    },
    'Reprodução': {
        accessLabels: ['Eixo Genetics'],
        requiredPlan: 'PLUS',
        moduleName: 'Reprodução',
        tagline: 'Acompanhe a reprodução com mais controle e menos papel solto',
        benefits: [
            'Registre coberturas, ciclos e decisões reprodutivas no mesmo sistema.',
            'Ganhe histórico por matriz e mais segurança na tomada de decisão.',
            'Diminua retrabalho entre curral, escritório e genética.',
        ],
        previewItems: ['Agenda reprodutiva por matriz', 'Histórico de eventos e confirmações', 'Acompanhamento de resultados por estação'],
        icon: <UpgradeGeneticsIcon />,
    },
    'Eixo Acasalamento': {
        accessLabels: ['Eixo Genetics'],
        requiredPlan: 'PLUS',
        moduleName: 'Eixo Acasalamento',
        tagline: 'Planeje acasalamentos com critério e histórico técnico na mesma tela',
        benefits: [
            'Compare opções de acasalamento com mais rapidez.',
            'Apoie a decisão com histórico do plantel e metas genéticas.',
            'Padronize o processo para não depender só de memória ou planilha paralela.',
        ],
        previewItems: ['Sugestões por matriz e objetivo', 'Indicadores genéticos e restrições', 'Histórico consolidado do plantel'],
        icon: <UpgradeGeneticsIcon />,
    },
    'Registro de Atividades': {
        accessLabels: ['Registro de Atividades'],
        requiredPlan: 'PRO',
        moduleName: 'Registro de Atividades',
        tagline: 'Padronize o trabalho diário e saiba o que foi feito, por quem e quando',
        benefits: [
            'Registre rotinas, tarefas e eventos operacionais com histórico claro.',
            'Acompanhe execução da equipe sem depender de recado verbal.',
            'Crie disciplina operacional e rastreabilidade no dia a dia.',
        ],
        previewItems: ['Atividades por data e responsável', 'Pendências e execução da equipe', 'Histórico operacional consultável'],
        icon: <UpgradeReportIcon />,
    },
    'Gestão Comercial': {
        requiredPlan: 'PLUS',
        moduleName: 'Gestão Comercial',
        tagline: 'Transforme negociação em decisão com margem, histórico e timing',
        benefits: [
            'Acompanhe oportunidades, preços e decisões de venda em contexto.',
            'Conecte comercial com estoque, operação e estratégia da fazenda.',
            'Evite vender no escuro ou perder histórico de negociação.',
        ],
        previewItems: ['Pipeline de negociações e compradores', 'Margem por lote e cenário de venda', 'Histórico comercial consolidado'],
        icon: <UpgradeChartIcon />,
    },
};

const AppContent: React.FC = () => {
    const location = useLocation();
    const isGeneticsRoute = location.pathname.startsWith('/genetics');
    const isPlansRoute = location.pathname === '/planos';
    const [activeView, setActiveView] = useState('Visão Geral');
    const [herdTabRequest, setHerdTabRequest] = useState<{ tab: HerdNavigationTab; nonce: number } | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // Mantém viewport responsivo para evitar quebra visual em telas desktop amplas.
    useEffect(() => {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) return;
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    }, [isAuthenticated]);
    const [authScreen, setAuthScreen] = useState<'landing' | 'login' | 'register' | 'forgot-password' | 'reset-password' | 'accept-invite' | 'recover-email'>('landing');
    const [resetToken, setResetToken] = useState<string | null>(null);
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const [registerMessage, setRegisterMessage] = useState<string | null>(null);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [usersRefreshKey, setUsersRefreshKey] = useState(0);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [farms, setFarms] = useState<Farm[]>([]);
    const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
    const [paddocksRefreshNonce, setPaddocksRefreshNonce] = useState(0);
    const isSuperAdmin = React.useMemo(() => currentUser?.roles?.includes('SUPER_ADMIN') ?? false, [currentUser]);
    const canManageUsers = React.useMemo(() => {
        const normalizedRoles = (currentUser?.roles || []).map((role) => String(role || '').trim().toLowerCase());
        const membershipRole = String(currentUser?.membershipRole || '').trim().toUpperCase();
        return normalizedRoles.includes('admin') || ['OWNER', 'ADMIN'].includes(membershipRole);
    }, [currentUser]);
    const PAID_ENTITLEMENTS = ['GENETICS', 'PO', 'NUTRITION', 'EIXO_GESTAO', 'EIXO_DECISAO'];
    const isFreePlan = !(currentUser?.entitlements?.some(e => PAID_ENTITLEMENTS.includes(e)));
    // Módulos exclusivos de planos pagos — bloqueados mesmo que estejam no banco do usuário
    const PAID_ONLY_MODULES: string[] = [];
    const currentAllowedModules = React.useMemo(() => {
        const hasNutritionEntitlement = (currentUser?.entitlements || []).some((code) =>
            ['NUTRITION', 'EIXO_NUTRITION'].includes(code),
        );
        const sourceModules = currentUser?.allowedModules?.length
            ? currentUser.allowedModules
            : currentUser?.modules || [];
        if (!sourceModules.length) {
            return ['Fazendas'];
        }
        const LEGACY_MODULE_MAP: Record<string, string> = {
            'Rebanho Genética': 'Eixo Genetics',
            'Rebanho P.O.': 'Rebanho Comercial',
            'Plantel P.O.': 'Rebanho Comercial',
            'Contas a Pagar': 'Financeiro',
            'Contas a Receber': 'Financeiro',
            'Fluxo de Caixa': 'Financeiro',
            'DRE': 'Financeiro',
        };
        const membershipRole = String(currentUser?.membershipRole || '').trim().toUpperCase();
        const filtered = Array.from(new Set(
            sourceModules
                .map((module) => LEGACY_MODULE_MAP[module] ?? module)
                .filter((module) => ALL_MODULES.includes(module))
                // Bloqueia módulos pagos para usuários do plano grátis
                .filter((module) => isFreePlan ? !PAID_ONLY_MODULES.includes(module) : true)
                // Operador (MEMBER) não acessa Financeiro
                .filter((module) => membershipRole === 'MEMBER' ? module !== 'Financeiro' : true)
        ));
        const withNutrition = hasNutritionEntitlement && !filtered.includes('Nutrição')
            ? [...filtered, 'Nutrição']
            : filtered;
        const fallbackModules = ['Fazendas'];
        return withNutrition.length ? withNutrition : fallbackModules;
    }, [currentUser, isFreePlan]);
    const registerModuleCategories = React.useMemo(
        () =>
            MODULE_CATEGORIES.map((category) => ({
                ...category,
                modules: category.modules.filter((module) => currentAllowedModules.includes(module)),
            })).filter((category) => category.modules.length > 0),
        [currentAllowedModules],
    );
    const blockedPlanLabels = React.useMemo(() => {
        const labels = new Set<string>();
        Object.values(UPGRADE_CONTENT).forEach((moduleConfig) => {
            if (!moduleConfig.accessLabels?.length) {
                return;
            }
            const isUnlocked = moduleConfig.accessLabels.some((label) => currentAllowedModules.includes(label));
            if (!isUnlocked) {
                moduleConfig.accessLabels.forEach((label) => labels.add(label));
            }
        });
        if (!currentAllowedModules.includes('Gestão Comercial')) {
            labels.add('Gestão Comercial');
        }
        return Array.from(labels);
    }, [currentAllowedModules]);
    const [openFarmForm, setOpenFarmForm] = useState(false);
    const [upgradeModal, setUpgradeModal] = useState<string | null>(null); // nome do módulo bloqueado
    const [isSupportOpen, setIsSupportOpen] = useState(false);
    const supportRef = useRef<HTMLDivElement>(null);
    const isHandlingSessionRevokedRef = useRef(false);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (supportRef.current && !supportRef.current.contains(e.target as Node)) {
                setIsSupportOpen(false);
            }
        };
        if (isSupportOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isSupportOpen]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const shouldOpenRegister = params.get('register') === '1';
        if (shouldOpenRegister && !isAuthenticated) {
            setAuthScreen('register');
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }
        const token = params.get('reset');
        if (token && !isAuthenticated) {
            setResetToken(token);
            setAuthScreen('reset-password');
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }
        const invite = params.get('invite');
        if (invite && !isAuthenticated) {
            setInviteToken(invite);
            setAuthScreen('accept-invite');
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [isAuthenticated]);
    const updateFarmFormQuery = React.useCallback((shouldOpen: boolean) => {
        const url = new URL(window.location.href);
        if (shouldOpen) {
            url.searchParams.set('new', '1');
        } else {
            url.searchParams.delete('new');
        }
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', nextUrl);
    }, []);
    const hasFarmFormQuery = React.useCallback(() => {
        return new URLSearchParams(window.location.search).get('new') === '1';
    }, []);
    const handleRegisterFarmView = React.useCallback(() => {
        // Plano grátis com fazenda já cadastrada — bloquear
        if (isFreePlan && farms.length >= 1) {
            window.location.href = '/planos';
            return;
        }
        updateFarmFormQuery(true);
        setActiveView('Fazendas');
        setOpenFarmForm(true);
    }, [updateFarmFormQuery, isFreePlan, farms.length]);
    const selectedFarm = React.useMemo(
        () => farms.find((farm) => farm.id === selectedFarmId) || null,
        [farms, selectedFarmId],
    );
    const hasSelectedFarm = Boolean(selectedFarmId);
    const hasNoFarms = isAuthenticated && !isAuthLoading && farms.length === 0;
    const FarmRequiredPanel: React.FC<{
        title: string;
        actionLabel?: string;
        onAction?: () => void;
    }> = ({ title, actionLabel, onAction }) => (
        <div className="rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-6 py-10 text-center">
            <h2 className="text-[20px] font-bold leading-[24px] text-[var(--eixo-text)]">{title}</h2>
            {actionLabel && onAction && (
                <button
                    className="mt-6 inline-flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-bold text-[#1a1a1a] shadow-md transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                    type="button"
                    onClick={onAction}
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );

    const FirstFarmOnboarding: React.FC = () => (
        <OnboardingSpotlight
            step={1}
            totalSteps={3}
            title="Cadastre sua primeira fazenda"
            description="Esse é o primeiro passo para usar o sistema com rebanho, financeiro e operação."
            actionLabel="Cadastrar fazenda"
            onAction={handleRegisterFarmView}
            hint="Leva menos de 1 minuto"
            iconPath="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
    );

    const AppOnlyAccessPanel: React.FC = () => (
        <div className="flex min-h-screen items-center justify-center bg-[var(--eixo-surface-soft)] px-6 py-10">
            <div className="w-full max-w-xl rounded-[28px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-8 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--eixo-green-soft)] text-[var(--eixo-green)]">
                    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 8h4M9 17h6M11 20h2" />
                    </svg>
                </div>
                <h1 className="mt-6 text-2xl font-bold text-[var(--eixo-text)]">Acesso exclusivo do App do Manejo</h1>
                <p className="mt-3 text-sm leading-6 text-[var(--eixo-text-muted)]">
                    Este usuário foi criado para operação de campo e não possui acesso ao sistema desktop.
                </p>
                <div className="mt-6 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-4 text-sm text-[var(--eixo-text-muted)]">
                    Use este acesso apenas no App do Manejo, no celular do colaborador vinculado.
                </div>
                <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-[var(--eixo-green)] px-6 font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                >
                    Sair
                </button>
            </div>
        </div>
    );

    React.useEffect(() => {
        if (hasFarmFormQuery()) {
            if (isFreePlan && farms.length >= 1) {
                // Limpar query sem abrir o form
                updateFarmFormQuery(false);
                return;
            }
            setActiveView('Fazendas');
            setOpenFarmForm(true);
        }
    }, [hasFarmFormQuery]);

    const loadFarms = React.useCallback(async (preferredFarmId?: string | null) => {
        try {
            const response = await fetch(buildApiUrl('/farms'), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                console.error(payload?.message || 'Erro ao listar fazendas.');
                setFarms([]);
                setSelectedFarmId(null);
                return;
            }
            const nextFarms: Farm[] = payload.farms || [];
            setFarms(nextFarms);
            setSelectedFarmId((current) => {
                if (!nextFarms.length) {
                    return null;
                }
                const preferredId = preferredFarmId || currentUser?.defaultFarmId || null;
                if (preferredId && nextFarms.some((farm) => farm.id === preferredId)) {
                    return preferredId;
                }
                if (current && nextFarms.some((farm) => farm.id === current)) {
                    return current;
                }
                return nextFarms[0].id;
            });
        } catch (error) {
            console.error(error);
            setFarms([]);
            setSelectedFarmId(null);
        }
    }, [currentUser?.defaultFarmId]);

    const handleFarmCreated = React.useCallback(
        (farm: Farm) => {
            setFarms((current) => {
                const exists = current.some((item) => item.id === farm.id);
                if (exists) {
                    return current.map((item) => (item.id === farm.id ? farm : item));
                }
                return [...current, farm];
            });
            setSelectedFarmId(farm.id);
            setPaddocksRefreshNonce((current) => current + 1);
            setActiveView('Visão Geral');
        },
        [],
    );

    const handleFarmUpdated = React.useCallback((farm: Farm) => {
        setFarms((current) => current.map((item) => (item.id === farm.id ? farm : item)));
        setPaddocksRefreshNonce((current) => current + 1);
        if (selectedFarmId === farm.id) {
            setSelectedFarmId(farm.id);
        }
    }, [selectedFarmId]);

    const handleFarmDeleted = React.useCallback((farmId: string) => {
        setFarms((current) => {
            const next = current.filter((item) => item.id !== farmId);
            if (selectedFarmId === farmId) {
                setSelectedFarmId(next[0]?.id || null);
            }
            return next;
        });
    }, [selectedFarmId]);

    React.useEffect(() => {
        setIsAuthLoading(false);
    }, []);

    React.useEffect(() => {
        const parentView = SUB_VIEW_PARENT[activeView] ?? activeView;
        const canAccessHq = parentView === 'EIXO HQ' && isSuperAdmin;
        if (
            isAuthenticated &&
            currentAllowedModules.length &&
            !currentAllowedModules.includes(parentView) &&
            !canAccessHq
        ) {
            const fallbackView = currentAllowedModules[0] || 'Fazendas';
            setActiveView(fallbackView);
        }
    }, [isAuthenticated, currentAllowedModules, activeView, isSuperAdmin]);

    const handleLogin = async (email: string, password: string, rememberMe: boolean) => {
        setAuthError(null);
        try {
            const webDeviceKey = getWebDeviceKey();
            const response = await fetch(buildApiUrl('/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password, rememberMe, webDeviceKey }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setAuthError(payload?.message || 'Não foi possível autenticar.');
                return;
            }
            const foundUser: User = payload.user;
            setIsAuthenticated(true);
            setAuthScreen('login');
            setCurrentUser(foundUser);
            setAuthError(null);
            setRegisterMessage(null);
            setRegisterError(null);
            await loadFarms(foundUser.defaultFarmId || foundUser.lastFarmId || null);

            const allowedModules = foundUser.allowedModules?.length
                ? foundUser.allowedModules
                : (foundUser.modules.length ? foundUser.modules : ALL_MODULES);
            const userIsFreePlan = !(foundUser.entitlements?.length);
            const currentFarmCount = farms.length;
            if (hasFarmFormQuery() && !(userIsFreePlan && currentFarmCount >= 1)) {
                setActiveView('Fazendas');
                setOpenFarmForm(true);
            } else {
                const defaultView = allowedModules.includes(activeView)
                    ? activeView
                    : allowedModules[0] || 'Fazendas';
                setActiveView(defaultView);
            }
        } catch (error) {
            console.error(error);
            setAuthError('Não foi possível conectar ao servidor.');
        }
    };

    const handlePublicRegisterSuccess = React.useCallback(() => {
        setAuthScreen('login');
        setAuthError(null);
        setRegisterError(null);
        setRegisterMessage('Conta criada com sucesso! Faça login para continuar.');
    }, []);

    const handleRegister = async (payload: WebUserCreatePayload) => {
        if (!canManageUsers) {
            setRegisterMessage(null);
            setRegisterError('Apenas administradores podem cadastrar usuários.');
            return;
        }
        if (!payload.modules.length) {
            setRegisterMessage(null);
            setRegisterError('Selecione pelo menos um módulo para liberar o acesso.');
            return;
        }
        setRegisterMessage(null);
        setRegisterError(null);
        try {
            await createWebUser(payload);
            setRegisterMessage('Usuário cadastrado com sucesso!');
            setUsersRefreshKey((current) => current + 1);
        } catch (error) {
            console.error(error);
            const errorWithCode = error as Error & { code?: string };
            if (errorWithCode?.code === 'user_limit_reached') {
                setIsRegisterModalOpen(false);
                setUpgradeModal('Múltiplos usuários');
                return;
            }
            setRegisterError(error instanceof Error ? error.message : 'Não foi possível salvar o usuário.');
        }
    };

    const handleLogout = async () => {
        try {
            await fetch(buildApiUrl('/auth/logout'), {
                method: 'POST',
                credentials: 'include',
            });
        } catch (error) {
            console.error(error);
        }
        setIsAuthenticated(false);
        setCurrentUser(null);
        setAuthScreen('landing');
        setFarms([]);
        setSelectedFarmId(null);
        setOpenFarmForm(false);
        updateFarmFormQuery(false);
        setActiveView('Visão Geral');
        setHerdTabRequest(null);
        setAuthError(null);
        setRegisterMessage(null);
        setRegisterError(null);
        setIsRegisterModalOpen(false);
    };

    React.useEffect(() => {
        const handleSessionRevoked = () => {
            if (isHandlingSessionRevokedRef.current) {
                return;
            }
            isHandlingSessionRevokedRef.current = true;

            setIsAuthenticated(false);
            setCurrentUser(null);
            setAuthScreen('login');
            setFarms([]);
            setSelectedFarmId(null);
            setOpenFarmForm(false);
            updateFarmFormQuery(false);
            setActiveView('Visão Geral');
            setHerdTabRequest(null);
            setAuthError('Sua sessão foi encerrada porque houve login em outro dispositivo.');
            setRegisterMessage(null);
            setRegisterError(null);
            setIsRegisterModalOpen(false);

            window.setTimeout(() => {
                isHandlingSessionRevokedRef.current = false;
            }, 500);
        };

        window.addEventListener('eixo:session-revoked', handleSessionRevoked);
        return () => {
            window.removeEventListener('eixo:session-revoked', handleSessionRevoked);
        };
    }, [updateFarmFormQuery]);

    const getUpgradeModuleForView = React.useCallback((view: string) => {
        const moduleConfig = UPGRADE_CONTENT[view];
        if (!moduleConfig) {
            return null;
        }
        if (!moduleConfig.accessLabels?.length) {
            return moduleConfig;
        }
        const isUnlocked = moduleConfig.accessLabels.some((label) => currentAllowedModules.includes(label));
        return isUnlocked ? null : moduleConfig;
    }, [currentAllowedModules]);

    const handleHeaderAlertAction = React.useCallback((alert: Alert) => {
        if (alert.farmId) {
            setSelectedFarmId(alert.farmId);
        }

        if (alert.sourceType === 'WEIGHING' || alert.sourceType === 'GMD') {
            setHerdTabRequest({ tab: 'weighings', nonce: Date.now() });
            setActiveView('Rebanho Comercial');
            return true;
        }

        if (alert.sourceType === 'FINANCEIRO') {
            setActiveView('Financeiro');
            return true;
        }

        return false;
    }, []);

    const handleOnboardingNavigate = React.useCallback((view: string, options?: { herdTab?: HerdNavigationTab }) => {
        if (options?.herdTab) {
            setHerdTabRequest({ tab: options.herdTab, nonce: Date.now() });
        }
        setActiveView(view);
    }, []);

    if (isPlansRoute) {
        return (
            <PlansPage
                isAuthenticated={isAuthenticated}
                onBack={isAuthenticated ? () => window.history.back() : undefined}
            />
        );
    }

    if (isAuthLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]">
                Carregando...
            </div>
        );
    }

    if (!isAuthenticated) {
        if (authScreen === 'forgot-password') {
            return <ForgotPassword onBack={() => setAuthScreen('login')} />;
        }

        if (authScreen === 'recover-email') {
            return <RecoverEmail onBack={() => setAuthScreen('login')} />;
        }

        if (authScreen === 'accept-invite' && inviteToken) {
            return (
                <AcceptInvite
                    token={inviteToken}
                    onSuccess={() => {
                        setInviteToken(null);
                        setAuthScreen('login');
                        setRegisterMessage('Conta criada! Faça login com o e-mail e a senha que você definiu.');
                    }}
                />
            );
        }

        if (authScreen === 'reset-password' && resetToken) {
            return (
                <ResetPassword
                    token={resetToken}
                    onSuccess={() => {
                        setResetToken(null);
                        setAuthScreen('login');
                        setRegisterMessage('Senha atualizada. Faça login com a nova senha.');
                    }}
                    onBack={() => {
                        setResetToken(null);
                        setAuthScreen('login');
                    }}
                />
            );
        }

        if (authScreen === 'landing') {
            return (
                <PublicLanding
                    onEnter={() => setAuthScreen('login')}
                    onRegister={() => setAuthScreen('register')}
                />
            );
        }

        if (authScreen === 'register') {
            return (
                <Register
                    onSuccess={handlePublicRegisterSuccess}
                    onBack={() => {
                        setAuthError(null);
                        setRegisterError(null);
                        setRegisterMessage(null);
                        setAuthScreen('login');
                    }}
                />
            );
        }

        return (
            <Login
                onLogin={handleLogin}
                error={authError}
                success={registerMessage}
                onBack={() => setAuthScreen('landing')}
                onRegister={() => {
                    setAuthError(null);
                    setRegisterError(null);
                    setRegisterMessage(null);
                    setAuthScreen('register');
                }}
                onForgotPassword={() => {
                    setAuthError(null);
                    setRegisterError(null);
                    setRegisterMessage(null);
                    setAuthScreen('forgot-password');
                }}
                onRecoverEmail={() => {
                    setAuthError(null);
                    setRegisterError(null);
                    setRegisterMessage(null);
                    setAuthScreen('recover-email');
                }}
            />
        );
    }

    const renderContent = () => {
        // The selectedFarm state can be passed down to children components to filter data
        console.log(`Rendering view "${activeView}" for farm: "${selectedFarm?.name ?? 'Nenhuma'}"`);

        const upgradeModule = getUpgradeModuleForView(activeView);
        if (upgradeModule) {
            return (
                <UpgradeScreen
                    moduleName={upgradeModule.moduleName}
                    icon={upgradeModule.icon}
                    tagline={upgradeModule.tagline}
                    benefits={upgradeModule.benefits}
                    requiredPlan={upgradeModule.requiredPlan}
                    previewItems={upgradeModule.previewItems}
                    onUpgrade={() => setUpgradeModal(upgradeModule.moduleName)}
                />
            );
        }

        if (isGeneticsRoute) {
            if (location.pathname.startsWith('/genetics/acasalamento') && isFreePlan) {
                const acasalamentoUpgrade = UPGRADE_CONTENT['Eixo Acasalamento'];
                return (
                    <UpgradeScreen
                        moduleName={acasalamentoUpgrade.moduleName}
                        icon={acasalamentoUpgrade.icon}
                        tagline={acasalamentoUpgrade.tagline}
                        benefits={acasalamentoUpgrade.benefits}
                        requiredPlan={acasalamentoUpgrade.requiredPlan}
                        previewItems={acasalamentoUpgrade.previewItems}
                        onUpgrade={() => setUpgradeModal(acasalamentoUpgrade.moduleName)}
                    />
                );
            }

            const withFarmGuard = (content: React.ReactNode) =>
                hasSelectedFarm ? content : (
                    <FarmRequiredPanel title="Selecione uma fazenda para continuar" />
                );

            return (
                <Routes>
                    <Route path="/genetics" element={<Navigate to="/genetics/acasalamento" replace />} />
                    <Route path="/genetics/plantel" element={<Navigate to="/genetics/acasalamento" replace />} />
                    <Route
                        path="/genetics/reproducao"
                        element={withFarmGuard(<GeneticsReproducao farmId={selectedFarmId} />)}
                    />
                    <Route path="/genetics/selecao" element={<Navigate to="/genetics/acasalamento" replace />} />
                    <Route path="/genetics/relatorios" element={<Navigate to="/genetics/acasalamento" replace />} />
                    <Route
                        path="/genetics/acasalamento"
                        element={withFarmGuard(<EixoAcasalamento farmId={selectedFarmId} />)}
                    />
                </Routes>
            );
        }

        switch (activeView) {
            case 'Fornecedores':
                return <Suppliers />;
            case 'Remédios':
                return <Medicines />;
            case 'Rações':
                return <Feeds />;
            case 'Suplementos':
                return <Supplements />;
            case 'Nutrição':
                if (!hasSelectedFarm) {
                    return (
                        <FarmRequiredPanel
                            title="Selecione uma fazenda para acessar a nutrição"
                            actionLabel="Selecionar fazenda"
                            onAction={() => setActiveView('Fazendas')}
                        />
                    );
                }
                return <NutritionModule farmId={selectedFarmId} farmName={selectedFarm?.name} currentUser={currentUser} />;
            case 'Mapa da Fazenda':
                if (!hasSelectedFarm || !selectedFarm) {
                    return (
                        <FarmRequiredPanel
                            title="Selecione uma fazenda para ver o mapa"
                            actionLabel="Selecionar fazenda"
                            onAction={() => setActiveView('Fazendas')}
                        />
                    );
                }
                return (
                    <FarmMap
                        farm={selectedFarm}
                        asPage
                        onGeometrySaved={handleFarmUpdated}
                    />
                );
            case 'Fazendas':
                return (
                    <Farms
                        farms={farms}
                        onFarmCreated={handleFarmCreated}
                        onFarmUpdated={handleFarmUpdated}
                        onFarmDeleted={handleFarmDeleted}
                        openForm={openFarmForm}
                        isFreePlan={isFreePlan}
                        onFormOpened={() => {
                            setOpenFarmForm(false);
                            updateFarmFormQuery(true);
                        }}
                        onFormClosed={() => updateFarmFormQuery(false)}
                    />
                );
            case 'Rebanho Comercial':
                if (!hasSelectedFarm) {
                    return (
                        <FarmRequiredPanel
                            title="Cadastre uma fazenda para começar"
                            actionLabel="Cadastrar fazenda"
                            onAction={handleRegisterFarmView}
                        />
                    );
                }
                return (
                    <HerdModule
                        farmId={selectedFarmId}
                        farmName={selectedFarm?.name}
                        herdType="COMMERCIAL"
                        paddocksRefreshNonce={paddocksRefreshNonce}
                        isFreePlan={isFreePlan}
                        initialTabRequest={herdTabRequest}
                        onUpgradeRequest={() => setUpgradeModal('Plano pago')}
                    />
                );
            case 'Plantel P.O.':
                if (!hasSelectedFarm) {
                    return (
                        <FarmRequiredPanel
                            title="Cadastre uma fazenda para começar"
                            actionLabel="Cadastrar fazenda"
                            onAction={handleRegisterFarmView}
                        />
                    );
                }
                return (
                    <HerdModule
                        farmId={selectedFarmId}
                        farmName={selectedFarm?.name}
                        herdType="PO"
                        paddocksRefreshNonce={paddocksRefreshNonce}
                        isFreePlan={isFreePlan}
                        initialTabRequest={herdTabRequest}
                        onUpgradeRequest={() => setUpgradeModal('Plano pago')}
                    />
                );
            case 'Eixo Genetics':
                return <Navigate to="/genetics/acasalamento" replace />;
            case 'Financeiro':
                return <FinanceModule farmId={selectedFarmId} farmName={selectedFarm?.name} isFreePlan={isFreePlan} onUpgradeRequest={() => setUpgradeModal('Financeiro completo')} />;
            case 'Registro de Atividades':
                return <ActivityModule farmId={selectedFarmId} farmName={selectedFarm?.name} />;
            case 'Ocorrências do EIXO Campo':
                return <FieldOccurrences farmId={selectedFarmId} />;
            case 'Operações':
                return <Operations />;
            case 'Confinamento e Contratos':
                return <ConfinementContracts />;
            case 'Estoque e Equipamentos':
                if (!hasSelectedFarm) {
                    return (
                        <FarmRequiredPanel
                            title="Cadastre uma fazenda para controlar o botijão"
                            actionLabel="Cadastrar fazenda"
                            onAction={handleRegisterFarmView}
                        />
                    );
                }
                return <SemenTankModule farmId={selectedFarmId} farmName={selectedFarm?.name} />;
            case 'Configurações':
                return <Settings />;
            case 'Usuários e Permissões':
                return (
                    <TeamPermissions
                        farms={farms}
                        canManageUsers={canManageUsers}
                        currentUserId={currentUser?.id || null}
                        isFreePlan={isFreePlan}
                        moduleCategories={registerModuleCategories}
                        onOpenUserRegister={() => {
                            if (isFreePlan) {
                                setUpgradeModal('Múltiplos usuários');
                                return;
                            }
                            setIsRegisterModalOpen(true);
                        }}
                        refreshKey={usersRefreshKey}
                    />
                );
            case 'EIXO HQ':
                return <HQPage />;
            case 'Visão Geral':
            default:
                return <Dashboard
                    farmId={selectedFarmId}
                    farmSize={selectedFarm?.size ?? null}
                    farmCity={selectedFarm?.city ?? null}
                    farmLat={selectedFarm?.lat ?? null}
                    farmLng={selectedFarm?.lng ?? null}
                    onNavigateToFarms={() => setActiveView('Fazendas')}
                />;
        }
    };

    return (
        <>
            <div className="relative min-h-screen overflow-hidden bg-[var(--eixo-surface-soft)] font-sans text-[var(--eixo-text)]">
                <div className="relative flex min-h-screen">
                    <Sidebar
                        activeItem={activeView}
                        setActiveItem={setActiveView}
                        allowedModules={currentAllowedModules}
                        lockedModules={blockedPlanLabels}
                    />
                    <main className="flex min-h-screen flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 lg:px-0 lg:pb-6 lg:pt-6">
                        <Header
                            farms={farms}
                            selectedFarmId={selectedFarmId}
                            onSelectFarm={setSelectedFarmId}
                            currentUser={currentUser}
                            onLogout={handleLogout}
                            canRegisterUsers={canManageUsers}
                            farmCity={selectedFarm?.city ?? null}
                            farmLat={selectedFarm?.lat ?? null}
                            farmLng={selectedFarm?.lng ?? null}
                            onOpenUserRegister={() => {
                                if (isFreePlan) {
                                    setUpgradeModal('Múltiplos usuários');
                                    return;
                                }
                                setIsRegisterModalOpen(true);
                            }}
                            onOpenProfile={() => setIsProfileModalOpen(true)}
                        />
                        <AlertsBar
                            selectedFarmId={selectedFarmId}
                            onAlertAction={handleHeaderAlertAction}
                        />
                        <div className="mt-[10px] flex-1 overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                            <div className={activeView === 'Mapa da Fazenda' ? 'h-full' : 'h-full overflow-x-hidden overflow-y-auto p-4 lg:p-6'}>
                                {hasNoFarms && activeView !== 'Fazendas' && activeView !== 'EIXO HQ' ? <FirstFarmOnboarding /> : (
                                    <>
                                        {currentUser && activeView !== 'Mapa da Fazenda' && (
                                            <>
                                                {(activeView === 'Rebanho Comercial' || activeView === 'Fazendas') ? (
                                                    <OnboardingChecklist
                                                        userId={currentUser.id}
                                                        farmId={selectedFarmId}
                                                        farms={farms}
                                                        onNavigate={handleOnboardingNavigate}
                                                        contextView={activeView === 'Rebanho Comercial' ? 'Rebanho Comercial' : 'Fazendas'}
                                                        onboardingCompletedAt={currentUser.onboardingCompletedAt}
                                                    />
                                                ) : (
                                                    <ModuleProgressCard
                                                        activeView={activeView}
                                                        farmId={selectedFarmId}
                                                    />
                                                )}
                                            </>
                                        )}
                                        <Suspense
                                            fallback={
                                                <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-[var(--eixo-text-muted)]">
                                                    Carregando módulo...
                                                </div>
                                            }
                                        >
                                            {renderContent()}
                                        </Suspense>
                                    </>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
            {isSuperAdmin && (
                <button
                    type="button"
                    onClick={() => setActiveView('EIXO HQ')}
                    className="fixed bottom-6 left-6 z-50 rounded-xl bg-[#2F2F2F] px-3 py-2 text-xs font-bold text-[#B6E23A] shadow-lg hover:bg-[#1a1a1a]"
                    title="EIXO HQ — Painel do Fundador"
                >
                    HQ
                </button>
            )}
            <UserRegisterModal
                isOpen={isRegisterModalOpen}
                onClose={() => {
                    setIsRegisterModalOpen(false);
                    setRegisterMessage(null);
                    setRegisterError(null);
                }}
                onRegister={handleRegister}
                farms={farms}
                moduleCategories={registerModuleCategories}
                error={registerError}
                successMessage={registerMessage}
            />

            {/* Modal de Perfil */}
            {isProfileModalOpen && currentUser && (
                <ProfileModal
                    user={currentUser}
                    onClose={() => setIsProfileModalOpen(false)}
                    onUpdated={(updates) => setCurrentUser(prev => prev ? { ...prev, ...updates } : prev)}
                />
            )}

            {/* Modal de upgrade — módulo bloqueado */}
            {upgradeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => setUpgradeModal(null)}>
                    <div className="w-full max-w-sm rounded-2xl bg-[var(--eixo-surface)] shadow-2xl"
                        onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--eixo-surface-soft)]">
                                <svg className="h-6 w-6 text-[var(--eixo-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <h3 className="font-brand text-lg font-bold text-[var(--eixo-text)]">
                                {upgradeModal} — plano pago
                            </h3>
                            <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                                Este módulo está disponível nos planos pagos do EIXO. Faça upgrade para desbloquear{' '}
                                <span className="font-semibold text-[var(--eixo-text)]">{upgradeModal}</span> e muito mais.
                            </p>
                            <div className="mt-5 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4 text-sm text-[var(--eixo-text-muted)]">
                                <p className="mb-2 font-semibold text-[var(--eixo-text)]">Seu plano atual inclui:</p>
                                <ul className="space-y-1">
                                    <li className="flex items-center gap-2"><span className="text-[var(--eixo-success)]">✓</span> Animais ilimitados</li>
                                    <li className="flex items-center gap-2"><span className="text-[var(--eixo-success)]">✓</span> Manejo do Rebanho</li>
                                    <li className="flex items-center gap-2"><span className="text-[var(--eixo-success)]">✓</span> Financeiro básico</li>
                                    <li className="flex items-center gap-2"><span className="text-[var(--eixo-success)]">✓</span> Estrutura da Fazenda</li>
                                </ul>
                            </div>
                            <div className="mt-5 flex gap-3">
                                <button type="button" onClick={() => setUpgradeModal(null)}
                                    className="flex-1 rounded-xl border border-[var(--eixo-border)] py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                    Fechar
                                </button>
                                <button type="button"
                                    onClick={() => { setUpgradeModal(null); window.location.href = '/planos'; }}
                                    className="flex-1 rounded-xl bg-[var(--eixo-green)] py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]">
                                    Ver planos
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal de lock-in de exportação ── */}

            {/* ── Eixo Suporte — botão flutuante + painel ── */}
            {isAuthenticated && (
                <div ref={supportRef} className="fixed bottom-6 right-6 top-6 z-50 flex flex-col items-end justify-end gap-3">
                    {/* Painel de chat */}
                    {isSupportOpen && (
                        <div className="h-[560px] max-h-[calc(100dvh-140px)] w-[360px] max-w-[calc(100vw-32px)]">
                            <AssistantChat
                                onClose={() => setIsSupportOpen(false)}
                                farmId={selectedFarmId}
                            />
                        </div>
                    )}

                    {/* Botão FAB — balão de fala */}
                    <div className="relative">
                        {/* Corpo do balão */}
                        <button
                            type="button"
                            onClick={() => setIsSupportOpen(prev => !prev)}
                            className="relative flex flex-col items-center justify-center rounded-[16px] bg-[var(--eixo-text)] px-4 py-2.5 shadow-xl transition-all duration-200 hover:bg-[var(--eixo-graphite)] active:scale-95"
                            aria-label="Abrir Eixo Suporte"
                            style={{ minWidth: '88px' }}
                        >
                            {/* Logo eixo */}
                            <img src="/logo_eixo_negative.svg" alt="EIXO" className="h-4 w-auto" />
                            <span className="mt-1 border-t border-white/10 pt-1 text-[10px] font-bold uppercase leading-none tracking-[0.1em] text-[var(--eixo-green-soft)]">
                                suporte
                            </span>

                            {/* Ponto verde — ativo */}
                            <span className="absolute right-2 top-1.5 flex h-2.5 w-2.5 items-center justify-center">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--eixo-success)] opacity-50" />
                                <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--eixo-success)] ring-2 ring-[var(--eixo-graphite)]" />
                            </span>
                        </button>

                        {/* Perna longa do balão — inclinada para direita */}
                        <div
                            className="absolute right-[18px]"
                            style={{
                                bottom: '-18px',
                                width: 0,
                                height: 0,
                                borderLeft: '12px solid transparent',
                                borderRight: '3px solid transparent',
                                borderTop: '20px solid var(--eixo-graphite)',
                            }}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

const App: React.FC = () => (
    <BrowserRouter>
        <AppContent />
    </BrowserRouter>
);

export default App;
