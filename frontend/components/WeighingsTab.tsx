import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl } from '../api';
import { createWeighing, createWeighingSession, listWeighingSessions } from '../adapters/herdApi';
import type { HerdAnimal, HerdLot, HerdType, HerdWeighingSession } from '../adapters/herdApi';
import WeightEvolutionChart from './WeightEvolutionChart';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FarmWeighing {
    id: string;
    date: string;
    weightKg: number;
    gmd: number | null;
    weighingSessionId?: string | null;
    weighingSessionName?: string | null;
    previousWeightKg: number | null;
    gainKg: number | null;
    animal: {
        id: string;
        brinco: string | null;
        raca: string | null;
        sexo: string | null;
        categoria: string | null;
        lotId: string | null;
        lotName: string | null;
    };
}

interface WeighingStats {
    today: number;
    thisWeek: number;
    animalsWeighed: number;
    avgGmd: number | null;
}

interface ManualSessionWeighing {
    animalId: string;
    animalLabel: string;
    lotName: string | null;
    date: string;
    weightKg: number;
    savedAt: string;
}

interface WeighingsTabProps {
    farmId: string;
    animals: HerdAnimal[];
    lots: HerdLot[];
    herdType: HerdType;
}

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

const today8601 = () => new Date().toISOString().slice(0, 10);

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

