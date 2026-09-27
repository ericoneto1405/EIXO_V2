import React from 'react';
import {
    buildOfflineQueueStorageKey,
    createSingleFlight,
    getOfflineRejection,
    readOfflineQueue,
    removeOfflineQueueItem,
    runWithOfflineQueueLock,
    writeOfflineQueue,
} from './offlineQueueCore.mjs';

/**
 * Fila de itens salvos offline (no celular) esperando pra sincronizar com o servidor.
 *
 * Mesmo padrão que já existia só no módulo de Nutrição (NutritionModule.tsx),
 * agora reutilizável em qualquer tela: Pesagens, Rebanho, etc.
 *
 * Como usar (com sincronização automática quando o sinal voltar):
 *   const queue = useOfflineQueue<MinhaLeitura>('eixo:pesagens:offline:', farmId, {
 *       userId,
 *       autoSync: (item) => createPesagem(item),
 *       onSynced: (result) => { if (result.sent > 0) recarregarLista(); },
 *   });
 *   await queue.enqueue(dadosDoFormulario);           // guarda no celular
 *   queue.sync((item) => createPesagem(item));         // botão manual "Sincronizar agora"
 *
 * Sem `autoSync`, o hook funciona só no modo manual (só sincroniza quando
 * `sync()` é chamado, ex: pelo botão "Sincronizar agora").
 */

export type OfflineQueueItem<T> = T & {
    tempId: string;
    queuedAt: string;
    syncError?: {
        status: number;
        message: string;
        failedAt: string;
    };
};

export type OfflineSyncResult = {
    sent: number;
    pending: number;
    rejected: number;
    storageError: boolean;
};

export type OfflineEnqueueResult<T> =
    | { ok: true; item: OfflineQueueItem<T> }
    | { ok: false; error: string };

export interface UseOfflineQueueOptions<T> {
    userId: string | null | undefined;
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
    const userId = options?.userId;
    const storageKey = React.useMemo(
        () => buildOfflineQueueStorageKey(storageKeyPrefix, userId, scopeId),
        [storageKeyPrefix, userId, scopeId],
    );

    const [items, setItems] = React.useState<OfflineQueueItem<T>[]>([]);
    const itemsRef = React.useRef<OfflineQueueItem<T>[]>([]);
    const syncRunnerRef = React.useRef<{
        storageKey: string;
        run: (task: () => Promise<OfflineSyncResult>) => Promise<OfflineSyncResult>;
    } | null>(null);
    if (!syncRunnerRef.current || syncRunnerRef.current.storageKey !== storageKey) {
        syncRunnerRef.current = { storageKey, run: createSingleFlight<OfflineSyncResult>() };
    }
    const activeStorageKeyRef = React.useRef(storageKey);
    activeStorageKeyRef.current = storageKey;
    itemsRef.current = items;

    const optionsRef = React.useRef(options);
    optionsRef.current = options;

