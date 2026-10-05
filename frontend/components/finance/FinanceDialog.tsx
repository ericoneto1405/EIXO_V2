import React, { useEffect, useRef } from 'react';

interface Props {
    titleId: string;
    onClose: () => void;
    busy?: boolean;
    children: React.ReactNode;
}

export default function FinanceDialog({ titleId, onClose, busy = false, children }: Props) {
    const panel = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    const locked = useRef(busy);
    locked.current = busy;
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusable = (): HTMLElement[] => Array.from<HTMLElement>(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter((node) => node.getClientRects().length > 0 && node.tabIndex >= 0);
        (focusable()[0] || panel.current)?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); if (!locked.current) close.current(); }
            if (event.key === 'Tab') {
                const elements = focusable();
                const first = elements[0];
                const last = elements.at(-1);
                if (!first) { event.preventDefault(); panel.current?.focus(); return; }
                if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
    }, []);
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!busy) onClose(); }}>
        <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-(--eixo-surface) shadow-2xl" onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>;
}
