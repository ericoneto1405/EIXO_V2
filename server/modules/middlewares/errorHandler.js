export const asyncRoute = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
};

export const apiErrorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && error?.status === 400)) {
        return res.status(400).json({ message: 'JSON inválido.' });
    }

    console.error('Erro não tratado na API:', error);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
};
