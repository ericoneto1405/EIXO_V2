import { buildApiUrl } from '../api';
import type { AnimalUI, LotUI, PaddockMove, WeighingUI } from '../types';

export type HerdType = 'COMMERCIAL' | 'PO';

export type HerdAnimal = AnimalUI;
export type HerdLot = LotUI;
export type HerdWeighing = WeighingUI;

// ---- Tipos novos ----

export type HerdEventType = 'NASCIMENTO' | 'COMPRA' | 'VENDA' | 'MORTE';
export type SanitaryTipo = 'VACINA' | 'VERMIFUGO' | 'TRATAMENTO';

export interface HerdEvent {
    id: string;
    farmId: string;
    animalId: string | null;
    poAnimalId: string | null;
    type: HerdEventType;
    date: string;
    peso: number | null;
    valor: number | null;
    origem: string | null;
    destino: string | null;
    observacoes: string | null;
    createdAt: string;
}

export interface SanitaryRecord {
    id: string;
    farmId: string;
    animalId: string | null;
    poAnimalId: string | null;
    tipo: SanitaryTipo;
    produto: string;
    date: string;
    dose: string | null;
    proximaAplicacao: string | null;
    observacoes: string | null;
    createdAt: string;
}

// ---- Funções existentes (sem alteração) ----

const getSexoLabel = (value: string) => {
    const normalized = value?.toUpperCase?.() || value;
    if (normalized === 'FEMEA') {
        return 'Fêmea';
    }
    if (normalized === 'MACHO') {
        return 'Macho';
    }
    return value;
};

const normalizeAnimal = (animal: any, herdType: HerdType): HerdAnimal => {
    if (herdType === 'PO') {
        const identificacao = animal?.brinco || animal?.nome || 'Sem identificação';
        return {
            id: animal.id,
            farmId: animal.farmId,
            brinco: animal.brinco,
            nome: animal.nome,
            identificacao,
            raca: animal.raca,
            sexo: getSexoLabel(animal.sexo),
            dataNascimento: animal.dataNascimento || null,
            pesoAtual: typeof animal.pesoAtual === 'number' ? animal.pesoAtual : null,
            gmd: typeof animal.gmd === 'number' ? animal.gmd : null,
            gmdLast: typeof animal.gmdLast === 'number' ? animal.gmdLast : null,
            gmd30: typeof animal.gmd30 === 'number' ? animal.gmd30 : null,
            lotId: animal.lotId || null,
            registro: animal.registro || null,
            categoria: animal.categoria || null,
            currentPaddockId: animal.currentPaddockId || null,
            currentPaddockName: animal.currentPaddockName || null,
            nutritionPlan: animal.nutritionPlan || null,
        };
    }

    return {
        id: animal.id,
        farmId: animal.farmId,
        brinco: animal.brinco,
        nome: null,
        identificacao: animal.brinco || 'Sem identificação',
        raca: animal.raca,
        sexo: animal.sexo,
        dataNascimento: animal.dataNascimento,
        pesoAtual: typeof animal.pesoAtual === 'number' ? animal.pesoAtual : null,
        gmd: typeof animal.gmd === 'number' ? animal.gmd : null,
        gmdLast: typeof animal.gmdLast === 'number' ? animal.gmdLast : null,
        gmd30: typeof animal.gmd30 === 'number' ? animal.gmd30 : null,
        lotId: animal.lotId,
        registro: null,
        categoria: null,
        currentPaddockId: animal.currentPaddockId || null,
        currentPaddockName: animal.currentPaddockName || null,
        nutritionPlan: animal.nutritionPlan || null,
    };
};

export const listAnimals = async (farmId: string, herdType: HerdType): Promise<HerdAnimal[]> => {
    const endpoint = herdType === 'PO' ? `/po/animals?farmId=${farmId}` : `/animals?farmId=${farmId}`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar animais.');
    }
    return (payload.animals || []).map((animal: any) => normalizeAnimal(animal, herdType));
};

export const createAnimal = async (
    farmId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<HerdAnimal> => {
    const endpoint = herdType === 'PO' ? '/po/animals' : '/animals';
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ farmId, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao salvar animal.');
    }
    return normalizeAnimal(data.animal, herdType);
};

export const listLots = async (farmId: string, herdType: HerdType): Promise<HerdLot[]> => {
    const endpoint = herdType === 'PO' ? `/po/lots?farmId=${farmId}` : `/lots?farmId=${farmId}`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar lotes.');
    }
    return payload.lots || [];
};

export const createLot = async (
    farmId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<HerdLot> => {
    const endpoint = herdType === 'PO' ? '/po/lots' : '/lots';
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ farmId, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao salvar lote.');
    }
    return data.lot;
};

export const listWeighings = async (animalId: string, herdType: HerdType): Promise<HerdWeighing[]> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/pesagens`
        : `/animals/${animalId}/pesagens`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar pesagens.');
    }
    if (herdType === 'PO') {
        return (payload.pesagens || []).map((row: any) => ({
            id: row.id,
            data: row.data,
            peso: row.peso,
            gmd: row.gmd,
        }));
    }
    return payload.pesagens || [];
};

export const createWeighing = async (
    animalId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<HerdWeighing> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/pesagens`
        : `/animals/${animalId}/pesagens`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao salvar pesagem.');
    }
    if (herdType === 'PO') {
        return {
            id: data.pesagem?.id,
            data: data.pesagem?.data,
            peso: data.pesagem?.peso,
            gmd: data.pesagem?.gmd,
        };
    }
    return data.pesagem;
};

export const listPaddockMoves = async (animalId: string, herdType: HerdType): Promise<PaddockMove[]> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/paddock-moves`
        : `/animals/${animalId}/paddock-moves`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar movimentações de pasto.');
    }
    return payload.moves || [];
};

export const createPaddockMove = async (
    animalId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<PaddockMove> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/paddock-moves`
        : `/animals/${animalId}/paddock-moves`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao salvar movimentação de pasto.');
    }
    return data.move;
};

// ---- Funções novas: Eventos de Inventário ----

export const listHerdEvents = async (animalId: string, herdType: HerdType): Promise<HerdEvent[]> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/eventos`
        : `/animals/${animalId}/eventos`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar eventos.');
    }
    return payload.events || [];
};

export const createHerdEvent = async (
    animalId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<HerdEvent> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/eventos`
        : `/animals/${animalId}/eventos`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao salvar evento.');
    }
    return data.event;
};

// ---- Funções novas: Manejo Sanitário ----

export const listSanitaryRecords = async (animalId: string, herdType: HerdType): Promise<SanitaryRecord[]> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/sanitario`
        : `/animals/${animalId}/sanitario`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar registros sanitários.');
    }
    return payload.records || [];
};

export const createSanitaryRecord = async (
    animalId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<SanitaryRecord> => {
    const endpoint = herdType === 'PO'
        ? `/po/animals/${animalId}/sanitario`
        : `/animals/${animalId}/sanitario`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao salvar registro sanitário.');
    }
    return data.record;
};
