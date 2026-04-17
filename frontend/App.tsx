import React, { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { buildApiUrl } from './api';
import Sidebar from './components/Sidebar';
import SystemCoverage from './components/SystemCoverage';
import Dashboard from './components/Dashboard';
import HerdModule from './components/HerdModule';
import Operations from './components/Operations';
import Settings from './components/Settings';
import AccountsPayable from './components/AccountsPayable';
import AccountsReceivable from './components/AccountsReceivable';
import CashFlow from './components/CashFlow';
import DRE from './components/DRE';
import Header from './components/Header';
import Farms from './components/Farms';
import FarmMap from './components/FarmMap';
import Suppliers from './components/Suppliers';
import Medicines from './components/Medicines';
import Feeds from './components/Feeds';
import Supplements from './components/Supplements';
import GeneticsReproducao from './components/GeneticsReproducao';
import GeneticsSelecao from './components/GeneticsSelecao';
import GeneticsRelatorios from './components/GeneticsRelatorios';
import GeneticsPlantelPO from './components/GeneticsPlantelPO';
import NutritionModule from './components/NutritionModule';
import Login from './components/Login';
import PublicLanding from './components/PublicLanding';
import UserRegisterModal from './components/UserRegisterModal';
import { Farm } from './types';

interface User {
    id: string;
    name: string;
    email: string;
    modules: string[];
    roles?: string[];
    lastFarmId?: string | null;
    entitlements?: string[];
}

const ADMIN_EMAIL = 'admin@eixo.com';

const MODULE_CATEGORIES = [
    {
        title: 'Principal',
        modules: ['Mapa do Sistema', 'Visão Geral', 'Fazendas', 'Mapa da Fazenda', 'Rebanho Comercial', 'Plantel P.O.', 'Eixo Genetics'],
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
        modules: ['Contas a Pagar', 'Contas a Receber', 'Fluxo de Caixa', 'DRE'],
    },
    {
        title: 'Operação',
        modules: ['Operações', 'Configurações'],
    },
];

const ALL_MODULES = MODULE_CATEGORIES.flatMap((category) => category.modules);

const SUB_VIEW_PARENT: Record<string, string> = {
    'Mapa da Fazenda': 'Fazendas',
};

const AppContent: React.FC = () => {
    const location = useLocation();
    const isGeneticsRoute = location.pathname.startsWith('/genetics');
    const [activeView, setActiveView] = useState('Visão Geral');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authScreen, setAuthScreen] = useState<'landing' | 'login'>('landing');
    const [authError, setAuthError] = useState<string | null>(null);
    const [registerMessage, setRegisterMessage] = useState<string | null>(null);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [farms, setFarms] = useState<Farm[]>([]);
    const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
    const currentAllowedModules = React.useMemo(() => {
        const hasNutritionEntitlement = (currentUser?.entitlements || []).some((code) =>
            ['NUTRITION', 'EIXO_NUTRITION'].includes(code),
        );
        if (!currentUser?.modules?.length) {
            return hasNutritionEntitlement ? ALL_MODULES : ALL_MODULES.filter((module) => module !== 'Nutrição');
        }
        const filtered = currentUser.modules.map((module) => module === 'Rebanho Genética' ? 'Eixo Genetics' : module === 'Rebanho P.O.' ? 'Plantel P.O.' : module).filter((module) => ALL_MODULES.includes(module));
        const withNutrition = hasNutritionEntitlement && !filtered.includes('Nutrição')
            ? [...filtered, 'Nutrição']
            : filtered;
        const fallbackModules = hasNutritionEntitlement
            ? ALL_MODULES
            : ALL_MODULES.filter((module) => module !== 'Nutrição');
        return withNutrition.length ? withNutrition : fallbackModules;
    }, [currentUser]);
    const [openFarmForm, setOpenFarmForm] = useState(false);
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
        updateFarmFormQuery(true);
        setActiveView('Fazendas');
        setOpenFarmForm(true);
    }, [updateFarmFormQuery]);
    const selectedFarm = React.useMemo(
        () => farms.find((farm) => farm.id === selectedFarmId) || null,
        [farms, selectedFarmId],
    );
    const hasSelectedFarm = Boolean(selectedFarmId);
    const FarmRequiredPanel: React.FC<{
        title: string;
        actionLabel?: string;
        onAction?: () => void;
    }> = ({ title, actionLabel, onAction }) => (
        <div className="rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-6 py-10 text-center">
            <h2 className="text-[20px] font-bold leading-[24px] text-gray-900 dark:text-white">{title}</h2>
            {actionLabel && onAction && (
                <button
                    className="mt-6 inline-flex h-10 items-center rounded-[10px] bg-primary px-[14px] font-bold text-white shadow-md transition-colors duration-200 hover:bg-primary-dark"
                    type="button"
                    onClick={onAction}
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );

    // Basic dark mode logic for demonstration
    React.useEffect(() => {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
        }
    }, []);

    React.useEffect(() => {
        if (hasFarmFormQuery()) {
            setActiveView('Fazendas');
            setOpenFarmForm(true);
        }
    }, [hasFarmFormQuery]);

    const loadFarms = React.useCallback(async () => {
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
    }, []);

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
            setActiveView('Fazendas');
        },
        [],
    );

    const handleFarmUpdated = React.useCallback((farm: Farm) => {
        setFarms((current) => current.map((item) => (item.id === farm.id ? farm : item)));
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
        const bootstrapAuth = async () => {
            try {
            const response = await fetch(buildApiUrl('/auth/me'), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (response.ok && payload.user) {
                    const foundUser: User = payload.user;
                    setIsAuthenticated(true);
                    setCurrentUser(foundUser);
                    await loadFarms();
                }
            } catch (error) {
                console.error(error);
            } finally {
                setIsAuthLoading(false);
            }
        };

        bootstrapAuth();
    }, [loadFarms]);

    React.useEffect(() => {
        const parentView = SUB_VIEW_PARENT[activeView] ?? activeView;
        if (
            isAuthenticated &&
            currentAllowedModules.length &&
            !currentAllowedModules.includes(parentView)
        ) {
            const fallbackView = currentAllowedModules[0] || 'Visão Geral';
            setActiveView(fallbackView);
        }
    }, [isAuthenticated, currentAllowedModules, activeView]);

    const handleLogin = async (email: string, password: string, rememberMe: boolean) => {
        setAuthError(null);
        try {
            const response = await fetch(buildApiUrl('/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password, rememberMe }),
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
            await loadFarms();

            const allowedModules = foundUser.modules.length ? foundUser.modules : ALL_MODULES;
            if (hasFarmFormQuery()) {
                setActiveView('Fazendas');
                setOpenFarmForm(true);
            } else {
                const defaultView = allowedModules.includes(activeView)
                    ? activeView
                    : allowedModules[0] || 'Visão Geral';
                setActiveView(defaultView);
            }
        } catch (error) {
            console.error(error);
            setAuthError('Não foi possível conectar ao servidor.');
        }
    };

    const handleRegister = async (name: string, email: string, password: string, modules: string[]) => {
        if (currentUser?.email !== ADMIN_EMAIL) {
            setRegisterMessage(null);
            setRegisterError('Apenas administradores podem cadastrar usuários.');
            return;
        }
        if (!modules.length) {
            setRegisterMessage(null);
            setRegisterError('Selecione pelo menos um módulo para liberar o acesso.');
            return;
        }
        setRegisterMessage(null);
        setRegisterError(null);
        try {
            const response = await fetch(buildApiUrl('/users'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, email, password, modules }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setRegisterError(payload?.message || 'Erro ao cadastrar usuário.');
                return;
            }
            setRegisterMessage('Usuário cadastrado com sucesso!');
        } catch (error) {
            console.error(error);
            setRegisterError('Não foi possível salvar o usuário.');
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
        setAuthError(null);
        setRegisterMessage(null);
        setRegisterError(null);
        setIsRegisterModalOpen(false);
    };

    if (isAuthLoading) {
        return (
            <div className="min-h-screen bg-light dark:bg-dark text-gray-800 dark:text-gray-200 flex items-center justify-center">
                Carregando...
            </div>
        );
    }

    if (!isAuthenticated) {
        if (authScreen === 'landing') {
            return <PublicLanding onEnter={() => setAuthScreen('login')} />;
        }

        return (
            <Login
                onLogin={handleLogin}
                error={authError}
                onBack={() => setAuthScreen('landing')}
            />
        );
    }

    const renderContent = () => {
        // The selectedFarm state can be passed down to children components to filter data
        console.log(`Rendering view "${activeView}" for farm: "${selectedFarm?.name ?? 'Nenhuma'}"`);

        if (isGeneticsRoute) {
            const withFarmGuard = (content: React.ReactNode) =>
                hasSelectedFarm ? content : (
                    <FarmRequiredPanel title="Selecione uma fazenda para continuar" />
                );

            return (
                <Routes>
                    <Route path="/genetics" element={<Navigate to="/genetics/plantel" replace />} />
                    <Route
                        path="/genetics/plantel"
                        element={withFarmGuard(<GeneticsPlantelPO farmId={selectedFarmId} mode="full" />)}
                    />
                    <Route
                        path="/genetics/reproducao"
                        element={withFarmGuard(<GeneticsReproducao farmId={selectedFarmId} />)}
                    />
                    <Route
                        path="/genetics/selecao"
                        element={withFarmGuard(<GeneticsSelecao farmId={selectedFarmId} />)}
                    />
                    <Route
                        path="/genetics/relatorios"
                        element={withFarmGuard(<GeneticsRelatorios farmId={selectedFarmId} />)}
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
                return <NutritionModule farmId={selectedFarmId} currentUser={currentUser} />;
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
                return <HerdModule farmId={selectedFarmId} mode="COMMERCIAL" />;
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
                return <HerdModule farmId={selectedFarmId} mode="PO" />;
            case 'Eixo Genetics':
                return <Navigate to="/genetics/plantel" replace />;
            case 'Contas a Pagar':
                return <AccountsPayable />;
            case 'Contas a Receber':
                return <AccountsReceivable />;
            case 'Fluxo de Caixa':
                return <CashFlow />;
            case 'DRE':
                return <DRE />;
            case 'Operações':
                return <Operations />;
            case 'Configurações':
                return <Settings />;
            case 'Visão Geral':
            default:
                return <Dashboard />;
        }
    };

    return (
        <>
            <div className="relative min-h-screen overflow-hidden bg-stone-100 font-sans text-stone-900">
                <div
                    className="pointer-events-none absolute inset-0 opacity-24"
                    style={{
                        backgroundImage: "url('/pasture-horizon.jpg')",
                        backgroundPosition: 'center top',
                        backgroundSize: 'cover',
                    }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-100/92 via-stone-100/95 to-stone-200/94" />

                <div className="relative flex min-h-screen">
                    <Sidebar
                        activeItem={activeView}
                        setActiveItem={setActiveView}
                        allowedModules={currentAllowedModules}
                    />
                    <main className="flex min-h-screen flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 lg:px-6 lg:pb-6 lg:pt-6">
                        <Header
                            farms={farms}
                            selectedFarmId={selectedFarmId}
                            onSelectFarm={setSelectedFarmId}
                            currentUser={currentUser}
                            onLogout={handleLogout}
                            canRegisterUsers={currentUser?.email === ADMIN_EMAIL}
                            onOpenUserRegister={() => setIsRegisterModalOpen(true)}
                        />
                        <div className="mt-[10px] flex-1 overflow-hidden rounded-[28px] border border-stone-300 bg-white/96 backdrop-blur">
                            <div className={activeView === 'Mapa da Fazenda' ? 'h-full' : 'h-full overflow-x-hidden overflow-y-auto p-4 lg:p-6'}>
                                {renderContent()}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
            <UserRegisterModal
                isOpen={isRegisterModalOpen}
                onClose={() => {
                    setIsRegisterModalOpen(false);
                    setRegisterMessage(null);
                    setRegisterError(null);
                }}
                onRegister={handleRegister}
                moduleCategories={MODULE_CATEGORIES}
                error={registerError}
                successMessage={registerMessage}
            />
        </>
    );
};

const App: React.FC = () => (
    <BrowserRouter>
        <AppContent />
    </BrowserRouter>
);

export default App;
