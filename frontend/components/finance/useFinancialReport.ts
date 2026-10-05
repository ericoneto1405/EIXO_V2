import { useEffect, useRef, useState } from 'react';

// A resposta só pode ser exibida para o contexto e a tentativa que a originaram.
export function useFinancialReport<T>(context: string, request: () => Promise<T>) {
    const [result, setResult] = useState<{ context: string; data?: T; error?: string } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const latestContext = useRef(context);
    latestContext.current = context;
    useEffect(() => {
        let active = true;
        setResult(null);
        request().then((data) => {
            if (active && latestContext.current === context) setResult({ context, data });
        }).catch((error) => {
            if (active && latestContext.current === context) setResult({ context, error: error?.message || 'Não foi possível carregar os dados.' });
        });
        return () => { active = false; };
    }, [context, attempt]);
    const current = result?.context === context ? result : null;
    return { report: current?.data ?? null, error: current?.error ?? null, loading: !current, retry: () => setAttempt((value) => value + 1) };
}
