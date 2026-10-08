import { isDeepStrictEqual } from 'node:util';
import {
    check,
    ids,
    date,
    text,
    normalizeProtocol,
    consumption,
    validateRules,
    matrixTraffic,
} from './reproWorkflowRules.js';
import { podeEntrarNoProtocolo, calcularSituacao, validarParto, pesoAjustado205, DESMAMA_PRECOCE_DIAS } from './reproRules.js';

// Registrado depois dos mesmos middlewares de autenticação, módulo e fazenda das rotas legadas.
export function registerReproWorkflowRoutes(app, { prisma, temPerformance, recalcularVaca }) {
    const base = '/farms/:farmId/reproducao/fluxo';
    const error = (res, e) => {
        if (e.code === 'P2034' || e.code === 'P2002')
            return res.status(409).json({
                message: 'Outro lançamento foi confirmado. Atualize e confira antes de reenviar o rascunho.',
            });
        if (e.code === 'P2021')
            return res.status(503).json({
                message: 'O fluxo de reprodução aguarda atualização do banco pelo administrador.',
            });
        if (!e.status) console.error('Reprodução integrada:', e);
        return res.status(e.status || 500).json({
            message: e.status ? e.message : 'Não foi possível concluir. Seu rascunho deve ser preservado.',
        });
    };
    const animals = async (tx, farmId, selection, sex = 'FEMEA') => {
        const selectionIds = ids(selection);
        const list = await tx.animal.findMany({
            where: {
                farmId,
                id: { in: selectionIds },
                status: 'VIVO',
                ...(sex ? { sexo: sex } : {}),
            },
            include: {
                reproEvents: {
                    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });
        check(list.length === selectionIds.length, 'Há animal indisponível ou de outra fazenda.');
        return list;
    };
    const event = async (tx, req, animal, type, when, payload, seasonId = null) => {
        const farmId = req.reproFarm.id;
        const e = await tx.reproEvent.create({
            data: {
                farmId,
                animalId: animal.id,
                type,
                date: when,
                seasonId,
                lotId: animal.lotId,
                createdById: req.user.id,
                payload: { ...payload, workflowVersion: 1 },
                notes: req.body?.ocorrencia || null,
            },
        });
        await recalcularVaca(tx, animal.id, await tx.reproSettings.findUnique({ where: { farmId } }));
        return e;
    };
    const season = async (tx, farmId, id, when, animalIds, exposure = false) => {
        if (!id) return null;
        const s = await tx.breedingSeason.findFirst({
            where: { id, farmId },
            include: { exposures: true },
        });
        check(s, 'Estação não encontrada.');
        check(
            !exposure || (when >= s.startAt && when <= s.endAt && !s.notes?.startsWith('[ENCERRADA]')),
            'A exposição deve ocorrer dentro de uma estação aberta.',
        );
        const linked = exposure
            ? []
            : await tx.reproEvent.findMany({
                  where: {
                      farmId,
                      seasonId: s.id,
                      type: 'COBERTURA',
                      animalId: { in: animalIds },
                  },
              });
        check(
            animalIds.every(
                (id) => s.exposures.some((e) => e.animalId === id) || linked.some((e) => e.animalId === id),
            ),
            'Selecione somente participantes da estação.',
        );
        return s;
    };
    const round = async (tx, farmId, sessionId) => {
        const s = await tx.iatfSession.findFirst({
            where: { farmId, id: sessionId },
        });
        check(s && s.resumo?.workflowVersion === 1, 'Rodada integrada não encontrada.');
        return s;
    };
    const records = (tx, farmId, sessionId, kind) =>
        tx.reproWorkflowRecord.findMany({
            where: { farmId, sessionId, ...(kind ? { kind } : {}) },
            orderBy: { createdAt: 'asc' },
        });

    app.get(base, async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const [list, seasons, protocols, rounds, products, semen, history, lots, paddocks] = await Promise.all([
                prisma.animal.findMany({
                    where: { farmId },
                    select: {
                        status: true,
                        desmamadoEm: true,
                        pesoAtual: true,
                        previsaoParto: true,
                        id: true,
                        brinco: true,
                        sexo: true,
                        dataNascimento: true,
                        maeId: true,
                        raca: true,
                        lotId: true,
                        currentPaddockId: true,
                        statusReprodutivo: true,
                        reproEvents: {
                            orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
                        },
                    },
                    orderBy: { brinco: 'asc' },
                }),
                prisma.breedingSeason.findMany({
                    where: { farmId },
                    include: { exposures: true },
                    orderBy: { startAt: 'desc' },
                }),
                prisma.reproProtocol.findMany({
                    where: { farmId, ativo: true },
                    orderBy: { nome: 'asc' },
                }),
                prisma.iatfSession.findMany({
                    where: { farmId },
                    orderBy: { dia0: 'desc' },
                }),
                prisma.pharmacyProduct.findMany({
                    where: { farmId, active: true },
                    select: {
                        id: true,
                        name: true,
                        unit: true,
                        applicationUnit: true,
                        applicationPerUnit: true,
                        batches: {
                            select: { quantity: true, expiresAt: true },
                        },
                    },
                }),
                prisma.semenBatch.findMany({
                    where: { farmId },
                    select: {
                        id: true,
                        bullName: true,
                        bullAnimal: { select: { brinco: true } },
                        lote: true,
                        dosesDisponiveis: true,
                    },
                }),
                prisma.reproWorkflowRecord.findMany({
                    where: { farmId },
                    orderBy: { createdAt: 'asc' },
                }),
                prisma.lot.findMany({
                    where: { farmId },
                    select: { id: true, name: true },
                }),
                prisma.paddock.findMany({
                    where: { farmId },
                    select: { id: true, name: true },
                }),
            ]);
            const rules = history.filter((r) => r.kind === 'REGRAS').at(-1);
            const performance = temPerformance(req);
            const assessments = history.filter((r) => r.kind === 'AVALIACAO');
            const visible = history.filter((r) => performance || !['REGRAS', 'AVALIACAO', 'MANTER'].includes(r.kind));
            res.json({
                animals: list.map((a) => ({
                    ...a,
                    impedimento: a.sexo === 'FEMEA' ? podeEntrarNoProtocolo(a.reproEvents, {}).motivo || null : null,
                    farol:
                        performance && a.sexo === 'FEMEA'
                            ? matrixTraffic(
                                  a,
                                  a.reproEvents,
                                  seasons,
                                  assessments
                                      .filter((r) => r.animalId === a.id)
                                      .map((r) => ({
                                          ...r,
                                          data: r.data.body,
                                      })),
                                  rules?.data.body,
                              )
                            : null,
                })),
                seasons,
                protocols,
                rounds: rounds.filter((s) => s.resumo?.workflowVersion === 1),
                legacyRounds: rounds.filter((s) => s.resumo?.workflowVersion !== 1).length,
                legacyRoundIds: rounds.filter((s) => s.resumo?.workflowVersion !== 1).map((s) => s.id),
                products,
                semen: semen.map((s) => ({
                    ...s,
                    bullName: s.bullName || s.bullAnimal?.brinco || null,
                })),
                records: visible,
                rules: performance ? rules?.data.body || null : null,
                rulesVersion: rules?.id || null,
                performance,
                lots,
                paddocks,
            });
        } catch (e) {
            error(res, e);
        }
    });

    app.get(`${base}/animais/:animalId/historico`, async (req, res) => {
        try {
            const farmId = req.reproFarm.id;
            const animalId = String(req.params.animalId);
            check(
                await prisma.animal.findFirst({
                    where: { id: animalId, farmId },
                    select: { id: true },
                }),
                'Animal não encontrado.',
                404,
            );
            const history = await prisma.reproWorkflowRecord.findMany({
                where: {
                    farmId,
                    kind: { in: ['ETAPA', 'RETIRAR'] },
                    data: {
                        path: ['body', 'animalIds'],
                        array_contains: [animalId],
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            const reversals = history.length
                ? await prisma.reproWorkflowRecord.findMany({
                      where: {
                          farmId,
                          kind: 'REVERTER',
                          OR: history.map((r) => ({
                              data: {
                                  path: ['body', 'recordId'],
                                  equals: r.id,
                              },
                          })),
                      },
                      orderBy: { createdAt: 'desc' },
                  })
                : [];
            res.json({
                records: history.map((r) => ({
                    ...r,
                    reversao: reversals.find((x) => x.data.body.recordId === r.id) || null,
                })),
            });
        } catch (e) {
            error(res, e);
        }
    });

    // Todas as mutações integradas usam uma chave estável, transação e auditoria.
    app.post(`${base}/:action`, async (req, res) => {
        const farmId = req.reproFarm.id;
        const body = req.body || {};
        const kind = String(req.params.action);
        try {
            const allowed = [
                'PROTOCOLO',
                'ESTACAO',
                'ENCERRAR',
                'RODADA',
                'ETAPA',
                'RETIRAR',
                'INSEMINAR',
                'MONTA',
                'DIAGNOSTICO',
                'PARTO',
                'DESMAMA',
                'AVALIACAO',
                'REGRAS',
                'MANTER',
                'DESCARTE',
                'REVERTER',
            ];
            check(allowed.includes(kind), 'Ação desconhecida.', 404);
            check(
                !['AVALIACAO', 'REGRAS', 'MANTER'].includes(kind) || temPerformance(req),
                'Disponível no EIXO Performance.',
                403,
            );
            const clientId = text(body.clientId, 'a identificação do lançamento', 64);
            if (body.ocorrencia) text(body.ocorrencia, 'a ocorrência', 500);
            const result = await prisma.$transaction(
                async (tx) => {
                    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${farmId}))::text AS lock`;
                    const previous = await tx.reproWorkflowRecord.findUnique({
                        where: { farmId_clientId: { farmId, clientId } },
                    });
                    if (previous) {
                        check(
                            previous.kind === kind &&
                                isDeepStrictEqual(previous.data.body, JSON.parse(JSON.stringify(body))),
                            'Esta identificação já pertence a outro lançamento.',
                            409,
                        );
                        return {
                            ...previous.data.result,
                            recordId: previous.id,
                            repetido: true,
                        };
                    }
                    let result = {};
                    const recordData = {
                        farmId,
                        kind,
                        clientId,
                        createdById: req.user.id,
                        animalId: body.animalId || null,
                        sessionId: body.sessionId || null,
                    };
                    if (recordData.animalId) await animals(tx, farmId, [recordData.animalId], null);
                    if (recordData.sessionId) await round(tx, farmId, recordData.sessionId);

                    if (kind === 'PROTOCOLO') {
                        const protocol = normalizeProtocol(body);
                        for (const p of protocol.passos.flatMap((p) => p.procedimentos).filter((p) => p.produtoId)) {
                            const product = await tx.pharmacyProduct.findFirst({
                                where: {
                                    id: p.produtoId,
                                    farmId,
                                    active: true,
                                },
                            });
                            check(product, 'Produto não encontrado na Farmácia.');
                            consumption(product, p.dose, p.unidade, 1);
                        }
                        if (body.id) {
                            check(
                                await tx.reproProtocol.findFirst({
                                    where: { id: body.id, farmId },
                                }),
                                'Protocolo não encontrado.',
                            );
                            result = await tx.reproProtocol.update({
                                where: { id: body.id },
                                data: protocol,
                            });
                        } else
                            result = await tx.reproProtocol.create({
                                data: { farmId, ...protocol },
                            });
                    }
                    if (kind === 'ESTACAO') {
                        const startAt = date(body.inicio, true),
                            endAt = date(body.fim, true);
                        endAt.setUTCHours(23, 59, 59, 999);
                        check(endAt >= startAt, 'Fim anterior ao início.');
                        check(['MONTA_NATURAL', 'IATF', 'MISTA'].includes(body.tipo), 'Modalidade inválida.');
                        const list = await animals(tx, farmId, body.animalIds);
                        check(
                            list.every((a) => !a.reproEvents.some((e) => e.type === 'DESCARTE')),
                            'Há matriz descartada na seleção.',
                        );
                        result = await tx.breedingSeason.create({
                            data: {
                                farmId,
                                name: text(body.nome, 'o nome', 120),
                                startAt,
                                endAt,
                                tipo: body.tipo,
                                lotIds: [...new Set(list.map((a) => a.lotId).filter(Boolean))],
                                exposures: {
                                    create: list.map((a) => ({
                                        animalId: a.id,
                                    })),
                                },
                            },
                        });
                    }
                    if (kind === 'ENCERRAR') {
                        const s = await tx.breedingSeason.findFirst({
                            where: { id: body.seasonId, farmId },
                        });
                        check(s, 'Estação não encontrada.');
                        check(!s.notes?.startsWith('[ENCERRADA]'), 'Estação já fechada.');
                        check(s.endAt < new Date(), 'A estação ainda está no período de exposição.');
                        result = await tx.breedingSeason.update({
                            where: { id: s.id },
                            data: { notes: `[ENCERRADA] ${s.notes || ''}` },
                        });
                    }
                    if (kind === 'RODADA') {
                        const list = await animals(tx, farmId, body.animalIds);
                        const when = date(body.dia0, true);
                        const protocol = await tx.reproProtocol.findFirst({
                            where: { id: body.protocolId, farmId, ativo: true },
                        });
                        check(
                            protocol && protocol.passos.every((p) => Array.isArray(p.procedimentos)),
                            'Escolha um protocolo integrado. Protocolos antigos permanecem no histórico.',
                        );
                        const s = await season(
                            tx,
                            farmId,
                            body.seasonId,
                            when,
                            list.map((a) => a.id),
                            true,
                        );
                        const open = await tx.iatfSession.findMany({
                            where: { farmId, status: 'ABERTO' },
                        });
                        for (const a of list) {
                            const eligibility = podeEntrarNoProtocolo(
                                a.reproEvents,
                                (await tx.reproSettings.findUnique({
                                    where: { farmId },
                                })) || {},
                                when,
                            );
                            check(eligibility.ok, `${a.brinco}: ${eligibility.motivo}`);
                            check(
                                !open.some((r) => r.vacas?.some((v) => v.animalId === a.id && !v.retirada)),
                                `${a.brinco} já está em protocolo aberto.`,
                            );
                        }
                        result = await tx.iatfSession.create({
                            data: {
                                farmId,
                                clientId,
                                dia0: when,
                                protocolId: protocol.id,
                                seasonId: s?.id || null,
                                responsavel: text(body.responsavel, 'o responsável', 120),
                                vacas: list.map((a) => ({
                                    animalId: a.id,
                                    brinco: a.brinco,
                                })),
                                resumo: {
                                    workflowVersion: 1,
                                    protocolSnapshot: {
                                        nome: protocol.nome,
                                        passos: protocol.passos,
                                    },
                                },
                                createdById: req.user.id,
                            },
                        });
                    }
                    if (['ETAPA', 'RETIRAR', 'INSEMINAR'].includes(kind)) {
                        const s = await round(tx, farmId, body.sessionId);
                        const selection = ids(body.animalIds);
                        check(
                            selection.every((id) => s.vacas.some((v) => v.animalId === id && !v.retirada)),
                            'Há animal fora da rodada ou retirado.',
                        );
                        const list = await animals(tx, farmId, selection);
                        const history = await records(tx, farmId, s.id);
                        const valid = history.filter(
                            (r) => !history.some((x) => x.kind === 'REVERTER' && x.data.body.recordId === r.id),
                        );
                        const inseminated = valid
                            .filter((r) => r.kind === 'INSEMINAR')
                            .flatMap((r) => r.data.body.animalIds);
                        check(!selection.some((id) => inseminated.includes(id)), 'Há fêmea já inseminada.');
                        check(s.status === 'ABERTO', 'Rodada encerrada.');
                        if (kind === 'RETIRAR') {
                            const motivo = text(body.motivo, 'o motivo');
                            result = await tx.iatfSession.update({
                                where: { id: s.id },
                                data: {
                                    status: s.vacas.every(
                                        (v) =>
                                            v.retirada ||
                                            selection.includes(v.animalId) ||
                                            inseminated.includes(v.animalId),
                                    )
                                        ? 'ENCERRADO'
                                        : 'ABERTO',
                                    vacas: s.vacas.map((v) =>
                                        selection.includes(v.animalId)
                                            ? {
                                                  ...v,
                                                  retirada: {
                                                      motivo,
                                                      date: new Date().toISOString(),
                                                      responsavel: req.user.id,
                                                  },
                                              }
                                            : v,
                                    ),
                                },
                            });
                        } else {
                            const when = date(body.date);
                            check(
                                !valid.some(
                                    (r) =>
                                        r.kind === 'ETAPA' &&
                                        r.data.body.animalIds.some((id) => selection.includes(id)) &&
                                        date(r.data.body.date) > when,
                                ),
                                'O manejo não pode anteceder etapas já executadas.',
                            );
                            check(when >= s.dia0, 'O manejo não pode anteceder o D0.');
                            text(body.responsavel, 'o responsável', 120);
                            for (const a of list)
                                check(
                                    !a.reproEvents.some((e) => e.type === 'DESCARTE') &&
                                        calcularSituacao(a.reproEvents).situacao !== 'PRENHE',
                                    `${a.brinco}: matriz prenhe ou descartada.`,
                                );
                            if (kind === 'ETAPA') {
                                const steps = s.resumo.protocolSnapshot.passos;
                                const step = steps.find((p) => p.id === body.stepId);
                                check(step, 'Etapa inválida.');
                                check(
                                    !valid.some(
                                        (r) =>
                                            r.kind === 'ETAPA' &&
                                            r.data.body.stepId === step.id &&
                                            r.data.body.animalIds.some((id) => selection.includes(id)),
                                    ),
                                    'Esta etapa já foi registrada para uma das fêmeas.',
                                );
                                for (const before of steps.filter((p) => p.dia < step.dia))
                                    check(
                                        selection.every((id) =>
                                            valid.some(
                                                (r) =>
                                                    r.kind === 'ETAPA' &&
                                                    r.data.body.stepId === before.id &&
                                                    r.data.body.animalIds.includes(id),
                                            ),
                                        ),
                                        'Há etapa anterior pendente.',
                                    );
                                const movements = [],
                                    performed = [];
                                const procedures = body.procedimentos || step.procedimentos;
                                check(
                                    Array.isArray(procedures) &&
                                        procedures.length === step.procedimentos.length &&
                                        new Set(procedures.map((p) => p.id)).size === procedures.length &&
                                        procedures.every((p) =>
                                            step.procedimentos.some((original) => original.id === p.id),
                                        ),
                                    'Confira os procedimentos realizados nesta etapa.',
                                );
                                for (const p of procedures) {
                                    text(p.titulo, 'o procedimento', 160);
                                    if (!p.produtoId) {
                                        performed.push(p);
                                        continue;
                                    }
                                    const product = await tx.pharmacyProduct.findFirst({
                                        where: {
                                            farmId,
                                            id: p.produtoId,
                                            active: true,
                                        },
                                    });
                                    check(product, 'Produto indisponível na Farmácia.');
                                    let remaining = consumption(product, p.dose, p.unidade, list.length);
                                    const batches = await tx.pharmacyBatch.findMany({
                                        where: {
                                            farmId,
                                            productId: product.id,
                                            quantity: { gt: 0 },
                                            OR: [
                                                { expiresAt: null },
                                                {
                                                    expiresAt: {
                                                        gt: new Date(),
                                                    },
                                                },
                                            ],
                                        },
                                        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
                                    });
                                    check(
                                        batches.reduce((n, b) => n + b.quantity, 0) + 1e-9 >= remaining,
                                        `Farmácia: estoque válido insuficiente de ${product.name}. Regularize antes de confirmar.`,
                                    );
                                    for (const b of batches) {
                                        if (remaining <= 1e-9) break;
                                        const use = Math.min(b.quantity, remaining);
                                        const updated = await tx.pharmacyBatch.updateMany({
                                            where: {
                                                id: b.id,
                                                farmId,
                                                quantity: { gte: use },
                                            },
                                            data: {
                                                quantity: {
                                                    decrement: use,
                                                },
                                            },
                                        });
                                        check(updated.count === 1, 'Estoque alterado por outro manejo. Atualize.', 409);
                                        const movement = await tx.pharmacyMovement.create({
                                            data: {
                                                farmId,
                                                productId: product.id,
                                                batchId: b.id,
                                                type: 'EXIT',
                                                quantity: use,
                                                unitCost: b.unitCost,
                                                notes: `Reprodução ${s.id} ${step.titulo}; ${clientId}`,
                                            },
                                        });
                                        movements.push({
                                            id: movement.id,
                                            batchId: b.id,
                                            productId: product.id,
                                            quantity: use,
                                            unitCost: b.unitCost,
                                        });
                                        remaining -= use;
                                    }
                                    performed.push({
                                        ...p,
                                        produto: product.name,
                                    });
                                }
                                result = {
                                    movements,
                                    procedimentos: performed,
                                    total: list.length,
                                };
                            } else {
                                for (const p of s.resumo.protocolSnapshot.passos)
                                    check(
                                        selection.every((id) =>
                                            valid.some(
                                                (r) =>
                                                    r.kind === 'ETAPA' &&
                                                    r.data.body.stepId === p.id &&
                                                    r.data.body.animalIds.includes(id),
                                            ),
                                        ),
                                        'Conclua as etapas das fêmeas antes da inseminação.',
                                    );
                                check(
                                    Array.isArray(body.semen) &&
                                        body.semen.length === selection.length &&
                                        new Set(body.semen.map((x) => x.animalId)).size === selection.length,
                                    'Informe uma partida de sêmen para cada fêmea.',
                                );
                                await season(tx, farmId, s.seasonId, when, selection, true);
                                const moves = [],
                                    events = [];
                                for (const a of list) {
                                    const line = body.semen.find((x) => x.animalId === a.id);
                                    check(line, 'Partida não informada.');
                                    const batch = await tx.semenBatch.findFirst({
                                        where: { id: line.batchId, farmId },
                                    });
                                    check(
                                        batch && batch.dosesDisponiveis >= 1,
                                        'Sêmen indisponível. Regularize o Botijão.',
                                    );
                                    const registeredBull = batch.bullAnimalId
                                        ? await tx.animal.findFirst({
                                              where: {
                                                  id: batch.bullAnimalId,
                                                  farmId,
                                              },
                                          })
                                        : null;
                                    const bullName = batch.bullName || registeredBull?.brinco;
                                    check(bullName, 'Identifique o touro da partida no Botijão antes da inseminação.');
                                    const changed = await tx.semenBatch.updateMany({
                                        where: {
                                            id: batch.id,
                                            farmId,
                                            dosesDisponiveis: { gte: 1 },
                                        },
                                        data: {
                                            dosesDisponiveis: {
                                                decrement: 1,
                                            },
                                        },
                                    });
                                    check(changed.count === 1, 'Sêmen consumido por outro manejo.', 409);
                                    moves.push(
                                        await tx.semenMove.create({
                                            data: {
                                                semenBatchId: batch.id,
                                                date: when,
                                                qty: 1,
                                                type: 'OUT',
                                                notes: `IATF ${s.id}, ${a.brinco}; ${clientId}`,
                                            },
                                        }),
                                    );
                                    events.push(
                                        await event(
                                            tx,
                                            req,
                                            a,
                                            'COBERTURA',
                                            when,
                                            {
                                                tipo: 'IATF',
                                                touro: bullName,
                                                partidaId: batch.id,
                                                semenBatchId: batch.id,
                                                partida: batch.lote || null,
                                                iatfSessionId: s.id,
                                                custoDose: batch.custoDose ?? null,
                                                doses: 1,
                                                inseminador: body.responsavel,
                                                tentativaId: s.id,
                                                clientId,
                                            },
                                            s.seasonId,
                                        ),
                                    );
                                }
                                const allDone = s.vacas.every(
                                    (v) =>
                                        v.retirada ||
                                        selection.includes(v.animalId) ||
                                        inseminated.includes(v.animalId),
                                );
                                await tx.iatfSession.update({
                                    where: { id: s.id },
                                    data: {
                                        status: allDone ? 'INSEMINADO' : 'ABERTO',
                                    },
                                });
                                result = {
                                    moves,
                                    eventIds: events.map((e) => e.id),
                                    total: list.length,
                                };
                            }
                        }
                    }
                    if (kind === 'MONTA') {
                        const list = await animals(tx, farmId, body.animalIds);
                        const bulls = await animals(tx, farmId, body.bullIds, 'MACHO');
                        const when = date(body.inicio),
                            end = body.fim ? date(body.fim, true) : null;
                        check(!end || end >= when, 'Saída anterior à entrada.');
                        const s = await season(
                            tx,
                            farmId,
                            body.seasonId,
                            when,
                            list.map((a) => a.id),
                            true,
                        );
                        const eventIds = [];
                        for (const a of list) {
                            check(
                                podeEntrarNoProtocolo(a.reproEvents, {}, when).ok,
                                `${a.brinco}: matriz indisponível para cobertura.`,
                            );
                            eventIds.push(
                                (
                                    await event(
                                        tx,
                                        req,
                                        a,
                                        'COBERTURA',
                                        when,
                                        {
                                            tipo: 'MONTA_NATURAL',
                                            touros: bulls.map((b) => ({
                                                id: b.id,
                                                brinco: b.brinco,
                                            })),
                                            touro: bulls.length === 1 ? bulls[0].brinco : null,
                                            inicio: when.toISOString(),
                                            fim: end?.toISOString() || null,
                                            repasse: Boolean(body.repasse),
                                            tentativaId: clientId,
                                            clientId,
                                        },
                                        s?.id,
                                    )
                                ).id,
                            );
                        }
                        result = { eventIds, total: list.length };
                    }
                    if (kind === 'DIAGNOSTICO') {
                        const list = await animals(tx, farmId, body.animalIds);
                        const when = date(body.date);
                        check(['PRENHE', 'VAZIA'].includes(body.resultado), 'Resultado inválido.');
                        check(['TOQUE', 'ULTRASSOM'].includes(body.metodo), 'Método inválido.');
                        text(body.responsavel, 'o responsável', 120);
                        check(
                            body.resultado !== 'PRENHE' ||
                                (Number.isInteger(body.diasGestacao) &&
                                    body.diasGestacao > 0 &&
                                    body.diasGestacao <= 300),
                            'Informe os dias de gestação.',
                        );
                        const eventIds = [];
                        for (const a of list) {
                            check(
                                !a.reproEvents.some((e) => e.type === 'DESCARTE'),
                                `${a.brinco}: descarte registrado.`,
                            );
                            const attempt = a.reproEvents
                                .filter(
                                    (e) =>
                                        e.type === 'COBERTURA' && (e.payload?.tentativaId || e.id) === body.tentativaId,
                                )
                                .at(-1);
                            check(
                                attempt && new Date(attempt.date) <= when,
                                `${a.brinco}: selecione uma tentativa anterior ao diagnóstico.`,
                            );
                            const s = await season(tx, farmId, attempt.seasonId, when, [a.id]);
                            check(
                                !body.finalEstacao || (s && when > s.endAt),
                                'Diagnóstico final deve ocorrer após o período de exposição da estação.',
                            );
                            check(
                                !body.confirmacao ||
                                    a.reproEvents.some(
                                        (e) =>
                                            e.type === 'DIAGNOSTICO_PRENHEZ' &&
                                            e.payload?.tentativaId === body.tentativaId &&
                                            new Date(e.date) <= when,
                                    ),
                                'A confirmação exige um diagnóstico anterior desta tentativa.',
                            );
                            const previous = a.reproEvents
                                .filter((e) => e.type === 'DIAGNOSTICO_PRENHEZ' && new Date(e.date) <= when)
                                .at(-1);
                            const e = await event(
                                tx,
                                req,
                                a,
                                'DIAGNOSTICO_PRENHEZ',
                                when,
                                {
                                    resultado: body.resultado,
                                    diasGestacao: body.resultado === 'PRENHE' ? body.diasGestacao : null,
                                    metodo: body.metodo,
                                    veterinario: body.responsavel,
                                    tentativaId: body.tentativaId,
                                    confirmacao: Boolean(body.confirmacao),
                                    finalEstacao: Boolean(body.finalEstacao),
                                    clientId,
                                },
                                attempt.seasonId,
                            );
                            eventIds.push(e.id);
                            if (body.resultado === 'VAZIA' && previous?.payload?.resultado === 'PRENHE')
                                await event(
                                    tx,
                                    req,
                                    a,
                                    'PERDA',
                                    when,
                                    {
                                        automatica: true,
                                        origemDiagnosticoId: e.id,
                                        clientId,
                                    },
                                    attempt.seasonId,
                                );
                        }
                        result = { eventIds, total: list.length };
                    }
                    if (kind === 'PARTO') {
                        const [mother] = await animals(tx, farmId, [body.animalId]);
                        const when = date(body.date);
                        check(!mother.reproEvents.some((e) => e.type === 'DESCARTE'), 'Matriz em descarte.');
                        const validation = validarParto(
                            {
                                data: body.date,
                                tipoParto: body.tipoParto,
                                crias: body.crias,
                            },
                            { eventos: mother.reproEvents, sexo: mother.sexo },
                        );
                        check(!validation.erros.length, validation.erros[0]);
                        const alive = body.crias.filter((c) => c.vivo);
                        const calves = alive.length
                            ? await animals(
                                  tx,
                                  farmId,
                                  alive.map((c) => c.animalId),
                                  null,
                              )
                            : [];
                        const births = await tx.reproEvent.findMany({
                            where: { farmId, type: 'PARTO' },
                        });
                        const crias = [];
                        for (const c of body.crias) {
                            check(typeof c.vivo === 'boolean', 'Informe se a cria nasceu viva.');
                            check(['FEMEA', 'MACHO'].includes(c.sexo), 'Sexo da cria inválido.');
                            check(c.peso == null || (Number.isFinite(c.peso) && c.peso > 0), 'Peso da cria inválido.');
                            if (!c.vivo) {
                                crias.push({
                                    sexo: c.sexo,
                                    vivo: false,
                                    peso: c.peso ?? null,
                                });
                                continue;
                            }
                            const calf = calves.find((a) => a.id === c.animalId);
                            check(
                                calf &&
                                    calf.id !== mother.id &&
                                    calf.sexo === c.sexo &&
                                    calf.dataNascimento?.toISOString().slice(0, 10) === when.toISOString().slice(0, 10),
                                'Confira sexo e data de nascimento da cria em Animais.',
                            );
                            check(!calf.maeId || calf.maeId === mother.id, 'Cria vinculada a outra mãe.');
                            check(
                                !births.some((e) => e.payload?.crias?.some((x) => x.calfAnimalId === calf.id)),
                                'Cria já vinculada a um parto.',
                            );
                            const birth = await tx.herdEvent.findFirst({
                                where: {
                                    farmId,
                                    animalId: calf.id,
                                    type: 'NASCIMENTO',
                                },
                            });
                            if (!birth)
                                await tx.herdEvent.create({
                                    data: {
                                        farmId,
                                        animalId: calf.id,
                                        type: 'NASCIMENTO',
                                        date: when,
                                        peso: c.peso ?? null,
                                        observacoes: `Parto vinculado à matriz ${mother.brinco}; ${clientId}`,
                                    },
                                });
                            else if (birth.peso == null && c.peso != null)
                                await tx.herdEvent.update({
                                    where: { id: birth.id },
                                    data: { peso: c.peso },
                                });
                            await tx.animal.update({
                                where: { id: calf.id },
                                data: {
                                    maeId: mother.id,
                                    matrizResponsavelId: mother.id,
                                },
                            });
                            crias.push({
                                sexo: c.sexo,
                                vivo: true,
                                peso: c.peso ?? null,
                                calfAnimalId: calf.id,
                                brinco: calf.brinco,
                            });
                        }
                        const e = await event(tx, req, mother, 'PARTO', when, {
                            tipoParto: body.tipoParto,
                            crias,
                            clientId,
                        });
                        result = { eventIds: [e.id], total: crias.length };
                    }
                    if (kind === 'DESMAMA') {
                        const [calf] = await animals(tx, farmId, [body.animalId], null);
                        const when = date(body.date);
                        check(!calf.desmamadoEm, 'Desmama já registrada.');
                        check(
                            calf.dataNascimento && when > calf.dataNascimento,
                            'Confira a data de nascimento da cria.',
                        );
                        check(
                            Number.isFinite(body.peso) && body.peso > 0 && body.peso < 2000,
                            'Informe um peso de desmama válido.',
                        );
                        const group = text(body.grupoComparacao, 'o grupo de comparação (manejo e safra)', 120);
                        const dayStart = new Date(when);
                        dayStart.setUTCHours(0, 0, 0, 0);
                        const dayEnd = new Date(dayStart.getTime() + 86400000);
                        const existing = await tx.weighing.findFirst({
                            where: {
                                animalId: calf.id,
                                data: { gte: dayStart, lt: dayEnd },
                            },
                        });
                        check(
                            !existing || existing.peso === body.peso,
                            'Há pesagem com outro peso nesta data. Confira antes de registrar a desmama.',
                        );
                        const prior = await tx.weighing.findFirst({
                            where: {
                                animalId: calf.id,
                                data: { lt: dayStart },
                            },
                            orderBy: { data: 'desc' },
                        });
                        const later = await tx.weighing.findFirst({
                            where: { animalId: calf.id, data: { gte: dayEnd } },
                        });
                        const elapsed = prior ? (when - prior.data) / 86400000 : 0;
                        const gmd = prior && elapsed > 0 ? (body.peso - prior.peso) / elapsed : 0;
                        if (!existing)
                            await tx.weighing.create({
                                data: {
                                    animalId: calf.id,
                                    data: when,
                                    peso: body.peso,
                                    gmd,
                                },
                            });
                        await tx.herdEvent.create({
                            data: {
                                farmId,
                                animalId: calf.id,
                                type: 'DESMAMA',
                                date: when,
                                peso: body.peso,
                                observacoes: `Reprodução integrada; ${clientId}`,
                            },
                        });
                        await tx.animal.update({
                            where: { id: calf.id },
                            data: {
                                desmamadoEm: when,
                                pesoDesmamaKg: body.peso,
                                ...(!later ? { pesoAtual: body.peso, gmd } : {}),
                            },
                        });
                        const motherId = calf.matrizResponsavelId || calf.maeId;
                        const config = await tx.reproSettings.findUnique({
                            where: { farmId },
                        });
                        const birth = await tx.herdEvent.findFirst({
                            where: {
                                farmId,
                                animalId: calf.id,
                                type: 'NASCIMENTO',
                            },
                            orderBy: { date: 'asc' },
                        });
                        const birthWeight = birth?.peso || config?.pesoNascerKg || null;
                        const idadeDias = Math.floor((when - calf.dataNascimento) / 86400000);
                        const adjusted = pesoAjustado205({
                            peso: body.peso,
                            idadeDias,
                            pesoNascer: birthWeight,
                        });
                        if (motherId) {
                            const mother = await tx.animal.findFirst({
                                where: { id: motherId, farmId },
                            });
                            check(mother, 'Mãe fora desta fazenda: revise o vínculo antes da desmama.');
                            await event(tx, req, mother, 'DESMAME', when, {
                                bezerroId: calf.id,
                                bezerro: calf.brinco,
                                peso: body.peso,
                                idadeDias,
                                pesoNascerUsado: birthWeight,
                                pesoAjustado205: adjusted,
                                grupoComparacao: group,
                                precoce: idadeDias < DESMAMA_PRECOCE_DIAS,
                                clientId,
                            });
                        }
                        result = {
                            pesoAjustado205: adjusted,
                            total: 1,
                            semMae: !motherId,
                        };
                    }
                    if (kind === 'REGRAS') result = validateRules(body);
                    if (kind === 'AVALIACAO') {
                        await animals(tx, farmId, [body.animalId]);
                        check(['funcional', 'racial'].includes(body.dimensao), 'Dimensão inválida.');
                        check(['DENTRO', 'ATENCAO', 'REVISAR'].includes(body.resultado), 'Avaliação inválida.');
                        date(body.date);
                        text(body.motivo, 'o motivo');
                        text(body.responsavel, 'o avaliador', 120);
                        check(body.animalId, 'Selecione a matriz.');
                        const versions = await tx.reproWorkflowRecord.findMany({
                            where: { farmId, kind: 'REGRAS' },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        });
                        result = {
                            ok: true,
                            rulesVersion: versions[0]?.id || null,
                        };
                    }
                    if (['MANTER', 'DESCARTE'].includes(kind)) {
                        const [a] = await animals(tx, farmId, [body.animalId]);
                        check(!a.reproEvents.some((e) => e.type === 'DESCARTE'), 'Descarte já registrado.');
                        const reason = text(body.motivo, 'a justificativa');
                        const e = await event(
                            tx,
                            req,
                            a,
                            kind === 'DESCARTE' ? 'DESCARTE' : 'OBSERVACAO',
                            date(body.date),
                            kind === 'DESCARTE'
                                ? { motivo: reason, clientId }
                                : { manter: true, motivo: reason, clientId },
                        );
                        result = { eventIds: [e.id] };
                    }
                    if (kind === 'REVERTER') {
                        const original = await tx.reproWorkflowRecord.findFirst({
                            where: {
                                id: body.recordId,
                                farmId,
                                kind: 'ETAPA',
                            },
                        });
                        check(original, 'Somente aplicações integradas podem ser revertidas por esta ação.');
                        const history = await records(tx, farmId, original.sessionId);
                        check(
                            !history.some((r) => r.kind === 'REVERTER' && r.data.body.recordId === original.id),
                            'Aplicação já revertida.',
                        );
                        const step = (await round(tx, farmId, original.sessionId)).resumo.protocolSnapshot.passos.find(
                            (p) => p.id === original.data.body.stepId,
                        );
                        check(
                            !history.some(
                                (r) =>
                                    (r.kind === 'INSEMINAR' ||
                                        (r.kind === 'ETAPA' && new Date(r.createdAt) > new Date(original.createdAt))) &&
                                    r.data.body.animalIds?.some((id) => original.data.body.animalIds.includes(id)) &&
                                    !history.some((x) => x.kind === 'REVERTER' && x.data.body.recordId === r.id),
                            ),
                            'Há manejos posteriores. Revise a sequência antes de corrigir.',
                        );
                        text(body.motivo, 'o motivo da reversão');
                        for (const m of original.data.result.movements) {
                            await tx.pharmacyBatch.update({
                                where: { id: m.batchId },
                                data: { quantity: { increment: m.quantity } },
                            });
                            await tx.pharmacyMovement.create({
                                data: {
                                    farmId,
                                    productId: m.productId,
                                    batchId: m.batchId,
                                    type: 'ENTRY',
                                    quantity: m.quantity,
                                    unitCost: m.unitCost,
                                    notes: `Reversão ${original.id}: ${body.motivo}`,
                                },
                            });
                        }
                        recordData.sessionId = original.sessionId;
                        result = {
                            total: original.data.body.animalIds.length,
                            etapa: step.titulo,
                        };
                    }
                    const record = await tx.reproWorkflowRecord.create({
                        data: {
                            ...recordData,
                            data: JSON.parse(JSON.stringify({ body, result })),
                        },
                    });
                    return {
                        ...JSON.parse(JSON.stringify(result)),
                        recordId: record.id,
                    };
                },
                { isolationLevel: 'Serializable', timeout: 60000 },
            );
            res.json(result);
        } catch (e) {
            error(res, e);
        }
    });
}
