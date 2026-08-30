import { formatSexoLabel, escapeHtml } from './formatters.js';
import { resolverCategoria } from '../herd/animalCategories.js';

// ─── Serializadores de Entidades ───────────────────────────────────────────────

export function serializeAnimal(animal) {
    // A categoria é resolvida na LEITURA, não guardada pronta no banco: assim o
    // bezerro vira novilho sozinho com o passar do tempo, sem rotina noturna.
    // O que o produtor escolheu na mão sempre ganha da dedução.
    const categoriaResolvida = resolverCategoria(animal);
    return {
        id: animal.id,
        brinco: animal.brinco,
        registro: animal.registro,
        tipoCadastro: animal.tipoCadastro,
        raca: animal.raca,
        sexo: formatSexoLabel(animal.sexo),
        categoria: categoriaResolvida.categoria,
        /** true = veio da dedução do sistema, não da escolha do produtor. */
        categoriaAutomatica: categoriaResolvida.automatica,
        /** o que está realmente gravado, para o formulário de edição. */
        categoriaDefinida: animal.categoria ?? null,
        dataNascimento: animal.dataNascimento ? animal.dataNascimento.toISOString() : null,
        /** true = a data veio sem o dia exato (só mês/ano) na importação, não de nascimento anotado. */
        dataNascimentoEstimada: animal.dataNascimentoEstimada ?? false,
        ultimoPeso: animal.pesagens?.[0]?.peso ?? animal.pesoAtual ?? null,
        gmd: animal.gmd ?? null,
        gmdLast: animal.gmd ?? null,
        gmd30: animal.gmd30 ?? null,
        dataUltimaPesagem: animal.pesagens?.[0]?.data?.toISOString?.() ?? null,
        farmId: animal.farmId,
        lotId: animal.lotId,
        currentPaddockId: animal.currentPaddockId ?? null,
        currentPaddockName: animal.currentPaddock?.name || null,
        nutritionPlan: animal.currentNutritionPlan || null,
        selectionDecision: animal.selectionDecision || null,
        // Campos P.O.
        tatuagem: animal.tatuagem || null,
        sisbov: animal.sisbov || null,
        maeId: animal.maeId || null,
        maeNome: animal.maeNome || null,
        paiId: animal.paiId || null,
        paiNome: animal.paiNome || null,
        // Campos estendidos
        nome: animal.nome || null,
        brincoEletronico: animal.brincoEletronico || null,
        padraoRacial: animal.padraoRacial || null,
        tipoRaca: animal.tipoRaca || null,
        composicaoMestica: animal.composicaoMestica || null,
        racaPredominante: animal.racaPredominante || null,
        funcaoReprodutiva: animal.funcaoReprodutiva || null,
        statusReprodutivo: animal.statusReprodutivo || null,
        previsaoParto: animal.previsaoParto ? animal.previsaoParto.toISOString() : null,
        observacoes: animal.observacoes || null,
        identificacaoProvisoria: animal.identificacaoProvisoria ?? false,
        identificacaoAnterior: animal.identificacaoAnterior || null,
        identificacaoMatrizSnapshot: animal.identificacaoMatrizSnapshot || null,
        sequenciaMatriz: animal.sequenciaMatriz ?? null,
        matrizResponsavelId: animal.matrizResponsavelId || null,
        origemNascimento: animal.origemNascimento || null,
        identificacaoProvisoriaOriginal: animal.identificacaoProvisoriaOriginal || null,
        receptoraGestacionalId: animal.receptoraGestacionalId || null,
        receptoraGestacionalSnapshot: animal.receptoraGestacionalSnapshot || null,
        doadoraSnapshot: animal.doadoraSnapshot || null,
        touroSnapshot: animal.touroSnapshot || null,
        embryoTransferId: animal.embryoTransferId || null,
        desmamadoEm: animal.desmamadoEm ? animal.desmamadoEm.toISOString() : null,
        pesoDesmamaKg: animal.pesoDesmamaKg ?? null,
        status: animal.status || 'VIVO',
        createdAt: animal.createdAt.toISOString(),
        updatedAt: animal.updatedAt.toISOString(),
    };
}

