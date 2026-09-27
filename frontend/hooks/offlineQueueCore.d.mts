export function removeOfflineQueueItem<T extends { tempId: string }>(current: T[], tempId: string): T[];
export function writeOfflineQueue(storage: Pick<Storage, 'setItem'>, storageKey: string, value: unknown): boolean;
export function readOfflineQueue<T>(storage: Pick<Storage, 'getItem'>, storageKey: string): T[];
export function buildOfflineQueueStorageKey(prefix: string, userId?: string | null, scopeId?: string | null): string;
export function runWithOfflineQueueLock<T>(
    lockManager: { request(name: string, callback: () => Promise<T>): Promise<T> } | null | undefined,
    lockName: string,
    run: () => Promise<T>,
): Promise<T>;
export function getOfflineRejection(error: unknown): { status: number; message: string } | null;
export function createSingleFlight<T>(): (run: () => Promise<T>) => Promise<T>;
