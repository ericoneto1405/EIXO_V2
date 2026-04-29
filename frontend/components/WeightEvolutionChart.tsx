import React, { useEffect, useState } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { listWeighings } from '../adapters/herdApi';
import type { HerdType } from '../adapters/herdApi';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ChartPoint {
    dateLabel: string;  // formatado pt-BR para exibição
    dateISO: string;    // ISO para ordenação
    peso: number;
    gmd: number | null;
}

interface Props {
    animalId: string;
    animalLabel: string;
    herdType: HerdType;
}

// ─── Tooltip personalizado ────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d: ChartPoint = payload[0].payload;
    return (
        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 shadow-sm">
            <p className="mb-1 text-xs font-semibold text-[var(--eixo-text-muted)]">{d.dateLabel}</p>
            <p className="text-sm font-bold text-[var(--eixo-text)]">{d.peso.toFixed(1)} kg</p>
            <p className="text-xs text-[var(--eixo-text-muted)]">
                GMD:{' '}
                {d.gmd != null ? (
                    <span className={d.gmd >= 0 ? 'text-green-700' : 'text-red-600'}>
                        {d.gmd >= 0 ? '+' : ''}{d.gmd.toFixed(2)} kg/dia
                    </span>
                ) : (
                    '—'
                )}
            </p>
        </div>
    );
};

// ─── Componente ───────────────────────────────────────────────────────────────

const WeightEvolutionChart: React.FC<Props> = ({ animalId, animalLabel, herdType }) => {
    const [points, setPoints] = useState<ChartPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!animalId) return;
        setLoading(true);
        setError(null);

        listWeighings(animalId, herdType)
            .then(weighings => {
                const sorted = [...weighings].sort(
                    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
                );
                setPoints(
                    sorted.map(w => ({
                        dateISO: w.data,
                        dateLabel: new Date(w.data).toLocaleDateString('pt-BR'),
                        peso: w.peso,
                        gmd: w.gmd ?? null,
                    })),
                );
            })
            .catch(err => setError(err?.message ?? 'Erro ao carregar pesagens.'))
            .finally(() => setLoading(false));
    }, [animalId, herdType]);

    return (
        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6">
            <p className="mb-4 text-base font-semibold text-[var(--eixo-text)]">
                Evolução de Peso
                {animalLabel && (
                    <span className="ml-2 text-sm font-normal text-[var(--eixo-text-muted)]">— {animalLabel}</span>
                )}
            </p>

            {loading && (
                <div className="flex h-[260px] items-center justify-center text-sm text-[#a8a29e]">
                    Carregando…
                </div>
            )}

            {!loading && error && (
                <div className="flex h-[260px] items-center justify-center text-sm text-red-600">
                    {error}
                </div>
            )}

            {!loading && !error && points.length < 2 && (
                <div className="flex h-[260px] items-center justify-center text-sm text-[#a8a29e]">
                    Registre ao menos 2 pesagens para ver a evolução.
                </div>
            )}

            {!loading && !error && points.length >= 2 && (
                <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid stroke="var(--eixo-border)" strokeDasharray="4 4" vertical={false} />
                        <XAxis
                            dataKey="dateLabel"
                            tick={{ fontSize: 11, fill: '#a8a29e' }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: '#a8a29e' }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={v => `${v} kg`}
                            width={64}
                            domain={['auto', 'auto']}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line
                            type="monotone"
                            dataKey="peso"
                            stroke="var(--eixo-green)"
                            strokeWidth={2}
                            dot={{ r: 4, fill: 'var(--eixo-green)', strokeWidth: 0 }}
                            activeDot={{ r: 6, fill: 'var(--eixo-green)', strokeWidth: 0 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    );
};

export default WeightEvolutionChart;
