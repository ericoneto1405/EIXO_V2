import { buildApiUrl } from '../api';

export type TransactionType = 'ENTRADA' | 'SAIDA';
export type TransactionStatus = 'PAGO' | 'PENDENTE' | 'VENCIDO';
export type AccountCategoryType = 'ENTRADA' | 'SAIDA';

export type TransactionCategoria =
  | 'VENDA_ANIMAIS'
  | 'COMPRA_ANIMAIS'
  | 'MEDICAMENTOS'
  | 'ALIMENTACAO'
  | 'MAO_DE_OBRA'
  | 'OUTROS';

export interface AccountCategory {
  id: string;
  farmId: string | null;
  name: string;
  group: string;
  type: AccountCategoryType;
  isSystem: boolean;
  isActive: boolean;
}

export interface FinancialTransaction {
  id: string;
  farmId: string;
  type: TransactionType;
  categoria: TransactionCategoria;
  accountCategoryId: string | null;
  accountCategoryName: string | null;
  accountCategoryGroup: string | null;
  valor: number;
  data: string;
  descricao: string | null;
  vencimento: string | null;
  status: TransactionStatus;
  herdEventId: string | null;
  sanitaryRecordId: string | null;
  createdAt: string;
}

export const CATEGORIA_LABELS: Record<TransactionCategoria, string> = {
  VENDA_ANIMAIS: 'Venda de animais',
  COMPRA_ANIMAIS: 'Compra de animais',
  MEDICAMENTOS: 'Medicamentos',
  ALIMENTACAO: 'Alimentação / Sal',
  MAO_DE_OBRA: 'Mão de obra',
  OUTROS: 'Outros',
};

// ── Plano de Contas ───────────────────────────────────────────────────────────

export const listAccountCategories = async (farmId: string): Promise<AccountCategory[]> => {
  const response = await fetch(buildApiUrl(`/account-categories?farmId=${farmId}`), {
    credentials: 'include',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar plano de contas.');
  return payload.categories || [];
};

export const createAccountCategory = async (payload: {
  farmId: string;
  name: string;
  group: string;
  type: AccountCategoryType;
}): Promise<AccountCategory> => {
  const response = await fetch(buildApiUrl('/account-categories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Erro ao criar categoria.');
  return data.category;
};

export const updateAccountCategory = async (
  id: string,
  payload: { name?: string; group?: string; isActive?: boolean },
): Promise<AccountCategory> => {
  const response = await fetch(buildApiUrl(`/account-categories/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Erro ao editar categoria.');
  return data.category;
};

export const deleteAccountCategory = async (id: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/account-categories/${id}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || 'Erro ao remover categoria.');
  }
};

// ── Transações ────────────────────────────────────────────────────────────────

export const listTransactions = async (
  farmId: string,
  mes?: number,
  ano?: number,
  opts?: { tipo?: TransactionType; status?: TransactionStatus },
): Promise<FinancialTransaction[]> => {
  let url = `/financial/transactions?farmId=${farmId}`;
  if (mes && ano) url += `&mes=${mes}&ano=${ano}`;
  else if (ano) url += `&ano=${ano}`;
  if (opts?.tipo) url += `&tipo=${opts.tipo}`;
  if (opts?.status) url += `&status=${opts.status}`;
  const response = await fetch(buildApiUrl(url), { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || 'Erro ao listar transações.');
  return payload.transactions || [];
};

export const updateTransaction = async (
  id: string,
  payload: {
    status?: TransactionStatus;
    vencimento?: string | null;
    valor?: number;
    descricao?: string | null;
    accountCategoryId?: string | null;
    data?: string;
  },
): Promise<FinancialTransaction> => {
  const response = await fetch(buildApiUrl(`/financial/transactions/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Erro ao atualizar transação.');
  return data.transaction;
};

export const createTransaction = async (payload: {
  farmId: string;
  type: TransactionType;
  categoria?: TransactionCategoria;
  accountCategoryId?: string;
  valor: number;
  data: string;
  descricao?: string;
  vencimento?: string;
  status?: TransactionStatus;
}): Promise<FinancialTransaction> => {
  const response = await fetch(buildApiUrl('/financial/transactions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Erro ao criar transação.');
  return data.transaction;
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/financial/transactions/${id}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Erro ao excluir transação.');
};
