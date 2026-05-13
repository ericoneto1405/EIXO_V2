import React, { useEffect, useRef, useState } from 'react';
import FarmRegistrationForm from './FarmRegistrationForm';
import OnboardingSpotlight from './OnboardingSpotlight';
import { Farm } from '../types';
import { buildApiUrl } from '../api';

// Icons
const PlusIcon: React.FC = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;

interface FarmsProps {
    farms: Farm[];
    onFarmCreated?: (farm: Farm) => void;
    onFarmUpdated?: (farm: Farm) => void;
    onFarmDeleted?: (farmId: string) => void;
    openForm?: boolean;
    onFormOpened?: () => void;
    onFormClosed?: () => void;
    isFreePlan?: boolean;
}

const Farms: React.FC<FarmsProps> = ({ farms, onFarmCreated, onFarmUpdated, onFarmDeleted, openForm, onFormOpened, onFormClosed, isFreePlan }) => {
    const [showForm, setShowForm] = useState(false);
    const [focusOnForm, setFocusOnForm] = useState(false);
    const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
    const [farmToDelete, setFarmToDelete] = useState<Farm | null>(null);
    const [showUpgradePopover, setShowUpgradePopover] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [expandedFarmId, setExpandedFarmId] = useState<string | null>(null);
    const [hoveredFarmId, setHoveredFarmId] = useState<string | null>(null);
    const togglePaddocks = (farmId: string) =>
        setExpandedFarmId(prev => prev === farmId ? null : farmId);
    const formRef = useRef<HTMLDivElement | null>(null);
    const upgradePopoverRef = useRef<HTMLDivElement | null>(null);
    const firstFarmWithoutPaddocks = farms.find((farm) => (farm.paddocks?.length ?? 0) === 0) ?? null;
    const formatNumber = (value: number) =>
        Number.isFinite(value)
            ? value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            : '0,0';

    useEffect(() => {
        const freeLimitHit = isFreePlan && farms.length >= 1;
        if (openForm && !freeLimitHit) {
            setShowForm(true);
            setFocusOnForm(true);
            onFormOpened?.();
        }
    }, [openForm, onFormOpened, isFreePlan, farms.length]);

    // Guarda definitiva: fecha o formulário se estiver em modo criação
    // e o limite do plano grátis for atingido — independente de como chegou aqui.
    // Cobre race conditions de timing (farms carregam depois do form abrir).
    useEffect(() => {
        const isCreateMode = editingFarm === null;
        const freeLimitHit = isFreePlan && farms.length >= 1;
        if (showForm && isCreateMode && freeLimitHit) {
            setShowForm(false);
            setFocusOnForm(false);
            onFormClosed?.();
        }
    }, [showForm, editingFarm, isFreePlan, farms.length, onFormClosed]);

    const handleToggleForm = () => {
        setEditingFarm(null);
        setShowForm(true);
        setFocusOnForm(true);
        onFormOpened?.();
    };

    const handleRegisterPaddock = () => {
        if (!firstFarmWithoutPaddocks) return;
        setEditingFarm(firstFarmWithoutPaddocks);
        setShowForm(true);
        setFocusOnForm(true);
        onFormOpened?.();
    };

    const handleFarmCreated = (farm: Farm) => {
        setFocusOnForm(false);
        setEditingFarm(null);
        onFarmCreated?.(farm);
    };

    const handleFarmUpdated = (farm: Farm) => {
        setFocusOnForm(false);
        onFarmUpdated?.(farm);
        setEditingFarm(farm);
    };

    const handleEdit = (farm: Farm) => {
        setEditingFarm(farm);
        setShowForm(true);
        setFocusOnForm(true);
        onFormOpened?.();
    };

    const handleDeleteRequest = (farm: Farm) => {
        setDeleteError(null);
        setFarmToDelete(farm);
    };

    const handleDeleteCancel = () => {
        setFarmToDelete(null);
        setDeleteError(null);
    };

    const handleDeleteConfirm = async () => {
        if (!farmToDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            const response = await fetch(buildApiUrl(`/farms/${farmToDelete.id}`), {
                method: 'DELETE',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setDeleteError(payload?.message || 'Não foi possível excluir a fazenda.');
                return;
            }
            onFarmDeleted?.(farmToDelete.id);
            setFarmToDelete(null);
        } catch (error) {
            console.error(error);
            setDeleteError('Não foi possível excluir a fazenda. Verifique sua conexão.');
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        if (showForm) {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [showForm]);

    useEffect(() => {
        if (!showForm) {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [showForm]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (upgradePopoverRef.current && !upgradePopoverRef.current.contains(event.target as Node)) {
                setShowUpgradePopover(false);
            }
        };

        if (showUpgradePopover) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showUpgradePopover]);

    return (
        <div className="space-y-6">

            {/* Modal de confirmação de exclusão */}
            {farmToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-[var(--eixo-graphite)]/50 backdrop-blur-sm"
                        onClick={handleDeleteCancel}
                    />
                    <div className="relative w-full max-w-md rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-8 shadow-2xl">
                        <h2 className="text-xl font-bold text-[var(--eixo-text)]">Excluir fazenda</h2>
                        <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                            Tem certeza que deseja excluir a fazenda{' '}
                            <span className="font-semibold text-[var(--eixo-text)]">"{farmToDelete.name}"</span>?
                            Essa ação não pode ser desfeita.
                        </p>

                        {deleteError && (
                            <p className="mt-4 rounded-2xl bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                                {deleteError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleDeleteCancel}
                                disabled={isDeleting}
                                className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-5 py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[#ece9e6] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="rounded-2xl border border-[#efc2ba] bg-[#fff2ef] px-5 py-2.5 text-sm font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[#f7ddd7] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isDeleting ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            Estrutura da Fazenda
                        </div>
                        <h1 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Fazendas e Pastos</h1>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--eixo-text-muted)]">Gerencie as fazendas cadastradas e a base territorial da operação.</p>
                    </div>
                    {!showForm && (() => {
                        const freeLimitHit = isFreePlan && farms.length >= 1;
                        if (freeLimitHit) {
                            return (
                                <div className="relative" ref={upgradePopoverRef}>
                                    <button
                                        type="button"
                                        onClick={() => setShowUpgradePopover((current) => !current)}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm font-semibold text-[#a8a29e] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                        <span>Adicionar fazenda</span>
                                    </button>
                                    {showUpgradePopover && (
                                        <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4 text-left shadow-xl">
                                            <p className="text-sm font-semibold text-[var(--eixo-text)]">Eleve o nível da gestão</p>
                                            <p className="mt-1 text-xs leading-relaxed text-[var(--eixo-text-muted)]">
                                                Com o Plano Gestão, você acompanha mais fazendas e expande o controle da operação.
                                            </p>
                                            <a
                                                href="/planos"
                                                className="mt-3 inline-flex rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                                            >
                                                Conhecer Plano Gestão
                                            </a>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <button
                                type="button"
                                onClick={handleToggleForm}
                                className="inline-flex items-center rounded-2xl border border-[var(--eixo-green)] bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                            >
                                <PlusIcon />
                                <span className="ml-2">Adicionar fazenda</span>
                            </button>
                        );
                    })()}
                </div>
            </div>

            {showForm && (
                <div className="mb-6" ref={formRef}>
                    <FarmRegistrationForm
                        onFarmCreated={handleFarmCreated}
                        onFarmUpdated={handleFarmUpdated}
                        autoFocusName={focusOnForm}
                        initialFarm={editingFarm}
                        onSaveAndReturn={() => {
                            setEditingFarm(null);
                            setShowForm(false);
                            onFormClosed?.();
                        }}
                        onCancelEdit={() => {
                            setEditingFarm(null);
                            setShowForm(false);
                            onFormClosed?.();
                        }}
                    />
                </div>
            )}

            {!showForm && farms.length === 0 && !(isFreePlan && farms.length >= 1) && (
                <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-16 text-center">
                    <svg className="mb-4 h-10 w-10 text-[var(--eixo-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <p className="text-base font-bold text-[var(--eixo-text)]">Nenhuma fazenda cadastrada</p>
                    <p className="mt-2 max-w-xs text-sm text-[var(--eixo-text-muted)]">Cadastre sua fazenda para organizar pastos, rebanho e operação no mesmo lugar.</p>
                    <button
                        type="button"
                        onClick={handleToggleForm}
                        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[var(--eixo-green)] px-6 py-3 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Cadastrar minha primeira fazenda
                    </button>
                </div>
            )}

            {!showForm && farms.length > 0 && (
                <div className="grid gap-4">
                    {farms.map((farm) => {
                        const paddocks = farm.paddocks ?? [];
                        const paddocksCount = paddocks.length;
                        const totalPaddockArea = paddocks.reduce((sum, paddock) => sum + (paddock.areaHa ?? 0), 0);
                        const totalCapacityUa = paddocks.reduce((sum, paddock) => {
                            if (typeof paddock.capacity === 'number') return sum + paddock.capacity;
                            if (typeof paddock.areaHa === 'number' && typeof paddock.lotacaoUaHa === 'number') {
                                return sum + (paddock.areaHa * paddock.lotacaoUaHa);
                            }
                            return sum;
                        }, 0);
                        const areaCoverage = farm.size > 0 ? (totalPaddockArea / farm.size) * 100 : 0;
                        const animalsCount = typeof (farm as Farm & { animalsCount?: number }).animalsCount === 'number'
                            ? (farm as Farm & { animalsCount?: number }).animalsCount
                            : null;

                        return (
                            <div
                                key={farm.id}
                                className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5"
                                onMouseEnter={() => setHoveredFarmId(farm.id)}
                                onMouseLeave={() => setHoveredFarmId(null)}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-bold text-[var(--eixo-text)]">{farm.name}</h2>
                                            {farm.lat && farm.lng ? (
                                                <a
                                                    href={`https://maps.google.com/?q=${farm.lat},${farm.lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Ver no mapa"
                                                    className="text-[var(--eixo-success)] transition-opacity hover:opacity-70"
                                                >
                                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                                                </a>
                                            ) : (
                                                <span title="Localização não cadastrada" className="text-[#c4b8a5]">
                                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">{farm.city || 'Localização não informada'}</p>
                                    </div>
                                    <div className={`flex items-center gap-2 transition-opacity duration-150 ${hoveredFarmId === farm.id ? 'sm:opacity-100' : 'sm:opacity-0'}`}>
                                        <button
                                            type="button"
                                            onClick={() => handleEdit(farm)}
                                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[#ece9e6]"
                                        >
                                            Editar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRequest(farm)}
                                            className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[#f7ddd7]"
                                        >
                                            Excluir
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Tamanho total</p>
                                        <p className="mt-1 text-sm font-bold text-[var(--eixo-text)]">{formatNumber(farm.size)} ha</p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Capacidade total</p>
                                        <p className="mt-1 text-sm font-bold text-[var(--eixo-text)]">{formatNumber(totalCapacityUa)} UA</p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Animais atuais</p>
                                        <p className="mt-1 text-sm font-bold text-[var(--eixo-text)]">{animalsCount ?? '—'}</p>
                                    </div>
                                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Área distribuída</p>
                                        <p className="mt-1 text-sm font-bold text-[var(--eixo-text)]">{formatNumber(areaCoverage)}%</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    {paddocksCount === 0 ? (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fffbeb] px-2.5 py-1 text-xs font-semibold text-[#92400e]">
                                            Adicionar pastos →
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => togglePaddocks(farm.id)}
                                            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--eixo-green-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--eixo-graphite)] transition-colors hover:bg-[#d4eda0]"
                                        >
                                            {paddocksCount} {paddocksCount === 1 ? 'pasto' : 'pastos'}
                                            <svg className={`h-3 w-3 transition-transform duration-200 ${expandedFarmId === farm.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    )}
                                </div>

                                {expandedFarmId === farm.id && paddocksCount > 0 && (
                                    <div className="mt-4 space-y-2 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">
                                        {paddocks.map((paddock) => (
                                            <div key={paddock.id} className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-sm font-semibold text-[var(--eixo-text)]">{paddock.name}</p>
                                                    <p className="text-xs text-[var(--eixo-text-muted)]">
                                                        {typeof paddock.areaHa === 'number' ? `${formatNumber(paddock.areaHa)} ha` : 'Área não informada'}
                                                    </p>
                                                </div>
                                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                                    {paddock.divisionType || 'Tipo não informado'} · {paddock.forrageira || 'Forrageira não informada'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Estado vazio de pastos — prioriza a base operacional da fazenda */}
            {!showForm && firstFarmWithoutPaddocks && (
                <div className="mt-4 rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                    <OnboardingSpotlight
                        step={2}
                        totalSteps={3}
                        title="Cadastre os pastos da fazenda"
                        description={`Organize lotação, manejo e pesagens. Fazenda: ${firstFarmWithoutPaddocks.name}`}
                        actionLabel="Cadastrar pasto"
                        onAction={handleRegisterPaddock}
                        iconPath="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                </div>
            )}
        </div>
    );
};

export default Farms;