export function serializeSeason(season) {
    return {
        id: season.id,
        farmId: season.farmId,
        name: season.name,
        startAt: season.startAt.toISOString(),
        endAt: season.endAt.toISOString(),
        createdAt: season.createdAt.toISOString(),
        updatedAt: season.updatedAt.toISOString(),
    };
}

export function serializeReproEvent(event) {
    return {
        id: event.id,
        farmId: event.farmId,
        animalId: event.animalId,
        type: event.type,
        date: event.date.toISOString(),
        seasonId: event.seasonId,
        payload: event.payload || null,
        notes: event.notes || null,
        bullId: event.bullId || null,
        protocol: event.protocol || null,
        createdAt: event.createdAt.toISOString(),
    };
}

export function serializeCheckupRecord(record) {
    return {
        id: record.id,
        sessionId: record.sessionId,
        farmId: record.farmId,
        animalId: record.animalId,
        animal: record.animal
            ? { id: record.animal.id, brinco: record.animal.brinco || null, nome: record.animal.nome || null }
            : undefined,
        aptitude: record.aptitude,
        diagnosis: record.diagnosis || null,
        pregnant: typeof record.pregnant === 'boolean' ? record.pregnant : null,
        previsaoParto: record.previsaoParto ? record.previsaoParto.toISOString() : null,
        discardLight: record.discardLight || null,
        discardReason: record.discardReason || null,
        calfQuality: record.calfQuality || null,
        veterinarianDecision: record.veterinarianDecision || null,
        iatfCount: record.iatfCount ?? 0,
        bullId: record.bullId || null,
        protocol: record.protocol || null,
        notes: record.notes || null,
        createdAt: record.createdAt.toISOString(),
    };
}

export function serializeCheckupSession(session) {
    const records = Array.isArray(session.records) ? session.records : [];
    return {
        id: session.id,
        farmId: session.farmId,
        createdById: session.createdById,
        occurredAt: session.occurredAt.toISOString(),
        responsibleName: session.responsibleName || null,
        seasonId: session.seasonId || null,
        notes: session.notes || null,
        createdAt: session.createdAt.toISOString(),
        recordsCount: session._count?.records ?? records.length,
        records: records.map(serializeCheckupRecord),
    };
}

export function serializePoAnimal(animal) {
    // Plantel P.O. NÃO deduz categoria: o model não guarda `funcaoReprodutiva`,
    // então um touro de 8 anos sem categoria seria classificado como "Boi". Aqui
    // a categoria é só o que o produtor gravou.
    const categoriaResolvida = resolverCategoria(animal, { deduzir: false });
    return {
        id: animal.id,
        farmId: animal.farmId,
        brinco: animal.brinco,
        nome: animal.nome,
        raca: animal.raca,
        sexo: animal.sexo,
        dataNascimento: animal.dataNascimento ? animal.dataNascimento.toISOString() : null,
        ultimoPeso: animal.pesagens?.[0]?.peso ?? animal.pesoAtual ?? null,
        gmd: animal.gmd ?? null,
        gmdLast: animal.gmd ?? null,
        gmd30: animal.gmd30 ?? null,
        lotId: animal.lotId || null,
        currentPaddockId: animal.currentPaddockId,
        currentPaddockName: animal.currentPaddock?.name || null,
        nutritionPlan: animal.currentNutritionPlan || null,
        registro: animal.registro,
        registrationEntity: animal.registrationEntity || null,
        registrationNumber: animal.registrationNumber || null,
        registrationType: animal.registrationType || null,
        registrationCategory: animal.registrationCategory || null,
        categoria: categoriaResolvida.categoria,
        categoriaAutomatica: categoriaResolvida.automatica,
        categoriaDefinida: animal.categoria ?? null,
        observacoes: animal.observacoes,
        statusReprodutivo: animal.statusReprodutivo || null,
        previsaoParto: animal.previsaoParto ? animal.previsaoParto.toISOString() : null,
        emTransferenciaEmbriao: animal.emTransferenciaEmbriao ?? false,
        marcadoDescarte: animal.marcadoDescarte ?? false,
        motivoDescarte: animal.motivoDescarte || null,
        maeId: animal.maeId || null,
        maeNome: animal.maeNome || null,
        paiId: animal.paiId || null,
        paiNome: animal.paiNome || null,
        matrizResponsavelId: animal.matrizResponsavelId || null,
        identificacaoProvisoria: animal.identificacaoProvisoria ?? false,
        identificacaoAnterior: animal.identificacaoAnterior || null,
        identificacaoMatrizSnapshot: animal.identificacaoMatrizSnapshot || null,
        sequenciaMatriz: animal.sequenciaMatriz ?? null,
        tatuagemOrelhaEsquerda: animal.tatuagemOrelhaEsquerda || null,
        origemNascimento: animal.origemNascimento || null,
        identificacaoProvisoriaOriginal: animal.identificacaoProvisoriaOriginal || null,
        receptoraGestacionalId: animal.receptoraGestacionalId || null,
        receptoraGestacionalSnapshot: animal.receptoraGestacionalSnapshot || null,
        doadoraSnapshot: animal.doadoraSnapshot || null,
        touroSnapshot: animal.touroSnapshot || null,
        embryoTransferId: animal.embryoTransferId || null,
        desmamadoEm: animal.desmamadoEm ? animal.desmamadoEm.toISOString() : null,
        pesoDesmamaKg: animal.pesoDesmamaKg ?? null,
        createdAt: animal.createdAt.toISOString(),
        updatedAt: animal.updatedAt.toISOString(),
    };
}

