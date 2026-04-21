import React, { useEffect, useRef, useState } from 'react';
import { Alert } from '../types';

// ---- Icons ----
const ChevronDownIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
);

const BellIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V5a2 2 0 10-4 0v.083A6 6 0 004 11v3.159c0 .538-.214 1.055-.595 1.436L2 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
);

const LocationIcon: React.FC = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
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
    <svg className="w-4 h-4 text-[#9d7d4d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);

// ---- Helpers ----
const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const ALERT_TYPE_COLORS: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
};

const ALERT_TYPE_DOT: Record<string, string> = {
    critical: 'bg-red-500',
    warning: 'bg-amber-400',
    info: 'bg-blue-400',
};

// ---- Types ----
interface Farm {
    id: string;
    name: string;
}

interface HeaderProps {
    farms: Farm[];
    selectedFarmId: string | null;
    onSelectFarm: (farmId: string | null) => void;
    currentUser?: { name: string; email: string } | null;
    onLogout?: () => void;
    canRegisterUsers?: boolean;
    onOpenUserRegister?: () => void;
}

// ---- Header ----
const Header: React.FC<HeaderProps> = ({
    farms,
    selectedFarmId,
    onSelectFarm,
    currentUser,
    onLogout,
    canRegisterUsers,
    onOpenUserRegister,
}) => {
    const [farmOpen, setFarmOpen] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [userOpen, setUserOpen] = useState(false);

    const farmRef = useRef<HTMLDivElement>(null);
    const alertRef = useRef<HTMLDivElement>(null);
    const userRef = useRef<HTMLDivElement>(null);

    const selectedFarm = farms.find((f) => f.id === selectedFarmId) || null;
    const hasFarms = farms.length > 0;

    // Placeholder — substituir por dados reais no plano avançado
    const alerts: Alert[] = [];
    const hasAlerts = alerts.length > 0;

    // Fechar dropdowns ao clicar fora
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (farmRef.current && !farmRef.current.contains(e.target as Node)) setFarmOpen(false);
            if (alertRef.current && !alertRef.current.contains(e.target as Node)) setAlertOpen(false);
            if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <header className="relative z-20 rounded-[28px] border border-[#ccb99d] bg-[#f3eadc]/92 px-4 py-3 backdrop-blur lg:px-6">
            <div className="flex items-center justify-between gap-3">

                {/* Seletor de Fazenda */}
                <div className="relative" ref={farmRef}>
                    <button
                        onClick={() => setFarmOpen((v) => !v)}
                        className="flex items-center gap-3 rounded-2xl border border-[#d1c1aa] bg-[#efe6d8] px-4 py-2.5 transition-colors hover:bg-[#e8ddcd]"
                    >
                        {/* Avatar com iniciais */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#9d7d4d] text-sm font-bold text-white">
                            {selectedFarm ? getInitials(selectedFarm.name) : <LocationIcon />}
                        </div>
                        <div className="hidden min-w-0 text-left sm:block">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f6d58]">
                                Fazenda selecionada
                            </p>
                            <p className="max-w-[180px] truncate text-sm font-bold text-stone-900">
                                {selectedFarm?.name || (hasFarms ? 'Selecione uma fazenda' : 'Nenhuma cadastrada')}
                            </p>
                        </div>
                        <ChevronDownIcon isOpen={farmOpen} />
                    </button>

                    {farmOpen && (
                        <div className="absolute left-0 z-30 mt-2 w-72 rounded-2xl border border-[#ccb99d] bg-[#f5ede2] shadow-xl">
                            <div className="border-b border-[#e3d4c0] px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-[#7f6d58]">Suas fazendas</p>
                            </div>
                            <ul className="max-h-64 overflow-y-auto py-2">
                                {hasFarms ? (
                                    farms.map((farm) => (
                                        <li key={farm.id}>
                                            <button
                                                type="button"
                                                onClick={() => { onSelectFarm(farm.id); setFarmOpen(false); }}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[#4a3f35] transition-colors hover:bg-[#eadfce]"
                                            >
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d4c4ae] text-xs font-bold text-[#5a4a35]">
                                                    {getInitials(farm.name)}
                                                </div>
                                                <span className="flex-1 font-medium">{farm.name}</span>
                                                {farm.id === selectedFarmId && <CheckIcon />}
                                            </button>
                                        </li>
                                    ))
                                ) : (
                                    <li className="px-4 py-3 text-sm text-[#7f6d58]">Nenhuma fazenda cadastrada.</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Lado direito */}
                <div className="flex items-center gap-2">

                    {/* Sino de alertas */}
                    <div className="relative" ref={alertRef}>
                        <button
                            onClick={() => setAlertOpen((v) => !v)}
                            className="relative flex items-center justify-center rounded-2xl border border-[#d1c1aa] bg-[#efe6d8] p-3 text-[#6f604f] transition-colors hover:bg-[#e8ddcd] hover:text-stone-900"
                        >
                            <BellIcon />
                            {hasAlerts && (
                                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500" />
                            )}
                        </button>

                        {alertOpen && (
                            <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-[#ccb99d] bg-[#f5ede2] shadow-xl">
                                <div className="flex items-center justify-between border-b border-[#e3d4c0] px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-[#7f6d58]">Alertas</p>
                                    {hasAlerts && (
                                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                                            {alerts.length}
                                        </span>
                                    )}
                                </div>
                                <div className="max-h-80 overflow-y-auto py-3">
                                    {hasAlerts ? (
                                        <ul className="space-y-2 px-3">
                                            {alerts.map((alert) => (
                                                <li
                                                    key={alert.id}
                                                    className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${ALERT_TYPE_COLORS[alert.type] || ALERT_TYPE_COLORS.info}`}
                                                >
                                                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ALERT_TYPE_DOT[alert.type] || ALERT_TYPE_DOT.info}`} />
                                                    <span>{alert.message}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="flex flex-col items-center py-6 text-center">
                                            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#ede5d8] text-[#9d7d4d]">
                                                <BellIcon />
                                            </div>
                                            <p className="text-sm font-medium text-[#4a3f35]">Tudo em ordem</p>
                                            <p className="mt-1 text-xs text-[#7f6d58]">Nenhum alerta no momento.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Área do usuário */}
                    {currentUser && (
                        <div className="relative" ref={userRef}>
                            <button
                                onClick={() => setUserOpen((v) => !v)}
                                className="flex items-center gap-3 rounded-2xl border border-[#d1c1aa] bg-[#efe6d8] px-3 py-2.5 transition-colors hover:bg-[#e8ddcd]"
                            >
                                {/* Avatar */}
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#2f3a2d] text-xs font-bold text-[#f4eadb]">
                                    {getInitials(currentUser.name)}
                                </div>
                                <div className="hidden text-left sm:block">
                                    <p className="text-sm font-semibold leading-tight text-stone-900">{currentUser.name}</p>
                                    <p className="text-xs leading-tight text-[#7f6d58]">{currentUser.email}</p>
                                </div>
                                <ChevronDownIcon isOpen={userOpen} />
                            </button>

                            {userOpen && (
                                <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-[#ccb99d] bg-[#f5ede2] shadow-xl">
                                    {/* Info do usuário */}
                                    <div className="border-b border-[#e3d4c0] px-4 py-3">
                                        <p className="text-sm font-semibold text-stone-900">{currentUser.name}</p>
                                        <p className="truncate text-xs text-[#7f6d58]">{currentUser.email}</p>
                                    </div>

                                    <ul className="py-2">
                                        {/* Meu Perfil — desabilitado por enquanto */}
                                        <li>
                                            <button
                                                type="button"
                                                disabled
                                                className="cursor-not-allowed flex w-full items-center gap-3 px-4 py-2 text-sm text-[#a09080]"
                                            >
                                                <UserIcon />
                                                <span>Meu Perfil</span>
                                                <span className="ml-auto text-[10px] font-semibold text-[#b09a80]">Em breve</span>
                                            </button>
                                        </li>

                                        {/* Cadastrar usuários — só admin */}
                                        {canRegisterUsers && (
                                            <>
                                                <li className="my-1 border-t border-[#e3d4c0]" />
                                                <li>
                                                    <button
                                                        type="button"
                                                        onClick={() => { onOpenUserRegister?.(); setUserOpen(false); }}
                                                        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#4a3f35] transition-colors hover:bg-[#eadfce]"
                                                    >
                                                        <UsersIcon />
                                                        <span>Cadastrar usuários</span>
                                                    </button>
                                                </li>
                                            </>
                                        )}

                                        <li className="my-1 border-t border-[#e3d4c0]" />

                                        {/* Sair */}
                                        <li>
                                            <button
                                                type="button"
                                                onClick={() => { onLogout?.(); setUserOpen(false); }}
                                                className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
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
            </div>
        </header>
    );
};

export default Header;
