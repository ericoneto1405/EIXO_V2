import ModuleHeader from './ModuleHeader';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AccountCategory,
    FinancialTransaction,
    FinancialAllocationDetails,
    FinancialAllocationInput,
    getTransactionAllocations,
    TransactionCategoria,
    TransactionStatus,
    TransactionType,
    createTransaction,
    deleteTransaction,
    listAccountCategories,
    listTransactions,
    updateTransaction,
} from '../adapters/financialApi';
import { HerdLot, listLots } from '../adapters/herdApi';
import { AuctionAnimalListItem, getPlantel } from '../adapters/auctionApi';
import { buildApiUrl } from '../api';
import { Paddock } from '../types';
import {
    PlusIcon,
    LockIcon,
    FINANCIAL_PROGRESS_EVENT,
    FinanceTab,
    TAB_LABELS,
    CATTLE_SALE_CATEGORY_NAMES,
    CATTLE_PURCHASE_CATEGORY_NAMES,
    normalizeSearchText,
    localDateInput,
    formatCurrency,
    formatDate,
} from './financeUtils';
import FinanceDialog from './finance/FinanceDialog';
import PlanoContasTab from './finance/PlanoContasTab';
import DreTab from './finance/DreTab';
import FluxoTab from './finance/FluxoTab';
import ContasTab from './finance/ContasTab';
import VisaoGeralTab from './finance/VisaoGeralTab';
import CategoryPicker from './finance/CategoryPicker';
import AnalyticsTab from './finance/AnalyticsTab';
import DataQualityTab from './finance/DataQualityTab';
import { useToasts, ToastHost } from './finance/useToasts';

interface FinanceModuleProps {
    userId: string;
    farmId?: string | null;
    farmName?: string | null;
    isFreePlan?: boolean;
    onUpgradeRequest?: () => void;
    onboardingAction?: { action: 'SAIDA' | 'ENTRADA' | 'RESULTADO'; nonce: number } | null;
}

// Anotar é de graça, entender custa: o plano gratuito lança, concilia e vê o
// saldo; DRE, fluxo, analytics e qualidade do dado são do EIXO Gestão em diante.
const LOCKED_TABS_FREE: FinanceTab[] = ['dre', 'fluxo', 'analytics', 'quality'];

// ── Componente principal ──────────────────────────────────────────────────────

