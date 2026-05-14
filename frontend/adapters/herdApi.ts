import { buildApiUrl } from '../api';
import type { AnimalUI, LotUI, PaddockMove, WeighingSessionUI, WeighingUI } from '../types';

export type HerdType = 'COMMERCIAL' | 'PO';

export type HerdAnimal = AnimalUI;
export type HerdLot = LotUI;
export type HerdWeighing = WeighingUI;
export type HerdWeighingSession = WeighingSessionUI;

const getAnimalsBasePath = (herdType: HerdType) => (herdType === 'PO' ? '/po/animals' : '/animals');

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

export interface WeighingSessionSummary {
    sessionId: string;
    sessionName: string;
    sessionType: 'INDIVIDUAL' | 'GROUP';
    sessionDateTime: string;
    farmId: string;
    farmName: string;
    lotId: string | null;
    lotName: string | null;
    animalsCount: number;
    totalWeightKg: number;
    averageWeightKg: number | null;
    responsibleUserId: string | null;
    responsibleUserName: string | null;
}

export interface WeighingSessionItem {
    weighingId: string;
    animalId: string;
    animalCode: string | null;
    animalName: string | null;
    category: string | null;
    weightKg: number;
    previousWeightKg: number | null;
    gainKg: number | null;
    gmd: number | null;
    weighedAt: string;
}

export interface WeighingEditPayload {
    animalId: string;
    data: string;
    peso: number;
}

export interface WeighingSessionDetail {
    session: {
        sessionId: string;
        sessionName: string;
        sessionType: 'INDIVIDUAL' | 'GROUP';
        sessionDateTime: string;
        farmName: string;
        lotName: string | null;
        animalsCount: number;
        totalWeightKg: number;
        averageWeightKg: number | null;
        responsibleUserName: string | null;
    };
    items: WeighingSessionItem[];
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

const normalizeAnimal = (animal: any): HerdAnimal => {
    return {
        id: animal.id,
        farmId: animal.farmId,
        brinco: animal.brinco,
        nome: animal.nome || null,
        tipoCadastro: animal.tipoCadastro || null,
        identificacao: animal.brinco || animal.nome || animal.registro || 'Sem identificação',
        raca: animal.raca,
        sexo: getSexoLabel(animal.sexo),
        dataNascimento: animal.dataNascimento,
        pesoAtual: typeof animal.pesoAtual === 'number' ? animal.pesoAtual : null,
        dataUltimaPesagem: animal.dataUltimaPesagem || null,
        gmd: typeof animal.gmd === 'number' ? animal.gmd : null,
        gmdLast: typeof animal.gmdLast === 'number' ? animal.gmdLast : null,
        gmd30: typeof animal.gmd30 === 'number' ? animal.gmd30 : null,
        lotId: animal.lotId,
        registro: animal.registro || null,
        categoria: animal.categoria || null,
        selectionDecision: animal.selectionDecision || null,
        currentPaddockId: animal.currentPaddockId || null,
        currentPaddockName: animal.currentPaddockName || null,
        nutritionPlan: animal.nutritionPlan || null,
    };
};

export const listAnimals = async (farmId: string, herdType: HerdType): Promise<HerdAnimal[]> => {
    const endpoint = `${getAnimalsBasePath(herdType)}?farmId=${farmId}`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar animais.');
    }
    return (payload.animals || []).map((animal: any) => normalizeAnimal(animal));
};

export const createAnimal = async (
    farmId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<HerdAnimal> => {
    const endpoint = getAnimalsBasePath(herdType);
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
    return normalizeAnimal(data.animal);
};

export interface ImportBatchWeighingInput {
    data: string;
    peso: number;
}

export interface ImportBatchAnimalInput {
    sourceIndex?: number;
    rowLabel: string;
    brinco?: string;
    nome?: string;
    raca?: string;
    sexo?: string;
    dataNascimento?: string;
    pesoAtual?: number;
    categoria?: string;
    observacoes?: string;
    dataEntrada?: string;
    valorCompra?: number;
    tipoCadastro?: string;
    tatuagem?: string;
    sisbov?: string;
    maeNome?: string;
    paiNome?: string;
    lotId?: string;
    paddockId?: string;
    paddockStartAt?: string;
    weighings?: ImportBatchWeighingInput[];
}

export interface ImportBatchRowResult {
    index: number;
    success: boolean;
    animalId?: string;
    brinco?: string;
    nome?: string;
    message?: string;
    warnings?: string[];
}

export interface ImportBatchResponse {
    total: number;
    success: number;
    failures: number;
    results: ImportBatchRowResult[];
}

export const importAnimalsBatch = async (
    farmId: string,
    herdType: HerdType,
    items: ImportBatchAnimalInput[],
): Promise<ImportBatchResponse> => {
    const endpoint = `${getAnimalsBasePath(herdType)}/import-batch`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ farmId, items }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao importar em lote.');
    }
    return data as ImportBatchResponse;
};

