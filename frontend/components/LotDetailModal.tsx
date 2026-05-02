import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lot } from '../types';
import {
    HerdAnimal,
    HerdType,
    deleteLot,
    listAnimals,
    updateAnimalLot,
    updateLot,
} from '../adapters/herdApi';
import { getCurrentNutrition } from '../adapters/nutritionApi';

interface LotDetailModalProps {
    lot: Lot | null;
    onClose: () => void;
    onLotUpdated?: () => void;
    onLotDeleted?: () => void;
    mode?: HerdType;
    herdType?: HerdType;
}

type ModalTab = 'animals' | 'nutrition';

const LOT_OBJECTIVE_OPTIONS = [
    'Cria',
    'Recria',
    'Engorda',
    'Matrizes',
    'Bezerros',
    'Apartação',
    'Venda',
    'Confinamento',
    'Semi-confinamento',
    'Manejo sanitário',
    'Observação',
];
const LOT_OBJECTIVE_HELP = [
    'Cria: produção de bezerros.',
    'Recria: crescimento dos animais.',
    'Engorda: ganho de peso para venda.',
    'Matrizes: vacas do rebanho.',
    'Bezerros: animais jovens separados.',
    'Apartação: separação temporária.',
    'Venda: animais separados para negociação.',
    'Confinamento: sistema intensivo no cocho.',
    'Semi-confinamento: pasto com suplementação forte.',
    'Manejo sanitário: vacina, vermífugo ou tratamento.',
    'Observação: animais que exigem acompanhamento.',
];
const LOT_STATUS_OPTIONS = ['ATIVO', 'INATIVO'];

const formatDateInput = (value?: string | null) => {
    if (!value) return '';
    return value.slice(0, 10);
};

const LotObjectiveHelp: React.FC = () => (
    <span className="group relative inline-flex">
        <span className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-xs font-bold text-[var(--eixo-text-muted)]">
            ?
        </span>
        <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-[320px] -translate-x-1/2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4 text-left text-xs font-normal leading-5 text-[var(--eixo-text-muted)] shadow-xl group-hover:block">
            <span className="mb-2 block font-semibold text-[var(--eixo-text)]">Escolha para que este lote existe.</span>
            {LOT_OBJECTIVE_HELP.map((item) => (
                <span key={item} className="block">{item}</span>
            ))}
        </span>
    </span>
);

