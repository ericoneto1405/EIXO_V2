import { buildApiUrl } from '../api';

const readJson = async (response: Response) => response.json().catch(() => ({}));

export interface MarketSource {
  id: string;
  name: string;
  type: string;
  url: string | null;
  isActive: boolean;
}

export interface MarketRegion {
  id: string;
  name: string;
  state: string;
  city: string | null;
  marketPlaceName: string | null;
  sourceRegionName: string | null;
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
