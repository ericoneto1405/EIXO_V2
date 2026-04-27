import React, { useCallback, useEffect, useState } from 'react';
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
    const [addAnimalId, setAddAnimalId] = useState('');
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
        setEditNotes(lot.notes || '');
        setIsEditing(false);
        setShowDeleteConfirm(false);
        setActiveTab('animals');
        setDeleteError(null);
        setEditError(null);
        setAddAnimalId('');

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

    const handleAddAnimal = async () => {
        if (!addAnimalId) return;
        setIsAddingAnimal(true);
        setAnimalsError(null);
        try {
            await updateAnimalLot(addAnimalId, resolvedMode, lot.id);
            setAddAnimalId('');
            await loadAnimals();
            onLotUpdated?.();
        } catch (err: any) {
            setAnimalsError(err?.message || 'Erro ao adicionar animal.');
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

    const tabClass = (tab: ModalTab) =>
        `${activeTab === tab
            ? 'border-[#a8442a] text-[#a8442a] font-semibold'
            : 'border-transparent text-[#78716c] hover:text-[#a8442a] hover:border-[#e7e5e4]'
        } whitespace-nowrap py-3 px-1 border-b-2 text-sm transition-colors`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="flex w-full max-w-lg flex-col rounded-2xl border border-[#e7e5e4] bg-white shadow-2xl"
                style={{ maxHeight: '90vh', animation: 'scale-in 0.18s ease-out forwards' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex flex-shrink-0 items-center justify-between border-b border-[#e7e5e4] px-6 py-5">
                    <div className="flex-1 min-w-0 mr-3">
                        <p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#78716c]">
                            Lote / Grupo
                        </p>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full border-b-2 border-[#a8442a] bg-transparent font-brand text-xl font-extrabold text-[#1c1917] outline-none"
                                autoFocus
                            />
                        ) : (
                            <h3 className="font-brand text-xl font-extrabold text-[#1c1917] truncate">
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
                                    className="rounded-xl border border-[#e7e5e4] px-3 py-1.5 text-xs font-semibold text-[#78716c] transition-colors hover:bg-[#f5f5f4]"
                                >
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="rounded-xl border border-[#d9b6a8] bg-[#fef2f2] px-3 py-1.5 text-xs font-semibold text-[#8c4d39] transition-colors hover:bg-[#f5ddd8]"
                                >
                                    Excluir
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Fechar"
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#e7e5e4] bg-[#f5f5f4] text-[#78716c] transition-colors hover:bg-[#f5f5f4]"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </header>

                {/* Confirmação de exclusão */}
                {showDeleteConfirm && (
                    <div className="flex-shrink-0 border-b border-[#e7e5e4] bg-[#fef2f2] px-6 py-4">
                        <p className="mb-3 text-sm font-medium text-[#8c4d39]">
                            Excluir este lote? Os animais são mantidos — apenas o agrupamento é removido.
                        </p>
                        {deleteError && <p className="mb-2 text-xs text-[#8c4d39]">{deleteError}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="rounded-xl bg-[#8c4d39] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a3f2d] disabled:opacity-60"
                            >
                                {isDeleting ? 'Excluindo...' : 'Confirmar exclusão'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                                className="rounded-xl border border-[#e7e5e4] px-4 py-2 text-sm font-semibold text-[#78716c] transition-colors hover:bg-[#f5f5f4]"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Modo edição */}
                {isEditing && (
                    <div className="flex-shrink-0 space-y-3 border-b border-[#e7e5e4] px-6 py-4">
                        <div>
                            <label className="text-xs font-medium text-[#78716c]">Observações</label>
                            <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                rows={2}
                                className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#1c1917] placeholder-[#c4b5a0] focus:border-[#a8442a] focus:outline-none"
                                placeholder="Opcional"
                            />
                        </div>
                        {editError && <p className="text-xs text-[#8c4d39]">{editError}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={isSavingEdit}
                                className="rounded-xl bg-[#a8442a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#933a22] disabled:opacity-60"
                            >
                                {isSavingEdit ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIsEditing(false); setEditError(null); }}
                                className="rounded-xl border border-[#e7e5e4] px-4 py-2 text-sm font-semibold text-[#78716c] transition-colors hover:bg-[#f5f5f4]"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Abas */}
                <div className="flex-shrink-0 border-b border-[#e7e5e4] px-6">
                    <nav className="-mb-px flex gap-4">
                        <button onClick={() => setActiveTab('animals')} className={tabClass('animals')}>
                            Animais
                            {lotAnimals.length > 0 && (
                                <span className="ml-1.5 rounded-full bg-[#f5f5f4] px-1.5 py-0.5 text-xs font-bold text-[#78716c]">
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
                            {/* Adicionar animal */}
                            <div className="flex gap-2">
                                <select
                                    value={addAnimalId}
                                    onChange={(e) => setAddAnimalId(e.target.value)}
                                    className="flex-1 rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#1c1917] focus:border-[#a8442a] focus:outline-none"
                                >
                                    <option value="">Selecionar animal para adicionar...</option>
                                    {availableToAdd.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.identificacao || a.brinco}
                                            {a.raca ? ` · ${a.raca}` : ''}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={handleAddAnimal}
                                    disabled={!addAnimalId || isAddingAnimal}
                                    className="rounded-xl bg-[#a8442a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#933a22] disabled:opacity-50"
                                >
                                    {isAddingAnimal ? '...' : 'Adicionar'}
                                </button>
                            </div>

                            {animalsError && (
                                <p className="text-xs text-[#8c4d39]">{animalsError}</p>
                            )}

                            {isLoadingAnimals ? (
                                <p className="text-sm text-[#78716c]">Carregando animais...</p>
                            ) : lotAnimals.length === 0 ? (
                                <p className="text-sm text-[#78716c]">
                                    Nenhum animal neste lote ainda. Use o seletor acima para adicionar.
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    {lotAnimals.map((animal) => (
                                        <div
                                            key={animal.id}
                                            className="flex items-center justify-between rounded-xl border border-[#e7e5e4] bg-white px-4 py-2.5"
                                        >
                                            <div>
                                                <p className="text-sm font-semibold text-[#1c1917]">
                                                    {animal.identificacao || animal.brinco}
                                                </p>
                                                <p className="text-xs text-[#78716c]">
                                                    {[animal.raca, animal.sexo].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAnimal(animal.id)}
                                                className="rounded-lg border border-[#d9b6a8] bg-[#fef2f2] px-2.5 py-1 text-xs font-semibold text-[#8c4d39] transition-colors hover:bg-[#f5ddd8]"
                                            >
                                                Remover
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ABA: Nutrição */}
                    {activeTab === 'nutrition' && (
                        <div className="rounded-xl border border-[#e7e5e4] bg-white px-4 py-3 text-sm text-[#78716c]">
                            {isLoadingNutrition ? (
                                <span>Carregando plano...</span>
                            ) : nutritionError ? (
                                <span className="text-[#8c4d39]">{nutritionError}</span>
                            ) : planName ? (
                                <div className="space-y-1">
                                    <div className="font-semibold text-[#1c1917]">{planName}</div>
                                    {planPhase && (
                                        <div className="text-xs text-[#78716c]">Fase: {planPhase}</div>
                                    )}
                                    {planMeta !== null && (
                                        <div className="text-xs text-[#78716c]">Meta GMD: {planMeta.toFixed(2)} kg</div>
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