export function serializePaddockMove(move) {
    return {
        id: move.id,
        farmId: move.farmId,
        paddockId: move.paddockId,
        paddockName: move.paddock?.name || null,
        animalId: move.animalId || null,
        poAnimalId: move.poAnimalId || null,
        startAt: move.startAt.toISOString(),
        endAt: move.endAt ? move.endAt.toISOString() : null,
        notes: move.notes || null,
        createdAt: move.createdAt.toISOString(),
    };
}

export function serializeSemenBatch(batch) {
    return {
        id: batch.id,
        farmId: batch.farmId,
        bullAnimalId: batch.bullAnimalId,
        bullPoAnimalId: batch.bullPoAnimalId,
        bullName: batch.bullName,
        bullRegistry: batch.bullRegistry,
        fornecedor: batch.fornecedor,
        lote: batch.lote,
        dataColeta: batch.dataColeta ? batch.dataColeta.toISOString() : null,
        dosesTotal: batch.dosesTotal,
        dosesDisponiveis: batch.dosesDisponiveis,
        localArmazenamento: batch.localArmazenamento,
        observacoes: batch.observacoes,
        bullPoAnimal: batch.bullPoAnimal
            ? {
                  id: batch.bullPoAnimal.id,
                  brinco: batch.bullPoAnimal.brinco,
                  nome: batch.bullPoAnimal.nome,
                  registro: batch.bullPoAnimal.registro,
              }
            : null,
        bullAnimal: batch.bullAnimal
            ? {
                  id: batch.bullAnimal.id,
                  brinco: batch.bullAnimal.brinco,
                  registro: batch.bullAnimal.registro,
                  tipoCadastro: batch.bullAnimal.tipoCadastro,
              }
            : null,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
    };
}

export function serializeNutritionPlan(plan) {
    return {
        id: plan.id,
        farmId: plan.farmId,
        nome: plan.nome,
        fase: plan.fase,
        startAt: plan.startAt.toISOString(),
        endAt: plan.endAt ? plan.endAt.toISOString() : null,
        metaGmd: plan.metaGmd,
        observacoes: plan.observacoes,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
    };
}

export function serializeNutritionAssignment(assignment) {
    return {
        id: assignment.id,
        farmId: assignment.farmId,
        planId: assignment.planId,
        lotId: assignment.lotId,
        poLotId: assignment.poLotId,
        animalId: assignment.animalId,
        poAnimalId: assignment.poAnimalId,
        startAt: assignment.startAt.toISOString(),
        endAt: assignment.endAt ? assignment.endAt.toISOString() : null,
        createdAt: assignment.createdAt.toISOString(),
        updatedAt: assignment.updatedAt.toISOString(),
    };
}

