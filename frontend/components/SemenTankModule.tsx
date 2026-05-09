import React, { useEffect, useMemo, useState } from 'react';
import type { AnimalUI } from '../types';
import {
  SemenBatchUI,
  createSemenBatch,
  listInventoryAnimals,
  listSemenBatches,
  moveSemenBatch,
  updateSemenBatch,
} from '../adapters/geneticInventoryApi';

interface SemenTankModuleProps {
  farmId?: string | null;
  farmName?: string | null;
}

type MoveType = 'IN' | 'OUT' | 'USE' | 'ADJUST';

const emptyForm = {
  bullAnimalId: '',
  bullName: '',
  bullRegistry: '',
  fornecedor: '',
  lote: '',
  dataColeta: '',
  dosesTotal: '',
  dosesDisponiveis: '',
  localArmazenamento: '',
  observacoes: '',
};

const moveLabels: Record<MoveType, string> = {
  IN: 'Entrada',
  OUT: 'Saída',
  USE: 'Uso em IATF',
  ADJUST: 'Ajuste de saldo',
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('pt-BR') : 'Sem data');

const getBullLabel = (batch: SemenBatchUI) => {
  if (batch.bullAnimal) {
    return batch.bullAnimal.registro || batch.bullAnimal.brinco || 'Touro do rebanho';
  }
  if (batch.bullPoAnimal) {
    return batch.bullPoAnimal.nome || batch.bullPoAnimal.registro || batch.bullPoAnimal.brinco || 'Touro P.O. legado';
  }
  return batch.bullName || 'Touro externo';
};

