import React, { useEffect, useState } from 'react';
import CashFlowChart from './CashFlowChart';
import HerdCompositionChart from './HerdCompositionChart';
import { buildApiUrl } from '../api';

// ─── Icons ────────────────────────────────────────────────────────────────────

const CattleIcon: React.FC = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M4 4h3l2 4h6l2-4h3M7 8l-1 8h12l-1-8M9 16v2M15 16v2" />
    </svg>
);

const OccupationIcon: React.FC = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
);

const TrendIcon: React.FC = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M3 17l5-5 4 3 5-6 4 2" />
    </svg>
);

const MoneyIcon: React.FC = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M12 7v2m0 6v2m-2.5-8c0-1.1.9-2 2.5-2s2.5.9 2.5 2-.9 2-2.5 2-2.5.9-2.5 2 .9 2 2.5 2 2.5-.9 2.5-2" />
    </svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardProps {
    farmId?: string | null;
    farmSize?: number | null;
}

interface CategoryCount {
    name: string;
    count: number;
}

interface KpiData {
    totalAnimais: number;
    categorias: CategoryCount[];
    taxaOcupacao: number | null;   // cabeças/ha
    gmdMedio: number | null;
    entradas: number | null;
    saidas: number | null;
    saldoMes: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 1) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtMoney = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// Classifica taxa de ocupação