export function serializeEmbryoBatch(batch) {
    return {
        id: batch.id,
        farmId: batch.farmId,
        donorAnimalId: batch.donorAnimalId,
        donorPoAnimalId: batch.donorPoAnimalId,
        donorName: batch.donorName,
        donorRegistry: batch.donorRegistry,
        sireAnimalId: batch.sireAnimalId,
        sirePoAnimalId: batch.sirePoAnimalId,
        sireName: batch.sireName,
        sireRegistry: batch.sireRegistry,
        tecnica: batch.tecnica,
        estagio: batch.estagio,
        qualidade: batch.qualidade,
        lote: batch.lote,
        quantidadeTotal: batch.quantidadeTotal,
        quantidadeDisponivel: batch.quantidadeDisponivel,
        localArmazenamento: batch.localArmazenamento,
        observacoes: batch.observacoes,
        donorPoAnimal: batch.donorPoAnimal
            ? {
                  id: batch.donorPoAnimal.id,
                  brinco: batch.donorPoAnimal.brinco,
                  nome: batch.donorPoAnimal.nome,
                  registro: batch.donorPoAnimal.registro,
              }
            : null,
        donorAnimal: batch.donorAnimal
            ? {
                  id: batch.donorAnimal.id,
                  brinco: batch.donorAnimal.brinco,
                  registro: batch.donorAnimal.registro,
                  tipoCadastro: batch.donorAnimal.tipoCadastro,
              }
            : null,
        sirePoAnimal: batch.sirePoAnimal
            ? {
                  id: batch.sirePoAnimal.id,
                  brinco: batch.sirePoAnimal.brinco,
                  nome: batch.sirePoAnimal.nome,
                  registro: batch.sirePoAnimal.registro,
              }
            : null,
        sireAnimal: batch.sireAnimal
            ? {
                  id: batch.sireAnimal.id,
                  brinco: batch.sireAnimal.brinco,
                  registro: batch.sireAnimal.registro,
                  tipoCadastro: batch.sireAnimal.tipoCadastro,
              }
            : null,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
    };
}

export function serializePaddock(paddock) {
    return {
        id: paddock.id,
        farmId: paddock.farmId,
        name: paddock.name,
        areaHa: paddock.areaHa ?? null,
        divisionType: paddock.divisionType ?? null,
        forrageira: paddock.forrageira ?? null,
        lotacaoUaHa: paddock.lotacaoUaHa ?? null,
        sistemaPastejo: paddock.sistemaPastejo ?? null,
        diasDescanso: paddock.diasDescanso ?? null,
        capacity: paddock.capacity ?? null,
        lat: paddock.lat ?? null,
        lng: paddock.lng ?? null,
        mapGeometry: paddock.mapGeometry ?? null,
        active: paddock.active ?? true,
        createdAt: paddock.createdAt?.toISOString?.() ?? null,
        updatedAt: paddock.updatedAt?.toISOString?.() ?? null,
    };
}

export function serializeFieldOccurrenceAttachment(attachment) {
    return {
        id: attachment.id,
        occurrenceId: attachment.occurrenceId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        storagePath: attachment.storagePath,
        uploadedAt: attachment.uploadedAt?.toISOString?.() ?? null,
        downloadUrl: `/field-occurrence-attachments/${attachment.id}/file`,
    };
}

