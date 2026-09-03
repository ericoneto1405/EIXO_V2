import { buildApiUrl } from '../api';

export type CommercialClientType = 'FRIGORIFICO' | 'PECUARISTA' | 'LEILAO_CORRETOR';
export type CommercialDealStage = 'PROSPECCAO' | 'CONTATO' | 'NEGOCIANDO' | 'PROPOSTA' | 'GANHO' | 'PERDIDO';
export type CommercialReminderType = 'BIRTHDAY' | 'INACTIVITY' | 'CUSTOM';

export interface CommercialClientUI {
  id: string;
  farmId: string;
  name: string;
  type: CommercialClientType;
  document: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  birthDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialDealUI {
  id: string;
  farmId: string;
  clientId: string;
  client?: { id: string; name: string; type: CommercialClientType };
  title: string;
  stage: CommercialDealStage;
  lotLabel: string | null;
  quantityAnimals: number | null;
  estimatedValue: number | null;
  closedValue: number | null;
  expectedCloseDate: string | null;
  closedAt: string | null;
  lostReason: string | null;
  notes: string | null;
  hasContract: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialContractUI {
  id: string;
  dealId: string;
  farmId: string;
  commissionPct: number | null;
  commissionAmount: number | null;
  paymentTerms: string | null;
  fileName: string | null;
  storagePath: string | null;
  signedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialReminderUI {
  id: string;
  farmId: string;
  clientId: string;
  client?: { id: string; name: string };
  type: CommercialReminderType;
  dueDate: string;
  message: string | null;
  doneAt: string | null;
  createdAt: string;
}

export interface CommercialAlertsUI {
  birthdays: Array<{ client: { id: string; name: string }; birthDate: string; daysUntil: number }>;
  inactiveClients: Array<{ client: { id: string; name: string }; lastPurchaseAt: string | null; daysSincePurchase: number | null }>;
  reminders: CommercialReminderUI[];
}

const readJson = async (response: Response) => response.json().catch(() => ({}));

const assertOk = async (response: Response, fallbackMessage: string) => {
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || fallbackMessage);
  }
  return payload;
};

// ── Clientes ──────────────────────────────────────────────────────────────
export const listClients = async (farmId: string, search?: string, type?: CommercialClientType): Promise<CommercialClientUI[]> => {
  const params = new URLSearchParams({ farmId });
  if (search) params.set('search', search);
  if (type) params.set('type', type);
  const response = await fetch(buildApiUrl(`/commercial/clients?${params.toString()}`), { credentials: 'include' });
  const payload = await assertOk(response, 'Erro ao carregar clientes.');
  return payload.clients || [];
};

export const createClient = async (payload: {
  farmId: string; name: string; type: CommercialClientType; document?: string; phone?: string;
  email?: string; city?: string; state?: string; birthDate?: string; notes?: string;
}): Promise<CommercialClientUI> => {
  const response = await fetch(buildApiUrl('/commercial/clients'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
  });
  const result = await assertOk(response, 'Erro ao criar cliente.');
  return result.client;
};

export const updateClient = async (id: string, payload: Partial<Omit<CommercialClientUI, 'id' | 'farmId' | 'createdAt' | 'updatedAt'>>): Promise<CommercialClientUI> => {
  const response = await fetch(buildApiUrl(`/commercial/clients/${id}`), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
  });
  const result = await assertOk(response, 'Erro ao atualizar cliente.');
  return result.client;
};

