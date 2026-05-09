import { buildApiUrl } from '../api';
import type { AnimalUI } from '../types';

export interface SemenBatchUI {
  id: string;
  farmId: string;
  bullAnimalId?: string | null;
  bullPoAnimalId?: string | null;
  bullName?: string | null;
  bullRegistry?: string | null;
  fornecedor?: string | null;
  lote: string;
  dataColeta?: string | null;
  dosesTotal: number;
  dosesDisponiveis: number;
  localArmazenamento?: string | null;
  observacoes?: string | null;
  bullAnimal?: Pick<AnimalUI, 'id' | 'brinco' | 'registro' | 'tipoCadastro'> | null;
  bullPoAnimal?: { id: string; brinco?: string | null; nome?: string | null; registro?: string | null } | null;
}

export interface SemenBatchPayload {
  farmId: string;
  bullAnimalId?: string | null;
  bullName?: string;
  bullRegistry?: string;
  fornecedor?: string;
  lote: string;
  dataColeta?: string;
  dosesTotal: number;
  dosesDisponiveis: number;
  localArmazenamento?: string;
  observacoes?: string;
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

export const listInventoryAnimals = async (farmId: string) => {
  const payload = await requestJson<{ animals: AnimalUI[] }>(`/animals?farmId=${encodeURIComponent(farmId)}`);
  return payload.animals || [];
};

export const listSemenBatches = async (farmId: string) => {
  const payload = await requestJson<{ batches: SemenBatchUI[] }>(`/po/semen?farmId=${encodeURIComponent(farmId)}`);
  return payload.batches || [];
};

export const createSemenBatch = (payload: SemenBatchPayload) =>
  requestJson<{ batch: SemenBatchUI }>('/po/semen', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateSemenBatch = (id: string, payload: Partial<SemenBatchPayload>) =>
  requestJson<{ batch: SemenBatchUI }>(`/po/semen/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const moveSemenBatch = (id: string, payload: { date: string; qty: number; type: 'IN' | 'OUT' | 'USE' | 'ADJUST'; notes?: string }) =>
  requestJson<{ batch: SemenBatchUI }>(`/po/semen/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
