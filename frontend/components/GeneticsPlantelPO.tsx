import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../api';
import type { Paddock } from '../types';
import HerdModule from './HerdModule';

type AnimalSexo = 'MACHO' | 'FEMEA';
type EmbryoTechnique = 'FIV' | 'TE';
type SemenMoveType = 'IN' | 'OUT' | 'USE' | 'ADJUST';
type EmbryoMoveType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';

type TabKey = 'herd' | 'semen' | 'embryos';

interface PoAnimal {
    id: string;
    farmId: string;
    brinco?: string | null;
    nome: string;
    raca: string;
    sexo: AnimalSexo;
    dataNascimento?: string | null;
    registro?: string | null;
    categoria?: string | null;
    observacoes?: string | null;
    currentPaddockId?: string | null;
}

interface SemenBatch {
    id: string;
    farmId: string;
    bullPoAnimalId?: string | null;
    bullName?: string | null;
    bullRegistry?: string | null;
    fornecedor?: string | null;
    lote: string;
    dataColeta?: string | null;
    dosesTotal: number;
    dosesDisponiveis: number;
    localArmazenamento?: string | null;
    observacoes?: string | null;
    bullPoAnimal?: { id: string; brinco?: string | null; nome: string; registro?: string | null } | null;
}

interface EmbryoBatch {
    id: string;
    farmId: string;
    donorPoAnimalId?: string | null;
    donorName?: string | null;
    donorRegistry?: string | null;
    sirePoAnimalId?: string | null;
    sireName?: string | null;
    sireRegistry?: string | null;
    tecnica: EmbryoTechnique;
    estagio?: string | null;
    qualidade?: string | null;
    lote: string;
    quantidadeTotal: number;
    quantidadeDisponivel: number;
    localArmazenamento?: string | null;
    observacoes?: string | null;
    donorPoAnimal?: { id: string; brinco?: string | null; nome: string; registro?: string | null } | null;
    sirePoAnimal?: { id: string; brinco?: string | null; nome: string; registro?: string | null } | null;
}

interface GeneticsPlantelPOProps {
    farmId?: string | null;
    mode?: 'full' | 'resources';
}

