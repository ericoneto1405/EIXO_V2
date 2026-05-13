import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createWeighing,
    createWeighingSession,
    deleteWeighingSession,
    deleteWeighing,
    getWeighingSessionItems,
    listWeighingSessionSummaries,
    listWeighingSessions,
    updateWeighing,
} from '../adapters/herdApi';
import type {
    HerdAnimal,
    HerdLot,
    HerdType,
    HerdWeighingSession,
    WeighingSessionDetail,
    WeighingSessionSummary,
} from '../adapters/herdApi';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ManualSessionWeighing {
    animalId: string;
    animalLabel: string;
    lotName: string | null;
    date: string;
    weightKg: number;
    savedAt: string;
}

interface PendingReplaceData {
    animalId: string;
    animalLabel: string;
    lotName: string | null;
    date: string;
    weightKg: number;
}

interface WeighingsTabProps {
    farmId: string;
    animals: HerdAnimal[];
    lots: HerdLot[];
    herdType: HerdType;
    managementMode?: boolean;
}

type SessionMode = 'INDIVIDUAL' | 'GROUP';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
    try {
        return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
        return iso;
    }
};

const fmtKg = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toFixed(1)} kg`;

const fmtGmd = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toFixed(2)} kg/dia`;

const toDateInputValue = (iso: string) => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '';
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const today8601 = () => new Date().toISOString().slice(0, 10);
const startOfToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const csvEscape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
};

const playSuccessBeep = () => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        const audioContext = new AudioContextClass();
        const playTone = (frequency: number, start: number, duration: number, volume: number) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.02);
        };

        const now = audioContext.currentTime;
        playTone(780, now, 0.22, 0.16);
        playTone(980, now + 0.24, 0.28, 0.18);
    } catch {
        // O navegador pode bloquear áudio em algumas condições; a pesagem não depende do som.
    }
};

// ─── Componente ──────────────────────────────────────────────────────────────

