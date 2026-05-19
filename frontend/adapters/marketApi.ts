import { buildApiUrl } from '../api';

const readJson = async (response: Response) => response.json().catch(() => ({}));

export interface MarketSource {
  id: string;
  name: string;
  type: string;
  url: string | null;
  priority?: number;
  trustScore?: number;
  autoPublishMinConfidence?: number;
  requiresReview?: boolean;
  isAutomationEnabled?: boolean;
  isActive: boolean;
}

export interface MarketRegion {
  id: string;
  name: string;
  state: string;
  city: string | null;
  marketPlaceName: string | null;
  sourceRegionName: string | null;
  macroRegion?: string | null;
  isActive: boolean;
}

export interface MarketPrice {
  id: string;
  regionId: string;
  sourceId: string;
  productType: string;
  price: number;
  unit: string;
  paymentType: string;
  referenceDate: string;
  referenceWeightArrobas: number | null;
  sourceBase: string | null;
  notes: string | null;
  status: string;
  source: MarketSource | null;
  region: MarketRegion | null;
}

export interface MarketRawCapture {
  id: string;
  sourceId: string;
  capturedAt: string | null;
  referenceDate: string | null;
  rawTitle: string | null;
  rawText: string | null;
  rawUrl: string | null;
  captureMethod: string;
  status: string;
  errorMessage: string | null;
  source: MarketSource | null;
}

export interface MarketNormalizedPrice {
  id: string;
  rawCaptureId: string | null;
  sourceId: string;
  regionId: string | null;
  productType: string;
  price: number;
  unit: string;
  paymentType: string;
  referenceDate: string;
  referenceWeightArrobas: number | null;
  confidenceScore: number;
  validationStatus: string;
  validationReasons: string[];
  status: string;
  reviewerNotes: string | null;
  source: MarketSource | null;
  region: MarketRegion | null;
}

export interface MarketJob {
  id: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  sourceId: string | null;
  sourceName: string | null;
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export const listMarketSources = async (): Promise<MarketSource[]> => {
  const response = await fetch(buildApiUrl('/market/sources'), { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao listar fontes.');
  return payload.sources || [];
};

export const createMarketSource = async (input: {
  name: string;
  type: string;
  url?: string | null;
  isActive?: boolean;
}): Promise<MarketSource> => {
  const response = await fetch(buildApiUrl('/market/sources'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao criar fonte.');
  return payload.source;
};

export const listMarketRegions = async (): Promise<MarketRegion[]> => {
  const response = await fetch(buildApiUrl('/market/regions'), { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao listar regiões.');
  return payload.regions || [];
};

export const createMarketRegion = async (input: {
  name: string;
  state: string;
  city?: string | null;
  marketPlaceName?: string | null;
  sourceRegionName?: string | null;
  isActive?: boolean;
}): Promise<MarketRegion> => {
  const response = await fetch(buildApiUrl('/market/regions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao criar região.');
  return payload.region;
};

export const listMarketPrices = async (): Promise<MarketPrice[]> => {
  const response = await fetch(buildApiUrl('/market/prices'), { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao listar cotações.');
  return payload.prices || [];
};

export const createMarketPrice = async (input: {
  regionId: string;
  sourceId: string;
  productType: string;
  price: number;
  unit: string;
  paymentType: string;
  referenceDate: string;
  referenceWeightArrobas?: number | null;
  sourceBase?: string | null;
  notes?: string | null;
  status: string;
}): Promise<MarketPrice> => {
  const response = await fetch(buildApiUrl('/market/prices'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao criar cotação.');
  return payload.price;
};

export const runMockNationalJob = async (): Promise<{ job: MarketJob; summary: Record<string, unknown> }> => {
  const response = await fetch(buildApiUrl('/market/jobs/run-mock-national'), {
    method: 'POST',
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao executar job mock nacional.');
  return payload;
};

export const listMarketJobs = async (): Promise<MarketJob[]> => {
  const response = await fetch(buildApiUrl('/market/jobs'), { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao listar jobs.');
  return payload.jobs || [];
};

export const listMarketRawCaptures = async (): Promise<MarketRawCapture[]> => {
  const response = await fetch(buildApiUrl('/market/raw-captures'), { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao listar capturas.');
  return payload.captures || [];
};

export const listMarketNormalizedPrices = async (): Promise<MarketNormalizedPrice[]> => {
  const response = await fetch(buildApiUrl('/market/normalized-prices'), { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao listar normalizadas.');
  return payload.normalizedPrices || [];
};

export const publishMarketNormalizedPrice = async (id: string): Promise<MarketPrice> => {
  const response = await fetch(buildApiUrl(`/market/normalized-prices/${id}/publish`), {
    method: 'POST',
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao publicar cotação normalizada.');
  return payload.price;
};

export const rejectMarketNormalizedPrice = async (id: string, reviewerNotes?: string | null): Promise<void> => {
  const response = await fetch(buildApiUrl(`/market/normalized-prices/${id}/reject`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reviewerNotes: reviewerNotes || null }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || 'Erro ao rejeitar cotação normalizada.');
};
