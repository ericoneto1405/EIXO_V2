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
    scope: 'all' | 'farm';
    farmId?: string | null;
    farmName?: string | null;
    farmSize?: number | null;
    farmCity?: string | null;
    farmLat?: number | null;
    farmLng?: number | null;
    onNavigateToFarms?: () => void;
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
    areaTotalHa: number | null;
}

type ReplacementRatioStatus = 'FAVORAVEL' | 'EQUILIBRADA' | 'PRESSIONADA' | 'SEM_DADOS';

interface ReplacementMarketSnapshot {
    fatCattlePricePerArroba: number | null;
    finishedAnimalWeightArrobas: number | null;
    finishedAnimalGrossValue: number | null;
    replacementAnimalType: 'BEZERRO_DESMAMA' | 'BEZERRO_12M' | 'GARROTE' | 'BOI_MAGRO' | 'NOVILHA' | null;
    replacementAnimalTypeLabel: string | null;
    replacementAnimalPrice: number | null;
    replacementAnimalWeightArrobas: number | null;
    replacementCostInFatArrobas: number | null;
    replacementAnimalsPerFinishedAnimal: number | null;
    replacementArrobaPrice: number | null;
    replacementPremiumPercent: number | null;
    replacementPremiumInFatArrobas: number | null;
    replacementRatio?: number | null;
    status: ReplacementRatioStatus;
    statusLabel: string;
    interpretation: string;
    region: string | null;
    state: string | null;
    sourceName: string | null;
    referenceDate: string | null;
    aiInsight?: {
        summary: string;
        detail: string;
        attentionPoints: string[];
        tone: 'OPORTUNIDADE' | 'NEUTRO' | 'CAUTELA' | 'SEM_DADOS';
        generatedBy: 'RULES_FALLBACK' | 'AI';
    } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 1) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtMoney = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (isoDate: string) => {
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return 'Data não informada';
    return dt.toLocaleDateString('pt-BR');
};

// Classifica taxa de ocupação
const getOccupationStatus = (taxa: number) => {
    if (taxa < 0.8) return { label: 'Leve', color: 'text-[var(--eixo-info)]', bg: 'bg-[rgba(63,111,143,0.10)]' };
    if (taxa <= 1.5) return { label: 'Adequada', color: 'text-[var(--eixo-success)]', bg: 'bg-[var(--eixo-green-soft)]' };
    return { label: 'Sobrecarregado', color: 'text-[var(--eixo-danger)]', bg: 'bg-[rgba(184,66,50,0.08)]' };
};