const GeneticsPlantelPO: React.FC<GeneticsPlantelPOProps> = ({ farmId, mode = 'full' }) => {
    const availableTabs: TabKey[] = mode === 'resources' ? ['semen', 'embryos'] : ['herd', 'semen', 'embryos'];
    const [activeTab, setActiveTab] = useState<TabKey>(availableTabs[0]);
    const [poAnimals, setPoAnimals] = useState<PoAnimal[]>([]);
    const [semenBatches, setSemenBatches] = useState<SemenBatch[]>([]);
    const [embryoBatches, setEmbryoBatches] = useState<EmbryoBatch[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [paddocks, setPaddocks] = useState<Paddock[]>([]);

    useEffect(() => {
        setActiveTab(availableTabs[0]);
    }, [mode]);

    const [searchSemen, setSearchSemen] = useState('');
    const [searchEmbryos, setSearchEmbryos] = useState('');

    const [isAnimalModalOpen, setIsAnimalModalOpen] = useState(false);
    const [editingAnimal] = useState<PoAnimal | null>(null);
    const [animalForm, setAnimalForm] = useState({
        brinco: '',
        nome: '',
        raca: '',
        sexo: 'FEMEA',
        dataNascimento: '',
        registro: '',
        categoria: '',
        observacoes: '',
        paddockId: '',
        paddockStartAt: '',
    });
    const [animalError, setAnimalError] = useState<string | null>(null);
    const [isSavingAnimal, setIsSavingAnimal] = useState(false);

    const [isSemenModalOpen, setIsSemenModalOpen] = useState(false);
    const [editingSemen, setEditingSemen] = useState<SemenBatch | null>(null);
    const [semenForm, setSemenForm] = useState({
        bullPoAnimalId: '',
        bullName: '',
        bullRegistry: '',
        fornecedor: '',
        lote: '',
        dataColeta: '',
        dosesTotal: '',
        dosesDisponiveis: '',
        localArmazenamento: '',
        observacoes: '',
    });
    const [semenError, setSemenError] = useState<string | null>(null);
    const [isSavingSemen, setIsSavingSemen] = useState(false);

    const [isEmbryoModalOpen, setIsEmbryoModalOpen] = useState(false);
    const [editingEmbryo, setEditingEmbryo] = useState<EmbryoBatch | null>(null);
    const [embryoForm, setEmbryoForm] = useState({
        donorPoAnimalId: '',
        donorName: '',
        donorRegistry: '',
        sirePoAnimalId: '',
        sireName: '',
        sireRegistry: '',
        tecnica: 'FIV',
        estagio: '',
        qualidade: '',
        lote: '',
        quantidadeTotal: '',
        quantidadeDisponivel: '',
        localArmazenamento: '',
        observacoes: '',
    });
    const [embryoError, setEmbryoError] = useState<string | null>(null);
    const [isSavingEmbryo, setIsSavingEmbryo] = useState(false);

    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [moveTarget, setMoveTarget] = useState<{ type: 'semen' | 'embryo'; batchId: string } | null>(null);
    const [moveForm, setMoveForm] = useState({
        date: new Date().toISOString().slice(0, 10),
        qty: '',
        type: 'IN',
        notes: '',
    });
    const [moveError, setMoveError] = useState<string | null>(null);
    const [isSavingMove, setIsSavingMove] = useState(false);

    const resetSemenForm = () => {
        setSemenForm({
            bullPoAnimalId: '',
            bullName: '',
            bullRegistry: '',
            fornecedor: '',
            lote: '',
            dataColeta: '',
            dosesTotal: '',
            dosesDisponiveis: '',
            localArmazenamento: '',
            observacoes: '',
        });
    };

    const resetEmbryoForm = () => {
        setEmbryoForm({
            donorPoAnimalId: '',
            donorName: '',
            donorRegistry: '',
            sirePoAnimalId: '',
            sireName: '',
            sireRegistry: '',
            tecnica: 'FIV',
            estagio: '',
            qualidade: '',
            lote: '',
            quantidadeTotal: '',
            quantidadeDisponivel: '',
            localArmazenamento: '',
            observacoes: '',
        });
    };

    const loadResources = useCallback(async () => {
        if (!farmId) {
            setPoAnimals([]);
            setSemenBatches([]);
            setEmbryoBatches([]);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const [animalsRes, semenRes, embryoRes] = await Promise.all([
                fetch(buildApiUrl(`/po/animals?farmId=${farmId}`), { credentials: 'include' }),
                fetch(buildApiUrl(`/po/semen?farmId=${farmId}`), { credentials: 'include' }),
                fetch(buildApiUrl(`/po/embryos?farmId=${farmId}`), { credentials: 'include' }),
            ]);
            const animalsPayload = await animalsRes.json().catch(() => ({}));
            const semenPayload = await semenRes.json().catch(() => ({}));
            const embryoPayload = await embryoRes.json().catch(() => ({}));

            if (!animalsRes.ok || !semenRes.ok || !embryoRes.ok) {
                setLoadError('Não foi possível carregar o Plantel P.O.');
                return;
            }

            setPoAnimals(animalsPayload.animals || []);
            setSemenBatches(semenPayload.batches || []);
            setEmbryoBatches(embryoPayload.batches || []);
        } catch (error) {
            console.error(error);
            setLoadError('Não foi possível carregar o Plantel P.O.');
        } finally {
            setIsLoading(false);
        }
    }, [farmId]);

    useEffect(() => {
        const shouldLoadResources = mode === 'resources' || activeTab !== 'herd';
        if (!shouldLoadResources) {
            return;
        }
        loadResources();
    }, [activeTab, loadResources, mode]);

    useEffect(() => {
        let isActive = true;
        const loadPaddocks = async () => {
            if (!farmId) {
                if (isActive) {
                    setPaddocks([]);
                }
                return;
            }
            try {
                const response = await fetch(buildApiUrl(`/pastos?farmId=${farmId}`), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.message || 'Erro ao carregar pastos.');
                }
                if (isActive) {
                    setPaddocks(payload.items || []);
                }
            } catch (error) {
                console.error(error);
                if (isActive) {
                    setPaddocks([]);
                }
            }
        };
        loadPaddocks();
        return () => {
            isActive = false;
        };
    }, [farmId]);

    const filteredSemen = useMemo(() => {
        if (!searchSemen.trim()) {
            return semenBatches;
        }
        const term = searchSemen.trim().toLowerCase();
        return semenBatches.filter((batch) => {
            const displayName = batch.bullPoAnimal?.nome || batch.bullName || '';
            return [batch.lote, displayName, batch.bullRegistry]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term));
        });
    }, [semenBatches, searchSemen]);

    const filteredEmbryos = useMemo(() => {
        if (!searchEmbryos.trim()) {
            return embryoBatches;
        }
        const term = searchEmbryos.trim().toLowerCase();
        return embryoBatches.filter((batch) => {
            const donor = batch.donorPoAnimal?.nome || batch.donorName || '';
            const sire = batch.sirePoAnimal?.nome || batch.sireName || '';
            return [batch.lote, donor, sire]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term));
        });
    }, [embryoBatches, searchEmbryos]);

    const openSemenModal = (batch?: SemenBatch) => {
        if (batch) {
            setEditingSemen(batch);
            setSemenForm({
                bullPoAnimalId: batch.bullPoAnimalId || '',
                bullName: batch.bullName || '',
                bullRegistry: batch.bullRegistry || '',
                fornecedor: batch.fornecedor || '',
                lote: batch.lote,
                dataColeta: batch.dataColeta ? batch.dataColeta.slice(0, 10) : '',
                dosesTotal: String(batch.dosesTotal),
                dosesDisponiveis: String(batch.dosesDisponiveis),
                localArmazenamento: batch.localArmazenamento || '',
                observacoes: batch.observacoes || '',
            });
        } else {
            setEditingSemen(null);
            resetSemenForm();
        }
        setSemenError(null);
        setIsSemenModalOpen(true);
    };

    const openEmbryoModal = (batch?: EmbryoBatch) => {
        if (batch) {
            setEditingEmbryo(batch);
            setEmbryoForm({
                donorPoAnimalId: batch.donorPoAnimalId || '',
                donorName: batch.donorName || '',
                donorRegistry: batch.donorRegistry || '',
                sirePoAnimalId: batch.sirePoAnimalId || '',
                sireName: batch.sireName || '',
                sireRegistry: batch.sireRegistry || '',
                tecnica: batch.tecnica,
                estagio: batch.estagio || '',
                qualidade: batch.qualidade || '',
                lote: batch.lote,
                quantidadeTotal: String(batch.quantidadeTotal),
                quantidadeDisponivel: String(batch.quantidadeDisponivel),
                localArmazenamento: batch.localArmazenamento || '',
                observacoes: batch.observacoes || '',
            });
        } else {
            setEditingEmbryo(null);
            resetEmbryoForm();
        }
        setEmbryoError(null);
        setIsEmbryoModalOpen(true);
    };

    const openMoveModal = (type: 'semen' | 'embryo', batchId: string) => {
        setMoveTarget({ type, batchId });
        setMoveForm({
            date: new Date().toISOString().slice(0, 10),
            qty: '',
            type: 'IN',
            notes: '',
        });
        setMoveError(null);
        setIsMoveModalOpen(true);
    };

    const handleSaveAnimal = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) {
            return;
        }
        if (!animalForm.paddockId) {
            setAnimalError('Selecione o pasto do animal.');
            return;
        }
        setIsSavingAnimal(true);
        setAnimalError(null);
        try {
            const payload = {
                farmId,
                ...animalForm,
            };
            const response = await fetch(
                editingAnimal ? buildApiUrl(`/po/animals/${editingAnimal.id}`) : buildApiUrl('/po/animals'),
                {
                    method: editingAnimal ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setAnimalError(data?.message || 'Erro ao salvar animal P.O.');
                return;
            }
            setIsAnimalModalOpen(false);
            await loadResources();
        } catch (error) {
            console.error(error);
            setAnimalError('Erro ao salvar animal P.O.');
        } finally {
            setIsSavingAnimal(false);
        }
    };

    const handleSaveSemen = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) {
            return;
        }
        setIsSavingSemen(true);
        setSemenError(null);
        try {
            const payload = {
                farmId,
                ...semenForm,
            };
            const response = await fetch(
                editingSemen ? buildApiUrl(`/po/semen/${editingSemen.id}`) : buildApiUrl('/po/semen'),
                {
                    method: editingSemen ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSemenError(data?.message || 'Erro ao salvar sêmen.');
                return;
            }
            setIsSemenModalOpen(false);
            await loadResources();
        } catch (error) {
            console.error(error);
            setSemenError('Erro ao salvar sêmen.');
        } finally {
            setIsSavingSemen(false);
        }
    };

    const handleSaveEmbryo = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) {
            return;
        }
        setIsSavingEmbryo(true);
        setEmbryoError(null);
        try {
            const payload = {
                farmId,
                ...embryoForm,
            };
            const response = await fetch(
                editingEmbryo ? buildApiUrl(`/po/embryos/${editingEmbryo.id}`) : buildApiUrl('/po/embryos'),
                {
                    method: editingEmbryo ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload),
                },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setEmbryoError(data?.message || 'Erro ao salvar embriões.');
                return;
            }
            setIsEmbryoModalOpen(false);
            await loadResources();
        } catch (error) {
            console.error(error);
            setEmbryoError('Erro ao salvar embriões.');
        } finally {
            setIsSavingEmbryo(false);
        }
    };

    const handleMove = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!moveTarget) {
            return;
        }
        setIsSavingMove(true);
        setMoveError(null);
        try {
            const payload = {
                date: moveForm.date,
                qty: Number(moveForm.qty),
                type: moveForm.type,
                notes: moveForm.notes,
            };
            const url = moveTarget.type === 'semen'
                ? buildApiUrl(`/po/semen/${moveTarget.batchId}/move`)
                : buildApiUrl(`/po/embryos/${moveTarget.batchId}/move`);
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMoveError(data?.message || 'Erro ao movimentar estoque.');
                return;
            }
            setIsMoveModalOpen(false);
            await loadResources();
        } catch (error) {
            console.error(error);
            setMoveError('Erro ao movimentar estoque.');
        } finally {
            setIsSavingMove(false);
        }
    };

    const handleDelete = async (type: 'animal' | 'semen' | 'embryo', id: string) => {
        if (!window.confirm('Deseja realmente excluir?')) {
            return;
        }
        try {
            const url = type === 'animal'
                ? buildApiUrl(`/po/animals/${id}`)
                : type === 'semen'
                    ? buildApiUrl(`/po/semen/${id}`)
                    : buildApiUrl(`/po/embryos/${id}`);
            await fetch(url, { method: 'DELETE', credentials: 'include' });
            await loadResources();
        } catch (error) {
            console.error(error);
        }
    };

    const renderTabs = () => (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
            {[
                { key: 'herd', label: 'Rebanho' },
                { key: 'semen', label: 'Sêmen' },
                { key: 'embryos', label: 'Embriões' },
            ]
                .filter((tab) => availableTabs.includes(tab.key as TabKey))
                .map((tab) => (
                <button
                    key={tab.key}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        activeTab === tab.key
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                >
                    {tab.label}
                </button>
                ))}
        </div>
    );

    const showResourceStatus = mode === 'resources' || activeTab !== 'herd';

    return (
        <div className="bg-white dark:bg-dark-card rounded-xl shadow-lg p-8">
            {mode === 'full' && (
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Plantel P.O.</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Animais P.O. e estoques de sêmen e embriões.</p>
                    </div>
                    <div className="text-sm text-gray-500">{showResourceStatus && isLoading ? 'Carregando...' : ''}</div>
                </div>
            )}

            {renderTabs()}

            {showResourceStatus && loadError && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                    {loadError}
                </div>
            )}

            {activeTab === 'herd' && (
                <div className="mt-6">
                    <HerdModule farmId={farmId} mode="PO" />
                </div>
            )}

            {activeTab === 'semen' && (
                <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <input
                            className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Buscar por lote ou reprodutor"
                            value={searchSemen}
                            onChange={(event) => setSearchSemen(event.target.value)}
                        />
                        <button
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                            onClick={() => openSemenModal()}
                        >
                            Adicionar
                        </button>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs uppercase bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2">Lote</th>
                                    <th className="px-4 py-2">Reprodutor</th>
                                    <th className="px-4 py-2">Disponível/Total</th>
                                    <th className="px-4 py-2">Local</th>
                                    <th className="px-4 py-2">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSemen.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-4 text-center text-gray-400">
                                            Nenhum lote de sêmen cadastrado.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSemen.map((batch) => (
                                        <tr key={batch.id} className="border-b border-gray-100">
                                            <td className="px-4 py-2">{batch.lote}</td>
                                            <td className="px-4 py-2">{batch.bullPoAnimal?.nome || batch.bullName || '-'}</td>
                                            <td className="px-4 py-2">{batch.dosesDisponiveis}/{batch.dosesTotal}</td>
                                            <td className="px-4 py-2">{batch.localArmazenamento || '-'}</td>
                                            <td className="px-4 py-2">
                                                <div className="flex gap-2">
                                                    <button
                                                        className="text-xs font-semibold text-primary"
                                                        onClick={() => openSemenModal(batch)}
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        className="text-xs font-semibold text-amber-600"
                                                        onClick={() => openMoveModal('semen', batch.id)}
                                                    >
                                                        Movimentar
                                                    </button>
                                                    <button
                                                        className="text-xs font-semibold text-rose-600"
                                                        onClick={() => handleDelete('semen', batch.id)}
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
            )}

            {activeTab === 'embryos' && (
                <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <input
                            className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="Buscar por lote, doadora ou reprodutor"
                            value={searchEmbryos}
                            onChange={(event) => setSearchEmbryos(event.target.value)}
                        />
                        <button
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                            onClick={() => openEmbryoModal()}
                        >
                            Adicionar
                        </button>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs uppercase bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2">Lote</th>
                                    <th className="px-4 py-2">Doadora</th>
                                    <th className="px-4 py-2">Reprodutor</th>
                                    <th className="px-4 py-2">Técnica</th>
                                    <th className="px-4 py-2">Disponível/Total</th>
                                    <th className="px-4 py-2">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmbryos.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-4 text-center text-gray-400">
                                            Nenhum lote de embriões cadastrado.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmbryos.map((batch) => (
                                        <tr key={batch.id} className="border-b border-gray-100">
                                            <td className="px-4 py-2">{batch.lote}</td>
                                            <td className="px-4 py-2">{batch.donorPoAnimal?.nome || batch.donorName || '-'}</td>
                                            <td className="px-4 py-2">{batch.sirePoAnimal?.nome || batch.sireName || '-'}</td>
                                            <td className="px-4 py-2">{batch.tecnica}</td>
                                            <td className="px-4 py-2">{batch.quantidadeDisponivel}/{batch.quantidadeTotal}</td>
                                            <td className="px-4 py-2">
                                                <div className="flex gap-2">
                                                    <button
                                                        className="text-xs font-semibold text-primary"
                                                        onClick={() => openEmbryoModal(batch)}
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        className="text-xs font-semibold text-amber-600"
                                                        onClick={() => openMoveModal('embryo', batch.id)}
                                                    >
                                                        Movimentar
                                                    </button>
                                                    <button
                                                        className="text-xs font-semibold text-rose-600"
                                                        onClick={() => handleDelete('embryo', batch.id)}
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
            )}

            {isAnimalModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold">{editingAnimal ? 'Editar Animal P.O.' : 'Novo Animal P.O.'}</h3>
                        <form className="mt-4 grid gap-3" onSubmit={handleSaveAnimal}>
                            <input
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Nome"
                                value={animalForm.nome}
                                onChange={(event) => setAnimalForm((prev) => ({ ...prev, nome: event.target.value }))}
                                required
                            />
                            <input
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Raça"
                                value={animalForm.raca}
                                onChange={(event) => setAnimalForm((prev) => ({ ...prev, raca: event.target.value }))}
                                required
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={animalForm.sexo}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, sexo: event.target.value }))}
                                >
                                    <option value="FEMEA">Fêmea</option>
                                    <option value="MACHO">Macho</option>
                                </select>
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Brinco"
                                    value={animalForm.brinco}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, brinco: event.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="date"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={animalForm.dataNascimento}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, dataNascimento: event.target.value }))}
                                />
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Registro"
                                    value={animalForm.registro}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, registro: event.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={animalForm.paddockId}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockId: event.target.value }))}
                                    required
                                >
                                    <option value="">Pasto</option>
                                    {paddocks.length === 0 && (
                                        <option value="" disabled>
                                            Cadastre pastos na fazenda
                                        </option>
                                    )}
                                    {paddocks.map((paddock) => (
                                        <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                                    ))}
                                </select>
                                <input
                                    type="date"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={animalForm.paddockStartAt}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockStartAt: event.target.value }))}
                                />
                            </div>
                            <input
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Categoria"
                                value={animalForm.categoria}
                                onChange={(event) => setAnimalForm((prev) => ({ ...prev, categoria: event.target.value }))}
                            />
                            <textarea
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Observações"
                                value={animalForm.observacoes}
                                onChange={(event) => setAnimalForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                            />
                            {animalError && <div className="text-sm text-rose-600">{animalError}</div>}
                            <div className="flex justify-end gap-2">
                                <button type="button" className="px-4 py-2 text-sm" onClick={() => setIsAnimalModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                                    disabled={isSavingAnimal}
                                >
                                    {isSavingAnimal ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isSemenModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold">{editingSemen ? 'Editar Sêmen' : 'Novo Lote de Sêmen'}</h3>
                        <form className="mt-4 grid gap-3" onSubmit={handleSaveSemen}>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Lote"
                                    value={semenForm.lote}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, lote: event.target.value }))}
                                    required
                                />
                                <input
                                    type="date"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={semenForm.dataColeta}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, dataColeta: event.target.value }))}
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={semenForm.bullPoAnimalId}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, bullPoAnimalId: event.target.value }))}
                                >
                                    <option value="">Reprodutor externo</option>
                                    {poAnimals.filter((animal) => animal.sexo === 'MACHO').map((animal) => (
                                        <option key={animal.id} value={animal.id}>
                                            {animal.nome} {animal.brinco ? `(${animal.brinco})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {semenForm.bullPoAnimalId ? (
                                    <input
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                        placeholder="Registro"
                                        value={semenForm.bullRegistry}
                                        onChange={(event) => setSemenForm((prev) => ({ ...prev, bullRegistry: event.target.value }))}
                                    />
                                ) : (
                                    <input
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                        placeholder="Nome do reprodutor"
                                        value={semenForm.bullName}
                                        onChange={(event) => setSemenForm((prev) => ({ ...prev, bullName: event.target.value }))}
                                        required
                                    />
                                )}
                            </div>
                            {!semenForm.bullPoAnimalId && (
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Registro do reprodutor"
                                    value={semenForm.bullRegistry}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, bullRegistry: event.target.value }))}
                                />
                            )}
                            <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Fornecedor"
                                    value={semenForm.fornecedor}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, fornecedor: event.target.value }))}
                                />
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Local de armazenamento"
                                    value={semenForm.localArmazenamento}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, localArmazenamento: event.target.value }))}
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                    type="number"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Doses totais"
                                    value={semenForm.dosesTotal}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, dosesTotal: event.target.value }))}
                                    required
                                />
                                <input
                                    type="number"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Doses disponíveis"
                                    value={semenForm.dosesDisponiveis}
                                    onChange={(event) => setSemenForm((prev) => ({ ...prev, dosesDisponiveis: event.target.value }))}
                                    required
                                />
                            </div>
                            <textarea
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Observações"
                                value={semenForm.observacoes}
                                onChange={(event) => setSemenForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                            />
                            {semenError && <div className="text-sm text-rose-600">{semenError}</div>}
                            <div className="flex justify-end gap-2">
                                <button type="button" className="px-4 py-2 text-sm" onClick={() => setIsSemenModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                                    disabled={isSavingSemen}
                                >
                                    {isSavingSemen ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isEmbryoModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold">{editingEmbryo ? 'Editar Embriões' : 'Novo Lote de Embriões'}</h3>
                        <form className="mt-4 grid gap-3" onSubmit={handleSaveEmbryo}>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Lote"
                                    value={embryoForm.lote}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, lote: event.target.value }))}
                                    required
                                />
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={embryoForm.tecnica}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, tecnica: event.target.value }))}
                                >
                                    <option value="FIV">FIV</option>
                                    <option value="TE">TE</option>
                                </select>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={embryoForm.donorPoAnimalId}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, donorPoAnimalId: event.target.value }))}
                                >
                                    <option value="">Doadora externa</option>
                                    {poAnimals.filter((animal) => animal.sexo === 'FEMEA').map((animal) => (
                                        <option key={animal.id} value={animal.id}>
                                            {animal.nome} {animal.brinco ? `(${animal.brinco})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {embryoForm.donorPoAnimalId ? (
                                    <input
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                        placeholder="Registro da doadora"
                                        value={embryoForm.donorRegistry}
                                        onChange={(event) => setEmbryoForm((prev) => ({ ...prev, donorRegistry: event.target.value }))}
                                    />
                                ) : (
                                    <input
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                        placeholder="Nome da doadora"
                                        value={embryoForm.donorName}
                                        onChange={(event) => setEmbryoForm((prev) => ({ ...prev, donorName: event.target.value }))}
                                        required
                                    />
                                )}
                            </div>
                            {!embryoForm.donorPoAnimalId && (
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Registro da doadora"
                                    value={embryoForm.donorRegistry}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, donorRegistry: event.target.value }))}
                                />
                            )}
                            <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    value={embryoForm.sirePoAnimalId}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, sirePoAnimalId: event.target.value }))}
                                >
                                    <option value="">Reprodutor externo</option>
                                    {poAnimals.filter((animal) => animal.sexo === 'MACHO').map((animal) => (
                                        <option key={animal.id} value={animal.id}>
                                            {animal.nome} {animal.brinco ? `(${animal.brinco})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {embryoForm.sirePoAnimalId ? (
                                    <input
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                        placeholder="Registro do reprodutor"
                                        value={embryoForm.sireRegistry}
                                        onChange={(event) => setEmbryoForm((prev) => ({ ...prev, sireRegistry: event.target.value }))}
                                    />
                                ) : (
                                    <input
                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                        placeholder="Nome do reprodutor"
                                        value={embryoForm.sireName}
                                        onChange={(event) => setEmbryoForm((prev) => ({ ...prev, sireName: event.target.value }))}
                                        required
                                    />
                                )}
                            </div>
                            {!embryoForm.sirePoAnimalId && (
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Registro do reprodutor"
                                    value={embryoForm.sireRegistry}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, sireRegistry: event.target.value }))}
                                />
                            )}
                            <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Estágio"
                                    value={embryoForm.estagio}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, estagio: event.target.value }))}
                                />
                                <input
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Qualidade"
                                    value={embryoForm.qualidade}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, qualidade: event.target.value }))}
                                />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <input
                                    type="number"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Quantidade total"
                                    value={embryoForm.quantidadeTotal}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, quantidadeTotal: event.target.value }))}
                                    required
                                />
                                <input
                                    type="number"
                                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    placeholder="Quantidade disponível"
                                    value={embryoForm.quantidadeDisponivel}
                                    onChange={(event) => setEmbryoForm((prev) => ({ ...prev, quantidadeDisponivel: event.target.value }))}
                                    required
                                />
                            </div>
                            <input
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Local de armazenamento"
                                value={embryoForm.localArmazenamento}
                                onChange={(event) => setEmbryoForm((prev) => ({ ...prev, localArmazenamento: event.target.value }))}
                            />
                            <textarea
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Observações"
                                value={embryoForm.observacoes}
                                onChange={(event) => setEmbryoForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                            />
                            {embryoError && <div className="text-sm text-rose-600">{embryoError}</div>}
                            <div className="flex justify-end gap-2">
                                <button type="button" className="px-4 py-2 text-sm" onClick={() => setIsEmbryoModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                                    disabled={isSavingEmbryo}
                                >
                                    {isSavingEmbryo ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isMoveModalOpen && moveTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold">Movimentar estoque</h3>
                        <form className="mt-4 grid gap-3" onSubmit={handleMove}>
                            <input
                                type="date"
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                value={moveForm.date}
                                onChange={(event) => setMoveForm((prev) => ({ ...prev, date: event.target.value }))}
                            />
                            <input
                                type="number"
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Quantidade"
                                value={moveForm.qty}
                                onChange={(event) => setMoveForm((prev) => ({ ...prev, qty: event.target.value }))}
                                required
                            />
                            <select
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                value={moveForm.type}
                                onChange={(event) => setMoveForm((prev) => ({ ...prev, type: event.target.value }))}
                            >
                                {(moveTarget.type === 'semen'
                                    ? (['IN', 'OUT', 'USE', 'ADJUST'] as SemenMoveType[])
                                    : (['IN', 'OUT', 'TRANSFER', 'ADJUST'] as EmbryoMoveType[])
                                ).map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>
                            <textarea
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                placeholder="Observações"
                                value={moveForm.notes}
                                onChange={(event) => setMoveForm((prev) => ({ ...prev, notes: event.target.value }))}
                            />
                            {moveError && <div className="text-sm text-rose-600">{moveError}</div>}
                            <div className="flex justify-end gap-2">
                                <button type="button" className="px-4 py-2 text-sm" onClick={() => setIsMoveModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                                    disabled={isSavingMove}
                                >
                                    {isSavingMove ? 'Salvando...' : 'Confirmar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GeneticsPlantelPO;
