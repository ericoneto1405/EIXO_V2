import { buildApiUrl } from '../api';

export interface ReproCheckupRecord {
    id: string;
    sessionId: string;
    farmId: string;
    animalId: string;
    animal?: { id: string; brinco?: string | null; nome?: string | null };
    aptitude: string;
    diagnosis?: string | null;
    pregnant: boolean | null;
    previsaoParto?: string | null;
    discardLight?: string | null;
    discardReason?: string | null;
    calfQuality?: string | null;
    veterinarianDecision?: string | null;
    iatfCount?: number;
    bullId?: string | null;
    protocol?: string | null;
    notes?: string | null;
    createdAt: string;
}

export interface ReproCheckupSession {
    id: string;
    farmId: string;
    createdById: string;
    occurredAt: string;
    responsibleName?: string | null;
    seasonId?: string | null;
    notes?: string | null;
    createdAt: string;
    recordsCount: number;
    records: ReproCheckupRecord[];
}

export interface ReproKpis {
    evaluated: number;
    pregnant: number;
    empty: number;
    pregRate: number | null;
    repeatEmptyCount: number;
    discardCandidateCount: number;
}

export interface ReproFarol {
    farol: { green: number; yellow: number; red: number };
    redAnimals: { animalId: string; label: string; reason: string }[];
}

export interface NewCheckupRecord {
    animalId: string;
    pregnant: boolean | null;
    previsaoParto?: string | null;
    notes?: string | null;
}

export interface NewCheckupPayload {
    farmId: string;
    occurredAt: string;
    responsibleName?: string | null;
    seasonId?: string | null;
    notes?: string | null;
    records: NewCheckupRecord[];
}

const withQuery = (path: string, params: Record<string, string | null | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query.set(key, String(value));
        }
    });
    const queryString = query.toString();
    return queryString ? `${path}?${queryString}` : path;
};

export const listCheckups = async (
    farmId: string,
    opts: { seasonId?: string | null; from?: string | null; to?: string | null } = {},
): Promise<ReproCheckupSession[]> => {
    const response = await fetch(buildApiUrl(withQuery('/repro/checkups', { farmId, ...opts })), {
        credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao carregar avaliações.');
    }
    return Array.isArray(payload?.sessions) ? payload.sessions : [];
};

export const createCheckup = async (payload: NewCheckupPayload): Promise<ReproCheckupSession> => {
    const response = await fetch(buildApiUrl('/repro/checkups'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao salvar avaliação.');
    }
    return data.session;
};

export const updateCheckup = async (id: string, payload: NewCheckupPayload): Promise<ReproCheckupSession> => {
    const response = await fetch(buildApiUrl(`/repro/checkups/${id}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.message || 'Erro ao editar avaliação.');
    }
    return data.session;
};

export const deleteCheckup = async (id: string): Promise<void> => {
    const response = await fetch(buildApiUrl(`/repro/checkups/${id}`), {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Erro ao apagar avaliação.');
    }
};

export const getReproFarol = async (
    farmId: string,
    seasonId?: string | null,
): Promise<ReproFarol> => {
    const response = await fetch(buildApiUrl(withQuery('/repro/farol', { farmId, seasonId })), {
        credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao carregar o farol.');
    }
    return {
        farol: payload?.farol || { green: 0, yellow: 0, red: 0 },
        redAnimals: Array.isArray(payload?.redAnimals) ? payload.redAnimals : [],
    };
};

export const getReproKpis = async (
    farmId: string,
    seasonId?: string | null,
): Promise<ReproKpis | null> => {
    const response = await fetch(buildApiUrl(withQuery('/repro/kpis', { farmId, seasonId })), {
        credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao carregar indicadores.');
    }
    return payload?.kpis || null;
};
