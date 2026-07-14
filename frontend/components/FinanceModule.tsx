import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
    AccountCategory,
    CATEGORIA_LABELS,
    FinancialTransaction,
    TransactionCategoria,
    TransactionStatus,
    TransactionType,
    createTransaction,
    deleteTransaction,
    listAccountCategories,
    listTransactions,
    updateTransaction,
} from '../adapters/financialApi';
import ChartCard from './ChartCard';
import {
    PlusIcon,
    LockIcon,
    formatCurrency,
    formatDate,
    MESES,
    normalizeSearchText,
    CATTLE_SALE_CATEGORY_NAMES,
    FEED_AND_MED_CATEGORY_NAMES,
    PIE_COLORS,
    FINANCIAL_PROGRESS_EVENT,
    FinanceTab,
    TAB_LABELS,
    getCatLabel,
    groupByGroup,
    isVencida,
    statusBadge,
} from './financeUtils';
import PlanoContasTab from './finance/PlanoContasTab';
import DreTab from './finance/DreTab';
import FluxoTab from './finance/FluxoTab';
import ContasTab from './finance/ContasTab';

interface FinanceModuleProps {
    farmId?: string | null;
    farmName?: string | null;
    isFreePlan?: boolean;
    onUpgradeRequest?: () => void;
}

// Financeiro completo liberado para todos os planos
const LOCKED_TABS_FREE: FinanceTab[] = [];

// ── Componente principal ──────────────────────────────────────────────────────

