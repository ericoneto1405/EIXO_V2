import React, { useEffect, useState } from 'react';
import WeatherCard from './WeatherCard';
import CattleNewsCard from './CattleNewsCard';
import { buildApiUrl } from '../api';

// ─── Icons ────────────────────────────────────────────────────────────────────

const CattleIcon: React.FC = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M4 4h3l2 4h6l2-4h3M7 8l-1 8h12l-1-8M9 16v2M15 16v2" />
    </svg>
);

const CalfIcon: React.FC = () => (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M6 8.5 8.2 6H11l1.4 1.6h2.2L17 6.4 18.6 8 18 11.2l.8 3.8H16.6l-.8-2.4H8.5L7.6 15H5.4l.8-3.8L6 8.5Zm4.2 1.2h.01M14 9.7h.01M9.4 15v1.8M14.6 15v1.8"
        />
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
    farmCity?: string | null;
    farmLat?: number | null;
    farmLng?: number | null;
}

interface CategoryCount {
    name: string;
    count: number;
}

interface KpiData {
    totalAnimais: number;
    nascimentosMes: number;
    categorias: CategoryCount[];
    taxaOcupacao: number | null;   // cabeças/ha
    gmdMedio: number | null;
    entradas: number | null;
    saidas: number | null;
    saldoMes: number | null;
    animaisSemPesagem: number;     // animais sem pesagem nos últimos 30 dias
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
    <div className="flex min-h-[120px] flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
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

const Dashboard: React.FC<DashboardProps> = ({ farmId, farmSize, farmCity, farmLat, farmLng }) => {
    const [kpis, setKpis] = useState<KpiData>({
        totalAnimais: 0, nascimentosMes: 0, categorias: [], taxaOcupacao: null,
        gmdMedio: null, entradas: null, saidas: null, saldoMes: null, animaisSemPesagem: 0,
    });
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!farmId) {
            setKpis({ totalAnimais: 0, nascimentosMes: 0, categorias: [], taxaOcupacao: null, gmdMedio: null, entradas: null, saidas: null, saldoMes: null, animaisSemPesagem: 0 });
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
                let animals: Array<{ id: string; pesoAtual: number; categoria?: string; dataNascimento?: string | null }> = [];
                if (animalsRes.status === 'fulfilled' && animalsRes.value.ok) {
                    const data = await animalsRes.value.json().catch(() => ({}));
                    animals = Array.isArray(data?.animals) ? data.animals : [];
                }

                const totalAnimais = animals.length;
                const nascimentosMes = animals.filter((animal) => {
                    if (!animal.dataNascimento) return false;
                    const birthDate = new Date(animal.dataNascimento);
                    if (Number.isNaN(birthDate.getTime())) return false;
                    return birthDate.getMonth() + 1 === mes && birthDate.getFullYear() === ano;
                }).length;

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
                // Animais sem pesagem nos últimos 30 dias
                const cutoff30 = new Date();
                cutoff30.setDate(cutoff30.getDate() - 30);
                const animaisSemPesagem = animals.filter(a => {
                    const last = lastByAnimal.get(a.id);
                    if (!last) return true; // nunca pesado
                    return new Date(last.date) < cutoff30;
                }).length;

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

                setKpis({ totalAnimais, nascimentosMes, categorias, taxaOcupacao, gmdMedio, entradas, saidas, saldoMes, animaisSemPesagem });
            } catch (err) {
                console.error('Dashboard load error', err);
                if (active) setLoadError('Não foi possível carregar os dados. Verifique sua conexão.');
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

            {/* Erro de carregamento */}
            {loadError && (
                <div className="rounded-2xl border border-[#fca5a5] bg-[#fef2f2] px-5 py-4 text-sm text-[#8c2020]">
                    {loadError}
                </div>
            )}

            {/* Cabeçalho */}
            <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                    Visão Geral
                </div>
                <h1 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Dashboard</h1>
                <p className="mt-1 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                    Resumo do rebanho, ocupação e desempenho financeiro da operação.
                </p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">

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

                {/* 2. Nascimentos no mês */}
                <KpiCard title="Nascimentos no mês" icon={<CalfIcon />} loading={loading}>
                    <p className="text-2xl font-extrabold text-[var(--eixo-text)]">{kpis.nascimentosMes}</p>
                    <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">No mês atual</p>
                </KpiCard>

                {/* 3. Taxa de Ocupação */}
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

                {/* 4. GMD Médio */}
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

                {/* 5. Fluxo de Caixa */}
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

            {/* Raio-X da Fazenda */}
            {!loading && farmId && (() => {
                const alertas: { tipo: 'aviso' | 'atencao' | 'ok'; texto: string }[] = [];

                if (kpis.taxaOcupacao !== null && kpis.taxaOcupacao > 1.5) {
                    alertas.push({ tipo: 'aviso', texto: `Taxa de ocupação sobrecarregada — ${fmt(kpis.taxaOcupacao, 2)} cab/ha` });
                }
                if (kpis.gmdMedio !== null && kpis.gmdMedio < 0.5) {
                    alertas.push({ tipo: 'aviso', texto: `GMD médio baixo — ${fmt(kpis.gmdMedio)} kg/dia (abaixo de 0,5 kg/dia)` });
                }
                if (kpis.totalAnimais > 0 && kpis.gmdMedio === null) {
                    alertas.push({ tipo: 'atencao', texto: 'Nenhuma pesagem registrada — cadastre pesagens para acompanhar o GMD' });
                }
                if (kpis.animaisSemPesagem > 0) {
                    alertas.push({ tipo: 'atencao', texto: `${kpis.animaisSemPesagem} ${kpis.animaisSemPesagem === 1 ? 'animal sem pesagem' : 'animais sem pesagem'} nos últimos 30 dias` });
                }

                const tudo_ok = alertas.length === 0 && kpis.totalAnimais > 0;

                return (
                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <svg className="h-4 w-4 text-[var(--eixo-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Raio-X da Fazenda</p>
                        </div>

                        {tudo_ok && (
                            <div className="flex items-center gap-3 rounded-xl bg-[var(--eixo-green-soft)] px-4 py-3">
                                <span className="text-lg">✅</span>
                                <p className="text-sm font-semibold text-[var(--eixo-graphite)]">Tudo em ordem — nenhum alerta no momento.</p>
                            </div>
                        )}

                        {!tudo_ok && kpis.totalAnimais === 0 && (
                            <div className="flex items-center gap-3 rounded-xl bg-[var(--eixo-surface-soft)] px-4 py-3">
                                <span className="text-lg">ℹ️</span>
                                <p className="text-sm text-[var(--eixo-text-muted)]">Cadastre animais para ver o diagnóstico da fazenda.</p>
                            </div>
                        )}

                        {alertas.length > 0 && (
                            <div className="space-y-2">
                                {alertas.map((a, i) => (
                                    <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3 ${a.tipo === 'aviso' ? 'bg-[rgba(184,66,50,0.07)]' : 'bg-[rgba(213,150,0,0.07)]'}`}>
                                        <span className="mt-0.5 text-base">{a.tipo === 'aviso' ? '⚠️' : '📋'}</span>
                                        <p className={`text-sm font-medium ${a.tipo === 'aviso' ? 'text-[var(--eixo-danger)]' : 'text-[#8a6000]'}`}>{a.texto}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Clima + Notícias */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <WeatherCard city={farmCity ?? null} lat={farmLat} lng={farmLng} />
                <CattleNewsCard />
            </div>
        </div>
    );
};

export default Dashboard;
