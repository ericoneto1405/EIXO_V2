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
                    <div className="relative w-full max-w-md rounded-3xl border border-[#e7e5e4] bg-white p-8 shadow-2xl">
                        <h2 className="text-xl font-bold text-[#1c1917]">Excluir fazenda</h2>
                        <p className="mt-3 text-sm leading-relaxed text-[#78716c]">
                            Tem certeza que deseja excluir a fazenda{' '}
                            <span className="font-semibold text-[#1c1917]">"{farmToDelete.name}"</span>?
                            Essa ação não pode ser desfeita.
                        </p>

                        {deleteError && (
                            <p className="mt-4 rounded-2xl bg-[#fbede8] px-4 py-3 text-sm text-[#8c4d39]">
                                {deleteError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleDeleteCancel}
                                disabled={isDeleting}
                                className="rounded-2xl border border-[#e7e5e4] bg-[#f5f5f4] px-5 py-2.5 text-sm font-semibold text-[#44403c] transition-colors hover:bg-[#ece9e6] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="rounded-2xl border border-[#d9b6a8] bg-[#fbede8] px-5 py-2.5 text-sm font-semibold text-[#8c4d39] transition-colors hover:bg-[#f5ddd4] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isDeleting ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="rounded-3xl border border-[#e7e5e4] bg-white px-6 py-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#f0d5ca] bg-[#faeee8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a2a14]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#a8442a]" />
                            Estrutura da Fazenda
                        </div>
                        <h1 className="font-brand text-2xl font-extrabold leading-tight text-[#1c1917]">Fazendas e Pastos</h1>
                        <p className="mt-1 text-sm leading-relaxed text-[#78716c]">Gerencie as fazendas cadastradas e a base territorial da operação.</p>
                    </div>
                    {!showForm && (
                        <button
                            type="button"
                            onClick={handleToggleForm}
                            className="inline-flex items-center rounded-2xl border border-[#a8442a] bg-[#a8442a] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#933a22]"
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

            {farms.length > 0 && (
                <div className="overflow-hidden rounded-[24px] border border-[#e7e5e4] bg-white">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-[#78716c]">
                            <thead className="bg-[#f5f5f4] text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">
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
                                {farms.map((farm) => (
                                    <tr key={farm.id} className="border-b border-[#e7e5e4] bg-white transition-colors duration-150 hover:bg-[#f5f5f4]">
                                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-bold text-[#1c1917]">
                                            <div className="flex items-center gap-2">
                                                {farm.name}
                                                {farm.lat && farm.lng ? (
                                                    <span title="Localização cadastrada" className="text-[#16a34a]">
                                                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                                                    </span>
                                                ) : (
                                                    <span title="Localização não cadastrada" className="text-[#c4b8a5]">
                                                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                                                    </span>
                                                )}
                                            </div>
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
                                                    className="rounded-xl border border-[#e7e5e4] bg-[#f5f5f4] px-3 py-1.5 text-xs font-semibold text-[#44403c] transition-colors hover:bg-[#ece9e6]"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteRequest(farm)}
                                                    className="rounded-xl border border-[#d9b6a8] bg-[#fbede8] px-3 py-1.5 text-xs font-semibold text-[#8c4d39] transition-colors hover:bg-[#f5ddd4]"
                                                >
                                                    Excluir
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Card de próximo passo — aparece quando alguma fazenda tem 0 pastos */}
            {farms.length > 0 && farms.some(f => (f.paddocks?.length ?? 0) === 0) && (
                <div className="mt-4 flex items-start gap-4 rounded-[20px] border border-[#e7e5e4] bg-white px-5 py-4">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#f5f5f4]">
                        <svg className="h-4 w-4 text-[#1c1917]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1c1917]">Cadastre os pastos da sua fazenda</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[#78716c]">
                            Com os pastos cadastrados você consegue alocar animais, acompanhar lotação e organizar o manejo.
                        </p>
                    </div>
                    <div className="flex-shrink-0 self-center">
                        <span className="text-xs font-semibold text-[#1c1917]">Mapa da Fazenda →</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Farms;
