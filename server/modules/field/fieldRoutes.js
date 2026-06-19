import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { FIELD_OCCURRENCE_UPLOAD_ROOT, FIELD_ATTACHMENT_MAX_FILES, FIELD_OCCURRENCE_TYPES, FIELD_OCCURRENCE_STATUSES, FIELD_ATTACHMENT_ALLOWED_MIME_TYPES } from '../config/env.js';
import { parseCoordinate, validateCoordinatePair } from '../utils/validators.js';
import { parseDateValue } from '../utils/formatters.js';
import { logActivity } from '../utils/activityLog.js';
import { serializeFieldOccurrence, serializeFieldOccurrenceAttachment, getDaysSince, buildFieldOccurrenceAlert } from '../utils/serializers.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { requireAuth } from '../middlewares/requireAuth.js';
const prisma = new PrismaClient();

const sanitizeUploadFileName = (value) =>
    String(value || 'arquivo')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'arquivo';

const decodeBase64Payload = (value) => {
    const raw = String(value || '').trim();
    if (!raw) {
        return null;
    }
    const normalized = raw.includes(',') ? raw.split(',').pop() : raw;
    return Buffer.from(normalized, 'base64');
};

export function registerFieldRoutes(app) {
    app.get('/alerts', requireAuth, async (req, res) => {
        const { farmId } = req.query || {};
        const staleDays = 7;
        const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

        try {
            if (farmId) {
                const farm = await prisma.farm.findFirst({
                    where: buildFarmScopeFilter(req, { id: String(farmId) }),
                    select: { id: true },
                });
                if (!farm) {
                    return res.status(404).json({ message: 'Fazenda não encontrada.' });
                }
            }

            const farms = await prisma.farm.findMany({
                where: buildFarmScopeFilter(req, farmId ? { id: String(farmId) } : {}),
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
            });
            const farmIds = farms.map((farm) => farm.id);
            if (farmIds.length === 0) {
                return res.json({ alerts: [] });
            }

            const alerts = [];
            const fieldAppAlertsEnabled = process.env.ENABLE_FIELD_APP_ALERTS === 'true';

            if (fieldAppAlertsEnabled) {
                const [paddocks, staleOccurrences, immediateOccurrences] = await Promise.all([
                    prisma.paddock.findMany({
                        where: { farmId: { in: farmIds }, active: true },
                        select: { id: true, farmId: true, name: true },
                        orderBy: { name: 'asc' },
                    }),
                    prisma.fieldOccurrence.findMany({
                        where: {
                            farmId: { in: farmIds },
                            type: { in: ['COCHO', 'AGUA'] },
                        },
                        include: {
                            paddock: true,
                            createdBy: { select: { id: true, name: true } },
                        },
                        orderBy: { occurredAt: 'desc' },
                    }),
                    prisma.fieldOccurrence.findMany({
                        where: {
                            farmId: { in: farmIds },
                            status: 'PENDENTE',
                            type: { in: ['NASCEU', 'MORREU', 'DOENTE', 'AVARIA'] },
                        },
                        include: {
                            animal: true,
                            paddock: true,
                            createdBy: { select: { id: true, name: true } },
                        },
                        orderBy: { occurredAt: 'desc' },
                        take: 50,
                    }),
                ]);

                const paddocksByFarmId = new Map();
                paddocks.forEach((paddock) => {
                    const current = paddocksByFarmId.get(paddock.farmId) || [];
                    current.push(paddock);
                    paddocksByFarmId.set(paddock.farmId, current);
                });

                const latestByKey = new Map();
                staleOccurrences.forEach((occurrence) => {
                    const scopeId = occurrence.paddockId || '__farm__';
                    const key = `${occurrence.farmId}:${occurrence.type}:${scopeId}`;
                    if (!latestByKey.has(key)) {
                        latestByKey.set(key, occurrence);
                    }
                });

                for (const farm of farms) {
                    const farmPaddocks = paddocksByFarmId.get(farm.id) || [];
                    for (const type of ['COCHO', 'AGUA']) {
                        const scopes = farmPaddocks.length > 0
                            ? farmPaddocks.map((paddock) => ({ id: paddock.id, label: paddock.name }))
                            : [{ id: '__farm__', label: farm.name }];

                        for (const scope of scopes) {
                            const latest = latestByKey.get(`${farm.id}:${type}:${scope.id}`) || null;
                            if (latest && latest.occurredAt >= staleCutoff) {
                                continue;
                            }
                            const daysSince = getDaysSince(latest?.occurredAt);
                            const workerName = latest?.createdBy?.name ? String(latest.createdBy.name).trim() : '';
                            const workerPrefix = workerName ? `${workerName}, ` : '';
                            alerts.push({
                                id: `stale-${type.toLowerCase()}-${farm.id}-${scope.id}`,
                                type: 'warning',
                                message: `${type}: ${workerPrefix}${type === 'COCHO' ? 'cocho' : 'bebedouro'} sem atualização${daysSince === null ? ' no período' : ` há ${daysSince} dia(s)`}.`,
                                source: 'APP_MANEJO',
                                sourceType: type,
                                sourceId: latest?.id || null,
                                farmId: farm.id,
                                createdAt: latest?.occurredAt?.toISOString?.() ?? null,
                            });
                        }
                    }
                }

                immediateOccurrences
                    .map(buildFieldOccurrenceAlert)
                    .filter(Boolean)
                    .forEach((alert) => alerts.push(alert));
            }

            // ── Alertas financeiros ───────────────────────────────────────────
            try {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const firstOfMonth = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

                const [overduePayables, overdueReceivables, currentMonthTx] = await Promise.all([
                    prisma.financialTransaction.groupBy({
                        by: ['farmId'],
                        where: { farmId: { in: farmIds }, type: 'SAIDA', status: 'PENDENTE', vencimento: { lt: todayStart } },
                        _count: { id: true },
                        _sum: { valor: true },
                    }),
                    prisma.financialTransaction.groupBy({
                        by: ['farmId'],
                        where: { farmId: { in: farmIds }, type: 'ENTRADA', status: 'PENDENTE', vencimento: { lt: todayStart } },
                        _count: { id: true },
                        _sum: { valor: true },
                    }),
                    prisma.financialTransaction.groupBy({
                        by: ['farmId', 'type'],
                        where: { farmId: { in: farmIds }, status: 'PAGO', data: { gte: firstOfMonth } },
                        _sum: { valor: true },
                    }),
                ]);

                overduePayables.forEach(row => {
                    const count = row._count.id;
                    const total = Number(row._sum.valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    alerts.push({
                        id: `fin-pagar-vencido-${row.farmId}`,
                        type: 'critical',
                        message: `${count} conta(s) a pagar vencida(s) — total R$ ${total}`,
                        source: 'FINANCEIRO',
                        sourceType: 'FINANCEIRO_VENCIDO_PAGAR',
                        sourceId: null,
                        farmId: row.farmId,
                        createdAt: new Date().toISOString(),
                    });
                });

                overdueReceivables.forEach(row => {
                    const count = row._count.id;
                    alerts.push({
                        id: `fin-receber-vencido-${row.farmId}`,
                        type: 'warning',
                        message: `${count} conta(s) a receber vencida(s) — revise no módulo Financeiro`,
                        source: 'FINANCEIRO',
                        sourceType: 'FINANCEIRO_VENCIDO_RECEBER',
                        sourceId: null,
                        farmId: row.farmId,
                        createdAt: new Date().toISOString(),
                    });
                });

                const balanceByFarm = new Map();
                currentMonthTx.forEach(row => {
                    const prev = balanceByFarm.get(row.farmId) || { entrada: 0, saida: 0 };
                    if (row.type === 'ENTRADA') prev.entrada += Number(row._sum.valor ?? 0);
                    else prev.saida += Number(row._sum.valor ?? 0);
                    balanceByFarm.set(row.farmId, prev);
                });
                balanceByFarm.forEach((bal, fId) => {
                    if (bal.saida > 0 && bal.entrada - bal.saida < 0) {
                        alerts.push({
                            id: `fin-saldo-negativo-${fId}`,
                            type: 'warning',
                            message: 'Saldo do mês atual negativo — entradas menores que saídas',
                            source: 'FINANCEIRO',
                            sourceType: 'FINANCEIRO_SALDO_NEGATIVO',
                            sourceId: null,
                            farmId: fId,
                            createdAt: new Date().toISOString(),
                        });
                    }
                });
            } catch (finErr) {
                console.error('[alerts] erro ao gerar alertas financeiros:', finErr);
            }

            const severityOrder = { critical: 0, warning: 1, info: 2 };
            alerts.sort((a, b) => {
                const severityDiff = (severityOrder[a.type] ?? 3) - (severityOrder[b.type] ?? 3);
                if (severityDiff !== 0) {
                    return severityDiff;
                }
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            });

            return res.json({ alerts: alerts.slice(0, 80) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar alertas.' });
        }
    });

    app.get('/field-occurrences', requireAuth, async (req, res) => {
        const { farmId, limit = 50, offset = 0, type, status } = req.query;
        try {
            const where = {
                organizationId: req.saas?.organizationId || null,
                ...(farmId ? { farmId: String(farmId) } : {}),
                ...(type ? { type: String(type) } : {}),
                ...(status ? { status: String(status) } : {}),
                ...(req.access?.restrictToFarmIds?.length
                    ? { farmId: { in: req.access.restrictToFarmIds, ...(farmId ? undefined : {}) } }
                    : {}),
            };

            if (farmId && req.access?.restrictToFarmIds?.length && !req.access.restrictToFarmIds.includes(String(farmId))) {
                return res.status(403).json({ message: 'Acesso negado para essa fazenda.' });
            }

            const items = await prisma.fieldOccurrence.findMany({
                where,
                include: {
                    createdBy: { select: { id: true, name: true } },
                    animal: { include: { currentPaddock: true } },
                    paddock: true,
                    attachments: { orderBy: { uploadedAt: 'asc' } },
                },
                orderBy: { occurredAt: 'desc' },
                take: Math.min(Number(limit) || 50, 100),
                skip: Math.max(Number(offset) || 0, 0),
            });

            return res.json({
                occurrences: items.map(serializeFieldOccurrence),
                total: items.length,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar ocorrências de campo.' });
        }
    });

    app.post('/field-occurrences', requireAuth, async (req, res) => {
        const {
            farmId,
            type,
            status,
            description,
            animalId,
            paddockId,
            occurredAt,
            lat,
            lng,
            offlineCreatedAt,
            syncSource,
            photoCount,
        } = req.body || {};

        const normalizedType = String(type || '').trim().toUpperCase();
        const normalizedStatus = String(status || 'PENDENTE').trim().toUpperCase();
        const parsedOccurredAt = parseDateValue(occurredAt) || new Date();
        const parsedOfflineCreatedAt = offlineCreatedAt ? parseDateValue(offlineCreatedAt) : null;
        const parsedLat = parseCoordinate(lat);
        const parsedLng = parseCoordinate(lng);

        if (!farmId || !normalizedType) {
            return res.status(400).json({ message: 'Fazenda e tipo da ocorrência são obrigatórios.' });
        }
        if (!Number.isInteger(Number(photoCount)) || Number(photoCount) < 1) {
            return res.status(400).json({ message: 'Envie pelo menos uma foto da ocorrência.' });
        }
        if (!FIELD_OCCURRENCE_TYPES.includes(normalizedType)) {
            return res.status(400).json({ message: 'Tipo de ocorrência inválido.' });
        }
        if (!FIELD_OCCURRENCE_STATUSES.includes(normalizedStatus)) {
            return res.status(400).json({ message: 'Status de ocorrência inválido.' });
        }
        const coordinateError = validateCoordinatePair(parsedLat, parsedLng);
        if (coordinateError) {
            return res.status(400).json({ message: coordinateError });
        }
        if (farmId && req.access?.restrictToFarmIds?.length && !req.access.restrictToFarmIds.includes(String(farmId))) {
            return res.status(403).json({ message: 'Acesso negado para essa fazenda.' });
        }

        try {
            const farm = await prisma.farm.findFirst({
                where: buildFarmScopeFilter(req, { id: String(farmId) }),
                select: { id: true, organizationId: true },
            });
            if (!farm) {
                return res.status(404).json({ message: 'Fazenda não encontrada.' });
            }

            const normalizedSyncSource = typeof syncSource === 'string' ? syncSource.trim() || null : null;

            if (normalizedSyncSource) {
                const existingOccurrence = await prisma.fieldOccurrence.findFirst({
                    where: {
                        organizationId: farm.organizationId || req.saas?.organizationId,
                        farmId: String(farmId),
                        createdById: req.user.id,
                        syncSource: normalizedSyncSource,
                    },
                    include: {
                        createdBy: { select: { id: true, name: true } },
                        animal: { include: { currentPaddock: true } },
                        paddock: true,
                        attachments: true,
                    },
                });
                if (existingOccurrence) {
                    return res.json({ occurrence: serializeFieldOccurrence(existingOccurrence) });
                }
            }

            if (animalId) {
                const animal = await prisma.animal.findFirst({
                    where: {
                        id: String(animalId),
                        farmId: String(farmId),
                        farm: buildFarmRelationFilter(req),
                    },
                    select: { id: true },
                });
                if (!animal) {
                    return res.status(400).json({ message: 'Animal inválido para essa fazenda.' });
                }
            }

            if (paddockId) {
                const paddock = await prisma.paddock.findFirst({
                    where: {
                        id: String(paddockId),
                        farmId: String(farmId),
                        farm: buildFarmRelationFilter(req),
                    },
                    select: { id: true },
                });
                if (!paddock) {
                    return res.status(400).json({ message: 'Pasto inválido para essa fazenda.' });
                }
            }

            const occurrence = await prisma.fieldOccurrence.create({
                data: {
                    organizationId: farm.organizationId || req.saas?.organizationId,
                    farmId: String(farmId),
                    createdById: req.user.id,
                    type: normalizedType,
                    status: normalizedStatus,
                    description: typeof description === 'string' ? description.trim() || null : null,
                    animalId: animalId ? String(animalId) : null,
                    paddockId: paddockId ? String(paddockId) : null,
                    occurredAt: parsedOccurredAt,
                    lat: parsedLat,
                    lng: parsedLng,
                    offlineCreatedAt: parsedOfflineCreatedAt,
                    syncSource: normalizedSyncSource,
                },
                include: {
                    createdBy: { select: { id: true, name: true } },
                    animal: { include: { currentPaddock: true } },
                    paddock: true,
                    attachments: true,
                },
            });

            await logActivity(req, {
                action: 'OCORRENCIA_CAMPO_CRIADA',
                entity: 'FieldOccurrence',
                entityId: occurrence.id,
                description: `Registrou ocorrência ${normalizedType.toLowerCase()} na fazenda`,
                farmId: occurrence.farmId,
            });

            return res.status(201).json({ occurrence: serializeFieldOccurrence(occurrence) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar ocorrência de campo.' });
        }
    });

    app.post('/field-occurrences/:id/attachments', requireAuth, async (req, res) => {
        const { id } = req.params;
        const { fileName, mimeType, contentBase64 } = req.body || {};
        const normalizedMimeType = String(mimeType || '').trim().toLowerCase();
        const safeFileName = sanitizeUploadFileName(fileName);
        const fileBuffer = decodeBase64Payload(contentBase64);

        if (!safeFileName || !normalizedMimeType || !fileBuffer?.length) {
            return res.status(400).json({ message: 'Arquivo inválido para upload.' });
        }
        if (!FIELD_ATTACHMENT_ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
            return res.status(400).json({ message: 'Tipo de arquivo não suportado.' });
        }

        try {
            const occurrence = await prisma.fieldOccurrence.findFirst({
                where: {
                    id,
                    organizationId: req.saas?.organizationId || null,
                    ...(req.access?.restrictToFarmIds?.length ? { farmId: { in: req.access.restrictToFarmIds } } : {}),
                },
                include: {
                    attachments: true,
                },
            });

            if (!occurrence) {
                return res.status(404).json({ message: 'Ocorrência não encontrada.' });
            }
            if (occurrence.attachments.length >= FIELD_ATTACHMENT_MAX_FILES) {
                return res.status(400).json({ message: 'A ocorrência já atingiu o limite de 3 fotos.' });
            }

            const uploadDir = path.join(
                FIELD_OCCURRENCE_UPLOAD_ROOT,
                occurrence.organizationId,
                occurrence.farmId,
                occurrence.id,
            );
            await fs.mkdir(uploadDir, { recursive: true });

            const savedName = `${Date.now()}-${safeFileName}`;
            const fullPath = path.join(uploadDir, savedName);
            await fs.writeFile(fullPath, fileBuffer);

            const attachment = await prisma.fieldOccurrenceAttachment.create({
                data: {
                    occurrenceId: occurrence.id,
                    fileName: safeFileName,
                    mimeType: normalizedMimeType,
                    storagePath: fullPath,
                },
            });

            return res.status(201).json({ attachment: serializeFieldOccurrenceAttachment(attachment) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao salvar anexo da ocorrência.' });
        }
    });

    app.get('/field-occurrence-attachments/:attachmentId/file', requireAuth, async (req, res) => {
        const { attachmentId } = req.params;
        try {
            const attachment = await prisma.fieldOccurrenceAttachment.findFirst({
                where: {
                    id: attachmentId,
                    occurrence: {
                        organizationId: req.saas?.organizationId || null,
                        ...(req.access?.restrictToFarmIds?.length ? { farmId: { in: req.access.restrictToFarmIds } } : {}),
                    },
                },
            });
            if (!attachment) {
                return res.status(404).json({ message: 'Anexo não encontrado.' });
            }
            return res.sendFile(attachment.storagePath);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar anexo.' });
        }
    });
}
