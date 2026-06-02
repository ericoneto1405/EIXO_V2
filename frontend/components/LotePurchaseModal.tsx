import React, { useState, useEffect, useCallback } from 'react';
import { buildApiUrl } from '../api';

interface Paddock {
    id: string;
    name: string;
}

interface Lot {
    id: string;
    name: string;
}

interface AnimalRow {
    _id: string;
    brinco: string;
    sexo: 'Macho' | 'Fêmea';
    raca: string;
    peso: string;
}

interface LotePurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    farmId: string;
    paddocks: Paddock[];
    lots: Lot[];
    onSuccess: () => void;
}

let _rowCounter = 0;
const newRow = (racaPadrao = ''): AnimalRow => ({
    _id: `row-${++_rowCounter}`,
    brinco: '',
    sexo: 'Macho',
    raca: racaPadrao,
    peso: '',
});

const inputCls =
    'w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm focus:border-[var(--eixo-green)] focus:outline-none';

const parseImportNumber = (raw: string): number | null => {
    const cleaned = String(raw ?? '').trim().replace(/[^\d,.\-]/g, '');
    if (!cleaned) return null;
    const commaIndex = cleaned.lastIndexOf(',');
    const dotIndex = cleaned.lastIndexOf('.');
    let normalized = cleaned;
    if (commaIndex >= 0 && dotIndex >= 0) {
        normalized = commaIndex > dotIndex
            ? cleaned.replace(/\./g, '').replace(',', '.')
            : cleaned.replace(/,/g, '');
    } else if (commaIndex >= 0) {
        normalized = cleaned.replace(',', '.');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const LotePurchaseModal: React.FC<LotePurchaseModalProps> = ({
    isOpen,
    onClose,
    farmId,
    paddocks,
    lots,
    onSuccess,
}) => {
    const today = new Date().toISOString().slice(0, 10);

    // ── campos gerais ──
    const [dataCompra, setDataCompra] = useState(today);
    const [valorPorCabeca, setValorPorCabeca] = useState('');
    const [paddockId, setPaddockId] = useState('');
    const [lotId, setLotId] = useState('');
    const [racaPadrao, setRacaPadrao] = useState('');

    // ── linhas de animais ──
    const [rows, setRows] = useState<AnimalRow[]>([newRow()]);

    // ── feedback ──
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // reset ao abrir
    useEffect(() => {
        if (!isOpen) return;
        setDataCompra(today);
        setValorPorCabeca('');
        setPaddockId(paddocks[0]?.id ?? '');
        setLotId('');
        setRacaPadrao('');
        setRows([newRow()]);
        setError(null);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const addRow = useCallback(() => {
        setRows((prev) => [...prev, newRow(racaPadrao)]);
    }, [racaPadrao]);

    const removeRow = (id: string) => {
        setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
    };

    const updateRow = (id: string, field: keyof AnimalRow, value: string) => {
        setRows((prev) => prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)));
    };

    // Quando raça padrão muda, propaga para linhas que ainda não foram preenchidas manualmente
    const handleRacaPadraoChange = (value: string) => {
        setRacaPadrao(value);
        setRows((prev) =>
            prev.map((r) => (r.raca === racaPadrao || r.raca === '' ? { ...r, raca: value } : r)),
        );
    };

    const valorTotal =
        rows.length * (parseFloat(valorPorCabeca.replace(',', '.')) || 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!paddockId) { setError('Selecione o pasto de destino.'); return; }

        const validRows = rows.filter((r) => r.brinco.trim());
        if (validRows.length === 0) { setError('Informe pelo menos um brinco.'); return; }

        const dupBrincos = validRows.map((r) => r.brinco.trim().toLowerCase());
        if (new Set(dupBrincos).size !== dupBrincos.length) {
            setError('Há brincos duplicados na lista.'); return;
        }

        const invalidWeightRow = validRows.find((r) => r.peso.trim() && ((parseImportNumber(r.peso) ?? 0) <= 0));
        if (invalidWeightRow) {
            setError(`Peso inválido para o animal ${invalidWeightRow.brinco.trim()}.`);
            return;
        }

        const animals = validRows.map((r) => ({
            brinco: r.brinco.trim(),
            raca: r.raca.trim() || racaPadrao.trim() || 'Indefinida',
            sexo: r.sexo,
            ultimoPeso: r.peso ? parseImportNumber(r.peso) ?? undefined : undefined,
        }));

        setSaving(true);
        try {
            const resp = await fetch(buildApiUrl('/animals/batch'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    farmId,
                    paddockId,
                    lotId: lotId || undefined,
                    dataCompra,
                    valorPorCabeca: valorPorCabeca
                        ? parseImportNumber(valorPorCabeca) ?? undefined
                        : undefined,
                    animals,
                }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data?.message || 'Erro ao salvar lote.');
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro inesperado.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div
                className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-[var(--eixo-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-5">
                    <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">
                            Manejo do Rebanho
                        </p>
                        <h3 className="text-xl font-extrabold text-[var(--eixo-text)]">Entrada de lote</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                        aria-label="Fechar"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">

                        {/* Campos gerais do lote */}
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">
                                Dados gerais da compra
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">Data da compra</label>
                                    <input
                                        type="date"
                                        value={dataCompra}
                                        onChange={(e) => setDataCompra(e.target.value)}
                                        className={`mt-1 ${inputCls}`}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">
                                        Valor por cabeça (R$)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={valorPorCabeca}
                                        onChange={(e) => setValorPorCabeca(e.target.value)}
                                        placeholder="0,00"
                                        className={`mt-1 ${inputCls}`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">Raça padrão</label>
                                    <input
                                        type="text"
                                        value={racaPadrao}
                                        onChange={(e) => handleRacaPadraoChange(e.target.value)}
                                        placeholder="Nelore, Angus..."
                                        className={`mt-1 ${inputCls}`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">Pasto de destino</label>
                                    <select
                                        value={paddockId}
                                        onChange={(e) => setPaddockId(e.target.value)}
                                        className={`mt-1 ${inputCls}`}
                                        required
                                    >
                                        <option value="">Selecione...</option>
                                        {paddocks.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">Lote (opcional)</label>
                                    <select
                                        value={lotId}
                                        onChange={(e) => setLotId(e.target.value)}
                                        className={`mt-1 ${inputCls}`}
                                    >
                                        <option value="">Sem lote</option>
                                        {lots.map((l) => (
                                            <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Tabela de animais */}
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] overflow-hidden">
                            <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-4 py-3">
                                <p className="text-sm font-bold text-[var(--eixo-text)]">
                                    Animais&nbsp;
                                    <span className="ml-1 rounded-full bg-[var(--eixo-green-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--eixo-graphite)]">
                                        {rows.length}
                                    </span>
                                </p>
                                <button
                                    type="button"
                                    onClick={addRow}
                                    className="flex items-center gap-1.5 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Adicionar linha
                                </button>
                            </div>

                            {/* cabeçalho da tabela */}
                            <div className="grid grid-cols-[2fr_1.2fr_1.5fr_1fr_32px] gap-2 border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                                <span>Brinco</span>
                                <span>Sexo</span>
                                <span>Raça</span>
                                <span>Peso (kg)</span>
                                <span />
                            </div>

                            <div className="max-h-64 overflow-y-auto divide-y divide-[#f0e8dc]">
                                {rows.map((row, idx) => (
                                    <div
                                        key={row._id}
                                        className="grid grid-cols-[2fr_1.2fr_1.5fr_1fr_32px] items-center gap-2 px-4 py-2"
                                    >
                                        <input
                                            type="text"
                                            value={row.brinco}
                                            onChange={(e) => updateRow(row._id, 'brinco', e.target.value)}
                                            placeholder={`#${idx + 1}`}
                                            className={inputCls}
                                        />
                                        <select
                                            value={row.sexo}
                                            onChange={(e) => updateRow(row._id, 'sexo', e.target.value)}
                                            className={inputCls}
                                        >
                                            <option>Macho</option>
                                            <option>Fêmea</option>
                                        </select>
                                        <input
                                            type="text"
                                            value={row.raca}
                                            onChange={(e) => updateRow(row._id, 'raca', e.target.value)}
                                            placeholder={racaPadrao || 'Raça'}
                                            className={inputCls}
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            value={row.peso}
                                            onChange={(e) => updateRow(row._id, 'peso', e.target.value)}
                                            placeholder="—"
                                            className={inputCls}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeRow(row._id)}
                                            disabled={rows.length === 1}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--eixo-text-muted)] hover:bg-[#fff2ef] hover:text-[var(--eixo-danger)] disabled:opacity-30"
                                            aria-label="Remover linha"
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Resumo */}
                        {(rows.length > 0 || valorTotal > 0) && (
                            <div className="flex items-center justify-between rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-5 py-3">
                                <span className="text-sm text-[var(--eixo-text-muted)]">
                                    <strong className="text-[var(--eixo-text)]">{rows.filter((r) => r.brinco.trim()).length}</strong> animais
                                </span>
                                {valorTotal > 0 && (
                                    <span className="text-sm text-[var(--eixo-text-muted)]">
                                        Total:{' '}
                                        <strong className="text-[var(--eixo-text)]">
                                            {valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </strong>
                                        {' '}→ cai no Financeiro automaticamente
                                    </span>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 border-t border-[var(--eixo-border)] px-6 py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-60"
                        >
                            {saving ? 'Salvando...' : `Salvar ${rows.filter((r) => r.brinco.trim()).length} animal(is)`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LotePurchaseModal;