const FinanceModule: React.FC<FinanceModuleProps> = ({ farmId, farmName, isFreePlan = false, onUpgradeRequest }) => {
    const hoje = new Date();

    // ── Estado geral ──
    const [activeTab, setActiveTab] = useState<FinanceTab>('lancamentos');

    // ── Lançamentos (mensal) ──
    const [selectedMes, setSelectedMes] = useState(hoje.getMonth() + 1);
    const [selectedAno, setSelectedAno] = useState(hoje.getFullYear());
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTipo, setFilterTipo] = useState<'' | TransactionType>('');

    // ── Contas a Pagar / Receber ──
    const [pendingAll, setPendingAll] = useState<FinancialTransaction[]>([]);
    const [pendingLoading, setPendingLoading] = useState(true);

    // ── Fluxo de Caixa / DRE (anual) ──
    const [annualTransactions, setAnnualTransactions] = useState<FinancialTransaction[]>([]);
    const [annualLoading, setAnnualLoading] = useState(true);
    const [selectedAnoAnual, setSelectedAnoAnual] = useState(hoje.getFullYear());

    // ── Categorias ──
    const [categories, setCategories] = useState<AccountCategory[]>([]);
    const [catLoading, setCatLoading] = useState(true);

    // ── Modal novo lançamento ──
    const [modalOpen, setModalOpen] = useState(false);
    const [formType, setFormType] = useState<TransactionType>('ENTRADA');
    const [formCategoryId, setFormCategoryId] = useState<string>('');
    const [formValor, setFormValor] = useState('');
    const [formData, setFormData] = useState(hoje.toISOString().slice(0, 10));
    const [formDescricao, setFormDescricao] = useState('');
    const [formStatus, setFormStatus] = useState<TransactionStatus>('PAGO');
    const [formVencimento, setFormVencimento] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // ── Edição de lançamento ──
    const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);

    // ── Delete transação ──
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // ── Carregamento de dados ─────────────────────────────────────────────────

    const loadCategories = useCallback(async () => {
        if (!farmId) { setCatLoading(false); return; }
        setCatLoading(true);
        try {
            const data = await listAccountCategories(farmId);
            setCategories(data);
        } catch { /* silencioso */ }
        finally { setCatLoading(false); }
    }, [farmId]);

    const loadTransactions = useCallback(async () => {
        if (!farmId) { setTransactions([]); setIsLoading(false); return; }
        setIsLoading(true);
        setLoadError(null);
        try {
            const data = await listTransactions(farmId, selectedMes, selectedAno);
            setTransactions(data);
        } catch (e: any) {
            setLoadError(e?.message || 'Erro ao carregar transações.');
        } finally { setIsLoading(false); }
    }, [farmId, selectedMes, selectedAno]);

    const loadPending = useCallback(async () => {
        if (!farmId) { setPendingAll([]); setPendingLoading(false); return; }
        setPendingLoading(true);
        try {
            const data = await listTransactions(farmId, undefined, undefined, { status: 'PENDENTE' });
            setPendingAll(data);
        } catch { /* silencioso */ }
        finally { setPendingLoading(false); }
    }, [farmId]);

    const loadAnnual = useCallback(async () => {
        if (!farmId) { setAnnualTransactions([]); setAnnualLoading(false); return; }
        setAnnualLoading(true);
        try {
            const data = await listTransactions(farmId, undefined, selectedAnoAnual);
            setAnnualTransactions(data);
        } catch { /* silencioso */ }
        finally { setAnnualLoading(false); }
    }, [farmId, selectedAnoAnual]);

    useEffect(() => { loadTransactions(); }, [loadTransactions]);
    useEffect(() => { loadCategories(); }, [loadCategories]);
    useEffect(() => {
        if (activeTab === 'contas_pagar' || activeTab === 'contas_receber') loadPending();
    }, [activeTab, loadPending]);
    useEffect(() => {
        if (activeTab === 'fluxo' || activeTab === 'dre') loadAnnual();
    }, [activeTab, loadAnnual]);

    // ── Sumário mensal ────────────────────────────────────────────────────────

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

    const monthlyGroupCharts = useMemo(() => {
        const receitas = new Map<string, number>();
        const despesas = new Map<string, number>();

        for (const transaction of transactions) {
            const groupName =
                transaction.accountCategoryGroup ||
                transaction.accountCategoryName ||
                CATEGORIA_LABELS[transaction.categoria] ||
                'Outros';

            if (transaction.type === 'ENTRADA') {
                receitas.set(groupName, (receitas.get(groupName) ?? 0) + transaction.valor);
            } else {
                despesas.set(groupName, (despesas.get(groupName) ?? 0) + transaction.valor);
            }
        }

        const toChartData = (map: Map<string, number>) =>
            Array.from(map.entries())
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);

        return {
            receitas: toChartData(receitas),
            despesas: toChartData(despesas),
        };
    }, [transactions]);

    // ── Contas a Pagar / Receber derivadas ────────────────────────────────────


    // ── Categorias filtradas por tipo ──────────────────────────────────────────

    const filteredCategories = useMemo(
        () => categories.filter(c => c.type === formType && c.isActive),
        [categories, formType],
    );

    useEffect(() => {
        const first = filteredCategories[0];
        setFormCategoryId(first?.id ?? '');
    }, [filteredCategories]);

    // ── Handlers: lançamentos ─────────────────────────────────────────────────

    const resetForm = () => {
        setEditingTransaction(null);
        setFormType('ENTRADA');
        setFormValor('');
        setFormData(new Date().toISOString().slice(0, 10));
        setFormDescricao('');
        setFormStatus('PAGO');
        setFormVencimento('');
        setFormError(null);
    };

    const openEditModal = (t: FinancialTransaction) => {
        setEditingTransaction(t);
        setFormType(t.type);
        setFormValor(String(t.valor));
        setFormData(t.data.slice(0, 10));
        setFormDescricao(t.descricao ?? '');
        setFormStatus(t.status);
        setFormVencimento(t.vencimento ? t.vencimento.slice(0, 10) : '');
        setFormCategoryId(t.accountCategoryId ?? '');
        setFormError(null);
        setModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!farmId) return;
        const valorNum = parseFloat(formValor.replace(',', '.'));
        if (isNaN(valorNum) || valorNum < 0) { setFormError('Informe um valor válido.'); return; }
        if (!formCategoryId) { setFormError('Selecione uma categoria.'); return; }
        setIsSaving(true);
        try {
            if (editingTransaction) {
                await updateTransaction(editingTransaction.id, {
                    accountCategoryId: formCategoryId,
                    valor: valorNum,
                    data: formData,
                    descricao: formDescricao || null,
                    status: formStatus,
                    vencimento: formVencimento || null,
                });
            } else {
                await createTransaction({
                    farmId,
                    type: formType,
                    categoria: 'OUTROS' as TransactionCategoria,
                    accountCategoryId: formCategoryId,
                    valor: valorNum,
                    data: formData,
                    descricao: formDescricao || undefined,
                    status: formStatus,
                    vencimento: formVencimento || undefined,
                });
            }
            setModalOpen(false);
            resetForm();
            await loadTransactions();
            if (activeTab === 'contas_pagar' || activeTab === 'contas_receber') await loadPending();
            window.dispatchEvent(new Event(FINANCIAL_PROGRESS_EVENT));
        } catch (e: any) {
            setFormError(e?.message || 'Erro ao salvar.');
        } finally { setIsSaving(false); }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteConfirmId) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteTransaction(deleteConfirmId);
            setDeleteConfirmId(null);
            await loadTransactions();
            await loadPending();
            window.dispatchEvent(new Event(FINANCIAL_PROGRESS_EVENT));
        } catch (e: any) {
            setDeleteError(e?.message || 'Erro ao excluir.');
        } finally { setIsDeleting(false); }
    };

    const handleMarkPaid = async (id: string) => {
        try {
            await updateTransaction(id, { status: 'PAGO' });
            await loadPending();
            await loadTransactions();
            window.dispatchEvent(new Event(FINANCIAL_PROGRESS_EVENT));
        } catch { /* silencioso */ }
    };

    // ── Estilos recorrentes ───────────────────────────────────────────────────

    const anos = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];
    const activeTabCls = 'bg-[var(--eixo-green)] text-[#1a1a1a] font-bold';
    const inactiveTabCls = 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]';
    const inputCls = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none';
    const labelCls = 'block text-sm font-medium text-[var(--eixo-text)]';

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            {farmName || 'Fazenda'}
                        </div>
                        <h2 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Financeiro</h2>
                    </div>
                    {activeTab === 'lancamentos' && (
                        <button
                            type="button"
                            onClick={() => { resetForm(); setModalOpen(true); }}
                            className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-brand font-bold text-[#1a1a1a] shadow-md transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            <PlusIcon className="h-[18px] w-[18px]" />
                            <span className="ml-2">Novo lançamento</span>
                        </button>
                    )}
                    {(activeTab === 'contas_pagar' || activeTab === 'contas_receber') && (
                        <button
                            type="button"
                            onClick={() => {
                                resetForm();
                                setFormType(activeTab === 'contas_pagar' ? 'SAIDA' : 'ENTRADA');
                                setFormStatus('PENDENTE');
                                setModalOpen(true);
                            }}
                            className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-brand font-bold text-[#1a1a1a] shadow-md transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            <PlusIcon className="h-[18px] w-[18px]" />
                            <span className="ml-2">Nova conta</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Abas */}
            <div className="flex gap-2 flex-wrap">
                {(Object.keys(TAB_LABELS) as FinanceTab[]).map((tab) => {
                    const isTabLocked = isFreePlan && LOCKED_TABS_FREE.includes(tab);
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => {
                                if (isTabLocked) { onUpgradeRequest?.(); return; }
                                setActiveTab(tab);
                            }}
                            title={isTabLocked ? 'Disponível nos planos pagos' : undefined}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold font-brand transition-colors ${
                                isTabLocked
                                    ? 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-soft)] cursor-not-allowed opacity-70'
                                    : activeTab === tab ? activeTabCls : inactiveTabCls
                            }`}
                        >
                            {isTabLocked && <LockIcon className="w-3 h-3 flex-shrink-0" />}
                            {TAB_LABELS[tab]}
                        </button>
                    );
                })}
            </div>

            {/* ── Aba: Lançamentos ──────────────────────────────────────────────── */}
            {activeTab === 'lancamentos' && (
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
                                                        <button type="button" onClick={() => setModalOpen(true)} className="mt-4 rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:opacity-90">
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
                                                                onClick={() => openEditModal(t)}
                                                                title="Editar lançamento"
                                                                className="rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-2 py-1 text-xs font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface)]">
                                                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16.414H8v-2a2 2 0 01.586-1.414z" /></svg>
                                                            </button>
                                                            <button type="button"
                                                                onClick={() => { setDeleteError(null); setDeleteConfirmId(t.id); }}
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
            )}

            {/* ── Aba: Visão Geral ─────────────────────────────────────────────── */}
            {activeTab === 'visao_geral' && (
                <>
                    <div className="flex flex-wrap gap-3">
                        <select value={selectedMes} onChange={e => setSelectedMes(Number(e.target.value))}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none">
                            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                        </select>
                        <select value={selectedAno} onChange={e => setSelectedAno(Number(e.target.value))}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none">
                            {anos.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>

                    {loadError && (
                        <div className="rounded-xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]">{loadError}</div>
                    )}

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                        <ChartCard title="Receitas por grupo">
                            {isLoading ? (
                                <p className="text-sm text-[var(--eixo-text-muted)]">Carregando receitas...</p>
                            ) : monthlyGroupCharts.receitas.length === 0 ? (
                                <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma receita no período selecionado.</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={360}>
                                    <PieChart>
                                        <Pie
                                            data={monthlyGroupCharts.receitas}
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={120}
                                            dataKey="value"
                                            nameKey="name"
                                            labelLine={false}
                                            label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                                        >
                                            {monthlyGroupCharts.receitas.map((_, index) => (
                                                <Cell key={`receita-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) => formatCurrency(Number(value))}
                                            contentStyle={{ backgroundColor: '#fffaf1', borderColor: 'var(--eixo-border)', borderRadius: '0.75rem' }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard title="Despesas por grupo">
                            {isLoading ? (
                                <p className="text-sm text-[var(--eixo-text-muted)]">Carregando despesas...</p>
                            ) : monthlyGroupCharts.despesas.length === 0 ? (
                                <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma despesa no período selecionado.</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={360}>
                                    <PieChart>
                                        <Pie
                                            data={monthlyGroupCharts.despesas}
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={120}
                                            dataKey="value"
                                            nameKey="name"
                                            labelLine={false}
                                            label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                                        >
                                            {monthlyGroupCharts.despesas.map((_, index) => (
                                                <Cell key={`despesa-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) => formatCurrency(Number(value))}
                                            contentStyle={{ backgroundColor: '#fffaf1', borderColor: 'var(--eixo-border)', borderRadius: '0.75rem' }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>
                </>
            )}

            {/* ── Aba: Contas a Pagar ───────────────────────────────────────────── */}
            {activeTab === 'contas_pagar' && (
                <ContasTab tipo="pagar" pendingAll={pendingAll} pendingLoading={pendingLoading} onMarkPaid={handleMarkPaid} />
            )}

            {/* ── Aba: Contas a Receber ─────────────────────────────────────────── */}
            {activeTab === 'contas_receber' && (
                <ContasTab tipo="receber" pendingAll={pendingAll} pendingLoading={pendingLoading} onMarkPaid={handleMarkPaid} />
            )}

            {/* ── Aba: Fluxo de Caixa ──────────────────────────────────────────── */}
            {activeTab === 'fluxo' && (
                <FluxoTab
                    annualTransactions={annualTransactions}
                    annualLoading={annualLoading}
                    selectedAnoAnual={selectedAnoAnual}
                    setSelectedAnoAnual={setSelectedAnoAnual}
                    anos={anos}
                />
            )}

            {/* ── Aba: DRE ─────────────────────────────────────────────────────── */}
            {activeTab === 'dre' && (
                <DreTab
                    annualTransactions={annualTransactions}
                    annualLoading={annualLoading}
                    selectedAnoAnual={selectedAnoAnual}
                    setSelectedAnoAnual={setSelectedAnoAnual}
                    anos={anos}
                />
            )}

            {/* ── Aba: Plano de Contas ──────────────────────────────────────────── */}
            {activeTab === 'plano_contas' && (
                <PlanoContasTab
                    farmId={farmId}
                    categories={categories}
                    catLoading={catLoading}
                    onReloadCategories={loadCategories}
                    inputCls={inputCls}
                    labelCls={labelCls}
                />
            )}

            {/* ── Modal: Novo / Editar lançamento ──────────────────────────────── */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setModalOpen(false); resetForm(); }}>
                    <div className="w-full max-w-md rounded-2xl bg-[var(--eixo-surface)] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <header className="flex items-center justify-between border-b border-[var(--eixo-border)] p-5">
                            <h3 className="font-brand text-lg font-bold text-[var(--eixo-text)]">
                                {editingTransaction ? 'Editar lançamento' : 'Novo lançamento'}
                            </h3>
                            <button type="button" onClick={() => { setModalOpen(false); resetForm(); }} className="rounded-full p-2 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]">✕</button>
                        </header>
                        <form onSubmit={handleSave} className="space-y-4 p-6">
                            {/* Tipo */}
                            <div>
                                <label className={labelCls}>Tipo</label>
                                {editingTransaction ? (
                                    <p className={`${inputCls} bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]`}>
                                        {formType === 'ENTRADA' ? 'Entrada' : 'Saída'} <span className="text-xs">(não editável)</span>
                                    </p>
                                ) : (
                                    <select value={formType} onChange={e => setFormType(e.target.value as TransactionType)} className={inputCls}>
                                        <option value="ENTRADA">Entrada</option>
                                        <option value="SAIDA">Saída</option>
                                    </select>
                                )}
                            </div>
                            {/* Categoria */}
                            <div>
                                <label className={labelCls}>Categoria</label>
                                {catLoading ? (
                                    <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Carregando...</p>
                                ) : filteredCategories.length === 0 ? (
                                    <p className="mt-1 text-sm text-[var(--eixo-danger)]">Nenhuma categoria ativa. Crie no Plano de Contas.</p>
                                ) : (
                                    <select value={formCategoryId} onChange={e => setFormCategoryId(e.target.value)} className={inputCls}>
                                        {Array.from(groupByGroup(filteredCategories).entries()).map(([grp, cats]) => (
                                            <optgroup key={grp} label={grp}>
                                                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                )}
                            </div>
                            {/* Valor */}
                            <div>
                                <label className={labelCls}>Valor (R$)</label>
                                <input type="number" step="0.01" min="0" value={formValor} onChange={e => setFormValor(e.target.value)} className={inputCls} required />
                            </div>
                            {/* Data */}
                            <div>
                                <label className={labelCls}>Data do lançamento</label>
                                <input type="date" value={formData} onChange={e => setFormData(e.target.value)} className={inputCls} required />
                            </div>
                            {/* Status */}
                            <div>
                                <label className={labelCls}>Status</label>
                                <select value={formStatus} onChange={e => setFormStatus(e.target.value as TransactionStatus)} className={inputCls}>
                                    <option value="PAGO">Pago / Recebido</option>
                                    <option value="PENDENTE">Pendente</option>
                                </select>
                            </div>
                            {/* Vencimento (só para pendentes) */}
                            {formStatus === 'PENDENTE' && (
                                <div>
                                    <label className={labelCls}>Data de vencimento</label>
                                    <input type="date" value={formVencimento} onChange={e => setFormVencimento(e.target.value)} className={inputCls} />
                                </div>
                            )}
                            {/* Descrição */}
                            <div>
                                <label className={labelCls}>Descrição <span className="text-[var(--eixo-text-muted)]">(opcional)</span></label>
                                <input type="text" value={formDescricao} onChange={e => setFormDescricao(e.target.value)} className={inputCls} />
                            </div>
                            {formError && <p className="text-sm text-[var(--eixo-danger)]">{formError}</p>}
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => { setModalOpen(false); resetForm(); }}
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isSaving || filteredCategories.length === 0}
                                    className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:opacity-50">
                                    {isSaving ? 'Salvando...' : editingTransaction ? 'Salvar alterações' : 'Lançar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: Confirmar exclusão de lançamento ───────────────────────── */}
            {deleteConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
                        <div className="p-6">
                            <h3 className="font-brand text-lg font-bold text-[var(--eixo-text)]">Excluir lançamento</h3>
                            <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Tem certeza? Essa ação não pode ser desfeita.</p>
                            {deleteError && <p className="mt-3 text-sm text-[var(--eixo-danger)]">{deleteError}</p>}
                            <div className="mt-6 flex justify-end gap-3">
                                <button type="button" onClick={() => setDeleteConfirmId(null)} disabled={isDeleting}
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50">
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleDeleteConfirm} disabled={isDeleting}
                                    className="rounded-xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-4 py-2 text-sm font-semibold text-[var(--eixo-danger)] hover:bg-[rgba(184,66,50,0.12)] disabled:opacity-50">
                                    {isDeleting ? 'Excluindo...' : 'Excluir'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default FinanceModule;
