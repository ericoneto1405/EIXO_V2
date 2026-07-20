import React, { useCallback, useRef, useState } from 'react';

export type ToastType = 'success' | 'error';

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const notify = useCallback((message: string, type: ToastType = 'success') => {
        const id = nextId.current++;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3500);
    }, []);

    return { toasts, notify, dismiss };
}

export const ToastHost: React.FC<{ toasts: Toast[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;
    return (
        <div className="fixed bottom-5 right-5 z-[60] flex w-[min(92vw,340px)] flex-col gap-2" aria-live="polite" role="status">
            {toasts.map(t => {
                const isError = t.type === 'error';
                return (
                    <div
                        key={t.id}
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
                            isError
                                ? 'border-[rgba(184,66,50,0.24)] bg-[rgba(184,66,50,0.12)] text-[var(--eixo-danger)]'
                                : 'border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]'
                        }`}
                    >
                        <span aria-hidden="true" className="mt-0.5 font-bold">{isError ? '✕' : '✓'}</span>
                        <p className="flex-1 text-sm font-semibold">{t.message}</p>
                        <button
                            type="button"
                            onClick={() => onDismiss(t.id)}
                            aria-label="Fechar aviso"
                            className="rounded-md px-1 text-sm opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
        </div>
    );
};
