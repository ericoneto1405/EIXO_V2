const ALLOWED_PATHS = new Set(['/health', '/api/chat/knowledge-status']);

export function createMaintenanceModeMiddleware(enabled) {
    return (req, res, next) => {
        const path = req.path.toLowerCase().replace(/\/+$/, '') || '/';
        if (!enabled || ALLOWED_PATHS.has(path)) return next();

        res.set('Retry-After', '300');
        return res.status(503).json({
            code: 'service_maintenance',
            message: 'O EIXO está temporariamente indisponível para manutenção. Tente novamente em alguns minutos.',
        });
    };
}
