import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../api';
import { Farm } from '../types';

interface PharmacyBatch {
    id: string;
    lotNumber: string;
    expiresAt: string | null;
    quantity: number;
    unitCost: number | null;
}

interface PharmacyProduct {
    id: string;
    name: string;
    activeIngredient: string | null;
    category: string;
    unit: string;
    manufacturer: string | null;
    presentation: string | null;
    applicationUnit: string | null;
    minStock: number;
    storageLocation: string | null;
    refrigerated: boolean;
    slaughterWithdrawalDays: number | null;
    milkWithdrawalDays: number | null;
    notes: string | null;
    totalStock: number;
    batches: PharmacyBatch[];
}

interface PharmacyMovement {
    id: string;
    type: 'ENTRY' | 'EXIT' | 'ADJUSTMENT';
    quantity: number;
    notes: string | null;
    createdAt: string;
    product: { name: string; unit: string };
    batch: { lotNumber: string };
}

interface PharmacyModuleProps {
    farm: Farm;
}

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const labelClass = 'text-xs font-semibold text-[var(--eixo-text-muted)]';
const PRODUCT_CATEGORIES = [
    ['VACINA', 'Vacinas'],
    ['VERMIFUGO', 'Vermífugos'],
    ['ANTIBIOTICO', 'Antibióticos'],
    ['ANTIPARASITARIO', 'Antiparasitários'],
    ['ANTI_INFLAMATORIO', 'Anti-inflamatórios'],
    ['VITAMINA_MINERAL', 'Vitaminas e minerais'],
    ['HORMONIO_REPRODUCAO', 'Hormônios e reprodução'],
    ['DESINFETANTE', 'Desinfetantes'],
    ['MATERIAL_VETERINARIO', 'Materiais veterinários'],
    ['OUTRO_SANITARIO', 'Outros produtos sanitários'],
] as const;
const CATEGORY_LABELS = Object.fromEntries(PRODUCT_CATEGORIES) as Record<string, string>;

const emptyProductForm = {
    name: '',
    activeIngredient: '',
    category: 'VACINA',
    manufacturer: '',
    presentation: '',
    unit: 'frasco',
    applicationUnit: 'ml',
    minStock: '',
    storageLocation: '',
    refrigerated: false,
    slaughterWithdrawalDays: '',
    milkWithdrawalDays: '',
    notes: '',
};

