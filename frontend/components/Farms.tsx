import React, { useEffect, useRef, useState } from 'react';
import FarmRegistrationForm from './FarmRegistrationForm';
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
}

const Farms: React.FC<FarmsProps> = ({ farms, onFarmCreated, onFarmUpdated, onFarmDeleted, openForm, onFormOpened, onFormClosed }) => {
    const [showForm, setShowForm] = useState(false);
    const [focusOnForm, setFocusOnForm] = useState(false);
    const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
    const [farmToDelete, setFarmToDelete] = useState<Farm | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const formRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (openForm) {
            setShowForm(true);
            setFocusOnForm(true);
            onFormOpened?.();
        }
    }, [openForm, onFormOpened]);

    const handleToggleForm = () => {
        setEditingFarm(null);
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

    return (
        <div className="space-y-6">

            {/* Modal de confirmação de exclusão */}
            {farmToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm"
                        onClick={handleDeleteCancel}
                    />
                    <div className="relative w-full max-w-md rounded-3xl border border-[#d7cab3] bg-[#fffaf1] p-8 shadow-2xl">
                        <h2 className="text-xl font-bold text-[#2f3a2d]">Excluir fazenda</h2>
                        <p className="mt-3 text-sm leading-relaxed text-[#6d6558]">
                            Tem certeza que deseja excluir a fazenda{' '}
                            <span className="font-semibold text-[#2f3a2d]">"{farmToDelete.name}"</span>?
                            Essa ação não pode ser desfeita.
                        </p>

                        {deleteError && (
                            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                                {deleteError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleDeleteCancel}
                                disabled={isDeleting}
                                className="rounded-2xl border border-[#c7b59b] bg-[#f3ebde] px-5 py-2.5 text-sm font-semibold text-[#5f5648] transition-colors hover:bg-[#eadfcd] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isDeleting ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="rounded-[24px] border border-[#d7cab3] bg-[#fbf7ef] p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-[24px] font-semibold text-[#2f3a2d]">Fazendas e Pastos</h1>
                        <p className="mt-1 text-sm text-[#6d6558]">Gerencie as fazendas cadastradas e a base territorial da operação.</p>
                    </div>
                    {!showForm && (
                        <button
                            type="button"
                            onClick={handleToggleForm}
                            className="inline-flex items-center rounded-2xl border border-[#8a734f] bg-[#9d7d4d] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#8f7144]"
                        >
                            <PlusIcon />
                            <span className="ml-2">Adicionar fazenda</span>
                        </button>
                    )}
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

            <div className="overflow-hidden rounded-[24px] border border-[#d7cab3] bg-[#fffaf1]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-[#6d6558]">
                        <thead className="bg-[#f1e7d8] text-[11px] uppercase tracking-[0.14em] text-[#74644e]">
                            <tr>
                                <th scope="col" className="px-6 py-3">Nome da Fazenda</th>
                                <th scope="col" className="px-6 py-3">Cidade</th>
                                <th scope="col" className="px-6 py-3">UF</th>
                                <th scope="col" className="px-6 py-3">Tamanho (ha)</th>
                                <th scope="col" className="px-6 py-3">Pastos</th>
                                <th scope="col" className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {farms.length === 0 && !showForm ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-[#7d7467]">
                                        <p className="text-base font-semibold text-[#2f3a2d]">
                                            Comece cadastrando uma fazenda
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                farms.map((farm) => (
                                    <tr key={farm.id} className="border-b border-[#eadfcf] bg-[#fffaf1] transition-colors duration-150 hover:bg-[#f7f0e3]">
                                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-bold text-[#2f3a2d]">
                                            {farm.name}
                                        </th>
                                        <td className="px-6 py-4">{farm.city?.split('/')[0]?.trim() || '—'}</td>
                                        <td className="px-6 py-4">{farm.city?.split('/')[1]?.trim() || '—'}</td>
                                        <td className="px-6 py-4">{farm.size}</td>
                                        <td className="px-6 py-4">{farm.paddocks?.length ?? 0}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(farm)}
                                                    className="rounded-xl border border-[#c7b59b] bg-[#f3ebde] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#5f5648] transition-colors hover:bg-[#eadfcd]"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteRequest(farm)}
                                                    className="rounded-xl border border-[#d9b6a8] bg-[#fbede8] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#8c4d39] transition-colors hover:bg-[#f5ddd4]"
                                                >
                                                    Excluir
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Farms;
