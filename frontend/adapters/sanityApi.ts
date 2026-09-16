import { buildApiUrl } from '../api';

export type DoseModo = 'FIXA' | 'POR_PESO';

export interface SanityBatch {
  id: string;
  lotNumber: string;
  expiresAt: string | null;
  quantity: number;
  unitCost: number | null;
}

export interface SanityProduct {
  id: string;
  name: string;
  manufacturer: string | null;
  activeIngredient: string | null;
  category: string;
  unit: string;
  applicationUnit: string;
  applicationPerUnit: number | null;
  slaughterWithdrawalDays: number | null;
  suggestedRoute: string | null;
  suggestedDose: string | null;
  suggestedDosePerKg: number | null;
  tags: string[];
  batches: SanityBatch[];
}

export interface SanityLot {
  id: string;
  name: string;
  animals: number;
}

export interface SanityOptions {
  products: SanityProduct[];
  lots: SanityLot[];
  routes: string[];
}

export interface AplicacaoPayload {
  selecao: { brincos?: string[]; lotId?: string | null };
  productId: string;
  batchId: string;
  appliedAt: string;
  doseModo: DoseModo;
  doseFixa?: number | null;
  dosePorKg?: number | null;
  applicationPerUnit?: number | null;
  route?: string | null;
  appliedByName?: string;
  vetName?: string;
  vetCrmv?: string;
  notes?: string;
  aplicarSomenteAptos?: boolean;
}

export interface PreviaLinha {
  animalId: string;
  brinco: string;
  sexo: 'MACHO' | 'FEMEA' | null;
  idadeDias: number | null;
  peso: number | null;
  dose: number | null;
  apto: boolean;
  bloqueios: string[];
  avisos: string[];
}

export interface Previa {
  linhas: PreviaLinha[];
  resumo: {
    total: number;
    aptos: number;
    bloqueados: number;
    doseTotal: number;
    unidadeDose: string;
    consumoEstoque: number | null;
    unidadeEstoque: string | null;
    custoTotal: number;
    carenciaAte: string | null;
    carenciaDias: number | null;
    carenciaDesconhecida: boolean;
  };
  bloqueiosGerais: string[];
  avisosGerais: string[];
  naoEncontrados: string[];
  repetidos: string[];
}

export interface AplicacaoResumo {
  groupId: string;
  appliedAt: string;
  animais: number;
  doseTotal: number | null;
  doseUnit: string | null;
  custoTotal: number | null;
  produto: string | null;
  categoria: string | null;
  loteFrasco: string | null;
  via: string | null;
  aplicadoPor: string | null;
  veterinario: string | null;
  carenciaAte: string | null;
  carenciaDesconhecida: boolean;
}

export interface AnimalEmCarencia {
  animalId: string;
  brinco: string;
  lotId: string | null;
  liberaEm: string | null;
  semCarencia: boolean;
  produtos: string[];
}

export interface CustoSanitario {
  total: number;
  porLote: { lotId: string | null; lote: string; custo: number; aplicacoes: number; animais: number; custoPorAnimal: number }[];
  porAnimal: { animalId: string; brinco: string; lote: string | null; custo: number; aplicacoes: number }[];
}

export class SanityApiError extends Error {
  status: number;
  previa: Previa | null;
  constructor(message: string, status: number, previa: Previa | null) {
    super(message);
    this.status = status;
    this.previa = previa;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init?.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const previa = payload && Array.isArray(payload.linhas) ? (payload as Previa) : null;
    throw new SanityApiError(payload?.message || 'Não foi possível concluir a operação.', response.status, previa);
  }
  return payload as T;
}

const base = (farmId: string) => `/farms/${encodeURIComponent(farmId)}/sanidade`;

export const fetchSanityOptions = (farmId: string) => request<SanityOptions>(`${base(farmId)}/opcoes`);

export const previewAplicacao = (farmId: string, payload: AplicacaoPayload) =>
  request<Previa>(`${base(farmId)}/aplicacoes/preview`, { method: 'POST', body: JSON.stringify(payload) });

export const salvarAplicacao = (farmId: string, payload: AplicacaoPayload) =>
  request<{ groupId: string; aplicados: number; ignorados: number; consumoEstoque: number; custoTotal: number; carenciaAte: string | null }>(
    `${base(farmId)}/aplicacoes`,
    { method: 'POST', body: JSON.stringify(payload) },
  );

export const listarAplicacoes = (farmId: string) =>
  request<{ aplicacoes: AplicacaoResumo[] }>(`${base(farmId)}/aplicacoes`);

export const listarCustos = (farmId: string, de?: string, ate?: string) => {
  const params = new URLSearchParams();
  if (de) params.set('de', de);
  if (ate) params.set('ate', ate);
  const query = params.toString();
  return request<CustoSanitario>(`${base(farmId)}/custos${query ? `?${query}` : ''}`);
};

export const listarCarencia = (farmId: string) =>
  request<{ animais: AnimalEmCarencia[] }>(`${base(farmId)}/carencia`);