const PharmacyModule: React.FC<PharmacyModuleProps> = ({ farm }) => {
    const [products, setProducts] = useState<PharmacyProduct[]>([]);
    const [movements, setMovements] = useState<PharmacyMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
    const [productForm, setProductForm] = useState(emptyProductForm);
    const [batchForm, setBatchForm] = useState({ productId: '', lotNumber: '', expiresAt: '', quantity: '', unitCost: '' });
    const [movementForm, setMovementForm] = useState({ batchId: '', type: 'EXIT', quantity: '', notes: '' });

    const request = async (path: string, init?: RequestInit) => {
        const response = await fetch(buildApiUrl(path), { credentials: 'include', ...init });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || 'Não foi possível concluir a operação.');
        return payload;
    };

    const loadInventory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await request(`/farms/${farm.id}/pharmacy`);
            setProducts(payload.products || []);
            setMovements(payload.movements || []);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a farmácia.');
        } finally {
            setLoading(false);
        }
    }, [farm.id]);

    useEffect(() => { void loadInventory(); }, [loadInventory]);

    useEffect(() => {
        if (!batchForm.productId && products[0]) setBatchForm((current) => ({ ...current, productId: products[0].id }));
    }, [products, batchForm.productId]);

    const allBatches = useMemo(() => products.flatMap((product) => product.batches.map((batch) => ({ ...batch, product }))), [products]);
    useEffect(() => {
        if (!movementForm.batchId && allBatches[0]) setMovementForm((current) => ({ ...current, batchId: allBatches[0].id }));
    }, [allBatches, movementForm.batchId]);

    const lowStockCount = products.filter((product) => product.totalStock <= product.minStock).length;
    const expiryLimit = Date.now() + (60 * 24 * 60 * 60 * 1000);
    const expiringCount = allBatches.filter((batch) => batch.quantity > 0 && batch.expiresAt && new Date(batch.expiresAt).getTime() <= expiryLimit).length;
    const inventoryValue = allBatches.reduce((sum, batch) => sum + (batch.quantity * (batch.unitCost || 0)), 0);

    const getProductStatus = (product: PharmacyProduct) => {
        const stockedBatches = product.batches.filter((batch) => batch.quantity > 0);
        const hasExpired = stockedBatches.some((batch) => batch.expiresAt && new Date(batch.expiresAt).getTime() < Date.now());
        const hasExpiring = stockedBatches.some((batch) => {
            if (!batch.expiresAt) return false;
            const expiresAt = new Date(batch.expiresAt).getTime();
            return expiresAt >= Date.now() && expiresAt <= expiryLimit;
        });
        if (hasExpired) return 'EXPIRED';
        if (product.totalStock <= product.minStock) return 'LOW';
        if (hasExpiring) return 'EXPIRING';
        return 'REGULAR';
    };

    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const filteredProducts = products.filter((product) => {
        const matchesSearch = !normalizedSearch || [product.name, product.activeIngredient, product.manufacturer]
            .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
        const matchesCategory = categoryFilter === 'ALL' || product.category === categoryFilter;
        const matchesStatus = statusFilter === 'ALL' || getProductStatus(product) === statusFilter;
        return matchesSearch && matchesCategory && matchesStatus;
    });
    const filteredProductIds = new Set(filteredProducts.map((product) => product.id));
    const filteredBatches = allBatches.filter((batch) => filteredProductIds.has(batch.product.id));

    const runMutation = async (action: () => Promise<void>) => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await action();
            await loadInventory();
        } catch (mutationError) {
            setError(mutationError instanceof Error ? mutationError.message : 'Não foi possível salvar.');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateProduct = (event: React.FormEvent) => {
        event.preventDefault();
        void runMutation(async () => {
            const payload = await request(`/farms/${farm.id}/pharmacy/products`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productForm),
            });
            setProductForm(emptyProductForm);
            setBatchForm((current) => ({ ...current, productId: payload.product.id }));
            setSuccess('Produto cadastrado. Agora registre o primeiro lote.');
        });
    };

    const handleCreateBatch = (event: React.FormEvent) => {
        event.preventDefault();
        void runMutation(async () => {
            await request(`/farms/${farm.id}/pharmacy/batches`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batchForm),
            });
            setBatchForm((current) => ({ ...current, lotNumber: '', expiresAt: '', quantity: '', unitCost: '' }));
            setSuccess('Entrada do lote registrada.');
        });
    };

    const handleMovement = (event: React.FormEvent) => {
        event.preventDefault();
        void runMutation(async () => {
            await request(`/farms/${farm.id}/pharmacy/movements`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(movementForm),
            });
            setMovementForm((current) => ({ ...current, quantity: '', notes: '' }));
            setSuccess('Movimentação registrada.');
        });
    };

    if (loading && products.length === 0) return <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-10 text-center text-sm text-[var(--eixo-text-muted)]">Carregando farmácia...</div>;

    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Summary label="Produtos cadastrados" value={products.length} />
                <Summary label="Estoque baixo" value={lowStockCount} attention={lowStockCount > 0} />
                <Summary label="Vencidos ou até 60 dias" value={expiringCount} attention={expiringCount > 0} />
                <Summary label="Valor estimado do estoque" value={inventoryValue} currency />
            </div>

            {error && <div role="alert" className="rounded-2xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[var(--eixo-danger)]">{error}</div>}
            {success && <div role="status" className="rounded-2xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-4 py-3 text-sm font-semibold text-[var(--eixo-success)]">{success}</div>}

            <div className="grid gap-5 xl:grid-cols-3">
                <FormCard title="1. Cadastrar produto" description="Crie o item antes de registrar seus lotes.">
                    <form onSubmit={handleCreateProduct} className="space-y-3">
                        <Field label="Nome comercial"><input required className={inputClass} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="Ex.: Ivomec 1%" /></Field>
                        <Field label="Princípio ativo"><input className={inputClass} value={productForm.activeIngredient} onChange={(event) => setProductForm({ ...productForm, activeIngredient: event.target.value })} placeholder="Ex.: Ivermectina" /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Categoria"><select className={inputClass} value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}>{PRODUCT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                            <Field label="Fabricante"><input className={inputClass} value={productForm.manufacturer} onChange={(event) => setProductForm({ ...productForm, manufacturer: event.target.value })} /></Field>
                        </div>
                        <Field label="Apresentação"><input className={inputClass} value={productForm.presentation} onChange={(event) => setProductForm({ ...productForm, presentation: event.target.value })} placeholder="Ex.: frasco com 500 ml" /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Unidade de estoque"><select className={inputClass} value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })}><option value="frasco">Frasco</option><option value="dose">Dose</option><option value="ml">ml</option><option value="unidade">Unidade</option><option value="kit">Kit</option></select></Field>
                            <Field label="Unidade de aplicação"><select className={inputClass} value={productForm.applicationUnit} onChange={(event) => setProductForm({ ...productForm, applicationUnit: event.target.value })}><option value="ml">ml</option><option value="dose">Dose</option><option value="unidade">Unidade</option><option value="g">g</option></select></Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Estoque mínimo"><input type="number" min="0" step="0.01" className={inputClass} value={productForm.minStock} onChange={(event) => setProductForm({ ...productForm, minStock: event.target.value })} placeholder="0" /></Field>
                            <Field label="Local de armazenamento"><input className={inputClass} value={productForm.storageLocation} onChange={(event) => setProductForm({ ...productForm, storageLocation: event.target.value })} placeholder="Ex.: geladeira 1" /></Field>
                        </div>
                        <label className="flex items-center gap-2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2.5 text-sm font-semibold text-[var(--eixo-text)]"><input type="checkbox" checked={productForm.refrigerated} onChange={(event) => setProductForm({ ...productForm, refrigerated: event.target.checked })} /> Exige refrigeração</label>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Carência para abate (dias)"><input type="number" min="0" step="1" className={inputClass} value={productForm.slaughterWithdrawalDays} onChange={(event) => setProductForm({ ...productForm, slaughterWithdrawalDays: event.target.value })} /></Field>
                            <Field label="Carência para leite (dias)"><input type="number" min="0" step="1" className={inputClass} value={productForm.milkWithdrawalDays} onChange={(event) => setProductForm({ ...productForm, milkWithdrawalDays: event.target.value })} /></Field>
                        </div>
                        <Field label="Observações"><textarea rows={2} className={inputClass} value={productForm.notes} onChange={(event) => setProductForm({ ...productForm, notes: event.target.value })} placeholder="Cuidados ou instruções internas" /></Field>
                        <SaveButton disabled={saving}>Cadastrar produto</SaveButton>
                    </form>
                </FormCard>

                <FormCard title="2. Registrar entrada" description="Informe lote, validade e quantidade recebida.">
                    <form onSubmit={handleCreateBatch} className="space-y-3">
                        <Field label="Produto"><select required className={inputClass} value={batchForm.productId} onChange={(event) => setBatchForm({ ...batchForm, productId: event.target.value })}><option value="">Selecione</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Lote"><input required className={inputClass} value={batchForm.lotNumber} onChange={(event) => setBatchForm({ ...batchForm, lotNumber: event.target.value })} /></Field>
                            <Field label="Validade"><input type="date" className={inputClass} value={batchForm.expiresAt} onChange={(event) => setBatchForm({ ...batchForm, expiresAt: event.target.value })} /></Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Quantidade"><input required type="number" min="0.01" step="0.01" className={inputClass} value={batchForm.quantity} onChange={(event) => setBatchForm({ ...batchForm, quantity: event.target.value })} /></Field>
                            <Field label="Custo unitário"><input type="number" min="0" step="0.01" className={inputClass} value={batchForm.unitCost} onChange={(event) => setBatchForm({ ...batchForm, unitCost: event.target.value })} /></Field>
                        </div>
                        <SaveButton disabled={saving || products.length === 0}>Registrar entrada</SaveButton>
                    </form>
                </FormCard>

                <FormCard title="3. Movimentar estoque" description="Registre consumo, nova entrada ou correção do saldo.">
                    <form onSubmit={handleMovement} className="space-y-3">
                        <Field label="Produto e lote"><select required className={inputClass} value={movementForm.batchId} onChange={(event) => setMovementForm({ ...movementForm, batchId: event.target.value })}><option value="">Selecione</option>{allBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.product.name} · {batch.lotNumber} · saldo {batch.quantity}</option>)}</select></Field>
                        <Field label="Movimentação"><select className={inputClass} value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value })}><option value="EXIT">Saída</option><option value="ENTRY">Entrada adicional</option><option value="ADJUSTMENT">Ajustar saldo</option></select></Field>
                        <Field label={movementForm.type === 'ADJUSTMENT' ? 'Novo saldo' : 'Quantidade'}><input required type="number" min="0" step="0.01" className={inputClass} value={movementForm.quantity} onChange={(event) => setMovementForm({ ...movementForm, quantity: event.target.value })} /></Field>
                        <Field label="Motivo ou observação"><input className={inputClass} value={movementForm.notes} onChange={(event) => setMovementForm({ ...movementForm, notes: event.target.value })} placeholder="Ex.: uso no lote 03" /></Field>
                        <SaveButton disabled={saving || allBatches.length === 0}>Salvar movimentação</SaveButton>
                    </form>
                </FormCard>
            </div>

            <section className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-[var(--eixo-text)]">Produtos da Farmácia</h3>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Pesquise e filtre antes de consultar lotes e informações sanitárias.</p>
                    </div>
                    <p className="text-sm font-semibold text-[var(--eixo-text-muted)]">{filteredProducts.length} de {products.length} produtos</p>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_220px]">
                    <label className="block">
                        <span className={labelClass}>Pesquisar</span>
                        <input className={inputClass} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nome, princípio ativo ou fabricante" />
                    </label>
                    <Field label="Categoria"><select className={inputClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="ALL">Todas</option>{PRODUCT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                    <Field label="Situação"><select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Todas</option><option value="REGULAR">Regular</option><option value="LOW">Estoque baixo</option><option value="EXPIRING">Próximo do vencimento</option><option value="EXPIRED">Vencido</option></select></Field>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {filteredProducts.length === 0 ? (
                        <div className="col-span-full rounded-xl border border-dashed border-[var(--eixo-border)] px-4 py-10 text-center text-sm text-[var(--eixo-text-muted)]">Nenhum produto encontrado com esses filtros.</div>
                    ) : filteredProducts.map((product) => {
                        const status = getProductStatus(product);
                        const isExpanded = expandedProductId === product.id;
                        const nextExpiry = product.batches.filter((batch) => batch.quantity > 0 && batch.expiresAt).sort((a, b) => new Date(a.expiresAt || 0).getTime() - new Date(b.expiresAt || 0).getTime())[0];
                        return (
                            <article key={product.id} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                                <button type="button" className="w-full text-left" onClick={() => setExpandedProductId(isExpanded ? null : product.id)} aria-expanded={isExpanded}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div><h4 className="font-bold text-[var(--eixo-text)]">{product.name}</h4><p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">{product.activeIngredient || 'Princípio ativo não informado'} · {CATEGORY_LABELS[product.category] || product.category}</p></div>
                                        <StatusBadge status={status} />
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                                        <ProductMetric label="Saldo" value={`${product.totalStock.toLocaleString('pt-BR')} ${product.unit}`} />
                                        <ProductMetric label="Lotes" value={String(product.batches.length)} />
                                        <ProductMetric label="Próxima validade" value={nextExpiry?.expiresAt ? new Date(nextExpiry.expiresAt).toLocaleDateString('pt-BR') : 'Não informada'} />
                                    </div>
                                    <p className="mt-3 text-xs font-semibold text-[var(--eixo-text-muted)]">{isExpanded ? 'Ocultar detalhes ↑' : 'Ver detalhes e lotes ↓'}</p>
                                </button>
                                {isExpanded && (
                                    <div className="mt-4 border-t border-[var(--eixo-border)] pt-4">
                                        <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                                            <Detail label="Fabricante" value={product.manufacturer} />
                                            <Detail label="Apresentação" value={product.presentation} />
                                            <Detail label="Armazenamento" value={product.storageLocation} />
                                            <Detail label="Refrigeração" value={product.refrigerated ? 'Obrigatória' : 'Não informada como necessária'} />
                                            <Detail label="Carência para abate" value={product.slaughterWithdrawalDays === null ? null : `${product.slaughterWithdrawalDays} dias`} />
                                            <Detail label="Carência para leite" value={product.milkWithdrawalDays === null ? null : `${product.milkWithdrawalDays} dias`} />
                                        </dl>
                                        {product.notes && <p className="mt-3 rounded-xl bg-[var(--eixo-surface)] px-3 py-2 text-xs text-[var(--eixo-text-muted)]">{product.notes}</p>}
                                        <div className="mt-3 space-y-2">
                                            {product.batches.length === 0 ? <p className="text-xs text-[var(--eixo-text-muted)]">Nenhum lote cadastrado.</p> : product.batches.map((batch) => <div key={batch.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-[var(--eixo-surface)] px-3 py-2 text-xs"><span className="font-semibold">Lote {batch.lotNumber}</span><span>Saldo: {batch.quantity.toLocaleString('pt-BR')} {product.unit}</span><span>Validade: {batch.expiresAt ? new Date(batch.expiresAt).toLocaleDateString('pt-BR') : 'não informada'}</span></div>)}
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                <div className="border-b border-[var(--eixo-border)] px-5 py-4"><h3 className="font-bold text-[var(--eixo-text)]">Estoque atual</h3><p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Saldos separados por produto e lote.</p></div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-[var(--eixo-surface-soft)] text-xs uppercase text-[var(--eixo-text-muted)]"><tr><th className="px-5 py-3">Produto</th><th className="px-5 py-3">Categoria</th><th className="px-5 py-3">Lote</th><th className="px-5 py-3">Validade</th><th className="px-5 py-3 text-right">Saldo</th><th className="px-5 py-3">Situação</th></tr></thead>
                        <tbody className="divide-y divide-[var(--eixo-border)]">
                            {filteredBatches.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-[var(--eixo-text-muted)]">Nenhum lote encontrado.</td></tr> : filteredBatches.map((batch) => {
                                const low = batch.product.totalStock <= batch.product.minStock;
                                const expired = batch.expiresAt ? new Date(batch.expiresAt).getTime() < Date.now() : false;
                                return <tr key={batch.id}><td className="px-5 py-3"><p className="font-semibold text-[var(--eixo-text)]">{batch.product.name}</p>{batch.product.activeIngredient && <p className="text-xs text-[var(--eixo-text-muted)]">{batch.product.activeIngredient}</p>}</td><td className="px-5 py-3 text-[var(--eixo-text-muted)]">{CATEGORY_LABELS[batch.product.category] || batch.product.category}</td><td className="px-5 py-3">{batch.lotNumber}</td><td className="px-5 py-3">{batch.expiresAt ? new Date(batch.expiresAt).toLocaleDateString('pt-BR') : 'Não informada'}</td><td className="px-5 py-3 text-right font-bold">{batch.quantity.toLocaleString('pt-BR')} {batch.product.unit}</td><td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${expired || low ? 'bg-[#fff2ef] text-[var(--eixo-danger)]' : 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]'}`}>{expired ? 'Vencido' : low ? 'Estoque baixo' : 'Regular'}</span></td></tr>;
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                <h3 className="font-bold text-[var(--eixo-text)]">Movimentações recentes</h3>
                <div className="mt-3 space-y-2">{movements.length === 0 ? <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma movimentação registrada.</p> : movements.slice(0, 10).map((movement) => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--eixo-surface-soft)] px-4 py-3 text-sm"><div><span className="font-semibold text-[var(--eixo-text)]">{movement.product.name}</span><span className="ml-2 text-[var(--eixo-text-muted)]">Lote {movement.batch.lotNumber}</span>{movement.notes && <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">{movement.notes}</p>}</div><div className="text-right"><p className={`font-bold ${movement.type === 'EXIT' || movement.quantity < 0 ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-success)]'}`}>{movement.type === 'EXIT' ? '-' : movement.quantity > 0 ? '+' : ''}{Math.abs(movement.quantity).toLocaleString('pt-BR')} {movement.product.unit}</p><p className="text-xs text-[var(--eixo-text-muted)]">{new Date(movement.createdAt).toLocaleString('pt-BR')}</p></div></div>)}</div>
            </section>
        </div>
    );
};

const Summary: React.FC<{ label: string; value: number; attention?: boolean; currency?: boolean }> = ({ label, value, attention, currency }) => <div className={`rounded-2xl border p-4 ${attention ? 'border-[#efc2ba] bg-[#fff2ef]' : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)]'}`}><p className="text-xs font-semibold uppercase tracking-wide text-[var(--eixo-text-muted)]">{label}</p><p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{currency ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : value}</p></div>;
const STATUS_CONTENT: Record<string, { label: string; className: string }> = { REGULAR: { label: 'Regular', className: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }, LOW: { label: 'Estoque baixo', className: 'bg-[#fffbeb] text-[#92400e]' }, EXPIRING: { label: 'Próximo do vencimento', className: 'bg-[#fffbeb] text-[#92400e]' }, EXPIRED: { label: 'Vencido', className: 'bg-[#fff2ef] text-[var(--eixo-danger)]' } };
const StatusBadge: React.FC<{ status: string }> = ({ status }) => { const content = STATUS_CONTENT[status] || STATUS_CONTENT.REGULAR; return <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${content.className}`}>{content.label}</span>; };
const ProductMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => <div><p className="text-[10px] font-semibold uppercase text-[var(--eixo-text-muted)]">{label}</p><p className="mt-0.5 font-bold text-[var(--eixo-text)]">{value}</p></div>;
const Detail: React.FC<{ label: string; value: string | null }> = ({ label, value }) => <div><dt className="text-xs font-semibold text-[var(--eixo-text-muted)]">{label}</dt><dd className="mt-0.5 font-medium text-[var(--eixo-text)]">{value || 'Não informado'}</dd></div>;
const FormCard: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => <section className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5"><h3 className="font-bold text-[var(--eixo-text)]">{title}</h3><p className="mb-4 mt-1 text-xs text-[var(--eixo-text-muted)]">{description}</p>{children}</section>;
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className={labelClass}>{label}</span>{children}</label>;
const SaveButton: React.FC<{ disabled: boolean; children: React.ReactNode }> = ({ disabled, children }) => <button type="submit" disabled={disabled} className="w-full rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;

export default PharmacyModule;
