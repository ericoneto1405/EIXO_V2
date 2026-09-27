export const removeOfflineQueueItem = (current, tempId) => (
    current.filter((item) => item.tempId !== tempId)
);

export const writeOfflineQueue = (storage, storageKey, value) => {
    try {
        storage.setItem(storageKey, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
};

export const readOfflineQueue = (storage, storageKey) => {
    try {
        const raw = storage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const buildOfflineQueueStorageKey = (prefix, userId, scopeId) => (
    `${prefix}${userId || 'none'}:${scopeId || 'none'}`
);

export const runWithOfflineQueueLock = (lockManager, lockName, run) => {
    if (!lockManager?.request) return run();
    return lockManager.request(lockName, run);
};

export const getOfflineRejection = (error) => {
    const status = Number(error?.status);
    if (!Number.isInteger(status) || status < 400 || status >= 500 || [401, 408, 429].includes(status)) {
        return null;
    }
    return {
        status,
        message: String(error?.message || 'O servidor recusou este registro.'),
    };
};

export const createSingleFlight = () => {
    let current = null;
    return (run) => {
        if (current) return current;
        const started = Promise.resolve().then(run);
        const locked = started.finally(() => {
            if (current === locked) current = null;
        });
        current = locked;
        return locked;
    };
};
