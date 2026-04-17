import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Farm, Paddock } from '../types';
import { buildApiUrl, detectApiBaseUrl } from '../api';

// A simple unique ID generator for divisions
let divisionIdCounter = 0;

interface DivisionInput {
    id: string;
    name: string;
    areaHa: string;
    divisionType: string;
}

interface FarmRegistrationFormProps {
    onFarmCreated?: (farm: Farm) => void;
    onFarmUpdated?: (farm: Farm) => void;
    autoFocusName?: boolean;
    initialFarm?: Farm | null;
    onCancelEdit?: () => void;
    onSaveAndReturn?: () => void;
}

const FarmRegistrationForm: React.FC<FarmRegistrationFormProps> = ({
    onFarmCreated,
    onFarmUpdated,
    autoFocusName,
    initialFarm,
    onCancelEdit,
    onSaveAndReturn,
}) => {
    const [farmName, setFarmName] = useState('');
    const [farmCity, setFarmCity] = useState('');
    const [farmLat, setFarmLat] = useState('');
    const [farmLng, setFarmLng] = useState('');
    const [farmSize, setFarmSize] = useState(''); // Total size in hectares
    const [responsibleName, setResponsibleName] = useState('');
    const [farmNotes, setFarmNotes] = useState('');
    const [divisions, setDivisions] = useState<DivisionInput[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [activeFarm, setActiveFarm] = useState<Farm | null>(initialFarm || null);
    const [currentStep, setCurrentStep] = useState<'farm' | 'divisions'>(initialFarm ? 'divisions' : 'farm');
    const nameInputRef = useRef<HTMLInputElement | null>(null);
    const divisionsRef = useRef<HTMLDivElement | null>(null);

    const totalDivisionSize = useMemo(() => {
        return divisions.reduce((sum, division) => sum + (parseFloat(division.areaHa) || 0), 0);
    }, [divisions]);

    const farmSizeFloat = parseFloat(farmSize) || 0;
    const remainingSize = farmSizeFloat - totalDivisionSize;
    const isBalancedArea = Math.abs(remainingSize) < 0.0001;

    const isSaveDisabled = isSubmitting;

    useEffect(() => {
        if (autoFocusName) {
            nameInputRef.current?.focus();
        }
    }, [autoFocusName]);

    useEffect(() => {
        if (!initialFarm) {
            return;
        }
        setActiveFarm(initialFarm);
        setFarmName(initialFarm.name || '');
        setFarmCity(initialFarm.city || '');
        setFarmLat(initialFarm.lat?.toString?.() || '');
        setFarmLng(initialFarm.lng?.toString?.() || '');
        setFarmSize(initialFarm.size?.toString?.() || '');
        setResponsibleName(initialFarm.responsibleName || '');
        setFarmNotes(initialFarm.notes || '');
        setDivisions(
            (initialFarm.paddocks || []).map((division, index) => ({
                id: division.id,
                name: division.name || `Divisão ${index + 1}`,
                areaHa: division.areaHa?.toString?.() || '',
                divisionType: division.divisionType || 'pasto',
            })),
        );
        setCurrentStep('divisions');
    }, [initialFarm]);

    const handleAddDivision = () => {
        const divisionNumber = divisions.length + 1;
        setDivisions([
            ...divisions,
            {
                id: `division-${divisionIdCounter++}`,
                name: `Divisão ${divisionNumber}`,
                areaHa: '',
                divisionType: 'pasto',
            },
        ]);
    };

    const handleRemoveDivision = (id: string) => {
        setDivisions(divisions.filter((division) => division.id !== id));
    };

    const handleDivisionSizeChange = (id: string, value: string) => {
        setDivisions(divisions.map((division) => division.id === id ? { ...division, areaHa: value } : division));
    };

    const handleDivisionNameChange = (id: string, value: string) => {
        setDivisions(divisions.map((division) => division.id === id ? { ...division, name: value } : division));
    };

    const handleDivisionTypeChange = (id: string, value: string) => {
        setDivisions(divisions.map((division) => division.id === id ? { ...division, divisionType: value } : division));
    };

    const normalizeCoordinateInput = (value: string) => value.replace(',', '.');

    const resetForm = () => {
        setFarmName('');
        setFarmCity('');
        setFarmLat('');
        setFarmLng('');
        setFarmSize('');
        setResponsibleName('');
        setFarmNotes('');
        setDivisions([]);
        divisionIdCounter = 0;
    };

    const scrollToDivisionsStep = () => {
        const target = divisionsRef.current;
        if (!target) {
            return;
        }
        let scrollParent: HTMLElement | null = target.parentElement;
        while (scrollParent) {
            const style = window.getComputedStyle(scrollParent);
            const canScroll = /(auto|scroll)/.test(style.overflowY) && scrollParent.scrollHeight > scrollParent.clientHeight;
            if (canScroll) {
                const parentRect = scrollParent.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                const nextTop = scrollParent.scrollTop + (targetRect.top - parentRect.top) - 20;
                scrollParent.scrollTo({ top: Math.max(nextTop, 0), behavior: 'smooth' });
                return;
            }
            scrollParent = scrollParent.parentElement;
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const syncSavedFarm = (savedFarm: Farm | null) => {
        if (!savedFarm) {
            return;
        }
        setActiveFarm(savedFarm);
        setFarmName(savedFarm.name || '');
        setFarmCity(savedFarm.city || '');
        setFarmLat(savedFarm.lat?.toString?.() || '');
        setFarmLng(savedFarm.lng?.toString?.() || '');
        setFarmSize(savedFarm.size?.toString?.() || '');
        setResponsibleName(savedFarm.responsibleName || '');
        setFarmNotes(savedFarm.notes || '');
        setDivisions(
            (savedFarm.paddocks || []).map((division, index) => ({
                id: division.id,
                name: division.name || `Divisão ${index + 1}`,
                areaHa: division.areaHa?.toString?.() || '',
                divisionType: division.divisionType || 'pasto',
            })),
        );
    };

    const saveFarmDetails = async () => {
        setSubmitError(null);
        setSubmitSuccess(null);
        if (!farmName.trim() || !farmCity.trim()) {
            setSubmitError('Informe nome e cidade da fazenda.');
            return;
        }
        if (farmSizeFloat <= 0) {
            setSubmitError('Informe o tamanho total da fazenda.');
            return;
        }
        setIsSubmitting(true);
        const requestUrl = activeFarm ? `/farms/${activeFarm.id}` : '/farms';
        const requestBody = JSON.stringify({
            name: farmName.trim(),
            city: farmCity.trim(),
            lat: farmLat.trim(),
            lng: farmLng.trim(),
            size: farmSizeFloat,
            responsibleName: responsibleName.trim(),
            notes: farmNotes.trim(),
            paddocks: activeFarm ? divisions.map((division) => ({
                id: division.id,
                name: division.name.trim(),
                areaHa: parseFloat(division.areaHa) || 0,
                divisionType: division.divisionType,
            })) : [],
        });

        const persistFarm = async () => {
            return fetch(buildApiUrl(requestUrl), {
                method: activeFarm ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: requestBody,
            });
        };

        try {
            const response = await persistFarm();

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSubmitError(payload?.message || 'Não foi possível salvar a fazenda.');
                return;
            }

            const savedFarm = payload?.farm || null;
            syncSavedFarm(savedFarm);
            setCurrentStep('divisions');
            setSubmitSuccess(activeFarm ? 'Dados da fazenda atualizados. Continue nas divisões.' : 'Fazenda salva. Agora cadastre as divisões.');
            if (payload?.farm) {
                if (activeFarm) {
                    onFarmUpdated?.(payload.farm);
                } else {
                    onFarmCreated?.(payload.farm);
                }
            }
            requestAnimationFrame(() => {
                scrollToDivisionsStep();
            });
        } catch (error) {
            console.error(error);
            try {
                await detectApiBaseUrl();
                const retryResponse = await persistFarm();

                const retryPayload = await retryResponse.json().catch(() => ({}));
                if (!retryResponse.ok) {
                    setSubmitError(retryPayload?.message || 'Não foi possível salvar a fazenda.');
                    return;
                }

                const savedFarm = retryPayload?.farm || null;
                syncSavedFarm(savedFarm);
                setCurrentStep('divisions');
                setSubmitSuccess(activeFarm ? 'Dados da fazenda atualizados. Continue nas divisões.' : 'Fazenda salva. Agora cadastre as divisões.');
                if (retryPayload?.farm) {
                    if (activeFarm) {
                        onFarmUpdated?.(retryPayload.farm);
                    } else {
                        onFarmCreated?.(retryPayload.farm);
                    }
                }
                requestAnimationFrame(() => {
                    scrollToDivisionsStep();
                });
            } catch (retryError) {
                console.error(retryError);
                setSubmitError('Não foi possível salvar a fazenda. Verifique sua conexão.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const saveDivisions = async (mode: 'complete' | 'save-and-return') => {
        setSubmitError(null);
        setSubmitSuccess(null);

        if (!activeFarm) {
            setSubmitError('Salve a fazenda antes de cadastrar as divisões.');
            return;
        }

        const payloadDivisions: Paddock[] = divisions.map((division) => ({
            id: division.id,
            name: division.name.trim(),
            areaHa: parseFloat(division.areaHa) || 0,
            divisionType: division.divisionType,
        }));

        const hasInvalidDivision = payloadDivisions.some(
            (division) =>
                !division.name ||
                Number.isNaN(division.areaHa ?? 0) ||
                (division.areaHa ?? 0) <= 0 ||
                !division.divisionType,
        );

        if (payloadDivisions.length > 0 && hasInvalidDivision) {
            setSubmitError('Divisões precisam de nome, área útil e tipo válidos.');
            return;
        }

        if (mode === 'complete' && payloadDivisions.length > 0 && !isBalancedArea) {
            setSubmitError('Distribua a área total da fazenda entre as divisões para salvar.');
            return;
        }

        setIsSubmitting(true);
        const requestBody = JSON.stringify({
            name: farmName.trim(),
            city: farmCity.trim(),
            lat: farmLat.trim(),
            lng: farmLng.trim(),
            size: farmSizeFloat,
            responsibleName: responsibleName.trim(),
            notes: farmNotes.trim(),
            paddocks: payloadDivisions,
        });

        const persistDivisions = async () => {
            return fetch(buildApiUrl(`/farms/${activeFarm.id}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: requestBody,
            });
        };

        try {
            const response = await persistDivisions();
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSubmitError(payload?.message || 'Não foi possível salvar as divisões.');
                return;
            }

            syncSavedFarm(payload?.farm || null);
            onFarmUpdated?.(payload.farm);
            if (mode === 'save-and-return') {
                setSubmitSuccess('Progresso salvo com sucesso.');
                onSaveAndReturn?.();
                return;
            }
            setSubmitSuccess('Divisões salvas com sucesso.');
        } catch (error) {
            console.error(error);
            try {
                await detectApiBaseUrl();
                const retryResponse = await persistDivisions();
                const retryPayload = await retryResponse.json().catch(() => ({}));
                if (!retryResponse.ok) {
                    setSubmitError(retryPayload?.message || 'Não foi possível salvar as divisões.');
                    return;
                }
                syncSavedFarm(retryPayload?.farm || null);
                onFarmUpdated?.(retryPayload.farm);
                if (mode === 'save-and-return') {
                    setSubmitSuccess('Progresso salvo com sucesso.');
                    onSaveAndReturn?.();
                    return;
                }
                setSubmitSuccess('Divisões salvas com sucesso.');
            } catch (retryError) {
                console.error(retryError);
                setSubmitError('Não foi possível salvar as divisões. Verifique sua conexão.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rounded-[24px] border border-[#d7cab3] bg-[#fffaf1] p-6 sm:p-8">
            <h2 className="mb-2 text-2xl font-bold text-[#2f3a2d]">{activeFarm ? 'Editar Fazenda' : 'Cadastro de Fazenda'}</h2>
            <p className="mb-6 text-sm text-[#6d6558]">
                {currentStep === 'farm'
                    ? 'Primeiro salve os dados principais da fazenda.'
                    : 'Agora cadastre as divisões e complete a estrutura territorial.'}
            </p>
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                {currentStep === 'farm' ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                        <label htmlFor="farmName" className="block text-sm font-medium text-[#5f5648]">Nome da Fazenda</label>
                        <input
                            ref={nameInputRef}
                            type="text"
                            id="farmName"
                            value={farmName}
                            onChange={e => setFarmName(e.target.value)}
                            className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="farmCity" className="block text-sm font-medium text-[#5f5648]">Cidade/UF</label>
                        <input type="text" id="farmCity" value={farmCity} onChange={e => setFarmCity(e.target.value)} className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none" required />
                    </div>
                    <div>
                        <label htmlFor="farmLat" className="block text-sm font-medium text-[#5f5648]">Latitude</label>
                        <input type="text" inputMode="decimal" id="farmLat" placeholder="-12.345678" value={farmLat} onChange={e => setFarmLat(e.target.value)} onBlur={e => setFarmLat(normalizeCoordinateInput(e.target.value.trim()))} className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none" />
                        <p className="mt-1 text-xs text-[#7b715f]">Use graus decimais. Ex.: -12.345678</p>
                    </div>
                    <div>
                        <label htmlFor="farmLng" className="block text-sm font-medium text-[#5f5648]">Longitude</label>
                        <input type="text" inputMode="decimal" id="farmLng" placeholder="-39.123456" value={farmLng} onChange={e => setFarmLng(e.target.value)} onBlur={e => setFarmLng(normalizeCoordinateInput(e.target.value.trim()))} className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none" />
                        <p className="mt-1 text-xs text-[#7b715f]">Use graus decimais. Ex.: -39.123456</p>
                    </div>
                    <div>
                        <label htmlFor="farmSize" className="block text-sm font-medium text-[#5f5648]">Tamanho Total (ha)</label>
                        <input type="number" id="farmSize" value={farmSize} onChange={e => setFarmSize(e.target.value)} min="0" step="0.01" className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none" required />
                    </div>
                    <div>
                        <label htmlFor="responsibleName" className="block text-sm font-medium text-[#5f5648]">Nome do Responsável</label>
                        <input type="text" id="responsibleName" value={responsibleName} onChange={e => setResponsibleName(e.target.value)} className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none" />
                    </div>
                     <div className="md:col-span-2">
                        <label htmlFor="farmNotes" className="block text-sm font-medium text-[#5f5648]">Observações</label>
                        <textarea id="farmNotes" value={farmNotes} onChange={e => setFarmNotes(e.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none"></textarea>
                    </div>
                    <div className="md:col-span-2 flex justify-end pt-1">
                        <button
                            type="button"
                            onClick={onCancelEdit}
                            className="mr-3 flex items-center rounded-2xl border border-[#c7b59b] bg-[#f3ebde] px-6 py-2.5 font-bold text-[#5f5648] transition-colors duration-200 hover:bg-[#eadfcd]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => void saveFarmDetails()}
                            disabled={isSaveDisabled}
                            className="flex items-center rounded-2xl bg-[#9d7d4d] px-6 py-2.5 font-bold text-white transition-colors duration-200 hover:bg-[#8f7144] disabled:cursor-not-allowed disabled:bg-[#b8ab95]"
                        >
                            {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
                ) : (
                <>
                <div className="rounded-2xl border border-[#e2d7c7] bg-[#f6efe3] p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a7350]">Dados salvos</p>
                            <h3 className="mt-1 text-lg font-semibold text-[#2f3a2d]">{farmName}</h3>
                            <p className="mt-1 text-sm text-[#6d6558]">{farmCity}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setCurrentStep('farm')}
                            className="rounded-xl border border-[#c7b59b] bg-[#fffaf1] px-4 py-2 text-sm font-semibold text-[#5f5648] transition-colors hover:bg-[#f3ebde]"
                        >
                            Editar dados da fazenda
                        </button>
                    </div>
                </div>
                <div ref={divisionsRef}>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-medium text-[#2f3a2d]">Divisões</h3>
                            <p className="mt-1 text-sm text-[#6d6558]">Cadastre as áreas que compõem a fazenda.</p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {divisions.map((division, index) => (
                            <div key={division.id} className="rounded-2xl border border-[#e2d7c7] bg-[#fcf7ee] p-4">
                                <div className="mb-3 flex items-center gap-3">
                                    <span className="text-sm font-medium text-[#5f5648]">Divisão {index + 1}</span>
                                    <button type="button" onClick={() => handleRemoveDivision(division.id)} className="ml-auto rounded-full p-2 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700" aria-label="Remover divisão">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    <div>
                                        <label htmlFor={`division-name-${division.id}`} className="block text-sm font-medium text-[#5f5648]">Nome da Divisão</label>
                                        <input
                                            type="text"
                                            id={`division-name-${division.id}`}
                                            value={division.name}
                                            onChange={(e) => handleDivisionNameChange(division.id, e.target.value)}
                                            placeholder="Ex.: Pasto 01, Curral de manejo, APP..."
                                            className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div>
                                        <label htmlFor={`division-size-${division.id}`} className="block text-sm font-medium text-[#5f5648]">Área Útil (ha)</label>
                                        <input
                                            type="number"
                                            id={`division-size-${division.id}`}
                                            value={division.areaHa}
                                            onChange={(e) => handleDivisionSizeChange(division.id, e.target.value)}
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none"
                                        />
                                        </div>
                                        <div>
                                            <label htmlFor={`division-type-${division.id}`} className="block text-sm font-medium text-[#5f5648]">Tipo</label>
                                            <select
                                                id={`division-type-${division.id}`}
                                                value={division.divisionType}
                                                onChange={(e) => handleDivisionTypeChange(division.id, e.target.value)}
                                                className="mt-1 block w-full rounded-xl border border-[#d8cbb5] bg-[#fdf9f2] px-3 py-2.5 text-sm text-[#2f3a2d] focus:border-[#9d7d4d] focus:outline-none"
                                            >
                                                <option value="pasto">Pasto</option>
                                                <option value="curral de manejo">Curral de manejo</option>
                                                <option value="área de preservação">Área de preservação</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={handleAddDivision}
                            className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#ccb894] bg-[#f7f0e3] p-6 text-center transition-colors hover:bg-[#f2e7d4]"
                        >
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#9d7d4d] text-white">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v12m6-6H6" />
                                </svg>
                            </span>
                            <span className="mt-4 text-base font-semibold text-[#5f5648]">Adicionar Divisão</span>
                            <span className="mt-2 max-w-[220px] text-sm text-[#7b715f]">
                                Crie uma nova divisão para organizar a fazenda do jeito que ela existe no campo.
                            </span>
                        </button>
                    </div>
                </div>
                </>
                )}

                {submitError && (
                    <p className="text-sm text-red-600">{submitError}</p>
                )}
                {submitSuccess && (
                    <p className="text-sm text-green-700">{submitSuccess}</p>
                )}

                {currentStep === 'divisions' && activeFarm && (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => void saveDivisions('save-and-return')}
                            disabled={isSaveDisabled}
                            className="rounded-xl border border-[#c7b59b] bg-[#f3ebde] px-4 py-2 text-sm font-semibold text-[#5f5648] transition-colors duration-200 hover:bg-[#eadfcd] disabled:cursor-not-allowed disabled:bg-[#e1d7c7]"
                        >
                            {isSubmitting ? 'Salvando...' : 'Salvar e voltar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => void saveDivisions('complete')}
                            disabled={isSaveDisabled}
                            className="ml-3 rounded-xl bg-[#9d7d4d] px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#8f7144] disabled:cursor-not-allowed disabled:bg-[#b8ab95]"
                        >
                            {isSubmitting ? 'Salvando...' : 'Salvar divisões'}
                        </button>
                    </div>
                )}
                {currentStep === 'divisions' && (
                <div className="mt-4 space-y-2 rounded-2xl border border-[#e2d7c7] bg-[#f6efe3] p-4">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-[#6d6558]">Área Total da Fazenda:</span>
                        <span className="font-bold text-[#2f3a2d]">{farmSizeFloat.toFixed(2)} ha</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-[#6d6558]">Área Total das Divisões:</span>
                        <span className="font-bold text-[#2f3a2d]">{totalDivisionSize.toFixed(2)} ha</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                        <span className={isBalancedArea && farmSizeFloat > 0 ? 'text-green-600' : 'text-red-600'}>Área Restante a Alocar:</span>
                        <span className={isBalancedArea && farmSizeFloat > 0 ? 'text-green-600' : 'text-red-600'}>{remainingSize.toFixed(2)} ha</span>
                    </div>
                     {!isBalancedArea && farmSizeFloat > 0 && (
                        <p className="pt-2 text-center text-xs text-yellow-700">A soma das áreas das divisões deve ser igual à área total da fazenda (tolerância de 0.0001 ha).</p>
                     )}
                </div>
                )}
            </form>
        </div>
    );
};

export default FarmRegistrationForm;