const WeighingsTab: React.FC<WeighingsTabProps> = ({ farmId, animals, lots, herdType }) => {
    // lista de pesagens da fazenda
    const [weighings, setWeighings] = useState<FarmWeighing[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // paginação
    const PAGE_SIZE = 30;
    const [page, setPage] = useState(0);

    // filtros
    const [filterAnimal, setFilterAnimal] = useState('');
    const [filterLot, setFilterLot] = useState('');
    const [filterSession, setFilterSession] = useState('');
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');

    // sessão nomeada de pesagem
    const [sessions, setSessions] = useState<HerdWeighingSession[]>([]);
    const [activeSession, setActiveSession] = useState<{ id: string; name: string } | null>(null);
    const [showSessionModal, setShowSessionModal] = useState(true);
    const [sessionName, setSessionName] = useState('');
    const [sessionSaving, setSessionSaving] = useState(false);
    const [sessionError, setSessionError] = useState<string | null>(null);

    // stats
    const [stats, setStats] = useState<WeighingStats>({
        today: 0,
        thisWeek: 0,
        animalsWeighed: 0,
        avgGmd: null,
    });

    // formulário de nova pesagem
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [formLotId, setFormLotId] = useState('');
    const [formAnimalCode, setFormAnimalCode] = useState('');
    const [formDate, setFormDate] = useState(today8601());
    const [formWeight, setFormWeight] = useState('');
    const [formSaving, setFormSaving] = useState(false);
    const [formMsg, setFormMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [manualSessionWeighings, setManualSessionWeighings] = useState<ManualSessionWeighing[]>([]);
    const animalCodeInputRef = useRef<HTMLInputElement | null>(null);

    // ── Carregar pesagens ─────────────────────────────────────────────────────

    const load = useCallback(async () => {
        if (!farmId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams({
                limit: String(PAGE_SIZE),
                offset: String(page * PAGE_SIZE),
            });
            if (filterAnimal) params.set('animalId', filterAnimal);
            if (filterLot) params.set('lotId', filterLot);
            if (filterSession) params.set('weighingSessionId', filterSession);
            if (filterStart) params.set('startDate', filterStart);
            if (filterEnd) params.set('endDate', filterEnd);

            const res = await fetch(buildApiUrl(`/farms/${farmId}/weighings?${params}`), {
                credentials: 'include',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao carregar pesagens.');

            const list: FarmWeighing[] = data.weighings ?? [];
            setWeighings(list);
            setTotal(data.total ?? list.length);

            // Calcular stats a partir dos dados mais recentes
            const todayStr = today8601();
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekAgoStr = weekAgo.toISOString().slice(0, 10);

            // Para stats, buscar sem paginação (limite maior)
            const statsRes = await fetch(
                buildApiUrl(`/farms/${farmId}/weighings?limit=500&offset=0`),
                { credentials: 'include' },
            );
            const statsData = await statsRes.json().catch(() => ({}));
            const allList: FarmWeighing[] = statsData.weighings ?? [];

            const todayCount = allList.filter(w => w.date.slice(0, 10) === todayStr).length;
            const weekCount = allList.filter(w => w.date.slice(0, 10) >= weekAgoStr).length;
            const uniqueAnimals = new Set(allList.map(w => w.animal.id)).size;
            const gmds = allList.map(w => w.gmd).filter((g): g is number => g != null);
            const avgGmd = gmds.length > 0 ? gmds.reduce((a, b) => a + b, 0) / gmds.length : null;

            setStats({ today: todayCount, thisWeek: weekCount, animalsWeighed: uniqueAnimals, avgGmd });
        } catch (err: any) {
            setLoadError(err?.message ?? 'Erro desconhecido.');
        } finally {
            setLoading(false);
        }
    }, [farmId, page, filterAnimal, filterLot, filterSession, filterStart, filterEnd]);

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

    const handleStartSession = async (event: React.FormEvent) => {
        event.preventDefault();
        const name = sessionName.trim();
        if (!name) {
            setSessionError('Informe o nome da sessão.');
            return;
        }
        setSessionSaving(true);
        setSessionError(null);
        try {
            const session = await createWeighingSession(farmId, name);
            setActiveSession({ id: session.id, name: session.name });
            setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
            setFilterSession(session.id);
            setFilterStart('');
            setFilterEnd('');
            setPage(0);
            setShowSessionModal(false);
            setSessionName('');
            setManualSessionWeighings([]);
        } catch (err: any) {
            setSessionError(err?.message || 'Erro ao iniciar sessão.');
        } finally {
            setSessionSaving(false);
        }
    };

    const handleOpenHistoryToday = () => {
        const today = today8601();
        setActiveSession(null);
        setFilterSession('');
        setFilterStart(today);
        setFilterEnd(today);
        setPage(0);
        setShowSessionModal(false);
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
    const displayWeight = formWeight.trim()
        ? formWeight.replace(',', '.')
        : '000.0';

    const closeManualModal = () => {
        if (formSaving) return;
        setManualModalOpen(false);
        setFormMsg(null);
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

    // ── Salvar pesagem ────────────────────────────────────────────────────────

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormMsg(null);

        const animal = resolveManualAnimal();
        if (!animal) {
            setFormMsg({ text: 'Informe um ID de animal válido.', type: 'error' });
            return;
        }
        const pesoNum = parseFloat(formWeight.replace(',', '.'));
        if (isNaN(pesoNum) || pesoNum <= 0) {
            setFormMsg({ text: 'Informe um peso válido (maior que zero).', type: 'error' });
            return;
        }
        if (!formDate) {
            setFormMsg({ text: 'Informe a data da pesagem.', type: 'error' });
            return;
        }

        setFormSaving(true);
        try {
            await createWeighing(animal.id, herdType, {
                data: formDate,
                peso: pesoNum,
                ...(activeSession ? { weighingSessionId: activeSession.id } : {}),
            });
            playSuccessBeep();
            setManualSessionWeighings((current) => [
                {
                    animalId: animal.id,
                    animalLabel: animal.identificacao || animal.brinco || animal.nome || animal.id,
                    lotName: animal.lotId ? lots.find((lot) => lot.id === animal.lotId)?.name || null : null,
                    date: formDate,
                    weightKg: pesoNum,
                    savedAt: new Date().toISOString(),
                },
                ...current,
            ]);
            setFormMsg({ text: 'Pesagem registrada com sucesso!', type: 'success' });
            setFormWeight('');
            setFormDate(today8601());
            setFormAnimalCode('');
            setPage(0);
            load();
            loadSessions();
            window.setTimeout(() => animalCodeInputRef.current?.focus(), 0);
        } catch (err: any) {
            setFormMsg({ text: err?.message ?? 'Erro ao salvar.', type: 'error' });
        } finally {
            setFormSaving(false);
        }
    };

    // ── Paginação ─────────────────────────────────────────────────────────────

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {showSessionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-2xl">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--eixo-text-muted)]">Pesagens</p>
                            <h3 className="mt-1 text-xl font-black text-[var(--eixo-text)]">Nome da sessão de pesagem</h3>
                            <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                                Esse nome vai agrupar todas as pesagens lançadas agora.
                            </p>
                        </div>

                        <form onSubmit={handleStartSession} className="mt-5 space-y-4">
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

                            {sessionError && (
                                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{sessionError}</p>
                            )}

                            <div className="flex flex-wrap justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={handleOpenHistoryToday}
                                    disabled={sessionSaving}
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                                >
                                    Ver histórico
                                </button>
                                <button
                                    type="submit"
                                    disabled={sessionSaving}
                                    className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-50"
                                >
                                    {sessionSaving ? 'Iniciando...' : 'Iniciar sessão'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Gráfico de evolução — aparece quando um animal está selecionado no filtro */}
            {filterAnimal && (() => {
                const a = animals.find(x => x.id === filterAnimal);
                const label = a
                    ? `${a.identificacao}${a.categoria ? ' · ' + a.categoria : ''}`
                    : '';
                return (
                    <WeightEvolutionChart
                        animalId={filterAnimal}
                        animalLabel={label}
                        herdType={herdType}
                    />
                );
            })()}

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
                        setManualModalOpen(true);
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
                            setFilterSession('');
                            setPage(0);
                        }}
                        className="rounded-xl border border-[var(--eixo-border-strong)] bg-[var(--eixo-surface)] px-3 py-1.5 text-xs font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                    >
                        Encerrar sessão
                    </button>
                </div>
            )}

            {manualModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={closeManualModal}
                >
                    <div
                        className="w-full max-w-[760px] rounded-[20px] border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase text-[#6d6558]">Curral</p>
                                <h3 className="text-xl font-black text-[#2f3a2d]">PESAGEM MANUAL</h3>
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

                        <form onSubmit={handleSave} className="rounded-[18px] border border-[#2f3a2d] bg-[#2f3a2d] p-4">
                            <div className="rounded-[14px] border border-[#1f281e] bg-[#dbe3d4] px-4 py-5 text-right shadow-inner">
                                <div className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-[#3f4a3b]">
                                    <span>Peso capturado</span>
                                    <span>kg</span>
                                </div>
                                <div className="font-mono text-5xl font-black leading-none text-[#1f281e] sm:text-6xl">
                                    {displayWeight}
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-black uppercase tracking-[0.12em] text-[#fffaf1]">ID do animal</label>
                                    <input
                                        ref={animalCodeInputRef}
                                        value={formAnimalCode}
                                        onChange={(event) => setFormAnimalCode(event.target.value)}
                                        placeholder="Brinco, ID ou registro"
                                        className="w-full rounded-[14px] border-2 border-[#d7cab3] bg-[#fffaf1] px-4 py-4 text-2xl font-black uppercase text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                    />
                                    <p className="mt-1 text-xs font-semibold text-[#d7cab3]">
                                        Digite exatamente o brinco, ID ou registro do animal.
                                    </p>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-black uppercase tracking-[0.12em] text-[#fffaf1]">Peso em kg</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={formWeight}
                                        onChange={(event) => setFormWeight(event.target.value)}
                                        placeholder="Ex: 425"
                                        className="w-full rounded-[14px] border-2 border-[#d7cab3] bg-[#fffaf1] px-4 py-4 text-2xl font-black text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                    />
                                </div>
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase text-[#d7cab3]">Lote</label>
                                    <select
                                        value={formLotId}
                                        onChange={(event) => {
                                            setFormLotId(event.target.value);
                                            setFormAnimalCode('');
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
                                        onChange={(event) => setFormDate(event.target.value)}
                                        className="w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]"
                                    />
                                </div>
                            </div>

                            <div className="mt-3 min-h-[24px] text-sm">
                                {selectedManualAnimal && (
                                    <span className="text-[#d7cab3]">
                                        Animal: {selectedManualAnimal.identificacao}
                                        {selectedManualAnimal.raca ? ` · ${selectedManualAnimal.raca}` : ''}
                                        {selectedManualAnimal.lotId ? ` · ${lots.find((lot) => lot.id === selectedManualAnimal.lotId)?.name || 'Lote'}` : ''}
                                    </span>
                                )}
                                {formMsg && (
                                    <p className={formMsg.type === 'success' ? 'text-[#b9d6a9]' : 'text-[#f0b4a7]'}>
                                        {formMsg.text}
                                    </p>
                                )}
                            </div>

                            <div className="mt-4 flex justify-end gap-3">
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
                                    {formSaving ? 'Salvando...' : 'Registrar pesagem'}
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

            {/* Filtros + tabela */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                {/* Filtros */}
                <div className="flex flex-wrap items-end gap-3 border-b border-[var(--eixo-border)] px-6 py-4">
                    <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Animal</label>
                        <select
                            value={filterAnimal}
                            onChange={e => { setFilterAnimal(e.target.value); setPage(0); }}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        >
                            <option value="">Todos os animais</option>
                            {animals.map(a => (
                                <option key={a.id} value={a.id}>{a.identificacao}</option>
                            ))}
                        </select>
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
                    <div className="min-w-[180px] flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Sessão</label>
                        <select
                            value={filterSession}
                            onChange={e => { setFilterSession(e.target.value); setPage(0); }}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        >
                            <option value="">Todas as sessões</option>
                            {sessions.map(session => (
                                <option key={session.id} value={session.id}>
                                    {session.name}{typeof session.weighingsCount === 'number' ? ` (${session.weighingsCount})` : ''}
                                </option>
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
                    {(filterAnimal || filterLot || filterSession || filterStart || filterEnd) && (
                        <button
                            onClick={() => { setFilterAnimal(''); setFilterLot(''); setFilterSession(''); setFilterStart(''); setFilterEnd(''); setPage(0); }}
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
                ) : weighings.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-[#a8a29e]">
                        Nenhuma pesagem encontrada.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-left text-xs font-medium uppercase tracking-wide text-[var(--eixo-text-muted)]">
                                    <th className="px-4 py-3">Data</th>
                                    <th className="px-4 py-3">Animal</th>
                                    <th className="px-4 py-3">Lote</th>
                                    <th className="px-4 py-3">Sessão</th>
                                    <th className="px-4 py-3">Raça</th>
                                    <th className="px-4 py-3">Categoria</th>
                                    <th className="px-4 py-3 text-right">Peso Anterior</th>
                                    <th className="px-4 py-3 text-right">Peso Atual</th>
                                    <th className="px-4 py-3 text-right">Ganho</th>
                                    <th className="px-4 py-3 text-right">GMD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {weighings.map((w, idx) => (
                                    <tr
                                        key={w.id}
                                        className={`border-b border-[var(--eixo-border)] transition-colors hover:bg-[var(--eixo-surface-soft)] ${
                                            idx % 2 === 0 ? 'bg-[var(--eixo-surface)]' : 'bg-[#fafaf9]'
                                        }`}
                                    >
                                        <td className="px-4 py-3 text-[var(--eixo-text)]">{fmtDate(w.date)}</td>
                                        <td className="px-4 py-3 font-medium text-[var(--eixo-text)]">
                                            {w.animal.brinco ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{w.animal.lotName ?? '—'}</td>
                                        <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{w.weighingSessionName ?? '—'}</td>
                                        <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{w.animal.raca ?? '—'}</td>
                                        <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{w.animal.categoria ?? '—'}</td>
                                        <td className="px-4 py-3 text-right text-[var(--eixo-text-muted)]">
                                            {fmtKg(w.previousWeightKg)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-[var(--eixo-text)]">
                                            {fmtKg(w.weightKg)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {w.gainKg != null ? (
                                                <span
                                                    className={
                                                        w.gainKg >= 0
                                                            ? 'text-green-700'
                                                            : 'text-red-600'
                                                    }
                                                >
                                                    {w.gainKg >= 0 ? '+' : ''}
                                                    {w.gainKg.toFixed(1)} kg
                                                </span>
                                            ) : (
                                                <span className="text-[#a8a29e]">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {w.gmd != null ? (
                                                <span
                                                    className={
                                                        w.gmd >= 0
                                                            ? 'text-green-700'
                                                            : 'text-red-600'
                                                    }
                                                >
                                                    {fmtGmd(w.gmd)}
                                                </span>
                                            ) : (
                                                <span className="text-[#a8a29e]">—</span>
                                            )}
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
        </div>
    );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
    label: string;
    value: string;
    accent?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, accent }) => (
    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
        <p className="text-xs font-medium text-[var(--eixo-text-muted)]">{label}</p>
        <p
            className={`mt-1 text-2xl font-bold ${
                accent ? 'text-[var(--eixo-green)]' : 'text-[var(--eixo-text)]'
            }`}
        >
            {value}
        </p>
    </div>
);

export default WeighingsTab;
