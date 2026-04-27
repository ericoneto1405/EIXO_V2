import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../api';

type ReproMode = 'CONTINUO' | 'ESTACAO';
type TrafficLight = 'GREEN' | 'YELLOW' | 'RED';
type DecisionType = 'KEEP' | 'WATCH' | 'DISCARD';

interface BreedingSeason {
    id: string;
    name: string;
    startAt: string;
    endAt: string;
}

interface SummaryPayload {
    summary: {
        pregRate: number | null;
        openDaysAvg: number | null;
        openDaysOver180Pct: number | null;
        iepAvg: number | null;
        openDaysCount?: number;
        iepCount?: number;
        totals: {
            females: number;
            withKpis: number;
            exposures?: number;
            pregnant?: number;
            empty?: number;
            diagCount?: number;
        };
    };
    topAlerts: Array<{
        animal: { id: string; brinco: string; raca: string };
        kpis: {
            iepDays: number | null;
            openDays: number | null;
            pregRate: number | null;
            emptyAlerts: { isEmpty: boolean; isRepeatEmpty: boolean };
            lastCalvingDate: string | null;
            lastPregCheck: string | null;
        };
        trafficLight: TrafficLight;
        reasons: string[];
        decision: { decision: DecisionType; reason?: string | null; updatedAt?: string } | null;
    }>;
    decisions: Array<{
        animal: { id: string; brinco: string; raca: string };
        decision: { decision: DecisionType; reason?: string | null; updatedAt: string };
    }>;
}

interface GeneticsRelatoriosProps {
    farmId?: string | null;
}

const trafficStyles: Record<TrafficLight, { badge: string; label: string }> = {
    GREEN: { badge: 'bg-emerald-100 text-emerald-700', label: 'Verde' },
    YELLOW: { badge: 'bg-amber-100 text-amber-700', label: 'Amarelo' },
    RED: { badge: 'bg-rose-100 text-rose-700', label: 'Vermelho' },
};

const decisionStyles: Record<DecisionType, { badge: string; label: string }> = {
    DISCARD: { badge: 'bg-rose-100 text-rose-700', label: 'Descarte' },
    WATCH: { badge: 'bg-amber-100 text-amber-700', label: 'Observar' },
    KEEP: { badge: 'bg-emerald-100 text-emerald-700', label: 'Manter' },
};

const formatRate = (value: number | null) => {
    if (value === null || Number.isNaN(value)) {
        return '-';
    }
    return `${(value * 100).toFixed(1)}%`;
};

const formatNumber = (value: number | null) => {
    if (value === null || Number.isNaN(value)) {
        return '-';
    }
    return Math.round(value).toString();
};

