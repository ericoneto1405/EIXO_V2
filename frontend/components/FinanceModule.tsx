import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AccountCategory,
    AccountCategoryType,
    CATEGORIA_LABELS,
    FinancialTransaction,
    TransactionCategoria,
    TransactionStatus,
    TransactionType,
    createAccountCategory,
    createTransaction,
    deleteAccountCategory,
    deleteTransaction,
    listAccountCategories,
    listTransactions,
    updateAccountCategory,
    updateTransaction,
} from '../adapters/financialApi';

interface FinanceModuleProps {
    farmId?: string | null;
    farmName?: string | null;
    isFreePlan?: boolean;
    onUpgradeRequest?: () => void;
}

// Nenhuma aba bloqueada no plano gratuito — Financeiro completo liberado
const LOCKED_TABS_FREE: FinanceTab[] = [];

// ── Ícones ────────────────────────────────────────────────────────────────────

const PlusIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
);

const LockIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

// ── Utilitários ───────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('pt-BR');
};

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ── Tipos de aba ──────────────────────────────────────────────────────────────

type FinanceTab = 'lancamentos' | 'contas_pagar' | 'contas_receber' | 'fluxo' | 'dre' | 'plano_contas';

const TAB_LABELS: Record<FinanceTab, string> = {
    lancamentos: 'Lançamentos',
    contas_pagar: 'Contas a Pagar',
    contas_receber: 'Contas a Receber',
    fluxo: 'Fluxo de Caixa',
    dre: 'DRE',
    plano_contas: 'Plano de Contas',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByGroup(cats: AccountCategory[]): Map<string, AccountCategory[]> {
    const map = new Map<string, AccountCategory[]>();
    for (const c of cats) {
        if (!map.has(c.group)) map.set(c.group, []);
        map.get(c.group)!.push(c);
    }
    return map;
}

function isVencida(t: FinancialTransaction): boolean {
    if (t.status === 'PAGO') return false;
    if (!t.vencimento) return false;
    return new Date(t.vencimento) < new Date();
}

function statusBadge(t: FinancialTransaction) {
    if (t.status === 'PAGO') return { label: 'Pago', cls: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' };
    if (isVencida(t)) return { label: 'Vencido', cls: 'bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]' };
    return { label: 'Pendente', cls: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite-dark)]' };
}

// ── Componente principal ──────────────────────────────────────────────────────

const FinanceModule: React.FC<FinanceModuleProps> = ({ farmId, farmName, isFreePlan = false, onUpgradeRequest }) => {
    const hoje = new Date();

    // ── Estado geral ──
    const [activeTab, setActiveTab] = useState<FinanceTab>('lancamentos');

    // ── Lançamentos (mensal) ──
    const [selectedMes, setSelectedMes] = useState(hoje.getMonth() + 1);
    const [selectedAno, setSelectedAno] = useState(hoje.getFullYear());
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ── Contas a Pagar / Receber ──
    const [pendingAll, setPendingAll] = useState<FinancialTransaction[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [cpFilter, setCpFilter] = useState<'todos' | 'pendente' | 'vencido'>('todos');
    const [crFilter, setCrFilter] = useState<'todos' | 'pendente' | 'vencido'>('todos');
    const [markingPaid, setMarkingPaid] = useState<string | null>(null);

    // ── Fluxo de Caixa / DRE (anual) ──
    const [annualTransactions, setAnnualTransactions] = useState<FinancialTransaction[]>([]);
    const [annualLoading, setAnnualLoading] = useState(false);
    const [selectedAnoAnual, setSelectedAnoAnual] = useState(hoje.getFullYear());

    // ── Categorias ──
    const [categories, setCategories] = useState<AccountCategory[]>([]);
    const [catLoading, setCatLoading] = useState(false);

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

    // ── Delete transação ──
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // ── Plano de Contas: nova categoria ──
    const [pcModalOpen, setPcModalOpen] = useState(false);
    const [pcFormName, setPcFormName] = useState('');
    const [pcFormGroup, setPcFormGroup] = useState('');
    const [pcFormNewGroup, setPcFormNewGroup] = useState('');
    const [pcFormType, setPcFormType] = useState<AccountCategoryType>('SAIDA');
    const [pcFormError, setPcFormError] = useState<string | null>(null);
    const [pcIsSaving, setPcIsSaving] = useState(false);

    // ── Plano de Contas: edição inline ──
    const [editingCatId, setEditingCatId] = useState<string | null>(null);
    const [editingCatName, setEditingCatName] = useState('');
    const [editingCatGroup, setEditingCatGroup] = useState('');
    const [editCatSaving, setEditCatSaving] = useState(false);

    // ── Plano de Contas: delete ──
    const [deleteCatConfirmId, setDeleteCatConfirmId] = useState<string | null>(null);
    const [isDeletingCat, setIsDeletingCat] = useState(false);
    const [deleteCatError, setDeleteCatError] = useState<string | null>(null);

    // ── Carregamento de dados ─────────────────────────────────────────────────

    const loadCategories = useCallback(async () => {
        if (!farmId) return;
        setCatLoading(true);
        try {
            const data = await listAccountCategories(farmId);
            setCategories(data);
        } catch { /* silencioso */ }
        finally { setCatLoading(false); }
    }, [farmId]);

    const loadTransactions = useCallback(async () => {
        if (!farmId) { setTransactions([]); return; }
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
        if (!farmId) { setPendingAll([]); return; }
        setPendingLoading(true);
        try {
            const data = await listTransactions(farmId);
            setPendingAll(data);
        } catch { /* silencioso */ }
        finally { setPendingLoading(false); }
    }, [farmId]);

    const loadAnnual = useCallback(async () => {
        if (!farmId) { setAnnualTransactions([]); return; }
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

    // ── Contas a Pagar / Receber derivadas ────────────────────────────────────

    const contasPagar = useMemo(() =>
        pendingAll.filter(t => t.type === 'SAIDA' && t.status !== 'PAGO'),
        [pendingAll]);

    const contasReceber = useMemo(() =>
        pendingAll.filter(t => t.type === 'ENTRADA' && t.status !== 'PAGO'),
        [pendingAll]);

    const applyFilter = (list: FinancialTransaction[], filter: 'todos' | 'pendente' | 'vencido') => {
        if (filter === 'vencido') return list.filter(isVencida);
        if (filter === 'pendente') return list.filter(t => !isVencida(t));
        return list;
    };

    // ── Fluxo de Caixa mensal ─────────────────────────────────────────────────

    const fluxoMensal = useMemo(() => {
        let acumulado = 0;
        return MESES.map((nomeMes, i) => {
            const mesNum = i + 1;
            const txMes = annualTransactions.filter(t => {
                const d = new Date(t.data);
                return d.getMonth() + 1 === mesNum;
            });
            const entradas = txMes.filter(t => t.type === 'ENTRADA').reduce((s, t) => s + t.valor, 0);
            const saidas = txMes.filter(t => t.type === 'SAIDA').reduce((s, t) => s + t.valor, 0);
            const resultado = entradas - saidas;
            acumulado += resultado;
            return { mes: nomeMes, mesAbrev: MESES_CURTOS[i], entradas, saidas, resultado, acumulado };
        });
    }, [annualTransactions]);

    const fluxoTotais = useMemo(() => {
        const entradas = fluxoMensal.reduce((s, m) => s + m.entradas, 0);
        const saidas = fluxoMensal.reduce((s, m) => s + m.saidas, 0);
        return { entradas, saidas, resultado: entradas - saidas };
    }, [fluxoMensal]);

    // ── DRE agrupada ──────────────────────────────────────────────────────────

    const dreData = useMemo(() => {
        // Receitas: ENTRADA agrupadas por grupo de categoria
        const receitas = new Map<string, number>();
        const despesas = new Map<string, number>();

        for (const t of annualTransactions) {
            const grp = t.accountCategoryGroup || t.accountCategoryName || CATEGORIA_LABELS[t.categoria] || 'Outros';
            if (t.type === 'ENTRADA') {
                receitas.set(grp, (receitas.get(grp) ?? 0) + t.valor);
            } else {
                despesas.set(grp, (despesas.get(grp) ?? 0) + t.valor);
            }
        }

        const totalReceitas = Array.from(receitas.values()).reduce((s, v) => s + v, 0);
        const totalDespesas = Array.from(despesas.values()).reduce((s, v) => s + v, 0);

        return {
            receitas: Array.from(receitas.entries()).sort((a, b) => b[1] - a[1]),
            despesas: Array.from(despesas.entries()).sort((a, b) => b[1] - a[1]),
            totalReceitas,
            totalDespesas,
            resultado: totalReceitas - totalDespesas,
        };
    }, [annualTransactions]);

    // ── Categorias filtradas por tipo ──────────────────────────────────────────

    const filteredCategories = useMemo(
        () => categories.filter(c => c.type === formType && c.isActive),
        [categories, formType],
    );

    useEffect(() => {
        const first = filteredCategories[0];
        setFormCategoryId(first?.id ?? '');
    }, [filteredCategories]);

    const existingGroups = useMemo(() => {
        const set = new Set(categories.filter(c => c.type === pcFormType).map(c => c.group));
        return Array.from(set).sort();
    }, [categories, pcFormType]);

    const pcResolvedGroup = pcFormGroup === '__new__' ? pcFormNewGroup.trim() : pcFormGroup;

    // ── Handlers: lançamentos ─────────────────────────────────────────────────

    const resetForm = () => {
        setFormType('ENTRADA');
        setFormValor('');
        setFormData(new Date().toISOString().slice(0, 10));
        setFormDescricao('');
        setFormStatus('PAGO');
        setFormVencimento('');
        setFormError(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!farmId) return;
        const valorNum = parseFloat(formValor.replace(',', '.'));
        if (isNaN(valorNum) || valorNum < 0) { setFormError('Informe um valor válido.'); return; }
        if (!formCategoryId) { setFormError('Selecione uma categoria.'); return; }
        setIsSaving(true);
        try {
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
            setModalOpen(false);
            resetForm();
            await loadTransactions();
            if (activeTab === 'contas_pagar' || activeTab === 'contas_receber') await loadPending();
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
        } catch (e: any) {
            setDeleteError(e?.message || 'Erro ao excluir.');
        } finally { setIsDeleting(false); }
    };

    const handleMarkPaid = async (id: string) => {
        setMarkingPaid(id);
        try {
            await updateTransaction(id, { status: 'PAGO' });
            await loadPending();
            await loadTransactions();
        } catch { /* silencioso */ }
        finally { setMarkingPaid(null); }
    };

    // ── Handlers: Plano de Contas ─────────────────────────────────────────────

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!farmId) return;
        if (!pcFormName.trim()) { setPcFormError('Informe o nome da categoria.'); return; }
        if (!pcResolvedGroup) { setPcFormError('Informe o grupo.'); return; }
        setPcIsSaving(true);
        try {
            await createAccountCategory({ farmId, name: pcFormName.trim(), group: pcResolvedGroup, type: pcFormType });
            setPcModalOpen(false);
            setPcFormName(''); setPcFormGroup(''); setPcFormNewGroup(''); setPcFormError(null);
            await loadCategories();
        } catch (e: any) {
            setPcFormError(e?.message || 'Erro ao criar categoria.');
        } finally { setPcIsSaving(false); }
    };

    const startEditCat = (cat: AccountCategory) => { setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatGroup(cat.group); };
    const cancelEditCat = () => { setEditingCatId(null); setEditingCatName(''); setEditingCatGroup(''); };

    const saveEditCat = async (cat: AccountCategory) => {
        if (!editingCatName.trim()) return;
        setEditCatSaving(true);
        try {
            await updateAccountCategory(cat.id, { name: editingCatName.trim(), group: editingCatGroup.trim() || cat.group });
            cancelEditCat();
            await loadCategories();
        } catch { /* silencioso */ }
        finally { setEditCatSaving(false); }
    };

    const toggleCatActive = async (cat: AccountCategory) => {
        try { await updateAccountCategory(cat.id, { isActive: !cat.isActive }); await loadCategories(); }
        catch { /* silencioso */ }
    };

    const handleDeleteCat = async () => {
        if (!deleteCatConfirmId) return;
        setIsDeletingCat(true);
        setDeleteCatError(null);
        try {
            await deleteAccountCategory(deleteCatConfirmId);
            setDeleteCatConfirmId(null);
            await loadCategories();
        } catch (e: any) {
            setDeleteCatError(e?.message || 'Erro ao excluir categoria.');
        } finally { setIsDeletingCat(false); }
    };

    // ── Estilos recorrentes ───────────────────────────────────────────────────

    const anos = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];
    const activeTabCls = 'bg-[var(--eixo-green)] text-white font-bold';
    const inactiveTabCls = 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]';
    const inputCls = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none';
    const labelCls = 'block text-sm font-medium text-[var(--eixo-text)]';

    const getCatLabel = (t: FinancialTransaction) =>
        t.accountCategoryName || CATEGORIA_LABELS[t.categoria] || t.categoria;

    // ── Componente de filtro de status ────────────────────────────────────────

    const FilterPill: React.FC<{
        active: boolean;
        onClick: () => void;
        children: React.ReactNode;
    }> = ({ active, onClick, children }) => (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-[var(--eixo-green)] text-white' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]'}`}
        >
            {children}
        </button>
    );

    // ── Aba CP/CR compartilhada ───────────────────────────────────────────────

    const renderContasTab = (tipo: 'pagar' | 'receber') => {
        const lista = tipo === 'pagar' ? contasPagar : contasReceber;
        const filter = tipo === 'pagar' ? cpFilter : crFilter;
        const setFilter = tipo === 'pagar' ? setCpFilter : setCrFilter;
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
                        <p className={`mt-2 font-brand text-2xl font-black ${corTotal}`}>{formatCurrency(totalPendente)}</p>
                    </div>
                    <div className="rounded-2xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-danger)]">Vencidos</p>
                        <p className="mt-2 font-brand text-2xl font-black text-[var(--eixo-danger)]">{formatCurrency(totalVencido)}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite-dark)]">A vencer</p>
                        <p className="mt-2 font-brand text-2xl font-black text-[var(--eixo-graphite-dark)]">{formatCurrency(totalAVencer)}</p>
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

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite-dark)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            {farmName || 'Fazenda'}
                        </div>
                        <h2 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Financeiro</h2>
                    </div>
                    {activeTab === 'lancamentos' && (
                        <button
                            type="button"
                            onClick={() => { resetForm(); setModalOpen(true); }}
                            className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-brand font-bold text-white shadow-md transition-colors hover:bg-[var(--eixo-green-dark)]"
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
                            className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-brand font-bold text-white shadow-md transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            <PlusIcon className="h-[18px] w-[18px]" />
                            <span className="ml-2">Nova conta</span>
                        </button>
                    )}
                    {activeTab === 'plano_contas' && (
                        <button
                            type="button"
                            onClick={() => { setPcFormName(''); setPcFormGroup(''); setPcFormNewGroup(''); setPcFormType('SAIDA'); setPcFormError(null); setPcModalOpen(true); }}
                            className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-brand font-bold text-white shadow-md transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            <PlusIcon className="h-[18px] w-[18px]" />
                            <span className="ml-2">Nova categoria</span>
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

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Entradas</p>
                            <p className="mt-2 font-brand text-3xl font-black text-[var(--eixo-success)]">{formatCurrency(summary.entradas)}</p>
                        </div>
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Saídas</p>
                            <p className="mt-2 font-brand text-3xl font-black text-[var(--eixo-danger)]">{formatCurrency(summary.saidas)}</p>
                        </div>
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Saldo</p>
                            <p className={`mt-2 font-brand text-3xl font-black ${summary.saldo >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                {formatCurrency(summary.saldo)}
                            </p>
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
                                        <th className="px-4 py-2.5 text-right">Valor</th>
                                        <th className="px-4 py-2.5 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[var(--eixo-text-muted)]">Carregando...</td></tr>
                                    ) : transactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-10 text-center">
                                                <p className="text-base font-semibold text-[var(--eixo-text)]">Nenhum lançamento neste período</p>
                                                <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Use o botão "Novo lançamento" para começar.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        transactions.map(t => (
                                            <tr key={t.id} className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface)]">
                                                <td className="px-4 py-3">{formatDate(t.data)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.type === 'ENTRADA' ? 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' : 'bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]'}`}>
                                                        {t.type === 'ENTRADA' ? 'Entrada' : 'Saída'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-medium text-[var(--eixo-text)]">{getCatLabel(t)}</td>
                                                <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{t.accountCategoryGroup || '—'}</td>
                                                <td className="px-4 py-3 text-[var(--eixo-text-muted)]">{t.descricao || '—'}</td>
                                                <td className={`px-4 py-3 text-right font-semibold ${t.type === 'ENTRADA' ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                                    {t.type === 'SAIDA' ? '− ' : '+ '}{formatCurrency(t.valor)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {(t.herdEventId || t.sanitaryRecordId) ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-[var(--eixo-text-muted)]"><LockIcon /> auto</span>
                                                    ) : (
                                                        <button type="button"
                                                            onClick={() => { setDeleteError(null); setDeleteConfirmId(t.id); }}
                                                            className="rounded-lg border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-3 py-1 text-xs font-semibold text-[var(--eixo-danger)] hover:bg-[rgba(184,66,50,0.12)]">
                                                            Excluir
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ── Aba: Contas a Pagar ───────────────────────────────────────────── */}
            {activeTab === 'contas_pagar' && renderContasTab('pagar')}

            {/* ── Aba: Contas a Receber ─────────────────────────────────────────── */}
            {activeTab === 'contas_receber' && renderContasTab('receber')}

            {/* ── Aba: Fluxo de Caixa ──────────────────────────────────────────── */}
            {activeTab === 'fluxo' && (
                <>
                    {/* Seletor de ano */}
                    <div className="flex items-center gap-3">
                        <select
                            value={selectedAnoAnual}
                            onChange={e => setSelectedAnoAnual(Number(e.target.value))}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                        >
                            {anos.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {annualLoading && <span className="text-sm text-[var(--eixo-text-muted)]">Carregando...</span>}
                    </div>

                    {/* Tabela mensal */}
                    <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-[var(--eixo-text-muted)]">
                                <thead className="bg-[var(--eixo-surface-soft)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                                    <tr>
                                        <th className="px-5 py-3 text-left">Mês</th>
                                        <th className="px-5 py-3 text-right">Entradas</th>
                                        <th className="px-5 py-3 text-right">Saídas</th>
                                        <th className="px-5 py-3 text-right">Resultado</th>
                                        <th className="px-5 py-3 text-right">Saldo Acumulado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fluxoMensal.map((m, i) => {
                                        const temDados = m.entradas > 0 || m.saidas > 0;
                                        return (
                                            <tr key={i} className={`border-b border-[var(--eixo-border)] transition-colors ${temDados ? 'bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface)]' : 'bg-[var(--eixo-surface-soft)]'}`}>
                                                <td className={`px-5 py-3 font-semibold ${temDados ? 'text-[var(--eixo-text)]' : 'text-[var(--eixo-text-soft)]'}`}>{m.mes}</td>
                                                <td className="px-5 py-3 text-right text-[var(--eixo-success)]">
                                                    {m.entradas > 0 ? formatCurrency(m.entradas) : <span className="text-[var(--eixo-text-soft)]">—</span>}
                                                </td>
                                                <td className="px-5 py-3 text-right text-[var(--eixo-danger)]">
                                                    {m.saidas > 0 ? formatCurrency(m.saidas) : <span className="text-[var(--eixo-text-soft)]">—</span>}
                                                </td>
                                                <td className={`px-5 py-3 text-right font-semibold ${m.resultado > 0 ? 'text-[var(--eixo-success)]' : m.resultado < 0 ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-text-soft)]'}`}>
                                                    {temDados ? formatCurrency(m.resultado) : <span className="text-[var(--eixo-text-soft)]">—</span>}
                                                </td>
                                                <td className={`px-5 py-3 text-right font-bold ${m.acumulado > 0 ? 'text-[var(--eixo-success)]' : m.acumulado < 0 ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-text-soft)]'}`}>
                                                    {formatCurrency(m.acumulado)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)]">
                                        <td className="px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Total {selectedAnoAnual}</td>
                                        <td className="px-5 py-3 text-right font-bold text-[var(--eixo-success)]">{formatCurrency(fluxoTotais.entradas)}</td>
                                        <td className="px-5 py-3 text-right font-bold text-[var(--eixo-danger)]">{formatCurrency(fluxoTotais.saidas)}</td>
                                        <td className={`px-5 py-3 text-right font-black ${fluxoTotais.resultado >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                            {formatCurrency(fluxoTotais.resultado)}
                                        </td>
                                        <td className="px-5 py-3" />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ── Aba: DRE ─────────────────────────────────────────────────────── */}
            {activeTab === 'dre' && (
                <>
                    {/* Seletor de ano */}
                    <div className="flex items-center gap-3">
                        <select
                            value={selectedAnoAnual}
                            onChange={e => setSelectedAnoAnual(Number(e.target.value))}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                        >
                            {anos.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {annualLoading && <span className="text-sm text-[var(--eixo-text-muted)]">Carregando...</span>}
                    </div>

                    {annualTransactions.length === 0 && !annualLoading ? (
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-10 text-center">
                            <p className="font-semibold text-[var(--eixo-text)]">Sem lançamentos em {selectedAnoAnual}</p>
                            <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Registre entradas e saídas na aba Lançamentos.</p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                            {/* Receitas */}
                            <div className="border-b-2 border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-5 py-3">
                                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-success)]">Receitas Operacionais</span>
                            </div>
                            {dreData.receitas.map(([grp, val]) => (
                                <div key={grp} className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-3 hover:bg-[var(--eixo-surface)]">
                                    <span className="text-sm text-[var(--eixo-text)]">{grp}</span>
                                    <span className="font-semibold text-[var(--eixo-success)]">{formatCurrency(val)}</span>
                                </div>
                            ))}
                            <div className="flex items-center justify-between border-b-2 border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-5 py-3">
                                <span className="font-bold text-[var(--eixo-text)]">Total de Receitas</span>
                                <span className="font-black text-[var(--eixo-success)]">{formatCurrency(dreData.totalReceitas)}</span>
                            </div>

                            {/* Despesas */}
                            <div className="mt-1 border-b border-[var(--eixo-border)] bg-[rgba(184,66,50,0.08)] px-5 py-3">
                                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-danger)]">Despesas Operacionais</span>
                            </div>
                            {dreData.despesas.map(([grp, val]) => (
                                <div key={grp} className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-3 hover:bg-[var(--eixo-surface)]">
                                    <span className="text-sm text-[var(--eixo-text)]">{grp}</span>
                                    <span className="font-semibold text-[var(--eixo-danger)]">{formatCurrency(val)}</span>
                                </div>
                            ))}
                            <div className="flex items-center justify-between border-b-2 border-[var(--eixo-border)] bg-[rgba(184,66,50,0.08)] px-5 py-3">
                                <span className="font-bold text-[var(--eixo-text)]">Total de Despesas</span>
                                <span className="font-black text-[var(--eixo-danger)]">{formatCurrency(dreData.totalDespesas)}</span>
                            </div>

                            {/* Resultado */}
                            <div className={`flex items-center justify-between px-5 py-5 ${dreData.resultado >= 0 ? 'bg-[var(--eixo-green-soft)]' : 'bg-[rgba(184,66,50,0.08)]'}`}>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Resultado do Exercício</p>
                                    <p className="mt-1 text-lg font-extrabold text-[var(--eixo-text)]">{selectedAnoAnual}</p>
                                </div>
                                <span className={`font-brand text-3xl font-black ${dreData.resultado >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                    {formatCurrency(dreData.resultado)}
                                </span>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ── Aba: Plano de Contas ──────────────────────────────────────────── */}
            {activeTab === 'plano_contas' && (
                <div className="space-y-5">
                    {catLoading ? (
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-10 text-center text-sm text-[var(--eixo-text-muted)]">Carregando categorias...</div>
                    ) : (
                        (['ENTRADA', 'SAIDA'] as AccountCategoryType[]).map(tipo => {
                            const catsTipo = categories.filter(c => c.type === tipo);
                            if (catsTipo.length === 0) return null;
                            const grouped = groupByGroup(catsTipo);
                            return (
                                <div key={tipo} className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                                    <div className={`flex items-center gap-2 border-b border-[var(--eixo-border)] px-5 py-3 ${tipo === 'ENTRADA' ? 'bg-[var(--eixo-green-soft)]' : 'bg-[rgba(184,66,50,0.08)]'}`}>
                                        <span className={`h-2 w-2 rounded-full ${tipo === 'ENTRADA' ? 'bg-[var(--eixo-success)]' : 'bg-[var(--eixo-danger)]'}`} />
                                        <span className={`font-brand text-sm font-bold ${tipo === 'ENTRADA' ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                            {tipo === 'ENTRADA' ? 'Entradas' : 'Saídas'}
                                        </span>
                                        <span className="ml-1 text-xs text-[var(--eixo-text-muted)]">({catsTipo.length} categorias)</span>
                                    </div>
                                    {Array.from(grouped.entries()).map(([grp, cats]) => (
                                        <div key={grp}>
                                            <div className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-5 py-1.5">
                                                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">{grp}</span>
                                            </div>
                                            {cats.map((cat, idx) => (
                                                <div key={cat.id}
                                                    className={`flex items-center gap-3 px-5 py-3 ${idx < cats.length - 1 ? 'border-b border-[var(--eixo-border)]' : ''} ${!cat.isActive ? 'opacity-50' : ''}`}
                                                >
                                                    {cat.isSystem ? (
                                                        <span className="flex-shrink-0 text-[var(--eixo-text-muted)]"><LockIcon /></span>
                                                    ) : (
                                                        <span className="flex-shrink-0 h-3.5 w-3.5" />
                                                    )}
                                                    {editingCatId === cat.id ? (
                                                        <div className="flex flex-1 flex-wrap items-center gap-2">
                                                            <input type="text" value={editingCatName} onChange={e => setEditingCatName(e.target.value)}
                                                                className="w-40 rounded-lg border border-[var(--eixo-green)] bg-[var(--eixo-surface)] px-2 py-1 text-sm focus:outline-none" />
                                                            <input type="text" value={editingCatGroup} onChange={e => setEditingCatGroup(e.target.value)} placeholder="Grupo"
                                                                className="w-32 rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1 text-sm focus:outline-none" />
                                                            <button type="button" disabled={editCatSaving} onClick={() => saveEditCat(cat)}
                                                                className="rounded-lg bg-[var(--eixo-green)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--eixo-green-dark)] disabled:opacity-50">
                                                                {editCatSaving ? 'Salvando...' : 'Salvar'}
                                                            </button>
                                                            <button type="button" onClick={cancelEditCat}
                                                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-1 items-center gap-2">
                                                            <span className="text-sm font-medium text-[var(--eixo-text)]">{cat.name}</span>
                                                            {!cat.isActive && (
                                                                <span className="rounded-full bg-[var(--eixo-surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--eixo-text-muted)]">inativa</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {!cat.isSystem && editingCatId !== cat.id && (
                                                        <div className="ml-auto flex items-center gap-2">
                                                            <button type="button" onClick={() => startEditCat(cat)}
                                                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">Editar</button>
                                                            <button type="button" onClick={() => toggleCatActive(cat)}
                                                                className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                                                {cat.isActive ? 'Desativar' : 'Ativar'}
                                                            </button>
                                                            <button type="button" onClick={() => { setDeleteCatError(null); setDeleteCatConfirmId(cat.id); }}
                                                                className="rounded-lg border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-3 py-1 text-xs font-semibold text-[var(--eixo-danger)] hover:bg-[rgba(184,66,50,0.12)]">
                                                                Excluir
                                                            </button>
                                                        </div>
                                                    )}
                                                    {cat.isSystem && editingCatId !== cat.id && (
                                                        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">Sistema</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── Modal: Novo lançamento ────────────────────────────────────────── */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModalOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-[var(--eixo-surface)] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <header className="flex items-center justify-between border-b border-[var(--eixo-border)] p-5">
                            <h3 className="font-brand text-lg font-bold text-[var(--eixo-text)]">Novo lançamento</h3>
                            <button type="button" onClick={() => setModalOpen(false)} className="rounded-full p-2 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]">✕</button>
                        </header>
                        <form onSubmit={handleSave} className="space-y-4 p-6">
                            {/* Tipo */}
                            <div>
                                <label className={labelCls}>Tipo</label>
                                <select value={formType} onChange={e => setFormType(e.target.value as TransactionType)} className={inputCls}>
                                    <option value="ENTRADA">Entrada</option>
                                    <option value="SAIDA">Saída</option>
                                </select>
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
                                <button type="button" onClick={() => setModalOpen(false)}
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isSaving || filteredCategories.length === 0}
                                    className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--eixo-green-dark)] disabled:opacity-50">
                                    {isSaving ? 'Salvando...' : 'Salvar'}
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

            {/* ── Modal: Nova categoria (Plano de Contas) ───────────────────────── */}
            {pcModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPcModalOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-[var(--eixo-surface)] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <header className="flex items-center justify-between border-b border-[var(--eixo-border)] p-5">
                            <h3 className="font-brand text-lg font-bold text-[var(--eixo-text)]">Nova categoria</h3>
                            <button type="button" onClick={() => setPcModalOpen(false)} className="rounded-full p-2 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]">✕</button>
                        </header>
                        <form onSubmit={handleCreateCategory} className="space-y-4 p-6">
                            <div>
                                <label className={labelCls}>Tipo</label>
                                <select value={pcFormType} onChange={e => setPcFormType(e.target.value as AccountCategoryType)} className={inputCls}>
                                    <option value="ENTRADA">Entrada</option>
                                    <option value="SAIDA">Saída</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Grupo</label>
                                <select value={pcFormGroup} onChange={e => { setPcFormGroup(e.target.value); setPcFormNewGroup(''); }} className={inputCls} required>
                                    <option value="">Selecione um grupo...</option>
                                    {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                    <option value="__new__">+ Novo grupo...</option>
                                </select>
                                {pcFormGroup === '__new__' && (
                                    <input type="text" value={pcFormNewGroup} onChange={e => setPcFormNewGroup(e.target.value)}
                                        placeholder="Nome do novo grupo" className={`${inputCls} mt-2`} autoFocus required />
                                )}
                            </div>
                            <div>
                                <label className={labelCls}>Nome da categoria</label>
                                <input type="text" value={pcFormName} onChange={e => setPcFormName(e.target.value)}
                                    placeholder="Ex: Arrendamento de Pasto" className={inputCls} required />
                            </div>
                            {pcFormError && <p className="text-sm text-[var(--eixo-danger)]">{pcFormError}</p>}
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setPcModalOpen(false)}
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={pcIsSaving}
                                    className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--eixo-green-dark)] disabled:opacity-50">
                                    {pcIsSaving ? 'Salvando...' : 'Criar categoria'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: Confirmar exclusão de categoria ────────────────────────── */}
            {deleteCatConfirmId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
                        <div className="p-6">
                            <h3 className="font-brand text-lg font-bold text-[var(--eixo-text)]">Excluir categoria</h3>
                            <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                                Lançamentos existentes não serão afetados, mas a categoria não estará disponível para novos lançamentos.
                            </p>
                            {deleteCatError && <p className="mt-3 text-sm text-[var(--eixo-danger)]">{deleteCatError}</p>}
                            <div className="mt-6 flex justify-end gap-3">
                                <button type="button" onClick={() => setDeleteCatConfirmId(null)} disabled={isDeletingCat}
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50">
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleDeleteCat} disabled={isDeletingCat}
                                    className="rounded-xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-4 py-2 text-sm font-semibold text-[var(--eixo-danger)] hover:bg-[rgba(184,66,50,0.12)] disabled:opacity-50">
                                    {isDeletingCat ? 'Excluindo...' : 'Excluir'}
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