const LotDetailModal: React.FC<LotDetailModalProps> = ({
    lot,
    onClose,
    onLotUpdated,
    onLotDeleted,
    mode,
    herdType,
}) => {
    const resolvedMode: HerdType = mode ?? herdType ?? 'COMMERCIAL';
    const [activeTab, setActiveTab] = useState<ModalTab>('animals');

    // Edição
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editObjective, setEditObjective] = useState('');
    const [editStatus, setEditStatus] = useState('ATIVO');
    const [editStartDate, setEditStartDate] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // Exclusão
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Animais
    const [lotAnimals, setLotAnimals] = useState<HerdAnimal[]>([]);
    const [allAnimals, setAllAnimals] = useState<HerdAnimal[]>([]);
    const [isLoadingAnimals, setIsLoadingAnimals] = useState(false);
    const [animalsError, setAnimalsError] = useState<string | null>(null);
    const [weightMin, setWeightMin] = useState('');
    const [weightMax, setWeightMax] = useState('');
    const [ageMinMonths, setAgeMinMonths] = useState('');
    const [ageMaxMonths, setAgeMaxMonths] = useState('');
    const [sexFilter, setSexFilter] = useState('');
    const [breedFilter, setBreedFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [discardFilter, setDiscardFilter] = useState('');
    const [selectedAnimalIds, setSelectedAnimalIds] = useState<string[]>([]);
    const [isAddingAnimal, setIsAddingAnimal] = useState(false);

    // Nutrição
    const [planName, setPlanName] = useState<string | null>(null);
    const [planPhase, setPlanPhase] = useState<string | null>(null);
    const [planMeta, setPlanMeta] = useState<number | null>(null);
    const [isLoadingNutrition, setIsLoadingNutrition] = useState(false);
    const [nutritionError, setNutritionError] = useState<string | null>(null);

    const loadAnimals = useCallback(async () => {
        if (!lot?.farmId) return;
        setIsLoadingAnimals(true);
        setAnimalsError(null);
        try {
            const all = await listAnimals(lot.farmId, resolvedMode);
            setAllAnimals(all);
            setLotAnimals(all.filter((a) => a.lotId === lot.id));
        } catch (err: any) {
            setAnimalsError(err?.message || 'Erro ao carregar animais.');
        } finally {
            setIsLoadingAnimals(false);
        }
    }, [lot, resolvedMode]);

    useEffect(() => {
        if (!lot?.id || !lot.farmId) return;

        setEditName(lot.name);
        setEditObjective(lot.objective || '');
        setEditStatus(lot.status || 'ATIVO');
        setEditStartDate(formatDateInput(lot.startDate));
        setEditNotes(lot.notes || '');
        setIsEditing(false);
        setShowDeleteConfirm(false);
        setActiveTab('animals');
        setDeleteError(null);
        setEditError(null);
        setWeightMin('');
        setWeightMax('');
        setAgeMinMonths('');
        setAgeMaxMonths('');
        setSexFilter('');
        setBreedFilter('');
        setCategoryFilter('');
        setDiscardFilter('');
        setSelectedAnimalIds([]);

        loadAnimals();

        setIsLoadingNutrition(true);
        setNutritionError(null);
        getCurrentNutrition({
            farmId: lot.farmId,
            lotId: resolvedMode === 'COMMERCIAL' ? lot.id : undefined,
            poLotId: resolvedMode === 'PO' ? lot.id : undefined,
        })
            .then((payload) => {
                setPlanName(payload.plan?.nome || null);
                setPlanPhase(payload.plan?.fase || null);
                setPlanMeta(payload.plan?.metaGmd ?? null);
            })
            .catch((err: any) => {
                setNutritionError(err?.message || 'Erro ao carregar nutrição.');
            })
            .finally(() => setIsLoadingNutrition(false));
    }, [lot, resolvedMode, loadAnimals]);

    if (!lot) return null;

    const handleSaveEdit = async () => {
        if (!editName.trim()) { setEditError('Nome obrigatório.'); return; }
        setIsSavingEdit(true);
        setEditError(null);
        try {
            await updateLot(lot.id, resolvedMode, {
                name: editName.trim(),
                objective: editObjective || undefined,
                status: editStatus,
                startDate: editStartDate || undefined,
                notes: editNotes.trim() || undefined,
            });
            setIsEditing(false);
            onLotUpdated?.();
        } catch (err: any) {
            setEditError(err?.message || 'Erro ao salvar.');
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteLot(lot.id, resolvedMode);
            onLotDeleted?.();
            onClose();
        } catch (err: any) {
            setDeleteError(err?.message || 'Erro ao excluir.');
            setIsDeleting(false);
        }
    };

    const handleAddAnimals = async () => {
        if (selectedAnimalIds.length === 0) return;
        setIsAddingAnimal(true);
        setAnimalsError(null);
        try {
            await Promise.all(selectedAnimalIds.map((animalId) => updateAnimalLot(animalId, resolvedMode, lot.id)));
            setSelectedAnimalIds([]);
            await loadAnimals();
            onLotUpdated?.();
        } catch (err: any) {
            setAnimalsError(err?.message || 'Erro ao adicionar animais.');
        } finally {
            setIsAddingAnimal(false);
        }
    };

    const handleRemoveAnimal = async (animalId: string) => {
        setAnimalsError(null);
        try {
            await updateAnimalLot(animalId, resolvedMode, null);
            await loadAnimals();
            onLotUpdated?.();
        } catch (err: any) {
            setAnimalsError(err?.message || 'Erro ao remover animal.');
        }
    };

    const availableToAdd = allAnimals.filter((a) => !a.lotId);
    const getAgeInMonths = (birthDate?: string | null) => {
        if (!birthDate) return null;
        const parsed = new Date(birthDate);
        if (Number.isNaN(parsed.getTime())) return null;
        const today = new Date();
        let months = (today.getFullYear() - parsed.getFullYear()) * 12;
        months += today.getMonth() - parsed.getMonth();
        if (today.getDate() < parsed.getDate()) {
            months -= 1;
        }
        return Math.max(months, 0);
    };
    const breedOptions = useMemo(() => {
        return Array.from(new Set(availableToAdd.map((animal) => animal.raca).filter(Boolean))).sort();
    }, [availableToAdd]);
    const categoryOptions = useMemo(() => {
        return Array.from(new Set(availableToAdd.map((animal) => animal.categoria).filter(Boolean))).sort();
    }, [availableToAdd]);
    const filteredAvailableToAdd = useMemo(() => {
        const parsedWeightMin = weightMin ? Number(weightMin.replace(',', '.')) : null;
        const parsedWeightMax = weightMax ? Number(weightMax.replace(',', '.')) : null;
        const parsedAgeMin = ageMinMonths ? Number(ageMinMonths.replace(',', '.')) : null;
        const parsedAgeMax = ageMaxMonths ? Number(ageMaxMonths.replace(',', '.')) : null;

        return availableToAdd.filter((animal) => {
            const weight = animal.pesoAtual;
            if (parsedWeightMin !== null && (!weight || weight < parsedWeightMin)) return false;
            if (parsedWeightMax !== null && (!weight || weight > parsedWeightMax)) return false;

            const ageMonths = getAgeInMonths(animal.dataNascimento);
            if (parsedAgeMin !== null && (ageMonths === null || ageMonths < parsedAgeMin)) return false;
            if (parsedAgeMax !== null && (ageMonths === null || ageMonths > parsedAgeMax)) return false;

            if (sexFilter && animal.sexo !== sexFilter) return false;
            if (breedFilter && animal.raca !== breedFilter) return false;
            if (categoryFilter && animal.categoria !== categoryFilter) return false;
            if (discardFilter === 'discard' && animal.selectionDecision !== 'DISCARD') return false;
            if (discardFilter === 'not-discard' && animal.selectionDecision === 'DISCARD') return false;

            return true;
        });
    }, [ageMaxMonths, ageMinMonths, availableToAdd, breedFilter, categoryFilter, discardFilter, sexFilter, weightMax, weightMin]);

    const toggleSelectedAnimal = (animalId: string) => {
        setSelectedAnimalIds((current) =>
            current.includes(animalId)
                ? current.filter((id) => id !== animalId)
                : [...current, animalId],
        );
    };

    const tabClass = (tab: ModalTab) =>
        `${activeTab === tab
            ? 'border-[var(--eixo-green)] text-[var(--eixo-green)] font-semibold'
            : 'border-transparent text-[var(--eixo-text-muted)] hover:text-[var(--eixo-green)] hover:border-[var(--eixo-border)]'
        } whitespace-nowrap py-3 px-1 border-b-2 text-sm transition-colors`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="flex w-full max-w-lg flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl"
                style={{ maxHeight: '90vh', animation: 'scale-in 0.18s ease-out forwards' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--eixo-border)] px-6 py-5">
                    <div className="flex-1 min-w-0 mr-3">
                        <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">
                            Gerenciar lote
                        </p>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full border-b-2 border-[var(--eixo-green)] bg-transparent font-brand text-xl font-extrabold text-[var(--eixo-text)] outline-none"
                                autoFocus
                            />
                        ) : (
                            <h3 className="font-brand text-xl font-extrabold text-[var(--eixo-text)] truncate">
                                {lot.name}
                            </h3>
                        )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                        {!isEditing && !showDeleteConfirm && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    className="rounded-xl border border-[var(--eixo-border)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                >
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[#f7ddd7]"
                                >
                                    Excluir
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fechar"
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </header>

                {/* Confirmação de exclusão */}
                {showDeleteConfirm && (
                    <div className="flex-shrink-0 border-b border-[var(--eixo-border)] bg-[#fff2ef] px-6 py-4">
                        <p className="mb-3 text-sm font-medium text-[var(--eixo-danger)]">
                            Excluir este lote? Os animais são mantidos — apenas o agrupamento é removido.
                        </p>
                        {deleteError && <p className="mb-2 text-xs text-[var(--eixo-danger)]">{deleteError}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="rounded-xl bg-[var(--eixo-danger)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--eixo-danger)] disabled:opacity-60"
                            >
                                {isDeleting ? 'Excluindo...' : 'Confirmar exclusão'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {!isEditing && !showDeleteConfirm && (
                    <div className="flex-shrink-0 border-b border-[var(--eixo-border)] px-6 py-4">
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <span className="block text-xs font-medium text-[var(--eixo-text-muted)]">Finalidade</span>
                                <span className="font-semibold text-[var(--eixo-text)]">{lot.objective || 'Não definido'}</span>
                            </div>
                            <div>
                                <span className="block text-xs font-medium text-[var(--eixo-text-muted)]">Status</span>
                                <span className="font-semibold text-[var(--eixo-text)]">{lot.status === 'INATIVO' ? 'Inativo' : 'Ativo'}</span>
                            </div>
                            <div>
                                <span className="block text-xs font-medium text-[var(--eixo-text-muted)]">Início</span>
                                <span className="font-semibold text-[var(--eixo-text)]">
                                    {lot.startDate ? new Date(lot.startDate).toLocaleDateString('pt-BR') : 'Não definido'}
                                </span>
                            </div>
                        </div>
                        {lot.notes && (
                            <p className="mt-3 text-sm text-[var(--eixo-text-muted)]">{lot.notes}</p>
                        )}
                    </div>
                )}

                {/* Modo edição */}
                {isEditing && (
                    <div className="flex-shrink-0 space-y-3 border-b border-[var(--eixo-border)] px-6 py-4">
                        <div>
                            <label className="flex items-center gap-2 text-xs font-medium text-[var(--eixo-text-muted)]">
                                <span>Finalidade do lote</span>
                                <LotObjectiveHelp />
                            </label>
                            <select
                                value={editObjective}
                                onChange={(e) => setEditObjective(e.target.value)}
                                className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                            >
                                <option value="">Não definida</option>
                                {LOT_OBJECTIVE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-medium text-[var(--eixo-text-muted)]">Status</label>
                                <select
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                >
                                    {LOT_STATUS_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{option === 'INATIVO' ? 'Inativo' : 'Ativo'}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[var(--eixo-text-muted)]">Data de início</label>
                                <input
                                    type="date"
                                    value={editStartDate}
                                    onChange={(e) => setEditStartDate(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-[var(--eixo-text-muted)]">Observações</label>
                            <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                rows={2}
                                className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none"
                                placeholder="Opcional"
                            />
                        </div>
                        {editError && <p className="text-xs text-[var(--eixo-danger)]">{editError}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={isSavingEdit}
                                className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-60"
                            >
                                {isSavingEdit ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIsEditing(false); setEditError(null); }}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Abas */}
                <div className="flex-shrink-0 border-b border-[var(--eixo-border)] px-6">
                    <nav className="-mb-px flex gap-4">
                        <button onClick={() => setActiveTab('animals')} className={tabClass('animals')}>
                            Animais
                            {lotAnimals.length > 0 && (
                                <span className="ml-1.5 rounded-full bg-[var(--eixo-surface-soft)] px-1.5 py-0.5 text-xs font-bold text-[var(--eixo-text-muted)]">
                                    {lotAnimals.length}
                                </span>
                            )}
                        </button>
                        <button onClick={() => setActiveTab('nutrition')} className={tabClass('nutrition')}>
                            Nutrição
                        </button>
                    </nav>
                </div>

                {/* Body scrollável */}
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">

                    {/* ABA: Animais */}
                    {activeTab === 'animals' && (
                        <>
                            <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-[var(--eixo-text)]">Filtrar animais sem lote</h4>
                                        <p className="text-xs text-[var(--eixo-text-muted)]">Use critérios de manejo para escolher os animais.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddAnimals}
                                        disabled={selectedAnimalIds.length === 0 || isAddingAnimal}
                                        className="shrink-0 rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-50"
                                    >
                                        {isAddingAnimal ? 'Adicionando...' : `Adicionar ${selectedAnimalIds.length || ''}`.trim()}
                                    </button>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <input
                                        type="number"
                                        min="0"
                                        value={weightMin}
                                        onChange={(e) => setWeightMin(e.target.value)}
                                        placeholder="Peso mínimo (kg)"
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        value={weightMax}
                                        onChange={(e) => setWeightMax(e.target.value)}
                                        placeholder="Peso máximo (kg)"
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        value={ageMinMonths}
                                        onChange={(e) => setAgeMinMonths(e.target.value)}
                                        placeholder="Idade mínima (meses)"
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        value={ageMaxMonths}
                                        onChange={(e) => setAgeMaxMonths(e.target.value)}
                                        placeholder="Idade máxima (meses)"
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    />
                                    <select
                                        value={sexFilter}
                                        onChange={(e) => setSexFilter(e.target.value)}
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    >
                                        <option value="">Todos os sexos</option>
                                        <option value="Macho">Macho</option>
                                        <option value="Fêmea">Fêmea</option>
                                    </select>
                                    <select
                                        value={discardFilter}
                                        onChange={(e) => setDiscardFilter(e.target.value)}
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    >
                                        <option value="">Todos</option>
                                        <option value="discard">Marcados como descarte</option>
                                        <option value="not-discard">Não marcados como descarte</option>
                                    </select>
                                    <select
                                        value={breedFilter}
                                        onChange={(e) => setBreedFilter(e.target.value)}
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    >
                                        <option value="">Todas as raças</option>
                                        {breedOptions.map((breed) => (
                                            <option key={breed} value={breed}>{breed}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                    >
                                        <option value="">Todas as categorias</option>
                                        {categoryOptions.map((category) => (
                                            <option key={category} value={category}>{category}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                                    {isLoadingAnimals ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando animais disponíveis...</p>
                                    ) : availableToAdd.length === 0 ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Não há animais sem lote para adicionar.</p>
                                    ) : filteredAvailableToAdd.length === 0 ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum animal encontrado com esses filtros.</p>
                                    ) : (
                                        filteredAvailableToAdd.map((animal) => {
                                            const checked = selectedAnimalIds.includes(animal.id);
                                            return (
                                                <label
                                                    key={animal.id}
                                                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleSelectedAnimal(animal.id)}
                                                        className="mt-1 h-4 w-4 rounded border-[var(--eixo-border)] text-[var(--eixo-green)] focus:ring-[var(--eixo-green)]"
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-semibold text-[var(--eixo-text)]">
                                                            {animal.identificacao || animal.brinco || animal.nome || 'Sem identificação'}
                                                        </span>
                                                        <span className="block text-xs text-[var(--eixo-text-muted)]">
                                                            {[animal.raca, animal.sexo, animal.categoria, animal.registro, animal.pesoAtual !== null ? `${animal.pesoAtual} kg` : null, animal.selectionDecision === 'DISCARD' ? 'Descarte' : null]
                                                                .filter(Boolean)
                                                                .join(' · ') || 'Sem dados complementares'}
                                                        </span>
                                                    </span>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {animalsError && (
                                <p className="text-xs text-[var(--eixo-danger)]">{animalsError}</p>
                            )}

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-[var(--eixo-text)]">Animais neste lote</h4>
                                    <span className="text-xs text-[var(--eixo-text-muted)]">{lotAnimals.length} animal(is)</span>
                                </div>
                                {isLoadingAnimals ? (
                                    <p className="text-sm text-[var(--eixo-text-muted)]">Carregando animais...</p>
                                ) : lotAnimals.length === 0 ? (
                                    <p className="text-sm text-[var(--eixo-text-muted)]">
                                        Nenhum animal neste lote ainda. Use os filtros acima para adicionar.
                                    </p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {lotAnimals.map((animal) => (
                                            <div
                                                key={animal.id}
                                                className="flex items-center justify-between rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5"
                                            >
                                                <div>
                                                    <p className="text-sm font-semibold text-[var(--eixo-text)]">
                                                        {animal.identificacao || animal.brinco}
                                                    </p>
                                                    <p className="text-xs text-[var(--eixo-text-muted)]">
                                                        {[animal.raca, animal.sexo, animal.categoria].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveAnimal(animal.id)}
                                                    className="rounded-lg border border-[#efc2ba] bg-[#fff2ef] px-2.5 py-1 text-xs font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[#f7ddd7]"
                                                >
                                                    Remover
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ABA: Nutrição */}
                    {activeTab === 'nutrition' && (
                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm text-[var(--eixo-text-muted)]">
                            {isLoadingNutrition ? (
                                <span>Carregando plano...</span>
                            ) : nutritionError ? (
                                <span className="text-[var(--eixo-danger)]">{nutritionError}</span>
                            ) : planName ? (
                                <div className="space-y-1">
                                    <div className="font-semibold text-[var(--eixo-text)]">{planName}</div>
                                    {planPhase && (
                                        <div className="text-xs text-[var(--eixo-text-muted)]">Fase: {planPhase}</div>
                                    )}
                                    {planMeta !== null && (
                                        <div className="text-xs text-[var(--eixo-text-muted)]">Meta GMD: {planMeta.toFixed(2)} kg</div>
                                    )}
                                </div>
                            ) : (
                                <span>Sem plano ativo para este lote.</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                @keyframes scale-in {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default LotDetailModal;
