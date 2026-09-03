import React, { useEffect, useMemo, useState } from 'react';
import {
  CommercialAlertsUI,
  CommercialClientType,
  CommercialClientUI,
  CommercialContractUI,
  CommercialDealStage,
  CommercialDealUI,
  createClient,
  createDeal,
  createReminder,
  deleteClient,
  deleteDeal,
  deleteReminder,
  getAlerts,
  getDealContract,
  listClients,
  listDeals,
  markReminderDone,
  saveDealContract,
  updateClient,
  updateDeal,
} from '../adapters/commercialApi';

interface CommercialManagementProps {
  farmId?: string | null;
  farmName?: string | null;
}

type Tab = 'clientes' | 'pipeline' | 'alertas';

const CLIENT_TYPE_LABELS: Record<CommercialClientType, string> = {
  FRIGORIFICO: 'Frigorífico',
  PECUARISTA: 'Pecuarista',
  LEILAO_CORRETOR: 'Leilão/Corretor',
};

const STAGE_LABELS: Record<CommercialDealStage, string> = {
  PROSPECCAO: 'Prospecção',
  CONTATO: 'Contato feito',
  NEGOCIANDO: 'Negociando',
  PROPOSTA: 'Proposta enviada',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
};

const STAGE_ORDER: CommercialDealStage[] = ['PROSPECCAO', 'CONTATO', 'NEGOCIANDO', 'PROPOSTA', 'GANHO', 'PERDIDO'];

const emptyClientForm = {
  id: '' as string | null,
  name: '', type: 'PECUARISTA' as CommercialClientType, document: '', phone: '', email: '',
  city: '', state: '', birthDate: '', notes: '',
};

const emptyDealForm = {
  clientId: '', title: '', lotLabel: '', quantityAnimals: '', estimatedValue: '', expectedCloseDate: '', notes: '',
};

