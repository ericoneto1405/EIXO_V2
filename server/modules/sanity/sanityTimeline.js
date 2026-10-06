export async function loadSanitaryTimeline(db, animal) {
    const where = { animalId: animal.id, farmId: animal.farmId };
    const [individual, applications] = await Promise.all([
        db.sanitaryRecord.findMany({ where }),
        db.sanitaryApplication.findMany({ where, include: { product: { select: { name: true, category: true } } } }),
    ]);
    const entities = [...individual.map(r => r.id), ...applications.flatMap(r => [r.groupId, r.id])];
    const logs = entities.length ? await db.activityLog.findMany({ where: { farmId: animal.farmId, entityId: { in: entities }, entity: { in: ['SanitaryRecord', 'SanitaryApplication'] }, action: { in: ['SANIDADE_HISTORICO', 'SANIDADE_APLICACAO', 'SANITARIO_VACINA', 'SANITARIO_VERMIFUGO', 'SANITARIO_TRATAMENTO', 'AUTORIA_REGISTRADA'] } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }) : [];
    const authors = new Map();
    for (const log of logs) if (!authors.get(log.entityId)) authors.set(log.entityId, log.user?.name || log.requestMeta?.actorName || null);
    return [...individual.map(r => ({ id: `record:${r.id}`, farmId: r.farmId, animalId: r.animalId, poAnimalId: null, tipo: r.tipo, produto: r.produto, date: r.date, dose: r.dose, proximaAplicacao: r.proximaAplicacao, observacoes: r.observacoes, createdAt: r.createdAt, origin: 'INDIVIDUAL', registeredBy: authors.get(r.id) || null, appliedBy: null })),
        ...applications.map(r => ({ id: `application:${r.id}`, farmId: r.farmId, animalId: r.animalId, poAnimalId: null, tipo: ['VACINA', 'VERMIFUGO'].includes(r.product.category) ? r.product.category : 'TRATAMENTO', produto: r.product.name, date: r.appliedAt, dose: r.dose === null ? null : `${r.dose} ${r.doseUnit}`, proximaAplicacao: null, observacoes: r.notes, createdAt: r.createdAt, origin: r.origin, registeredBy: authors.get(r.groupId) || authors.get(r.id) || null, appliedBy: r.appliedByName }))].sort((a, b) => new Date(b.date) - new Date(a.date) || a.id.localeCompare(b.id));
}
