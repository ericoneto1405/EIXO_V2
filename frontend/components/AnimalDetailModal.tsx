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

type ModalTab = 'edit' | 'weighing' | 'paddock' | 'events' | 'sanitary';

const EVENT_TYPE_LABELS: Record<string, string> = {
    NASCIMENTO: 'Nascimento',
    COMPRA: 'Compra',
    VENDA: 'Venda',
    MORTE: 'Morte',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
    NASCIMENTO: 'bg-[var(--eixo-green-soft)] text-[#3d6b38]',
    COMPRA: 'bg-[#e8eef8] text-[#3a5799]',
    VENDA: 'bg-[#f7f1df] text-amber-800',
    MORTE: 'bg-[#fff2ef] text-[var(--eixo-danger)]',
};

const SANITARY_TIPO_LABELS: Record<string, string> = {
    VACINA: 'Vacina',
    VERMIFUGO: 'Vermífugo',
    TRATAMENTO: 'Tratamento',
};

const SANITARY_TIPO_COLORS: Record<string, string> = {
    VACINA: 'bg-[#e5f0ef] text-[#2d6b62]',
    VERMIFUGO: 'bg-[#ede8f5] text-[#5e3d8c]',
    TRATAMENTO: 'bg-[#fef3e2] text-[#7a5628]',
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
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
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

    // Edição de dados básicos
    const [editBrinco, setEditBrinco] = useState('');
    const [editRaca, setEditRaca] = useState('');
    const [breedSuggestions, setBreedSuggestions] = useState<string[]>([]);
    const [editSexo, setEditSexo] = useState('');
    const [editCategoria, setEditCategoria] = useState('');
    const [editDataNasc, setEditDataNasc] = useState('');
    const [editRegistro, setEditRegistro] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editMsg, setEditMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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

    const loadBreedSuggestions = useCallback(async () => {
        const farmId = (animal as any)?.farmId;
        if (!farmId) { setBreedSuggestions([]); return; }
        try {
            const response = await fetch(buildApiUrl(`/farms/${farmId}/breeds`), { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            if (response.ok) {
                setBreedSuggestions((payload.breeds || []).map((b: { name: string }) => b.name));
            }
        } catch {
            // silently fail
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
            loadBreedSuggestions();
            loadHerdEvents();
            loadSanitaryRecords();
            setMovePaddockId('');
            setMoveStartAt(new Date().toISOString().slice(0, 10));
            setMoveNotes('');
            // Pré-preencher campos de edição
            const a = animal as HerdAnimal;
            setEditBrinco(a.brinco ?? '');
            setEditRaca(a.raca ?? '');
            setEditSexo((a as any).sexoRaw ?? (a.sexo === 'Macho' ? 'MACHO' : a.sexo === 'Fêmea' ? 'FEMEA' : ''));
            setEditCategoria(a.categoria ?? '');
            setEditDataNasc(a.dataNascimento ? a.dataNascimento.slice(0, 10) : '');
            setEditRegistro(a.registro ?? '');
            setEditMsg(null);
        } else {
            setWeighingHistory([]);
            setPaddockMoves([]);
            setPaddockOptions([]);
            setBreedSuggestions([]);
            setHerdEvents([]);
            setSanitaryRecords([]);
        }
    }, [animalId, loadWeighings, loadPaddockMoves, loadPaddockOptions, loadBreedSuggestions, loadHerdEvents, loadSanitaryRecords]);

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

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animalId) return;
        setEditMsg(null);
        if (!editBrinco.trim()) {
            setEditMsg({ text: 'O brinco não pode ser vazio.', type: 'error' });
            return;
        }
        setIsSavingEdit(true);
        try {
            const res = await fetch(buildApiUrl(`/animals/${animalId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    brinco: editBrinco.trim(),
                    raca: editRaca || null,
                    sexo: editSexo || null,
                    categoria: editCategoria || null,
                    dataNascimento: editDataNasc || null,
                    registro: editRegistro || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao salvar.');
            setEditMsg({ text: 'Dados atualizados com sucesso!', type: 'success' });
            onAnimalUpdated?.();
        } catch (err: any) {
            setEditMsg({ text: err?.message ?? 'Erro ao salvar.', type: 'error' });
        } finally {
            setIsSavingEdit(false);
        }
    };

    if (!animal) return null;

    const detailItems = useMemo(() => {
        if (!animal) return [];
        const a = animal as HerdAnimal;
        const baseItems = [
            { label: 'Raça', value: a.raca || '—' },
            { label: 'Sexo', value: a.sexo || '—' },
            { label: 'Categoria', value: a.categoria || '—' },
            { label: 'Nascimento', value: a.dataNascimento ? new Date(a.dataNascimento).toLocaleDateString('pt-BR') : '—' },
            { label: 'Idade', value: calculateAge(a.dataNascimento) },
            { label: 'Peso Atual', value: a.pesoAtual != null ? `${a.pesoAtual} kg` : '—' },
            { label: 'GMD 30 dias', value: (a as any).gmd30 != null ? `${((a as any).gmd30 as number).toFixed(2)} kg/dia` : '—' },
            { label: 'GMD último intervalo', value: ((a as any).gmdLast ?? a.gmd) != null ? `${(((a as any).gmdLast ?? a.gmd) as number).toFixed(2)} kg/dia` : '—' },
            { label: 'Pasto atual', value: a.currentPaddockName || '—' },
        ];
        if (resolvedMode !== 'PO') return baseItems;
        return [
            { label: 'Nome', value: a.nome || '—' },
            { label: 'Registro', value: a.registro || '—' },
            ...baseItems,
        ];
    }, [animal, resolvedMode]);

    const currentPaddockMove = useMemo(() => {
        if (!paddockMoves.length) return null;
        return paddockMoves.find((move) => !move.endAt) || paddockMoves[0];
    }, [paddockMoves]);

    // Preferência: gmd30 (mais estável); fallback para gmdLast ou gmd
    const gmdAtual: number | null =
        typeof (animal as any)?.gmd30 === 'number' ? (animal as any).gmd30 :
        typeof (animal as any)?.gmdLast === 'number' ? (animal as any).gmdLast :
        typeof (animal as any)?.gmd === 'number' ? (animal as any).gmd : null;
    const gmdDelta = gmdAtual !== null && nutritionPlanMeta !== null ? gmdAtual - nutritionPlanMeta : null;

    const inputClass = 'mt-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none';
    const labelClass = 'text-xs font-medium text-[var(--eixo-text-muted)]';
    const btnPrimary = 'h-10 rounded-xl bg-[var(--eixo-green)] px-4 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-70';
    const tabClass = (tab: ModalTab) =>
        `${activeTab === tab
            ? 'border-[var(--eixo-green)] text-[var(--eixo-green)] font-semibold'
            : 'border-transparent text-[var(--eixo-text-muted)] hover:text-[var(--eixo-green)] hover:border-[var(--eixo-border)]'
        } whitespace-nowrap py-3 px-1 border-b-2 text-sm transition-colors`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div
                className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'scale-in 0.18s ease-out forwards' }}
            >
                {/* Header */}
                <header className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-5 flex-shrink-0">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)] mb-0.5">Animal</p>
                        <h2 className="font-brand text-xl font-extrabold text-[var(--eixo-text)]">
                            {(animal as HerdAnimal).identificacao || animal.brinco || 'Sem identificação'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Fechar"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)] transition-colors"
                    >
                        <CloseIcon />
                    </button>
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                    {/* Informações Gerais */}
                    <section>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b0a08a] mb-3">Informações Gerais</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 rounded-2xl bg-[var(--eixo-surface)] border border-[var(--eixo-border)] p-4">
                            {detailItems.map((item) => (
                                <div key={item.label}>
                                    <p className="text-xs text-[var(--eixo-text-muted)]">{item.label}</p>
                                    <p className="font-semibold text-[var(--eixo-text)] text-sm">{item.value ?? '—'}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Nutrição */}
                    <section>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b0a08a] mb-3">Nutrição atual</p>
                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm text-[var(--eixo-text-muted)]">
                            {isLoadingNutrition ? (
                                <span>Carregando plano...</span>
                            ) : nutritionError ? (
                                <span className="text-[var(--eixo-danger)]">{nutritionError}</span>
                            ) : nutritionPlanName ? (
                                <div className="space-y-1">
                                    <div className="font-semibold text-[var(--eixo-text)]">{nutritionPlanName}</div>
                                    {nutritionPlanPhase && <div className="text-xs text-[var(--eixo-text-muted)]">Fase: {nutritionPlanPhase}</div>}
                                    {nutritionPlanMeta !== null && <div className="text-xs text-[var(--eixo-text-muted)]">Meta GMD: {nutritionPlanMeta.toFixed(2)} kg/dia</div>}
                                    {gmdAtual !== null && <div className="text-xs text-[var(--eixo-text-muted)]">GMD 30 dias: {gmdAtual.toFixed(2)} kg/dia</div>}
                                    {gmdDelta !== null && (
                                        <div className={`text-xs font-medium ${gmdDelta >= 0 ? 'text-[#3d6b38]' : 'text-[var(--eixo-danger)]'}`}>
                                            Delta: {gmdDelta >= 0 ? '+' : ''}{gmdDelta.toFixed(2)} kg/dia
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <span>Sem plano ativo.</span>
                            )}
                        </div>
                    </section>

                    {/* Abas de Histórico */}
                    <section>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b0a08a] mb-3">Histórico</p>
                        <div className="border-b border-[var(--eixo-border)]">
                            <nav className="-mb-px flex gap-4 overflow-x-auto" aria-label="Abas">
                                <button onClick={() => setActiveTab('edit')} className={tabClass('edit')}>Editar</button>
                                <button onClick={() => setActiveTab('weighing')} className={tabClass('weighing')}>Pesagens</button>
                                <button onClick={() => setActiveTab('paddock')} className={tabClass('paddock')}>Pasto</button>
                                <button onClick={() => setActiveTab('events')} className={tabClass('events')}>Eventos</button>
                                <button onClick={() => setActiveTab('sanitary')} className={tabClass('sanitary')}>Sanitário</button>
                            </nav>
                        </div>

                        <div className="mt-5">
                            {/* ABA: Editar */}
                            {activeTab === 'edit' && (
                                <form onSubmit={handleSaveEdit} className="space-y-4">
                                    {editMsg && (
                                        <div className={`rounded-xl border px-4 py-3 text-sm ${
                                            editMsg.type === 'success'
                                                ? 'border-green-200 bg-green-50 text-green-700'
                                                : 'border-red-200 bg-red-50 text-red-700'
                                        }`}>
                                            {editMsg.text}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className={labelClass}>Brinco *</label>
                                            <input
                                                type="text"
                                                value={editBrinco}
                                                onChange={e => setEditBrinco(e.target.value)}
                                                className={`${inputClass} w-full`}
                                                placeholder="Ex: 1234"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Registro</label>
                                            <input
                                                type="text"
                                                value={editRegistro}
                                                onChange={e => setEditRegistro(e.target.value)}
                                                className={`${inputClass} w-full`}
                                                placeholder="Opcional"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Raça</label>
                                            <input
                                                type="text"
                                                list="breed-suggestions-modal"
                                                value={editRaca}
                                                onChange={e => setEditRaca(e.target.value)}
                                                className={`${inputClass} w-full`}
                                                placeholder="Digite ou selecione a raça"
                                            />
                                            {breedSuggestions.length > 0 && (
                                                <datalist id="breed-suggestions-modal">
                                                    {breedSuggestions.map((name) => (
                                                        <option key={name} value={name} />
                                                    ))}
                                                </datalist>
                                            )}
                                        </div>
                                        <div>
                                            <label className={labelClass}>Sexo</label>
                                            <select
                                                value={editSexo}
                                                onChange={e => setEditSexo(e.target.value)}
                                                className={`${inputClass} w-full`}
                                            >
                                                <option value="">Não informado</option>
                                                <option value="MACHO">Macho</option>
                                                <option value="FEMEA">Fêmea</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Categoria</label>
                                            <input
                                                type="text"
                                                value={editCategoria}
                                                onChange={e => setEditCategoria(e.target.value)}
                                                className={`${inputClass} w-full`}
                                                placeholder="Ex: Boi, Vaca, Novilha…"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Data de Nascimento</label>
                                            <input
                                                type="date"
                                                value={editDataNasc}
                                                onChange={e => setEditDataNasc(e.target.value)}
                                                className={`${inputClass} w-full`}
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-1">
                                        <button type="submit" className={btnPrimary} disabled={isSavingEdit}>
                                            {isSavingEdit ? 'Salvando…' : 'Salvar alterações'}
                                        </button>
                                    </div>
                                </form>
                            )}

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
                                    {weighingError && <p className="mb-4 text-sm text-[var(--eixo-danger)]">{weighingError}</p>}
                                    {isLoadingWeighings ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando pesagens...</p>
                                    ) : weighingHistory.length === 0 ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma pesagem registrada.</p>
                                    ) : (
                                        <table className="w-full text-sm text-left">
                                            <thead>
                                                <tr className="bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] text-xs uppercase">
                                                    <th className="px-4 py-3 rounded-tl-xl">Data</th>
                                                    <th className="px-4 py-3">Peso</th>
                                                    <th className="px-4 py-3 rounded-tr-xl">GMD</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {weighingHistory.map((item) => (
                                                    <tr key={item.id} className="border-b border-[var(--eixo-border)]">
                                                        <td className="px-4 py-3 text-[var(--eixo-text)]">{new Date(item.data).toLocaleDateString('pt-BR')}</td>
                                                        <td className="px-4 py-3 text-[var(--eixo-text)]">{item.peso} kg</td>
                                                        <td className="px-4 py-3 font-medium text-[#3d6b38]">{item.gmd.toFixed(2)} kg</td>
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
                                    <div className="mb-4 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm">
                                        <div className="text-xs uppercase text-[var(--eixo-text-muted)] tracking-wide mb-0.5">Pasto atual</div>
                                        <div className="font-semibold text-[var(--eixo-text)]">{currentPaddockMove?.paddockName || '—'}</div>
                                        <div className="text-xs text-[var(--eixo-text-muted)]">
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
                                    {paddockMoveError && <p className="mb-4 text-sm text-[var(--eixo-danger)]">{paddockMoveError}</p>}
                                    {isLoadingPaddockMoves ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando movimentações...</p>
                                    ) : paddockMoves.length === 0 ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma movimentação registrada.</p>
                                    ) : (
                                        <table className="w-full text-sm text-left">
                                            <thead>
                                                <tr className="bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] text-xs uppercase">
                                                    <th className="px-4 py-3 rounded-tl-xl">Pasto</th>
                                                    <th className="px-4 py-3">Entrada</th>
                                                    <th className="px-4 py-3 rounded-tr-xl">Saída</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paddockMoves.map((move) => (
                                                    <tr key={move.id} className="border-b border-[var(--eixo-border)]">
                                                        <td className="px-4 py-3 text-[var(--eixo-text)]">{move.paddockName || '—'}</td>
                                                        <td className="px-4 py-3 text-[var(--eixo-text)]">{new Date(move.startAt).toLocaleDateString('pt-BR')}</td>
                                                        <td className="px-4 py-3 text-[var(--eixo-text)]">{move.endAt ? new Date(move.endAt).toLocaleDateString('pt-BR') : '—'}</td>
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
                                    {eventsError && <p className="mb-4 text-sm text-[var(--eixo-danger)]">{eventsError}</p>}
                                    {isLoadingEvents ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando eventos...</p>
                                    ) : herdEvents.length === 0 ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum evento registrado para este animal.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {herdEvents.map((ev) => (
                                                <div key={ev.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${EVENT_TYPE_COLORS[ev.type] || 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>
                                                        {EVENT_TYPE_LABELS[ev.type] || ev.type}
                                                    </span>
                                                    <div className="flex-1 text-sm text-[var(--eixo-text)]">
                                                        <span className="font-medium">{new Date(ev.date).toLocaleDateString('pt-BR')}</span>
                                                        {ev.peso !== null && <span className="ml-3 text-[var(--eixo-text-muted)]">{ev.peso} kg</span>}
                                                        {ev.valor !== null && <span className="ml-3 text-[var(--eixo-text-muted)]">R$ {ev.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                                                        {ev.origem && <span className="ml-3 text-[var(--eixo-text-muted)]">Origem: {ev.origem}</span>}
                                                        {ev.destino && <span className="ml-3 text-[var(--eixo-text-muted)]">Destino: {ev.destino}</span>}
                                                        {ev.observacoes && <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{ev.observacoes}</p>}
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
                                    {sanitaryError && <p className="mb-4 text-sm text-[var(--eixo-danger)]">{sanitaryError}</p>}
                                    {isLoadingSanitary ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando registros...</p>
                                    ) : sanitaryRecords.length === 0 ? (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum registro sanitário para este animal.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {sanitaryRecords.map((rec) => (
                                                <div key={rec.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${SANITARY_TIPO_COLORS[rec.tipo] || 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>
                                                        {SANITARY_TIPO_LABELS[rec.tipo] || rec.tipo}
                                                    </span>
                                                    <div className="flex-1 text-sm text-[var(--eixo-text)]">
                                                        <span className="font-medium">{rec.produto}</span>
                                                        <span className="ml-3 text-[var(--eixo-text-muted)]">{new Date(rec.date).toLocaleDateString('pt-BR')}</span>
                                                        {rec.dose && <span className="ml-3 text-[var(--eixo-text-muted)]">Dose: {rec.dose}</span>}
                                                        {rec.proximaAplicacao && (
                                                            <span className="ml-3 text-[var(--eixo-text-muted)]">
                                                                Próxima: {new Date(rec.proximaAplicacao).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                        {rec.observacoes && <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{rec.observacoes}</p>}
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
            `}</style>
        </div>
    );
};

export default AnimalDetailModal;
