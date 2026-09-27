import React from 'react';

interface RejectedItem {
    tempId: string;
    syncError?: { message: string };
}

interface OfflineRejectedItemsProps<T extends RejectedItem> {
    items: T[];
    getLabel: (item: T) => string;
    onCorrect: (item: T) => void;
    onDiscard: (tempId: string) => void;
}

export default function OfflineRejectedItems<T extends RejectedItem>({
    items,
    getLabel,
    onCorrect,
    onDiscard,
}: OfflineRejectedItemsProps<T>) {
    if (!items.length) return null;

    return (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <p className="font-bold">Registros recusados pelo servidor</p>
            {items.map((item) => (
                <div key={item.tempId} className="rounded-lg border border-red-200 bg-white p-3">
                    <p className="font-semibold">{getLabel(item)}</p>
                    <p className="mt-1">{item.syncError?.message || 'Confira os dados antes de tentar novamente.'}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-lg bg-[var(--eixo-green)] px-2.5 py-1 font-semibold text-[#1a1a1a]"
                            onClick={() => onCorrect(item)}
                        >
                            Corrigir
                        </button>
                        <button
                            type="button"
                            className="rounded-lg border border-red-300 px-2.5 py-1 font-semibold"
                            onClick={() => {
                                if (window.confirm('Descartar este registro salvo no celular?')) onDiscard(item.tempId);
                            }}
                        >
                            Descartar
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
