import React, { useMemo, useState } from 'react';
import {
    AccountCategory,
    AccountCategoryType,
    createAccountCategory,
    deleteAccountCategory,
    updateAccountCategory,
} from '../../adapters/financialApi';
import { PlusIcon, LockIcon, normalizeSearchText } from '../financeUtils';

interface PlanoContasTabProps {
    farmId?: string | null;
    categories: AccountCategory[];
    catLoading: boolean;
    onReloadCategories: () => Promise<void>;
    inputCls: string;
    labelCls: string;
}

const PlanoContasTab: React.FC<PlanoContasTabProps> = ({
    farmId,
    categories,
    catLoading,
    onReloadCategories,
    inputCls,
    labelCls,
}) => {
    // ── Nova categoria ──
    const [pcModalOpen, setPcModalOpen] = useState(false);
    const [pcFormName, setPcFormName] = useState('');
    const [pcFormGroup, setPcFormGroup] = useState('');
    const [pcFormNewGroup, setPcFormNewGroup] = useState('');
    const [pcFormType, setPcFormType] = useState<AccountCategoryType>('SAIDA');
    const [pcFormError, setPcFormError] = useState<string | null>(null);
    const [pcIsSaving, setPcIsSaving] = useState(false);
    const [pcSearch, setPcSearch] = useState('');

    // ── Edição inline ──
    const [editingCatId, setEditingCatId] = useState<string | null>(null);
    const [editingCatName, setEditingCatName] = useState('');
    const [editingCatGroup, setEditingCatGroup] = useState('');
    const [editCatSaving, setEditCatSaving] = useState(false);

    // ── Delete ──
    const [deleteCatConfirmId, setDeleteCatConfirmId] = useState<string | null>(null);
    const [isDeletingCat, setIsDeletingCat] = useState(false);
    const [deleteCatError, setDeleteCatError] = useState<string | null>(null);

    const existingGroups = useMemo(() => {
        const set = new Set(categories.filter(c => c.type === pcFormType).map(c => c.group));
        return Array.from(set).sort();
    }, [categories, pcFormType]);

    const pcResolvedGroup = pcFormGroup === '__new__' ? pcFormNewGroup.trim() : pcFormGroup;
    const planCategories = useMemo(() => {
        const term = normalizeSearchText(pcSearch.trim());
        const sorted = [...categories].sort((a, b) =>
            a.type.localeCompare(b.type) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name),
        );
        if (!term) return sorted;
        return sorted.filter((category) => {
            const typeLabel = category.type === 'ENTRADA' ? 'entrada' : 'saída';
            return [category.name, category.group, typeLabel].some((value) => normalizeSearchText(value).includes(term));
        });
    }, [categories, pcSearch]);

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
            await onReloadCategories();
        } catch (e: any) {
            setPcFormError(e?.message || 'Erro ao criar categoria.');
        } finally { setPcIsSaving(false); }
    };

    const openCategoryModal = (type: AccountCategoryType = 'SAIDA', useNewGroup = false) => {
        setPcFormType(type);
        setPcFormName('');
        setPcFormError(null);
        setPcFormNewGroup('');
        setPcFormGroup(useNewGroup ? '__new__' : '');
        setPcModalOpen(true);
    };

    const startEditCat = (cat: AccountCategory) => { setEditingCatId(cat.id); setEditingCatName(cat.name); setEditingCatGroup(cat.group); };
    const cancelEditCat = () => { setEditingCatId(null); setEditingCatName(''); setEditingCatGroup(''); };

    const saveEditCat = async (cat: AccountCategory) => {
        if (!editingCatName.trim()) return;
        setEditCatSaving(true);
        try {
            await updateAccountCategory(cat.id, { name: editingCatName.trim(), group: editingCatGroup.trim() || cat.group });
            cancelEditCat();
            await onReloadCategories();
        } catch { /* silencioso */ }
        finally { setEditCatSaving(false); }
    };

    const toggleCatActive = async (cat: AccountCategory) => {
        try { await updateAccountCategory(cat.id, { isActive: !cat.isActive }); await onReloadCategories(); }
        catch { /* silencioso */ }
    };

    const handleDeleteCat = async () => {
        if (!deleteCatConfirmId) return;
        setIsDeletingCat(true);
        setDeleteCatError(null);
        try {
            await deleteAccountCategory(deleteCatConfirmId);
            setDeleteCatConfirmId(null);
            await onReloadCategories();
        } catch (e: any) {
            setDeleteCatError(e?.message || 'Erro ao excluir categoria.');
        } finally { setIsDeletingCat(false); }
    };

    return (
        <>
            <div className="space-y-5">
                {catLoading ? (
                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-10 text-center text-sm text-[var(--eixo-text-muted)]">Carregando categorias...</div>
                ) : (
                    <>
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                <div className="w-full max-w-xl">
                                    <label className={labelCls}>Buscar no plano de contas</label>
                                    <input
                                        type="text"
                                        value={pcSearch}
                                        onChange={(e) => setPcSearch(e.target.value)}
                                        placeholder="Busque por tipo, grupo ou categoria"
                                        className={inputCls}
                                    />
                                    <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                                        {planCategories.length} {planCategories.length === 1 ? 'item encontrado' : 'itens encontrados'} na lista.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => openCategoryModal('SAIDA', true)}
                                        className="flex h-10 items-center justify-center rounded-[10px] border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                    >
                                        Novo grupo de despesa
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openCategoryModal('SAIDA')}
                                        className="flex h-10 items-center justify-center rounded-[10px] bg-[var(--eixo-green)] px-4 text-sm font-semibold text-[#1a1a1a] shadow-md transition-colors hover:bg-[var(--eixo-green-dark)]"
                                    >
                                        <PlusIcon className="h-4 w-4" />
                                        <span className="ml-2">Nova categoria</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                            <div className="grid grid-cols-[110px_160px_minmax(0,1fr)_110px] gap-3 border-b border-[var(--eixo-border)] bg-[#f1e7d8] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#74644e]">
                                <span>Tipo</span>
                                <span>Grupo</span>
                                <span>Categoria</span>
                                <span className="text-right">Origem</span>
                            </div>
                            {planCategories.length === 0 ? (
                                <div className="px-5 py-8 text-center text-sm text-[var(--eixo-text-muted)]">
                                    Nenhuma categoria encontrada para a busca informada.
                                </div>
                            ) : (
                                planCategories.map((cat, idx) => (
                                    <div
                                        key={cat.id}
                                        className={`px-5 py-4 ${idx < planCategories.length - 1 ? 'border-b border-[var(--eixo-border)]' : ''}`}
                                    >
                                        {editingCatId === cat.id ? (
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                                <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${cat.type === 'ENTRADA' ? 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' : 'bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]'}`}>
                                                    {cat.type === 'ENTRADA' ? 'Entrada' : 'Saída'}
                                                </span>
                                                <input
                                                    type="text"
                                                    value={editingCatGroup}
                                                    onChange={e => setEditingCatGroup(e.target.value)}
                                                    placeholder="Grupo"
                                                    className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm focus:outline-none lg:w-48"
                                                />
                                                <input
                                                    type="text"
                                                    value={editingCatName}
                                                    onChange={e => setEditingCatName(e.target.value)}
                                                    className="w-full rounded-lg border border-[var(--eixo-green)] bg-[var(--eixo-surface)] px-3 py-2 text-sm focus:outline-none"
                                                />
                                                <div className="flex items-center gap-2 lg:ml-auto">
                                                    <button
                                                        type="button"
                                                        disabled={editCatSaving}
                                                        onClick={() => saveEditCat(cat)}
                                                        className="rounded-lg bg-[var(--eixo-green)] px-3 py-2 text-xs font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:opacity-50"
                                                    >
                                                        {editCatSaving ? 'Salvando...' : 'Salvar'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelEditCat}
                                                        className="rounded-lg border border-[var(--eixo-border)] px-3 py-2 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[110px_160px_minmax(0,1fr)_110px_auto] lg:items-center lg:gap-3">
                                                <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cat.type === 'ENTRADA' ? 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' : 'bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]'}`}>
                                                    {cat.type === 'ENTRADA' ? 'Entrada' : 'Saída'}
                                                </span>
                                                <span className="text-sm text-[var(--eixo-text-muted)]">{cat.group}</span>
                                                <div className="flex min-w-0 items-center gap-2">
                                                    {cat.isSystem ? (
                                                        <span className="flex-shrink-0 text-[var(--eixo-text-muted)]"><LockIcon /></span>
                                                    ) : (
                                                        <span className="flex h-3.5 w-3.5 flex-shrink-0 rounded-full bg-[var(--eixo-green-soft)]" />
                                                    )}
                                                    <span className="truncate text-sm font-medium text-[var(--eixo-text)]">{cat.name}</span>
                                                </div>
                                                <span className="text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">
                                                    {cat.isSystem ? 'Sistema' : 'Cliente'}
                                                </span>
                                                {!cat.isSystem && (
                                                    <div className="flex items-center gap-2 lg:justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEditCat(cat)}
                                                            className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleCatActive(cat)}
                                                            className="rounded-lg border border-[var(--eixo-border)] px-3 py-1 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                                        >
                                                            {cat.isActive ? 'Desativar' : 'Ativar'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setDeleteCatError(null); setDeleteCatConfirmId(cat.id); }}
                                                            className="rounded-lg border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-3 py-1 text-xs font-semibold text-[var(--eixo-danger)] hover:bg-[rgba(184,66,50,0.12)]"
                                                        >
                                                            Excluir
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── Modal: Nova categoria ───────────────────────── */}
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
                                <p className="mt-2 text-xs text-[var(--eixo-text-muted)]">
                                    Para criar um grupo de despesa novo, escolha <strong>+ Novo grupo...</strong> e informe o primeiro item dessa lista.
                                </p>
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
                                    className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:opacity-50">
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
        </>
    );
};

export default PlanoContasTab;
