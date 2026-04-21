import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animal, Paddock, PaddockMove, WeighingHistory } from '../types';
import {
    HerdAnimal,
    HerdEvent,
    HerdType,
    SanitaryRecord,
    createHerdEvent,
    createPaddockMove,
    createSanitaryRecord,
    createWeighing,
    listHerdEvents,
    listPaddockMoves,
    listSanitaryRecords,
    listWeighings,
} from '../adapters/herdApi';
import { getCurrentNutrition } from '../adapters/nutritionApi';
import { buildApiUrl } from '../api';

interface AnimalDetailModalProps {
    animal: (Animal | HerdAnimal) | null;
    mode?: HerdType;
    herdType?: HerdType;
    onClose: () => void;
    onAnimalUpdated?: () => void;
}

type ModalTab = 'weighing' | 'paddock' | 'events' | 'sanitary';

const EVENT_TYPE_LABELS: Record<string, string> = {
    NASCIMENTO: 'Nascimento',
    COMPRA: 'Compra',
    VENDA: 'Venda',
    MORTE: 'Morte',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
    NASCIMENTO: 'bg-green-100 text-green-800',
    COMPRA: 'bg-blue-100 text-blue-800',
    VENDA: 'bg-amber-100 text-amber-800',
    MORTE: 'bg-red-100 text-red-800',
};

const SANITARY_TIPO_LABELS: Record<string, string> = {
    VACINA: 'Vacina',
    VERMIFUGO: 'Vermífugo',
    TRATAMENTO: 'Tratamento',
};

const SANITARY_TIPO_COLORS: Record<string, string> = {
    VACINA: 'bg-teal-100 text-teal-800',
    VERMIFUGO: 'bg-purple-100 text-purple-800',
    TRATAMENTO: 'bg-orange-100 text-orange-800',
};

const calculateAge = (birthDateString?: string | null): string => {
    if (!birthDateString) return '—';
    const birthDate = new Date(birthDateString);
    if (Number.isNaN(birthDate.getTime())) return '—';
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
        years--;
        months = (months + 12) % 12;
    }
    if (years > 0) return `${years}a ${months}m`;
    return `${months}m`;
};

const CloseIcon: React.FC = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const CattleIcon: React.FC = () => (
    <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M18.8 6.2c.5-.5.8-1.2.8-2s-.3-1.5-.8-2c-.5-.5-1.2-.8-2-.8s-1.5.3-2 .8L12 5 9.2 2.2c-.5-.5-1.2-.8-2-.8s-1.5.3-2 .8c-.5-.5-.8 1.2-.8 2s.3 1.5.8 2L8 9v5H7c-1.1 0-2 .9-2 2v1c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-1c0-1.1-.9-2-2-2h-1V9l2.8-2.8z" />
    </svg>
);