const getOccupationStatus = (taxa: number) => {
    if (taxa < 0.8) return { label: 'Leve', color: 'text-[var(--eixo-info)]', bg: 'bg-[rgba(63,111,143,0.10)]' };
    if (taxa <= 1.5) return { label: 'Adequada', color: 'text-[var(--eixo-success)]', bg: 'bg-[var(--eixo-green-soft)]' };
    return { label: 'Sobrecarregado', color: 'text-[var(--eixo-danger)]', bg: 'bg-[rgba(184,66,50,0.08)]' };
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
    title: string;
    icon: React.ReactNode;
    loading?: boolean;
    children: React.ReactNode;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, icon, loading, children }) => (
    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--eixo-green-soft)] text-[var(--eixo-green)]">
                {icon}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">{title}</p>
        </div>
        {loading ? (
            <div className="space-y-2">
                <div className="h-7 w-20 animate-pulse rounded-lg bg-[var(--eixo-surface-soft)]" />
                <div className="h-3 w-32 animate-pulse rounded-lg bg-[var(--eixo-surface-soft)]" />
            </div>
        ) : children}
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ farmId, farmSize }) => {
    const [kpis, setKpis] = useState<KpiData>({
        totalAnimais: 0, categorias: [], taxaOcupacao: null,
        gmdMedio: null, entradas: null, saidas: null, saldoMes: null,
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!farmId) {
            setKpis({ totalAnimais: 0, categorias: [], taxaOcupacao: null, gmdMedio: null, entradas: null, saidas: null, saldoMes: null });
            return;
        }

        let active = true;
        const now = new Date();
        const mes = now.getMonth() + 1;
        const ano = now.getFullYear();

        const load = async () => {
            setLoading(true);
            try {
                const [animalsRes, weighingsRes, transactionsRes] = await Promise.allSettled([
                    fetch(buildApiUrl(`/animals?farmId=${farmId}`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/farms/${farmId}/weighings?limit=200`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/financial/transactions?farmId=${farmId}&mes=${mes}&ano=${ano}`), { credentials: 'include' }),
                ]);

                if (!active) return;

                // ── Animals ──────────────────────────────────────────────────
                let animals: Array<{ id: string; pesoAtual: number; categoria?: string }> = [];
                if (animalsRes.status === 'fulfilled' && animalsRes.value.ok) {
                    const data = await animalsRes.value.json().catch(() => ({}));
                    animals = Array.isArray(data?.animals) ? data.animals : [];
                }

                const totalAnimais = animals.length;

                // Breakdown por categoria (top 4)
                const catMap = new Map<string, number>();
                for (const a of animals) {
                    const cat = a.categoria || 'Sem categoria';
                    catMap.set(cat, (catMap.get(cat) || 0) + 1);
                }
                const categorias: CategoryCount[] = Array.from(catMap.entries())
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 4);

                // Taxa de ocupação
                const taxaOcupacao = (farmSize && farmSize > 0 && totalAnimais > 0)
                    ? totalAnimais / farmSize
                    : null;

                // ── Weighings ────────────────────────────────────────────────
                let weighings: Array<{ animalId?: string; animal?: { id: string }; gmd: number | null; date: string }> = [];
                if (weighingsRes.status === 'fulfilled' && weighingsRes.value.ok) {
                    const data = await weighingsRes.value.json().catch(() => ({}));
                    weighings = Array.isArray(data?.weighings) ? data.weighings : [];
                }

                // Last weighing per animal → GMD médio
                const lastByAnimal = new Map<string, { gmd: number | null; date: string }>();
                for (const w of weighings) {
                    const aid = w.animalId ?? w.animal?.id;
                    if (!aid) continue;
                    const existing = lastByAnimal.get(aid);
                    if (!existing || new Date(w.date) > new Date(existing.date)) {
                        lastByAnimal.set(aid, { gmd: w.gmd, date: w.date });
                    }
                }
                const validGmds = Array.from(lastByAnimal.values())
                    .map(w => w.gmd)
                    .filter((g): g is number => g !== null && g > 0);
                const gmdMedio = validGmds.length
                    ? validGmds.reduce((s, g) => s + g, 0) / validGmds.length
                    : null;

                // ── Financial (current month) ─────────────────────────────────
                let entradas: number | null = null;
                let saidas: number | null = null;
                let saldoMes: number | null = null;
                if (transactionsRes.status === 'fulfilled' && transactionsRes.value.ok) {
                    const data = await transactionsRes.value.json().catch(() => ({}));
                    const txs: Array<{ type: string; valor: number; status: string }> = data?.transactions ?? [];
                    const paid = txs.filter(t => t.status !== 'CANCELADO');
                    entradas = paid.filter(t => t.type === 'ENTRADA').reduce((s, t) => s + (t.valor ?? 0), 0);
                    saidas = paid.filter(t => t.type === 'SAIDA' || t.type === 'SAÍDA').reduce((s, t) => s + (t.valor ?? 0), 0);
                    saldoMes = entradas - saidas;
                }

                setKpis({ totalAnimais, categorias, taxaOcupacao, gmdMedio, entradas, saidas, saldoMes });
            } catch (err) {
                console.error('Dashboard load error', err);
            } finally {
                if (active) setLoading(false);
            }
        };

        load();
        return () => { active = false; };
    }, [farmId, farmSize]);

    const occupationStatus = kpis.taxaOcupacao !== null ? getOccupationStatus(kpis.taxaOcupacao) : null;
    const mesLabel = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    return (
        <div className="space-y-6">

            {/* Cabeçalho */}
            <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite-dark)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                    Visão Geral
                </div>
                <h1 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Dashboard</h1>
                <p className="mt-1 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                    Resumo do rebanho, ocupação e desempenho financeiro da operação.
                </p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

                {/* 1. Total de Animais */}
                <KpiCard title="Total de Animais" icon={<CattleIcon />} loading={loading}>
                    <p className="text-2xl font-extrabold text-[var(--eixo-text)]">{kpis.totalAnimais}</p>
                    {kpis.categorias.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {kpis.categorias.map(cat => (
                                <div key={cat.name} className="flex items-center justify-between gap-2">
                                    <span className="truncate text-xs text-[var(--eixo-text-muted)]">{cat.name}</span>
                                    <span className="shrink-0 text-xs font-semibold text-[var(--eixo-text)]">{cat.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {kpis.categorias.length === 0 && (
                        <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Sem animais cadastrados</p>
                    )}
                </KpiCard>

                {/* 2. Taxa de Ocupação */}
                <KpiCard title="Taxa de Ocupação" icon={<OccupationIcon />} loading={loading}>
                    {kpis.taxaOcupacao !== null ? (
                        <>
                            <p className="text-2xl font-extrabold text-[var(--eixo-text)]">
                                {fmt(kpis.taxaOcupacao, 2)} <span className="text-sm font-semibold text-[var(--eixo-text-muted)]">cab/ha</span>
                            </p>
                            <div className="mt-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${occupationStatus!.bg} ${occupationStatus!.color}`}>
                                    {occupationStatus!.label}
                                </span>
                                <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">
                                    {kpis.totalAnimais} animais / {farmSize} ha
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-extrabold text-[var(--eixo-text-soft)]">—</p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">
                                {!farmSize ? 'Tamanho da fazenda não cadastrado' : 'Sem animais cadastrados'}
                            </p>
                        </>
                    )}
                </KpiCard>

                {/* 3. GMD Médio */}
                <KpiCard title="GMD Médio" icon={<TrendIcon />} loading={loading}>
                    {kpis.gmdMedio !== null ? (
                        <>
                            <p className="text-2xl font-extrabold text-[var(--eixo-text)]">
                                {fmt(kpis.gmdMedio)} <span className="text-sm font-semibold text-[var(--eixo-text-muted)]">kg/dia</span>
                            </p>
                            <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${kpis.gmdMedio > 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                <span>{kpis.gmdMedio > 0 ? '↑' : '↓'}</span>
                                <span>Ganho médio diário</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-extrabold text-[var(--eixo-text-soft)]">—</p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Sem pesagens registradas</p>
                        </>
                    )}
                </KpiCard>

                {/* 4. Fluxo de Caixa */}
                <KpiCard title="Fluxo de Caixa" icon={<MoneyIcon />} loading={loading}>
                    {kpis.saldoMes !== null ? (
                        <>
                            <p className={`text-2xl font-extrabold ${kpis.saldoMes >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                {fmtMoney(kpis.saldoMes)}
                            </p>
                            <div className="mt-2 space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-[var(--eixo-text-muted)]">↑ Entradas</span>
                                    <span className="font-semibold text-[var(--eixo-success)]">{fmtMoney(kpis.entradas ?? 0)}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-[var(--eixo-text-muted)]">↓ Saídas</span>
                                    <span className="font-semibold text-[var(--eixo-danger)]">{fmtMoney(kpis.saidas ?? 0)}</span>
                                </div>
                            </div>
                            <p className="mt-1.5 text-[10px] text-[var(--eixo-text-soft)] capitalize">{mesLabel}</p>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-extrabold text-[var(--eixo-text-soft)]">—</p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Acesse o Financeiro para lançamentos</p>
                        </>
                    )}
                </KpiCard>

            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <CashFlowChart farmId={farmId} />
                <HerdCompositionChart farmId={farmId} />
            </div>
        </div>
    );
};

export default Dashboard;
