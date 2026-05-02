import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../api';

type ReproMode = 'CONTINUO' | 'ESTACAO';
type TrafficLight = 'GREEN' | 'YELLOW' | 'RED';
type DecisionType = 'KEEP' | 'WATCH' | 'DISCARD';

interface SelectionItem {
    animal: {
        id: string;
        brinco: string;
        raca: string;
        dataNascimento: string;
        lotId?: string | null;
    };
    kpis: {
        iepDays: number | null;
        openDays: number | null;
        pregRate: number | null;
        emptyAlerts: {
            isEmpty: boolean;
            isRepeatEmpty: boolean;
        };
        lastCalvingDate: string | null;
        lastPregCheck: string | null;
    };
    trafficLight: TrafficLight;
    reasons: string[];
    decision: SelectionDecision | null;
}

interface BreedingSeason {
    id: string;
    name: string;
    startAt: string;
    endAt: string;
}

interface SelectionDecision {
    id: string;
    farmId: string;
    animalId: string;
    decision: DecisionType;
    reason?: string | null;
    createdAt: string;
    updatedAt: string;
}

interface GeneticsSelecaoProps {
    farmId?: string | null;
}

const trafficStyles: Record<TrafficLight, { badge: string; label: string }> = {
    GREEN: { badge: 'bg-emerald-100 text-emerald-700', label: 'Verde' },
    YELLOW: { badge: 'bg-[#f7f1df] text-[var(--eixo-warning)]', label: 'Amarelo' },
    RED: { badge: 'bg-[#f7ddd7] text-[var(--eixo-danger)]', label: 'Vermelho' },
};

const decisionStyles: Record<DecisionType, { badge: string; label: string }> = {
    DISCARD: { badge: 'bg-[#f7ddd7] text-[var(--eixo-danger)]', label: 'Descarte' },
    WATCH: { badge: 'bg-[#f7f1df] text-[var(--eixo-warning)]', label: 'Observar' },
    KEEP: { badge: 'bg-emerald-100 text-emerald-700', label: 'Manter' },
};

const calculateAge = (birthDateString: string): string => {
    const birthDate = new Date(birthDateString);
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
        years -= 1;
        months = (months + 12) % 12;
    }
    if (years > 0) {
        return `${years}a ${months}m`;
    }
    return `${months}m`;
};