const GeneticsRelatorios: React.FC<GeneticsRelatoriosProps> = ({ farmId }) => {
    const [reproMode, setReproMode] = useState<ReproMode>('CONTINUO');
    const [seasons, setSeasons] = useState<BreedingSeason[]>([]);
    const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
    const [data, setData] = useState<SummaryPayload | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

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

    const loadSummary = useCallback(async () => {
        if (!farmId) {
            setData(null);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams({ farmId });
            if (reproMode === 'ESTACAO' && selectedSeasonId) {
                params.set('seasonId', selectedSeasonId);
            }
            const response = await fetch(buildApiUrl(`/genetics/reports/summary?${params.toString()}`), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setData(null);
                setLoadError(payload?.message || 'Erro ao carregar relatório.');
                return;
            }
            setData(payload);
        } catch (error) {
            console.error(error);
            setData(null);
            setLoadError('Não foi possível carregar relatório.');
        } finally {
            setIsLoading(false);
        }
    }, [farmId, reproMode, selectedSeasonId]);

    useEffect(() => {
        loadFarmMode();
    }, [loadFarmMode]);

    useEffect(() => {
        loadSeasons();
    }, [loadSeasons]);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);

    const summary = data?.summary;
    const topAlerts = data?.topAlerts || [];
    const decisions = data?.decisions || [];

    const totalsLine = useMemo(() => {
        if (!summary) {
            return null;
        }
        const parts = [`${summary.totals.females} matrizes`, `${summary.totals.withKpis} com KPIs`];
        if (typeof summary.totals.exposures === 'number') {
            parts.push(`${summary.totals.exposures} expostas`);
        }
        if (typeof summary.totals.diagCount === 'number') {
            parts.push(`${summary.totals.diagCount} diagnósticos`);
        }
        return parts.join(' · ');
    }, [summary]);

    return (
        <div className="bg-white dark:bg-dark-card rounded-xl shadow-lg p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Relatórios</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Resumo reprodutivo e decisões de seleção.</p>
                </div>
                <div className="flex items-center gap-2">
                    {reproMode === 'ESTACAO' && (
                        <select
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#1c1917] focus:ring-[#1c1917]/10 dark:border-gray-700 dark:bg-dark-card dark:text-white"
                            value={selectedSeasonId || ''}
                            onChange={(event) => setSelectedSeasonId(event.target.value || null)}
                        >
                            <option value="">Selecione estação</option>
                            {seasons.map((season) => (
                                <option key={season.id} value={season.id}>
                                    {season.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                        onClick={loadSummary}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Atualizando...' : 'Atualizar'}
                    </button>
                </div>
            </div>

            {totalsLine && (
                <p className="mt-4 text-xs text-gray-400">{totalsLine}</p>
            )}

            {loadError && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                    {loadError}
                </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-gray-100 p-4 shadow-sm dark:border-gray-700">
                    <p className="text-xs text-gray-500">Taxa de prenhez</p>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">{summary ? formatRate(summary.pregRate) : '-'}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-4 shadow-sm dark:border-gray-700">
                    <p className="text-xs text-gray-500">
                        Média dias em aberto{summary?.openDaysCount ? ` (n=${summary.openDaysCount})` : ''}
                    </p>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">{summary ? formatNumber(summary.openDaysAvg) : '-'}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-4 shadow-sm dark:border-gray-700">
                    <p className="text-xs text-gray-500">% acima de 180 dias</p>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">{summary ? formatRate(summary.openDaysOver180Pct) : '-'}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-4 shadow-sm dark:border-gray-700">
                    <p className="text-xs text-gray-500">
                        Média IEP (dias){summary?.iepCount ? ` (n=${summary.iepCount})` : ''}
                    </p>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">{summary ? formatNumber(summary.iepAvg) : '-'}</p>
                </div>
            </div>

            {reproMode === 'ESTACAO' && selectedSeasonId && summary && (
                <div className="mt-6 rounded-xl border border-gray-100 p-4 shadow-sm dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Estação selecionada</h3>
                    {summary.totals.exposures && summary.totals.exposures > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <p className="text-xs text-gray-500">Expostas</p>
                                <p className="text-xl font-semibold text-gray-900 dark:text-white">{summary.totals.exposures}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Prenhes</p>
                                <p className="text-xl font-semibold text-gray-900 dark:text-white">{summary.totals.pregnant ?? 0}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Vazias</p>
                                <p className="text-xl font-semibold text-gray-900 dark:text-white">{summary.totals.empty ?? 0}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Taxa</p>
                                <p className="text-xl font-semibold text-gray-900 dark:text-white">{formatRate(summary.pregRate)}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">Sem expostas na estação.</p>
                    )}
                </div>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Top alertas</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                <tr>
                                    <th className="px-4 py-2">Brinco</th>
                                    <th className="px-4 py-2">Raça</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">Dias em aberto</th>
                                    <th className="px-4 py-2">Motivos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topAlerts.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-4 text-center text-gray-400">
                                            Nenhum alerta crítico.
                                        </td>
                                    </tr>
                                ) : (
                                    topAlerts.map((item) => {
                                        const traffic = trafficStyles[item.trafficLight];
                                        const decision = item.decision;
                                        const decisionBadge = decision ? decisionStyles[decision.decision] : null;
                                        const hasReasons = item.reasons.length > 0;
                                        const alertPrimary = hasReasons ? item.reasons[0] : 'Sem alertas';
                                        const alertExtraCount = hasReasons ? item.reasons.length - 1 : 0;
                                        const alertTitle = hasReasons ? item.reasons.join(' | ') : '';
                                        return (
                                            <tr key={item.animal.id} className="border-b border-gray-100 dark:border-gray-700">
                                                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{item.animal.brinco}</td>
                                                <td className="px-4 py-2">{item.animal.raca}</td>
                                                <td className="px-4 py-2">
                                                    {decisionBadge ? (
                                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${decisionBadge.badge}`}>
                                                            {decisionBadge.label}
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${traffic.badge}`}>
                                                            {traffic.label}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">{item.kpis.openDays ?? '-'}</td>
                                                <td className="px-4 py-2">
                                                    <span
                                                        className="text-[11px] text-gray-400"
                                                        title={alertTitle || undefined}
                                                    >
                                                        {alertPrimary}{alertExtraCount > 0 ? ` +${alertExtraCount}` : ''}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Decisões recentes</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                <tr>
                                    <th className="px-4 py-2">Brinco</th>
                                    <th className="px-4 py-2">Decisão</th>
                                    <th className="px-4 py-2">Motivo</th>
                                    <th className="px-4 py-2">Atualizado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {decisions.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-4 text-center text-gray-400">
                                            Nenhuma decisão registrada.
                                        </td>
                                    </tr>
                                ) : (
                                    decisions.map((item) => {
                                        const decisionBadge = decisionStyles[item.decision.decision];
                                        return (
                                            <tr key={item.animal.id} className="border-b border-gray-100 dark:border-gray-700">
                                                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{item.animal.brinco}</td>
                                                <td className="px-4 py-2">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${decisionBadge.badge}`}>
                                                        {decisionBadge.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2">{item.decision.reason || '-'}</td>
                                                <td className="px-4 py-2">{new Date(item.decision.updatedAt).toLocaleDateString()}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GeneticsRelatorios;
