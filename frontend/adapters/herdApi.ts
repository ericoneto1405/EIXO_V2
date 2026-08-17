import { buildApiUrl } from '../api';
import type { AnimalUI, LotUI, PaddockMove, WeighingSessionUI, WeighingUI } from '../types';

export type HerdType = 'COMMERCIAL' | 'PO';

export type HerdAnimal = AnimalUI;
export type HerdLot = LotUI;
export type HerdWeighing = WeighingUI;
export type HerdWeighingSession = WeighingSessionUI;

const getAnimalsBasePath = (herdType: HerdType) => (herdType === 'PO' ? '/po/animals' : '/animals');
const getLotsBasePath = (herdType: HerdType) => (herdType === 'PO' ? '/po/lots' : '/lots');

// ---- Tipos novos ----

export type HerdEventType = 'NASCIMENTO' | 'COMPRA' | 'VENDA' | 'MORTE' | 'DESMAMA';
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
    const ultimoPeso = typeof animal.ultimoPeso === 'number' ? animal.ultimoPeso : null;
    return {
        id: animal.id,
        farmId: animal.farmId,
        brinco: animal.brinco,
        nome: animal.nome || null,
        tipoCadastro: animal.tipoCadastro || null,
        identificacao: animal.brinco || animal.nome || animal.registro || 'Sem identificação',
        raca: animal.raca,
        tipoRaca: animal.tipoRaca || null,
        composicaoMestica: animal.composicaoMestica || null,
        racaPredominante: animal.racaPredominante || null,
        padraoRacial: animal.padraoRacial || null,
        sexo: getSexoLabel(animal.sexo),
        dataNascimento: animal.dataNascimento,
        ultimoPeso,
        dataUltimaPesagem: animal.dataUltimaPesagem || null,
        gmd: typeof animal.gmd === 'number' ? animal.gmd : null,
        gmdLast: typeof animal.gmdLast === 'number' ? animal.gmdLast : null,
        gmd30: typeof animal.gmd30 === 'number' ? animal.gmd30 : null,
        lotId: animal.lotId,
        registro: animal.registro || null,
        registrationEntity: animal.registrationEntity || null,
        registrationNumber: animal.registrationNumber || null,
        registrationType: animal.registrationType || null,
        registrationCategory: animal.registrationCategory || null,
        categoria: animal.categoria || null,
        statusReprodutivo: animal.statusReprodutivo || null,
        previsaoParto: animal.previsaoParto || null,
        emTransferenciaEmbriao: Boolean(animal.emTransferenciaEmbriao),
        marcadoDescarte: Boolean(animal.marcadoDescarte),
        motivoDescarte: animal.motivoDescarte || null,
        selectionDecision: animal.selectionDecision || null,
        currentPaddockId: animal.currentPaddockId || null,
        currentPaddockName: animal.currentPaddockName || null,
        maeId: animal.maeId || null,
        maeNome: animal.maeNome || null,
        paiId: animal.paiId || null,
        paiNome: animal.paiNome || null,
        matrizResponsavelId: animal.matrizResponsavelId || null,
        identificacaoProvisoria: Boolean(animal.identificacaoProvisoria),
        identificacaoAnterior: animal.identificacaoAnterior || null,
        identificacaoMatrizSnapshot: animal.identificacaoMatrizSnapshot || null,
        sequenciaMatriz: typeof animal.sequenciaMatriz === 'number' ? animal.sequenciaMatriz : null,
        tatuagemOrelhaEsquerda: animal.tatuagemOrelhaEsquerda || null,
        origemNascimento: animal.origemNascimento || null,
        identificacaoProvisoriaOriginal: animal.identificacaoProvisoriaOriginal || null,
        receptoraGestacionalId: animal.receptoraGestacionalId || null,
        receptoraGestacionalSnapshot: animal.receptoraGestacionalSnapshot || null,
        doadoraSnapshot: animal.doadoraSnapshot || null,
        touroSnapshot: animal.touroSnapshot || null,
        embryoTransferId: animal.embryoTransferId || null,
        desmamadoEm: animal.desmamadoEm || null,
        pesoDesmamaKg: typeof animal.pesoDesmamaKg === 'number' ? animal.pesoDesmamaKg : null,
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

export interface BirthAnimalPayload {
    farmId: string;
    sexo: string;
    dataNascimento: string;
    pesoNascimento?: number;
    brinco?: string;
    nome?: string;
    maeId?: string;
    maeNome?: string;
    paiId?: string;
    paddockId?: string;
    lotId?: string;
    origemNascimento?: 'NATURAL' | 'TE';
    embryoTransferId?: string;
}

export interface BirthAnimalResponse {
    animal?: HerdAnimal;
    brincoProvisorio?: boolean;
    message?: string;
}

export const createBirthAnimal = async (
    payload: BirthAnimalPayload,
    herdType: HerdType = 'COMMERCIAL',
): Promise<BirthAnimalResponse> => {
    const response = await fetch(buildApiUrl(`${getAnimalsBasePath(herdType)}/nascimento`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao registrar nascimento.');
    }
    return data as BirthAnimalResponse;
};

export const assignDefinitiveIdentification = async (
    animalId: string,
    herdType: HerdType,
    identificacao: string,
): Promise<HerdAnimal> => {
    const response = await fetch(buildApiUrl(`${getAnimalsBasePath(herdType)}/${animalId}/identificacao-definitiva`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identificacao }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao atribuir ID definitivo.');
    return normalizeAnimal(data.animal);
};

export interface EmbryoTransfer {
    id: string;
    farmId: string;
    herdType: HerdType;
    embryoBatchId: string;
    recipientSnapshot: string;
    donorSnapshot: string;
    sireSnapshot?: string | null;
    transferredAt: string;
    status: string;
    embryoBatch?: { id: string; lote: string; tecnica: string };
}

export const listEmbryoTransfers = async (farmId: string, herdType: HerdType): Promise<EmbryoTransfer[]> => {
    const response = await fetch(buildApiUrl(`/repro/embryo-transfers?farmId=${encodeURIComponent(farmId)}&herdType=${herdType}&status=PENDING`), { credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao listar transferências de embrião.');
    return data.transfers || [];
};

export const createEmbryoTransfer = async (payload: {
    farmId: string;
    herdType: HerdType;
    embryoBatchId: string;
    recipientId: string;
    transferredAt: string;
    notes?: string;
}): Promise<EmbryoTransfer> => {
    const response = await fetch(buildApiUrl('/repro/embryo-transfers'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao registrar transferência de embrião.');
    return data.transfer;
};

export const registerCalfWeaning = async (animalId: string, herdType: HerdType, payload: {
    date: string;
    peso: number;
    identificacaoDefinitiva?: string;
    paddockId?: string;
    lotId?: string;
    observacoes?: string;
}): Promise<HerdAnimal> => {
    const response = await fetch(buildApiUrl(`${getAnimalsBasePath(herdType)}/${animalId}/desmama`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao registrar desmama.');
    return normalizeAnimal(data.animal);
};

export const updateResponsibleMother = async (
    animalId: string,
    herdType: HerdType,
    matrizResponsavelId: string,
): Promise<HerdAnimal> => {
    const response = await fetch(buildApiUrl(`${getAnimalsBasePath(herdType)}/${animalId}/matriz-responsavel`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matrizResponsavelId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao trocar a matriz responsável.');
    return normalizeAnimal(data.animal);
};

export const updatePoGenealogy = async (
    animalId: string,
    maeId: string | null,
    paiId: string | null,
): Promise<HerdAnimal> => {
    const response = await fetch(buildApiUrl(`/po/animals/${animalId}/genealogia`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ maeId, paiId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao corrigir genealogia P.O.');
    return normalizeAnimal(data.animal);
};

export const listLots = async (farmId: string, herdType: HerdType): Promise<HerdLot[]> => {
    const endpoint = `${getLotsBasePath(herdType)}?farmId=${farmId}`;
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
    const endpoint = getLotsBasePath(herdType);
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

export const createBulkWeighings = async (
    farmId: string,
    herdType: HerdType,
    payload: {
        animalIds: string[];
        animalCount: number;
        data: string;
        totalWeightKg: number;
        weighingSessionId?: string;
    },
): Promise<{ created: number; averageWeightKg: number; weighingSessionId: string | null }> => {
    const response = await fetch(buildApiUrl(`${getAnimalsBasePath(herdType)}/bulk-weighings`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ farmId, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || 'Erro ao salvar pesagem em grupo.');
    return data;
};

export const createWeighingSession = async (
    farmId: string,
    name: string,
    responsibleName?: string,
    herdType: HerdType = 'COMMERCIAL',
): Promise<HerdWeighingSession> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, responsibleName, herdType }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao criar sessão de pesagem.');
    }
    return data;
};

export const listWeighingSessions = async (farmId: string, herdType: HerdType = 'COMMERCIAL'): Promise<HerdWeighingSession[]> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions?herdType=${herdType}`), {
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
    herdType: HerdType = 'COMMERCIAL',
): Promise<{ total: number; sessions: WeighingSessionSummary[] }> => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    query.set('herdType', herdType);
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

export const getWeighingSessionItems = async (farmId: string, sessionId: string, herdType: HerdType = 'COMMERCIAL'): Promise<WeighingSessionDetail> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighing-sessions/${sessionId}/items?herdType=${herdType}`), {
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
    herdType: HerdType = 'COMMERCIAL',
): Promise<void> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighings/${weighingId}?herdType=${herdType}`), {
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
    herdType: HerdType = 'COMMERCIAL',
): Promise<void> => {
    const response = await fetch(buildApiUrl(`/farms/${farmId}/weighings/${weighingId}?herdType=${herdType}`), {
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
        productionPhase?: 'CRIA' | 'RECRIA' | 'ENGORDA' | 'REPRODUCAO' | 'OUTRA';
        status?: string;
        startDate?: string;
    },
): Promise<HerdLot> => {
    const endpoint = `${getLotsBasePath(herdType)}/${lotId}`;
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
    const endpoint = `${getLotsBasePath(herdType)}/${lotId}`;
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
