import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { loadPendingWeighings, savePendingWeighings } from '../offlineStorage';
import type { PendingWeighing } from '../types';

interface UseSyncWeighingsOptions {
  shouldSync: boolean;
}

type EnqueueWeighingPayload = Omit<PendingWeighing, 'localId' | 'status' | 'syncError' | 'createdAt'>;

const buildLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createPath = (weighing: PendingWeighing) => {
  if (weighing.animalType === 'po') {
    return `/po/animals/${weighing.animalId}/pesagens`;
  }
  return `/animals/${weighing.animalId}/pesagens`;
};

export function useSyncWeighings({ shouldSync }: UseSyncWeighingsOptions) {
  const [pendingWeighings, setPendingWeighings] = useState<PendingWeighing[]>([]);
  const [hasLoadedPendingWeighings, setHasLoadedPendingWeighings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydratePendingWeighings = async () => {
      const storedWeighings = await loadPendingWeighings();
      if (cancelled) {
        return;
      }
      setPendingWeighings(storedWeighings);
      setHasLoadedPendingWeighings(true);
    };

    void hydratePendingWeighings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedPendingWeighings) {
      return;
    }
    void savePendingWeighings(pendingWeighings);
  }, [hasLoadedPendingWeighings, pendingWeighings]);

  const syncNow = useCallback(async () => {
    if (!hasLoadedPendingWeighings || isSyncing) {
      return;
    }

    const syncableWeighings = pendingWeighings.filter((item) => item.status === 'pendente' || item.status === 'erro');
    if (syncableWeighings.length === 0) {
      return;
    }

    setIsSyncing(true);

    for (const weighing of syncableWeighings) {
      try {
        const body: Record<string, unknown> = {
          data: weighing.data,
          peso: weighing.peso,
          weighingSessionId: null,
        };
        if (weighing.forceReplace) {
          body.forceReplace = true;
        }

        // eslint-disable-next-line no-await-in-loop
        const response = await apiFetch(createPath(weighing), {
          method: 'POST',
          body: JSON.stringify(body),
        });
        // eslint-disable-next-line no-await-in-loop
        const payload = await response.json().catch(() => ({}));

        if (response.status === 409) {
          setPendingWeighings((prev) =>
            prev.map((item) =>
              item.localId === weighing.localId
                ? { ...item, status: 'conflito', syncError: payload?.message || 'Já existe pesagem nesta data.' }
                : item,
            ),
          );
          continue;
        }

        if (!response.ok) {
          throw new Error(payload?.message || 'Falha ao sincronizar pesagem.');
        }

        setPendingWeighings((prev) => prev.filter((item) => item.localId !== weighing.localId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao sincronizar pesagem.';
        setPendingWeighings((prev) =>
          prev.map((item) =>
            item.localId === weighing.localId
              ? { ...item, status: 'erro', syncError: message }
              : item,
          ),
        );
      }
    }

    setIsSyncing(false);
  }, [hasLoadedPendingWeighings, isSyncing, pendingWeighings]);

  useEffect(() => {
    if (!shouldSync) {
      return;
    }
    void syncNow();
  }, [shouldSync, syncNow]);

  const enqueueWeighing = useCallback((weighing: EnqueueWeighingPayload) => {
    setPendingWeighings((prev) => [
      ...prev,
      {
        ...weighing,
        localId: buildLocalId(),
        status: 'pendente',
        syncError: null,
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  const removeWeighing = useCallback((localId: string) => {
    setPendingWeighings((prev) => prev.filter((item) => item.localId !== localId));
  }, []);

  const markForceReplace = useCallback((localId: string) => {
    setPendingWeighings((prev) =>
      prev.map((item) =>
        item.localId === localId
          ? { ...item, status: 'pendente', forceReplace: true, syncError: null }
          : item,
      ),
    );
  }, []);

  return {
    enqueueWeighing,
    isSyncing,
    markForceReplace,
    pendingWeighings,
    removeWeighing,
    syncNow,
  };
}
