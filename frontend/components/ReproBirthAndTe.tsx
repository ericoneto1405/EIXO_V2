import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../api';
import {
    createBirthAnimal,
    createEmbryoTransfer,
    listAnimals,
    listEmbryoTransfers,
    type EmbryoTransfer,
    type HerdAnimal,
    type HerdType,
} from '../adapters/herdApi';

const todayISO = () => new Date().toISOString().slice(0, 10);
const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm focus:border-[var(--eixo-green)] focus:outline-none';
const labelClass = 'block text-xs font-medium text-[var(--eixo-text-muted)]';

const HerdTypeSelector: React.FC<{ value: HerdType; onChange: (value: HerdType) => void }> = ({ value, onChange }) => (
    <div className="grid grid-cols-2 gap-2">
        {(['COMMERCIAL', 'PO'] as HerdType[]).map((option) => (
            <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${value === option ? 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] text-[var(--eixo-text)]' : 'border-[var(--eixo-border)] text-[var(--eixo-text-muted)]'}`}>
                {option === 'COMMERCIAL' ? 'Rebanho comercial' : 'Plantel P.O.'}
            </button>
        ))}
    </div>
);

const isFemale = (animal: HerdAnimal) => ['FÊMEA', 'FEMEA'].includes(String(animal.sexo || '').toUpperCase());
const isMale = (animal: HerdAnimal) => String(animal.sexo || '').toUpperCase() === 'MACHO';
const animalLabel = (animal: HerdAnimal) => animal.identificacao || animal.brinco || animal.registro || animal.nome || 'Sem identificação';

