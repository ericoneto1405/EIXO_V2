import React from 'react';

/**
 * Fila de itens salvos offline (no celular) esperando pra sincronizar com o servidor.
 *
 * Mesmo padrão que já existia só no módulo de Nutrição (NutritionModule.tsx),
 * agora reutilizável em qualquer tela: Pesagens, Rebanho, etc.
 *
 * Como usar (com sincronização automática quando o sinal voltar):
 *   const queue = useOfflineQueue<MinhaLeitura>('eixo:pesagens:offline:', farmId, {
 *       autoSync: (item) => createPesagem(item),
 *       onSynced: (result) => { if (result.sent > 0) recarregarLista(); },
 *   });
 *   queue.enqueue(dadosDoFormulario);                 // guarda no celular
 *   queue.sync((item) => createPesagem(item));         // botão manual "Sincronizar agora"
 *
 * Sem `autoSync`, o hook funciona só no modo manual (só sincroniza quando
 * `sync()` é chamado, ex: pelo botão "Sincronizar agora").
 */

export type OfflineQueueItem<T> = T & {
    tempId: string;
    queuedAt: string;
};

export type OfflineSyncResult = {
    sent: number;
    pending: number;
};

export interface UseOfflineQueueOptions<T> {
    /** Quando definido, o hook tenta sincronizar sozinho assim que o navegador detectar internet. */
    autoSync?: (item: OfflineQueueItem<T>) => Promise<void>;
    /** Chamado depois de qualquer sincronização (manual ou automática) que enviou pelo menos 1 item. */
    onSynced?: (result: OfflineSyncResult) => void;
}

export function useOfflineQueue<T extends object>(
    storageKeyPrefix: string,
    scopeId?: string | null,
    options?: UseOfflineQueueOptions<T>,
) {
    const storageKey = React.useMemo(
        () => `${storageKeyPrefix}${scopeId || 'none'}`,
        [storageKeyPrefix, scopeId],
    );

    const [items, setItems] = React.useState<OfflineQueueItem<T>[]>([]);
    const itemsRef = React.useRef<OfflineQueueItem<T>[]>([]);
    itemsRef.current = items;

    const optionsRef = React.useRef(options);
    optionsRef.current = options;

    const load = React.useCallback(() => {
        if (!scopeId) {
            setItems([]);
            return;
        }
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            setItems([]);
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            setItems(Array.isArray(parsed) ? parsed : []);
        } catch {
            setItems([]);
        }
    }, [scopeId, storageKey]);

    const persist = React.useCallback((next: OfflineQueueItem<T>[]) => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            // localStorage indisponível ou cheio — mantém em memória mesmo assim
        }
        itemsRef.current = next;
        setItems(next);
    }, [storageKey]);

    React.useEffect(() => {
        load();
    }, [load]);

    /** Guarda um item novo na fila local (uso: "Salvar offline"). */
    const enqueue = React.useCallback((data: T): OfflineQueueItem<T> => {
        const item = {
            ...data,
            tempId: crypto.randomUUID(),
            queuedAt: new Date().toISOString(),
        } as OfflineQueueItem<T>;
        persist([...itemsRef.current, item]);
        return item;
    }, [persist]);

    /** Remove um item específico da fila sem tentar enviar (uso: descartar). */
    const remove = React.useCallback((tempId: string) => {
        persist(itemsRef.current.filter((item) => item.tempId !== tempId));
    }, [persist]);

    /**
     * Tenta enviar cada item pendente com `sendFn`. Quem falhar (ex: ainda sem
     * internet) continua guardado na fila pra tentar de novo depois.
     */
    const sync = React.useCallback(async (
        sendFn: (item: OfflineQueueItem<T>) => Promise<void>,
    ): Promise<OfflineSyncResult> => {
        const pendingBefore = itemsRef.current;
        if (!pendingBefore.length) {
            return { sent: 0, pending: 0 };
        }
        const pending: OfflineQueueItem<T>[] = [];
        let sent = 0;
        for (const item of pendingBefore) {
            try {
                await sendFn(item);
                sent += 1;
            } catch {
                pending.push(item);
            }
        }
        persist(pending);
        const result = { sent, pending: pending.length };
        if (result.sent > 0) {
            optionsRef.current?.onSynced?.(result);
        }
        return result;
    }, [persist]);

    // ── Sincronização automática ────────────────────────────────────────────
    // Assim que o navegador avisa que voltou a internet (evento 'online'),
    // ou quando essa tela abre já com internet e itens pendentes, tenta
    // sincronizar sozinho — sem precisar clicar em nada.
    React.useEffect(() => {
        const autoSyncFn = optionsRef.current?.autoSync;
        if (!autoSyncFn) {
            return undefined;
        }

        let cancelled = false;
        const tryAutoSync = () => {
            if (cancelled) return;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
            if (!itemsRef.current.length) return;
            void sync(autoSyncFn);
        };

        // Tenta uma vez ao montar/quando a fila muda, caso já esteja online.
        tryAutoSync();

        window.addEventListener('online', tryAutoSync);
        return () => {
            cancelled = true;
            window.removeEventListener('online', tryAutoSync);
        };
    }, [sync, items.length]);

    return {
        items,
        pendingCount: items.length,
        enqueue,
        remove,
        sync,
        reload: load,
    };
}
