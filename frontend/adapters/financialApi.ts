import { buildApiUrl } from '../api';

export type TransactionType = 'ENTRADA' | 'SAIDA';
export type TransactionStatus = 'PAGO' | 'PENDENTE' | 'CANCELADO';
export type AccountCategoryType = 'ENTRADA' | 'SAIDA';
export type CashFlowClass = 'OPERATING' | 'INVESTING' | 'FINANCING';
export type ResultClass = 'OPERATING_REVENUE' | 'PRODUCTION_COST' | 'OPERATING_EXPENSE' | 'FINANCIAL_RESULT' | 'OTHER_RESULT';
export type RecognitionRule = 'IMMEDIATE' | 'ON_NUTRITION_CONSUMPTION' | 'ON_ANIMAL_SALE' | 'NOT_IN_RESULT';

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
  cashFlowClass: CashFlowClass;
  resultClass: ResultClass | null;
  recognitionRule: RecognitionRule;
  isConfigured: boolean;
  deprecatedAt: string | null;
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
  competenceDate: string | null;
  settledAt: string | null;
  modelVersion: number;
  descricao: string | null;
  vencimento: string | null;
  status: TransactionStatus;
  herdEventId: string | null;
  sanitaryRecordId: string | null;
  createdAt: string;
}

export interface FinancialAllocationInput {
  lotId?: string;
  poLotId?: string;
  paddockId?: string;
  productionPhase?: 'CRIA' | 'RECRIA' | 'ENGORDA' | 'REPRODUCAO' | 'OUTRA';
  amount?: number;
  percent?: number;
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
  cashFlowClass: CashFlowClass;
  resultClass: ResultClass | null;
  recognitionRule: RecognitionRule;
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
  payload: { name?: string; group?: string; isActive?: boolean; cashFlowClass?: CashFlowClass; resultClass?: ResultClass | null; recognitionRule?: RecognitionRule; isConfigured?: boolean },
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
    competenceDate?: string;
    settledAt?: string | null;
    allocations?: FinancialAllocationInput[];
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
  competenceDate?: string;
  settledAt?: string;
  descricao?: string;
  vencimento?: string;
  status?: TransactionStatus;
  allocations?: FinancialAllocationInput[];
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

export interface CashFlowReport {
  period: { year: number; month: number | null; start: string; end: string };
  realized: FinancialFlowSummary;
  projected: FinancialFlowSummary;
}

export interface FinancialFlowSummary {
  totals: { incoming: number; outgoing: number; net: number };
  byMonth: Array<{ month: string; incoming: number; outgoing: number; net: number }>;
  byActivity: Array<{ activity: CashFlowClass; incoming: number; outgoing: number; net: number }>;
}

export interface IncomeStatementSummary {
  operatingRevenue: number;
  productionCost: number;
  grossMargin: number;
  operatingExpense: number;
  operatingResult: number;
  financialResult: number;
  otherResult: number;
  managementResult: number;
}

export interface IncomeStatementReport {
  reliableSince: string | null;
  consolidated: IncomeStatementSummary;
  byFarm: Array<IncomeStatementSummary & { farmId: string; farmName: string }>;
}

export type AnalyticsDimension = 'FARM' | 'LOT' | 'PADDOCK' | 'PRODUCTION_PHASE';
export interface AnalyticsReport {
  dimension: AnalyticsDimension;
  items: Array<{ key: string; label: string; farmId: string; revenue: number; productionCost: number; operatingExpense: number; margin: number; costPerArroba?: number | null; costPerArrobaMissing?: string[]; costPerHeadDay?: number | null; costPerHeadDayMissing?: string | null; topCategories: Array<{ name: string; amount: number }> }>;
  unallocatedAmount: number;
  allocationCoveragePercent: number;
  metricNotice: string | null;
}

export interface DataQualityReport {
  unconfiguredCategories: number;
  lotsWithoutPhase: number;
  animalsWithoutAcquisitionCost: number;
  animalsWithoutSufficientWeighings: number;
  unallocatedAmount: number;
  allocationCoveragePercent: number;
  reliable: boolean;
}

const getReport = async <T>(path: string): Promise<T> => {
  const response = await fetch(buildApiUrl(path), { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Erro ao carregar relatório financeiro.');
  return data as T;
};

const reportFarmParam = (farmId?: string) => farmId ? `farmId=${farmId}&` : '';

export const getCashFlowReport = (farmId: string | undefined, year: number) =>
  getReport<CashFlowReport>(`/financial/reports/cash-flow?${reportFarmParam(farmId)}year=${year}`);

export const getIncomeStatementReport = (farmId: string | undefined, year: number) =>
  getReport<IncomeStatementReport>(`/financial/reports/income-statement?${reportFarmParam(farmId)}year=${year}`);

export const getAnalyticsReport = (farmId: string | undefined, year: number, dimension: AnalyticsDimension) =>
  getReport<AnalyticsReport>(`/financial/reports/analytics?${reportFarmParam(farmId)}year=${year}&dimension=${dimension}`);

export const getDataQualityReport = (farmId?: string) =>
  getReport<DataQualityReport>(`/financial/reports/data-quality${farmId ? `?farmId=${farmId}` : ''}`);

export const deleteTransaction = async (id: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/financial/transactions/${id}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Erro ao excluir transação.');
};