const WeighingsTab: React.FC<WeighingsTabProps> = ({ farmId, animals, lots, herdType, managementMode = false }) => {
    // lista de sessões de pesagem da fazenda
    const [sessionRows, setSessionRows] = useState<WeighingSessionSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // paginação
    const PAGE_SIZE = 30;
    const [page, setPage] = useState(0);

    // filtros
    const [filterLot, setFilterLot] = useState('');
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');
    const [filterSearch, setFilterSearch] = useState('');

    // sessão nomeada de pesagem
    const [sessions, setSessions] = useState<HerdWeighingSession[]>([]);
    const [activeSession, setActiveSession] = useState<{ id: string; name: string } | null>(null);
    const [showSessionModal, setShowSessionModal] = useState(false);
    const [sessionName, setSessionName] = useState('');
    const [sessionResponsibleName, setSessionResponsibleName] = useState('');
    const [sessionSaving, setSessionSaving] = useState(false);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [sessionTypePromptOpen, setSessionTypePromptOpen] = useState(false);

    // formulário de nova pesagem
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [formLotId, setFormLotId] = useState('');
    const [formAnimalCode, setFormAnimalCode] = useState('');
    const [formDate, setFormDate] = useState(today8601());
    const [formWeight, setFormWeight] = useState('');
    const [formSaving, setFormSaving] = useState(false);
    const [formMsg, setFormMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [pendingReplace, setPendingReplace] = useState<PendingReplaceData | null>(null);
    const [activeSessionMode, setActiveSessionMode] = useState<SessionMode>('INDIVIDUAL');
    const [manualSessionWeighings, setManualSessionWeighings] = useState<ManualSessionWeighing[]>([]);
    const [groupAnimalsCount, setGroupAnimalsCount] = useState('');
    const [groupTotalWeight, setGroupTotalWeight] = useState('');
    const [groupSelectedAnimalIds, setGroupSelectedAnimalIds] = useState<string[]>([]);
    const [groupAnimalSearch, setGroupAnimalSearch] = useState('');
    const animalCodeInputRef = useRef<HTMLInputElement | null>(null);
    const weightInputRef = useRef<HTMLInputElement | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<WeighingSessionDetail | null>(null);
    const [editWeighingOpen, setEditWeighingOpen] = useState(false);
    const [editingWeighingId, setEditingWeighingId] = useState<string | null>(null);
    const [editWeighingAnimalId, setEditWeighingAnimalId] = useState('');
    const [editWeighingDate, setEditWeighingDate] = useState('');
    const [editWeighingWeight, setEditWeighingWeight] = useState('');
    const [editWeighingSaving, setEditWeighingSaving] = useState(false);
    const [editWeighingError, setEditWeighingError] = useState<string | null>(null);
    const [deleteWeighingOpen, setDeleteWeighingOpen] = useState(false);
    const [deletingWeighingId, setDeletingWeighingId] = useState<string | null>(null);
    const [masterPassword, setMasterPassword] = useState('');
    const [deleteWeighingSaving, setDeleteWeighingSaving] = useState(false);
    const [deleteWeighingError, setDeleteWeighingError] = useState<string | null>(null);
    const [deleteSessionOpen, setDeleteSessionOpen] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [deletingSessionName, setDeletingSessionName] = useState('');
    const [deleteSessionPassword, setDeleteSessionPassword] = useState('');
    const [deleteSessionSaving, setDeleteSessionSaving] = useState(false);
    const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);

    // ── Carregar pesagens ─────────────────────────────────────────────────────

    const load = useCallback(async () => {
        if (!farmId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const data = await listWeighingSessionSummaries(farmId, {
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
                lotId: filterLot || undefined,
                startDate: filterStart || undefined,
                endDate: filterEnd || undefined,
                search: filterSearch || undefined,
            });
            setSessionRows(data.sessions || []);
            setTotal(data.total ?? 0);

        } catch (err: any) {
            setLoadError(err?.message ?? 'Erro desconhecido.');
        } finally {
            setLoading(false);
        }
    }, [farmId, page, filterLot, filterStart, filterEnd, filterSearch]);

    useEffect(() => {
        load();
    }, [load]);

    const loadSessions = useCallback(async () => {
        if (!farmId) return;
        try {
            const list = await listWeighingSessions(farmId);
            setSessions(list);
        } catch {
            setSessions([]);
        }
    }, [farmId]);

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    const startSessionWithMode = async (mode: SessionMode) => {
        const name = sessionName.trim();
        if (!name) {
            setSessionError('Informe o nome da sessão.');
            return;
        }
        const responsibleName = sessionResponsibleName.trim();
        if (!responsibleName) {
            setSessionError('Informe o responsável da pesagem.');
            return;
        }
        setSessionSaving(true);
        setSessionError(null);
        try {
            const session = await createWeighingSession(farmId, name, responsibleName);
            setActiveSession({ id: session.id, name: session.name });
            setActiveSessionMode(mode);
            setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
            setFilterStart('');
            setFilterEnd('');
            setPage(0);
            setShowSessionModal(false);
            setSessionTypePromptOpen(false);
            setSessionName('');
            setSessionResponsibleName('');
            setManualSessionWeighings([]);
            setGroupAnimalsCount('');
            setGroupTotalWeight('');
            setGroupSelectedAnimalIds([]);
            setGroupAnimalSearch('');
            setManualModalOpen(true);
        } catch (err: any) {
            setSessionError(err?.message || 'Erro ao iniciar sessão.');
        } finally {
            setSessionSaving(false);
        }
    };

    const handleStartSession = (event: React.FormEvent) => {
        event.preventDefault();
        const name = sessionName.trim();
        if (!name) {
            setSessionError('Informe o nome da sessão.');
            setSessionTypePromptOpen(false);
            return;
        }
        const responsibleName = sessionResponsibleName.trim();
        if (!responsibleName) {
            setSessionError('Informe o responsável da pesagem.');
            setSessionTypePromptOpen(false);
            return;
        }
        setSessionError(null);
        setSessionTypePromptOpen(true);
    };

    const handleContinueSession = (session: HerdWeighingSession) => {
        setActiveSession({ id: session.id, name: session.name });
        setPage(0);
        setShowSessionModal(false);
        setActiveSessionMode('INDIVIDUAL');
        setManualSessionWeighings([]);
        setGroupAnimalsCount('');
        setGroupTotalWeight('');
        setGroupSelectedAnimalIds([]);
        setGroupAnimalSearch('');
        setManualModalOpen(true);
    };

    const handleOpenHistoryToday = () => {
        const today = today8601();
        setActiveSession(null);
        setFilterStart(today);
        setFilterEnd(today);
        setPage(0);
        setShowSessionModal(false);
    };

    const openEditWeighingModal = (item: WeighingSessionDetail['items'][number]) => {
        setEditingWeighingId(item.weighingId);
        setEditWeighingAnimalId(item.animalId);
        setEditWeighingDate(toDateInputValue(item.weighedAt));
        setEditWeighingWeight(String(item.weightKg));
        setEditWeighingError(null);
        setEditWeighingOpen(true);
    };

    const handleSaveWeighingEdit = async () => {
        if (!editingWeighingId) return;
        const weight = Number(editWeighingWeight.replace(',', '.'));
        if (!editWeighingAnimalId || !editWeighingDate || !Number.isFinite(weight) || weight <= 0) {
            setEditWeighingError('Preencha animal, data e peso válido.');
            return;
        }
        setEditWeighingSaving(true);
        setEditWeighingError(null);
        try {
            await updateWeighing(farmId, editingWeighingId, {
                animalId: editWeighingAnimalId,
                data: editWeighingDate,
                peso: weight,
            });
            if (detailData?.session?.sessionId) {
                const updated = await getWeighingSessionItems(farmId, detailData.session.sessionId);
                setDetailData(updated);
            }
            await load();
            setEditWeighingOpen(false);
            setEditingWeighingId(null);
        } catch (err: any) {
            setEditWeighingError(err?.message || 'Erro ao editar pesagem.');
        } finally {
            setEditWeighingSaving(false);
        }
    };

    const openDeleteWeighingModal = (item: WeighingSessionDetail['items'][number]) => {
        setDeletingWeighingId(item.weighingId);
        setMasterPassword('');
        setDeleteWeighingError(null);
        setDeleteWeighingOpen(true);
    };

    const handleDeleteWeighing = async () => {
        if (!deletingWeighingId) return;
        if (!masterPassword.trim()) {
            setDeleteWeighingError('Informe a senha do usuário master.');
            return;
        }
        setDeleteWeighingSaving(true);
        setDeleteWeighingError(null);
        try {
            await deleteWeighing(farmId, deletingWeighingId, masterPassword);
            if (detailData?.session?.sessionId) {
                const updated = await getWeighingSessionItems(farmId, detailData.session.sessionId);
                setDetailData(updated);
            }
            await load();
            setDeleteWeighingOpen(false);
            setDeletingWeighingId(null);
        } catch (err: any) {
            setDeleteWeighingError(err?.message || 'Erro ao excluir pesagem.');
        } finally {
            setDeleteWeighingSaving(false);
        }
    };

    const openDeleteSessionModal = (row: WeighingSessionSummary) => {
        setDeletingSessionId(row.sessionId);
        setDeletingSessionName(row.sessionName);
        setDeleteSessionPassword('');
        setDeleteSessionError(null);
        setDeleteSessionOpen(true);
    };

    const handleDeleteSession = async () => {
        if (!deletingSessionId) return;
        if (!deleteSessionPassword.trim()) {
            setDeleteSessionError('Informe a senha do usuário master.');
            return;
        }
        setDeleteSessionSaving(true);
        setDeleteSessionError(null);
        try {
            await deleteWeighingSession(farmId, deletingSessionId, deleteSessionPassword);
            setDeleteSessionOpen(false);
            setDeletingSessionId(null);
            setDeletingSessionName('');
            await Promise.all([load(), loadSessions()]);
        } catch (err: any) {
            setDeleteSessionError(err?.message || 'Erro ao excluir sessão de pesagem.');
        } finally {
            setDeleteSessionSaving(false);
        }
    };

    const manualAnimals = useMemo(() => {
        return formLotId ? animals.filter((animal) => animal.lotId === formLotId) : animals;
    }, [animals, formLotId]);

    const resolveManualAnimal = useCallback(() => {
        const value = formAnimalCode.trim().toLowerCase();
        if (!value) return null;
        return manualAnimals.find((animal) => {
            const candidates = [
                animal.id,
                animal.brinco,
                animal.nome,
                animal.identificacao,
                animal.registro,
            ].filter(Boolean).map((item) => String(item).trim().toLowerCase());
            return candidates.includes(value);
        }) || null;
    }, [formAnimalCode, manualAnimals]);

    const selectedManualAnimal = resolveManualAnimal();
    const currentWeightInput = activeSessionMode === 'GROUP' ? groupTotalWeight : formWeight;
    const displayWeight = currentWeightInput.trim()
        ? currentWeightInput.replace(',', '.')
        : '000.0';

    const closeManualModal = () => {
        if (formSaving) return;
        setManualModalOpen(false);
        setFormMsg(null);
        setPendingReplace(null);
    };

    const groupAnimals = useMemo(() => {
        return formLotId ? animals.filter((animal) => animal.lotId === formLotId) : animals;
    }, [animals, formLotId]);

    const filteredGroupAnimals = useMemo(() => {
        const query = groupAnimalSearch.trim().toLowerCase();
        if (!query) return groupAnimals;
        return groupAnimals.filter((animal) => {
            const values = [animal.identificacao, animal.brinco, animal.nome, animal.registro]
                .filter(Boolean)
                .map((item) => String(item).toLowerCase());
            return values.some((value) => value.includes(query));
        });
    }, [groupAnimals, groupAnimalSearch]);

    const toggleGroupAnimal = (animalId: string) => {
        setGroupSelectedAnimalIds((current) => {
            if (current.includes(animalId)) {
                return current.filter((id) => id !== animalId);
            }
            return [...current, animalId];
        });
    };

    const exportManualSessionCsv = () => {
        if (manualSessionWeighings.length === 0) return;

        const rows = [
            ['Animal', 'Lote', 'Data', 'Peso kg', 'Horário salvo', 'Status'],
            ...manualSessionWeighings.map((item) => [
                item.animalLabel,
                item.lotName || '',
                fmtDate(item.date),
                item.weightKg.toFixed(1),
                new Date(item.savedAt).toLocaleString('pt-BR'),
                'Salvo no animal',
            ]),
        ];
        const csv = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `conferencia-pesagem-${today8601()}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (!manualModalOpen) return;
        window.setTimeout(() => animalCodeInputRef.current?.focus(), 0);
    }, [manualModalOpen]);

    useEffect(() => {
        if (!manualModalOpen) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !formSaving) {
                event.preventDefault();
                closeManualModal();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [manualModalOpen, formSaving]);

    // ── Salvar pesagem ────────────────────────────────────────────────────────

    const saveWeighing = async (forceReplace = false) => {
        setFormMsg(null);

        const animal = resolveManualAnimal();
        if (!animal) {
            setFormMsg({ text: 'Informe um ID de animal válido.', type: 'error' });
            setPendingReplace(null);
            window.setTimeout(() => animalCodeInputRef.current?.focus(), 0);
            return;
        }
        const pesoNum = parseFloat(formWeight.replace(',', '.'));
        if (isNaN(pesoNum) || pesoNum <= 0) {
            setFormMsg({ text: 'Informe um peso válido (maior que zero).', type: 'error' });
            setPendingReplace(null);
            window.setTimeout(() => weightInputRef.current?.focus(), 0);
            return;
        }
        if (!formDate) {
            setFormMsg({ text: 'Informe a data da pesagem.', type: 'error' });
            setPendingReplace(null);
            return;
        }
        const parsedDate = new Date(formDate);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate > startOfToday()) {
            setFormMsg({ text: 'Data de pesagem inválida.', type: 'error' });
            setPendingReplace(null);
            return;
        }

        const lotName = animal.lotId ? lots.find((lot) => lot.id === animal.lotId)?.name || null : null;

        setFormSaving(true);
        try {
            await createWeighing(animal.id, herdType, {
                data: formDate,
                peso: pesoNum,
                ...(forceReplace ? { forceReplace: true } : {}),
                ...(activeSession ? { weighingSessionId: activeSession.id } : {}),
            });
            playSuccessBeep();
            setPendingReplace(null);
            setManualSessionWeighings((current) => [
                {
                    animalId: animal.id,
                    animalLabel: animal.identificacao || animal.brinco || animal.nome || animal.id,
                    lotName,
                    date: formDate,
                    weightKg: pesoNum,
                    savedAt: new Date().toISOString(),
                },
                ...current,
            ]);
            setFormMsg({ text: 'Pesagem registrada com sucesso!', type: 'success' });
            setFormWeight('');
            setFormAnimalCode('');
            setPage(0);
            load();
            loadSessions();
            window.setTimeout(() => animalCodeInputRef.current?.focus(), 0);
        } catch (err: any) {
            const message = err?.message ?? 'Erro ao salvar.';
            if (message.includes('Já existe pesagem cadastrada nesta data.')) {
                setPendingReplace({
                    animalId: animal.id,
                    animalLabel: animal.identificacao || animal.brinco || animal.nome || animal.id,
                    lotName,
                    date: formDate,
                    weightKg: pesoNum,
                });
                setFormMsg({ text: 'Já existe pesagem nessa data. Clique em "Substituir pesagem".', type: 'error' });
            } else {
                setPendingReplace(null);
                setFormMsg({ text: message, type: 'error' });
            }
        } finally {
            setFormSaving(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        await saveWeighing(false);
    };

    const saveGroupWeighing = async () => {
        setFormMsg(null);
        setPendingReplace(null);

        const countNum = parseInt(groupAnimalsCount, 10);
        if (!Number.isInteger(countNum) || countNum <= 0) {
            setFormMsg({ text: 'Informe uma quantidade válida de animais.', type: 'error' });
            return;
        }
        if (!formDate) {
            setFormMsg({ text: 'Informe a data da pesagem.', type: 'error' });
            return;
        }
        const parsedDate = new Date(formDate);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate > startOfToday()) {
            setFormMsg({ text: 'Data de pesagem inválida.', type: 'error' });
            return;
        }
        const totalWeightNum = parseFloat(groupTotalWeight.replace(',', '.'));
        if (Number.isNaN(totalWeightNum) || totalWeightNum <= 0) {
            setFormMsg({ text: 'Informe um peso total válido.', type: 'error' });
            return;
        }
        if (groupSelectedAnimalIds.length !== countNum) {
            setFormMsg({ text: 'A quantidade informada deve ser igual aos animais selecionados.', type: 'error' });
            return;
        }

        const selectedAnimals = groupAnimals.filter((animal) => groupSelectedAnimalIds.includes(animal.id));
        if (selectedAnimals.length !== countNum) {
            setFormMsg({ text: 'Seleção de animais inválida para o lote atual.', type: 'error' });
            return;
        }

        const averageWeight = Number((totalWeightNum / countNum).toFixed(1));
        setFormSaving(true);
        try {
            for (const animal of selectedAnimals) {
                await createWeighing(animal.id, herdType, {
                    data: formDate,
                    peso: averageWeight,
                    ...(activeSession ? { weighingSessionId: activeSession.id } : {}),
                });
            }
            playSuccessBeep();
            const nowIso = new Date().toISOString();
            setManualSessionWeighings((current) => [
                ...selectedAnimals.map((animal) => ({
                    animalId: animal.id,
                    animalLabel: animal.identificacao || animal.brinco || animal.nome || animal.id,
                    lotName: animal.lotId ? lots.find((lot) => lot.id === animal.lotId)?.name || null : null,
                    date: formDate,
                    weightKg: averageWeight,
                    savedAt: nowIso,
                })),
                ...current,
            ]);
            setFormMsg({ text: `Pesagem em grupo registrada. Peso médio: ${averageWeight.toFixed(1)} kg.`, type: 'success' });
            setGroupTotalWeight('');
            setGroupAnimalsCount('');
            setGroupSelectedAnimalIds([]);
            setGroupAnimalSearch('');
            setPage(0);
            load();
            loadSessions();
        } catch (err: any) {
            setFormMsg({ text: err?.message ?? 'Erro ao salvar pesagem em grupo.', type: 'error' });
        } finally {
            setFormSaving(false);
        }
    };

    // ── Paginação ─────────────────────────────────────────────────────────────

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Modal de sessão */}
            {showSessionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-2xl">
                        <div className="mb-5 flex items-start justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">Pesagens</p>
                                <h3 className="mt-1 text-xl font-black text-[var(--eixo-text)]">Nova sessão de pesagem</h3>
                                <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                                    Esse nome vai agrupar todas as pesagens lançadas agora.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowSessionModal(false);
                                    setSessionTypePromptOpen(false);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--eixo-border)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                                aria-label="Fechar"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleStartSession} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase text-[var(--eixo-text-muted)]">Nome da sessão</label>
                                <input
                                    value={sessionName}
                                    onChange={(event) => setSessionName(event.target.value)}
                                    placeholder="Ex: Pesagem abril 2026"
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/20"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase text-[var(--eixo-text-muted)]">Responsável</label>
                                <input
                                    value={sessionResponsibleName}
                                    onChange={(event) => setSessionResponsibleName(event.target.value)}
                                    placeholder="Ex: João Silva"
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] focus:ring-2 focus:ring-[var(--eixo-green)]/20"
                                />
                            </div>
                            {sessionError && (
                                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{sessionError}</p>
                            )}

                            <div className="flex flex-wrap justify-end gap-3">
                                {!managementMode && (
                                    <button
                                        type="button"
                                        onClick={handleOpenHistoryToday}
                                        disabled={sessionSaving}
                                        className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                    >
                                        Ver histórico
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={sessionSaving}
                                    className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-50"
                                >
                                    {sessionSaving ? 'Iniciando...' : 'Iniciar sessão'}
                                </button>
                            </div>
                        </form>

                        {/* Sessões recentes para continuar */}
                        {!managementMode && sessions.length > 0 && (
                            <div className="mt-5 border-t border-[var(--eixo-border)] pt-4">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Ou continue uma sessão recente</p>
                                <div className="space-y-2">
                                    {sessions.slice(0, 5).map((session) => (
                                        <div key={session.id} className="flex items-center justify-between rounded-xl border border-[var(--eixo-border)] px-4 py-2.5">
                                            <div>
                                                <p className="text-sm font-semibold text-[var(--eixo-text)]">{session.name}</p>
                                                {typeof session.weighingsCount === 'number' && (
                                                    <p className="text-xs text-[var(--eixo-text-muted)]">{session.weighingsCount} pesagem(ns)</p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleContinueSession(session)}
                                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1.5 text-xs font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                            >
                                                Continuar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showSessionModal && sessionTypePromptOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">Nova sessão</p>
                        <h4 className="mt-1 text-xl font-black text-[var(--eixo-text)]">Como deseja pesar?</h4>
                        <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Escolha uma opção para continuar.</p>
                        <div className="mt-5 flex flex-col gap-2">
                            <button
                                type="button"
                                disabled={sessionSaving}
                                onClick={() => { void startSessionWithMode('INDIVIDUAL'); }}
                                className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-4 py-3 text-left text-sm text-[#2f3a2d] hover:bg-[#f7efdf] disabled:opacity-50"
                            >
                                <span className="block font-black">Pesagem Individual</span>
                                <span className="mt-0.5 block text-xs text-[#6d6558]">Um animal por vez.</span>
                            </button>
                            <button
                                type="button"
                                disabled={sessionSaving}
                                onClick={() => { void startSessionWithMode('GROUP'); }}
                                className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-4 py-3 text-left text-sm text-[#2f3a2d] hover:bg-[#f7efdf] disabled:opacity-50"
                            >
                                <span className="block font-black">Pesagem em Grupo</span>
                                <span className="mt-0.5 block text-xs text-[#6d6558]">Peso total dividido entre os selecionados.</span>
                            </button>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                disabled={sessionSaving}
                                onClick={() => setSessionTypePromptOpen(false)}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                            >
                                Voltar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editWeighingOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-2xl">
                        <h4 className="text-lg font-black text-[var(--eixo-text)]">Editar pesagem</h4>
                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase text-[var(--eixo-text-muted)]">Animal</label>
                                <select
                                    value={editWeighingAnimalId}
                                    onChange={(event) => setEditWeighingAnimalId(event.target.value)}
                                    className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]"
                                >
                                    <option value="">Selecione</option>
                                    {animals.map((animal) => (
                                        <option key={animal.id} value={animal.id}>
                                            {animal.identificacao || animal.brinco || animal.nome || animal.id}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase text-[var(--eixo-text-muted)]">Data</label>
                                    <input
                                        type="date"
                                        value={editWeighingDate}
                                        onChange={(event) => setEditWeighingDate(event.target.value)}
                                        className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase text-[var(--eixo-text-muted)]">Peso (kg)</label>
                                    <input
                                        value={editWeighingWeight}
                                        onChange={(event) => setEditWeighingWeight(event.target.value)}
                                        className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]"
                                    />
                                </div>
                            </div>
                            {editWeighingError && <p className="text-sm text-[var(--eixo-danger)]">{editWeighingError}</p>}
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={editWeighingSaving}
                                onClick={() => setEditWeighingOpen(false)}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={editWeighingSaving}
                                onClick={() => { void handleSaveWeighingEdit(); }}
                                className="rounded-xl bg-[#9d7d4d] px-4 py-2 text-sm font-bold text-white hover:bg-[#8f7144] disabled:opacity-50"
                            >
                                {editWeighingSaving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteWeighingOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-2xl border border-[#d7cab3] bg-[#fffaf1] p-6 shadow-2xl">
                        <h4 className="text-lg font-black text-[#2f3a2d]">Excluir pesagem</h4>
                        <p className="mt-2 text-sm text-[#6d6558]">
                            Esta ação exclui a pesagem e recalcula toda a cadeia de ganho de peso.
                        </p>
                        <div className="mt-3">
                            <label className="mb-1 block text-xs font-semibold uppercase text-[#8c4d39]">Senha do usuário master</label>
                            <input
                                type="password"
                                value={masterPassword}
                                onChange={(event) => setMasterPassword(event.target.value)}
                                className="w-full rounded-xl border border-[#e6c7bc] bg-[#fffaf1] px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#8c4d39]"
                            />
                        </div>
                        {deleteWeighingError && <p className="mt-2 text-sm text-[#8c4d39]">{deleteWeighingError}</p>}
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={deleteWeighingSaving}
                                onClick={() => setDeleteWeighingOpen(false)}
                                className="rounded-xl border border-[#d7cab3] px-4 py-2 text-sm font-semibold text-[#6d6558] hover:bg-[#f3ebdc]"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={deleteWeighingSaving}
                                onClick={() => { void handleDeleteWeighing(); }}
                                className="rounded-xl bg-[#fbede8] px-4 py-2 text-sm font-bold text-[#8c4d39] hover:bg-[#f4ddd5] disabled:opacity-50"
                            >
                                {deleteWeighingSaving ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteSessionOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-2xl border border-[#d7cab3] bg-[#fffaf1] p-6 shadow-2xl">
                        <h4 className="text-lg font-black text-[#2f3a2d]">Excluir sessão de pesagem</h4>
                        <p className="mt-2 text-sm text-[#6d6558]">
                            Confirme a exclusão da sessão <span className="font-bold">{deletingSessionName}</span>.
                        </p>
                        <p className="mt-1 text-xs text-[#8c4d39]">
                            Será removida apenas a linha da sessão. As pesagens continuam cadastradas.
                        </p>
                        <div className="mt-3">
                            <label className="mb-1 block text-xs font-semibold uppercase text-[#8c4d39]">Senha do usuário master</label>
                            <input
                                type="password"
                                value={deleteSessionPassword}
                                onChange={(event) => setDeleteSessionPassword(event.target.value)}
                                className="w-full rounded-xl border border-[#e6c7bc] bg-[#fffaf1] px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#8c4d39]"
                            />
                        </div>
                        {deleteSessionError && <p className="mt-2 text-sm text-[#8c4d39]">{deleteSessionError}</p>}
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={deleteSessionSaving}
                                onClick={() => setDeleteSessionOpen(false)}
                                className="rounded-xl border border-[#d7cab3] px-4 py-2 text-sm font-semibold text-[#6d6558] hover:bg-[#f3ebdc]"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={deleteSessionSaving}
                                onClick={() => { void handleDeleteSession(); }}
                                className="rounded-xl bg-[#fbede8] px-4 py-2 text-sm font-bold text-[#8c4d39] hover:bg-[#f4ddd5] disabled:opacity-50"
                            >
                                {deleteSessionSaving ? 'Excluindo...' : 'Excluir sessão'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div>
                    <h3 className="text-base font-semibold text-[var(--eixo-text)]">Pesagem manual</h3>
                    <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Abra o painel de curral para lançar ID do animal e peso em kg.</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setFormMsg(null);
                        setManualSessionWeighings([]);
                        if (!activeSession) {
                            setShowSessionModal(true);
                        } else {
                            setManualModalOpen(true);
                        }
                    }}
                    className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/30"
                >
                    Nova pesagem
                </button>
            </div>

            {activeSession && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] px-5 py-3">
                    <p className="text-sm font-semibold text-[var(--eixo-text)]">
                        📋 Sessão: "{activeSession.name}"
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveSession(null);
                            setPage(0);
                        }}
                        className="rounded-xl border border-[var(--eixo-border-strong)] bg-[var(--eixo-surface)] px-3 py-1.5 text-xs font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                    >
                        Encerrar sessão
                    </button>
                </div>
            )}

            {/* Modal de pesagem manual (balança) — paleta intencional */}
            {manualModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="my-4 w-full max-w-[760px] rounded-[20px] border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase text-[#6d6558]">Curral</p>
                                <h3 className="text-xl font-black text-[#2f3a2d]">
                                    PESAGEM MANUAL
                                    <span className="ml-2">{activeSessionMode === 'GROUP' ? 'PESAGEM EM GRUPO' : 'PESAGEM INDIVIDUAL'}</span>
                                </h3>
                                <p className="text-xs font-semibold text-[#6d6558]">
                                    Sessão atual: {manualSessionWeighings.length} pesagem(ns)
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeManualModal}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d7cab3] bg-[#f1e7d8] text-[#6d6558] hover:bg-[#e7dac5]"
                                aria-label="Fechar"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={activeSessionMode === 'GROUP' ? (e) => { e.preventDefault(); void saveGroupWeighing(); } : handleSave} className="rounded-[18px] border border-[#2f3a2d] bg-[#2f3a2d] p-4">
                            <div className="rounded-[14px] border border-[#1f281e] bg-[#dbe3d4] px-4 py-5 text-right shadow-inner">
                                <div className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-[#3f4a3b]">
                                    <span>Peso capturado</span>
                                    <span>kg</span>
                                </div>
                                <div className="font-mono text-5xl font-black leading-none text-[#1f281e] sm:text-6xl">
                                    {displayWeight}
                                </div>
                            </div>

                            {activeSessionMode === 'GROUP' ? (
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-2 block text-sm font-black uppercase tracking-[0.12em] text-[#fffaf1]">Quantidade de animais</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={groupAnimalsCount}
                                            onChange={(event) => setGroupAnimalsCount(event.target.value)}
                                            className="w-full rounded-[14px] border-2 border-[#d7cab3] bg-[#fffaf1] px-4 py-4 text-2xl font-black text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-black uppercase tracking-[0.12em] text-[#fffaf1]">Peso total do grupo (kg)</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={groupTotalWeight}
                                            onChange={(event) => setGroupTotalWeight(event.target.value)}
                                            className="w-full rounded-[14px] border-2 border-[#d7cab3] bg-[#fffaf1] px-4 py-4 text-2xl font-black text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-2 block text-sm font-black uppercase tracking-[0.12em] text-[#fffaf1]">ID do animal</label>
                                        <input
                                            ref={animalCodeInputRef}
                                            list="weighing-animal-options"
                                            value={formAnimalCode}
                                            onChange={(event) => {
                                                setFormAnimalCode(event.target.value);
                                                setPendingReplace(null);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key !== 'Enter') return;
                                                event.preventDefault();
                                                if (!resolveManualAnimal()) {
                                                    setFormMsg({ text: 'Animal não encontrado. Confira o brinco/registro.', type: 'error' });
                                                    setPendingReplace(null);
                                                    return;
                                                }
                                                weightInputRef.current?.focus();
                                            }}
                                            placeholder="Brinco, ID ou registro"
                                            className="w-full rounded-[14px] border-2 border-[#d7cab3] bg-[#fffaf1] px-4 py-4 text-2xl font-black uppercase text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                        />
                                        <datalist id="weighing-animal-options">
                                            {manualAnimals.map((animal) => (
                                                <option
                                                    key={animal.id}
                                                    value={animal.identificacao || animal.brinco || animal.nome || animal.id}
                                                    label={[animal.brinco, animal.nome, animal.registro].filter(Boolean).join(' · ')}
                                                />
                                            ))}
                                        </datalist>
                                        <p className="mt-1 text-xs font-semibold text-[#d7cab3]">
                                            Digite exatamente o brinco, ID ou registro do animal.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-black uppercase tracking-[0.12em] text-[#fffaf1]">Peso em kg</label>
                                        <input
                                            ref={weightInputRef}
                                            type="text"
                                            inputMode="decimal"
                                            value={formWeight}
                                            onChange={(event) => {
                                                setFormWeight(event.target.value);
                                                setPendingReplace(null);
                                            }}
                                            onKeyDown={(event) => {
                                                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                                    event.preventDefault();
                                                    if (!formSaving) {
                                                        void saveWeighing(false);
                                                    }
                                                }
                                            }}
                                            placeholder="Ex: 425"
                                            className="w-full rounded-[14px] border-2 border-[#d7cab3] bg-[#fffaf1] px-4 py-4 text-2xl font-black text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase text-[#d7cab3]">Lote</label>
                                    <select
                                        value={formLotId}
                                        onChange={(event) => {
                                            setFormLotId(event.target.value);
                                            setFormAnimalCode('');
                                            setGroupSelectedAnimalIds([]);
                                            setGroupAnimalSearch('');
                                        }}
                                        className="w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                    >
                                        <option value="">Todos os lotes</option>
                                        {lots.map((lot) => (
                                            <option key={lot.id} value={lot.id}>{lot.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase text-[#d7cab3]">Data</label>
                                    <input
                                        type="date"
                                        value={formDate}
                                        max={today8601()}
                                        onChange={(event) => {
                                            setFormDate(event.target.value);
                                            setPendingReplace(null);
                                        }}
                                        className="w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                    />
                                </div>
                            </div>

                            <div className="mt-3 min-h-[24px] text-sm">
                                {activeSessionMode === 'INDIVIDUAL' && selectedManualAnimal && (
                                    <span className="text-[#d7cab3]">
                                        Animal: {selectedManualAnimal.identificacao}
                                        {selectedManualAnimal.raca ? ` · ${selectedManualAnimal.raca}` : ''}
                                        {selectedManualAnimal.lotId ? ` · ${lots.find((lot) => lot.id === selectedManualAnimal.lotId)?.name || 'Lote'}` : ''}
                                    </span>
                                )}
                                {activeSessionMode === 'GROUP' && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[#d7cab3]">
                                            Selecionados: {groupSelectedAnimalIds.length}
                                            {groupAnimalsCount ? ` / ${groupAnimalsCount}` : ''}
                                        </span>
                                        <input
                                            type="text"
                                            value={groupAnimalSearch}
                                            onChange={(event) => setGroupAnimalSearch(event.target.value)}
                                            placeholder="Buscar animal"
                                            className="w-40 rounded-lg border border-[#d7cab3] bg-[#fffaf1] px-2 py-1 text-xs text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                        />
                                    </div>
                                )}
                                {formMsg && (
                                    <p className={formMsg.type === 'success' ? 'text-[#b9d6a9]' : 'text-[#f0b4a7]'}>
                                        {formMsg.text}
                                    </p>
                                )}
                            </div>

                            {activeSessionMode === 'GROUP' && (
                                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[#d7cab3] bg-[#fffaf1]">
                                    {filteredGroupAnimals.length === 0 ? (
                                        <p className="px-3 py-2 text-sm text-[#6d6558]">Nenhum animal disponível para seleção.</p>
                                    ) : (
                                        <div className="space-y-1 p-2">
                                            {filteredGroupAnimals.map((animal) => {
                                                const checked = groupSelectedAnimalIds.includes(animal.id);
                                                return (
                                                    <label key={animal.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-[#2f3a2d] hover:bg-[#f3ebdc]">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleGroupAnimal(animal.id)}
                                                        />
                                                        <span>{animal.identificacao || animal.brinco || animal.nome || animal.id}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-4 flex justify-end gap-3">
                                {pendingReplace && (
                                    <button
                                        type="button"
                                        disabled={formSaving}
                                        onClick={() => {
                                            void saveWeighing(true);
                                        }}
                                        className="rounded-xl bg-[#fbede8] px-4 py-2 text-sm font-bold text-[#8c4d39] hover:bg-[#f4ddd5] disabled:opacity-50"
                                    >
                                        Substituir pesagem
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={closeManualModal}
                                    className="rounded-xl border border-[#d7cab3] px-4 py-2 text-sm font-semibold text-[#fffaf1] hover:bg-[#3f4a3b]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={formSaving}
                                    className="rounded-xl bg-[#9d7d4d] px-5 py-2 text-sm font-bold text-white hover:bg-[#8f7144] disabled:opacity-50"
                                >
                                    {formSaving ? 'Salvando...' : activeSessionMode === 'GROUP' ? 'Registrar pesagem em grupo' : 'Registrar pesagem'}
                                </button>
                            </div>
                        </form>

                        <div className="mt-4 rounded-[18px] border border-[#d7cab3] bg-[#fffaf1]">
                            <div className="flex items-center justify-between border-b border-[#d7cab3] px-4 py-3">
                                <div>
                                    <h4 className="text-sm font-black uppercase text-[#2f3a2d]">Conferência da sessão</h4>
                                    <p className="text-xs text-[#6d6558]">Animais pesados desde a abertura deste painel.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-[#f1e7d8] px-3 py-1 text-xs font-bold text-[#6d6558]">
                                        {manualSessionWeighings.length} registro(s)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={exportManualSessionCsv}
                                        disabled={manualSessionWeighings.length === 0}
                                        className="rounded-xl border border-[#d7cab3] px-3 py-1.5 text-xs font-bold text-[#2f3a2d] hover:bg-[#f1e7d8] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Exportar conferência
                                    </button>
                                </div>
                            </div>
                            {manualSessionWeighings.length === 0 ? (
                                <p className="px-4 py-5 text-sm text-[#6d6558]">
                                    Nenhuma pesagem registrada nesta sessão ainda.
                                </p>
                            ) : (
                                <div className="max-h-52 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-[#f1e7d8] text-left text-xs font-bold uppercase text-[#74644e]">
                                            <tr>
                                                <th className="px-4 py-2">Animal</th>
                                                <th className="px-4 py-2">Lote</th>
                                                <th className="px-4 py-2">Data</th>
                                                <th className="px-4 py-2">Status</th>
                                                <th className="px-4 py-2 text-right">Peso</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {manualSessionWeighings.map((item, index) => (
                                                <tr key={`${item.animalId}-${item.savedAt}`} className="border-t border-[#eadfcb]">
                                                    <td className="px-4 py-2 font-semibold text-[#2f3a2d]">
                                                        {index + 1}. {item.animalLabel}
                                                    </td>
                                                    <td className="px-4 py-2 text-[#6d6558]">{item.lotName || '—'}</td>
                                                    <td className="px-4 py-2 text-[#6d6558]">{fmtDate(item.date)}</td>
                                                    <td className="px-4 py-2">
                                                        <span className="rounded-full bg-[#e4f0dc] px-2 py-1 text-xs font-bold text-[#3d6b38]">
                                                            Salvo no animal
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-black text-[#2f3a2d]">{item.weightKg.toFixed(1)} kg</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {!managementMode && (detailLoading || detailError || detailData) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-5xl rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Sessão de pesagem</p>
                                <h3 className="text-lg font-black text-[var(--eixo-text)]">
                                    {detailData?.session.sessionName || 'Detalhes da sessão'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setDetailData(null);
                                    setDetailError(null);
                                    setDetailLoading(false);
                                }}
                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1.5 text-sm text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                            >
                                Fechar
                            </button>
                        </div>
                        <div className="px-5 py-4">
                            {detailLoading && <p className="text-sm text-[var(--eixo-text-muted)]">Carregando detalhes…</p>}
                            {!detailLoading && detailError && <p className="text-sm text-red-600">{detailError}</p>}
                            {!detailLoading && !detailError && detailData && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3 text-sm sm:grid-cols-4">
                                        <p className="text-[var(--eixo-text-muted)]">Tipo: <span className="font-semibold text-[var(--eixo-text)]">{detailData.session.sessionType === 'GROUP' ? 'Grupo' : 'Individual'}</span></p>
                                        <p className="text-[var(--eixo-text-muted)]">Data/hora: <span className="font-semibold text-[var(--eixo-text)]">{new Date(detailData.session.sessionDateTime).toLocaleString('pt-BR')}</span></p>
                                        <p className="text-[var(--eixo-text-muted)]">Qtd.: <span className="font-semibold text-[var(--eixo-text)]">{detailData.session.animalsCount}</span></p>
                                        <p className="text-[var(--eixo-text-muted)]">Peso médio: <span className="font-semibold text-[var(--eixo-text)]">{fmtKg(detailData.session.averageWeightKg)}</span></p>
                                    </div>
                                    <div className="max-h-[360px] overflow-auto rounded-xl border border-[var(--eixo-border)]">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-[var(--eixo-surface-soft)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">
                                                    <th className="px-3 py-2">Animal</th>
                                                    <th className="px-3 py-2">Categoria</th>
                                                    <th className="px-3 py-2 text-right">Peso anterior</th>
                                                    <th className="px-3 py-2 text-right">Peso</th>
                                                    <th className="px-3 py-2 text-right">Ganho</th>
                                                    <th className="px-3 py-2 text-right">GMD</th>
                                                    <th className="px-3 py-2 text-center">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detailData.items.map((item) => (
                                                    <tr key={item.weighingId} className="border-t border-[var(--eixo-border)]">
                                                        <td className="px-3 py-2 text-[var(--eixo-text)]">{item.animalCode || item.animalName || '—'}</td>
                                                        <td className="px-3 py-2 text-[var(--eixo-text-muted)]">{item.category || '—'}</td>
                                                        <td className="px-3 py-2 text-right text-[var(--eixo-text-muted)]">{fmtKg(item.previousWeightKg)}</td>
                                                        <td className="px-3 py-2 text-right font-semibold text-[var(--eixo-text)]">{fmtKg(item.weightKg)}</td>
                                                        <td className="px-3 py-2 text-right text-[var(--eixo-text-muted)]">{item.gainKg == null ? '—' : `${item.gainKg >= 0 ? '+' : ''}${item.gainKg.toFixed(1)} kg`}</td>
                                                        <td className={`px-3 py-2 text-right ${item.gmd != null && item.gmd < 0 ? 'font-bold text-[var(--eixo-danger)]' : 'text-[var(--eixo-text-muted)]'}`}>
                                                            {fmtGmd(item.gmd)}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEditWeighingModal(item)}
                                                                    className="rounded-lg border border-[#d7cab3] bg-[#fffaf1] px-2 py-1 text-xs font-semibold text-[#6d6558] hover:bg-[#f3ebdc]"
                                                                >
                                                                    Editar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openDeleteWeighingModal(item)}
                                                                    className="rounded-lg border border-[#e6c7bc] bg-[#fbede8] px-2 py-1 text-xs font-semibold text-[#8c4d39] hover:bg-[#f4ddd5]"
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
                        </div>
                    </div>
                </div>
            )}

            {/* Filtros + tabela */}
            {!managementMode && (
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                {/* Filtros */}
                <div className="flex flex-wrap items-end gap-3 border-b border-[var(--eixo-border)] px-6 py-4">
                    <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Sessão</label>
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={(e) => { setFilterSearch(e.target.value); setPage(0); }}
                            placeholder="Buscar sessão…"
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        />
                    </div>
                    <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Lote</label>
                        <select
                            value={filterLot}
                            onChange={e => { setFilterLot(e.target.value); setPage(0); }}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        >
                            <option value="">Todos os lotes</option>
                            {lots.map(lot => (
                                <option key={lot.id} value={lot.id}>{lot.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="w-36">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">De</label>
                        <input
                            type="date"
                            value={filterStart}
                            onChange={e => { setFilterStart(e.target.value); setPage(0); }}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        />
                    </div>
                    <div className="w-36">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Até</label>
                        <input
                            type="date"
                            value={filterEnd}
                            onChange={e => { setFilterEnd(e.target.value); setPage(0); }}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        />
                    </div>
                    {(filterSearch || filterLot || filterStart || filterEnd) && (
                        <button
                            onClick={() => {
                                setFilterSearch('');
                                setFilterLot('');
                                setFilterStart('');
                                setFilterEnd('');
                                setPage(0);
                            }}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Limpar filtros
                        </button>
                    )}
                </div>

                {/* Tabela */}
                {loading ? (
                    <div className="px-6 py-12 text-center text-sm text-[#a8a29e]">Carregando…</div>
                ) : loadError ? (
                    <div className="px-6 py-12 text-center text-sm text-red-600">{loadError}</div>
                ) : sessionRows.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-[#a8a29e]">
                        Nenhuma sessão de pesagem encontrada.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-left text-xs font-medium uppercase tracking-wide text-[var(--eixo-text-muted)]">
                                    <th className="px-3 py-3">Sessão</th>
                                    <th className="px-3 py-3">Tipo</th>
                                    <th className="px-3 py-3">Data e hora</th>
                                    <th className="px-3 py-3">Fazenda</th>
                                    <th className="px-3 py-3">Lote</th>
                                    <th className="px-3 py-3 text-right">Qtd.</th>
                                    <th className="px-3 py-3 text-right">Peso total</th>
                                    <th className="px-3 py-3 text-right">Peso médio</th>
                                    <th className="px-3 py-3">Responsável</th>
                                    <th className="px-3 py-3 text-center">Editar / Excluir</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessionRows.map((row, idx) => (
                                    <tr
                                        key={row.sessionId}
                                        className={`border-b border-[var(--eixo-border)] transition-colors hover:bg-[var(--eixo-surface-soft)] ${
                                            idx % 2 === 0 ? 'bg-[var(--eixo-surface)]' : 'bg-[#fafaf9]'
                                        }`}
                                    >
                                        <td className="px-3 py-3 font-semibold text-[var(--eixo-text)]">
                                            <button
                                                type="button"
                                                className="text-left underline decoration-[#9d7d4d] underline-offset-2 hover:text-[#8f7144]"
                                                onClick={async () => {
                                                    setDetailLoading(true);
                                                    setDetailError(null);
                                                    setDetailData(null);
                                                    try {
                                                        const detail = await getWeighingSessionItems(farmId, row.sessionId);
                                                        setDetailData(detail);
                                                    } catch (err: any) {
                                                        setDetailError(err?.message || 'Erro ao carregar detalhes da sessão.');
                                                    } finally {
                                                        setDetailLoading(false);
                                                    }
                                                }}
                                            >
                                                {row.sessionName}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3 text-[var(--eixo-text-muted)]">{row.sessionType === 'GROUP' ? 'Grupo' : 'Individual'}</td>
                                        <td className="px-3 py-3 text-[var(--eixo-text-muted)]">{new Date(row.sessionDateTime).toLocaleString('pt-BR')}</td>
                                        <td className="px-3 py-3 text-[var(--eixo-text-muted)]">{row.farmName}</td>
                                        <td className="px-3 py-3 text-[var(--eixo-text-muted)]">{row.lotName ?? '—'}</td>
                                        <td className="px-3 py-3 text-right text-[var(--eixo-text-muted)]">{row.animalsCount}</td>
                                        <td className="px-3 py-3 text-right text-[var(--eixo-text-muted)]">{fmtKg(row.totalWeightKg)}</td>
                                        <td className="px-3 py-3 text-right text-[var(--eixo-text-muted)]">{fmtKg(row.averageWeightKg)}</td>
                                        <td className="px-3 py-3 text-[var(--eixo-text-muted)]">{row.responsibleUserName || '—'}</td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setDetailLoading(true);
                                                        setDetailError(null);
                                                        setDetailData(null);
                                                        try {
                                                            const detail = await getWeighingSessionItems(farmId, row.sessionId);
                                                            setDetailData(detail);
                                                        } catch (err: any) {
                                                            setDetailError(err?.message || 'Erro ao carregar detalhes da sessão.');
                                                        } finally {
                                                            setDetailLoading(false);
                                                        }
                                                    }}
                                                    className="rounded-lg border border-[#d7cab3] bg-[#fffaf1] px-2.5 py-1 text-xs font-semibold text-[#6d6558] hover:bg-[#f3ebdc]"
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openDeleteSessionModal(row)}
                                                    className="rounded-lg border border-[#e6c7bc] bg-[#fbede8] px-2.5 py-1 text-xs font-semibold text-[#8c4d39] hover:bg-[#f4ddd5]"
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
                )}

                {/* Paginação */}
                {!loading && !loadError && totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-[var(--eixo-border)] px-6 py-3 text-sm text-[var(--eixo-text-muted)]">
                        <span>
                            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:opacity-40"
                            >
                                ← Anterior
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:opacity-40"
                            >
                                Próxima →
                            </button>
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
};

export default WeighingsTab;
