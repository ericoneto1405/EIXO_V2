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
  refrigerated: boolean;
  storageMinTemp: number | null;
  storageMaxTemp: number | null;
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
  coolerTempC?: number | null;
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

export type Severidade = 'VERMELHO' | 'LARANJA' | 'AMARELO' | 'AZUL';

export interface Lembrete {
  id: string;
  grupo: 'OBRIGATORIO' | 'BOAS_PRATICAS' | 'GESTAO';
  titulo: string;
  descricao: string;
  data: string;
  dias: number;
  severidade: Severidade;
  tag: string | null;
  acao: 'APLICAR' | 'VER' | 'FARMACIA' | 'CONFIGURAR';
  totalAnimais: number;
  brincos: string[];
  link?: string | null;
}

export interface EstadoSanitario {
  uf: string | null;
  orgao: string;
  linkBusca: string | null;
  vermifugo: number[];
  carrapato: number[];
  regiaoConhecida: boolean;
}

export interface ConfiguracaoSanitaria {
  rabiesRequired: 'SIM' | 'NAO' | 'NAO_SEI';
  clostridialEnabled: boolean;
  reproductiveEnabled: boolean;
  dewormEnabled: boolean;
  dewormMonths: number[];
  tickEnabled: boolean;
  tickMonths: number[];
  estado?: EstadoSanitario;
  configurada?: boolean;
}

export type Semaforo = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'CINZA';

export interface SituacaoSanitaria {
  geral: Semaforo;
  mensagem: string;
  brucelose: { status: Semaforo; motivos: string[] };
  raiva: { status: Semaforo; motivos: string[] };
  periodoAtual: { period: string; prazo: string; label: string };
  ultimoPeriodoVencido: { period: string; prazo: string; label: string };
  comprovacoes: string[];
  estado: EstadoSanitario;
  historico: { id: string; period: string; deliveredAt: string; protocol: string | null }[];
}

export interface OpcaoDoenca {
  key: string;
  label: string;
  notificavel?: boolean;
}

export interface CasoSanitario {
  id: string;
  animalId: string;
  brinco: string | null;
  lote: string | null;
  kind: 'DOENCA' | 'MORTE';
  disease: string;
  diseaseLabel: string;
  symptoms: string | null;
  startedAt: string;
  status: 'EM_TRATAMENTO' | 'CURADO' | 'MORTO' | 'DESCARTADO';
  necropsy: boolean;
  diagnosedBy: string | null;
  notes: string | null;
  closedAt: string | null;
  notifiable: boolean;
}

export interface CasosResposta {
  casos: CasoSanitario[];
  indicadores: {
    emTratamento: number;
    casos12m: number;
    mortes12m: number;
    mortalidade12m: number;
    porCausa: { causa: string; casos: number; mortes: number }[];
  };
  doencas: OpcaoDoenca[];
  causasMorte: OpcaoDoenca[];
  orgao: string;
}

export interface NovoCaso {
  kind: 'DOENCA' | 'MORTE';
  brinco: string;
  disease: string;
  otherDisease?: string;
  startedAt: string;
  symptoms?: string;
  diagnosedBy?: string;
  necropsy?: boolean;
  notes?: string;
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

export const listarLembretes = (farmId: string) =>
  request<{ lembretes: Lembrete[]; estado: EstadoSanitario; configurada: boolean }>(`${base(farmId)}/lembretes`);

export const buscarConfiguracao = (farmId: string) =>
  request<ConfiguracaoSanitaria>(`${base(farmId)}/configuracao`);

export const salvarConfiguracao = (farmId: string, config: ConfiguracaoSanitaria) =>
  request<ConfiguracaoSanitaria>(`${base(farmId)}/configuracao`, { method: 'PUT', body: JSON.stringify(config) });

export const buscarSituacao = (farmId: string) => request<SituacaoSanitaria>(`${base(farmId)}/situacao`);

export const registrarComprovacao = (farmId: string, payload: { period: string; deliveredAt: string; protocol?: string; notes?: string }) =>
  request<SituacaoSanitaria>(`${base(farmId)}/comprovacoes`, { method: 'POST', body: JSON.stringify(payload) });

export const listarCasos = (farmId: string) => request<CasosResposta>(`${base(farmId)}/casos`);

export const registrarCaso = (farmId: string, payload: NovoCaso) =>
  request<{ caso: CasoSanitario; aviso: string | null }>(`${base(farmId)}/casos`, { method: 'POST', body: JSON.stringify(payload) });

export const encerrarCaso = (farmId: string, caseId: string, payload: { status: CasoSanitario['status']; closedAt?: string; necropsy?: boolean; notes?: string }) =>
  request<{ ok: boolean }>(`${base(farmId)}/casos/${encodeURIComponent(caseId)}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const listarCarencia = (farmId: string) =>
  request<{ animais: AnimalEmCarencia[] }>(`${base(farmId)}/carencia`);