export const deleteClient = async (id: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/commercial/clients/${id}`), { method: 'DELETE', credentials: 'include' });
  await assertOk(response, 'Erro ao excluir cliente.');
};

// ── Negociações ───────────────────────────────────────────────────────────
export const listDeals = async (farmId: string, stage?: CommercialDealStage, clientId?: string): Promise<CommercialDealUI[]> => {
  const params = new URLSearchParams({ farmId });
  if (stage) params.set('stage', stage);
  if (clientId) params.set('clientId', clientId);
  const response = await fetch(buildApiUrl(`/commercial/deals?${params.toString()}`), { credentials: 'include' });
  const payload = await assertOk(response, 'Erro ao carregar negociações.');
  return payload.deals || [];
};

export const createDeal = async (payload: {
  farmId: string; clientId: string; title: string; lotLabel?: string; quantityAnimals?: number;
  estimatedValue?: number; expectedCloseDate?: string; notes?: string;
}): Promise<CommercialDealUI> => {
  const response = await fetch(buildApiUrl('/commercial/deals'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
  });
  const result = await assertOk(response, 'Erro ao criar negociação.');
  return result.deal;
};

export const updateDeal = async (id: string, payload: Partial<{
  title: string; stage: CommercialDealStage; lotLabel: string; quantityAnimals: number; estimatedValue: number;
  closedValue: number; expectedCloseDate: string; lostReason: string; notes: string;
}>): Promise<CommercialDealUI> => {
  const response = await fetch(buildApiUrl(`/commercial/deals/${id}`), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
  });
  const result = await assertOk(response, 'Erro ao atualizar negociação.');
  return result.deal;
};

export const deleteDeal = async (id: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/commercial/deals/${id}`), { method: 'DELETE', credentials: 'include' });
  await assertOk(response, 'Erro ao excluir negociação.');
};

// ── Contrato ──────────────────────────────────────────────────────────────
export const getDealContract = async (dealId: string): Promise<CommercialContractUI | null> => {
  const response = await fetch(buildApiUrl(`/commercial/deals/${dealId}/contract`), { credentials: 'include' });
  const payload = await assertOk(response, 'Erro ao carregar contrato.');
  return payload.contract || null;
};

export const saveDealContract = async (dealId: string, payload: Partial<{
  commissionPct: number; commissionAmount: number; paymentTerms: string; fileName: string;
  storagePath: string; signedAt: string; notes: string;
}>): Promise<CommercialContractUI> => {
  const response = await fetch(buildApiUrl(`/commercial/deals/${dealId}/contract`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
  });
  const result = await assertOk(response, 'Erro ao salvar contrato.');
  return result.contract;
};

// ── Lembretes ─────────────────────────────────────────────────────────────
export const listReminders = async (farmId: string, includeDone = false): Promise<CommercialReminderUI[]> => {
  const params = new URLSearchParams({ farmId, includeDone: String(includeDone) });
  const response = await fetch(buildApiUrl(`/commercial/reminders?${params.toString()}`), { credentials: 'include' });
  const payload = await assertOk(response, 'Erro ao carregar lembretes.');
  return payload.reminders || [];
};

export const createReminder = async (payload: {
  farmId: string; clientId: string; type: CommercialReminderType; dueDate: string; message?: string;
}): Promise<CommercialReminderUI> => {
  const response = await fetch(buildApiUrl('/commercial/reminders'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
  });
  const result = await assertOk(response, 'Erro ao criar lembrete.');
  return result.reminder;
};

export const markReminderDone = async (id: string): Promise<CommercialReminderUI> => {
  const response = await fetch(buildApiUrl(`/commercial/reminders/${id}/done`), { method: 'PUT', credentials: 'include' });
  const result = await assertOk(response, 'Erro ao concluir lembrete.');
  return result.reminder;
};

export const deleteReminder = async (id: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/commercial/reminders/${id}`), { method: 'DELETE', credentials: 'include' });
  await assertOk(response, 'Erro ao excluir lembrete.');
};

// ── Alertas ───────────────────────────────────────────────────────────────
export const getAlerts = async (farmId: string): Promise<CommercialAlertsUI> => {
  const response = await fetch(buildApiUrl(`/commercial/alerts?farmId=${encodeURIComponent(farmId)}`), { credentials: 'include' });
  return assertOk(response, 'Erro ao carregar alertas.');
};
