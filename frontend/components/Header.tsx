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

const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const getDayLabel = (offsetDays: number) => {
    if (offsetDays === 0) return 'Hoje';
    if (offsetDays === 1) return 'Amanhã';
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return DIAS_PT[d.getDay()];
};

const normalizeMm = (mm: number) => Math.round(mm * 10) / 10;
const formatMm = (mm: number) => `${normalizeMm(mm)}mm`;
const getRainLevelStyle = (mm: number) => {
    if (mm <= 0) return 'bg-[#fffaf1] text-[#8a7a63] border-[#e7dcc8]';
    if (mm < 8) return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]';
    if (mm < 20) return 'bg-[#dcf0ff] text-[#275f88] border-[#b8ddf7]';
    return 'bg-[#d7ecff] text-[#1d4f74] border-[#93c7ec]';
};

const BR_STATE_NAMES: Record<string, string> = {
    AC: 'Acre',
    AL: 'Alagoas',
    AP: 'Amapá',
    AM: 'Amazonas',
    BA: 'Bahia',
    CE: 'Ceará',
    DF: 'Distrito Federal',
    ES: 'Espírito Santo',
    GO: 'Goiás',
    MA: 'Maranhão',
    MT: 'Mato Grosso',
    MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais',
    PA: 'Pará',
    PB: 'Paraíba',
    PR: 'Paraná',
    PE: 'Pernambuco',
    PI: 'Piauí',
    RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul',
    RO: 'Rondônia',
    RR: 'Roraima',
    SC: 'Santa Catarina',
    SP: 'São Paulo',
    SE: 'Sergipe',
    TO: 'Tocantins',
};

const normalizeLocationText = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const parseFarmCity = (value: string) => {
    const [cityName = '', stateRaw = ''] = value.split('/').map((part) => part.trim());
    const stateCode = stateRaw.toUpperCase();
    return {
        cityName,
        stateName: BR_STATE_NAMES[stateCode] || stateRaw,
    };
};

// ---- RainWidget ----
interface RainWidgetProps {
    lat?: number | null;
    lng?: number | null;
    city?: string | null;
}

const RainWidget: React.FC<RainWidgetProps> = ({ lat, lng, city }) => {
    const [rain, setRain] = useState<number[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if ((lat == null || lng == null) && !city?.trim()) {
            setRain(null);
            setFailed(false);
            return;
        }
        let active = true;
        const load = async () => {
            try {
                if (active) setFailed(false);
                let latitude = lat;
                let longitude = lng;

                if ((latitude == null || longitude == null) && city?.trim()) {
                    const { cityName, stateName } = parseFarmCity(city);
                    const geoRes = await fetch(
                        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&country_code=BR&count=10&language=pt`
                    );
                    const geoData = await geoRes.json();
                    const results = Array.isArray(geoData?.results) ? geoData.results : [];
                    const normalizedState = normalizeLocationText(stateName);
                    const result = normalizedState
                        ? results.find((item) => normalizeLocationText(String(item?.admin1 || '')) === normalizedState) || results[0]
                        : results[0];
                    if (!result) {
                        if (active) {
                            setRain(null);
                            setFailed(true);
                        }
                        return;
                    }
                    latitude = result.latitude;
                    longitude = result.longitude;
                }

                if (latitude == null || longitude == null) {
                    if (active) {
                        setRain(null);
                        setFailed(true);
                    }
                    return;
                }

                const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=precipitation_sum&forecast_days=7&timezone=America%2FSao_Paulo`;
                const res = await fetch(url);
                const data = await res.json();
                if (active && Array.isArray(data?.daily?.precipitation_sum)) {
                    setRain(data.daily.precipitation_sum.slice(0, 7));
                }
                if (active && !Array.isArray(data?.daily?.precipitation_sum)) {
                    setRain(null);
                    setFailed(true);
                }
            } catch {
                if (active) {
                    setRain(null);
                    setFailed(true);
                }
            }
        };
        void load();
        return () => { active = false; };
    }, [lat, lng, city]);

    if (!rain && failed) {
        return (
            <div className="min-w-0 rounded-2xl border border-[#f3dfb0] bg-[#fff8e8] px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#9a6b06]">
                        <RainIcon />
                    </span>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a6b06]">
                        Previsão de chuva indisponível
                    </p>
                </div>
            </div>
        );
    }

    if (!rain) return null;
    const totalRain = normalizeMm(rain.reduce((sum, mm) => sum + mm, 0));

    return (
        <div className="min-w-0 rounded-2xl border border-[#b9dfc8] bg-[linear-gradient(135deg,#f8fbf4_0%,#eef8f1_50%,#e5f4ec_100%)] px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--eixo-green-soft)] text-[var(--eixo-green)]">
                    <RainIcon />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4e6a57]">
                    Previsão de chuva de hoje aos próximos 6 dias: {formatMm(totalRain)}
                </p>
            </div>
            <div className="flex max-w-[520px] items-center gap-1.5 overflow-x-auto pb-0.5">
                {rain.map((mm, index) => (
                    <div
                        key={`${index}-${mm}`}
                        className={`flex min-w-[64px] flex-col rounded-xl border px-2 py-1.5 text-center ${getRainLevelStyle(mm)}`}
                    >
                        <span className="text-[10px] font-semibold leading-none">{getDayLabel(index)}</span>
                        <span className="mt-1 text-xs font-bold leading-none">{formatMm(mm)}</span>
                    </div>
                ))}
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
    farmCity?: string | null;
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
    farmCity,
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

                {/* Widget de previsão de chuva — usa coordenadas ou fallback por cidade */}
                {(farmLat != null && farmLng != null) || farmCity?.trim() ? (
                    <RainWidget lat={farmLat} lng={farmLng} city={farmCity ?? null} />
                ) : null}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Lado direito — usuário */}
                {currentUser && (
                    <div className="relative shrink-0" ref={userRef}>
                        <button
                            onClick={() => setUserOpen((v) => !v)}
                            className="flex items-center gap-2.5 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2.5 transition-colors hover:bg-[var(--eixo-surface-soft)]"
                        >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--eixo-text)] text-xs font-bold text-[#f5f0e8]">
                                {currentUser.avatarUrl
                                    ? <img src={currentUser.avatarUrl} alt={currentUser.name} className="h-full w-full object-cover" />
                                    : getInitials(currentUser.name)
                                }
                            </div>
                            <ChevronDownIcon isOpen={userOpen} />
                        </button>

                        {userOpen && (
                            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
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
