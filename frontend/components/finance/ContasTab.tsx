import React, { useMemo, useState } from 'react';
import { FinancialTransaction } from '../../adapters/financialApi';
import { CalendarCheckIcon, CheckIcon, ClockIcon, LockIcon, WalletIcon, formatCurrency, formatDate, getCatLabel, isVencida, statusBadge } from '../financeUtils';
import KpiCard from '../KpiCard';

type ContaFilter = 'todos' | 'pendente' | 'vencido' | 'pago';

interface ContasTabProps {
    tipo: 'pagar' | 'receber';
    pendingAll: FinancialTransaction[];
    pendingLoading: boolean;
    onMarkPaid: (id: string) => Promise<void>;
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
        onClick={onClick}
        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]'}`}
    >
        {children}
    </button>
);

const applyFilter = (list: FinancialTransaction[], filter: ContaFilter) => {
    if (filter === 'vencido') return list.filter(isVencida);
    if (filter === 'pendente') return list.filter(t => t.status !== 'PAGO' && !isVencida(t));
    if (filter === 'pago') return list.filter(t => t.status === 'PAGO');
    return list;
};

const ContasTab: React.FC<ContasTabProps> = ({ tipo, pendingAll, pendingLoading, onMarkPaid, onEdit, onDelete }) => {
    const [filter, setFilter] = useState<ContaFilter>('todos');
    const [markingPaid, setMarkingPaid] = useState<string | null>(null);

    const lista = useMemo(
        () => pendingAll.filter(t => t.type === (tipo === 'pagar' ? 'SAIDA' : 'ENTRADA')),
        [pendingAll, tipo],
    );

    // Filtro de período por Date Picker (De/Até). Usa o vencimento como
    // referência (é a data que importa pra contas a pagar/receber) e cai pra
    // data de competência quando não tem vencimento cadastrado.
    const [filtroDe, setFiltroDe] = useState('');
    const [filtroAte, setFiltroAte] = useState('');

    const noPeriodo = useMemo(() => {
        if (!filtroDe && !filtroAte) return lista;
        return lista.filter(t => {
            const ref = t.vencimento || t.data;
            if (!ref) return false;
            const d = new Date(ref);
            if (filtroDe && d < new Date(filtroDe)) return false;
            if (filtroAte) {
                const ateFimDoDia = new Date(filtroAte);
                ateFimDoDia.setHours(23, 59, 59, 999);
                if (d > ateFimDoDia) return false;
            }
            return true;
        });
    }, [lista, filtroDe, filtroAte]);

    const abertasNoPeriodo = useMemo(() => noPeriodo.filter(t => t.status !== 'PAGO'), [noPeriodo]);

    const handleMarkPaid = async (id: string) => {
        setMarkingPaid(id);
        try {
            await onMarkPaid(id);
        } finally {
            setMarkingPaid(null);
        }
    };

    const filtrada = applyFilter(noPeriodo, filter);
    // Os cards seguem o período escolhido: mudam junto com o filtro de mês/ano.
    const totalPendente = abertasNoPeriodo.reduce((s, t) => s + t.valor, 0);
    const totalVencido = abertasNoPeriodo.filter(isVencida).reduce((s, t) => s + t.valor, 0);
    const totalAVencer = abertasNoPeriodo.filter(t => !isVencida(t)).reduce((s, t) => s + t.valor, 0);
    const totalPago = noPeriodo.filter(t => t.status === 'PAGO').reduce((s, t) => s + t.valor, 0);
    const corTotal = tipo === 'pagar' ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-success)]';

    return (
        <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard title={`Total ${tipo === 'pagar' ? 'a pagar' : 'a receber'}`} icon={<WalletIcon />}>
                    <p className={`font-brand text-2xl font-extrabold ${corTotal}`}>{formatCurrency(totalPendente)}</p>
                </KpiCard>
                <KpiCard title="Vencidos" icon={<ClockIcon />} tone="danger">
                    <p className="font-brand text-2xl font-extrabold text-[var(--eixo-danger)]">{formatCurrency(totalVencido)}</p>
                </KpiCard>
                <KpiCard title="A vencer" icon={<CalendarCheckIcon />} tone="success">
                    <p className="font-brand text-2xl font-extrabold text-[var(--eixo-graphite)]">{formatCurrency(totalAVencer)}</p>
                </KpiCard>
                <KpiCard title={tipo === 'pagar' ? 'Total pago' : 'Total recebido'} icon={<CheckIcon />}>
                    <p className="font-brand text-2xl font-extrabold text-[var(--eixo-text)]">{formatCurrency(totalPago)}</p>
                </KpiCard>
            </div>

            {/* Período */}
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--eixo-text-muted)]">
                    De
                    <input type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)}
                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none" />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--eixo-text-muted)]">
                    Até
                    <input type="date" value={filtroAte} onChange={e => setFiltroAte(e.target.value)}
                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none" />
                </label>
                {(filtroDe !== '' || filtroAte !== '') && (
                    <button type="button" onClick={() => { setFiltroDe(''); setFiltroAte(''); }}
                        className="text-xs font-semibold text-[var(--eixo-text-muted)] underline hover:text-[var(--eixo-text)]">
                        Limpar período
                    </button>
                )}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
                <FilterPill active={filter === 'todos'} onClick={() => setFilter('todos')}>Todos ({noPeriodo.length})</FilterPill>
                <FilterPill active={filter === 'pendente'} onClick={() => setFilter('pendente')}>
                    A vencer ({abertasNoPeriodo.filter(t => !isVencida(t)).length})
                </FilterPill>
                <FilterPill active={filter === 'vencido'} onClick={() => setFilter('vencido')}>
                    Vencidos ({abertasNoPeriodo.filter(isVencida).length})
                </FilterPill>
                <FilterPill active={filter === 'pago'} onClick={() => setFilter('pago')}>
                    {tipo === 'pagar' ? 'Pagos' : 'Recebidos'} ({noPeriodo.filter(t => t.status === 'PAGO').length})
                </FilterPill>
            </div>

            {/* Tabela */}
            <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[var(--eixo-text-muted)]">
                        <thead className="bg-[var(--eixo-surface-soft)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
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
                                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--eixo-text-muted)]">Carregando...</td></tr>
                            ) : filtrada.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center">
                                        <p className="text-base font-semibold text-[var(--eixo-text)]">
                                            {lista.length === 0
                                                ? `Nenhuma conta ${tipo === 'pagar' ? 'a pagar' : 'a receber'} em aberto`
                                                : 'Nenhum resultado para este filtro'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filtrada
                                    .slice()
                                    .sort((a, b) => {
                                        const av = a.vencimento ?? '9999';
                                        const bv = b.vencimento ?? '9999';
                                        return av < bv ? -1 : av > bv ? 1 : 0;
                                    })
                                    .map(t => {
                                        const badge = statusBadge(t);
                                        return (
                                            <tr key={t.id} className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface)]">
                                                <td className={`px-4 py-3 font-medium ${isVencida(t) ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-text)]'}`}>
                                                    {formatDate(t.vencimento)}
                                                </td>
                                                <td className="px-4 py-3 text-[var(--eixo-text)]">{getCatLabel(t)}</td>
                                                <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{t.descricao || '—'}</td>
                                                <td className={`px-4 py-3 text-right font-semibold ${tipo === 'pagar' ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-success)]'}`}>
                                                    {formatCurrency(t.valor)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {(t.herdEventId || t.sanitaryRecordId) ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-[var(--eixo-text-muted)]"><LockIcon /> auto</span>
                                                    ) : (
                                                        <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                                                            {t.status !== 'PAGO' && (
                                                                <button
                                                                    type="button"
                                                                    disabled={markingPaid === t.id}
                                                                    onClick={() => handleMarkPaid(t.id)}
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--eixo-border-strong)] bg-[var(--eixo-green-soft)] px-3 py-1 text-xs font-semibold text-[var(--eixo-success)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50"
                                                                >
                                                                    <CheckIcon className="w-3.5 h-3.5" />
                                                                    {markingPaid === t.id ? '...' : 'Pago'}
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => onEdit(t)}
                                                                title="Editar lançamento"
                                                                aria-label="Editar lançamento"
                                                                className="rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-2 py-1 text-xs font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--eixo-green)]"
                                                            >
                                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414H8v-2a2 2 0 01.586-1.414z" /></svg>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => onDelete(t)}
                                                                className="rounded-lg border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-3 py-1 text-xs font-semibold text-[var(--eixo-danger)] hover:bg-[rgba(184,66,50,0.12)]"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    )}
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
