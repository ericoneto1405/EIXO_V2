import React, { useMemo, useState } from 'react';
import { FinancialTransaction } from '../../adapters/financialApi';
import { CheckIcon, formatCurrency, formatDate, getCatLabel, isVencida, statusBadge } from '../financeUtils';

type ContaFilter = 'todos' | 'pendente' | 'vencido';

interface ContasTabProps {
    tipo: 'pagar' | 'receber';
    pendingAll: FinancialTransaction[];
    pendingLoading: boolean;
    onMarkPaid: (id: string) => Promise<void>;
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
    if (filter === 'pendente') return list.filter(t => !isVencida(t));
    return list;
};

const ContasTab: React.FC<ContasTabProps> = ({ tipo, pendingAll, pendingLoading, onMarkPaid }) => {
    const [filter, setFilter] = useState<ContaFilter>('todos');
    const [markingPaid, setMarkingPaid] = useState<string | null>(null);

    const lista = useMemo(
        () => pendingAll.filter(t => t.type === (tipo === 'pagar' ? 'SAIDA' : 'ENTRADA') && t.status !== 'PAGO'),
        [pendingAll, tipo],
    );

    const handleMarkPaid = async (id: string) => {
        setMarkingPaid(id);
        try {
            await onMarkPaid(id);
        } finally {
            setMarkingPaid(null);
        }
    };

    const filtrada = applyFilter(lista, filter);
    const totalPendente = lista.reduce((s, t) => s + t.valor, 0);
    const totalVencido = lista.filter(isVencida).reduce((s, t) => s + t.valor, 0);
    const totalAVencer = lista.filter(t => !isVencida(t)).reduce((s, t) => s + t.valor, 0);
    const corTotal = tipo === 'pagar' ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-success)]';

    return (
        <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">
                        Total {tipo === 'pagar' ? 'a pagar' : 'a receber'}
                    </p>
                    <p className={`mt-2 font-brand text-2xl font-extrabold ${corTotal}`}>{formatCurrency(totalPendente)}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-danger)]">Vencidos</p>
                    <p className="mt-2 font-brand text-2xl font-extrabold text-[var(--eixo-danger)]">{formatCurrency(totalVencido)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">A vencer</p>
                    <p className="mt-2 font-brand text-2xl font-extrabold text-[var(--eixo-graphite)]">{formatCurrency(totalAVencer)}</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-2">
                <FilterPill active={filter === 'todos'} onClick={() => setFilter('todos')}>Todos ({lista.length})</FilterPill>
                <FilterPill active={filter === 'pendente'} onClick={() => setFilter('pendente')}>
                    A vencer ({lista.filter(t => !isVencida(t)).length})
                </FilterPill>
                <FilterPill active={filter === 'vencido'} onClick={() => setFilter('vencido')}>
                    Vencidos ({lista.filter(isVencida).length})
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
                                                    <button
                                                        type="button"
                                                        disabled={markingPaid === t.id}
                                                        onClick={() => handleMarkPaid(t.id)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--eixo-border-strong)] bg-[var(--eixo-green-soft)] px-3 py-1 text-xs font-semibold text-[var(--eixo-success)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50"
                                                    >
                                                        <CheckIcon className="w-3.5 h-3.5" />
                                                        {markingPaid === t.id ? '...' : 'Pago'}
                                                    </button>
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