const GeneticsSelecao: React.FC<GeneticsSelecaoProps> = ({ farmId }) => {
    const [reproMode, setReproMode] = useState<ReproMode>('CONTINUO');
    const [seasons, setSeasons] = useState<BreedingSeason[]>([]);
    const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [onlyAlert, setOnlyAlert] = useState(false);
    const [items, setItems] = useState<SelectionItem[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
    const [decisionAnimal, setDecisionAnimal] = useState<SelectionItem | null>(null);
    const [decisionReason, setDecisionReason] = useState('');
    const [decisionError, setDecisionError] = useState<string | null>(null);
    const [isSavingDecision, setIsSavingDecision] = useState(false);

    const decisionList = useMemo(
        () => items.map((item) => item.decision).filter(Boolean) as SelectionDecision[],
        [items],
    );

    const loadFarmMode = useCallback(async () => {
        if (!farmId) {
            return;
        }
        try {
            const response = await fetch(buildApiUrl('/farms'), { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            const farm = payload?.farms?.find((item: { id: string; reproMode?: ReproMode }) => item.id === farmId);
            if (farm?.reproMode) {
                setReproMode(farm.reproMode);
            }
        } catch (error) {
            console.error(error);
        }
    }, [farmId]);

    const loadSeasons = useCallback(async () => {
        if (!farmId || reproMode !== 'ESTACAO') {
            setSeasons([]);
            setSelectedSeasonId(null);
            return;
        }
        try {
            const response = await fetch(buildApiUrl(`/seasons?farmId=${farmId}`), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSeasons([]);
                setSelectedSeasonId(null);
                return;
            }
            const loadedSeasons = payload.seasons || [];
            setSeasons(loadedSeasons);
            if (loadedSeasons.length && !loadedSeasons.some((season: BreedingSeason) => season.id === selectedSeasonId)) {
                setSelectedSeasonId(loadedSeasons[0].id);
            }
            if (!loadedSeasons.length) {
                setSelectedSeasonId(null);
            }
        } catch (error) {
            console.error(error);
            setSeasons([]);
            setSelectedSeasonId(null);
        }
    }, [farmId, reproMode, selectedSeasonId]);

    const loadSelection = useCallback(async () => {
        if (!farmId) {
            setItems([]);
            setTotal(0);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams({
                farmId,
                onlyFemales: '1',
                status: onlyAlert ? 'alert' : 'all',
                limit: '100',
                offset: '0',
            });
            if (search.trim()) {
                params.set('search', search.trim());
            }
            if (reproMode === 'ESTACAO' && selectedSeasonId) {
                params.set('seasonId', selectedSeasonId);
            }
            const response = await fetch(buildApiUrl(`/genetics/selection?${params.toString()}`), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setItems([]);
                setTotal(0);
                setLoadError(payload?.message || 'Erro ao carregar seleção.');
                return;
            }
            setItems(payload.items || []);
            setTotal(payload.total || 0);
        } catch (error) {
            console.error(error);
            setItems([]);
            setTotal(0);
            setLoadError('Não foi possível carregar seleção.');
        } finally {
            setIsLoading(false);
        }
    }, [farmId, onlyAlert, reproMode, search, selectedSeasonId]);

    useEffect(() => {
        loadFarmMode();
    }, [loadFarmMode]);

    useEffect(() => {
        loadSeasons();
    }, [loadSeasons]);

    useEffect(() => {
        loadSelection();
    }, [loadSelection]);

    const openDecisionModal = (item: SelectionItem) => {
        setDecisionAnimal(item);
        setDecisionReason('');
        setDecisionError(null);
        setIsDecisionModalOpen(true);
    };

    const closeDecisionModal = () => {
        setDecisionAnimal(null);
        setDecisionReason('');
        setDecisionError(null);
        setIsDecisionModalOpen(false);
    };

    const submitDecision = async (decision: DecisionType, reason?: string) => {
        if (!farmId || !decisionAnimal) {
            return;
        }
        setDecisionError(null);
        setIsSavingDecision(true);
        try {
            const response = await fetch(buildApiUrl('/genetics/selection/decisions'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    farmId,
                    animalId: decisionAnimal.animal.id,
                    decision,
                    reason,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setDecisionError(payload?.message || 'Não foi possível salvar a decisão.');
                return;
            }
            await loadSelection();
            closeDecisionModal();
        } catch (error) {
            console.error(error);
            setDecisionError('Não foi possível salvar a decisão.');
        } finally {
            setIsSavingDecision(false);
        }
    };

    const handleDecision = async (item: SelectionItem, decision: DecisionType) => {
        setDecisionAnimal(item);
        if (decision === 'DISCARD') {
            openDecisionModal(item);
            return;
        }
        setDecisionReason('');
        await submitDecision(decision);
    };

    const clearDecision = async (animalId: string) => {
        if (!farmId) {
            return;
        }
        try {
            await fetch(buildApiUrl(`/genetics/selection/decisions/${animalId}?farmId=${farmId}`), {
                method: 'DELETE',
                credentials: 'include',
            });
            await loadSelection();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDiscardSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!decisionReason.trim()) {
            setDecisionError('Informe o motivo do descarte.');
            return;
        }
        await submitDecision('DISCARD', decisionReason.trim());
    };

    const formatRate = (value: number | null) => {
        if (value === null || Number.isNaN(value)) {
            return '-';
        }
        return `${Math.round(value * 100)}%`;
    };

    return (
        <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">Seleção</h2>
                    <p className="text-sm text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Matrizes com indicadores reprodutivos e semáforo.</p>
                </div>
                <div className="text-sm text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">
                    {total} matrizes
                </div>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-4">
                <div className="lg:col-span-2">
                    <label className="text-xs uppercase text-[var(--eixo-text-muted)]">Buscar por brinco</label>
                    <input
                        className="mt-1 w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-text)] focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)] dark:text-[var(--eixo-text)]"
                        placeholder="Ex: F001"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <div>
                    <label className="text-xs uppercase text-[var(--eixo-text-muted)]">Só em alerta</label>
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            id="only-alert-toggle"
                            type="checkbox"
                            className="h-4 w-4 rounded border-[var(--eixo-border)] text-primary focus:ring-[var(--eixo-graphite)]/10"
                            checked={onlyAlert}
                            onChange={(event) => setOnlyAlert(event.target.checked)}
                        />
                        <label htmlFor="only-alert-toggle" className="text-sm text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">
                            Mostrar somente alertas
                        </label>
                    </div>
                </div>
                <div>
                    <label className="text-xs uppercase text-[var(--eixo-text-muted)]">Estação</label>
                    {reproMode === 'ESTACAO' ? (
                        <select
                            className="mt-1 w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-text)] focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)] dark:text-[var(--eixo-text)]"
                            value={selectedSeasonId || ''}
                            onChange={(event) => setSelectedSeasonId(event.target.value || null)}
                        >
                            <option value="">Selecione</option>
                            {seasons.map((season) => (
                                <option key={season.id} value={season.id}>
                                    {season.name}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Sem estação (modo contínuo)</p>
                    )}
                </div>
            </div>

            {loadError && (
                <div className="mt-4 rounded-lg border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                    {loadError}
                </div>
            )}

            <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm text-left text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">
                    <thead className="text-xs text-[var(--eixo-text)] uppercase bg-[var(--eixo-surface-soft)] dark:bg-[var(--eixo-surface-soft)] dark:text-[var(--eixo-text-soft)]">
                        <tr>
                            <th className="px-4 py-3">Brinco</th>
                            <th className="px-4 py-3">Raça</th>
                            <th className="px-4 py-3">Idade</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">IEP</th>
                            <th className="px-4 py-3">Dias em aberto</th>
                            <th className="px-4 py-3">Prenhez</th>
                            <th className="px-4 py-3">Indicador do sistema</th>
                            <th className="px-4 py-3">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-6 text-center text-[var(--eixo-text-muted)]">
                                    Carregando seleção...
                                </td>
                            </tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-6 text-center text-[var(--eixo-text-muted)]">
                                    {onlyAlert ? 'Nenhuma matriz em alerta.' : 'Nenhuma matriz encontrada.'}
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => {
                                const traffic = trafficStyles[item.trafficLight];
                                const decision = item.decision;
                                const decisionBadge = decision ? decisionStyles[decision.decision] : null;
                                const hasReasons = item.reasons.length > 0;
                                const indicatorPrimary = hasReasons ? item.reasons[0] : 'Sem alertas';
                                const indicatorExtraCount = hasReasons ? item.reasons.length - 1 : 0;
                                const indicatorTitle = hasReasons ? item.reasons.join(' | ') : '';
                                return (
                                    <tr key={item.animal.id} className="border-b border-[var(--eixo-border)] dark:border-[var(--eixo-border)]">
                                        <td className="px-4 py-3 font-medium text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">{item.animal.brinco}</td>
                                        <td className="px-4 py-3">{item.animal.raca}</td>
                                        <td className="px-4 py-3">{calculateAge(item.animal.dataNascimento)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                {decisionBadge ? (
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${decisionBadge.badge}`}>
                                                        {decisionBadge.label.toUpperCase()}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]">
                                                        Sem decisão
                                                    </span>
                                                )}
                                                {decision?.reason && (
                                                    <span className="text-[11px] text-[var(--eixo-text-soft)]">
                                                        {decision.reason}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">{item.kpis.iepDays ?? '-'}</td>
                                        <td className="px-4 py-3">{item.kpis.openDays ?? '-'}</td>
                                        <td className="px-4 py-3">{formatRate(item.kpis.pregRate)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${traffic.badge}`}
                                                    title={indicatorTitle || undefined}
                                                >
                                                    {traffic.label.toUpperCase()}
                                                </span>
                                                <span className="text-[11px] text-[var(--eixo-text-soft)]">
                                                    {indicatorPrimary}
                                                    {indicatorExtraCount > 0 ? ` +${indicatorExtraCount}` : ''}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#efc2ba] text-[var(--eixo-danger)] hover:bg-[#fff2ef]"
                                                    onClick={() => handleDecision(item, 'DISCARD')}
                                                    aria-label="Marcar descarte"
                                                    title="Descartar"
                                                >
                                                    ✕
                                                </button>
                                                <button
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8d8b4] text-[var(--eixo-warning)] hover:bg-amber-50"
                                                    onClick={() => handleDecision(item, 'WATCH')}
                                                    aria-label="Marcar observação"
                                                    title="Observar"
                                                >
                                                    👁
                                                </button>
                                                <button
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                                    onClick={() => handleDecision(item, 'KEEP')}
                                                    aria-label="Marcar manter"
                                                    title="Manter"
                                                >
                                                    ✓
                                                </button>
                                                <button
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--eixo-border)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                                                    onClick={() => clearDecision(item.animal.id)}
                                                    aria-label="Limpar decisão"
                                                    title="Limpar"
                                                >
                                                    ↺
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {isDecisionModalOpen && decisionAnimal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-[var(--eixo-surface)] p-6 shadow-xl dark:bg-[var(--eixo-surface)]">
                        <h3 className="text-lg font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">Motivo do descarte</h3>
                        <p className="text-sm text-[var(--eixo-text-muted)] mt-1">Informe o motivo para descartar a matriz {decisionAnimal.animal.brinco}.</p>
                        <form className="mt-4 space-y-3" onSubmit={handleDiscardSubmit}>
                            <textarea
                                className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-text)] focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)] dark:text-[var(--eixo-text)]"
                                rows={3}
                                value={decisionReason}
                                onChange={(event) => setDecisionReason(event.target.value)}
                                placeholder="Ex: baixa taxa de prenhez"
                            />
                            {decisionError && (
                                <div className="text-sm text-[var(--eixo-danger)]">{decisionError}</div>
                            )}
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="rounded-lg border border-[var(--eixo-border)] px-4 py-2 text-sm text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                                    onClick={closeDecisionModal}
                                    disabled={isSavingDecision}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-[var(--eixo-danger)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--eixo-danger)] disabled:opacity-60"
                                    disabled={isSavingDecision}
                                >
                                    {isSavingDecision ? 'Salvando...' : 'Confirmar descarte'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {decisionList.length === 0 && (
                <p className="mt-6 text-xs text-[var(--eixo-text-soft)]">
                    Nenhuma decisão registrada.
                </p>
            )}
        </div>
    );
};

export default GeneticsSelecao;
