import { buildApiUrl } from '../api';

interface NutritionPlan {
    id: string;
    nome: string;
    fase?: string | null;
    startAt: string;
    endAt?: string | null;
    metaGmd?: number | null;
    observacoes?: string | null;
}

interface NutritionAssignment {
    id: string;
    planId: string;
    lotId?: string | null;
    poLotId?: string | null;
    animalId?: string | null;
    poAnimalId?: string | null;
    startAt: string;
    endAt?: string | null;
}

export interface NutritionCurrentResponse {
    assignment: NutritionAssignment | null;
    plan: NutritionPlan | null;
}

const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(buildApiUrl(path), {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro na operação de nutrição.');
    }
    return payload;
};

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

export const getNutritionSettings = (farmId: string) =>
    request(withQuery('/nutrition/module/settings', { farmId }));

export const saveNutritionSettings = (body: Record<string, unknown>) =>
    request('/nutrition/module/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
    });

export const listNutritionIngredients = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/ingredients', { farmId, limit }));

export const createNutritionIngredient = (body: Record<string, unknown>) =>
    request('/nutrition/module/ingredients', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const updateNutritionIngredient = (id: string, body: Record<string, unknown>) =>
    request(`/nutrition/module/ingredients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const listNutritionPhases = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/phases', { farmId, limit }));

export const createNutritionPhase = (body: Record<string, unknown>) =>
    request('/nutrition/module/phases', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const updateNutritionPhase = (id: string, body: Record<string, unknown>) =>
    request(`/nutrition/module/phases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const listNutritionUnits = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/units', { farmId, limit }));

export const createNutritionUnit = (body: Record<string, unknown>) =>
    request('/nutrition/module/units', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const updateNutritionUnit = (id: string, body: Record<string, unknown>) =>
    request(`/nutrition/module/units/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const listNutritionPreparedFeeds = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/prepared-feeds', { farmId, limit }));

export const createNutritionPreparedFeed = (body: Record<string, unknown>) =>
    request('/nutrition/module/prepared-feeds', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const updateNutritionPreparedFeed = (id: string, body: Record<string, unknown>) =>
    request(`/nutrition/module/prepared-feeds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const listNutritionPlans = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/plans', { farmId, limit }));

export const createNutritionPlan = (body: Record<string, unknown>) =>
    request('/nutrition/module/plans', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const updateNutritionPlan = (id: string, body: Record<string, unknown>) =>
    request(`/nutrition/module/plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const listNutritionAssignments = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/assignments', { farmId, limit }));

export const createNutritionAssignment = (body: Record<string, unknown>) =>
    request('/nutrition/module/assignments', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const listNutritionFabrications = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/fabrications', { farmId, limit }));

export const createNutritionFabrication = (body: Record<string, unknown>) =>
    request('/nutrition/module/fabrications', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const approveNutritionFabrication = (id: string) =>
    request(`/nutrition/module/fabrications/${id}/approve`, {
        method: 'POST',
    });

export const cancelNutritionFabrication = (id: string, reason: string) =>
    request(`/nutrition/module/fabrications/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    });

export const listNutritionExecutions = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/executions', { farmId, limit }));

export const createNutritionExecution = (body: Record<string, unknown>) =>
    request('/nutrition/module/executions', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const approveNutritionExecution = (id: string) =>
    request(`/nutrition/module/executions/${id}/approve`, {
        method: 'POST',
    });

export const rejectNutritionExecution = (id: string, reason: string) =>
    request(`/nutrition/module/executions/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    });

export const cancelNutritionExecution = (id: string, reason: string) =>
    request(`/nutrition/module/executions/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    });

export const listNutritionTroughReadings = (farmId: string, limit = 100) =>
    request(withQuery('/nutrition/module/trough-readings', { farmId, limit }));

export const createNutritionTroughReading = (body: Record<string, unknown>) =>
    request('/nutrition/module/trough-readings', {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const approveNutritionTroughReading = (id: string) =>
    request(`/nutrition/module/trough-readings/${id}/approve`, {
        method: 'POST',
    });

export const rejectNutritionTroughReading = (id: string, reason: string) =>
    request(`/nutrition/module/trough-readings/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    });

export const getNutritionDashboard = (farmId: string, date?: string) =>
    request(withQuery('/nutrition/module/dashboard', { farmId, date }));

export const getCurrentNutrition = async (params: {
    farmId: string;
    animalId?: string;
    poAnimalId?: string;
    lotId?: string;
    poLotId?: string;
}): Promise<NutritionCurrentResponse> => {
    const query = new URLSearchParams();
    query.set('farmId', params.farmId);
    if (params.animalId) query.set('animalId', params.animalId);
    if (params.poAnimalId) query.set('poAnimalId', params.poAnimalId);
    if (params.lotId) query.set('lotId', params.lotId);
    if (params.poLotId) query.set('poLotId', params.poLotId);

    const response = await fetch(buildApiUrl(`/nutrition/assignments/current?${query.toString()}`), {
        credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || 'Erro ao buscar plano atual.');
    }
    return {
        assignment: payload.assignment || null,
        plan: payload.plan || null,
    };
};