const inputClass = 'w-full rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-2 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const primaryBtn = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-bold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:opacity-60';
const ghostBtn = 'rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]';

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-xs font-semibold text-[var(--eixo-text-soft)]">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const CommercialManagement: React.FC<CommercialManagementProps> = ({ farmId, farmName }) => {
  const [activeTab, setActiveTab] = useState<Tab>('clientes');
  const [clients, setClients] = useState<CommercialClientUI[]>([]);
  const [deals, setDeals] = useState<CommercialDealUI[]>([]);
  const [alerts, setAlerts] = useState<CommercialAlertsUI | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [savingClient, setSavingClient] = useState(false);

  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [dealForm, setDealForm] = useState(emptyDealForm);
  const [savingDeal, setSavingDeal] = useState(false);

  const [closingDeal, setClosingDeal] = useState<{ deal: CommercialDealUI; stage: 'GANHO' | 'PERDIDO' } | null>(null);
  const [closeValue, setCloseValue] = useState('');
  const [lostReasonInput, setLostReasonInput] = useState('');

  const [contractDealId, setContractDealId] = useState<string | null>(null);
  const [contractForm, setContractForm] = useState({ commissionPct: '', commissionAmount: '', paymentTerms: '', notes: '' });
  const [contractLoading, setContractLoading] = useState(false);

  const [reminderForm, setReminderForm] = useState({ clientId: '', dueDate: '', message: '' });
  const [savingReminder, setSavingReminder] = useState(false);

  const loadAll = async () => {
    if (!farmId) return;
    setLoading(true);
    setError(null);
    try {
      const [clientsData, dealsData, alertsData] = await Promise.all([
        listClients(farmId), listDeals(farmId), getAlerts(farmId),
      ]);
      setClients(clientsData);
      setDeals(dealsData);
      setAlerts(alertsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados comerciais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); }, [farmId]);

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const dealsByStage = useMemo(() => {
    const map = new Map<CommercialDealStage, CommercialDealUI[]>();
    STAGE_ORDER.forEach((stage) => map.set(stage, []));
    deals.forEach((deal) => map.get(deal.stage)?.push(deal));
    return map;
  }, [deals]);

  if (!farmId) {
    return (
      <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 text-[var(--eixo-text-muted)]">
        Selecione uma fazenda para acessar a Gestão Comercial.
      </div>
    );
  }

  // ── Clientes ──────────────────────────────────────────────────────────
  const openNewClient = () => { setClientForm(emptyClientForm); setClientFormOpen(true); };
  const openEditClient = (client: CommercialClientUI) => {
    setClientForm({
      id: client.id, name: client.name, type: client.type, document: client.document || '',
      phone: client.phone || '', email: client.email || '', city: client.city || '', state: client.state || '',
      birthDate: client.birthDate ? client.birthDate.slice(0, 10) : '', notes: client.notes || '',
    });
    setClientFormOpen(true);
  };

  const submitClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientForm.name.trim()) { setError('Informe o nome do cliente.'); return; }
    setSavingClient(true);
    setError(null);
    try {
      const payload = {
        name: clientForm.name.trim(), type: clientForm.type, document: clientForm.document || undefined,
        phone: clientForm.phone || undefined, email: clientForm.email || undefined, city: clientForm.city || undefined,
        state: clientForm.state || undefined, birthDate: clientForm.birthDate || undefined, notes: clientForm.notes || undefined,
      };
      if (clientForm.id) {
        await updateClient(clientForm.id, payload);
      } else {
        await createClient({ farmId: farmId!, ...payload });
      }
      setClientFormOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.');
    } finally {
      setSavingClient(false);
    }
  };

  const removeClient = async (client: CommercialClientUI) => {
    if (!window.confirm(`Excluir o cliente "${client.name}"? Negociações vinculadas também serão perdidas.`)) return;
    try {
      await deleteClient(client.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir cliente.');
    }
  };

  // ── Negociações ───────────────────────────────────────────────────────
  const openNewDeal = () => { setDealForm({ ...emptyDealForm, clientId: clients[0]?.id || '' }); setDealFormOpen(true); };

  const submitDeal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dealForm.clientId) { setError('Cadastre e selecione um cliente.'); return; }
    if (!dealForm.title.trim()) { setError('Informe um título para a negociação.'); return; }
    setSavingDeal(true);
    setError(null);
    try {
      await createDeal({
        farmId: farmId!, clientId: dealForm.clientId, title: dealForm.title.trim(),
        lotLabel: dealForm.lotLabel || undefined,
        quantityAnimals: dealForm.quantityAnimals ? Number(dealForm.quantityAnimals) : undefined,
        estimatedValue: dealForm.estimatedValue ? Number(dealForm.estimatedValue) : undefined,
        expectedCloseDate: dealForm.expectedCloseDate || undefined, notes: dealForm.notes || undefined,
      });
      setDealFormOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar negociação.');
    } finally {
      setSavingDeal(false);
    }
  };

  const handleStageChange = (deal: CommercialDealUI, stage: CommercialDealStage) => {
    if (stage === 'GANHO') { setCloseValue(String(deal.estimatedValue ?? '')); setClosingDeal({ deal, stage }); return; }
    if (stage === 'PERDIDO') { setLostReasonInput(''); setClosingDeal({ deal, stage }); return; }
    void (async () => {
      try { await updateDeal(deal.id, { stage }); await loadAll(); }
      catch (err) { setError(err instanceof Error ? err.message : 'Erro ao mover negociação.'); }
    })();
  };

  const confirmClosing = async () => {
    if (!closingDeal) return;
    try {
      if (closingDeal.stage === 'GANHO') {
        if (!closeValue) { setError('Informe o valor de fechamento.'); return; }
        await updateDeal(closingDeal.deal.id, { stage: 'GANHO', closedValue: Number(closeValue) });
      } else {
        if (!lostReasonInput.trim()) { setError('Informe o motivo da perda.'); return; }
        await updateDeal(closingDeal.deal.id, { stage: 'PERDIDO', lostReason: lostReasonInput.trim() });
      }
      setClosingDeal(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar negociação.');
    }
  };

  const removeDeal = async (deal: CommercialDealUI) => {
    if (!window.confirm(`Excluir a negociação "${deal.title}"?`)) return;
    try { await deleteDeal(deal.id); await loadAll(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro ao excluir negociação.'); }
  };

  // ── Contrato ──────────────────────────────────────────────────────────
  const openContract = async (deal: CommercialDealUI) => {
    setContractDealId(deal.id);
    setContractLoading(true);
    try {
      const contract: CommercialContractUI | null = await getDealContract(deal.id);
      setContractForm({
        commissionPct: contract?.commissionPct != null ? String(contract.commissionPct) : '',
        commissionAmount: contract?.commissionAmount != null ? String(contract.commissionAmount) : '',
        paymentTerms: contract?.paymentTerms || '', notes: contract?.notes || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar contrato.');
    } finally {
      setContractLoading(false);
    }
  };

  const submitContract = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contractDealId) return;
    try {
      await saveDealContract(contractDealId, {
        commissionPct: contractForm.commissionPct ? Number(contractForm.commissionPct) : undefined,
        commissionAmount: contractForm.commissionAmount ? Number(contractForm.commissionAmount) : undefined,
        paymentTerms: contractForm.paymentTerms || undefined, notes: contractForm.notes || undefined,
      });
      setContractDealId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar contrato.');
    }
  };

  // ── Lembretes ─────────────────────────────────────────────────────────
  const submitReminder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reminderForm.clientId || !reminderForm.dueDate) { setError('Selecione o cliente e a data do lembrete.'); return; }
    setSavingReminder(true);
    try {
      await createReminder({
        farmId: farmId!, clientId: reminderForm.clientId, type: 'CUSTOM',
        dueDate: reminderForm.dueDate, message: reminderForm.message || undefined,
      });
      setReminderForm({ clientId: '', dueDate: '', message: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar lembrete.');
    } finally {
      setSavingReminder(false);
    }
  };

  const completeReminder = async (id: string) => {
    try { await markReminderDone(id); await loadAll(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro ao concluir lembrete.'); }
  };

  const removeReminder = async (id: string) => {
    try { await deleteReminder(id); await loadAll(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro ao excluir lembrete.'); }
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'clientes', label: 'Clientes' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'alertas', label: `Alertas${alerts ? ` (${alerts.birthdays.length + alerts.inactiveClients.length + alerts.reminders.length})` : ''}` },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-brand text-2xl font-extrabold text-[var(--eixo-text)]">Gestão Comercial</h1>
          {farmName && <p className="text-sm text-[var(--eixo-text-soft)]">{farmName}</p>}
        </div>
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === tab.key ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'border border-[var(--eixo-border)] bg-white text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error} <button type="button" onClick={() => setError(null)} className="ml-2 font-bold">x</button>
        </div>
      )}
      {loading && <p className="text-sm text-[var(--eixo-text-muted)]">Carregando...</p>}

      {activeTab === 'clientes' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <button type="button" onClick={openNewClient} className={primaryBtn}>+ Novo cliente</button>
          </div>
          {clientFormOpen && (
            <form onSubmit={submitClient} className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4 sm:grid-cols-3">
              <Field label="Nome"><input required className={inputClass} value={clientForm.name} onChange={(e) => setClientForm((c) => ({ ...c, name: e.target.value }))} /></Field>
              <Field label="Tipo">
                <select className={inputClass} value={clientForm.type} onChange={(e) => setClientForm((c) => ({ ...c, type: e.target.value as CommercialClientType }))}>
                  {(Object.keys(CLIENT_TYPE_LABELS) as CommercialClientType[]).map((key) => <option key={key} value={key}>{CLIENT_TYPE_LABELS[key]}</option>)}
                </select>
              </Field>
              <Field label="Documento (CPF/CNPJ)"><input className={inputClass} value={clientForm.document} onChange={(e) => setClientForm((c) => ({ ...c, document: e.target.value }))} /></Field>
              <Field label="Telefone"><input className={inputClass} value={clientForm.phone} onChange={(e) => setClientForm((c) => ({ ...c, phone: e.target.value }))} /></Field>
              <Field label="E-mail"><input type="email" className={inputClass} value={clientForm.email} onChange={(e) => setClientForm((c) => ({ ...c, email: e.target.value }))} /></Field>
              <Field label="Aniversário"><input type="date" className={inputClass} value={clientForm.birthDate} onChange={(e) => setClientForm((c) => ({ ...c, birthDate: e.target.value }))} /></Field>
              <Field label="Cidade"><input className={inputClass} value={clientForm.city} onChange={(e) => setClientForm((c) => ({ ...c, city: e.target.value }))} /></Field>
              <Field label="UF"><input maxLength={2} className={inputClass} value={clientForm.state} onChange={(e) => setClientForm((c) => ({ ...c, state: e.target.value.toUpperCase() }))} /></Field>
              <div className="sm:col-span-3"><Field label="Notas"><textarea className={inputClass} rows={2} value={clientForm.notes} onChange={(e) => setClientForm((c) => ({ ...c, notes: e.target.value }))} /></Field></div>
              <div className="flex gap-2 sm:col-span-3">
                <button type="submit" disabled={savingClient} className={primaryBtn}>{savingClient ? 'Salvando...' : 'Salvar cliente'}</button>
                <button type="button" onClick={() => setClientFormOpen(false)} className={ghostBtn}>Cancelar</button>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
            <table className="w-full text-left text-sm text-[var(--eixo-text)]">
              <thead className="bg-[var(--eixo-surface-soft)] text-xs font-bold uppercase text-[var(--eixo-text-muted)]">
                <tr><th className="px-4 py-2">Nome</th><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Contato</th><th className="px-4 py-2">Aniversário</th><th className="px-4 py-2">Cidade/UF</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-t border-[var(--eixo-border)]">
                    <td className="px-4 py-2 font-semibold">{client.name}</td>
                    <td className="px-4 py-2">{CLIENT_TYPE_LABELS[client.type]}</td>
                    <td className="px-4 py-2">{client.phone || client.email || '—'}</td>
                    <td className="px-4 py-2">{client.birthDate ? formatDate(client.birthDate) : '—'}</td>
                    <td className="px-4 py-2">{[client.city, client.state].filter(Boolean).join('/') || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => openEditClient(client)} className={`${ghostBtn} mr-2`}>Editar</button>
                      <button type="button" onClick={() => removeClient(client)} className={ghostBtn}>Excluir</button>
                    </td>
                  </tr>
                ))}
                {!clients.length && !loading && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-[var(--eixo-text-muted)]">Nenhum cliente cadastrado ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <button type="button" onClick={openNewDeal} disabled={!clients.length} className={primaryBtn}>+ Nova negociação</button>
          </div>
          {!clients.length && <p className="text-sm text-[var(--eixo-text-muted)]">Cadastre um cliente antes de abrir uma negociação.</p>}

          {dealFormOpen && (
            <form onSubmit={submitDeal} className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4 sm:grid-cols-3">
              <Field label="Cliente">
                <select required className={inputClass} value={dealForm.clientId} onChange={(e) => setDealForm((d) => ({ ...d, clientId: e.target.value }))}>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2"><Field label="Título"><input required className={inputClass} placeholder="Ex.: Venda de 40 bois gordos" value={dealForm.title} onChange={(e) => setDealForm((d) => ({ ...d, title: e.target.value }))} /></Field></div>
              <Field label="Lote"><input className={inputClass} value={dealForm.lotLabel} onChange={(e) => setDealForm((d) => ({ ...d, lotLabel: e.target.value }))} /></Field>
              <Field label="Qtd. animais"><input type="number" min="0" className={inputClass} value={dealForm.quantityAnimals} onChange={(e) => setDealForm((d) => ({ ...d, quantityAnimals: e.target.value }))} /></Field>
              <Field label="Valor estimado (R$)"><input type="number" min="0" step="0.01" className={inputClass} value={dealForm.estimatedValue} onChange={(e) => setDealForm((d) => ({ ...d, estimatedValue: e.target.value }))} /></Field>
              <Field label="Previsão de fechamento"><input type="date" className={inputClass} value={dealForm.expectedCloseDate} onChange={(e) => setDealForm((d) => ({ ...d, expectedCloseDate: e.target.value }))} /></Field>
              <div className="sm:col-span-2"><Field label="Notas"><input className={inputClass} value={dealForm.notes} onChange={(e) => setDealForm((d) => ({ ...d, notes: e.target.value }))} /></Field></div>
              <div className="flex gap-2 sm:col-span-3">
                <button type="submit" disabled={savingDeal} className={primaryBtn}>{savingDeal ? 'Salvando...' : 'Salvar negociação'}</button>
                <button type="button" onClick={() => setDealFormOpen(false)} className={ghostBtn}>Cancelar</button>
              </div>
            </form>
          )}

          {closingDeal && (
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
              <p className="mb-2 text-sm font-bold text-[var(--eixo-text)]">
                {closingDeal.stage === 'GANHO' ? `Fechar "${closingDeal.deal.title}" como Ganho` : `Marcar "${closingDeal.deal.title}" como Perdido`}
              </p>
              {closingDeal.stage === 'GANHO' ? (
                <Field label="Valor de fechamento (R$)"><input type="number" min="0" step="0.01" className={inputClass} value={closeValue} onChange={(e) => setCloseValue(e.target.value)} /></Field>
              ) : (
                <Field label="Motivo da perda"><input className={inputClass} value={lostReasonInput} onChange={(e) => setLostReasonInput(e.target.value)} /></Field>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={confirmClosing} className={primaryBtn}>Confirmar</button>
                <button type="button" onClick={() => setClosingDeal(null)} className={ghostBtn}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {STAGE_ORDER.map((stage) => (
              <div key={stage} className="flex flex-col gap-2 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">
                <p className="text-xs font-bold uppercase text-[var(--eixo-text-muted)]">{STAGE_LABELS[stage]} ({dealsByStage.get(stage)?.length || 0})</p>
                {(dealsByStage.get(stage) || []).map((deal) => (
                  <div key={deal.id} className="rounded-xl border border-[var(--eixo-border)] bg-white p-3 text-sm">
                    <p className="font-bold text-[var(--eixo-text)]">{deal.title}</p>
                    <p className="text-xs text-[var(--eixo-text-soft)]">{deal.client?.name || clientsById.get(deal.clientId)?.name}</p>
                    <p className="text-xs text-[var(--eixo-text-soft)]">{deal.stage === 'GANHO' ? formatCurrency(deal.closedValue) : formatCurrency(deal.estimatedValue)}</p>
                    {deal.lotLabel && <p className="text-xs text-[var(--eixo-text-muted)]">Lote: {deal.lotLabel}</p>}
                    <select value={deal.stage} onChange={(e) => handleStageChange(deal, e.target.value as CommercialDealStage)} className="mt-2 w-full rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs">
                      {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                    </select>
                    {deal.stage === 'GANHO' && (
                      <button type="button" onClick={() => openContract(deal)} className="mt-2 w-full rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs font-semibold hover:bg-[var(--eixo-surface-soft)]">
                        {deal.hasContract ? 'Ver/editar contrato' : '+ Contrato'}
                      </button>
                    )}
                    <button type="button" onClick={() => removeDeal(deal)} className="mt-2 w-full text-xs text-red-600 hover:underline">Excluir</button>

                    {contractDealId === deal.id && (
                      <form onSubmit={submitContract} className="mt-2 flex flex-col gap-2 rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-2">
                        {contractLoading ? <p className="text-xs">Carregando...</p> : (
                          <>
                            <input placeholder="Comissão %" type="number" step="0.01" className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs" value={contractForm.commissionPct} onChange={(e) => setContractForm((c) => ({ ...c, commissionPct: e.target.value }))} />
                            <input placeholder="Comissão R$" type="number" step="0.01" className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs" value={contractForm.commissionAmount} onChange={(e) => setContractForm((c) => ({ ...c, commissionAmount: e.target.value }))} />
                            <input placeholder="Condições de pagamento" className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs" value={contractForm.paymentTerms} onChange={(e) => setContractForm((c) => ({ ...c, paymentTerms: e.target.value }))} />
                            <textarea placeholder="Notas" rows={2} className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs" value={contractForm.notes} onChange={(e) => setContractForm((c) => ({ ...c, notes: e.target.value }))} />
                            <div className="flex gap-2">
                              <button type="submit" className="rounded-lg bg-[var(--eixo-green)] px-2 py-1 text-xs font-bold">Salvar</button>
                              <button type="button" onClick={() => setContractDealId(null)} className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs">Fechar</button>
                            </div>
                          </>
                        )}
                      </form>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'alertas' && alerts && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
            <p className="mb-2 font-bold text-[var(--eixo-text)]">Aniversários (7 dias)</p>
            {alerts.birthdays.length ? alerts.birthdays.map((row) => (
              <div key={row.client.id} className="border-t border-[var(--eixo-border)] py-2 text-sm">
                <p className="font-semibold text-[var(--eixo-text)]">{row.client.name}</p>
                <p className="text-xs text-[var(--eixo-text-soft)]">{formatDate(row.birthDate)} · {row.daysUntil === 0 ? 'hoje' : row.daysUntil === 1 ? 'amanhã' : `em ${row.daysUntil} dias`}</p>
              </div>
            )) : <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum aniversário na semana.</p>}
          </div>

          <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
            <p className="mb-2 font-bold text-[var(--eixo-text)]">Sem comprar há 90+ dias</p>
            {alerts.inactiveClients.length ? alerts.inactiveClients.map((row) => (
              <div key={row.client.id} className="border-t border-[var(--eixo-border)] py-2 text-sm">
                <p className="font-semibold text-[var(--eixo-text)]">{row.client.name}</p>
                <p className="text-xs text-[var(--eixo-text-soft)]">{row.lastPurchaseAt ? `Última compra: ${formatDate(row.lastPurchaseAt)} (${row.daysSincePurchase}d)` : 'Nunca comprou'}</p>
              </div>
            )) : <p className="text-sm text-[var(--eixo-text-muted)]">Todo mundo em dia.</p>}
          </div>

          <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
            <p className="mb-2 font-bold text-[var(--eixo-text)]">Lembretes pendentes</p>
            {alerts.reminders.length ? alerts.reminders.map((reminder) => (
              <div key={reminder.id} className="border-t border-[var(--eixo-border)] py-2 text-sm">
                <p className="font-semibold text-[var(--eixo-text)]">{reminder.client?.name}</p>
                <p className="text-xs text-[var(--eixo-text-soft)]">{formatDate(reminder.dueDate)} {reminder.message ? `· ${reminder.message}` : ''}</p>
                <div className="mt-1 flex gap-2">
                  <button type="button" onClick={() => completeReminder(reminder.id)} className={ghostBtn}>Concluir</button>
                  <button type="button" onClick={() => removeReminder(reminder.id)} className={ghostBtn}>Excluir</button>
                </div>
              </div>
            )) : <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum lembrete pendente.</p>}

            <form onSubmit={submitReminder} className="mt-3 flex flex-col gap-2 border-t border-[var(--eixo-border)] pt-3">
              <select className={inputClass} value={reminderForm.clientId} onChange={(e) => setReminderForm((r) => ({ ...r, clientId: e.target.value }))}>
                <option value="">Selecione o cliente</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              <input type="date" className={inputClass} value={reminderForm.dueDate} onChange={(e) => setReminderForm((r) => ({ ...r, dueDate: e.target.value }))} />
              <input placeholder="Mensagem (opcional)" className={inputClass} value={reminderForm.message} onChange={(e) => setReminderForm((r) => ({ ...r, message: e.target.value }))} />
              <button type="submit" disabled={savingReminder} className={primaryBtn}>{savingReminder ? 'Salvando...' : '+ Novo lembrete'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommercialManagement;