const AnimalDetailModal: React.FC<AnimalDetailModalProps> = ({
    animal,
    mode,
    herdType,
    onClose,
    onAnimalUpdated,
}) => {
    const resolvedMode: HerdType = mode ?? herdType ?? 'COMMERCIAL';
    const [activeTab, setActiveTab] = useState<ModalTab>('weighing');

    // Pesagens
    const [weighingHistory, setWeighingHistory] = useState<WeighingHistory[]>([]);
    const [weighingError, setWeighingError] = useState<string | null>(null);
    const [isLoadingWeighings, setIsLoadingWeighings] = useState(false);
    const [weighingDate, setWeighingDate] = useState('');
    const [weighingPeso, setWeighingPeso] = useState('');
    const [isSavingWeighing, setIsSavingWeighing] = useState(false);

    // Nutrição
    const [nutritionPlanName, setNutritionPlanName] = useState<string | null>(null);
    const [nutritionPlanMeta, setNutritionPlanMeta] = useState<number | null>(null);
    const [nutritionPlanPhase, setNutritionPlanPhase] = useState<string | null>(null);
    const [isLoadingNutrition, setIsLoadingNutrition] = useState(false);
    const [nutritionError, setNutritionError] = useState<string | null>(null);

    // Movimentação de pasto
    const [paddockMoves, setPaddockMoves] = useState<PaddockMove[]>([]);
    const [isLoadingPaddockMoves, setIsLoadingPaddockMoves] = useState(false);
    const [paddockMoveError, setPaddockMoveError] = useState<string | null>(null);
    const [paddockOptions, setPaddockOptions] = useState<Paddock[]>([]);
    const [movePaddockId, setMovePaddockId] = useState('');
    const [moveStartAt, setMoveStartAt] = useState(new Date().toISOString().slice(0, 10));
    const [moveNotes, setMoveNotes] = useState('');
    const [isSavingPaddockMove, setIsSavingPaddockMove] = useState(false);

    // Eventos de inventário
    const [herdEvents, setHerdEvents] = useState<HerdEvent[]>([]);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [eventsError, setEventsError] = useState<string | null>(null);
    const [eventType, setEventType] = useState<string>('COMPRA');
    const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
    const [eventPeso, setEventPeso] = useState('');
    const [eventValor, setEventValor] = useState('');
    const [eventOrigem, setEventOrigem] = useState('');
    const [eventDestino, setEventDestino] = useState('');
    const [eventObs, setEventObs] = useState('');
    const [isSavingEvent, setIsSavingEvent] = useState(false);

    // Manejo sanitário
    const [sanitaryRecords, setSanitaryRecords] = useState<SanitaryRecord[]>([]);
    const [isLoadingSanitary, setIsLoadingSanitary] = useState(false);
    const [sanitaryError, setSanitaryError] = useState<string | null>(null);
    const [sanitaryTipo, setSanitaryTipo] = useState<string>('VACINA');
    const [sanitaryProduto, setSanitaryProduto] = useState('');
    const [sanitaryDate, setSanitaryDate] = useState(new Date().toISOString().slice(0, 10));
    const [sanitaryDose, setSanitaryDose] = useState('');
    const [sanitaryProxima, setSanitaryProxima] = useState('');
    const [sanitaryObs, setSanitaryObs] = useState('');
    const [isSavingSanitary, setIsSavingSanitary] = useState(false);

    const animalId = animal?.id;

    // ---- Loaders ----

    const loadWeighings = useCallback(async () => {
        if (!animalId) { setWeighingHistory([]); return; }
        setIsLoadingWeighings(true);
        setWeighingError(null);
        try {
            const history = await listWeighings(animalId, resolvedMode);
            setWeighingHistory(history || []);
        } catch (error: any) {
            setWeighingError(error?.message || 'Não foi possível listar pesagens.');
            setWeighingHistory([]);
        } finally {
            setIsLoadingWeighings(false);
        }
    }, [animalId, resolvedMode]);

    const loadPaddockMoves = useCallback(async () => {
        if (!animalId) { setPaddockMoves([]); return; }
        setIsLoadingPaddockMoves(true);
        setPaddockMoveError(null);
        try {
            const moves = await listPaddockMoves(animalId, resolvedMode);
            setPaddockMoves(moves || []);
        } catch (error: any) {
            setPaddockMoveError(error?.message || 'Não foi possível listar movimentações de pasto.');
            setPaddockMoves([]);
        } finally {
            setIsLoadingPaddockMoves(false);
        }
    }, [animalId, resolvedMode]);

    const loadPaddockOptions = useCallback(async () => {
        const farmId = (animal as any)?.farmId;
        if (!farmId) { setPaddockOptions([]); return; }
        try {
            const response = await fetch(buildApiUrl(`/pastos?farmId=${farmId}`), { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar pastos.');
            setPaddockOptions(payload.items || []);
        } catch {
            setPaddockOptions([]);
        }
    }, [animal]);

    const loadHerdEvents = useCallback(async () => {
        if (!animalId) { setHerdEvents([]); return; }
        setIsLoadingEvents(true);
        setEventsError(null);
        try {
            const events = await listHerdEvents(animalId, resolvedMode);
            setHerdEvents(events || []);
        } catch (error: any) {
            setEventsError(error?.message || 'Não foi possível listar eventos.');
            setHerdEvents([]);
        } finally {
            setIsLoadingEvents(false);
        }
    }, [animalId, resolvedMode]);

    const loadSanitaryRecords = useCallback(async () => {
        if (!animalId) { setSanitaryRecords([]); return; }
        setIsLoadingSanitary(true);
        setSanitaryError(null);
        try {
            const records = await listSanitaryRecords(animalId, resolvedMode);
            setSanitaryRecords(records || []);
        } catch (error: any) {
            setSanitaryError(error?.message || 'Não foi possível listar registros sanitários.');
            setSanitaryRecords([]);
        } finally {
            setIsLoadingSanitary(false);
        }
    }, [animalId, resolvedMode]);

    useEffect(() => {
        if (animalId) {
            loadWeighings();
            loadPaddockMoves();
            loadPaddockOptions();
            loadHerdEvents();
            loadSanitaryRecords();
            setMovePaddockId('');
            setMoveStartAt(new Date().toISOString().slice(0, 10));
            setMoveNotes('');
        } else {
            setWeighingHistory([]);
            setPaddockMoves([]);
            setPaddockOptions([]);
            setHerdEvents([]);
            setSanitaryRecords([]);
        }
    }, [animalId, loadWeighings, loadPaddockMoves, loadPaddockOptions, loadHerdEvents, loadSanitaryRecords]);

    useEffect(() => {
        const farmId = (animal as HerdAnimal)?.farmId;
        if (!animalId || !farmId) {
            setNutritionPlanName(null);
            setNutritionPlanMeta(null);
            setNutritionPlanPhase(null);
            setNutritionError(null);
            return;
        }
        const loadNutrition = async () => {
            setIsLoadingNutrition(true);
            setNutritionError(null);
            try {
                const payload = await getCurrentNutrition({
                    farmId,
                    animalId: resolvedMode === 'COMMERCIAL' ? animalId : undefined,
                    poAnimalId: resolvedMode === 'PO' ? animalId : undefined,
                });
                setNutritionPlanName(payload.plan?.nome || null);
                setNutritionPlanMeta(payload.plan?.metaGmd ?? null);
                setNutritionPlanPhase(payload.plan?.fase || null);
            } catch (error: any) {
                setNutritionError(error?.message || 'Erro ao carregar nutrição.');
                setNutritionPlanName(null);
                setNutritionPlanMeta(null);
                setNutritionPlanPhase(null);
            } finally {
                setIsLoadingNutrition(false);
            }
        };
        loadNutrition();
    }, [animalId, resolvedMode, animal]);

    // ---- Handlers ----

    const handleAddWeighing = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalId) return;
        if (!weighingDate || !weighingPeso) { setWeighingError('Informe data e peso da pesagem.'); return; }
        const parsedPeso = Number(weighingPeso);
        if (!parsedPeso || parsedPeso <= 0) { setWeighingError('Peso inválido.'); return; }
        setIsSavingWeighing(true);
        setWeighingError(null);
        try {
            await createWeighing(animalId, resolvedMode, { data: weighingDate, peso: parsedPeso });
            setWeighingDate('');
            setWeighingPeso('');
            await loadWeighings();
            onAnimalUpdated?.();
        } catch {
            setWeighingError('Não foi possível salvar a pesagem.');
        } finally {
            setIsSavingWeighing(false);
        }
    };

    const handleAddPaddockMove = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalId) return;
        if (!movePaddockId) { setPaddockMoveError('Selecione o pasto.'); return; }
        setIsSavingPaddockMove(true);
        setPaddockMoveError(null);
        try {
            await createPaddockMove(animalId, resolvedMode, {
                paddockId: movePaddockId,
                startAt: moveStartAt || undefined,
                notes: moveNotes || undefined,
            });
            setMovePaddockId('');
            setMoveStartAt(new Date().toISOString().slice(0, 10));
            setMoveNotes('');
            await loadPaddockMoves();
            onAnimalUpdated?.();
        } catch (error: any) {
            setPaddockMoveError(error?.message || 'Não foi possível movimentar o animal.');
        } finally {
            setIsSavingPaddockMove(false);
        }
    };

    const handleAddEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalId) return;
        if (!eventDate) { setEventsError('Informe a data do evento.'); return; }
        setIsSavingEvent(true);
        setEventsError(null);
        try {
            await createHerdEvent(animalId, resolvedMode, {
                type: eventType,
                date: eventDate,
                peso: eventPeso ? Number(eventPeso) : undefined,
                valor: eventValor ? Number(eventValor) : undefined,
                origem: eventOrigem || undefined,
                destino: eventDestino || undefined,
                observacoes: eventObs || undefined,
            });
            setEventPeso('');
            setEventValor('');
            setEventOrigem('');
            setEventDestino('');
            setEventObs('');
            await loadHerdEvents();
        } catch (error: any) {
            setEventsError(error?.message || 'Não foi possível salvar o evento.');
        } finally {
            setIsSavingEvent(false);
        }
    };

    const handleAddSanitary = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalId) return;
        if (!sanitaryProduto.trim()) { setSanitaryError('Informe o nome do produto.'); return; }
        if (!sanitaryDate) { setSanitaryError('Informe a data.'); return; }
        setIsSavingSanitary(true);
        setSanitaryError(null);
        try {
            await createSanitaryRecord(animalId, resolvedMode, {
                tipo: sanitaryTipo,
                produto: sanitaryProduto,
                date: sanitaryDate,
                dose: sanitaryDose || undefined,
                proximaAplicacao: sanitaryProxima || undefined,
                observacoes: sanitaryObs || undefined,
            });
            setSanitaryProduto('');
            setSanitaryDose('');
            setSanitaryProxima('');
            setSanitaryObs('');
            await loadSanitaryRecords();
        } catch (error: any) {
            setSanitaryError(error?.message || 'Não foi possível salvar o registro.');
        } finally {
            setIsSavingSanitary(false);
        }
    };

    if (!animal) return null;

    const detailItems = useMemo(() => {
        if (!animal) return [];
        const baseItems = [
            { label: 'Raça', value: animal.raca },
            { label: 'Sexo', value: animal.sexo },
            { label: 'Idade', value: calculateAge(animal.dataNascimento) },
            { label: 'Peso Atual', value: animal.pesoAtual !== undefined && animal.pesoAtual !== null ? `${animal.pesoAtual} kg` : '—' },
            { label: 'GMD atual', value: animal.gmd !== undefined && animal.gmd !== null ? `${animal.gmd.toFixed(2)} kg` : '—' },
            { label: 'Nascimento', value: animal.dataNascimento ? new Date(animal.dataNascimento).toLocaleDateString('pt-BR') : '—' },
        ];
        if (resolvedMode !== 'PO') return baseItems;
        const poAnimal = animal as HerdAnimal;
        return [
            { label: 'Nome', value: poAnimal.nome || '—' },
            { label: 'Registro', value: poAnimal.registro || '—' },
            { label: 'Categoria', value: poAnimal.categoria || '—' },
            ...baseItems,
        ];
    }, [animal, resolvedMode]);

    const currentPaddockMove = useMemo(() => {
        if (!paddockMoves.length) return null;
        return paddockMoves.find((move) => !move.endAt) || paddockMoves[0];
    }, [paddockMoves]);

    const gmdAtual = typeof (animal as any)?.gmd === 'number' ? (animal as any).gmd : null;
    const gmdDelta = gmdAtual !== null && nutritionPlanMeta !== null ? gmdAtual - nutritionPlanMeta : null;

    const inputClass = 'mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-gray-600 dark:bg-dark-card';
    const labelClass = 'text-xs font-medium text-gray-500 dark:text-gray-400';
    const btnPrimary = 'h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70';
    const tabClass = (tab: ModalTab) =>
        `${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors`;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div
                className="bg-light dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center">
                        <CattleIcon />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Detalhes:{' '}
                            <span className="text-primary">
                                {(animal as HerdAnimal).identificacao || animal.brinco || 'Sem identificação'}
                            </span>
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
                        <CloseIcon />
                    </button>
                </header>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1">
                    {/* Informações Gerais */}
                    <section>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Informações Gerais</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 bg-gray-100 dark:bg-gray-900/50 p-4 rounded-lg">
                            {detailItems.map((item) => (
                                <div key={item.label}>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
                                    <p className="font-semibold text-gray-800 dark:text-gray-100">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Nutrição */}
                    <section className="mt-6">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Nutrição atual</h3>
                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-dark-card dark:text-gray-300">
                            {isLoadingNutrition ? (
                                <span>Carregando plano...</span>
                            ) : nutritionError ? (
                                <span className="text-red-600 dark:text-red-400">{nutritionError}</span>
                            ) : nutritionPlanName ? (
                                <div className="space-y-1">
                                    <div className="font-semibold text-gray-900 dark:text-white">{nutritionPlanName}</div>
                                    {nutritionPlanPhase && <div className="text-xs text-gray-500">Fase: {nutritionPlanPhase}</div>}
                                    {nutritionPlanMeta !== null && <div className="text-xs text-gray-500">Meta GMD: {nutritionPlanMeta.toFixed(2)} kg</div>}
                                    {gmdAtual !== null && <div className="text-xs text-gray-500">GMD atual: {gmdAtual.toFixed(2)} kg</div>}
                                    {gmdDelta !== null && (
                                        <div className={`text-xs ${gmdDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            Delta: {gmdDelta >= 0 ? '+' : ''}{gmdDelta.toFixed(2)} kg
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span>Sem plano ativo.</span>
                            )}
                        </div>
                    </section>

                    {/* Abas de Histórico */}
                    <section className="mt-8">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Histórico</h3>
                        <div className="border-b border-gray-200 dark:border-gray-700">
                            <nav className="-mb-px flex gap-4 overflow-x-auto" aria-label="Abas">
                                <button onClick={() => setActiveTab('weighing')} className={tabClass('weighing')}>Pesagens</button>
                                <button onClick={() => setActiveTab('paddock')} className={tabClass('paddock')}>Pasto</button>
                                <button onClick={() => setActiveTab('events')} className={tabClass('events')}>Eventos</button>
                                <button onClick={() => setActiveTab('sanitary')} className={tabClass('sanitary')}>Sanitário</button>
                            </nav>
                        </div>

                        <div className="mt-6">
                            {/* ABA: Pesagens */}
                            {activeTab === 'weighing' && (
                                <>
                                    <form onSubmit={handleAddWeighing} className="mb-4 flex flex-wrap items-end gap-3">
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Data</label>
                                            <input type="date" value={weighingDate} onChange={(e) => setWeighingDate(e.target.value)} className={inputClass} required />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Peso (kg)</label>
                                            <input type="number" step="0.01" value={weighingPeso} onChange={(e) => setWeighingPeso(e.target.value)} className={inputClass} required />
                                        </div>
                                        <button type="submit" className={btnPrimary} disabled={isSavingWeighing}>
                                            {isSavingWeighing ? 'Salvando...' : 'Salvar pesagem'}
                                        </button>
                                    </form>
                                    {weighingError && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{weighingError}</p>}
                                    {isLoadingWeighings ? (
                                        <p className="text-sm text-gray-500">Carregando pesagens...</p>
                                    ) : weighingHistory.length === 0 ? (
                                        <p className="text-sm text-gray-500">Nenhuma pesagem registrada.</p>
                                    ) : (
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs uppercase bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400">
                                                <tr>
                                                    <th className="px-4 py-3">Data</th>
                                                    <th className="px-4 py-3">Peso</th>
                                                    <th className="px-4 py-3">GMD</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {weighingHistory.map((item) => (
                                                    <tr key={item.id} className="border-b dark:border-gray-700">
                                                        <td className="px-4 py-3">{new Date(item.data).toLocaleDateString('pt-BR')}</td>
                                                        <td className="px-4 py-3">{item.peso} kg</td>
                                                        <td className="px-4 py-3 font-medium text-green-500">{item.gmd.toFixed(2)} kg</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            )}

                            {/* ABA: Pasto */}
                            {activeTab === 'paddock' && (
                                <>
                                    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-dark-card">
                                        <div className="text-xs uppercase text-gray-400">Pasto atual</div>
                                        <div className="font-semibold text-gray-900 dark:text-white">{currentPaddockMove?.paddockName || '—'}</div>
                                        <div className="text-xs text-gray-500">
                                            Entrada: {currentPaddockMove?.startAt ? new Date(currentPaddockMove.startAt).toLocaleDateString('pt-BR') : '—'}
                                        </div>
                                    </div>
                                    <form onSubmit={handleAddPaddockMove} className="mb-4 flex flex-wrap items-end gap-3">
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Pasto</label>
                                            <select value={movePaddockId} onChange={(e) => setMovePaddockId(e.target.value)} className={inputClass} required>
                                                <option value="">Selecione</option>
                                                {paddockOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Entrada</label>
                                            <input type="date" value={moveStartAt} onChange={(e) => setMoveStartAt(e.target.value)} className={inputClass} />
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-[160px]">
                                            <label className={labelClass}>Observações</label>
                                            <input type="text" value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} className={inputClass} placeholder="Opcional" />
                                        </div>
                                        <button type="submit" className={btnPrimary} disabled={isSavingPaddockMove}>
                                            {isSavingPaddockMove ? 'Salvando...' : 'Mover'}
                                        </button>
                                    </form>
                                    {paddockMoveError && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{paddockMoveError}</p>}
                                    {isLoadingPaddockMoves ? (
                                        <p className="text-sm text-gray-500">Carregando movimentações...</p>
                                    ) : paddockMoves.length === 0 ? (
                                        <p className="text-sm text-gray-500">Nenhuma movimentação registrada.</p>
                                    ) : (
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs uppercase bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400">
                                                <tr>
                                                    <th className="px-4 py-3">Pasto</th>
                                                    <th className="px-4 py-3">Entrada</th>
                                                    <th className="px-4 py-3">Saída</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paddockMoves.map((move) => (
                                                    <tr key={move.id} className="border-b dark:border-gray-700">
                                                        <td className="px-4 py-3">{move.paddockName || '—'}</td>
                                                        <td className="px-4 py-3">{new Date(move.startAt).toLocaleDateString('pt-BR')}</td>
                                                        <td className="px-4 py-3">{move.endAt ? new Date(move.endAt).toLocaleDateString('pt-BR') : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            )}

                            {/* ABA: Eventos de Inventário */}
                            {activeTab === 'events' && (
                                <>
                                    <form onSubmit={handleAddEvent} className="mb-4 flex flex-wrap items-end gap-3">
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Tipo</label>
                                            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputClass}>
                                                <option value="NASCIMENTO">Nascimento</option>
                                                <option value="COMPRA">Compra</option>
                                                <option value="VENDA">Venda</option>
                                                <option value="MORTE">Morte</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Data</label>
                                            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} required />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Peso (kg)</label>
                                            <input type="number" step="0.01" value={eventPeso} onChange={(e) => setEventPeso(e.target.value)} className={inputClass} placeholder="Opcional" />
                                        </div>
                                        {(eventType === 'COMPRA' || eventType === 'VENDA') && (
                                            <div className="flex flex-col">
                                                <label className={labelClass}>Valor (R$)</label>
                                                <input type="number" step="0.01" value={eventValor} onChange={(e) => setEventValor(e.target.value)} className={inputClass} placeholder="Opcional" />
                                            </div>
                                        )}
                                        {(eventType === 'NASCIMENTO' || eventType === 'COMPRA') && (
                                            <div className="flex flex-col">
                                                <label className={labelClass}>Origem</label>
                                                <input type="text" value={eventOrigem} onChange={(e) => setEventOrigem(e.target.value)} className={inputClass} placeholder="Fazenda, reprodutor..." />
                                            </div>
                                        )}
                                        {eventType === 'VENDA' && (
                                            <div className="flex flex-col">
                                                <label className={labelClass}>Destino</label>
                                                <input type="text" value={eventDestino} onChange={(e) => setEventDestino(e.target.value)} className={inputClass} placeholder="Comprador, frigorífico..." />
                                            </div>
                                        )}
                                        <div className="flex flex-col flex-1 min-w-[160px]">
                                            <label className={labelClass}>Observações</label>
                                            <input type="text" value={eventObs} onChange={(e) => setEventObs(e.target.value)} className={inputClass} placeholder="Opcional" />
                                        </div>
                                        <button type="submit" className={btnPrimary} disabled={isSavingEvent}>
                                            {isSavingEvent ? 'Salvando...' : 'Registrar evento'}
                                        </button>
                                    </form>
                                    {eventsError && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{eventsError}</p>}
                                    {isLoadingEvents ? (
                                        <p className="text-sm text-gray-500">Carregando eventos...</p>
                                    ) : herdEvents.length === 0 ? (
                                        <p className="text-sm text-gray-500">Nenhum evento registrado para este animal.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {herdEvents.map((ev) => (
                                                <div key={ev.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-dark-card">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${EVENT_TYPE_COLORS[ev.type] || 'bg-gray-100 text-gray-800'}`}>
                                                        {EVENT_TYPE_LABELS[ev.type] || ev.type}
                                                    </span>
                                                    <div className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                                                        <span className="font-medium">{new Date(ev.date).toLocaleDateString('pt-BR')}</span>
                                                        {ev.peso !== null && <span className="ml-3 text-gray-500">{ev.peso} kg</span>}
                                                        {ev.valor !== null && <span className="ml-3 text-gray-500">R$ {ev.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                                                        {ev.origem && <span className="ml-3 text-gray-500">Origem: {ev.origem}</span>}
                                                        {ev.destino && <span className="ml-3 text-gray-500">Destino: {ev.destino}</span>}
                                                        {ev.observacoes && <p className="mt-1 text-xs text-gray-400">{ev.observacoes}</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ABA: Manejo Sanitário */}
                            {activeTab === 'sanitary' && (
                                <>
                                    <form onSubmit={handleAddSanitary} className="mb-4 flex flex-wrap items-end gap-3">
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Tipo</label>
                                            <select value={sanitaryTipo} onChange={(e) => setSanitaryTipo(e.target.value)} className={inputClass}>
                                                <option value="VACINA">Vacina</option>
                                                <option value="VERMIFUGO">Vermífugo</option>
                                                <option value="TRATAMENTO">Tratamento</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-[140px]">
                                            <label className={labelClass}>Produto</label>
                                            <input type="text" value={sanitaryProduto} onChange={(e) => setSanitaryProduto(e.target.value)} className={inputClass} placeholder="Nome do produto" required />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Data</label>
                                            <input type="date" value={sanitaryDate} onChange={(e) => setSanitaryDate(e.target.value)} className={inputClass} required />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Dose</label>
                                            <input type="text" value={sanitaryDose} onChange={(e) => setSanitaryDose(e.target.value)} className={inputClass} placeholder="Ex: 2ml" />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className={labelClass}>Próxima aplicação</label>
                                            <input type="date" value={sanitaryProxima} onChange={(e) => setSanitaryProxima(e.target.value)} className={inputClass} />
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-[160px]">
                                            <label className={labelClass}>Observações</label>
                                            <input type="text" value={sanitaryObs} onChange={(e) => setSanitaryObs(e.target.value)} className={inputClass} placeholder="Opcional" />
                                        </div>
                                        <button type="submit" className={btnPrimary} disabled={isSavingSanitary}>
                                            {isSavingSanitary ? 'Salvando...' : 'Registrar'}
                                        </button>
                                    </form>
                                    {sanitaryError && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{sanitaryError}</p>}
                                    {isLoadingSanitary ? (
                                        <p className="text-sm text-gray-500">Carregando registros...</p>
                                    ) : sanitaryRecords.length === 0 ? (
                                        <p className="text-sm text-gray-500">Nenhum registro sanitário para este animal.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {sanitaryRecords.map((rec) => (
                                                <div key={rec.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-dark-card">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SANITARY_TIPO_COLORS[rec.tipo] || 'bg-gray-100 text-gray-800'}`}>
                                                        {SANITARY_TIPO_LABELS[rec.tipo] || rec.tipo}
                                                    </span>
                                                    <div className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                                                        <span className="font-medium">{rec.produto}</span>
                                                        <span className="ml-3 text-gray-500">{new Date(rec.date).toLocaleDateString('pt-BR')}</span>
                                                        {rec.dose && <span className="ml-3 text-gray-500">Dose: {rec.dose}</span>}
                                                        {rec.proximaAplicacao && (
                                                            <span className="ml-3 text-gray-500">
                                                                Próxima: {new Date(rec.proximaAplicacao).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                        {rec.observacoes && <p className="mt-1 text-xs text-gray-400">{rec.observacoes}</p>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </section>
                </div>
            </div>
            <style>{`
                @keyframes scale-in {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .animate-scale-in {
                    animation: scale-in 0.2s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default AnimalDetailModal;
