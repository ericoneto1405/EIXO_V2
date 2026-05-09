import { buildApiUrl } from '../api';

export type AcasalamentoObjective = 'PRECOCIDADE' | 'DESMAMA' | 'CARCACA' | 'MATERNAL' | 'NASCIMENTO';
export type AcasalamentoTargetMode = 'LOT' | 'GROUP' | 'INDIVIDUAL' | 'UPLOAD';
export type AcasalamentoAvailabilityMode = 'MARKET_AND_FARM' | 'FARM_INVENTORY_ONLY';

export interface AcasalamentoSourceStatus {
  id: string;
  code: string;
  name: string;
  sourceType: 'COMMERCIAL_CENTER' | 'OFFICIAL_ASSOCIATION';
  breed: string;
  baseUrl: string;
  status: 'PENDING' | 'OK' | 'PARTIAL' | 'FAILED';
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  bullsCount?: number;
  listingsCount?: number;
  proofsCount?: number;
  issuesCount?: number;
}

export interface AcasalamentoProof {
  id: string;
  registry: string | null;
  proofTrait: AcasalamentoObjective | 'INDICE_GERAL';
  traitLabel: string;
  dep: number | null;
  deca: number | null;
  accuracy: number | null;
  progenyCount: number | null;
  proofStatus: 'VERIFIED' | 'PENDING' | 'NOT_FOUND' | 'MISSING' | 'INCONCLUSIVE';
  referenceUrl: string | null;
  collectedAt: string | null;
}

export interface AcasalamentoSyncJob {
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  lastResults: Array<{ sourceCode: string; imported: number; status: string }>;
}

export interface AcasalamentoBull {
  id: string;
  name: string;
  registration: string | null;
  officialSeries: string | null;
  officialRgn: string | null;
  officialKeyNormalized: string | null;
  breed: string;
  central: string;
  commercialUrl: string | null;
  semenAvailable: boolean;
  sourceStatus: string;
  lastSeenAt: string | null;
  rawData?: any;
  commercialListings?: Array<{
    id: string;
    central: string;
    name: string;
    registration: string | null;
    commercialUrl: string | null;
    semenAvailable: boolean;
    sourceStatus: string;
    lastSeenAt: string | null;
  }>;
  officialProofs: AcasalamentoProof[];
}

export interface AcasalamentoIssue {
  id: string;
  sourceCode: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  detail: string | null;
  referenceUrl: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  source: { code: string; name: string } | null;
}

export interface AcasalamentoReviewSignals {
  relevant?: boolean;
  hasFiv?: boolean;
  hasPedigree?: boolean;
  hasProgenySignal?: boolean;
  hasCommercialProofSignal?: boolean;
  multipleCenters?: boolean;
  progenyCount?: number;
  candidateCount?: number;
  centersCount?: number;
}

export interface AcasalamentoLotOption {
  id: string;
  name: string;
  animalsCount: number;
}

export interface AcasalamentoAnimalOption {
  id: string;
  brinco: string;
  raca: string | null;
  pesoAtual: number | null;
  lotId: string | null;
}

export interface AcasalamentoSessionResult {
  id: string;
  rank: number | null;
  score: number;
  status: string;
  reason: string;
  alerts: string[] | null;
  proofSnapshot: AcasalamentoProof | null;
  commercialSnapshot: AcasalamentoBull | null;
  bull: AcasalamentoBull | null;
}

export interface AcasalamentoSession {
  id: string;
  farmId: string;
  targetMode: AcasalamentoTargetMode;
  objective: AcasalamentoObjective;
  breed: string;
  inputSnapshot: any;
  summary: any;
  createdAt: string | null;
  results: AcasalamentoSessionResult[];
}

export interface UploadedMatingLot {
  lote: string;
  quantidade_cabecas: number;
  peso_medio: number;
}

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || 'Erro ao comunicar com o servidor.');
  }
  return payload as T;
};

export const getAcasalamentoSourcesStatus = () =>
  requestJson<{ sources: AcasalamentoSourceStatus[]; syncJob: AcasalamentoSyncJob }>('/genetics/acasalamento/sources/status');

export const syncAcasalamentoSources = () =>
  requestJson<{ results: Array<{ sourceCode: string; imported: number; status: string }> }>('/genetics/acasalamento/sources/sync', {
    method: 'POST',
  });

export const getAcasalamentoBulls = () =>
  requestJson<{ bulls: AcasalamentoBull[]; total: number }>('/genetics/acasalamento/bulls');

export const getAcasalamentoOptions = (farmId: string) =>
  requestJson<{ lots: AcasalamentoLotOption[]; animals: AcasalamentoAnimalOption[] }>(`/genetics/acasalamento/lots?farmId=${encodeURIComponent(farmId)}`);

export const getAcasalamentoIssues = () =>
  requestJson<{ issues: AcasalamentoIssue[] }>('/genetics/acasalamento/collection-issues');

export const getAcasalamentoSessions = (farmId: string) =>
  requestJson<{ sessions: AcasalamentoSession[] }>(`/genetics/acasalamento/sessions?farmId=${encodeURIComponent(farmId)}`);

export const createAcasalamentoRecommendation = (payload: {
  farmId: string;
  objective: AcasalamentoObjective;
  targetMode: AcasalamentoTargetMode;
  availabilityMode?: AcasalamentoAvailabilityMode;
  lotIds?: string[];
  animalIds?: string[];
  uploadedLots?: UploadedMatingLot[];
}) =>
  requestJson<{ session: AcasalamentoSession; blocked: Array<{ bull: AcasalamentoBull; category?: string; reason: string; reviewSignals?: AcasalamentoReviewSignals }> }>('/genetics/acasalamento/recommendations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
