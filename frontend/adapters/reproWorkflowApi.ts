import { buildApiUrl } from '../api';
import { EventoRepro } from './reproApi';
export interface Procedure {
    id?: string;
    titulo: string;
    produtoId: string | null;
    dose: number | null;
    unidade: string | null;
}
export interface Step {
    id: string;
    dia: number;
    titulo: string;
    procedimentos: Procedure[];
}
export interface Protocol {
    id: string;
    nome: string;
    passos: Step[];
}
export interface Traffic {
    cor: string;
    label: string;
    motivos: string[];
    dimensoes: { nome: string; resultado: string; evolucao?: string }[];
}
export interface WorkflowAnimal {
    status: string;
    desmamadoEm: string | null;
    previsaoParto: string | null;
    pesoAtual: number | null;
    id: string;
    brinco: string;
    sexo: string;
    dataNascimento: string | null;
    maeId: string | null;
    raca: string | null;
    lotId: string | null;
    currentPaddockId: string | null;
    statusReprodutivo: string | null;
    impedimento: string | null;
    reproEvents: (EventoRepro & { seasonId?: string })[];
    farol: Traffic | null;
}
export interface Season {
    id: string;
    name: string;
    startAt: string;
    endAt: string;
    tipo: string;
    notes?: string;
    exposures: { animalId: string }[];
}
export interface Round {
    id: string;
    dia0: string;
    seasonId: string | null;
    status: string;
    responsavel: string;
    vacas: {
        animalId: string;
        brinco: string;
        retirada?: { motivo: string };
    }[];
    resumo: { protocolSnapshot: Protocol };
}
export interface Rules {
    modelo: 'COMERCIAL' | 'PO';
    ativo: boolean;
    usarEstacoes?: boolean;
    estacoesVazias: number;
    perdas: number;
    iepMeses: number | null;
    desmamaKg: number | null;
    funcional: boolean;
    racial: boolean;
}
export interface WorkflowRecord {
    id: string;
    kind: string;
    animalId: string | null;
    sessionId: string | null;
    createdAt: string;
    createdById: string;
    data: { body: Record<string, any>; result: Record<string, any> };
}
export interface WorkflowData {
    animals: WorkflowAnimal[];
    seasons: Season[];
    protocols: Protocol[];
    rounds: Round[];
    legacyRounds: number;
    legacyRoundIds: string[];
    products: {
        id: string;
        name: string;
        unit: string;
        applicationUnit: string | null;
        applicationPerUnit: number | null;
        batches: { quantity: number; expiresAt: string | null }[];
    }[];
    semen: {
        id: string;
        bullName: string | null;
        lote: string;
        dosesDisponiveis: number;
    }[];
    records: WorkflowRecord[];
    rules: Rules | null;
    rulesVersion: string | null;
    performance: boolean;
    lots: { id: string; name: string }[];
    paddocks: { id: string; name: string }[];
}
export interface WorkflowDraft {
    action: string;
    body: Record<string, any>;
    savedAt?: string;
    error?: string;
}
async function request<T>(farmId: string, action = '', body?: Record<string, any>): Promise<T> {
    const response = await fetch(
        buildApiUrl(
            `/farms/${encodeURIComponent(farmId)}/reproducao/fluxo${action ? `/${encodeURIComponent(action)}` : ''}`,
        ),
        {
            credentials: 'include',
            ...(body
                ? {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                  }
                : {}),
        },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar o fluxo de reprodução.');
    return payload;
}
export const fetchWorkflow = (farmId: string) => request<WorkflowData>(farmId);
export const saveWorkflow = (farmId: string, draft: WorkflowDraft) =>
    request<Record<string, any>>(
        farmId,
        draft.action,
        ['ETAPA', 'INSEMINAR'].includes(draft.action) && draft.body.date
            ? { ...draft.body, date: new Date(draft.body.date).toISOString() }
            : draft.body,
    );

export async function fetchMatrixManagement(
    farmId: string,
    animalId: string,
): Promise<{
    records: (WorkflowRecord & { reversao: WorkflowRecord | null })[];
}> {
    const response = await fetch(
        buildApiUrl(
            `/farms/${encodeURIComponent(farmId)}/reproducao/fluxo/animais/${encodeURIComponent(animalId)}/historico`,
        ),
        { credentials: 'include' },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Não foi possível consultar os manejos desta matriz.');
    return payload;
}