const getReplacementStatusUi = (status: ReplacementRatioStatus) => {
    if (status === 'FAVORAVEL') {
        return { label: 'Reposição favorável', cls: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' };
    }
    if (status === 'EQUILIBRADA') {
        return { label: 'Reposição equilibrada', cls: 'bg-[rgba(213,150,0,0.10)] text-[#8a6000]' };
    }
    if (status === 'PRESSIONADA') {
        return { label: 'Reposição pressionada', cls: 'bg-[rgba(184,66,50,0.10)] text-[var(--eixo-danger)]' };
    }
    return { label: 'Sem dados de mercado', cls: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' };
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

const Dashboard: React.FC<DashboardProps> = ({ scope, farmId, farmName, farmSize, farmCity, farmLat, farmLng, onNavigateToFarms }) => {
    const [kpis, setKpis] = useState<KpiData>({
        totalAnimais: 0, nascimentosMes: 0, categorias: [], taxaOcupacao: null,
        gmdMedio: null, entradas: null, saidas: null, saldoMes: null, animaisSemPesagem: 0, areaTotalHa: null,
    });
    const [marketReplacement, setMarketReplacement] = useState<ReplacementMarketSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (scope === 'farm' && !farmId) {
            setKpis({ totalAnimais: 0, nascimentosMes: 0, categorias: [], taxaOcupacao: null, gmdMedio: null, entradas: null, saidas: null, saldoMes: null, animaisSemPesagem: 0, areaTotalHa: null });
            return;
        }

        let active = true;
        const now = new Date();
        const mes = now.getMonth() + 1;
        const ano = now.getFullYear();

        const load = async () => {
            setLoading(true);
            try {
                const query = new URLSearchParams({
                    scope,
                    ...(scope === 'farm' && farmId ? { farmId } : {}),
                    mes: String(mes),
                    ano: String(ano),
                });
                const overviewRes = await fetch(buildApiUrl(`/overview/dashboard?${query.toString()}`), { credentials: 'include' });
                if (!overviewRes.ok) {
                    throw new Error('Falha ao carregar dados da visão geral');
                }
                const overviewData = await overviewRes.json().catch(() => ({}));

                if (!active) return;
                const payload = overviewData?.kpis || {};
                const marketPayload = overviewData?.marketReplacement || null;
                setKpis({
                    totalAnimais: Number(payload.totalAnimais || 0),
                    nascimentosMes: Number(payload.nascimentosMes || 0),
                    categorias: Array.isArray(payload.categorias) ? payload.categorias : [],
                    taxaOcupacao: payload.taxaOcupacao ?? null,
                    gmdMedio: payload.gmdMedio ?? null,
                    entradas: payload.entradas ?? null,
                    saidas: payload.saidas ?? null,
                    saldoMes: payload.saldoMes ?? null,
                    animaisSemPesagem: Number(payload.animaisSemPesagem || 0),
                    areaTotalHa: payload.areaTotalHa ?? null,
                });
                setMarketReplacement(marketPayload);
            } catch (err) {
                console.error('Dashboard load error', err);
                if (active) setLoadError('Não foi possível carregar os dados. Verifique sua conexão.');
            } finally {
                if (active) setLoading(false);
            }
        };

        load();
        return () => { active = false; };
    }, [scope, farmId, farmSize]);

    const occupationStatus = kpis.taxaOcupacao !== null ? getOccupationStatus(kpis.taxaOcupacao) : null;
    const mesLabel = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const marketSnapshot = marketReplacement;
    const marketStatusUi = marketSnapshot ? getReplacementStatusUi(marketSnapshot.status) : null;
    const marketHasData = Boolean(
        marketSnapshot
        && marketSnapshot.status !== 'SEM_DADOS'
        && marketSnapshot.fatCattlePricePerArroba !== null
        && marketSnapshot.replacementAnimalPrice !== null
        && marketSnapshot.replacementAnimalWeightArrobas !== null
        && marketSnapshot.replacementCostInFatArrobas !== null
        && marketSnapshot.replacementAnimalsPerFinishedAnimal !== null
        && marketSnapshot.replacementArrobaPrice !== null
        && marketSnapshot.replacementPremiumPercent !== null,
    );

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
                    {scope === 'all'
                        ? 'Resumo consolidado da operação.'
                        : `Resumo da Fazenda ${farmName || 'selecionada'}.`}
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
                                    {kpis.totalAnimais} animais / {kpis.areaTotalHa ?? farmSize} ha
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-extrabold text-[var(--eixo-text-soft)]">—</p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">
                                {!(kpis.areaTotalHa ?? farmSize) ? 'Área da fazenda não cadastrada' : 'Sem animais cadastrados'}
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

            </div>

            {/* Raio-X da Fazenda */}
            {!loading && (() => {
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
                            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">
                                {scope === 'all' ? 'Raio-X da Operação' : 'Raio-X da Fazenda'}
                            </p>
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
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Mercado e Reposição</p>
                        <p className="mt-1 text-sm text-[var(--eixo-text-soft)]">
                            {(marketSnapshot?.region || 'Região não informada')}
                            {marketSnapshot?.sourceName ? ` • Fonte ${marketSnapshot.sourceName}` : ''}
                            {marketSnapshot?.referenceDate ? ` • ${fmtDate(marketSnapshot.referenceDate)}` : ''}
                        </p>
                    </div>
                    {marketSnapshot && marketStatusUi && (
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${marketStatusUi.cls}`}>
                            {marketSnapshot.statusLabel || marketStatusUi.label}
                        </span>
                    )}
                </div>

                {!marketHasData ? (
                    <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">Ainda não há cotações cadastradas para calcular a relação de reposição.</p>
                        <button
                            type="button"
                            className="mt-3 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-bg)] hover:text-[var(--eixo-text)]"
                        >
                            Cadastrar cotação manual
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Arroba do boi gordo</p>
                                <p className="mt-1 text-lg font-extrabold text-[var(--eixo-text)]">{fmtMoney(marketSnapshot!.fatCattlePricePerArroba as number)}/@</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Boi de referência: {fmt(marketSnapshot!.finishedAnimalWeightArrobas as number, 0)} @</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Valor do boi: {fmtMoney(marketSnapshot!.finishedAnimalGrossValue as number)}</p>
                            </div>
                            <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">{marketSnapshot?.replacementAnimalTypeLabel || 'Reposição'}</p>
                                <p className="mt-1 text-lg font-extrabold text-[var(--eixo-text)]">{fmtMoney(marketSnapshot!.replacementAnimalPrice as number)}/cab</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Peso estimado: {fmt(marketSnapshot!.replacementAnimalWeightArrobas as number, 1)} @</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Arroba do bezerro: {fmtMoney(marketSnapshot!.replacementArrobaPrice as number)}/@</p>
                            </div>
                            <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Leitura direta</p>
                                <p className="mt-1 text-sm font-semibold text-[var(--eixo-text)]">Custo da reposição: {fmt(marketSnapshot!.replacementCostInFatArrobas as number, 1)} @ por bezerro</p>
                                <p className="mt-1 text-sm font-semibold text-[var(--eixo-text)]">Poder de compra: {fmt(marketSnapshot!.replacementAnimalsPerFinishedAnimal as number, 2)} bezerros por boi</p>
                                <p className="mt-1 text-sm font-semibold text-[var(--eixo-text)]">Ágio da reposição: {fmt(marketSnapshot!.replacementPremiumPercent as number, 1)}%</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">
                                    Ágio em arrobas: {marketSnapshot?.replacementPremiumInFatArrobas === null ? '—' : `${fmt(marketSnapshot!.replacementPremiumInFatArrobas as number, 1)} @`}
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm font-medium text-[var(--eixo-text-muted)]">{marketSnapshot!.interpretation}</p>
                        {marketSnapshot?.aiInsight && (
                            <div className="mt-3 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Leitura EIXO</p>
                                <p className="mt-1 text-sm font-semibold text-[var(--eixo-text)]">{marketSnapshot.aiInsight.summary}</p>
                                <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">{marketSnapshot.aiInsight.detail}</p>
                                {Array.isArray(marketSnapshot.aiInsight.attentionPoints) && marketSnapshot.aiInsight.attentionPoints.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-soft)]">Pontos de atenção</p>
                                        <ul className="mt-1 space-y-1">
                                            {marketSnapshot.aiInsight.attentionPoints.slice(0, 3).map((point) => (
                                                <li key={point} className="text-sm text-[var(--eixo-text-muted)]">- {point}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">
                            Referência: {marketSnapshot?.referenceDate ? fmtDate(marketSnapshot.referenceDate) : 'Data não informada'} · Fonte: {marketSnapshot?.sourceName || 'Manual / não informada'}
                        </p>
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <WeatherCard city={farmCity ?? null} lat={farmLat} lng={farmLng} onNavigateToFarms={onNavigateToFarms} />
                <CattleNewsCard />
            </div>
        </div>
    );
};

export default Dashboard;
