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

    const handleDelete = async (farm: Farm) => {
        const confirmed = window.confirm(`Excluir a fazenda "${farm.name}"?`);
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(buildApiUrl(`/farms/${farm.id}`), {
                method: 'DELETE',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                window.alert(payload?.message || 'Não foi possível excluir a fazenda.');
                return;
            }
            onFarmDeleted?.(farm.id);
        } catch (error) {
            console.error(error);
            window.alert('Não foi possível excluir a fazenda.');
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
            <div className="rounded-[24px] border border-[#d7cab3] bg-[#fbf7ef] p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-[24px] font-semibold text-[#2f3a2d]">Fazendas e Setores</h1>
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
                                <th scope="col" className="px-6 py-3">Cidade/UF</th>
                                <th scope="col" className="px-6 py-3">Tamanho (ha)</th>
                                <th scope="col" className="px-6 py-3">Divisões</th>
                                <th scope="col" className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {farms.length === 0 && !showForm ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-[#7d7467]">
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
                                        <td className="px-6 py-4">{farm.city}</td>
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
                                                    onClick={() => handleDelete(farm)}
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
