import React, { useMemo, useState } from 'react';
import { FinancialTransaction, TransactionType } from '../../adapters/financialApi';
import {
    CATTLE_SALE_CATEGORY_NAMES,
    FEED_AND_MED_CATEGORY_NAMES,
    LockIcon,
    MESES,
    formatCurrency,
    formatDate,
    getCatLabel,
    isVencida,
    normalizeSearchText,
    statusBadge,
} from '../financeUtils';

interface LancamentosTabProps {
    transactions: FinancialTransaction[];
    isLoading: boolean;
    loadError: string | null;
    selectedMes: number;
    setSelectedMes: (mes: number) => void;
    selectedAno: number;
    setSelectedAno: (ano: number) => void;
    anos: number[];
    onNew: () => void;
    onEdit: (t: FinancialTransaction) => void;
    onDelete: (t: FinancialTransaction) => void;
}

const LancamentosTab: React.FC<LancamentosTabProps> = ({
    transactions,
    isLoading,
    loadError,
    selectedMes,
    setSelectedMes,
    selectedAno,
    setSelectedAno,
    anos,
    onNew,
    onEdit,
    onDelete,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTipo, setFilterTipo] = useState<'' | TransactionType>('');

    const summary = useMemo(() => {
        const entradas = transactions.filter(t => t.type === 'ENTRADA').reduce((s, t) => s + t.valor, 0);
        const saidas = transactions.filter(t => t.type === 'SAIDA').reduce((s, t) => s + t.valor, 0);
        return { entradas, saidas, saldo: entradas - saidas };
    }, [transactions]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            if (filterTipo && t.type !== filterTipo) return false;
            const q = normalizeSearchText(searchQuery.trim());
            if (!q) return true;
            return normalizeSearchText(t.descricao ?? '').includes(q)
                || normalizeSearchText(t.accountCategoryName ?? '').includes(q)
                || normalizeSearchText(t.accountCategoryGroup ?? '').includes(q);
        });
    }, [transactions, filterTipo, searchQuery]);

    const monthlyAnswers = useMemo(() => {
        const soldThisMonth = transactions
            .filter((transaction) => {
                if (transaction.type !== 'ENTRADA') return false;
                if (transaction.categoria === 'VENDA_ANIMAIS') return true;
                const normalizedName = normalizeSearchText(transaction.accountCategoryName || '');
                return CATTLE_SALE_CATEGORY_NAMES.has(normalizedName);
            })
            .reduce((sum, transaction) => sum + transaction.valor, 0);

        const feedAndMedThisMonth = transactions
            .filter((transaction) => {
                if (transaction.type !== 'SAIDA') return false;
                if (transaction.categoria === 'ALIMENTACAO' || transaction.categoria === 'MEDICAMENTOS') return true;
                const normalizedName = normalizeSearchText(transaction.accountCategoryName || '');
                return FEED_AND_MED_CATEGORY_NAMES.has(normalizedName);
            })
            .reduce((sum, transaction) => sum + transaction.valor, 0);

        return { soldThisMonth, feedAndMedThisMonth };
    }, [transactions]);

    return (
        <>
            <div className="flex flex-wrap items-center gap-3">
                <select value={selectedMes} onChange={e => setSelectedMes(Number(e.target.value))}
                    className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none">
                    {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select value={selectedAno} onChange={e => setSelectedAno(Number(e.target.value))}
                    className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none">
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                    type="text"
                    placeholder="Buscar por descrição ou categoria…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="min-w-[220px] flex-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-muted)] focus:border-[var(--eixo-green)] focus:outline-none"
                />
                <div className="flex gap-1">
                    {(['', 'ENTRADA', 'SAIDA'] as const).map(tipo => (
                        <button
                            key={tipo || 'todos'}
                            type="button"
                            onClick={() => setFilterTipo(tipo)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                filterTipo === tipo
                                    ? 'bg-[var(--eixo-graphite)] text-white'
                                    : 'border border-[var(--eixo-border)] bg-[var(--eixo-surface)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]'
                            }`}
                        >
                            {tipo === '' ? 'Todos' : tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="flex min-h-[96px] flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Entradas</p>
                    <p className="mt-2 font-brand text-3xl font-extrabold text-[var(--eixo-success)]">{formatCurrency(summary.entradas)}</p>
                    <p className="mt-1 text-xs invisible">—</p>
                </div>
                <div className="flex min-h-[96px] flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Saídas</p>
                    <p className="mt-2 font-brand text-3xl font-extrabold text-[var(--eixo-danger)]">{formatCurrency(summary.saidas)}</p>
                    <p className="mt-1 text-xs invisible">—</p>
                </div>
                <div className="flex min-h-[96px] flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Saldo</p>
                    <p className={`mt-2 font-brand text-3xl font-extrabold ${summary.saldo >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                        {formatCurrency(summary.saldo)}
                    </p>
                    <p className="mt-1 text-xs invisible">—</p>
                </div>
                <div className="flex min-h-[96px] flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Venda de gado no mês</p>
                    <p className="mt-2 font-brand text-3xl font-extrabold text-[var(--eixo-success)]">{formatCurrency(monthlyAnswers.soldThisMonth)}</p>
                    <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Somando só categorias de venda de gado</p>
                </div>
                <div className="flex min-h-[96px] flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Sal, ração e remédio</p>
                    <p className="mt-2 font-brand text-3xl font-extrabold text-[var(--eixo-danger)]">{formatCurrency(monthlyAnswers.feedAndMedThisMonth)}</p>
                    <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Nutrição e sanidade no período</p>
                </div>
            </div>

            {loadError && (
                <div className="rounded-xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]">{loadError}</div>
            )}

            <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[var(--eixo-text-muted)]">
                        <thead className="bg-[var(--eixo-surface-soft)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                            <tr>
                                <th className="px-4 py-2.5">Data</th>
                                <th className="px-4 py-2.5">Tipo</th>
                                <th className="px-4 py-2.5">Categoria</th>
                                <th className="px-4 py-2.5">Grupo</th>
                                <th className="px-4 py-2.5">Descrição</th>
                                <th className="px-4 py-2.5">Status</th>
                                <th className="px-4 py-2.5 text-right">Valor</th>
                                <th className="px-4 py-2.5 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <>
                                    {[1, 2, 3, 4].map(i => (
                                        <tr key={i} className="border-b border-[var(--eixo-border)]">
                                            {[7, 4, 5, 6, 8, 4, 4, 3].map((w, j) => (
                                                <td key={j} className="px-4 py-3">
                                                    <div className={`h-3 w-${w * 4} animate-pulse rounded bg-[var(--eixo-surface-soft)]`} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </>
                            ) : filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center">
                                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--eixo-surface-soft)]">
                                            <svg className="h-6 w-6 text-[var(--eixo-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        </div>
                                        {transactions.length === 0 ? (
                                            <>
                                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Nenhum lançamento em {MESES[selectedMes - 1]} {selectedAno}</p>
                                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Registre entradas e saídas para ver o saldo do mês.</p>
                                                <button type="button" onClick={onNew} className="mt-4 rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:opacity-90">
                                                    Novo lançamento
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Nenhum lançamento encontrado</p>
                                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Tente ajustar o filtro ou o termo de busca.</p>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                filteredTransactions.map(t => {
                                    const vencida = isVencida(t);
                                    const badge = statusBadge(t);
                                    return (
                                    <tr key={t.id} className={`border-b border-[var(--eixo-border)] ${vencida ? 'border-l-2 border-l-[var(--eixo-danger)] bg-[rgba(184,66,50,0.04)]' : 'bg-[var(--eixo-surface)]'} hover:opacity-90`}>
                                        <td className="px-4 py-3">{formatDate(t.data)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.type === 'ENTRADA' ? 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' : 'bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]'}`}>
                                                {t.type === 'ENTRADA' ? 'Entrada' : 'Saída'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-[var(--eixo-text)]">{getCatLabel(t)}</td>
                                        <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{t.accountCategoryGroup || '—'}</td>
                                        <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{t.descricao || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 text-right font-semibold ${t.type === 'ENTRADA' ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                            {t.type === 'SAIDA' ? '− ' : '+ '}{formatCurrency(t.valor)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {(t.herdEventId || t.sanitaryRecordId) ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-[var(--eixo-text-muted)]"><LockIcon /> auto</span>
                                            ) : (
                                                <div className="inline-flex items-center gap-2">
                                                    <button type="button"
                                                        onClick={() => onEdit(t)}
                                                        title="Editar lançamento"
                                                        aria-label="Editar lançamento"
                                                        className="rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-2 py-1 text-xs font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--eixo-green)]">
                                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414H8v-2a2 2 0 01.586-1.414z" /></svg>
                                                    </button>
                                                    <button type="button"
                                                        onClick={() => onDelete(t)}
                                                        className="rounded-lg border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-3 py-1 text-xs font-semibold text-[var(--eixo-danger)] hover:bg-[rgba(184,66,50,0.12)]">
                                                        Excluir
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

export default LancamentosTab;
