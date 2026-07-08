import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animal, AnimalSexo } from '../types';
import { buildApiUrl } from '../api';
import {
    listCheckups,
    createCheckup,
    updateCheckup,
    deleteCheckup,
    getReproKpis,
    getReproFarol,
    ReproCheckupSession,
    ReproKpis,
    ReproFarol,
    NewCheckupRecord,
} from '../adapters/reproApi';

type TabKey = 'indicadores' | 'avaliacoes' | 'nova';

interface Season {
    id: string;
    name: string;
}

interface ReproModuleProps {
    farmId?: string | null;
}

type Choice = '' | 'PRENHE' | 'VAZIA';
interface ChoiceState {
    choice: Choice;
    previsaoParto: string;
}

const cardClass = 'bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-6 space-y-4';
const labelClass = 'block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]';
const inputClass =
    'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]';

const todayISO = () => new Date().toISOString().slice(0, 10);

const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
};

const ReproModule: React.FC<ReproModuleProps> = ({ farmId }) => {
    const [activeTab, setActiveTab] = useState<TabKey>('indicadores');
    const [animals, setAnimals] = useState<Animal[]>([]);
    const [seasons, setSeasons] = useState<Season[]>([]);
    const [sessions, setSessions] = useState<ReproCheckupSession[]>([]);
    const [kpis, setKpis] = useState<ReproKpis | null>(null);
    const [farol, setFarol] = useState<ReproFarol | null>(null);
    const [kpiSeasonId, setKpiSeasonId] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Formulário "Nova avaliação"
    const [occurredAt, setOccurredAt] = useState(todayISO());
    const [responsibleName, setResponsibleName] = useState('');
    const [formSeasonId, setFormSeasonId] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [choices, setChoices] = useState<Record<string, ChoiceState>>({});
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [formOk, setFormOk] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    const femaleAnimals = useMemo(
        () => animals.filter((animal) => animal.sexo === AnimalSexo.FEMEA),
        [animals],
    );

    const loadAnimals = useCallback(async () => {
        if (!farmId) {
            setAnimals([]);
            return;
        }
        try {
            const response = await fetch(buildApiUrl(`/animals?farmId=${farmId}`), { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            setAnimals(response.ok ? payload.animals || [] : []);
        } catch {
            setAnimals([]);
        }
    }, [farmId]);

    const loadSeasons = useCallback(async () => {
        if (!farmId) {
            setSeasons([]);
            return;
        }
        try {
            const response = await fetch(buildApiUrl(`/seasons?farmId=${farmId}`), { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            setSeasons(response.ok ? payload.seasons || [] : []);
        } catch {
            setSeasons([]);
        }
    }, [farmId]);

    const loadSessions = useCallback(async () => {
        if (!farmId) {
            setSessions([]);
            return;
        }
        try {
            setSessions(await listCheckups(farmId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar avaliações.');
        }
    }, [farmId]);

    const loadKpis = useCallback(async () => {
        if (!farmId) {
            setKpis(null);
            setFarol(null);
            return;
        }
        try {
            const [kpiData, farolData] = await Promise.all([
                getReproKpis(farmId, kpiSeasonId || null),
                getReproFarol(farmId, kpiSeasonId || null),
            ]);
            setKpis(kpiData);
            setFarol(farolData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar indicadores.');
        }
    }, [farmId, kpiSeasonId]);

    useEffect(() => {
        setLoading(true);
        Promise.all([loadAnimals(), loadSeasons(), loadSessions()]).finally(() => setLoading(false));
    }, [loadAnimals, loadSeasons, loadSessions]);

    useEffect(() => {
        loadKpis();
    }, [loadKpis]);

    const setChoice = (animalId: string, choice: Choice) => {
        setChoices((prev) => ({
            ...prev,
            [animalId]: { choice, previsaoParto: prev[animalId]?.previsaoParto || '' },
        }));
    };

    const setPrevisao = (animalId: string, previsaoParto: string) => {
        setChoices((prev) => ({
            ...prev,
            [animalId]: { choice: prev[animalId]?.choice || '', previsaoParto },
        }));
    };

    const markedCount = useMemo(
        () => Object.values(choices).filter((c: ChoiceState) => c.choice === 'PRENHE' || c.choice === 'VAZIA').length,
        [choices],
    );

    const resetForm = () => {
        setEditingId(null);
        setOccurredAt(todayISO());
        setResponsibleName('');
        setFormSeasonId('');
        setFormNotes('');
        setChoices({});
    };

    const handleSave = async () => {
        setFormError(null);
        setFormOk(null);
        if (!farmId) return;
        if (!occurredAt) {
            setFormError('Informe a data da avaliação.');
            return;
        }
        const records: NewCheckupRecord[] = (Object.entries(choices) as [string, ChoiceState][])
            .filter(([, c]) => c.choice === 'PRENHE' || c.choice === 'VAZIA')
            .map(([animalId, c]) => ({
                animalId,
                pregnant: c.choice === 'PRENHE',
                previsaoParto: c.choice === 'PRENHE' && c.previsaoParto ? c.previsaoParto : null,
            }));

        if (records.length === 0) {
            setFormError('Marque ao menos uma vaca como prenhe ou vazia.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                farmId,
                occurredAt,
                responsibleName: responsibleName || null,
                seasonId: formSeasonId || null,
                notes: formNotes || null,
                records,
            };
            if (editingId) {
                await updateCheckup(editingId, payload);
                setFormOk('Avaliação atualizada. O status das vacas foi recalculado no Rebanho.');
            } else {
                await createCheckup(payload);
                setFormOk('Avaliação salva. O status das vacas foi atualizado no Rebanho.');
            }
            resetForm();
            await Promise.all([loadSessions(), loadKpis()]);
            setActiveTab('avaliacoes');
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Erro ao salvar avaliação.');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (session: ReproCheckupSession) => {
        setEditingId(session.id);
        setOccurredAt(session.occurredAt.slice(0, 10));
        setResponsibleName(session.responsibleName || '');
        setFormSeasonId(session.seasonId || '');
        setFormNotes(session.notes || '');
        const next: Record<string, ChoiceState> = {};
        session.records.forEach((rec) => {
            if (rec.pregnant === true) {
                next[rec.animalId] = { choice: 'PRENHE', previsaoParto: rec.previsaoParto ? rec.previsaoParto.slice(0, 10) : '' };
            } else if (rec.pregnant === false) {
                next[rec.animalId] = { choice: 'VAZIA', previsaoParto: '' };
            }
        });
        setChoices(next);
        setFormError(null);
        setFormOk(null);
        setActiveTab('nova');
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteCheckup(id);
            await Promise.all([loadSessions(), loadKpis()]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao apagar avaliação.');
        }
    };

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'indicadores', label: 'Indicadores' },
        { key: 'avaliacoes', label: 'Avaliações' },
        { key: 'nova', label: 'Nova avaliação' },
    ];

    const kpiCards = kpis
        ? [
              { label: 'Taxa de prenhez', value: kpis.pregRate === null ? '—' : `${kpis.pregRate}%`, strong: true },
              { label: 'Avaliadas', value: String(kpis.evaluated) },
              { label: 'Prenhes', value: String(kpis.pregnant) },
              { label: 'Vazias', value: String(kpis.empty) },
              { label: 'Vazias repetidas', value: String(kpis.repeatEmptyCount) },
              { label: 'Candidatas a descarte', value: String(kpis.discardCandidateCount) },
          ]
        : [];

    return (
        <div className="space-y-6">
            <div className="rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-5 py-4">
                <h2 className="m-0 text-[20px] font-bold leading-[24px] text-[var(--eixo-text)]">Reprodução</h2>
                <p className="mt-1 text-[13px] leading-[18px] text-[var(--eixo-text-muted)] opacity-75">
                    Registre as avaliações (toque) das fêmeas e acompanhe os indicadores de decisão.
                </p>
            </div>

            {error && <p className="text-sm text-[var(--eixo-danger)]">{error}</p>}

            <div className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                            activeTab === tab.key
                                ? 'bg-[var(--eixo-green)] text-[#1a1a1a]'
                                : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Indicadores ── */}
            {activeTab === 'indicadores' && (
                <div className={cardClass}>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-[var(--eixo-text)]">Indicadores de decisão</h3>
                            <p className="text-xs text-[var(--eixo-text-muted)] mt-1">
                                Resumo das avaliações da fazenda.
                            </p>
                        </div>
                        {seasons.length > 0 && (
                            <div>
                                <label className={labelClass}>Filtrar por estação</label>
                                <select
                                    value={kpiSeasonId}
                                    onChange={(e) => setKpiSeasonId(e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="">Todas</option>
                                    {seasons.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {!kpis || kpis.evaluated === 0 ? (
                        <p className="text-sm text-[var(--eixo-text-muted)]">
                            Nenhuma vaca avaliada ainda. Registre uma avaliação na aba "Nova avaliação".
                        </p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {kpiCards.map((card) => (
                                <div
                                    key={card.label}
                                    className="rounded-2xl border border-[var(--eixo-border)] px-4 py-3"
                                >
                                    <p className="text-xs text-[var(--eixo-text-muted)]">{card.label}</p>
                                    <p
                                        className={`mt-1 font-bold text-[var(--eixo-text)] ${
                                            card.strong ? 'text-3xl' : 'text-2xl'
                                        }`}
                                    >
                                        {card.value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {farol && kpis && kpis.evaluated > 0 && (
                        <div className="space-y-3 border-t border-[var(--eixo-border)] pt-4">
                            <h3 className="text-sm font-semibold text-[var(--eixo-text)]">Farol do rebanho</h3>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-[var(--eixo-border)] px-4 py-3">
                                    <p className="text-xs text-[var(--eixo-text-muted)]">🟢 Produtivas (prenhes)</p>
                                    <p className="mt-1 text-2xl font-bold text-[var(--eixo-green)]">{farol.farol.green}</p>
                                </div>
                                <div className="rounded-2xl border border-[var(--eixo-border)] px-4 py-3">
                                    <p className="text-xs text-[var(--eixo-text-muted)]">🟡 Observação (vazia 1ª vez)</p>
                                    <p className="mt-1 text-2xl font-bold text-[#c9a227]">{farol.farol.yellow}</p>
                                </div>
                                <div className="rounded-2xl border border-[var(--eixo-border)] px-4 py-3">
                                    <p className="text-xs text-[var(--eixo-text-muted)]">🔴 Sugestão de descarte</p>
                                    <p className="mt-1 text-2xl font-bold text-[var(--eixo-danger)]">{farol.farol.red}</p>
                                </div>
                            </div>
                            {farol.redAnimals.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                        Vacas sugeridas para descarte
                                    </p>
                                    <ul className="mt-2 space-y-1">
                                        {farol.redAnimals.map((a) => (
                                            <li
                                                key={a.animalId}
                                                className="flex items-center justify-between rounded-xl border border-[var(--eixo-border)] px-3 py-2 text-sm text-[var(--eixo-text)]"
                                            >
                                                <span className="font-medium">{a.label}</span>
                                                <span className="text-xs text-[var(--eixo-danger)]">{a.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Avaliações ── */}
            {activeTab === 'avaliacoes' && (
                <div className={cardClass}>
                    <h3 className="text-sm font-semibold text-[var(--eixo-text)]">Avaliações registradas</h3>
                    {loading ? (
                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando…</p>
                    ) : sessions.length === 0 ? (
                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma avaliação registrada ainda.</p>
                    ) : (
                        <ul className="space-y-3">
                            {sessions.map((session) => (
                                <li key={session.id} className="rounded-2xl border border-[var(--eixo-border)] px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold text-[var(--eixo-text)]">
                                                {formatDate(session.occurredAt)} · {session.recordsCount} vaca(s)
                                            </p>
                                            <p className="text-xs text-[var(--eixo-text-muted)]">
                                                {session.responsibleName || 'Sem responsável'}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpandedId(expandedId === session.id ? null : session.id)
                                                }
                                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text-muted)]"
                                            >
                                                {expandedId === session.id ? 'Ocultar' : 'Ver fichas'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => startEdit(session)}
                                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text-muted)]"
                                            >
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(session.id)}
                                                className="rounded-lg border border-[var(--eixo-danger)] px-3 py-1 text-xs font-semibold text-[var(--eixo-danger)]"
                                            >
                                                Apagar
                                            </button>
                                        </div>
                                    </div>
                                    {expandedId === session.id && (
                                        <ul className="mt-3 space-y-1 border-t border-[var(--eixo-border)] pt-3">
                                            {session.records.map((rec) => (
                                                <li
                                                    key={rec.id}
                                                    className="flex items-center justify-between text-sm text-[var(--eixo-text)]"
                                                >
                                                    <span>{rec.animal?.brinco || rec.animal?.nome || rec.animalId}</span>
                                                    <span
                                                        className={
                                                            rec.pregnant === true
                                                                ? 'font-semibold text-[var(--eixo-green)]'
                                                                : rec.pregnant === false
                                                                  ? 'font-semibold text-[var(--eixo-danger)]'
                                                                  : 'text-[var(--eixo-text-muted)]'
                                                        }
                                                    >
                                                        {rec.pregnant === true
                                                            ? `Prenhe${rec.previsaoParto ? ` · parto ${formatDate(rec.previsaoParto)}` : ''}`
                                                            : rec.pregnant === false
                                                              ? 'Vazia'
                                                              : 'Não avaliada'}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* ── Nova avaliação ── */}
            {activeTab === 'nova' && (
                <div className={cardClass}>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[var(--eixo-text)]">
                            {editingId ? 'Editar avaliação' : 'Nova avaliação'}
                        </h3>
                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text-muted)]"
                            >
                                Cancelar edição
                            </button>
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <label className={labelClass}>Data</label>
                            <input
                                type="date"
                                value={occurredAt}
                                onChange={(e) => setOccurredAt(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Responsável</label>
                            <input
                                type="text"
                                value={responsibleName}
                                onChange={(e) => setResponsibleName(e.target.value)}
                                placeholder="Opcional"
                                className={inputClass}
                            />
                        </div>
                        {seasons.length > 0 && (
                            <div>
                                <label className={labelClass}>Estação (opcional)</label>
                                <select
                                    value={formSeasonId}
                                    onChange={(e) => setFormSeasonId(e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="">Sem estação</option>
                                    {seasons.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className={labelClass}>Observações</label>
                            <input
                                type="text"
                                value={formNotes}
                                onChange={(e) => setFormNotes(e.target.value)}
                                placeholder="Opcional"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-[var(--eixo-text-muted)]">
                            Marque cada fêmea como prenhe ou vazia. Quem ficar sem marcação não entra na avaliação.
                        </p>
                        {femaleAnimals.length === 0 ? (
                            <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                                Nenhuma fêmea encontrada no rebanho desta fazenda.
                            </p>
                        ) : (
                            <ul className="mt-3 space-y-2">
                                {femaleAnimals.map((animal) => {
                                    const state = choices[animal.id] || { choice: '' as Choice, previsaoParto: '' };
                                    return (
                                        <li
                                            key={animal.id}
                                            className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--eixo-border)] px-3 py-2"
                                        >
                                            <span className="min-w-[120px] text-sm font-medium text-[var(--eixo-text)]">
                                                {animal.brinco || animal.id}
                                            </span>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setChoice(animal.id, 'PRENHE')}
                                                    className={`rounded-lg px-3 py-1 text-xs font-semibold border ${
                                                        state.choice === 'PRENHE'
                                                            ? 'border-[var(--eixo-green)] bg-[var(--eixo-green)] text-[#1a1a1a]'
                                                            : 'border-[var(--eixo-border)] text-[var(--eixo-text-muted)]'
                                                    }`}
                                                >
                                                    Prenhe
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setChoice(animal.id, 'VAZIA')}
                                                    className={`rounded-lg px-3 py-1 text-xs font-semibold border ${
                                                        state.choice === 'VAZIA'
                                                            ? 'border-[var(--eixo-danger)] bg-[var(--eixo-danger)] text-white'
                                                            : 'border-[var(--eixo-border)] text-[var(--eixo-text-muted)]'
                                                    }`}
                                                >
                                                    Vazia
                                                </button>
                                                {state.choice !== '' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setChoice(animal.id, '')}
                                                        className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs text-[var(--eixo-text-muted)]"
                                                    >
                                                        Limpar
                                                    </button>
                                                )}
                                            </div>
                                            {state.choice === 'PRENHE' && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-[var(--eixo-text-muted)]">Previsão de parto</span>
                                                    <input
                                                        type="date"
                                                        value={state.previsaoParto}
                                                        onChange={(e) => setPrevisao(animal.id, e.target.value)}
                                                        className="rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1 text-xs"
                                                    />
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {formError && <p className="text-sm text-[var(--eixo-danger)]">{formError}</p>}
                    {formOk && <p className="text-sm text-[var(--eixo-green)]">{formOk}</p>}

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || markedCount === 0}
                        className="w-full rounded-xl bg-primary text-[#1a1a1a] font-semibold py-2 transition-colors hover:bg-primary-dark disabled:opacity-50"
                    >
                        {saving
                            ? 'Salvando…'
                            : `${editingId ? 'Salvar alterações' : 'Salvar avaliação'} (${markedCount} vaca(s))`}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ReproModule;