export const BirthRegistrationPanel: React.FC<{ farmId: string; onRegistered?: () => void }> = ({ farmId, onRegistered }) => {
    const [herdType, setHerdType] = useState<HerdType>('COMMERCIAL');
    const [origin, setOrigin] = useState<'NATURAL' | 'TE'>('NATURAL');
    const [animals, setAnimals] = useState<HerdAnimal[]>([]);
    const [transfers, setTransfers] = useState<EmbryoTransfer[]>([]);
    const [form, setForm] = useState({ motherId: '', fatherId: '', transferId: '', date: todayISO(), sex: 'Fêmea', weight: '', name: '' });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!farmId) return;
        setLoading(true);
        setError(null);
        try {
            const [animalRows, transferRows] = await Promise.all([
                listAnimals(farmId, herdType),
                listEmbryoTransfers(farmId, herdType),
            ]);
            setAnimals(animalRows);
            setTransfers(transferRows);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível carregar matrizes e transferências.');
        } finally {
            setLoading(false);
        }
    }, [farmId, herdType]);

    useEffect(() => { void loadData(); }, [loadData]);
    useEffect(() => {
        setOrigin('NATURAL');
        setForm({ motherId: '', fatherId: '', transferId: '', date: todayISO(), sex: 'Fêmea', weight: '', name: '' });
        setSuccess(null);
    }, [herdType]);

    const females = useMemo(() => animals.filter(isFemale), [animals]);
    const males = useMemo(() => animals.filter(isMale), [animals]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        if (origin === 'NATURAL' && !form.motherId) return setError('Selecione a matriz.');
        if (origin === 'TE' && !form.transferId) return setError('Selecione a transferência de embrião pendente.');
        setSaving(true);
        try {
            const result = await createBirthAnimal({
                farmId,
                maeId: origin === 'NATURAL' ? form.motherId : undefined,
                paiId: herdType === 'PO' && origin === 'NATURAL' && form.fatherId ? form.fatherId : undefined,
                embryoTransferId: origin === 'TE' ? form.transferId : undefined,
                origemNascimento: origin,
                dataNascimento: form.date,
                sexo: form.sex,
                pesoNascimento: form.weight ? Number(form.weight) : undefined,
                nome: form.name || undefined,
            }, herdType);
            setSuccess(`Parto registrado e cria cadastrada${result.animal?.brinco ? `: ${result.animal.brinco}` : ''}.`);
            setForm({ motherId: '', fatherId: '', transferId: '', date: todayISO(), sex: 'Fêmea', weight: '', name: '' });
            await loadData();
            onRegistered?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao registrar parto e nascimento.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-5">
            <div>
                <h3 className="text-base font-bold text-[var(--eixo-text)]">Registrar parto e nascimento</h3>
                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">A matriz será atualizada e a cria entrará no rebanho na mesma operação.</p>
            </div>
            <HerdTypeSelector value={herdType} onChange={setHerdType} />
            <div className="grid grid-cols-2 gap-2">
                {(['NATURAL', 'TE'] as const).map((value) => (
                    <button key={value} type="button" onClick={() => setOrigin(value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${origin === value ? 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)]' : 'border-[var(--eixo-border)]'}`}>
                        {value === 'NATURAL' ? 'Parto natural' : 'Nascimento por TE'}
                    </button>
                ))}
            </div>
            {loading ? <p className="text-sm text-[var(--eixo-text-muted)]">Carregando…</p> : origin === 'NATURAL' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <label className={labelClass}>Matriz</label>
                        <select value={form.motherId} onChange={(e) => setForm((prev) => ({ ...prev, motherId: e.target.value }))} className={inputClass} required>
                            <option value="">Selecione</option>
                            {females.map((animal) => <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>)}
                        </select>
                    </div>
                    {herdType === 'PO' && <div>
                        <label className={labelClass}>Pai biológico (opcional)</label>
                        <select value={form.fatherId} onChange={(e) => setForm((prev) => ({ ...prev, fatherId: e.target.value }))} className={inputClass}>
                            <option value="">Não informado</option>
                            {males.map((animal) => <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>)}
                        </select>
                    </div>}
                </div>
            ) : (
                <div>
                    <label className={labelClass}>Transferência pendente</label>
                    <select value={form.transferId} onChange={(e) => setForm((prev) => ({ ...prev, transferId: e.target.value }))} className={inputClass} required>
                        <option value="">Selecione receptora e doadora</option>
                        {transfers.map((transfer) => <option key={transfer.id} value={transfer.id}>Receptora {transfer.recipientSnapshot} · Doadora {transfer.donorSnapshot}</option>)}
                    </select>
                    {!transfers.length && <p className="mt-1 text-xs text-[var(--eixo-danger)]">Nenhuma transferência pendente.</p>}
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><label className={labelClass}>Data do parto</label><input type="date" max={todayISO()} value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} className={inputClass} required /></div>
                <div><label className={labelClass}>Sexo da cria</label><select value={form.sex} onChange={(e) => setForm((prev) => ({ ...prev, sex: e.target.value }))} className={inputClass}><option>Fêmea</option><option>Macho</option></select></div>
                <div><label className={labelClass}>Peso ao nascer (kg)</label><input type="number" min="0.1" step="0.1" value={form.weight} onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>Nome da cria (opcional)</label><input type="text" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className={inputClass} /></div>
            </div>
            {error && <p className="rounded-xl bg-[#fff2ef] px-3 py-2 text-sm text-[var(--eixo-danger)]">{error}</p>}
            {success && <p className="rounded-xl bg-[var(--eixo-green-soft)] px-3 py-2 text-sm text-[var(--eixo-success)]">{success}</p>}
            <button type="submit" disabled={saving || loading} className="w-full rounded-xl bg-[var(--eixo-green)] py-2.5 text-sm font-bold text-[#1a1a1a] disabled:opacity-50">
                {saving ? 'Registrando…' : 'Registrar parto e nascimento'}
            </button>
        </form>
    );
};

export const EmbryoTransferPanel: React.FC<{ farmId: string }> = ({ farmId }) => {
    const [herdType, setHerdType] = useState<HerdType>('COMMERCIAL');
    const [animals, setAnimals] = useState<HerdAnimal[]>([]);
    const [batches, setBatches] = useState<Array<{ id: string; lote: string; tecnica: string; quantidadeDisponivel: number }>>([]);
    const [transfers, setTransfers] = useState<EmbryoTransfer[]>([]);
    const [form, setForm] = useState({ embryoBatchId: '', recipientId: '', transferredAt: todayISO(), notes: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!farmId) return;
        setError(null);
        try {
            const [animalRows, transferRows, response] = await Promise.all([
                listAnimals(farmId, herdType),
                listEmbryoTransfers(farmId, herdType),
                fetch(buildApiUrl(`/po/embryos?farmId=${encodeURIComponent(farmId)}`), { credentials: 'include' }),
            ]);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar lotes de embrião.');
            setAnimals(animalRows);
            setTransfers(transferRows);
            setBatches((payload.batches || []).filter((batch: any) => batch.tecnica === 'TE' && batch.quantidadeDisponivel > 0));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados de TE.');
        }
    }, [farmId, herdType]);

    useEffect(() => { void loadData(); }, [loadData]);
    useEffect(() => { setForm({ embryoBatchId: '', recipientId: '', transferredAt: todayISO(), notes: '' }); }, [herdType]);
    const females = useMemo(() => animals.filter(isFemale), [animals]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await createEmbryoTransfer({ farmId, herdType, ...form });
            setSuccess('Transferência registrada. O estoque do embrião e a receptora foram atualizados.');
            setForm({ embryoBatchId: '', recipientId: '', transferredAt: todayISO(), notes: '' });
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao registrar transferência de embrião.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <form onSubmit={submit} className="space-y-4">
                <div><h3 className="text-base font-bold text-[var(--eixo-text)]">Transferência de embrião</h3><p className="mt-1 text-xs text-[var(--eixo-text-muted)]">A baixa do estoque e o vínculo com a receptora são feitos juntos.</p></div>
                <HerdTypeSelector value={herdType} onChange={setHerdType} />
                <div className="grid gap-3 sm:grid-cols-2">
                    <div><label className={labelClass}>Lote de embrião</label><select required value={form.embryoBatchId} onChange={(e) => setForm((prev) => ({ ...prev, embryoBatchId: e.target.value }))} className={inputClass}><option value="">Selecione</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.lote} · {batch.quantidadeDisponivel} disponível(is)</option>)}</select></div>
                    <div><label className={labelClass}>Receptora</label><select required value={form.recipientId} onChange={(e) => setForm((prev) => ({ ...prev, recipientId: e.target.value }))} className={inputClass}><option value="">Selecione</option>{females.map((animal) => <option key={animal.id} value={animal.id}>{animalLabel(animal)}</option>)}</select></div>
                    <div><label className={labelClass}>Data da transferência</label><input required type="date" value={form.transferredAt} onChange={(e) => setForm((prev) => ({ ...prev, transferredAt: e.target.value }))} className={inputClass} /></div>
                    <div><label className={labelClass}>Observações</label><input type="text" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className={inputClass} /></div>
                </div>
                {error && <p className="rounded-xl bg-[#fff2ef] px-3 py-2 text-sm text-[var(--eixo-danger)]">{error}</p>}
                {success && <p className="rounded-xl bg-[var(--eixo-green-soft)] px-3 py-2 text-sm text-[var(--eixo-success)]">{success}</p>}
                <button type="submit" disabled={saving || !form.embryoBatchId || !form.recipientId} className="w-full rounded-xl bg-[var(--eixo-green)] py-2.5 text-sm font-bold text-[#1a1a1a] disabled:opacity-50">{saving ? 'Registrando…' : 'Registrar transferência de embrião'}</button>
            </form>
            <div className="border-t border-[var(--eixo-border)] pt-4">
                <h3 className="text-sm font-semibold text-[var(--eixo-text)]">Transferências pendentes</h3>
                {transfers.length === 0 ? <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Nenhuma transferência pendente.</p> : <ul className="mt-3 space-y-2">{transfers.map((transfer) => <li key={transfer.id} className="rounded-xl border border-[var(--eixo-border)] px-3 py-2 text-sm text-[var(--eixo-text)]">Receptora {transfer.recipientSnapshot} · Doadora {transfer.donorSnapshot} · {new Date(transfer.transferredAt).toLocaleDateString('pt-BR')}</li>)}</ul>}
            </div>
        </div>
    );
};
