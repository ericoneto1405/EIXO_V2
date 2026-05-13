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
    forrageira: string;
    sistemaPastejo: string;
    lotacaoUaHa: string;
}

interface FarmRegistrationFormProps {
    onFarmCreated?: (farm: Farm) => void;
    onFarmUpdated?: (farm: Farm) => void;
    autoFocusName?: boolean;
    initialFarm?: Farm | null;
    onCancelEdit?: () => void;
    onSaveAndReturn?: () => void;
}

const NON_GRAZING_DIVISION_TYPES = ['aguada / reservatório', 'área de preservação', 'área de plantio'];

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Converte DMS (graus°minutos'segundos"direção) para graus decimais */
const dmsToDecimal = (s: string): number | null => {
    const t = s.trim();
    // DMS completo: 12°34'56.7"S  ou  12°34'56S
    const mFull = t.match(/^(\d+(?:[.,]\d+)?)\s*°\s*(\d+(?:[.,]\d+)?)\s*['\u2019]\s*(\d+(?:[.,]\d+)?)\s*["\u201d\u2033]?\s*([NSEWnsew])?$/i);
    if (mFull) {
        const dec = parseFloat(mFull[1].replace(',', '.'))
            + parseFloat(mFull[2].replace(',', '.')) / 60
            + parseFloat(mFull[3].replace(',', '.')) / 3600;
        const dir = mFull[4]?.toUpperCase() ?? '';
        return isNaN(dec) ? null : (dir === 'S' || dir === 'W') ? -dec : dec;
    }
    // Graus + minutos decimais: 12°34.567'S
    const mDM = t.match(/^(\d+(?:[.,]\d+)?)\s*°\s*(\d+(?:[.,]\d+)?)\s*['\u2019]\s*([NSEWnsew])?$/i);
    if (mDM) {
        const dec = parseFloat(mDM[1].replace(',', '.'))
            + parseFloat(mDM[2].replace(',', '.')) / 60;
        const dir = mDM[3]?.toUpperCase() ?? '';
        return isNaN(dec) ? null : (dir === 'S' || dir === 'W') ? -dec : dec;
    }
    return null;
};

/** Converte qualquer string de coordenada para graus decimais */
const parseCoordStr = (s: string): number | null => {
    const n = parseFloat(s.trim().replace(',', '.'));
    if (!isNaN(n)) return n;
    return dmsToDecimal(s);
};

/**
 * Detecta par lat,lng colado de uma só vez (ex: Google Maps "-12.345, -39.123").
 * Retorna [latStr, lngStr] formatados ou null.
 */
const tryParsePair = (raw: string): [string, string] | null => {
    const s = raw.trim();
    const candidates: Array<[string, string]> = [];

    // Separadores explícitos: | ; vírgula+espaço
    for (const sep of [/\s*\|\s*/, /\s*;\s*/, /,\s+/]) {
        const parts = s.split(sep);
        if (parts.length === 2) candidates.push([parts[0], parts[1]]);
    }
    // Vírgula imediatamente seguida de sinal (ex: "-12.3456,-39.1234")
    const cm = s.split(/,(?=[-+])/);
    if (cm.length === 2) candidates.push([cm[0], cm[1]]);
    // Dois tokens separados por espaço (ex: "-12.3456 -39.1234")
    const sp = s.split(/\s+/);
    if (sp.length === 2) candidates.push([sp[0], sp[1]]);

    for (const [a, b] of candidates) {
        const lat = parseCoordStr(a);
        const lng = parseCoordStr(b);
        if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return [lat.toFixed(6), lng.toFixed(6)];
        }
    }
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────

const FarmRegistrationForm: React.FC<FarmRegistrationFormProps> = ({
    onFarmCreated,
    onFarmUpdated,
    autoFocusName,
    initialFarm,
    onCancelEdit,
    onSaveAndReturn,
}) => {
    const BRAZILIAN_STATES = [
        'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
        'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
        'SP', 'SE', 'TO',
    ];
    const [farmName, setFarmName] = useState('');
    const [farmCity, setFarmCity] = useState('');
    const [farmState, setFarmState] = useState('');
    const [farmLat, setFarmLat] = useState('');
    const [farmLng, setFarmLng] = useState('');
    const [farmSize, setFarmSize] = useState(''); // Total size in hectares
    const [farmNotes, setFarmNotes] = useState('');
    const [divisions, setDivisions] = useState<DivisionInput[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
    const [farmLimitReached, setFarmLimitReached] = useState(false);
    const [activeFarm, setActiveFarm] = useState<Farm | null>(initialFarm || null);
    const [currentStep, setCurrentStep] = useState<'farm' | 'divisions'>(initialFarm ? 'divisions' : 'farm');
    const [showLocation, setShowLocation] = useState(true);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [paddockToDelete, setPaddockToDelete] = useState<DivisionInput | null>(null);
    const nameInputRef = useRef<HTMLInputElement | null>(null);
    const divisionsRef = useRef<HTMLDivElement | null>(null);

    const totalDivisionSize = useMemo(() => {
        return divisions.reduce((sum, division) => sum + (parseFloat(division.areaHa) || 0), 0);
    }, [divisions]);

    const totalCapacityUa = useMemo(() => {
        return divisions.reduce((sum, division) => {
            if (NON_GRAZING_DIVISION_TYPES.includes(division.divisionType)) return sum;
            const area = parseFloat(division.areaHa) || 0;
            const lotacao = parseFloat(division.lotacaoUaHa) || 0;
            if (area <= 0 || lotacao <= 0) return sum;
            return sum + (area * lotacao);
        }, 0);
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
        const [cityPart = '', statePart = ''] = (initialFarm.city || '').split('/').map((value) => value.trim());
        setActiveFarm(initialFarm);
        setFarmName(initialFarm.name || '');
        setFarmCity(cityPart);
        setFarmState(statePart.toUpperCase());
        setFarmLat(initialFarm.lat?.toString?.() || '');
        setFarmLng(initialFarm.lng?.toString?.() || '');
        setFarmSize(initialFarm.size?.toString?.() || '');
        setFarmNotes(initialFarm.notes || '');
        setDivisions(
            (initialFarm.paddocks || []).map((division, index) => ({
                id: division.id,
                name: division.name || `Pasto ${index + 1}`,
                areaHa: division.areaHa?.toString?.() || '',
                divisionType: division.divisionType || 'pasto',
                forrageira: division.forrageira || '',
                sistemaPastejo: '',
                lotacaoUaHa: division.lotacaoUaHa?.toString?.() || '1',
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
                name: `Pasto ${divisionNumber}`,
                areaHa: '',
                divisionType: 'pasto',
                forrageira: '',
                sistemaPastejo: '',
                lotacaoUaHa: '1',
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

    const handleDivisionForrageira = (id: string, value: string) => {
        setDivisions(divisions.map((division) => division.id === id ? { ...division, forrageira: value } : division));
    };

    const handleDivisionSistemaPastejo = (id: string, value: string) => {
        setDivisions(divisions.map((d) => d.id === id ? { ...d, sistemaPastejo: value } : d));
    };

    const handleDivisionLotacao = (id: string, value: string) => {
        setDivisions(divisions.map((division) => division.id === id ? { ...division, lotacaoUaHa: value } : division));
    };

    /** Trata colagem: se detectar par lat/lng, preenche os dois campos */
    const handlePasteCoord = React.useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
        const pasted = e.clipboardData.getData('text');
        const pair = tryParsePair(pasted);
        if (pair) {
            e.preventDefault();
            setFarmLat(pair[0]);
            setFarmLng(pair[1]);
        }
    }, []);

    /** No blur: normaliza DMS ou detecta par e preenche ambos */
    const normalizeAndSetCoord = React.useCallback((raw: string, field: 'lat' | 'lng') => {
        const pair = tryParsePair(raw);
        if (pair) {
            setFarmLat(pair[0]);
            setFarmLng(pair[1]);
            return;
        }
        const n = parseCoordStr(raw);
        const formatted = (n !== null && !isNaN(n)) ? n.toFixed(6) : raw;
        if (field === 'lat') setFarmLat(formatted);
        else setFarmLng(formatted);
    }, []);

    const handleGetGPS = () => {
        if (!navigator.geolocation) return;
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setFarmLat(pos.coords.latitude.toFixed(6));
                setFarmLng(pos.coords.longitude.toFixed(6));
                setGpsLoading(false);
            },
            () => {
                setGpsLoading(false);
            },
            { timeout: 10000 },
        );
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
        const [cityPart = '', statePart = ''] = (savedFarm.city || '').split('/').map((value) => value.trim());
        setFarmCity(cityPart);
        setFarmState(statePart.toUpperCase());
        setFarmLat(savedFarm.lat?.toString?.() || '');
        setFarmLng(savedFarm.lng?.toString?.() || '');
        setFarmSize(savedFarm.size?.toString?.() || '');
        setFarmNotes(savedFarm.notes || '');
        setDivisions(
            (savedFarm.paddocks || []).map((division, index) => ({
                id: division.id,
                name: division.name || `Pasto ${index + 1}`,
                areaHa: division.areaHa?.toString?.() || '',
                divisionType: division.divisionType || 'pasto',
                forrageira: division.forrageira || '',
                sistemaPastejo: '',
                lotacaoUaHa: division.lotacaoUaHa?.toString?.() || '1',
            })),
        );
    };

    const saveFarmDetails = async () => {
        setSubmitError(null);
        setSubmitSuccess(null);
        setFarmLimitReached(false);
        if (!farmName.trim() || !farmCity.trim() || !farmState.trim()) {
            setSubmitError('Informe nome, cidade e estado da fazenda.');
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
            city: `${farmCity.trim()}/${farmState.trim().toUpperCase()}`,
            lat: farmLat.trim(),
            lng: farmLng.trim(),
            size: farmSizeFloat,
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
                if (payload?.code === 'farm_limit_reached') {
                    setFarmLimitReached(true);
                } else {
                    setSubmitError(payload?.message || 'Não foi possível salvar a fazenda.');
                }
                return;
            }

            const savedFarm = payload?.farm || null;
            syncSavedFarm(savedFarm);
            setCurrentStep('divisions');
            // Auto-create first paddock if none exist yet
            if (!activeFarm && divisions.length === 0) {
                setDivisions([{
                    id: `div-${++divisionIdCounter}`,
                    name: '',
                    areaHa: '',
                    divisionType: 'pasto',
                    forrageira: '',
                    sistemaPastejo: '',
                    lotacaoUaHa: '1',
                }]);
            }
            setSubmitSuccess(activeFarm ? 'Dados da fazenda atualizados. Continue nos pastos.' : 'Fazenda salva. Agora cadastre os pastos.');
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
                    if (retryPayload?.code === 'farm_limit_reached') {
                        setFarmLimitReached(true);
                    } else {
                        setSubmitError(retryPayload?.message || 'Não foi possível salvar a fazenda.');
                    }
                    return;
                }

                const savedFarm = retryPayload?.farm || null;
                syncSavedFarm(savedFarm);
                setCurrentStep('divisions');
                setSubmitSuccess(activeFarm ? 'Dados da fazenda atualizados. Continue nos pastos.' : 'Fazenda salva. Agora cadastre os pastos.');
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
            setSubmitError('Salve a fazenda antes de cadastrar os pastos.');
            return;
        }

        const payloadDivisions: Paddock[] = divisions.map((division) => ({
            id: division.id,
            name: division.name.trim(),
            areaHa: parseFloat(division.areaHa) || 0,
            divisionType: division.divisionType,
            forrageira: division.forrageira || null,
            sistemaPastejo: division.sistemaPastejo || null,
            lotacaoUaHa: parseFloat(division.lotacaoUaHa) || null,
        }));

        const hasInvalidDivision = payloadDivisions.some(
            (division) =>
                !division.name ||
                Number.isNaN(division.areaHa ?? 0) ||
                (division.areaHa ?? 0) <= 0 ||
                !division.divisionType,
        );

        if (payloadDivisions.length > 0 && hasInvalidDivision) {
            setSubmitError('Pastos precisam de nome, área útil e tipo válidos.');
            return;
        }

        // Área não precisa ser exata — o resumo é apenas informativo

        setIsSubmitting(true);
        // Preserva coordenadas existentes se o usuário não editou os campos de GPS
        const latToSend = farmLat.trim() || activeFarm?.lat?.toString() || '';
        const lngToSend = farmLng.trim() || activeFarm?.lng?.toString() || '';
        const requestBody = JSON.stringify({
            name: farmName.trim(),
            city: `${farmCity.trim()}/${farmState.trim().toUpperCase()}`,
            lat: latToSend,
            lng: lngToSend,
            size: farmSizeFloat,
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
                setSubmitError(payload?.message || 'Não foi possível salvar os pastos.');
                return;
            }

            syncSavedFarm(payload?.farm || null);
            onFarmUpdated?.(payload.farm);
            if (mode === 'save-and-return') {
                setSubmitSuccess('Progresso salvo com sucesso.');
                onSaveAndReturn?.();
                return;
            }
            // mode === 'complete': concluir cadastro → volta para a lista
            setSubmitSuccess('Cadastro concluído!');
            onSaveAndReturn?.();
        } catch (error) {
            console.error(error);
            try {
                await detectApiBaseUrl();
                const retryResponse = await persistDivisions();
                const retryPayload = await retryResponse.json().catch(() => ({}));
                if (!retryResponse.ok) {
                    setSubmitError(retryPayload?.message || 'Não foi possível salvar os pastos.');
                    return;
                }
                syncSavedFarm(retryPayload?.farm || null);
                onFarmUpdated?.(retryPayload.farm);
                if (mode === 'save-and-return') {
                    setSubmitSuccess('Progresso salvo com sucesso.');
                    onSaveAndReturn?.();
                    return;
                }
                setSubmitSuccess('Cadastro concluído!');
                onSaveAndReturn?.();
            } catch (retryError) {
                console.error(retryError);
                setSubmitError('Não foi possível salvar os pastos. Verifique sua conexão.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 sm:p-8">

            {/* Modal de confirmação de exclusão de pasto */}
            {paddockToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-[var(--eixo-graphite)]/50 backdrop-blur-sm"
                        onClick={() => setPaddockToDelete(null)}
                    />
                    <div className="relative w-full max-w-md rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-8 shadow-2xl">
                        <h2 className="text-xl font-bold text-[var(--eixo-text)]">Excluir pasto</h2>
                        <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                            Tem certeza que deseja excluir o pasto{' '}
                            <span className="font-semibold text-[var(--eixo-text)]">
                                "{paddockToDelete.name.trim() || 'sem nome'}"
                            </span>?
                            Essa ação não pode ser desfeita.
                        </p>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setPaddockToDelete(null)}
                                className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-5 py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[#ece9e6]"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => { handleRemoveDivision(paddockToDelete.id); setPaddockToDelete(null); }}
                                className="rounded-2xl border border-[#efc2ba] bg-[#fff2ef] px-5 py-2.5 text-sm font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[#f7ddd7]"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Indicador de progresso ── */}
            <div className="mb-6 flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${currentStep === 'farm' ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>
                        {currentStep === 'divisions' ? '✓' : '1'}
                    </div>
                    <span className={`text-sm font-semibold ${currentStep === 'farm' ? 'text-[var(--eixo-text)]' : 'text-[var(--eixo-text-muted)]'}`}>
                        {currentStep === 'divisions' ? (farmName.trim() || 'Dados da fazenda') : 'Dados da fazenda'}
                    </span>
                    {currentStep === 'divisions' && (
                        <button type="button" onClick={() => setCurrentStep('farm')} className="rounded-md border border-[#B6E23A] bg-[#f0f9d4] px-2 py-0.5 text-xs font-semibold text-[#3a5c10] transition-colors hover:bg-[#e6f5b8]">
                            editar
                        </button>
                    )}
                </div>
                <div className="h-px flex-1 bg-[var(--eixo-surface-soft)]" />
                <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${currentStep === 'divisions' ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-soft)]'}`}>2</div>
                    <span className={`text-sm font-semibold ${currentStep === 'divisions' ? 'text-[var(--eixo-text)]' : 'text-[var(--eixo-text-soft)]'}`}>Pastos</span>
                </div>
            </div>

            <h2 className="mb-2 text-2xl font-bold text-[var(--eixo-text)]">{activeFarm ? 'Editar Fazenda' : 'Cadastro de Fazenda'}</h2>
            <p className="mb-6 text-sm text-[var(--eixo-text-muted)]">
                {currentStep === 'farm'
                    ? 'Preencha os dados principais. Os pastos vêm no próximo passo.'
                    : 'Cadastre as áreas que compõem a fazenda. Você pode ajustar depois.'}
            </p>
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                {currentStep === 'farm' ? (
                <div className="rounded-2xl bg-[#EDEDED] p-5">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                        <label htmlFor="farmName" className="block text-sm font-medium text-[var(--eixo-text)]">Nome da Fazenda</label>
                        <input
                            ref={nameInputRef}
                            type="text"
                            id="farmName"
                            value={farmName}
                            onChange={e => setFarmName(e.target.value)}
                            className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="farmCity" className="block text-sm font-medium text-[var(--eixo-text)]">Cidade</label>
                        <input type="text" id="farmCity" value={farmCity} onChange={e => setFarmCity(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none" required />
                    </div>
                    <div>
                        <label htmlFor="farmState" className="block text-sm font-medium text-[var(--eixo-text)]">Estado</label>
                        <select id="farmState" value={farmState} onChange={e => setFarmState(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none" required>
                            <option value="">Selecione</option>
                            {BRAZILIAN_STATES.map((state) => (
                                <option key={state} value={state}>{state}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="farmSize" className="block text-sm font-medium text-[var(--eixo-text)]">Tamanho Total (ha)</label>
                        <input type="number" id="farmSize" value={farmSize} onChange={e => setFarmSize(e.target.value)} min="0" step="0.01" className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none" required />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="farmNotes" className="block text-sm font-medium text-[var(--eixo-text)]">Observações</label>
                        <textarea id="farmNotes" value={farmNotes} onChange={e => setFarmNotes(e.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"></textarea>
                    </div>

                    {/* ── Localização opcional ── */}
                    <div className="md:col-span-2">
                        {!showLocation ? (
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowLocation(true)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--eixo-graphite)] transition-colors hover:bg-[var(--eixo-green)]/20"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Adicionar localização da fazenda
                                </button>
                                <span className="text-xs text-[var(--eixo-text-muted)]">opcional</span>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-[var(--eixo-text)]">📍 Localização</p>
                                    <button type="button" onClick={() => { setShowLocation(false); setFarmLat(''); setFarmLng(''); }} className="text-xs text-[var(--eixo-text-muted)] hover:text-[var(--eixo-text-muted)]">Remover</button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGetGPS}
                                    disabled={gpsLoading}
                                    className="flex items-center gap-2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:opacity-60"
                                >
                                    <svg className="h-4 w-4 text-[var(--eixo-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {gpsLoading ? 'Capturando...' : 'Usar minha localização atual'}
                                </button>
                                <p className="text-xs text-[var(--eixo-text-muted)]">
                                    Use somente se estiver na fazenda agora. Ou cole as coordenadas do Google Maps nos campos abaixo — os dois são preenchidos automaticamente. Aceita também formato DMS (ex: <span className="font-mono">12°34'56"S</span>).
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="farmLat" className="block text-xs font-medium text-[var(--eixo-text)]">Latitude</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            id="farmLat"
                                            placeholder="-12.345678"
                                            value={farmLat}
                                            onChange={e => setFarmLat(e.target.value)}
                                            onBlur={e => normalizeAndSetCoord(e.target.value.trim(), 'lat')}
                                            onPaste={handlePasteCoord}
                                            className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="farmLng" className="block text-xs font-medium text-[var(--eixo-text)]">Longitude</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            id="farmLng"
                                            placeholder="-39.123456"
                                            value={farmLng}
                                            onChange={e => setFarmLng(e.target.value)}
                                            onBlur={e => normalizeAndSetCoord(e.target.value.trim(), 'lng')}
                                            onPaste={handlePasteCoord}
                                            className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {farmLat && farmLng && (
                                    <p className="text-xs text-[var(--eixo-success)]">✓ Localização definida: {farmLat}, {farmLng}</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-2 flex justify-end pt-1">
                        <button
                            type="button"
                            onClick={onCancelEdit}
                            className="mr-3 flex items-center rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-6 py-2.5 font-bold text-[var(--eixo-text)] transition-colors duration-200 hover:bg-[#ece9e6]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => void saveFarmDetails()}
                            disabled={isSaveDisabled}
                            className="flex items-center rounded-2xl bg-[var(--eixo-green)] px-6 py-2.5 font-bold text-[#1a1a1a] transition-colors duration-200 hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:bg-[var(--eixo-border-strong)]"
                        >
                            {isSubmitting ? 'Salvando...' : 'Salvar e continuar →'}
                        </button>
                    </div>
                </div>
                </div>
                ) : (
                <>
                <div className="rounded-2xl bg-[#f0f9d4] p-5">
                <div ref={divisionsRef}>
                    {/* Banner GPS — visível apenas quando lat/lng ainda não foram preenchidos */}
                    {!farmLat && !farmLng && (
                        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#fbbf24] bg-[#fffbeb] px-4 py-3">
                            <div className="flex items-center gap-2">
                                <span className="text-base">📍</span>
                                <p className="text-xs font-semibold text-[#92400e]">GPS não cadastrado — a previsão do tempo usa as coordenadas da fazenda.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCurrentStep('farm')}
                                className="flex-shrink-0 rounded-lg border border-[#f59e0b] bg-white px-3 py-1.5 text-xs font-bold text-[#92400e] transition-colors hover:bg-[#fef3c7]"
                            >
                                Adicionar GPS
                            </button>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-medium text-[var(--eixo-text)]">Pastos</h3>
                            <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Cadastre as áreas que compõem a fazenda.</p>
                        </div>
                    </div>
                    {divisions.length === 0 && (
                        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#b6d97a] bg-white/50 py-8 text-center">
                            <svg className="h-8 w-8 text-[#a3c95a] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                            <p className="text-sm font-semibold text-[#5a7a2a]">Nenhum pasto cadastrado ainda</p>
                            <p className="mt-1 text-xs text-[#7a9a3a]">Clique em "+ Adicionar pasto" para começar</p>
                        </div>
                    )}
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {divisions.map((division, index) => (
                            <div key={division.id} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                                <div className="mb-3 flex items-center gap-3">
                                    <span className="text-sm font-medium text-[var(--eixo-text)]">{divisions[index].name.trim() || `Pasto ${index + 1}`}</span>
                                    <button type="button" onClick={() => setPaddockToDelete(division)} className="ml-auto rounded-full p-2 text-[var(--eixo-danger)] transition-colors hover:bg-[#fff2ef] hover:text-[var(--eixo-danger)]" aria-label="Remover pasto">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                    <div>
                                        <label htmlFor={`division-name-${division.id}`} className="block text-sm font-medium text-[var(--eixo-text)]">Nome do Pasto</label>
                                        <input
                                            type="text"
                                            id={`division-name-${division.id}`}
                                            value={division.name}
                                            onChange={(e) => handleDivisionNameChange(division.id, e.target.value)}
                                            placeholder="Ex.: Pasto 01, Curral de manejo, APP..."
                                            className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div>
                                        <label htmlFor={`division-size-${division.id}`} className="block text-sm font-medium text-[var(--eixo-text)]">Área Útil (ha)</label>
                                        <input
                                            type="number"
                                            id={`division-size-${division.id}`}
                                            value={division.areaHa}
                                            onChange={(e) => handleDivisionSizeChange(division.id, e.target.value)}
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                        />
                                        </div>
                                        <div>
                                            <label htmlFor={`division-type-${division.id}`} className="block text-sm font-medium text-[var(--eixo-text)]">Tipo</label>
                                            <select
                                                id={`division-type-${division.id}`}
                                                value={division.divisionType}
                                                onChange={(e) => handleDivisionTypeChange(division.id, e.target.value)}
                                                className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                            >
                                                <option value="pasto">Pasto</option>
                                                <option value="piquete de maternidade">Piquete de maternidade</option>
                                                <option value="curral de manejo">Curral de manejo</option>
                                                <option value="curral de engorda">Curral de engorda</option>
                                                <option value="aguada / reservatório">Aguada / Reservatório</option>
                                                <option value="área de plantio">Área de plantio</option>
                                                <option value="área de preservação">Área de preservação</option>
                                            </select>
                                        </div>
                                    </div>
                                    {!NON_GRAZING_DIVISION_TYPES.includes(division.divisionType) && (
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div>
                                            <label htmlFor={`division-forrageira-${division.id}`} className="block text-sm font-medium text-[var(--eixo-text)]">Forrageira</label>
                                            <select
                                                id={`division-forrageira-${division.id}`}
                                                value={division.forrageira}
                                                onChange={(e) => handleDivisionForrageira(division.id, e.target.value)}
                                                className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                            >
                                                <option value="">Selecione</option>
                                                <optgroup label="Brachiaria">
                                                    <option value="brachiaria-marandu">B. Marandu</option>
                                                    <option value="brachiaria-decumbens">B. Decumbens</option>
                                                    <option value="brachiaria-xaraes">B. Xaraés</option>
                                                    <option value="brachiaria-piata">B. Piatã</option>
                                                </optgroup>
                                                <optgroup label="Panicum">
                                                    <option value="panicum-massai">Massai</option>
                                                    <option value="panicum-tanzania">Tanzânia</option>
                                                    <option value="panicum-mombaca">Mombaça</option>
                                                </optgroup>
                                                <optgroup label="Outras forrageiras">
                                                    <option value="capim-elefante">Capim-elefante</option>
                                                    <option value="coastcross">Coastcross</option>
                                                    <option value="sorgo-forrageiro">Sorgo forrageiro</option>
                                                    <option value="tifton">Tifton</option>
                                                    <option value="andropogon">Andropogon</option>
                                                    <option value="capim-buffel">Capim-buffel</option>
                                                </optgroup>
                                                <option value="outros">Outros</option>
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            <div>
                                                <label htmlFor={`division-sistema-${division.id}`} className="block text-sm font-medium text-[var(--eixo-text)]">Sistema de pastejo</label>
                                                <select
                                                    id={`division-sistema-${division.id}`}
                                                    value={division.sistemaPastejo}
                                                    onChange={(e) => handleDivisionSistemaPastejo(division.id, e.target.value)}
                                                    className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                                >
                                                    <option value="">Selecione</option>
                                                    <option value="extensivo">Extensivo</option>
                                                    <option value="rotacionado">Rotacionado</option>
                                                    <option value="semi-intensivo">Semi-intensivo</option>
                                                    <option value="confinamento">Confinamento</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor={`division-lotacao-${division.id}`} className="block text-sm font-medium text-[var(--eixo-text)]">
                                                Lotação (UA/ha)
                                                <span className="ml-1.5 text-xs font-normal text-[var(--eixo-text-muted)]">Ref: Brachiaria/Cerrado — 0,5 (seca) a 1,5 (águas)</span>
                                            </label>
                                            <input
                                                type="number"
                                                id={`division-lotacao-${division.id}`}
                                                value={division.lotacaoUaHa}
                                                onChange={(e) => handleDivisionLotacao(division.id, e.target.value)}
                                                min="0.1"
                                                step="0.1"
                                                placeholder="1.0"
                                                className="mt-1 block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                            />
                                            {(() => {
                                                const area = parseFloat(division.areaHa);
                                                const lotacao = parseFloat(division.lotacaoUaHa);
                                                if (area > 0 && lotacao > 0) {
                                                    return (
                                                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                                            Capacidade estimada: <span className="font-semibold text-[var(--eixo-text)]">{(area * lotacao).toFixed(1)} UA</span>
                                                        </p>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={handleAddDivision}
                        className="mt-3 flex w-auto items-center gap-2 rounded-xl border border-dashed border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-1.5 text-sm font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[#ece9e6]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v12m6-6H6" />
                        </svg>
                        Adicionar pasto
                    </button>
                </div>
                </div>
                </>
                )}


                {farmLimitReached && (
                    <div className="rounded-2xl border border-[#d9ead0] bg-[var(--eixo-green-soft)] p-4">
                        <p className="text-sm font-semibold text-[var(--eixo-graphite)]">🔒 Limite do plano gratuito</p>
                        <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">
                            O plano gratuito permite apenas <strong>1 fazenda</strong>. Para cadastrar mais fazendas, faça upgrade do seu plano.
                        </p>
                        <button
                            type="button"
                            className="mt-3 rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]"
                            onClick={() => window.location.href = '/planos'}
                        >
                            Ver planos
                        </button>
                    </div>
                )}
                {currentStep === 'divisions' && farmSizeFloat > 0 && (
                    <div className="space-y-1.5 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                        <div className="flex justify-between text-sm">
                            <span className="font-medium text-[var(--eixo-text-muted)]">Área total da fazenda</span>
                            <span className="font-bold text-[var(--eixo-text)]">{farmSizeFloat.toFixed(2)} ha</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="font-medium text-[var(--eixo-text-muted)]">Distribuído nos pastos</span>
                            <span className="font-bold text-[var(--eixo-text)]">{totalDivisionSize.toFixed(2)} ha</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold">
                            <span className={isBalancedArea ? 'text-[var(--eixo-success)]' : remainingSize < 0 ? 'text-[var(--eixo-danger)]' : 'text-[#b45309]'}>
                                {isBalancedArea ? '✓ Área totalmente distribuída' : remainingSize < 0 ? 'Área excedida' : 'Ainda não distribuído'}
                            </span>
                            <span className={isBalancedArea ? 'text-[var(--eixo-success)]' : remainingSize < 0 ? 'text-[var(--eixo-danger)]' : 'text-[#b45309]'}>
                                {isBalancedArea ? '' : `${remainingSize.toFixed(2)} ha`}
                            </span>
                        </div>
                    </div>
                )}

                {submitError && (
                    <div className="flex items-start gap-3 rounded-2xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3">
                        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--eixo-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-sm font-semibold text-[var(--eixo-danger)]">{submitError}</p>
                    </div>
                )}
                {submitSuccess && (
                    <div className="flex items-start gap-3 rounded-2xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-4 py-3">
                        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--eixo-success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        <p className="text-sm font-semibold text-[var(--eixo-success)]">{submitSuccess}</p>
                    </div>
                )}

                {currentStep === 'divisions' && (
                    <div className="rounded-2xl border border-[#d9ead0] bg-[var(--eixo-green-soft)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--eixo-graphite)]">Capacidade total estimada</p>
                        <p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{totalCapacityUa.toFixed(1)} UA</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                            Soma de área útil × lotação dos pastos produtivos.
                        </p>
                    </div>
                )}

                {currentStep === 'divisions' && activeFarm && (
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => void saveDivisions('save-and-return')}
                            disabled={isSaveDisabled}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] transition-colors duration-200 hover:bg-[#ece9e6] disabled:cursor-not-allowed disabled:bg-[#d6d3d1]"
                        >
                            {isSubmitting ? 'Salvando...' : 'Salvar e fechar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => void saveDivisions('complete')}
                            disabled={isSaveDisabled}
                            className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors duration-200 hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:bg-[var(--eixo-border-strong)]"
                        >
                            {isSubmitting ? 'Salvando...' : 'Salvar e continuar editando'}
                        </button>
                    </div>
                )}
            </form>
        </div>
    );
};

export default FarmRegistrationForm;
