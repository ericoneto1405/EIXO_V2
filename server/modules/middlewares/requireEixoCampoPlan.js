import { canAccessEixoCampo } from '../utils/saasContext.js';

export const requireEixoCampoPlan = (req, res, next) => {
    if (!canAccessEixoCampo(req.saas, req.user?.roles)) {
        return res.status(403).json({
            code: 'eixo_campo_plan_required',
            message: 'O App EIXO Campo está disponível somente no plano EIXO Performance.',
        });
    }
    return next();
};
