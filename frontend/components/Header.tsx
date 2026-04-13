import React, { useState, useEffect, useRef } from 'react';
import AlertTicker from './AlertTicker';

// Icons
const NotificationIcon: React.FC = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V5a2 2 0 10-4 0v.083A6 6 0 004 11v3.159c0 .538-.214 1.055-.595 1.436L2 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
const ChevronDownIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => <svg className={`w-5 h-5 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>;
const FarmIcon: React.FC = () => <svg className="w-5 h-5 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>;

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

const Header: React.FC<HeaderProps> = ({
    farms,
    selectedFarmId,
    onSelectFarm,
    currentUser,
    onLogout,
    canRegisterUsers,
    onOpenUserRegister,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const hasFarms = farms.length > 0;
    const selectedFarm = farms.find((farm) => farm.id === selectedFarmId) || null;
    const currentFarmLabel = hasFarms
        ? selectedFarm?.name || 'Selecione uma fazenda'
        : 'Nenhuma fazenda cadastrada';

    const handleSelect = (farmId: string | null) => {
        onSelectFarm(farmId);
        setIsOpen(false);
    };

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <header className="relative z-20 rounded-[28px] border border-[#ccb99d] bg-[#f3eadc]/92 px-4 py-4 backdrop-blur lg:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="relative min-w-0 xl:flex-1" ref={dropdownRef}>
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="flex w-full items-center rounded-2xl border border-[#d1c1aa] bg-[#efe6d8] px-4 py-3 text-left transition-colors hover:bg-[#e8ddcd] xl:max-w-[360px]"
                        >
                            <FarmIcon />
                            <div className="min-w-0">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f6d58]">Fazenda selecionada</span>
                                <div className="flex items-center">
                                    <h2 className="truncate text-base font-bold text-stone-900">{currentFarmLabel}</h2>
                                    <ChevronDownIcon isOpen={isOpen} />
                                </div>
                            </div>
                        </button>
                        {isOpen && (
                            <div className="absolute z-30 mt-2 w-full rounded-2xl border border-[#ccb99d] bg-[#f5ede2] shadow-xl xl:max-w-[360px]">
                                <ul className="py-2">
                                    {hasFarms ? (
                                        <>
                                            <li>
                                                <a
                                                    href="#"
                                                    onClick={(e) => { e.preventDefault(); handleSelect(null); }}
                                                    className="block px-4 py-2 text-sm text-[#5f5244] transition-colors hover:bg-[#eadfce]"
                                                >
                                                    Todas as Fazendas
                                                </a>
                                            </li>
                                            {farms.map(farm => (
                                                <li key={farm.id}>
                                                    <a
                                                        href="#"
                                                        onClick={(e) => { e.preventDefault(); handleSelect(farm.id); }}
                                                        className="block px-4 py-2 text-sm text-[#5f5244] transition-colors hover:bg-[#eadfce]"
                                                    >
                                                        {farm.name}
                                                    </a>
                                                </li>
                                            ))}
                                        </>
                                    ) : (
                                        <li className="px-4 py-3 text-sm text-[#7f6d58]">
                                            Nenhuma fazenda cadastrada.
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center xl:justify-end">
                    <div className="min-w-0 rounded-2xl border border-[#d1c1aa] bg-[#efe6d8] px-4 py-3 lg:min-w-[420px] xl:min-w-[560px]">
                        <AlertTicker />
                    </div>

                    <button className="relative rounded-2xl border border-[#d1c1aa] bg-[#efe6d8] p-3 text-[#6f604f] transition-colors hover:bg-[#e8ddcd] hover:text-stone-900">
                        <NotificationIcon />
                        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500"></span>
                    </button>

                    {currentUser && (
                        <div className="flex items-center gap-3 rounded-2xl border border-[#d1c1aa] bg-[#efe6d8] px-4 py-3">
                            <div className="text-right">
                                <p className="text-sm font-semibold text-stone-900">{currentUser.name}</p>
                                <p className="text-xs text-[#7f6d58]">{currentUser.email}</p>
                                {canRegisterUsers && (
                                    <button
                                        type="button"
                                        onClick={onOpenUserRegister}
                                        className="mt-2 w-full rounded-xl border border-[#c7a56a] bg-[#f7f1e5] px-3 py-1 text-xs font-semibold text-[#8b6332] transition-colors hover:bg-[#efe2c7]"
                                    >
                                        Cadastrar usuários
                                    </button>
                                )}
                            </div>
                            <button
                                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                                onClick={onLogout}
                                type="button"
                            >
                                Sair
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
