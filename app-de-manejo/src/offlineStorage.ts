export type FieldOccurrenceType = 'COCHO' | 'AGUA' | 'DOENTE' | 'AVARIA' | 'NASCEU' | 'MORREU';

export interface PendingPhoto {
  id: string;
  fileName: string;
  mimeType: string;
  fileBlob: Blob;
}

export interface PendingReport {
  localId: string;
  farmId: string;
  type: FieldOccurrenceType;
  description: string;
  animalId: string | null;
  paddockId: string | null;
  occurredAt: string;
  offlineCreatedAt: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  photos: PendingPhoto[];
  remoteOccurrenceId: string | null;
  uploadedPhotoIds: string[];
  syncError: string | null;
}

const LEGACY_PENDING_REPORTS_KEY = 'eixo_app_manejo_pending_reports';
const DB_NAME = 'eixo_app_manejo_offline';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const PENDING_REPORTS_RECORD_KEY = 'pending_reports';

interface LegacyPendingPhoto {
  id: string;
  fileName: string;
  mimeType: string;
  contentBase64?: string;
}

interface LegacyPendingReport extends Omit<PendingReport, 'photos'> {
  photos: LegacyPendingPhoto[];
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Falha ao converter blob.'));
    };
    reader.onerror = () => reject(new Error('Falha ao converter blob.'));
    reader.readAsDataURL(blob);
  });

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const isBlobPhoto = (photo: PendingPhoto | LegacyPendingPhoto): photo is PendingPhoto => {
  return 'fileBlob' in photo && photo.fileBlob instanceof Blob;
};

const normalizePendingPhoto = async (photo: PendingPhoto | LegacyPendingPhoto): Promise<PendingPhoto> => {
  if (isBlobPhoto(photo)) {
    return photo;
  }

  return {
    id: photo.id,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    fileBlob: await dataUrlToBlob(String(photo.contentBase64 || '')),
  };
};

const normalizePendingReports = async (reports: LegacyPendingReport[] | PendingReport[]) => {
  const normalizedReports = await Promise.all(
    reports.map(async (report) => ({
      ...report,
      photos: await Promise.all(report.photos.map(normalizePendingPhoto)),
    })),
  );

  return normalizedReports as PendingReport[];
};

const serializePendingReportsForFallback = async (reports: PendingReport[]) => {
  return Promise.all(
    reports.map(async (report) => ({
      ...report,
      photos: await Promise.all(
        report.photos.map(async (photo) => ({
          id: photo.id,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          contentBase64: await blobToDataUrl(photo.fileBlob),
        })),
      ),
    })),
  );
};

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponivel.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir banco local.'));
  });

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const database = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = handler(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao acessar banco local.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Falha na transacao local.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Transacao local cancelada.'));
    };
  });
};

const readLegacyPendingReports = (): LegacyPendingReport[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(LEGACY_PENDING_REPORTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const clearLegacyPendingReports = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(LEGACY_PENDING_REPORTS_KEY);
  } catch {
    // ignora erro de storage
  }
};

export const loadPendingReports = async (): Promise<PendingReport[]> => {
  try {
    const stored = await runTransaction<PendingReport[] | undefined>('readonly', (store) =>
      store.get(PENDING_REPORTS_RECORD_KEY),
    );
    if (Array.isArray(stored)) {
      return await normalizePendingReports(stored);
    }
  } catch {
    // tenta migracao/fallback abaixo
  }

  const legacyReports = readLegacyPendingReports();
  if (!legacyReports.length) {
    return [];
  }

  const normalizedLegacyReports = await normalizePendingReports(legacyReports);

  try {
    await runTransaction('readwrite', (store) => store.put(normalizedLegacyReports, PENDING_REPORTS_RECORD_KEY));
    clearLegacyPendingReports();
  } catch {
    return normalizedLegacyReports;
  }

  return normalizedLegacyReports;
};

export const savePendingReports = async (reports: PendingReport[]) => {
  try {
    await runTransaction('readwrite', (store) => store.put(reports, PENDING_REPORTS_RECORD_KEY));
    clearLegacyPendingReports();
  } catch {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const serializableReports = await serializePendingReportsForFallback(reports);
      localStorage.setItem(LEGACY_PENDING_REPORTS_KEY, JSON.stringify(serializableReports));
    } catch {
      // ignora erro de storage
    }
  }
};
