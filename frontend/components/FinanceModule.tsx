import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AccountCategory,
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
import {
    PlusIcon,
    LockIcon,
    FINANCIAL_PROGRESS_EVENT,
    FinanceTab,
    TAB_LABELS,
    groupByGroup,
} from './financeUtils';
import PlanoContasTab from './finance/PlanoContasTab';
import DreTab from './finance/DreTab';
import FluxoTab from './finance/FluxoTab';
import ContasTab from './finance/ContasTab';
import VisaoGeralTab from './finance/VisaoGeralTab';
import LancamentosTab from './finance/LancamentosTab';
import { useToasts, ToastHost } from './finance/useToasts';

interface FinanceModuleProps {
    farmId?: string | null;
    farmName?: string | null;
    isFreePlan?: boolean;
    onUpgradeRequest?: () => void;
    onboardingAction?: { action: 'SAIDA' | 'ENTRADA' | 'RESULTADO'; nonce: number } | null;
}

// Financeiro completo liberado para todos os planos
const LOCKED_TABS_FREE: FinanceTab[] = [];

// ── Componente principal ──────────────────────────────────────────────────────

const FinanceModule: React.FC<FinanceModuleProps> = ({ farmId, farmName, isFreePlan = false, onUpgradeRequest, onboardingAction }) => {
    const hoje = new Date();

    const { toasts, notify, dismiss } = useToasts();

    // ── Estado geral ──
    const [activeTab, setActiveTab] = useState<FinanceTab>('lancamentos');

    // ── Lançamentos (mensal) ──
    const [selectedMes, setSelectedMes] = useState(hoje.getMonth() + 1);
    const [selectedAno, setSelectedAno] = useState(hoje.getFullYear());
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

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

    useEffect(() => {
        if (!onboardingAction) return;
        if (onboardingAction.action === 'RESULTADO') {
            setActiveTab('dre');
            return;
        }
        setActiveTab('lancamentos');
        resetForm();
        setFormType(onboardingAction.action);
        setModalOpen(true);
    }, [onboardingAction?.nonce]);

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
            notify(editingTransaction ? 'Lançamento atualizado.' : 'Lançamento salvo.', 'success');
        } catch (e: any) {
            setFormError(e?.message || 'Erro ao salvar.');
            notify(e?.message || 'Erro ao salvar lançamento.', 'error');
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
            notify('Lançamento excluído.', 'success');
        } catch (e: any) {
            setDeleteError(e?.message || 'Erro ao excluir.');
            notify(e?.message || 'Erro ao excluir lançamento.', 'error');
        } finally { setIsDeleting(false); }
    };

    const handleMarkPaid = async (id: string) => {
        try {
            await updateTransaction(id, { status: 'PAGO' });
            await loadPending();
            await loadTransactions();
            window.dispatchEvent(new Event(FINANCIAL_PROGRESS_EVENT));
            notify('Conta marcada como paga.', 'success');
        } catch (e: any) {
            notify(e?.message || 'Erro ao marcar como paga.', 'error');
        }
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
                <LancamentosTab
                    transactions={transactions}
                    isLoading={isLoading}
                    loadError={loadError}
                    selectedMes={selectedMes}
                    setSelectedMes={setSelectedMes}
                    selectedAno={selectedAno}
                    setSelectedAno={setSelectedAno}
                    anos={anos}
                    onNew={() => { resetForm(); setModalOpen(true); }}
                    onEdit={openEditModal}
                    onDelete={(t) => { setDeleteError(null); setDeleteConfirmId(t.id); }}
                />
            )}

            {/* ── Aba: Visão Geral ─────────────────────────────────────────────── */}
            {activeTab === 'visao_geral' && (
                <VisaoGeralTab
                    transactions={transactions}
                    isLoading={isLoading}
                    loadError={loadError}
                    selectedMes={selectedMes}
                    setSelectedMes={setSelectedMes}
                    selectedAno={selectedAno}
                    setSelectedAno={setSelectedAno}
                    anos={anos}
                />
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
                    notify={notify}
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
                            <button type="button" aria-label="Fechar" onClick={() => { setModalOpen(false); resetForm(); }} className="rounded-full p-2 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--eixo-green)]">✕</button>
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

            <ToastHost toasts={toasts} onDismiss={dismiss} />
        </div>
    );
};

export default FinanceModule;
