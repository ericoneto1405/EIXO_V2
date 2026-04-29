import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { loadPendingReports, savePendingReports, type PendingReport } from '../offlineStorage';
import { readBlobAsDataUrl } from '../utils';

interface UseSyncReportsOptions {
  shouldSync: boolean;
}

export const useSyncReports = ({ shouldSync }: UseSyncReportsOptions) => {
  const [pendingReports, setPendingReports] = useState<PendingReport[]>([]);
  const [hasLoadedPendingReports, setHasLoadedPendingReports] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydratePendingReports = async () => {
      const storedReports = await loadPendingReports();
      if (cancelled) {
        return;
      }
      setPendingReports(storedReports);
      setHasLoadedPendingReports(true);
    };

    void hydratePendingReports();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedPendingReports) {
      return;
    }
    void savePendingReports(pendingReports);
  }, [hasLoadedPendingReports, pendingReports]);

  useEffect(() => {
    if (!hasLoadedPendingReports || !shouldSync || pendingReports.length === 0 || isSyncing) {
      return;
    }

    const syncReports = async () => {
      setIsSyncing(true);

      for (const report of pendingReports) {
        try {
          let remoteOccurrenceId = report.remoteOccurrenceId;

          if (!remoteOccurrenceId) {
            const createResponse = await apiFetch('/field-occurrences', {
              method: 'POST',
              body: JSON.stringify({
                farmId: report.farmId,
                type: report.type,
                description: report.description,
                animalId: report.animalId,
                paddockId: report.paddockId,
                occurredAt: report.occurredAt,
                lat: report.lat,
                lng: report.lng,
                offlineCreatedAt: report.offlineCreatedAt,
                syncSource: report.localId,
                photoCount: report.photos.length,
              }),
            });
            const createPayload = await createResponse.json().catch(() => ({}));
            if (!createResponse.ok) {
              throw new Error(createPayload?.message || 'Falha ao enviar ocorrência.');
            }

            remoteOccurrenceId = createPayload?.occurrence?.id || null;
            if (!remoteOccurrenceId) {
              throw new Error('Servidor não devolveu o id da ocorrência.');
            }

            setPendingReports((prev) =>
              prev.map((item) =>
                item.localId === report.localId
                  ? { ...item, remoteOccurrenceId, syncError: null }
                  : item,
              ),
            );
          }

          for (const photo of report.photos) {
            if (report.uploadedPhotoIds.includes(photo.id)) {
              continue;
            }

            // Converte apenas no envio para manter o armazenamento offline mais leve.
            // eslint-disable-next-line no-await-in-loop
            const contentBase64 = await readBlobAsDataUrl(photo.fileBlob);
            const attachmentResponse = await apiFetch(`/field-occurrences/${remoteOccurrenceId}/attachments`, {
              method: 'POST',
              body: JSON.stringify({
                fileName: photo.fileName,
                mimeType: photo.mimeType,
                contentBase64,
              }),
            });
            const attachmentPayload = await attachmentResponse.json().catch(() => ({}));
            if (!attachmentResponse.ok) {
              throw new Error(attachmentPayload?.message || 'Falha ao enviar foto.');
            }

            setPendingReports((prev) =>
              prev.map((item) =>
                item.localId === report.localId
                  ? {
                      ...item,
                      uploadedPhotoIds: item.uploadedPhotoIds.includes(photo.id)
                        ? item.uploadedPhotoIds
                        : [...item.uploadedPhotoIds, photo.id],
                      syncError: null,
                    }
                  : item,
              ),
            );
          }

          setPendingReports((prev) => prev.filter((item) => item.localId !== report.localId));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Falha ao sincronizar.';
          setPendingReports((prev) =>
            prev.map((item) =>
              item.localId === report.localId
                ? { ...item, syncError: message }
                : item,
            ),
          );
          break;
        }
      }

      setIsSyncing(false);
    };

    void syncReports();
  }, [hasLoadedPendingReports, isSyncing, pendingReports, shouldSync]);

  return {
    enqueuePendingReport: (report: PendingReport) => {
      setPendingReports((prev) => [...prev, report]);
    },
    isSyncing,
    pendingReports,
  };
};