    const load = React.useCallback(() => {
        if (!scopeId || !userId) {
            itemsRef.current = [];
            setItems([]);
            return;
        }
        const next = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, storageKey);
        itemsRef.current = next;
        setItems(next);
    }, [scopeId, storageKey, userId]);

    const persistForKey = React.useCallback((targetStorageKey: string, next: OfflineQueueItem<T>[]): boolean => {
        if (!scopeId || !userId) return false;
        if (!writeOfflineQueue(window.localStorage, targetStorageKey, next)) return false;
        if (activeStorageKeyRef.current === targetStorageKey) {
            itemsRef.current = next;
            setItems(next);
        }
        return true;
    }, [scopeId, userId]);

    const persist = React.useCallback((next: OfflineQueueItem<T>[]): boolean => (
        persistForKey(storageKey, next)
    ), [persistForKey, storageKey]);

    React.useEffect(() => {
        load();
    }, [load]);

    React.useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.storageArea === window.localStorage && event.key === storageKey) load();
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [load, storageKey]);

    const withQueueLock = React.useCallback(<R,>(run: () => R | Promise<R>): Promise<R> => {
        const lockManager = typeof navigator !== 'undefined' && 'locks' in navigator
            ? navigator.locks
            : undefined;
        return runWithOfflineQueueLock(lockManager, `eixo:offline-sync:${storageKey}`, async () => run());
    }, [storageKey]);

    /** Guarda um item novo na fila local (uso: "Salvar offline"). */
    const enqueue = React.useCallback((data: T): Promise<OfflineEnqueueResult<T>> => withQueueLock(() => {
        const item = {
            ...data,
            tempId: crypto.randomUUID(),
            queuedAt: new Date().toISOString(),
        } as OfflineQueueItem<T>;
        const latest = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, storageKey);
        if (!persist([...latest, item])) {
            return {
                ok: false as const,
                error: 'Não foi possível salvar no aparelho. Libere espaço ou permita o armazenamento do navegador e tente novamente.',
            };
        }
        return { ok: true as const, item };
    }), [persist, storageKey, withQueueLock]);

    /** Remove um item específico da fila sem tentar enviar (uso: descartar). */
    const remove = React.useCallback((tempId: string): Promise<boolean> => withQueueLock(() => {
        const latest = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, storageKey);
        return persist(removeOfflineQueueItem(latest, tempId));
    }), [persist, storageKey, withQueueLock]);

    const update = React.useCallback((tempId: string, data: T): Promise<boolean> => withQueueLock(() => {
        const latest = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, storageKey);
        if (!latest.some((item) => item.tempId === tempId)) return false;
        const next = latest.map((item) => item.tempId === tempId ? {
            ...data,
            tempId: item.tempId,
            queuedAt: item.queuedAt,
        } as OfflineQueueItem<T> : item);
        return persist(next);
    }), [persist, storageKey, withQueueLock]);

    /**
     * Tenta enviar cada item pendente com `sendFn`. Quem falhar (ex: ainda sem
     * internet) continua guardado na fila pra tentar de novo depois.
     */
    const sync = React.useCallback((
        sendFn: (item: OfflineQueueItem<T>) => Promise<void>,
    ): Promise<OfflineSyncResult> => {
        return syncRunnerRef.current!.run(async (): Promise<OfflineSyncResult> => {
            const syncStorageKey = storageKey;
            const onSynced = optionsRef.current?.onSynced;
            return withQueueLock(async () => {
                const allBefore = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, syncStorageKey);
                const pendingBefore = allBefore.filter((item) => !item.syncError);
                if (!pendingBefore.length) {
                    return {
                        sent: 0,
                        pending: 0,
                        rejected: allBefore.filter((item) => Boolean(item.syncError)).length,
                        storageError: false,
                    };
                }

                let sent = 0;
                let storageError = false;
                for (const item of pendingBefore) {
                    try {
                        await sendFn(item);
                        sent += 1;
                        const latest = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, syncStorageKey);
                        const next = removeOfflineQueueItem(latest, item.tempId);
                        if (!persistForKey(syncStorageKey, next)) {
                            storageError = true;
                            break;
                        }
                    } catch (error) {
                        const rejection = getOfflineRejection(error);
                        if (rejection) {
                            const latest = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, syncStorageKey);
                            const next = latest.map((current) => current.tempId === item.tempId ? {
                                ...current,
                                syncError: { ...rejection, failedAt: new Date().toISOString() },
                            } : current);
                            if (!persistForKey(syncStorageKey, next)) break;
                        }
                        // Falhas temporárias continuam na fila para uma próxima tentativa.
                    }
                }
                const allAfter = readOfflineQueue<OfflineQueueItem<T>>(window.localStorage, syncStorageKey);
                const rejected = allAfter.filter((item) => Boolean(item.syncError)).length;
                const result = { sent, pending: allAfter.length - rejected, rejected, storageError };
                if (result.sent > 0 && activeStorageKeyRef.current === syncStorageKey) {
                    onSynced?.(result);
                }
                return result;
            });
        });
    }, [persistForKey, storageKey, withQueueLock]);

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
        waitingCount: items.filter((item) => !item.syncError).length,
        enqueue,
        remove,
        update,
        sync,
        reload: load,
        rejectedItems: items.filter((item) => Boolean(item.syncError)),
    };
}