export function serializeFieldOccurrence(occurrence) {
    return {
        id: occurrence.id,
        organizationId: occurrence.organizationId,
        farmId: occurrence.farmId,
        createdById: occurrence.createdById,
        type: occurrence.type,
        status: occurrence.status,
        description: occurrence.description ?? null,
        animalId: occurrence.animalId ?? null,
        paddockId: occurrence.paddockId ?? null,
        occurredAt: occurrence.occurredAt?.toISOString?.() ?? null,
        lat: occurrence.lat ?? null,
        lng: occurrence.lng ?? null,
        offlineCreatedAt: occurrence.offlineCreatedAt?.toISOString?.() ?? null,
        syncSource: occurrence.syncSource ?? null,
        createdAt: occurrence.createdAt?.toISOString?.() ?? null,
        updatedAt: occurrence.updatedAt?.toISOString?.() ?? null,
        createdByName: occurrence.createdBy?.name ?? null,
        animal: occurrence.animal ? serializeAnimal(occurrence.animal) : null,
        paddock: occurrence.paddock ? serializePaddock(occurrence.paddock) : null,
        attachments: Array.isArray(occurrence.attachments)
            ? occurrence.attachments.map(serializeFieldOccurrenceAttachment)
            : [],
    };
}

export function serializeFinancialTransaction(t) {
    return {
        id: t.id,
        farmId: t.farmId,
        type: t.type,
        categoria: t.categoria,
        accountCategoryId: t.accountCategoryId || null,
        accountCategoryName: t.accountCategory?.name || null,
        accountCategoryGroup: t.accountCategory?.group || null,
        accountCategoryCashFlowClass: t.accountCategory?.cashFlowClass || null,
        accountCategoryResultClass: t.accountCategory?.resultClass || null,
        accountCategoryRecognitionRule: t.accountCategory?.recognitionRule || null,
        valor: parseFloat(t.valor.toString()),
        data: t.data,
        competenceDate: t.competenceDate || t.data,
        settledAt: t.settledAt || null,
        modelVersion: t.modelVersion || 1,
        descricao: t.descricao || null,
        vencimento: t.vencimento || null,
        status: t.status || 'PAGO',
        herdEventId: t.herdEventId || null,
        sanitaryRecordId: t.sanitaryRecordId || null,
        createdAt: t.createdAt,
    };
}

export function serializeHerdEvent(event) {
    return {
        id: event.id,
        farmId: event.farmId,
        animalId: event.animalId || null,
        poAnimalId: event.poAnimalId || null,
        type: event.type,
        date: event.date.toISOString(),
        peso: event.peso ?? null,
        valor: event.valor ?? null,
        origem: event.origem || null,
        destino: event.destino || null,
        observacoes: event.observacoes || null,
        purchasePurpose: event.purchasePurpose || null,
        createdAt: event.createdAt.toISOString(),
    };
}

export function serializeSanitaryRecord(record) {
    return {
        id: record.id,
        farmId: record.farmId,
        animalId: record.animalId || null,
        poAnimalId: record.poAnimalId || null,
        tipo: record.tipo,
        produto: record.produto,
        date: record.date.toISOString(),
        dose: record.dose || null,
        proximaAplicacao: record.proximaAplicacao ? record.proximaAplicacao.toISOString() : null,
        observacoes: record.observacoes || null,
        createdAt: record.createdAt.toISOString(),
    };
}

// ─── Funções Auxiliares de Serialização ────────────────────────────────────────

export function getOccurrenceAnimalLabel(occurrence) {
    const animal = occurrence?.animal;
    if (!animal) {
        return null;
    }
    return animal.brinco || animal.identificacao || animal.name || animal.id;
}

export function getDaysSince(date) {
    if (!date) {
        return null;
    }
    return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000)));
}

export function buildFieldOccurrenceAlert(occurrence) {
    const animalLabel = getOccurrenceAnimalLabel(occurrence);
    const paddockLabel = occurrence.paddock?.name || 'Local não informado';
    const description = occurrence.description ? String(occurrence.description).trim() : '';
    const createdAt = occurrence.occurredAt?.toISOString?.() ?? occurrence.createdAt?.toISOString?.() ?? null;
    const workerName = occurrence.createdBy?.name ? String(occurrence.createdBy.name).trim() : '';

    const parts = [];
    if (workerName) parts.push(workerName);
    if (animalLabel) parts.push(`animal ${animalLabel}`);
    if (paddockLabel) parts.push(`em ${paddockLabel}`);
    if (description) parts.push(`— ${description}`);

    return {
        id: occurrence.id,
        type: occurrence.type,
        status: occurrence.status,
        summary: parts.join(' ') || occurrence.type,
        createdAt,
    };
}
