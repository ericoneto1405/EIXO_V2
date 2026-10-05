import { requireAuth, requireSuperAdmin } from '../middlewares/requireAuth.js';

const PAGE_SIZE = 25;
const select = {
    protocol: true, type: true, status: true, requesterEmail: true,
    createdAt: true, closedAt: true,
    organization: { select: { id: true, name: true } },
};

function parseQuery(query) {
    const { search = '', type = 'ALL', status = 'OPEN', page = '1' } = query;
    if (typeof search !== 'string' || search.length > 254
        || !['ALL', 'LOGIN', 'ORGANIZATION'].includes(type)
        || !['ALL', 'OPEN', 'CLOSED'].includes(status)
        || typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) return null;
    const term = search.trim();
    return {
        page: Number(page),
        where: {
            ...(type !== 'ALL' ? { type } : {}),
            ...(status !== 'ALL' ? { status } : {}),
            ...(term ? { OR: [
                { requesterEmail: { contains: term, mode: 'insensitive' } },
                { protocol: { contains: term, mode: 'insensitive' } },
            ] } : {}),
        },
    };
}

export function registerHQAccountClosureReadRoutes(app, prisma) {
    const noStore = (_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    };
    app.get('/api/hq/encerramentos', noStore, requireAuth, requireSuperAdmin, async (req, res) => {
        const parsed = parseQuery(req.query);
        if (!parsed) return res.status(400).json({ message: 'Filtros de encerramento inválidos.' });
        try {
            const rows = await prisma.accountClosureRequest.findMany({
                where: parsed.where, select,
                orderBy: [{ createdAt: 'asc' }, { protocol: 'asc' }],
                skip: (parsed.page - 1) * PAGE_SIZE,
                take: PAGE_SIZE + 1,
            });
            return res.json({
                requests: rows.slice(0, PAGE_SIZE),
                pagination: { page: parsed.page, pageSize: PAGE_SIZE, hasMore: rows.length > PAGE_SIZE },
            });
        } catch (error) {
            console.error('Erro ao consultar encerramentos HQ:', error);
            return res.status(500).json({ message: 'Erro ao consultar pedidos de encerramento.' });
        }
    });

    app.get('/api/hq/encerramentos/:protocol', noStore, requireAuth, requireSuperAdmin, async (req, res) => {
        if (!/^ENC-\d{8}-[A-F0-9]{16}$/.test(req.params.protocol)) {
            return res.status(400).json({ message: 'Protocolo inválido.' });
        }
        try {
            const request = await prisma.accountClosureRequest.findUnique({
                where: { protocol: req.params.protocol }, select,
            });
            if (!request) return res.status(404).json({ message: 'Pedido não encontrado.' });
            return res.json({ request });
        } catch (error) {
            console.error('Erro ao consultar pedido HQ:', error);
            return res.status(500).json({ message: 'Erro ao consultar pedido de encerramento.' });
        }
    });
}