const FinanceModule: React.FC<FinanceModuleProps> = ({ userId, farmId, farmName, isFreePlan = false, onUpgradeRequest, onboardingAction }) => {
    const hoje = new Date();

    const { toasts, notify, dismiss } = useToasts();

    // ── Estado geral ──
    const [activeTab, setActiveTab] = useState<FinanceTab>('visao_geral');

    // ── Lançamentos (mensal) ──
    const [selectedMes, setSelectedMes] = useState(hoje.getMonth() + 1);
    const [selectedAno, setSelectedAno] = useState(hoje.getFullYear());
    const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ── Contas a Pagar / Receber ──
    const [pendingAll, setPendingAll] = useState<FinancialTransaction[]>([]);
    const [pendingLoading, setPendingLoading] = useState(true);
    const [pendingError, setPendingError] = useState<string | null>(null);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [settlingTransaction, setSettlingTransaction] = useState<FinancialTransaction | null>(null);
    const [settlementDate, setSettlementDate] = useState(localDateInput());
    const [settlementError, setSettlementError] = useState<string | null>(null);
    const [settlementUnknown, setSettlementUnknown] = useState(false);
    const [isSettling, setIsSettling] = useState(false);
    const [discardRequested, setDiscardRequested] = useState(false);
    const discardPanel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!discardRequested) return;
        discardPanel.current?.scrollIntoView({ block: 'nearest' });
        discardPanel.current?.querySelector('button')?.focus();
    }, [discardRequested]);
    const [formDirty, setFormDirty] = useState(false);
    const [destinationError, setDestinationError] = useState<string | null>(null);
    const [destinationAttempt, setDestinationAttempt] = useState(0);
    const [accountsSearch, setAccountsSearch] = useState('');
    const [accountsPeriod, setAccountsPeriod] = useState<{ from: string; to: string } | undefined>();
    const [transactionContext, setTransactionContext] = useState('');
    const monthlyContext = `${farmId}:${selectedAno}:${selectedMes}`;
    const currentMonthlyContext = useRef(monthlyContext);
    currentMonthlyContext.current = monthlyContext;
    const categoryRequest = useRef(0);
    const transactionRequest = useRef(0);
    const pendingRequest = useRef(0);
    useEffect(() => () => { categoryRequest.current++; transactionRequest.current++; pendingRequest.current++; }, []);

    const [selectedAnoAnual, setSelectedAnoAnual] = useState(hoje.getFullYear());

    // ── Categorias ──
    const [categories, setCategories] = useState<AccountCategory[]>([]);
    const [catLoading, setCatLoading] = useState(true);
    // Sinal pra abrir "Nova categoria" no Plano de Contas quando não existe
    // nenhuma categoria ativa pro tipo escolhido no Novo Lançamento.
    const [planoContasCreateSignal, setPlanoContasCreateSignal] = useState<{ type: TransactionType; nonce: number } | null>(null);

    // ── Modal novo lançamento ──
    const [modalOpen, setModalOpen] = useState(false);
    const [formType, setFormType] = useState<TransactionType>('ENTRADA');
    const [formCategoryId, setFormCategoryId] = useState<string>('');
    const [formValor, setFormValor] = useState('');
    const [formData, setFormData] = useState(localDateInput(hoje));
    const [formSettledAt, setFormSettledAt] = useState(localDateInput(hoje));
    const [formDescricao, setFormDescricao] = useState('');
    const [formStatus, setFormStatus] = useState<TransactionStatus>('PAGO');
    const [formVencimento, setFormVencimento] = useState('');
    const [allocationRows, setAllocationRows] = useState<Array<{ lotId: string; paddockId: string; animalId: string; percent: string; amount?: string; productionPhase?: FinancialAllocationInput['productionPhase']; lotName?: string; paddockName?: string; animalLabel?: string }>>([]);
    const [availableLots, setAvailableLots] = useState<HerdLot[]>([]);
    const [availablePaddocks, setAvailablePaddocks] = useState<Paddock[]>([]);
    const [availableAuctionAnimals, setAvailableAuctionAnimals] = useState<AuctionAnimalListItem[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // ── Edição de lançamento ──
    const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
    const [allocationDetails, setAllocationDetails] = useState<FinancialAllocationDetails | null>(null);
    const [allocationLoading, setAllocationLoading] = useState(false);
    const [allocationError, setAllocationError] = useState<string | null>(null);
    const [allocationAttempt, setAllocationAttempt] = useState(0);
    const [allocationsChanged, setAllocationsChanged] = useState(false);
    const readOnlyTransaction = !!(editingTransaction?.herdEventId || editingTransaction?.sanitaryRecordId);
    const canEditAllocations = !editingTransaction || !!allocationDetails?.editable;
    useEffect(() => {
        if (!modalOpen || !editingTransaction) return;
        let active = true;
        setAllocationLoading(true);
        setAllocationError(null);
        setAllocationDetails(null);
        getTransactionAllocations(editingTransaction.id).then((details) => {
            if (!active) return;
            setAllocationDetails(details);
            setAllocationRows(details.allocations.map((item) => ({
                lotId: item.lotId || '', paddockId: item.paddockId || '', animalId: item.animalId || '',
                amount: item.amount.toFixed(2), percent: '', productionPhase: item.productionPhase || undefined,
                lotName: item.lotName || undefined, paddockName: item.paddockName || undefined, animalLabel: item.animalLabel || undefined,
            })));
            setAllocationsChanged(false);
        }).catch((error) => { if (active) setAllocationError(error?.message || 'Não foi possível consultar a distribuição.'); })
          .finally(() => { if (active) setAllocationLoading(false); });
        return () => { active = false; };
    }, [modalOpen, editingTransaction?.id, allocationAttempt]);

    // ── Delete transação ──
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // ── Carregamento de dados ─────────────────────────────────────────────────

    const loadCategories = useCallback(async () => {
        if (!farmId) { setCatLoading(false); return; }
        const request = ++categoryRequest.current;
        setCatLoading(true);
        setCategoryError(null);
        setCategories([]);
        try {
            const data = await listAccountCategories(farmId);
            if (request === categoryRequest.current) setCategories(data);
        } catch (error: any) { if (request === categoryRequest.current) setCategoryError(error?.message || 'Não foi possível carregar as categorias.'); }
        finally { if (request === categoryRequest.current) setCatLoading(false); }
    }, [farmId]);

    const loadTransactions = useCallback(async () => {
        if (!farmId) { setTransactions([]); setIsLoading(false); return; }
        const request = ++transactionRequest.current;
        setTransactions([]);
        setIsLoading(true);
        setLoadError(null);
        try {
            const data = await listTransactions(farmId, selectedMes, selectedAno);
            if (request === transactionRequest.current && currentMonthlyContext.current === monthlyContext) { setTransactions(data); setTransactionContext(monthlyContext); }
        } catch (e: any) {
            if (request === transactionRequest.current && currentMonthlyContext.current === monthlyContext) { setLoadError(e?.message || 'Erro ao carregar transações.'); setTransactionContext(monthlyContext); }
        } finally { if (request === transactionRequest.current && currentMonthlyContext.current === monthlyContext) setIsLoading(false); }
    }, [farmId, selectedMes, selectedAno]);

    // Contas a Pagar/Receber mostram o histórico completo (pago e pendente),
    // não só o que está em aberto — por isso busca tudo, sem filtro de status.
    const loadPending = useCallback(async () => {
        if (!farmId) { setPendingAll([]); setPendingLoading(false); return; }
        const request = ++pendingRequest.current;
        setPendingAll([]);
        setPendingError(null);
        setPendingLoading(true);
        try {
            const data = await listTransactions(farmId);
            if (request === pendingRequest.current) setPendingAll(data);
        } catch (error: any) { if (request === pendingRequest.current) setPendingError(error?.message || 'Não foi possível carregar as contas.'); }
        finally { if (request === pendingRequest.current) setPendingLoading(false); }
    }, [farmId]);

    useEffect(() => { loadTransactions(); }, [loadTransactions]);
    // Categorias só fazem falta no Plano de Contas e no formulário de novo
    // lançamento - nas outras abas (Visão Geral, DRE, etc.) ninguém usa.
    useEffect(() => {
        if (activeTab === 'plano_contas' || modalOpen) loadCategories();
    }, [activeTab, modalOpen, loadCategories]);
    useEffect(() => {
        if (!modalOpen || !farmId) return;
        let active = true;
        setAvailableLots([]); setAvailablePaddocks([]); setAvailableAuctionAnimals([]);
        setDestinationError(null);
        listLots(farmId, 'COMMERCIAL').then((items) => { if (active) setAvailableLots(items); }).catch(() => { if (active) setDestinationError('Não foi possível carregar todos os destinos.'); });
        fetch(buildApiUrl(`/pastos?farmId=${farmId}`), { credentials: 'include' })
            .then(async (response) => { if (!response.ok) throw new Error('Falha ao carregar pastos.'); return response.json(); })
            .then((payload) => { if (active) setAvailablePaddocks(payload.items || []); })
            .catch(() => { if (active) setDestinationError('Não foi possível carregar todos os destinos.'); });
        // A lista de Meus Leilões pode ser indisponível conforme o plano.
        getPlantel(farmId).then((plantel) => { if (active) setAvailableAuctionAnimals(plantel.items); }).catch(() => {});
        return () => { active = false; };
    }, [modalOpen, farmId, destinationAttempt]);
    useEffect(() => {
        if (activeTab === 'contas_pagar' || activeTab === 'contas_receber') loadPending();
    }, [activeTab, loadPending]);

    // ── Sumário mensal ────────────────────────────────────────────────────────



    // ── Categorias filtradas por tipo ──────────────────────────────────────────

    // Compra/venda de animal precisa passar pelo Manejo do Rebanho (é lá que o
    // animal entra ou sai do rebanho) — por isso essas categorias não aparecem
    // pra escolha manual aqui, evitando lançar sem atualizar o rebanho.
    const filteredCategories = useMemo(
        () => categories.filter(c => {
            const normalizedName = normalizeSearchText(c.name);
            return c.type === formType
                && c.isActive
                && c.isConfigured
                && !c.deprecatedAt
                && !CATTLE_SALE_CATEGORY_NAMES.has(normalizedName)
                && !CATTLE_PURCHASE_CATEGORY_NAMES.has(normalizedName);
        }),
        [categories, formType],
    );

    useEffect(() => {
        // Não mexe na categoria enquanto está editando um lançamento existente —
        // senão troca a categoria certa pela primeira da lista sem avisar.
        if (editingTransaction) return;
        setFormCategoryId('');
    }, [formType, editingTransaction]);

    // ── Handlers: lançamentos ─────────────────────────────────────────────────

    const resetForm = () => {
        setEditingTransaction(null);
        setFormType('ENTRADA');
        setFormValor('');
        setFormData(localDateInput());
        setFormSettledAt(localDateInput());
        setFormDescricao('');
        setFormStatus('PAGO');
        setFormVencimento('');
        setAllocationRows([]);
        setAllocationsChanged(false);
        setAllocationDetails(null);
        setAllocationLoading(false);
        setAllocationError(null);
        setFormCategoryId('');
        setFormError(null);
        setDiscardRequested(false);
        setFormDirty(false);
    };

    const openEditModal = (t: FinancialTransaction) => {
        setEditingTransaction(t);
        setAllocationRows([]);
        setAllocationsChanged(false);
        setAllocationDetails(null);
        setAllocationLoading(true);
        setAllocationError(null);
        setFormDirty(false);
        setFormType(t.type);
        setFormValor(String(t.valor));
        setFormData(t.data.slice(0, 10));
        setFormSettledAt((t.settledAt || t.data).slice(0, 10));
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
            if (isFreePlan) { onUpgradeRequest?.(); return; }
            setActiveTab('dre');
            return;
        }
        setActiveTab(onboardingAction.action === 'SAIDA' ? 'contas_pagar' : 'contas_receber');
    }, [onboardingAction?.nonce, isFreePlan]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!farmId || isSaving || readOnlyTransaction || (editingTransaction && (allocationLoading || !allocationDetails || allocationError))) return;
        const valorNum = parseFloat(formValor.replace(',', '.'));
        if (isNaN(valorNum) || valorNum <= 0) { setFormError('Informe um valor maior que zero.'); return; }
        if (!filteredCategories.some((category) => category.id === formCategoryId)) { setFormError('Selecione uma categoria ativa e configurada.'); return; }
        if (allocationsChanged && allocationRows.some((row) => (row.lotName && !row.lotId) || (row.paddockName && !row.paddockId) || (row.animalLabel && !row.animalId))) { setFormError('Um destino histórico foi removido. Escolha um destino atual ou remova essa divisão antes de salvar.'); return; }
        if ((!editingTransaction || allocationsChanged) && allocationRows.some((row) => !(row.lotId || row.paddockId || row.animalId || row.productionPhase) || !(Number(row.amount ?? row.percent) > 0))) { setFormError('Informe um destino e um percentual válido em cada divisão.'); return; }
        if (!editingTransaction && allocationRows.reduce((sum, row) => sum + Number(row.percent || 0), 0) > 100.000001) { setFormError('A soma das divisões não pode superar 100%.'); return; }
        if (Math.round(allocationAmount * 100) > Math.round(valorNum * 100)) { setFormError('A soma das divisões supera o valor do lançamento. Ajuste a distribuição.'); return; }
        setIsSaving(true);
        try {
            if (editingTransaction) {
                await updateTransaction(editingTransaction.id, {
                    accountCategoryId: formCategoryId,
                    valor: valorNum,
                    data: formData,
                    competenceDate: formData,
                    settledAt: formStatus === 'PAGO' ? formSettledAt : null,
                    descricao: formDescricao || null,
                    status: formStatus,
                    vencimento: formVencimento || null,
                    ...(allocationsChanged ? { allocations: allocationRows.map((row) => ({
                        lotId: row.lotId || undefined, paddockId: row.paddockId || undefined, animalId: row.animalId || undefined,
                        productionPhase: row.productionPhase, amount: Number(row.amount),
                    })) } : {}),
                });
            } else {
                await createTransaction({
                    farmId,
                    type: formType,
                    categoria: 'OUTROS' as TransactionCategoria,
                    accountCategoryId: formCategoryId,
                    valor: valorNum,
                    data: formData,
                    competenceDate: formData,
                    settledAt: formStatus === 'PAGO' ? formSettledAt : undefined,
                    descricao: formDescricao || undefined,
                    status: formStatus,
                    vencimento: formVencimento || undefined,
                    allocations: allocationRows.filter((row) => row.lotId || row.paddockId || row.animalId).map((row) => ({
                        lotId: row.lotId || undefined,
                        paddockId: row.paddockId || undefined,
                        animalId: row.animalId || undefined,
                        percent: Number(row.percent),
                    })),
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
            notify('Lançamento cancelado.', 'success');
        } catch (e: any) {
            setDeleteError(e?.message || 'Erro ao excluir.');
            notify(e?.message || 'Erro ao excluir lançamento.', 'error');
        } finally { setIsDeleting(false); }
    };

    const openSettlement = (transaction: FinancialTransaction) => {
        setSettlingTransaction(transaction);
        setSettlementDate(localDateInput());
        setSettlementError(null);
        setSettlementUnknown(false);
    };

    const checkSettlement = async () => {
        if (!farmId || !settlingTransaction) return false;
        const current = (await listTransactions(farmId)).find((item) => item.id === settlingTransaction.id);
        if (!current) throw new Error('Não foi possível localizar a conta. Atualize a lista antes de continuar.');
        if (current.status === 'PAGO') {
            setSettlingTransaction(null);
            notify(`Conta já ${current.type === 'ENTRADA' ? 'recebida' : 'paga'} em ${formatDate(current.settledAt)}.`, 'success');
            await Promise.all([loadPending(), loadTransactions()]);
            window.dispatchEvent(new Event(FINANCIAL_PROGRESS_EVENT));
            return true;
        }
        setSettlementUnknown(false);
        return false;
    };

    const handleSettlement = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!settlingTransaction || !settlementDate || isSettling) return;
        setIsSettling(true);
        setSettlementError(null);
        try {
            if (settlementUnknown) {
                if (!await checkSettlement()) setSettlementError('A conta continua pendente. Confira a data e confirme novamente.');
                return;
            }
            if (await checkSettlement()) return;
            await updateTransaction(settlingTransaction.id, { status: 'PAGO', settledAt: settlementDate });
            setSettlingTransaction(null);
            await Promise.all([loadPending(), loadTransactions()]);
            window.dispatchEvent(new Event(FINANCIAL_PROGRESS_EVENT));
            notify(settlingTransaction.type === 'ENTRADA' ? 'Recebimento registrado.' : 'Pagamento registrado.', 'success');
        } catch (error: any) {
            try {
                if (!await checkSettlement()) setSettlementError(error?.message || 'Não foi possível registrar a baixa.');
            } catch {
                setSettlementUnknown(true);
                setSettlementError('Não foi possível confirmar o resultado. Verifique a situação antes de repetir a baixa.');
            }
        } finally { setIsSettling(false); }
    };

    const requestFormClose = () => {
        if (isSaving) return;
        if (!readOnlyTransaction && (formDirty || allocationsChanged || (!editingTransaction && (formValor || formDescricao || allocationRows.length)))) { setDiscardRequested(true); return; }
        setModalOpen(false);
        resetForm();
    };

    const allocationPercent = allocationRows.reduce((sum, row) => sum + Number(row.percent || 0), 0);
    const formAmount = Number(formValor.replace(',', '.')) || 0;
    const allocationAmount = allocationRows.reduce((sum, row) => sum + (row.amount !== undefined ? Math.round(Number(row.amount || 0) * 100) : Math.round(formAmount * Number(row.percent || 0))), 0) / 100;
    const allocationRemainder = Math.max(0, Math.round(formAmount * 100) - Math.round(allocationAmount * 100)) / 100;
    const cancellingTransaction = pendingAll.find((transaction) => transaction.id === deleteConfirmId);

    // ── Estilos recorrentes ───────────────────────────────────────────────────

    const anos = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];
    const activeTabCls = 'bg-(--eixo-green) text-[#1a1a1a] font-bold';
    const inactiveTabCls = 'bg-(--eixo-surface-soft) text-(--eixo-text-muted) hover:bg-(--eixo-surface-soft)';
    const inputCls = 'mt-1 w-full rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm text-(--eixo-text) focus:border-(--eixo-green) focus:outline-hidden';
    const labelCls = 'block text-sm font-medium text-(--eixo-text)';

    // ── Render ────────────────────────────────────────────────────────────────

    if (!farmId) return <ModuleHeader title="Financeiro" subtitle="Acompanhe receitas, despesas e resultados da fazenda." context={'Selecione uma fazenda para consultar ou registrar contas.'} />;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-3xl border border-(--eixo-border) bg-(--eixo-surface) px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <ModuleHeader embedded title="Financeiro" subtitle="Acompanhe receitas, despesas e resultados da fazenda." farmName={farmName} />
                    </div>
                    {(activeTab === 'contas_pagar' || activeTab === 'contas_receber') && (
                        <button
                            type="button"
                            onClick={() => {
                                resetForm();
                                setFormType(activeTab === 'contas_pagar' ? 'SAIDA' : 'ENTRADA');
                                setFormStatus('PENDENTE');
                                setModalOpen(true);
                            }}
                            className="flex h-10 items-center rounded-[10px] bg-(--eixo-green) px-[14px] font-brand font-bold text-[#1a1a1a] shadow-md transition-colors hover:bg-(--eixo-green-dark)"
                        >
                            <PlusIcon className="h-[18px] w-[18px]" />
                            <span className="ml-2">Nova conta</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Abas */}
            <div role="group" aria-label="Seções do Financeiro" className="flex gap-2 flex-wrap">
                {(Object.keys(TAB_LABELS) as FinanceTab[]).map((tab) => {
                    const isTabLocked = isFreePlan && LOCKED_TABS_FREE.includes(tab);
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => {
                                if (isTabLocked) { onUpgradeRequest?.(); return; }
                                setAccountsSearch('');
                                setAccountsPeriod(undefined);
                                setActiveTab(tab);
                            }}
                            aria-pressed={activeTab === tab}
                            title={isTabLocked ? 'Disponível nos planos pagos' : undefined}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold font-brand transition-colors ${
                                isTabLocked
                                    ? 'bg-(--eixo-surface-soft) text-(--eixo-text-soft) cursor-not-allowed opacity-70'
                                    : activeTab === tab ? activeTabCls : inactiveTabCls
                            }`}
                        >
                            {isTabLocked && <LockIcon className="w-3 h-3 shrink-0" />}
                            {TAB_LABELS[tab]}
                        </button>
                    );
                })}
            </div>

            {/* ── Aba: Visão Geral ─────────────────────────────────────────────── */}
            {activeTab === 'visao_geral' && (
                <VisaoGeralTab
                    transactions={transactionContext === monthlyContext ? transactions : []}
                    isLoading={isLoading || transactionContext !== monthlyContext}
                    loadError={transactionContext === monthlyContext ? loadError : null}
                    selectedMes={selectedMes}
                    setSelectedMes={setSelectedMes}
                    selectedAno={selectedAno}
                    setSelectedAno={setSelectedAno}
                    anos={anos}
                    onRetry={loadTransactions}
                    onOpenGroup={(type, group) => { setAccountsPeriod({ from: localDateInput(new Date(selectedAno, selectedMes - 1, 1)), to: localDateInput(new Date(selectedAno, selectedMes, 0)) }); setAccountsSearch(group); setActiveTab(type === 'ENTRADA' ? 'contas_receber' : 'contas_pagar'); }}
                />
            )}

            {/* ── Aba: Contas a Pagar ───────────────────────────────────────────── */}
            {activeTab === 'contas_pagar' && (
                <ContasTab tipo="pagar" pendingAll={pendingAll} pendingLoading={pendingLoading} loadError={pendingError} onRetry={loadPending} initialSearch={accountsSearch} initialPeriod={accountsPeriod} onMarkPaid={openSettlement} onEdit={openEditModal} onDelete={(t) => { setDeleteError(null); setDeleteConfirmId(t.id); }} />
            )}

            {/* ── Aba: Contas a Receber ─────────────────────────────────────────── */}
            {activeTab === 'contas_receber' && (
                <ContasTab tipo="receber" pendingAll={pendingAll} pendingLoading={pendingLoading} loadError={pendingError} onRetry={loadPending} initialSearch={accountsSearch} initialPeriod={accountsPeriod} onMarkPaid={openSettlement} onEdit={openEditModal} onDelete={(t) => { setDeleteError(null); setDeleteConfirmId(t.id); }} />
            )}

            {/* ── Aba: Fluxo de Caixa ──────────────────────────────────────────── */}
            {activeTab === 'fluxo' && (
                <FluxoTab
                    farmId={farmId!}
                    selectedAnoAnual={selectedAnoAnual}
                    setSelectedAnoAnual={setSelectedAnoAnual}
                    anos={anos}
                />
            )}

            {/* ── Aba: DRE ─────────────────────────────────────────────────────── */}
            {activeTab === 'dre' && !isFreePlan && (
                <DreTab
                    userId={userId}
                    farmId={farmId!}
                    selectedAnoAnual={selectedAnoAnual}
                    setSelectedAnoAnual={setSelectedAnoAnual}
                    anos={anos}
                />
            )}

            {activeTab === 'analytics' && farmId && <AnalyticsTab farmId={farmId} year={selectedAnoAnual} anos={anos} onYearChange={setSelectedAnoAnual} />}
            {activeTab === 'quality' && farmId && <DataQualityTab farmId={farmId} onOpenCategories={() => setActiveTab('plano_contas')} onOpenAccounts={() => setActiveTab('contas_pagar')} />}

            {/* ── Aba: Plano de Contas ──────────────────────────────────────────── */}
            {activeTab === 'plano_contas' && (
                <>
                {categoryError && <div role="alert" className="text-sm text-(--eixo-danger)">{categoryError} <button type="button" onClick={loadCategories} className="underline">Tentar novamente</button></div>}
                {!categoryError && <PlanoContasTab
                    farmId={farmId}
                    categories={categories}
                    catLoading={catLoading}
                    onReloadCategories={loadCategories}
                    inputCls={inputCls}
                    labelCls={labelCls}
                    notify={notify}
                    openCreateSignal={planoContasCreateSignal}
                />}
                </>
            )}

            {/* ── Modal: Novo / Editar lançamento ──────────────────────────────── */}
            {modalOpen && (
                <FinanceDialog titleId="finance-form-title" onClose={requestFormClose} busy={isSaving}>
                        <header className="flex items-center justify-between border-b border-(--eixo-border) p-5">
                            <h3 id="finance-form-title" className="font-brand text-lg font-bold text-(--eixo-text)">
                                {readOnlyTransaction ? 'Consultar lançamento' : editingTransaction ? 'Editar lançamento' : 'Novo lançamento'}
                            </h3>
                            <button type="button" aria-label="Fechar" disabled={isSaving} onClick={requestFormClose} className="rounded-full p-2 text-(--eixo-text-muted) hover:bg-(--eixo-surface-soft) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--eixo-green)">✕</button>
                        </header>
                        <form onChange={() => setFormDirty(true)} onSubmit={handleSave} className="space-y-4 p-6">
                            <fieldset disabled={readOnlyTransaction || isSaving} className="space-y-4">
                            {/* Tipo */}
                            <div>
                                <label htmlFor="finance-type" className={labelCls}>Tipo</label>
                                {editingTransaction ? (
                                    <p className={`${inputCls} bg-(--eixo-surface-soft) text-(--eixo-text-muted)`}>
                                        {formType === 'ENTRADA' ? 'Entrada' : 'Saída'} <span className="text-xs">(não editável)</span>
                                    </p>
                                ) : (
                                    <select id="finance-type" value={formType} onChange={e => setFormType(e.target.value as TransactionType)} className={inputCls}>
                                        <option value="ENTRADA">Entrada</option>
                                        <option value="SAIDA">Saída</option>
                                    </select>
                                )}
                            </div>
                            {/* Categoria */}
                            <div>
                                <label htmlFor="finance-category" className={labelCls}>Categoria</label>
                                {formType === 'ENTRADA' && (
                                    <p className="mt-1 text-xs text-(--eixo-text-muted)">Vendeu um animal? Registre a venda em Manejo do Rebanho — o lançamento financeiro é feito automaticamente.</p>
                                )}
                                {formType === 'SAIDA' && (
                                    <p className="mt-1 text-xs text-(--eixo-text-muted)">Comprou um animal? Registre a compra em Manejo do Rebanho — o lançamento financeiro é feito automaticamente.</p>
                                )}
                                {readOnlyTransaction ? <p className="text-sm">{editingTransaction?.accountCategoryName || 'Sem categoria'}</p> : categoryError ? <div role="alert" className="text-sm text-(--eixo-danger)">{categoryError} <button type="button" onClick={loadCategories} className="underline">Tentar novamente</button></div> : catLoading ? (
                                    <p className="mt-1 text-sm text-(--eixo-text-muted)">Carregando...</p>
                                ) : filteredCategories.length === 0 ? (
                                    <div className="mt-1 rounded-xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] p-3">
                                        <p className="text-sm text-(--eixo-danger)">Nenhuma categoria ativa para {formType === 'ENTRADA' ? 'Entrada' : 'Saída'}.</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setModalOpen(false);
                                                setActiveTab('plano_contas');
                                                setPlanoContasCreateSignal({ type: formType, nonce: Date.now() });
                                            }}
                                            className="mt-2 rounded-lg bg-(--eixo-green) px-3 py-1.5 text-xs font-semibold text-[#1a1a1a] hover:opacity-90"
                                        >
                                            Criar categoria agora
                                        </button>
                                    </div>
                                ) : (
                                    <CategoryPicker
                                        id="finance-category"
                                        categories={filteredCategories}
                                        value={formCategoryId}
                                        onChange={setFormCategoryId}
                                        inputCls={inputCls}
                                    />
                                )}
                            </div>
                            {/* Valor */}
                            <div>
                                <label htmlFor="finance-amount" className={labelCls}>Valor (R$)</label>
                                <input type="number" step="0.01" min="0" id="finance-amount" value={formValor} onChange={e => setFormValor(e.target.value)} className={inputCls} required />
                            </div>
                            {/* Data */}
                            <div>
                                <label htmlFor="finance-competence" className={labelCls}>Data de competência</label><p className="text-xs text-(--eixo-text-muted)">Quando a receita ou despesa pertence à operação, independentemente do pagamento.</p>
                                <input type="date" id="finance-competence" value={formData} onChange={e => setFormData(e.target.value)} className={inputCls} required />
                            </div>
                            {/* Status */}
                            <div>
                                <label htmlFor="finance-status" className={labelCls}>Status</label>
                                <select id="finance-status" value={formStatus} onChange={e => setFormStatus(e.target.value as TransactionStatus)} className={inputCls}>
                                    <option value="PAGO">Pago / Recebido</option>
                                    <option value="PENDENTE">Pendente</option>
                                </select>
                            </div>
                            {formStatus === 'PAGO' && (
                                <div>
                                    <label htmlFor="finance-settled" className={labelCls}>Data do pagamento ou recebimento</label>
                                    <input type="date" id="finance-settled" value={formSettledAt} onChange={e => setFormSettledAt(e.target.value)} className={inputCls} required />
                                </div>
                            )}
                            {/* Vencimento (só para pendentes) */}
                            {formStatus === 'PENDENTE' && (
                                <div>
                                    <label htmlFor="finance-due" className={labelCls}>Data de vencimento</label>
                                    <input aria-describedby="finance-due-help" type="date" id="finance-due" value={formVencimento} onChange={e => setFormVencimento(e.target.value)} className={inputCls} />
                                    <p id="finance-due-help" className="mt-1 text-xs text-(--eixo-text-muted)">Sem vencimento, a conta permanece em aberto, mas não entra no caixa projetado. Contas vencem ao final do dia informado.</p>
                                </div>
                            )}
                            {/* Descrição */}
                            <div>
                                <label htmlFor="finance-description" className={labelCls}>Descrição <span className="text-(--eixo-text-muted)">(opcional)</span></label>
                                <input type="text" id="finance-description" value={formDescricao} onChange={e => setFormDescricao(e.target.value)} className={inputCls} />
                            </div>
                            </fieldset>
                            <div className="space-y-3 rounded-xl border border-(--eixo-border) p-3">
                                <div><p className={labelCls}>Distribuição entre destinos <span className="text-(--eixo-text-muted)">(opcional)</span></p><p className="text-xs text-(--eixo-text-muted)">{editingTransaction ? 'Confira os valores já registrados. O restante fica como não atribuído.' : 'Informe os percentuais. O restante fica como não atribuído.'}</p></div>
                                {allocationLoading && <p role="status" className="text-sm">Carregando distribuição...</p>}
                                {allocationError && <div role="alert" className="text-sm text-(--eixo-danger)">{allocationError} <button type="button" onClick={() => setAllocationAttempt((value) => value + 1)} className="underline">Tentar novamente</button></div>}
                                {editingTransaction && allocationDetails?.reason && <p className="text-xs text-(--eixo-text-muted)">{allocationDetails.reason}</p>}
                                {!allocationLoading && !allocationError && <>
                                    {destinationError && <p role="alert" className="text-xs text-(--eixo-danger)">{destinationError} <button type="button" onClick={() => setDestinationAttempt((value) => value + 1)} className="underline">Tentar novamente</button></p>}
                                    {allocationRows.map((row, index) => <fieldset key={index} disabled={!canEditAllocations || isSaving} className="grid gap-2 sm:grid-cols-2">
                                        <select aria-label={`Lote da divisão ${index + 1}`} value={row.lotId} onChange={(e) => { setAllocationsChanged(true); setAllocationRows((rows) => rows.map((item, i) => i === index ? { ...item, lotId: e.target.value, lotName: undefined, productionPhase: undefined } : item)); }} className="min-w-0 rounded-lg border border-(--eixo-border) px-2 py-2 text-xs"><option value="">Sem lote</option>{row.lotId && !availableLots.some((item) => item.id === row.lotId) && <option value={row.lotId}>{row.lotName || 'Lote registrado'}</option>}{availableLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}</select>
                                        <select aria-label={`Pasto da divisão ${index + 1}`} value={row.paddockId} onChange={(e) => { setAllocationsChanged(true); setAllocationRows((rows) => rows.map((item, i) => i === index ? { ...item, paddockId: e.target.value, paddockName: undefined } : item)); }} className="min-w-0 rounded-lg border border-(--eixo-border) px-2 py-2 text-xs"><option value="">Sem pasto</option>{row.paddockId && !availablePaddocks.some((item) => item.id === row.paddockId) && <option value={row.paddockId}>{row.paddockName || 'Pasto registrado'}</option>}{availablePaddocks.map((paddock) => <option key={paddock.id} value={paddock.id}>{paddock.name}</option>)}</select>
                                        {(availableAuctionAnimals.length > 0 || row.animalId || row.animalLabel) && <select aria-label={`Animal da divisão ${index + 1}`} value={row.animalId} onChange={(e) => { setAllocationsChanged(true); setAllocationRows((rows) => rows.map((item, i) => i === index ? { ...item, animalId: e.target.value, animalLabel: undefined } : item)); }} className="min-w-0 rounded-lg border border-(--eixo-border) px-2 py-2 text-xs"><option value="">Sem animal</option>{row.animalId && !availableAuctionAnimals.some((item) => item.id === row.animalId) && <option value={row.animalId}>{row.animalLabel || 'Animal registrado'}</option>}{availableAuctionAnimals.map((animal) => <option key={animal.id} value={animal.id}>{[animal.nome, animal.brinco].filter(Boolean).join(' · ')}</option>)}</select>}
                                        <label className="text-xs">{editingTransaction ? 'Valor (R$)' : 'Percentual (%)'}<input aria-label={`${editingTransaction ? 'Valor' : 'Percentual'} da divisão ${index + 1}`} type="number" min="0.01" max={editingTransaction ? undefined : '100'} step="0.01" value={editingTransaction ? row.amount ?? '' : row.percent} onChange={(e) => { setAllocationsChanged(true); setAllocationRows((rows) => rows.map((item, i) => i === index ? { ...item, ...(editingTransaction ? { amount: e.target.value } : { percent: e.target.value }) } : item)); }} className="mt-1 w-full rounded-lg border border-(--eixo-border) px-2 py-2 text-xs" required /></label>
                                        {row.productionPhase && <p className="text-xs text-(--eixo-text-muted)">Fase: {row.productionPhase}</p>}
                                        {(row.lotName && !row.lotId || row.paddockName && !row.paddockId || row.animalLabel && !row.animalId) && <p className="text-xs text-(--eixo-text-muted)">Destino histórico: {[row.lotName, row.paddockName, row.animalLabel].filter(Boolean).join(' · ')}. Para alterar a divisão, confira um destino atual.</p>}
                                        {canEditAllocations && <button type="button" aria-label={`Remover divisão ${index + 1}`} onClick={() => { setAllocationsChanged(true); setAllocationRows((rows) => rows.filter((_, i) => i !== index)); }} className="text-xs text-(--eixo-danger)">Remover divisão</button>}
                                    </fieldset>)}
                                    {allocationRows.length === 0 && <p className="text-xs text-(--eixo-text-muted)">Nenhum destino atribuído diretamente a este lançamento.</p>}
                                    {canEditAllocations && <button type="button" disabled={isSaving} onClick={() => { setAllocationsChanged(true); setAllocationRows((rows) => [...rows, { lotId: '', paddockId: '', animalId: '', percent: '', ...(editingTransaction ? { amount: '' } : {}) }]); }} className="rounded-lg border border-(--eixo-border) px-3 py-2 text-xs font-semibold">Adicionar divisão</button>}
                                    <p aria-live="polite" className="text-xs text-(--eixo-text-muted)">Distribuído: {formatCurrency(allocationAmount)}{!editingTransaction && ` (${allocationPercent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`}. Restante: {formatCurrency(allocationRemainder)}.</p>
                                    {allocationAmount > formAmount && <p role="alert" className="text-xs text-(--eixo-danger)">A distribuição supera o valor do lançamento.</p>}
                                    {allocationDetails?.relatedResults.map((result) => <div key={result.id} className="border-t border-(--eixo-border) pt-3 text-xs"><strong>{result.description} · {formatCurrency(result.amount)}</strong><p>Distribuição vinculada, somente para consulta.</p>{result.allocations.map((item) => <p key={item.id}>{[item.lotName, item.paddockName, item.animalLabel, item.productionPhase].filter(Boolean).join(' · ') || 'Destino histórico'} · {formatCurrency(item.amount)}</p>)}</div>)}
                                </>}
                            </div>
                            {discardRequested && <div ref={discardPanel} role="alert" className="rounded-xl border border-(--eixo-border) p-3 text-sm"><p>Descartar as informações deste formulário?</p><div className="mt-2 flex gap-3"><button type="button" onClick={() => setDiscardRequested(false)} className="underline">Continuar preenchendo</button><button type="button" onClick={() => { setModalOpen(false); resetForm(); }} className="text-(--eixo-danger) underline">Descartar e fechar</button></div></div>}
                            {formError && <p role="alert" className="text-sm text-(--eixo-danger)">{formError}</p>}
                            <div className="flex justify-end gap-3">
                                <button type="button" disabled={isSaving} onClick={requestFormClose}
                                    className="rounded-xl border border-(--eixo-border) px-4 py-2 text-sm font-semibold text-(--eixo-text) hover:bg-(--eixo-surface-soft)">
                                    {readOnlyTransaction ? 'Fechar' : 'Cancelar'}
                                </button>
                                {!readOnlyTransaction && <button type="submit" disabled={isSaving || catLoading || !!categoryError || !formCategoryId || filteredCategories.length === 0 || !!editingTransaction && (allocationLoading || !!allocationError || !allocationDetails)}
                                    className="rounded-xl bg-(--eixo-green) px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-(--eixo-green-dark) disabled:opacity-50">
                                    {isSaving ? 'Salvando...' : editingTransaction ? 'Salvar alterações' : 'Lançar'}
                                </button>}
                            </div>
                        </form>
                </FinanceDialog>
            )}

            {/* ── Modal: Confirmar exclusão de lançamento ───────────────────────── */}
            {deleteConfirmId && (
                <FinanceDialog titleId="finance-cancel-title" onClose={() => setDeleteConfirmId(null)} busy={isDeleting}>
                        <div className="p-6">
                            <h3 id="finance-cancel-title" className="font-brand text-lg font-bold text-(--eixo-text)">Cancelar lançamento</h3>
                            <p className="mt-2 text-sm text-(--eixo-text-muted)">{cancellingTransaction && `${cancellingTransaction.descricao || cancellingTransaction.accountCategoryName || 'Lançamento'} · ${formatCurrency(cancellingTransaction.valor)}. `}O lançamento será preservado no histórico e retirado dos relatórios ativos.</p>
                            {deleteError && <p className="mt-3 text-sm text-(--eixo-danger)">{deleteError}</p>}
                            <div className="mt-6 flex justify-end gap-3">
                                <button type="button" onClick={() => setDeleteConfirmId(null)} disabled={isDeleting}
                                    className="rounded-xl border border-(--eixo-border) px-4 py-2 text-sm font-semibold text-(--eixo-text) hover:bg-(--eixo-surface-soft) disabled:opacity-50">
                                    Voltar
                                </button>
                                <button type="button" onClick={handleDeleteConfirm} disabled={isDeleting}
                                    className="rounded-xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-4 py-2 text-sm font-semibold text-(--eixo-danger) hover:bg-[rgba(184,66,50,0.12)] disabled:opacity-50">
                                    {isDeleting ? 'Cancelando...' : 'Cancelar lançamento'}
                                </button>
                            </div>
                        </div>
                </FinanceDialog>
            )}

            {settlingTransaction && <FinanceDialog titleId="finance-settlement-title" onClose={() => setSettlingTransaction(null)} busy={isSettling}>
                <form onSubmit={handleSettlement} className="space-y-4 p-6">
                    <h3 id="finance-settlement-title" className="font-brand text-lg font-bold">{settlingTransaction.type === 'ENTRADA' ? 'Registrar recebimento' : 'Registrar pagamento'}</h3>
                    <p className="text-sm">{settlingTransaction.descricao || settlingTransaction.accountCategoryName || 'Conta'} · <strong>{formatCurrency(settlingTransaction.valor)}</strong></p>
                    <label className={labelCls} htmlFor="settlement-date">Data do {settlingTransaction.type === 'ENTRADA' ? 'recebimento' : 'pagamento'}</label>
                    <input id="settlement-date" type="date" required value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} disabled={isSettling || settlementUnknown} className={inputCls} />
                    <p className="text-xs text-(--eixo-text-muted)">Esta data determina o período do caixa realizado. O valor e a origem da conta serão preservados.</p>
                    {settlementError && <p role="alert" className="text-sm text-(--eixo-danger)">{settlementError}</p>}
                    <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={isSettling} onClick={() => setSettlingTransaction(null)} className="rounded-xl border border-(--eixo-border) px-4 py-2">Voltar</button><button type="submit" disabled={isSettling} className="rounded-xl bg-(--eixo-green) px-4 py-2 font-semibold text-[#1a1a1a]">{isSettling ? 'Verificando...' : settlementUnknown ? 'Verificar situação' : 'Confirmar'}</button></div>
                </form>
            </FinanceDialog>}

            <ToastHost toasts={toasts} onDismiss={dismiss} />
        </div>
    );
};

const FinanceModuleWithContext: React.FC<FinanceModuleProps> = (props) => <FinanceModule key={`${props.userId}:${props.farmId || 'none'}`} {...props} />;

export default FinanceModuleWithContext;
