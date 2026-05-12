import React, { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../api';

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

const RainIcon: React.FC = () => (
    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 17.58A5 5 0 0018 8h-1.26A8 8 0 104 15.25" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 19v1M8 16v1M12 21v1M12 18v1M16 19v1M16 16v1" />
    </svg>
);

// ---- Helpers ----
const getInitials = (name: string) =>
    name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const getFirstName = (name: string) => String(name || '').trim().split(/\s+/)[0] || '';

const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const getDayLabel = (offsetDays: number) => {
    if (offsetDays === 0) return 'Hoje';
    if (offsetDays === 1) return 'Amanhã';
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return DIAS_PT[d.getDay()];
};

const formatMm = (mm: number) => mm < 0.5 ? 'Seco' : `${Math.round(mm)}mm`;

// ---- RainWidget ----
interface RainWidgetProps {
    lat: number;
    lng: number;
}

const RainWidget: React.FC<RainWidgetProps> = ({ lat, lng }) => {
    const [rain, setRain] = useState<number[] | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&forecast_days=3&timezone=auto`;
                const res = await fetch(url);
                const data = await res.json();
                if (active && Array.isArray(data?.daily?.precipitation_sum)) {
                    setRain(data.daily.precipitation_sum);
                }
            } catch {
                // silently fail
            }
        };
        void load();
        return () => { active = false; };
    }, [lat, lng]);

    if (!rain) return null;

    return (
        <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#EDEDED] text-[var(--eixo-text-muted)]">
                <RainIcon />
            </span>
            <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">
                    Previsão de chuva
                </p>
                <p className="whitespace-nowrap text-sm font-semibold text-[var(--eixo-text)]">
                    {getDayLabel(0)} {formatMm(rain[0])}
                    <span className="mx-1.5 text-[var(--eixo-text-muted)]">·</span>
                    {getDayLabel(1)} {formatMm(rain[1])}
                    <span className="mx-1.5 text-[var(--eixo-text-muted)]">·</span>
                    {getDayLabel(2)} {formatMm(rain[2])}
                </p>
            </div>
        </div>
    );
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
    currentUser?: { name: string; email: string; phone?: string | null; avatarUrl?: string | null } | null;
    onLogout?: () => void;
    canRegisterUsers?: boolean;
    onOpenUserRegister?: () => void;
    onOpenProfile?: () => void;
    farmLat?: number | null;
    farmLng?: number | null;
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
    onOpenProfile,
    farmLat,
    farmLng,
}) => {
    const [farmOpen, setFarmOpen] = useState(false);
    const [userOpen, setUserOpen] = useState(false);

    const farmRef = useRef<HTMLDivElement>(null);
    const userRef = useRef<HTMLDivElement>(null);

    const hasFarms = farms.length > 0;
    const hasMultipleFarms = farms.length > 1;
    const selectedFarm = farms.find((f) => f.id === selectedFarmId) ?? null;
    const allFarmsSelected = hasMultipleFarms && selectedFarmId === null;

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

    // Fechar dropdowns ao clicar fora
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (farmRef.current && !farmRef.current.contains(e.target as Node)) setFarmOpen(false);
            if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    return (
        <header className="relative z-20 rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
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

                {/* Spacer */}
                <div className="flex-1" />

                {/* Widget de previsão de chuva — só aparece quando a fazenda tem coordenadas */}
                {farmLat != null && farmLng != null && (
                    <RainWidget lat={farmLat} lng={farmLng} />
                )}

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
        </header>
    );
};

export default Header;
