import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middlewares/requireAuth.js';
import { logActivity } from '../utils/activityLog.js';

const prisma = new PrismaClient();

const serializeRequest = (request) => ({
    protocol: request.protocol,
    type: request.type,
    status: request.status,
    createdAt: request.createdAt,
});

const openRequestWhere = (type, userId, organizationId) => type === 'LOGIN'
    ? { type, status: 'OPEN', requesterUserId: userId }
    : { type, status: 'OPEN', organizationId };

export function registerAccountClosureRoutes(app) {
    app.get('/account-closure-requests', requireAuth, async (req, res) => {
        try {
            const organizationId = req.saas?.organizationId || null;
            const owner = organizationId && req.saas?.membershipRole === 'OWNER';
            const requests = await prisma.accountClosureRequest.findMany({
                where: {
                    status: 'OPEN',
                    OR: [
                        { type: 'LOGIN', requesterUserId: req.user.id },
                        ...(owner ? [{ type: 'ORGANIZATION', organizationId }] : []),
                    ],
                },
                orderBy: { createdAt: 'desc' },
            });
            return res.json({ requests: requests.map(serializeRequest) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao consultar pedidos de encerramento.' });
        }
    });

    app.post('/account-closure-requests', requireAuth, async (req, res) => {
        try {
            const type = req.body?.type;
            if (type !== 'LOGIN' && type !== 'ORGANIZATION') {
                return res.status(400).json({ message: 'Escolha o encerramento do login ou da organização.' });
            }

            const confirmationEmail = String(req.body?.confirmationEmail || '').trim().toLowerCase();
            if (confirmationEmail !== req.user.email.toLowerCase()) {
                return res.status(400).json({ message: 'Digite o e-mail da sua conta para confirmar o pedido.' });
            }

            const organizationId = type === 'ORGANIZATION' ? req.saas?.organizationId : null;
            if (type === 'ORGANIZATION') {
                if (!organizationId || req.saas?.membershipRole !== 'OWNER') {
                    return res.status(403).json({ message: 'Apenas o proprietário pode pedir o encerramento da organização.' });
                }
                const membership = await prisma.organizationMembership.findUnique({
                    where: { organizationId_userId: { organizationId, userId: req.user.id } },
                    select: { role: true },
                });
                if (membership?.role !== 'OWNER') {
                    return res.status(403).json({ message: 'Apenas o proprietário pode pedir o encerramento da organização.' });
                }
            }

            const where = openRequestWhere(type, req.user.id, organizationId);
            const existing = await prisma.accountClosureRequest.findFirst({ where });
            if (existing) return res.json({ request: serializeRequest(existing) });

            try {
                const request = await prisma.$transaction(async (tx) => {
                    const created = await tx.accountClosureRequest.create({
                        data: {
                            protocol: `ENC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
                            type,
                            requesterUserId: req.user.id,
                            requesterEmail: req.user.email,
                            organizationId,
                        },
                    });
                    await logActivity(tx, req, {
                        action: 'ENCERRAMENTO_SOLICITADO',
                        entity: 'AccountClosureRequest',
                        entityId: created.protocol,
                        description: type === 'LOGIN' ? 'Solicitou o encerramento do login' : 'Solicitou o encerramento da organização',
                        required: true,
                    });
                    return created;
                });
                return res.status(201).json({ request: serializeRequest(request) });
            } catch (error) {
                if (error?.code === 'P2002') {
                    const current = await prisma.accountClosureRequest.findFirst({ where });
                    if (current) return res.json({ request: serializeRequest(current) });
                }
                throw error;
            }
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar pedido de encerramento.' });
        }
    });
}
