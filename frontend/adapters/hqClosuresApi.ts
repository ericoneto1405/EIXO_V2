import { buildApiUrl } from '../api';

export interface HQClosureRequest {
    protocol: string;
    type: 'LOGIN' | 'ORGANIZATION';
    status: 'OPEN' | 'CLOSED';
    requesterEmail: string;
    createdAt: string;
    closedAt: string | null;
    organization: { id: string; name: string } | null;
}

export class HQClosureError extends Error {
    constructor(message: string, public status: number) { super(message); }
}

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(buildApiUrl(path), { credentials: 'include', cache: 'no-store', signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new HQClosureError(payload.message || 'Erro ao consultar encerramentos.', response.status);
    return payload;
}

export const listHQClosures = (query: URLSearchParams, signal: AbortSignal) =>
    read<{ requests: HQClosureRequest[]; pagination: { page: number; pageSize: number; hasMore: boolean } }>(`/api/hq/encerramentos?${query}`, signal);

export const getHQClosure = (protocol: string, signal: AbortSignal) =>
    read<{ request: HQClosureRequest }>(`/api/hq/encerramentos/${encodeURIComponent(protocol)}`, signal);