export const listLots = async (farmId: string, herdType: HerdType): Promise<HerdLot[]> => {
    void herdType;
    const endpoint = `/lots?farmId=${farmId}`;
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
    void herdType;
    const endpoint = '/lots';
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
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/pesagens`;
    const response = await fetch(buildApiUrl(endpoint), { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao listar pesagens.');
    }
    return payload.pesagens || [];
};

export const createWeighing = async (
    animalId: string,
    herdType: HerdType,
    payload: Record<string, any>,
): Promise<HerdWeighing> => {
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/pesagens`;
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
    return data.pesagem;
};

export const createWeighingSession = async (
    farmId: string,
    name: string,
    responsibleName?: string,
): Promise<HerdWeighingSession> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, responsibleName }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao criar sessão de pesagem.');
    }
    return data;
};

export const listWeighingSessions = async (farmId: string): Promise<HerdWeighingSession[]> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions`), {
        credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao listar sessões de pesagem.');
    }
    return data.sessions || [];
};

export const updateWeighingSession = async (
    farmId: string,
    sessionId: string,
    payload: { name: string; responsibleName: string },
): Promise<HerdWeighingSession> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions/${sessionId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao editar sessão de pesagem.');
    }
    return data;
};

export const deleteWeighingSession = async (
    farmId: string,
    sessionId: string,
    masterPassword: string,
): Promise<void> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions/${sessionId}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ masterPassword }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao excluir sessão de pesagem.');
    }
};

export const listWeighingSessionSummaries = async (
    farmId: string,
    params: Record<string, string | number | undefined> = {},
): Promise<{ total: number; sessions: WeighingSessionSummary[] }> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions/summary${suffix}`), {
        credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao listar sessões de pesagem.');
    }
    return {
        total: data.total ?? 0,
        sessions: data.sessions || [],
    };
};

export const getWeighingSessionItems = async (farmId: string, sessionId: string): Promise<WeighingSessionDetail> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions/${sessionId}/items`), {
        credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao listar itens da sessão.');
    }
    return data;
};

export const updateWeighing = async (
    farmId: string,
    weighingId: string,
    payload: WeighingEditPayload,
): Promise<void> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighings/${weighingId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao editar pesagem.');
    }
};

export const deleteWeighing = async (
    farmId: string,
    weighingId: string,
    masterPassword: string,
): Promise<void> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighings/${weighingId}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ masterPassword }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao excluir pesagem.');
    }
};

export const listPaddockMoves = async (animalId: string, herdType: HerdType): Promise<PaddockMove[]> => {
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/paddock-moves`;
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
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/paddock-moves`;
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
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/eventos`;
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
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/eventos`;
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
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/sanitario`;
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
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}/sanitario`;
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

export const updateLot = async (
    lotId: string,
    herdType: HerdType,
    payload: {
        name: string;
        notes?: string;
        objective?: string;
        phase?: string;
        status?: string;
        startDate?: string;
    },
): Promise<HerdLot> => {
    void herdType;
    const endpoint = `/lots/${lotId}`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao editar lote.');
    return data.lot;
};

export const deleteLot = async (lotId: string, herdType: HerdType): Promise<void> => {
    void herdType;
    const endpoint = `/lots/${lotId}`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Erro ao excluir lote.');
    }
};

export const updateAnimalLot = async (
    animalId: string,
    herdType: HerdType,
    lotId: string | null,
): Promise<void> => {
    const endpoint = `${getAnimalsBasePath(herdType)}/${animalId}`;
    const response = await fetch(buildApiUrl(endpoint), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lotId }),
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Erro ao atualizar animal.');
    }
};
