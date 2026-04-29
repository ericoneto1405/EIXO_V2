import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CategoryTarget {
    id?: string;
    categoria: string;
    pesoAlvoKg: string;
}

interface Breed {
    id: string;
    name: string;
}

interface HerdSettingsTabProps {
    farmId: string;
}

// ─── Categorias padrão do sistema ─────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
    'Touro',
    'Vaca',
    'Novilha',
    'Novilho',
    'Bezerro(a)',
    'Boi',
];

// ─── Componente ───────────────────────────────────────────────────────────────

const HerdSettingsTab: React.FC<HerdSettingsTabProps> = ({ farmId }) => {
    // ── Intervalo de pesagem
    const [interval, setInterval] = useState('30');
    const [intervalSaving, setIntervalSaving] = useState(false);
    const [intervalMsg, setIntervalMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // ── Pesos alvo por categoria
    const [targets, setTargets] = useState<CategoryTarget[]>([]);
    const [targetsSaving, setTargetsSaving] = useState(false);
    const [targetsMsg, setTargetsMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // ── Raças
    const [breeds, setBreeds] = useState<Breed[]>([]);
    const [newBreed, setNewBreed] = useState('');
    const [breedAdding, setBreedAdding] = useState(false);
    const [breedDeleting, setBreedDeleting] = useState<string | null>(null);
    const [breedMsg, setBreedMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ── Carregar configurações ────────────────────────────────────────────────

    useEffect(() => {
        if (!farmId) return;
        const load = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const [settingsRes, breedsRes] = await Promise.all([
                    fetch(buildApiUrl(`/farms/${farmId}/herd-settings`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/farms/${farmId}/breeds`), { credentials: 'include' }),
                ]);

                const data = await settingsRes.json().catch(() => ({}));
                if (!settingsRes.ok) throw new Error(data?.message || 'Erro ao carregar configurações.');

                setInterval(String(data.weighingIntervalDays ?? 30));

                // Montar lista garantindo todas as categorias padrão
                const saved: Record<string, number | null> = {};
                (data.categoryTargets ?? []).forEach((t: any) => {
                    saved[t.categoria] = t.pesoAlvoKg ?? null;
                });

                const merged = DEFAULT_CATEGORIES.map(cat => ({
                    categoria: cat,
                    pesoAlvoKg: saved[cat] != null ? String(saved[cat]) : '',
                }));

                Object.keys(saved).forEach(cat => {
                    if (!DEFAULT_CATEGORIES.includes(cat)) {
                        merged.push({
                            categoria: cat,
                            pesoAlvoKg: saved[cat] != null ? String(saved[cat]) : '',
                        });
                    }
                });

                setTargets(merged);

                const breedsData = await breedsRes.json().catch(() => ({}));
                setBreeds(breedsData.breeds ?? []);
            } catch (err: any) {
                setLoadError(err?.message ?? 'Erro desconhecido.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [farmId]);

    // ── Salvar intervalo ──────────────────────────────────────────────────────

    const handleSaveInterval = async (e: React.FormEvent) => {
        e.preventDefault();
        setIntervalMsg(null);
        const val = parseInt(interval, 10);
        if (isNaN(val) || val < 1 || val > 365) {
            setIntervalMsg({ text: 'Informe um valor entre 1 e 365 dias.', type: 'error' });
            return;
        }
        setIntervalSaving(true);
        try {
            const res = await fetch(buildApiUrl(`/farms/${farmId}/herd-settings`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ weighingIntervalDays: val }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao salvar.');
            setIntervalMsg({ text: 'Intervalo salvo com sucesso!', type: 'success' });
        } catch (err: any) {
            setIntervalMsg({ text: err?.message ?? 'Erro ao salvar.', type: 'error' });
        } finally {
            setIntervalSaving(false);
        }
    };

    // ── Salvar pesos alvo ─────────────────────────────────────────────────────

    const handleSaveTargets = async (e: React.FormEvent) => {
        e.preventDefault();
        setTargetsMsg(null);
        setTargetsSaving(true);
        try {
            const payload = targets
                .filter(t => t.categoria.trim() !== '')
                .map(t => ({
                    categoria: t.categoria,
                    pesoAlvoKg: t.pesoAlvoKg !== '' ? parseFloat(t.pesoAlvoKg.replace(',', '.')) : null,
                }));

            const res = await fetch(buildApiUrl(`/farms/${farmId}/herd-settings/category-targets`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ targets: payload }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao salvar.');
            setTargetsMsg({ text: 'Pesos alvo salvos com sucesso!', type: 'success' });
        } catch (err: any) {
            setTargetsMsg({ text: err?.message ?? 'Erro ao salvar.', type: 'error' });
        } finally {
            setTargetsSaving(false);
        }
    };

    // ── Adicionar raça ────────────────────────────────────────────────────────

    const handleAddBreed = async (e: React.FormEvent) => {
        e.preventDefault();
        setBreedMsg(null);
        const name = newBreed.trim();
        if (!name) return;
        setBreedAdding(true);
        try {
            const res = await fetch(buildApiUrl(`/farms/${farmId}/breeds`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao adicionar.');
            setBreeds(prev => [...prev, data.breed].sort((a, b) => a.name.localeCompare(b.name)));
            setNewBreed('');
        } catch (err: any) {
            setBreedMsg({ text: err?.message ?? 'Erro ao adicionar raça.', type: 'error' });
        } finally {
            setBreedAdding(false);
        }
    };

    // ── Remover raça ──────────────────────────────────────────────────────────

    const handleDeleteBreed = async (id: string) => {
        setBreedMsg(null);
        setBreedDeleting(id);
        try {
            const res = await fetch(buildApiUrl(`/farms/${farmId}/breeds/${id}`), {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.message || 'Erro ao remover.');
            }
            setBreeds(prev => prev.filter(b => b.id !== id));
        } catch (err: any) {
            setBreedMsg({ text: err?.message ?? 'Erro ao remover raça.', type: 'error' });
        } finally {
            setBreedDeleting(null);
        }
    };

    const updateTargetPeso = (idx: number, value: string) => {
        setTargets(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], pesoAlvoKg: value };
            return next;
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="py-12 text-center text-sm text-[#a8a29e]">Carregando configurações…</div>
        );
    }

    if (loadError) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
                {loadError}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Intervalo de pesagem */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6">
                <h3 className="mb-1 text-base font-semibold text-[var(--eixo-text)]">Intervalo de Pesagem</h3>
                <p className="mb-5 text-sm text-[var(--eixo-text-muted)]">
                    Define de quantos em quantos dias o sistema alerta para uma nova pesagem.
                </p>

                {intervalMsg && (
                    <div
                        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                            intervalMsg.type === 'success'
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                    >
                        {intervalMsg.text}
                    </div>
                )}

                <form onSubmit={handleSaveInterval} className="flex items-end gap-4">
                    <div className="w-48">
                        <label className="mb-1 block text-xs font-medium text-[var(--eixo-text-muted)]">
                            Dias entre pesagens
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={1}
                                max={365}
                                value={interval}
                                onChange={e => setInterval(e.target.value)}
                                className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                            />
                            <span className="whitespace-nowrap text-sm text-[var(--eixo-text-muted)]">dias</span>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={intervalSaving}
                        className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--eixo-green-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/30 disabled:opacity-50"
                    >
                        {intervalSaving ? 'Salvando…' : 'Salvar'}
                    </button>
                </form>
            </div>

            {/* Pesos alvo por categoria */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6">
                <h3 className="mb-1 text-base font-semibold text-[var(--eixo-text)]">Peso Alvo por Categoria</h3>
                <p className="mb-5 text-sm text-[var(--eixo-text-muted)]">
                    Peso alvo de abate ou saída para cada categoria do rebanho. Deixe em branco para não definir.
                </p>

                {targetsMsg && (
                    <div
                        className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                            targetsMsg.type === 'success'
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                    >
                        {targetsMsg.text}
                    </div>
                )}

                <form onSubmit={handleSaveTargets}>
                    <div className="mb-5 overflow-hidden rounded-xl border border-[var(--eixo-border)]">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-left text-xs font-medium uppercase tracking-wide text-[var(--eixo-text-muted)]">
                                    <th className="px-4 py-3">Categoria</th>
                                    <th className="px-4 py-3 w-48">Peso alvo (kg)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {targets.map((t, idx) => (
                                    <tr
                                        key={t.categoria}
                                        className="border-b border-[var(--eixo-border)] last:border-0"
                                    >
                                        <td className="px-4 py-3 font-medium text-[var(--eixo-text)]">
                                            {t.categoria}
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="—"
                                                value={t.pesoAlvoKg}
                                                onChange={e => updateTargetPeso(idx, e.target.value)}
                                                className="block w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-1.5 text-sm text-[var(--eixo-text)] placeholder:text-[#a8a29e] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <button
                        type="submit"
                        disabled={targetsSaving}
                        className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--eixo-green-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/30 disabled:opacity-50"
                    >
                        {targetsSaving ? 'Salvando…' : 'Salvar pesos alvo'}
                    </button>
                </form>
            </div>

            {/* Raças cadastradas */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6">
                <h3 className="mb-1 text-base font-semibold text-[var(--eixo-text)]">Raças Cadastradas</h3>
                <p className="mb-5 text-sm text-[var(--eixo-text-muted)]">
                    Lista de raças usadas na sua fazenda. Serão sugeridas ao cadastrar animais.
                </p>

                {breedMsg && (
                    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                        breedMsg.type === 'success'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                    }`}>
                        {breedMsg.text}
                    </div>
                )}

                {/* Adicionar nova raça */}
                <form onSubmit={handleAddBreed} className="mb-5 flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Ex: Nelore, Angus, Brahman…"
                        value={newBreed}
                        onChange={e => setNewBreed(e.target.value)}
                        className="block flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[#a8a29e] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10 transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={breedAdding || !newBreed.trim()}
                        className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-50"
                    >
                        {breedAdding ? 'Adicionando…' : 'Adicionar'}
                    </button>
                </form>

                {/* Lista de raças */}
                {breeds.length === 0 ? (
                    <p className="text-sm text-[#a8a29e]">Nenhuma raça cadastrada ainda.</p>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-[var(--eixo-border)]">
                        {breeds.map((b, idx) => (
                            <div
                                key={b.id}
                                className={`flex items-center justify-between px-4 py-3 ${
                                    idx < breeds.length - 1 ? 'border-b border-[var(--eixo-border)]' : ''
                                }`}
                            >
                                <span className="text-sm font-medium text-[var(--eixo-text)]">{b.name}</span>
                                <button
                                    onClick={() => handleDeleteBreed(b.id)}
                                    disabled={breedDeleting === b.id}
                                    className="rounded-lg bg-[#fff2ef] px-3 py-1 text-xs font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[#f5ddd5] disabled:opacity-40"
                                >
                                    {breedDeleting === b.id ? '…' : 'Remover'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HerdSettingsTab;
