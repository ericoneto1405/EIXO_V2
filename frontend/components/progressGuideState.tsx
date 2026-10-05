import { useEffect, useState } from 'react';
import { buildApiUrl } from '../api';

export const FINANCIAL_RESULT_EVENT = 'eixo:financial-result-viewed';
export const financialResultKey = (userId: string, farmId: string) => `eixo_financial_result_viewed_v2_${userId}_${farmId}`;
export const initialDoneKey = (userId: string) => `eixo_onboarding_confirmed_v2_${userId}`;
export const readFlag = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
export const writeFlag = (key: string, value: boolean) => { try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* A preferência continua válida nesta sessão. */ } };

export type GuideNavigation = (view: string, options?: { herdTab?: 'animals' | 'weighings'; openAnimalForm?: boolean; openImportModal?: boolean }) => void;

export function useGuideCollapsed(userId: string, farmId: string | null, module: string) {
    const key = JSON.stringify(['eixo_guide_collapsed_v2', userId, farmId, module]);
    const [state, setState] = useState<{ key: string; value: boolean } | null>(null);
    const readCollapsedPreference = () => {
        try { return localStorage.getItem(key) !== '0'; }
        catch { return true; }
    };
    const collapsed = state?.key === key ? state.value : readCollapsedPreference();
    const setCollapsed = (value: boolean) => { writeFlag(key, value); setState({ key, value }); };
    return [collapsed, setCollapsed] as const;
}

// O resultado só pode aparecer no contexto que originou a consulta.
export function useGuideData<T>(context: string, load: () => Promise<T>, events: string[]) {
    const [result, setResult] = useState<{ context: string; data?: T; error: boolean; loading: boolean }>();
    const [revision, setRevision] = useState(0);
    const retry = () => setRevision((value) => value + 1);
    const eventKey = events.join('|');
    useEffect(() => {
        const refresh = () => setRevision((value) => value + 1);
        const names = eventKey.split('|').filter(Boolean);
        names.forEach((name) => window.addEventListener(name, refresh));
        return () => names.forEach((name) => window.removeEventListener(name, refresh));
    }, [eventKey]);
    useEffect(() => {
        let active = true;
        setResult((previous) => ({ context, data: previous?.context === context ? previous.data : undefined, loading: true, error: false }));
        load().then((data) => {
            if (active) setResult({ context, data, loading: false, error: false });
        }).catch(() => {
            if (active) setResult((previous) => ({ context, data: previous?.context === context ? previous.data : undefined, loading: false, error: true }));
        });
        return () => { active = false; };
    }, [context, load, revision]);
    return { data: result?.context === context ? result.data : undefined, loading: result?.context !== context || result.loading, error: result?.context === context && result.error, retry };
}

export async function hasFarmWeighings(farmId: string): Promise<boolean> {
    const response = await fetch(buildApiUrl(`/farms/${encodeURIComponent(farmId)}/weighings?limit=1`), { credentials: 'include' });
    if (!response.ok) throw new Error('Não foi possível verificar as pesagens.');
    const payload = await response.json();
    if (!Array.isArray(payload.weighings)) throw new Error('Resposta de pesagens inválida.');
    return (payload.total ?? payload.weighings.length) > 0;
}
