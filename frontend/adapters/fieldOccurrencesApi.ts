import { buildApiUrl } from '../api';

export type FieldOccurrenceType = 'COCHO' | 'AGUA' | 'DOENTE' | 'AVARIA' | 'NASCEU' | 'MORREU';
export type FieldOccurrenceStatus = 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO';

export interface FieldOccurrenceAttachment {
    id: string;
    occurrenceId: string;
    fileName: string;
    mimeType: string;
    uploadedAt?: string | null;
    downloadUrl?: string | null;
}

export interface FieldOccurrence {
    id: string;
    farmId: string;
    createdById: string;
    createdByName?: string | null;
    type: FieldOccurrenceType;
    status: FieldOccurrenceStatus;
    description?: string | null;
    animalId?: string | null;
    paddockId?: string | null;
    occurredAt?: string | null;
    lat?: number | null;
    lng?: number | null;
    createdAt?: string | null;
    animal?: {
        id: string;
        brinco?: string | null;
        identificacao?: string | null;
        name?: string | null;
        nome?: string | null;
    } | null;
    paddock?: {
        id: string;
        name: string;
    } | null;
    attachments: FieldOccurrenceAttachment[];
}

export interface ListFieldOccurrencesParams {
    farmId?: string | null;
    status?: FieldOccurrenceStatus | '';
    type?: FieldOccurrenceType | '';
    limit?: number;
}

const withQuery = (path: string, params: Record<string, string | number | null | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query.set(key, String(value));
        }
    });
    const queryString = query.toString();
    return queryString ? `${path}?${queryString}` : path;
};

export const listFieldOccurrences = async ({
    farmId,
    status,
    type,
    limit = 50,
}: ListFieldOccurrencesParams): Promise<FieldOccurrence[]> => {
    const response = await fetch(buildApiUrl(withQuery('/field-occurrences', {
        farmId,
        status,
        type,
        limit,
    })), {
        credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao carregar ocorrências do EIXO Campo.');
    }
    return Array.isArray(payload?.occurrences) ? payload.occurrences : [];
};
