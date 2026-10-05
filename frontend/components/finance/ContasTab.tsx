import React, { useEffect, useMemo, useState } from 'react';
import { FinancialTransaction } from '../../adapters/financialApi';
import { CalendarCheckIcon, CheckIcon, ClockIcon, LockIcon, WalletIcon, formatCurrency, formatDate, getCatLabel, isVencida, statusBadge, normalizeSearchText } from '../financeUtils';
import KpiCard from '../KpiCard';

type ContaFilter = 'todos' | 'pendente' | 'vencido' | 'pago' | 'sem_vencimento';

interface ContasTabProps {
    tipo: 'pagar' | 'receber';
    pendingAll: FinancialTransaction[];
    pendingLoading: boolean;
    loadError: string | null;
    onRetry: () => void;
    initialSearch?: string;
    initialPeriod?: { from: string; to: string };
    onMarkPaid: (transaction: FinancialTransaction) => void;
    onEdit: (t: FinancialTransaction) => void;
    onDelete: (t: FinancialTransaction) => void;
}

const FilterPill: React.FC<{
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ active, onClick, children }) => (
    <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-(--eixo-green) text-[#1a1a1a]' : 'bg-(--eixo-surface-soft) text-(--eixo-text-muted) hover:bg-(--eixo-surface-soft)'}`}
    >
        {children}
    </button>
);

const applyFilter = (list: FinancialTransaction[], filter: ContaFilter) => {
    if (filter === 'vencido') return list.filter(isVencida);
    if (filter === 'pendente') return list.filter(t => t.status === 'PENDENTE' && !!t.vencimento && !isVencida(t));
    if (filter === 'sem_vencimento') return list.filter(t => t.status === 'PENDENTE' && !t.vencimento);
    if (filter === 'pago') return list.filter(t => t.status === 'PAGO');
    return list;
};

const ContasTab: React.FC<ContasTabProps> = ({ tipo, pendingAll, pendingLoading, loadError, onRetry, initialSearch = '', initialPeriod, onMarkPaid, onEdit, onDelete }) => {
    const [filter, setFilter] = useState<ContaFilter>('todos');
    const [search, setSearch] = useState(initialSearch);
    const [sort, setSort] = useState('vencimento');
    useEffect(() => setSearch(initialSearch), [initialSearch]);

    const lista = useMemo(
        () => pendingAll.filter(t => t.type === (tipo === 'pagar' ? 'SAIDA' : 'ENTRADA')),
        [pendingAll, tipo],
    );

    // Filtro de período por Date Picker (De/Até). Usa o vencimento como
    // referência (é a data que importa pra contas a pagar/receber) e cai pra
    // data de competência quando não tem vencimento cadastrado.
    const [filtroDe, setFiltroDe] = useState(initialPeriod?.from || '');
    const [filtroAte, setFiltroAte] = useState(initialPeriod?.to || '');
    useEffect(() => { setFiltroDe(initialPeriod?.from || ''); setFiltroAte(initialPeriod?.to || ''); }, [initialPeriod?.from, initialPeriod?.to]);

    const noPeriodo = useMemo(() => {
        if (!filtroDe && !filtroAte) return lista;
        return lista.filter(t => {
            const ref = initialPeriod ? t.data : t.vencimento || t.data;
            if (!ref) return false;
            const day = ref.slice(0, 10);
            if (filtroDe && day < filtroDe) return false;
            if (filtroAte && day > filtroAte) return false;
            return true;
        });
    }, [lista, filtroDe, filtroAte, initialPeriod]);

    const abertasNoPeriodo = useMemo(() => noPeriodo.filter(t => t.status === 'PENDENTE'), [noPeriodo]);

    const filtrada = applyFilter(noPeriodo, filter).filter((transaction) =>
        normalizeSearchText([transaction.descricao, getCatLabel(transaction), transaction.accountCategoryGroup].filter(Boolean).join(' ')).includes(normalizeSearchText(search.trim())),
    );
    const invalidPeriod = !!filtroDe && !!filtroAte && filtroDe > filtroAte;
    const semVencimento = abertasNoPeriodo.filter((transaction) => !transaction.vencimento);
    // Os cards seguem o período escolhido: mudam junto com o filtro de mês/ano.
    const totalPendente = abertasNoPeriodo.reduce((s, t) => s + t.valor, 0);
    const totalVencido = abertasNoPeriodo.filter(isVencida).reduce((s, t) => s + t.valor, 0);
    const totalAVencer = abertasNoPeriodo.filter(t => !!t.vencimento && !isVencida(t)).reduce((s, t) => s + t.valor, 0);
    const totalPago = noPeriodo.filter(t => t.status === 'PAGO').reduce((s, t) => s + t.valor, 0);
    const corTotal = tipo === 'pagar' ? 'text-(--eixo-danger)' : 'text-(--eixo-success)';

    if (pendingLoading) return <p role="status" className="py-10 text-center text-sm text-(--eixo-text-muted)">Carregando contas...</p>;
    if (loadError) return <div role="alert" className="rounded-xl border border-(--eixo-border) p-4 text-sm text-(--eixo-danger)">{loadError} <button type="button" onClick={onRetry} className="underline">Tentar novamente</button></div>;

    return (
        <>
            <p className="text-sm text-(--eixo-text-muted)">{filtroDe || filtroAte ? `Período: ${formatDate(filtroDe)} a ${formatDate(filtroAte)}` : 'Todo o histórico'} · {initialPeriod ? 'Período pela competência, vindo da Visão Geral.' : 'Período pelo vencimento; quando ausente, pela competência.'} Os totais seguem o período, independentemente da busca e do status selecionado. Pagos/recebidos não representam o caixa por data de liquidação.</p>
            {invalidPeriod && <p role="alert" className="text-sm text-(--eixo-danger)">A data inicial deve ser anterior ou igual à final.</p>}
            {semVencimento.length > 0 && <div className="rounded-xl border border-(--eixo-border) p-3 text-sm"><button type="button" onClick={() => setFilter('sem_vencimento')} className="font-semibold underline">{semVencimento.length} conta(s) sem vencimento · {formatCurrency(semVencimento.reduce((sum, item) => sum + item.valor, 0))}</button><p className="text-(--eixo-text-muted)">Não entram no caixa projetado. Edite as contas manuais para informar o vencimento.</p></div>}
            {/* Cards de resumo */}
            {!invalidPeriod && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard title={`Total ${tipo === 'pagar' ? 'a pagar' : 'a receber'}`} icon={<WalletIcon />}>
                    <p className={`font-brand text-2xl font-extrabold ${corTotal}`}>{formatCurrency(totalPendente)}</p>
                </KpiCard>
                <KpiCard title="Vencidos" icon={<ClockIcon />} tone="danger">
                    <p className="font-brand text-2xl font-extrabold text-(--eixo-danger)">{formatCurrency(totalVencido)}</p>
                </KpiCard>
                <KpiCard title="A vencer" icon={<CalendarCheckIcon />} tone="success">
                    <p className="font-brand text-2xl font-extrabold text-(--eixo-graphite)">{formatCurrency(totalAVencer)}</p>
                </KpiCard>
                <KpiCard title={tipo === 'pagar' ? 'Total pago' : 'Total recebido'} icon={<CheckIcon />}>
                    <p className="font-brand text-2xl font-extrabold text-(--eixo-text)">{formatCurrency(totalPago)}</p>
                </KpiCard>
            </div>}

            {/* Período */}
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-(--eixo-text-muted)">
                    De
                    <input type="date" max={filtroAte || undefined} value={filtroDe} onChange={e => setFiltroDe(e.target.value)}
                        className="rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm text-(--eixo-text) focus:border-(--eixo-green) focus:outline-hidden" />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-(--eixo-text-muted)">
                    Até
                    <input type="date" min={filtroDe || undefined} value={filtroAte} onChange={e => setFiltroAte(e.target.value)}
                        className="rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm text-(--eixo-text) focus:border-(--eixo-green) focus:outline-hidden" />
                </label>
                {(filtroDe !== '' || filtroAte !== '') && (
                    <button type="button" onClick={() => { setFiltroDe(''); setFiltroAte(''); }}
                        className="text-xs font-semibold text-(--eixo-text-muted) underline hover:text-(--eixo-text)">
                        Limpar período
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-3"><label className="flex-1 text-sm" htmlFor="accounts-search">Buscar contas<input id="accounts-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Descrição, categoria ou grupo" className="mt-1 w-full rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2" /></label><label className="text-sm" htmlFor="accounts-sort">Ordenar por<select id="accounts-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="mt-1 block rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2"><option value="vencimento">Vencimento mais próximo</option><option value="valor">Maior valor</option><option value="categoria">Categoria</option></select></label></div>
            <p role="status" className="text-xs text-(--eixo-text-muted)">{filtrada.length} conta(s) encontrada(s).</p>
            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
                <FilterPill active={filter === 'todos'} onClick={() => setFilter('todos')}>Todos ({noPeriodo.length})</FilterPill>
                <FilterPill active={filter === 'pendente'} onClick={() => setFilter('pendente')}>
                    A vencer ({abertasNoPeriodo.filter(t => !!t.vencimento && !isVencida(t)).length})
                </FilterPill>
                <FilterPill active={filter === 'vencido'} onClick={() => setFilter('vencido')}>
                    Vencidos ({abertasNoPeriodo.filter(isVencida).length})
                </FilterPill>
                <FilterPill active={filter === 'sem_vencimento'} onClick={() => setFilter('sem_vencimento')}>Sem vencimento ({semVencimento.length})</FilterPill>
                <FilterPill active={filter === 'pago'} onClick={() => setFilter('pago')}>
                    {tipo === 'pagar' ? 'Pagos' : 'Recebidos'} ({noPeriodo.filter(t => t.status === 'PAGO').length})
                </FilterPill>
            </div>

            {/* Tabela */}
            <div className="overflow-hidden rounded-2xl border border-(--eixo-border) bg-(--eixo-surface)">
                <div className="overflow-x-auto">
                    <table aria-label={tipo === 'pagar' ? 'Contas a pagar' : 'Contas a receber'} className="w-full text-left text-sm text-(--eixo-text-muted)">
                        <thead className="bg-(--eixo-surface-soft) text-[10px] font-bold uppercase tracking-[0.12em] text-(--eixo-text-muted)">
                            <tr>
                                <th className="px-4 py-2.5">Vencimento</th>
                                <th className="px-4 py-2.5">Categoria</th>
                                <th className="px-4 py-2.5">Descrição</th>
                                <th className="px-4 py-2.5 text-right">Valor</th>
                                <th className="px-4 py-2.5 text-center">Status</th>
                                <th className="px-4 py-2.5 text-center">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingLoading ? (
                                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-(--eixo-text-muted)">Carregando...</td></tr>
                            ) : filtrada.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center">
                                        <p className="text-base font-semibold text-(--eixo-text)">
                                            {lista.length === 0
                                                ? `Nenhuma conta ${tipo === 'pagar' ? 'a pagar' : 'a receber'} cadastrada`
                                                : 'Nenhum resultado para este filtro'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filtrada
                                    .slice()
                                    .sort((a, b) => {
                                        if (sort === 'valor') return b.valor - a.valor;
                                        if (sort === 'categoria') return getCatLabel(a).localeCompare(getCatLabel(b), 'pt-BR');
                                        const av = a.vencimento ?? '9999';
                                        const bv = b.vencimento ?? '9999';
                                        return av < bv ? -1 : av > bv ? 1 : 0;
                                    })
                                    .map(t => {
                                        const badge = statusBadge(t);
                                        return (
                                            <tr key={t.id} className="border-b border-(--eixo-border) bg-(--eixo-surface) hover:bg-(--eixo-surface)">
                                                <td className={`px-4 py-3 font-medium ${isVencida(t) ? 'text-(--eixo-danger)' : 'text-(--eixo-text)'}`}>
                                                    {t.vencimento ? formatDate(t.vencimento) : <span>Sem vencimento</span>}{t.status === 'PAGO' && <p className="mt-1 text-xs text-(--eixo-text-muted)">{tipo === 'pagar' ? 'Pago' : 'Recebido'}: {formatDate(t.settledAt)}</p>}
                                                </td>
                                                <td className="px-4 py-3 text-(--eixo-text)">{getCatLabel(t)}</td>
                                                <td className="px-4 py-3 text-(--eixo-text-muted)">{t.descricao || '—'}</td>
                                                <td className={`px-4 py-3 text-right font-semibold ${tipo === 'pagar' ? 'text-(--eixo-danger)' : 'text-(--eixo-success)'}`}>
                                                    {formatCurrency(t.valor)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                                                            {t.status === 'PENDENTE' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onMarkPaid(t)}
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-(--eixo-border-strong) bg-(--eixo-green-soft) px-3 py-1 text-xs font-semibold text-(--eixo-success) transition-colors hover:bg-(--eixo-surface-soft) disabled:opacity-50"
                                                                >
                                                                    <CheckIcon className="w-3.5 h-3.5" />
                                                                    {tipo === 'pagar' ? 'Registrar pagamento' : 'Registrar recebimento'}
                                                                </button>
                                                            )}
                                                            {(t.herdEventId || t.sanitaryRecordId) ? <span title="Valor e origem são mantidos pelo módulo que gerou a conta" className="inline-flex items-center gap-1 text-xs"><LockIcon /> Automático <button type="button" onClick={() => onEdit(t)} className="ml-1 underline">Consultar</button></span> : <>
                                                            <button
                                                                type="button"
                                                                onClick={() => onEdit(t)}
                                                                title="Editar lançamento"
                                                                aria-label="Editar lançamento"
                                                                className="rounded-lg border border-(--eixo-border) bg-(--eixo-surface-soft) px-2 py-1 text-xs font-semibold text-(--eixo-text-muted) hover:bg-(--eixo-surface) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--eixo-green)"
                                                            >
                                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414H8v-2a2 2 0 01.586-1.414z" /></svg>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => onDelete(t)}
                                                                className="rounded-lg border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-3 py-1 text-xs font-semibold text-(--eixo-danger) hover:bg-[rgba(184,66,50,0.12)]"
                                                            >
                                                                Cancelar
                                                            </button>
                                                            </>}
                                                        </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};

export default ContasTab;
