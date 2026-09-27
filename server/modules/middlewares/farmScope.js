// ─── Filtros de Escopo Multi-Tenant ────────────────────────────────────────────

export function buildFarmScopeFilter(req, extra = {}) {
    const clauses = [
        req.saas?.organizationId ? { organizationId: req.saas.organizationId } : { userId: req.user.id },
    ];
    if (req.access?.restrictToFarmIds?.length) {
        clauses.push({ id: { in: req.access.restrictToFarmIds } });
    }
    if (Object.keys(extra).length) {
        clauses.push(extra);
    }
    return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

export function buildFarmRelationFilter(req, extra = {}) {
    const clauses = [
        req.saas?.organizationId ? { organizationId: req.saas.organizationId } : { userId: req.user.id },
    ];
    if (req.access?.restrictToFarmIds?.length) {
        clauses.push({ id: { in: req.access.restrictToFarmIds } });
    }
    if (Object.keys(extra).length) {
        clauses.push(extra);
    }
    return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

// Escopo completo da conta para relações que podem atravessar fazendas.
// Contas legadas sem organização só podem alcançar outras fazendas também
// legadas e pertencentes ao mesmo usuário.
export function buildFarmAccountFilter(farm) {
    return farm.organizationId
        ? { organizationId: farm.organizationId }
        : { organizationId: null, userId: farm.userId };
}