const SemenTankModule: React.FC<SemenTankModuleProps> = ({ farmId, farmName }) => {
  const [animals, setAnimals] = useState<AnimalUI[]>([]);
  const [batches, setBatches] = useState<SemenBatchUI[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SemenBatchUI | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [moveTarget, setMoveTarget] = useState<SemenBatchUI | null>(null);
  const [moveForm, setMoveForm] = useState({ type: 'IN' as MoveType, qty: '', date: new Date().toISOString().slice(0, 10), notes: '' });

  const bulls = useMemo(() => animals.filter((animal) => String(animal.sexo || '').toUpperCase().includes('MACHO')), [animals]);
  const totals = useMemo(() => ({
    lots: batches.length,
    total: batches.reduce((sum, batch) => sum + batch.dosesTotal, 0),
    available: batches.reduce((sum, batch) => sum + batch.dosesDisponiveis, 0),
    linked: batches.filter((batch) => batch.bullAnimalId || batch.bullAnimal).length,
  }), [batches]);

  const filteredBatches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return batches;
    return batches.filter((batch) => [
      batch.lote,
      getBullLabel(batch),
      batch.bullRegistry,
      batch.fornecedor,
      batch.localArmazenamento,
    ].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [batches, search]);

  const loadData = async () => {
    if (!farmId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextAnimals, nextBatches] = await Promise.all([
        listInventoryAnimals(farmId),
        listSemenBatches(farmId),
      ]);
      setAnimals(nextAnimals);
      setBatches(nextBatches);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar botijão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, [farmId]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError(null);
    setMessage(null);
  };

  const openEdit = (batch: SemenBatchUI) => {
    setEditing(batch);
    setForm({
      bullAnimalId: batch.bullAnimalId || '',
      bullName: batch.bullName || '',
      bullRegistry: batch.bullRegistry || '',
      fornecedor: batch.fornecedor || '',
      lote: batch.lote || '',
      dataColeta: batch.dataColeta ? batch.dataColeta.slice(0, 10) : '',
      dosesTotal: String(batch.dosesTotal ?? ''),
      dosesDisponiveis: String(batch.dosesDisponiveis ?? ''),
      localArmazenamento: batch.localArmazenamento || '',
      observacoes: batch.observacoes || '',
    });
    setFormOpen(true);
    setError(null);
    setMessage(null);
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!farmId) return;
    const total = Number(form.dosesTotal);
    const available = Number(form.dosesDisponiveis);
    if (!form.lote.trim()) {
      setError('Informe o lote do sêmen.');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError('Informe doses totais válidas.');
      return;
    }
    if (!Number.isFinite(available) || available < 0 || available > total) {
      setError('Informe doses disponíveis válidas.');
      return;
    }
    if (!form.bullAnimalId && !form.bullName.trim()) {
      setError('Escolha um touro do Rebanho ou informe um touro externo.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        farmId,
        bullAnimalId: form.bullAnimalId || null,
        bullName: form.bullAnimalId ? '' : form.bullName.trim(),
        bullRegistry: form.bullRegistry.trim(),
        fornecedor: form.fornecedor.trim(),
        lote: form.lote.trim(),
        dataColeta: form.dataColeta,
        dosesTotal: total,
        dosesDisponiveis: available,
        localArmazenamento: form.localArmazenamento.trim(),
        observacoes: form.observacoes.trim(),
      };
      if (editing) {
        await updateSemenBatch(editing.id, payload);
        setMessage('Lote de sêmen atualizado.');
      } else {
        await createSemenBatch(payload);
        setMessage('Lote de sêmen cadastrado no botijão.');
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar lote de sêmen.');
    } finally {
      setSaving(false);
    }
  };

  const submitMove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!moveTarget) return;
    const qty = Number(moveForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Informe uma quantidade válida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await moveSemenBatch(moveTarget.id, { type: moveForm.type, qty, date: moveForm.date, notes: moveForm.notes.trim() });
      setMoveTarget(null);
      setMessage('Movimentação registrada.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao movimentar estoque.');
    } finally {
      setSaving(false);
    }
  };

  if (!farmId) {
    return <div className="rounded-2xl border border-[#d7cab3] bg-[#fffaf1] p-6 text-[#6d6558]">Selecione uma fazenda para acessar o botijão de sêmen.</div>;
  }

  return (
    <div className="space-y-6 text-[#2f3a2d]">
      <section className="rounded-[24px] border border-[#d7cab3] bg-[#fffaf1] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9d7d4d]">Estoque genético da fazenda</p>
            <h1 className="mt-2 text-3xl font-black">Botijão de sêmen</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#6d6558]">
              Controle os lotes de sêmen disponíveis na fazenda. O Eixo Acasalamento considera este estoque como disponibilidade real, junto com as centrais comerciais.
            </p>
            {farmName && <p className="mt-1 text-xs font-semibold text-[#74644e]">Fazenda: {farmName}</p>}
          </div>
          <button type="button" onClick={openCreate} className="rounded-2xl bg-[#9d7d4d] px-5 py-3 text-sm font-bold text-white hover:bg-[#8f7144]">
            Cadastrar sêmen
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <Metric label="Lotes" value={totals.lots} />
          <Metric label="Doses totais" value={totals.total} />
          <Metric label="Doses disponíveis" value={totals.available} />
          <Metric label="Vinculados ao Rebanho" value={totals.linked} />
        </div>
      </section>

      {(error || message) && (
        <div className={`rounded-2xl border p-4 text-sm font-semibold ${error ? 'border-[#e5c4b7] bg-[#fbede8] text-[#8c4d39]' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <section className="rounded-[24px] border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">Lotes no botijão</h2>
            <p className="text-sm text-[#6d6558]">Use touro do Rebanho quando ele existir na fazenda. Para sêmen comprado de central, use touro externo com registro.</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar lote, touro, registro ou local"
            className="rounded-2xl border border-[#d7cab3] bg-white px-4 py-2 text-sm outline-none focus:border-[#9d7d4d] md:w-80"
          />
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-[#d7cab3] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f1e7d8] text-xs uppercase tracking-wide text-[#74644e]">
              <tr>
                <th className="px-4 py-3">Touro</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Doses</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Local</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6d6558]">Carregando botijão...</td></tr>
              ) : filteredBatches.length ? filteredBatches.map((batch) => (
                <tr key={batch.id} className="border-t border-[#eadfce]">
                  <td className="px-4 py-3">
                    <div className="font-bold">{getBullLabel(batch)}</div>
                    <div className="text-xs text-[#6d6558]">{batch.bullRegistry || batch.bullAnimal?.registro || batch.bullPoAnimal?.registro || 'sem registro informado'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{batch.lote}</div>
                    <div className="text-xs text-[#6d6558]">Coleta: {formatDate(batch.dataColeta)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <strong>{batch.dosesDisponiveis}</strong> / {batch.dosesTotal}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#f1e7d8] px-2 py-1 text-xs font-bold text-[#74644e]">
                      {batch.bullAnimalId || batch.bullAnimal ? 'Rebanho' : batch.bullPoAnimalId ? 'Legado P.O.' : 'Externo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6d6558]">{batch.localArmazenamento || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(batch)} className="mr-2 rounded-xl border border-[#d7cab3] px-3 py-1.5 font-semibold text-[#74644e] hover:bg-[#f1e7d8]">Editar</button>
                    <button type="button" onClick={() => { setMoveTarget(batch); setMoveForm({ type: 'USE', qty: '', date: new Date().toISOString().slice(0, 10), notes: '' }); }} className="rounded-xl bg-[#9d7d4d] px-3 py-1.5 font-semibold text-white hover:bg-[#8f7144]">Movimentar</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[#6d6558]">Nenhum lote de sêmen cadastrado. Cadastre o estoque do botijão para o Eixo Acasalamento considerar essas doses.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {formOpen && (
        <Modal title={editing ? 'Editar lote de sêmen' : 'Cadastrar lote de sêmen'} onClose={() => setFormOpen(false)}>
          <form onSubmit={submitForm} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-[#2f3a2d]">Touro do Rebanho</label>
              <select value={form.bullAnimalId} onChange={(event) => setForm((current) => ({ ...current, bullAnimalId: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#d7cab3] px-3 py-2 text-sm">
                <option value="">Touro externo ou central comercial</option>
                {bulls.map((animal) => <option key={animal.id} value={animal.id}>{animal.registro || animal.brinco} · {animal.raca || 'sem raça'} · {animal.tipoCadastro === 'PO' ? 'P.O.' : 'Comercial'}</option>)}
              </select>
            </div>
            {!form.bullAnimalId && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nome do touro"><input value={form.bullName} onChange={(event) => setForm((current) => ({ ...current, bullName: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
                <Field label="Registro"><input value={form.bullRegistry} onChange={(event) => setForm((current) => ({ ...current, bullRegistry: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Lote"><input value={form.lote} onChange={(event) => setForm((current) => ({ ...current, lote: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
              <Field label="Fornecedor"><input value={form.fornecedor} onChange={(event) => setForm((current) => ({ ...current, fornecedor: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
              <Field label="Doses totais"><input type="number" min="1" value={form.dosesTotal} onChange={(event) => setForm((current) => ({ ...current, dosesTotal: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
              <Field label="Doses disponíveis"><input type="number" min="0" value={form.dosesDisponiveis} onChange={(event) => setForm((current) => ({ ...current, dosesDisponiveis: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
              <Field label="Data da coleta"><input type="date" value={form.dataColeta} onChange={(event) => setForm((current) => ({ ...current, dataColeta: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
              <Field label="Local no botijão"><input value={form.localArmazenamento} onChange={(event) => setForm((current) => ({ ...current, localArmazenamento: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
            </div>
            <Field label="Observações"><textarea value={form.observacoes} onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} className="min-h-20 w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
            <Actions saving={saving} onCancel={() => setFormOpen(false)} submitLabel="Salvar lote" />
          </form>
        </Modal>
      )}

      {moveTarget && (
        <Modal title={`Movimentar ${moveTarget.lote}`} onClose={() => setMoveTarget(null)}>
          <form onSubmit={submitMove} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Tipo"><select value={moveForm.type} onChange={(event) => setMoveForm((current) => ({ ...current, type: event.target.value as MoveType }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]">{(Object.keys(moveLabels) as MoveType[]).map((key) => <option key={key} value={key}>{moveLabels[key]}</option>)}</select></Field>
              <Field label="Quantidade"><input type="number" min="1" value={moveForm.qty} onChange={(event) => setMoveForm((current) => ({ ...current, qty: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
              <Field label="Data"><input type="date" value={moveForm.date} onChange={(event) => setMoveForm((current) => ({ ...current, date: event.target.value }))} className="w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
            </div>
            <Field label="Observações"><textarea value={moveForm.notes} onChange={(event) => setMoveForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-20 w-full rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#2f3a2d] outline-none focus:border-[#9d7d4d]" /></Field>
            <Actions saving={saving} onCancel={() => setMoveTarget(null)} submitLabel="Registrar movimento" />
          </form>
        </Modal>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-2xl border border-[#d7cab3] bg-white p-4">
    <p className="text-xs font-bold uppercase tracking-wide text-[#74644e]">{label}</p>
    <p className="mt-2 text-2xl font-black text-[#2f3a2d]">{value.toLocaleString('pt-BR')}</p>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-sm font-bold text-[#2f3a2d]">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const Actions: React.FC<{ saving: boolean; onCancel: () => void; submitLabel: string }> = ({ saving, onCancel, submitLabel }) => (
  <div className="flex justify-end gap-3 pt-2">
    <button type="button" onClick={onCancel} className="rounded-xl border border-[#d7cab3] px-4 py-2 text-sm font-semibold text-[#74644e] hover:bg-[#f1e7d8]">Cancelar</button>
    <button type="submit" disabled={saving} className="rounded-xl bg-[#9d7d4d] px-4 py-2 text-sm font-bold text-white hover:bg-[#8f7144] disabled:opacity-60">{saving ? 'Salvando...' : submitLabel}</button>
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between border-b border-[#d7cab3] pb-3">
        <h3 className="text-xl font-black text-[#2f3a2d]">{title}</h3>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-[#74644e] hover:bg-[#f1e7d8]" aria-label="Fechar">x</button>
      </div>
      {children}
    </div>
  </div>
);

export default SemenTankModule;
