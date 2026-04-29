import React, { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../api';
import { createWeighing } from '../adapters/herdApi';
import type { HerdAnimal, HerdType } from '../adapters/herdApi';
import WeightEvolutionChart from './WeightEvolutionChart';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FarmWeighing {
    id: string;
    date: string;
    weightKg: number;
    gmd: number | null;
    previousWeightKg: number | null;
    gainKg: number | null;
    animal: {
        id: string;
        brinco: string | null;
        raca: string | null;
        sexo: string | null;
        categoria: string | null;
    };
}

interface WeighingStats {
    today: number;
    thisWeek: number;
    animalsWeighed: number;
    avgGmd: number | null;
}

interface WeighingsTabProps {
    farmId: string;
    animals: HerdAnimal[];
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

// ─── Componente ──────────────────────────────────────────────────────────────

const WeighingsTab: React.FC<WeighingsTabProps> = ({ farmId, animals, herdType }) => {
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
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');

    // stats
    const [stats, setStats] = useState<WeighingStats>({
        today: 0,
        thisWeek: 0,
        animalsWeighed: 0,
        avgGmd: null,
    });

    // formulário de nova pesagem
    const [formAnimalId, setFormAnimalId] = useState('');
    const [formDate, setFormDate] = useState(today8601());
    const [formWeight, setFormWeight] = useState('');
    const [formSaving, setFormSaving] = useState(false);
    const [formMsg, setFormMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
    }, [farmId, page, filterAnimal, filterStart, filterEnd]);

    useEffect(() => {
        load();
    }, [load]);

    // ── Salvar pesagem ────────────────────────────────────────────────────────

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormMsg(null);

        if (!formAnimalId) {
            setFormMsg({ text: 'Selecione um animal.', type: 'error' });
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
            await createWeighing(formAnimalId, herdType, { data: formDate, peso: pesoNum });
            setFormMsg({ text: 'Pesagem registrada com sucesso!', type: 'success' });
            setFormWeight('');
            setFormDate(today8601());
            setFormAnimalId('');
            setPage(0);
            load();
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
            {/* Cards de estatísticas */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Pesagens hoje" value={String(stats.today)} />
                <StatCard label="Pesagens (7 dias)" value={String(stats.thisWeek)} />
                <StatCard label="Animais pesados (7 dias)" value={String(stats.animalsWeighed)} />
                <StatCard
                    label="GMD médio"
                    value={stats.avgGmd != null ? `${stats.avgGmd.toFixed(2)} kg/dia` : '—'}
                    accent
                />
            </div>

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

            {/* Formulário de nova pesagem */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6">
                <h3 className="mb-4 text-base font-semibold text-[var(--eixo-text)]">Registrar Pesagem</h3>

                {formMsg && (
                    <div
                        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                            formMsg.type === 'success'
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                    >
                        {formMsg.text}
                    </div>
                )}

                <form onSubmit={handleSave} className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px] flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Animal</label>
                        <select
                            value={formAnimalId}
                            onChange={e => setFormAnimalId(e.target.value)}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        >
                            <option value="">Selecione o animal</option>
                            {animals.map(a => (
                                <option key={a.id} value={a.id}>
                                    {a.identificacao}
                                    {a.raca ? ` — ${a.raca}` : ''}
                                    {a.categoria ? ` (${a.categoria})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="w-40">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Data</label>
                        <input
                            type="date"
                            value={formDate}
                            max={today8601()}
                            onChange={e => setFormDate(e.target.value)}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        />
                    </div>

                    <div className="w-36">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">Peso (kg)</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Ex: 425"
                            value={formWeight}
                            onChange={e => setFormWeight(e.target.value)}
                            className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[#a8a29e] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={formSaving}
                        className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--eixo-green-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/30 disabled:opacity-50"
                    >
                        {formSaving ? 'Salvando…' : 'Registrar'}
                    </button>
                </form>
            </div>

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
                    {(filterAnimal || filterStart || filterEnd) && (
                        <button
                            onClick={() => { setFilterAnimal(''); setFilterStart(''); setFilterEnd(''); setPage(0); }}
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
