import { numerosDaVaca, calcularSituacao } from './reproRules.js';

export class WorkflowError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
export function check(condition, message, status = 400) {
    if (!condition) throw new WorkflowError(message, status);
}
export function ids(value) {
    check(Array.isArray(value) && value.length > 0 && value.length <= 2000, 'Selecione entre 1 e 2000 animais.');
    check(
        value.every((v) => typeof v === 'string' && v.length > 0 && v.length <= 100),
        'Identificação de animal inválida.',
    );
    check(new Set(value).size === value.length, 'Há animais repetidos na seleção.');
    return value;
}
export function date(value, future = false) {
    check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value), 'Informe a data.');
    const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
    check(
        Number.isFinite(d.getTime()) &&
            (value.length !== 10 || d.toISOString().slice(0, 10) === value) &&
            (future || d <= new Date()),
        'Data inválida ou futura.',
    );
    return d;
}
export function text(value, label, max = 500) {
    check(
        typeof value === 'string' && value.trim().length > 0 && value.length <= max,
        `Informe ${label} (até ${max} caracteres).`,
    );
    return value.trim();
}
export function normalizeProtocol(body) {
    const nome = text(body.nome, 'o nome', 120);
    check(
        Array.isArray(body.passos) && body.passos.length > 0 && body.passos.length <= 30,
        'Informe as etapas do protocolo.',
    );
    const passos = body.passos
        .map((p, i) => {
            check(Number.isInteger(p.dia) && p.dia >= 0 && p.dia <= 120, 'Intervalo da etapa inválido.');
            check(
                Array.isArray(p.procedimentos) && p.procedimentos.length > 0 && p.procedimentos.length <= 20,
                'Informe os procedimentos da etapa.',
            );
            return {
                id: `etapa-${i}`,
                dia: p.dia,
                titulo: text(p.titulo, 'o título da etapa', 160),
                procedimentos: p.procedimentos.map((x, j) => {
                    const procedimento = {
                        id: `procedimento-${j}`,
                        titulo: text(x.titulo, 'o procedimento', 160),
                        produtoId: x.produtoId || null,
                        dose: null,
                        unidade: null,
                    };
                    if (x.produtoId) {
                        check(Number.isFinite(x.dose) && x.dose > 0, 'Dose inválida.');
                        procedimento.dose = x.dose;
                        procedimento.unidade = text(x.unidade, 'a unidade da dose', 30);
                    }
                    return procedimento;
                }),
            };
        })
        .sort((a, b) => a.dia - b.dia);
    check(passos[0].dia === 0, 'O protocolo deve começar no D0.');
    return { nome, passos };
}
export function consumption(product, dose, unit, count) {
    check(Number.isFinite(dose) && dose > 0, 'Dose inválida.');
    const app = product.applicationUnit || product.unit;
    check(unit === product.unit || unit === app, `Unidade incompatível com ${product.name}.`);
    if (unit === product.unit) return dose * count;
    check(
        Number.isFinite(product.applicationPerUnit) && product.applicationPerUnit > 0,
        `Defina a conversão de unidade de ${product.name} na Farmácia.`,
    );
    return (dose * count) / product.applicationPerUnit;
}
export function initialRules(modelo) {
    check(['COMERCIAL', 'PO'].includes(modelo), 'Modelo inválido.');
    return {
        modelo,
        ativo: false,
        usarEstacoes: true,
        estacoesVazias: 2,
        perdas: 2,
        iepMeses: null,
        desmamaKg: null,
        funcional: true,
        racial: modelo === 'PO',
    };
}
export function validateRules(input) {
    const r = initialRules(input.modelo);
    check(typeof input.ativo === 'boolean', 'Confirme a ativação das regras.');
    for (const k of ['estacoesVazias', 'perdas']) {
        check(Number.isInteger(input[k]) && input[k] >= 1 && input[k] <= 20, 'Limite de ocorrências inválido.');
        r[k] = input[k];
    }
    for (const k of ['iepMeses', 'desmamaKg']) {
        check(input[k] == null || (Number.isFinite(input[k]) && input[k] > 0 && input[k] <= 2000), 'Limite inválido.');
        r[k] = input[k] ?? null;
    }
    check(
        typeof input.funcional === 'boolean' && typeof input.racial === 'boolean',
        'Critérios de avaliação inválidos.',
    );
    check(input.usarEstacoes == null || typeof input.usarEstacoes === 'boolean', 'Critério de estação inválido.');
    return {
        ...r,
        usarEstacoes: input.usarEstacoes !== false,
        ativo: input.ativo,
        funcional: input.funcional,
        racial: input.racial,
    };
}

// Apenas estações com exposição comprovada e diagnóstico final entram na contagem.
export function matrixTraffic(animal, events, seasons, assessments, rules, now = new Date()) {
    const ordered = [...events].sort(
        (a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt),
    );
    if (ordered.some((e) => e.type === 'DESCARTE'))
        return {
            cor: 'DESCARTE',
            label: 'Descarte registrado',
            motivos: ['Decisão registrada no histórico'],
            dimensoes: [],
        };
    if (!rules?.ativo)
        return {
            cor: 'CINZA',
            label: 'Dados insuficientes',
            motivos: ['Revise e ative o modelo de critérios'],
            dimensoes: [],
        };
    const red = [],
        yellow = [],
        missing = [];
    const closed = seasons
        .filter(
            (s) =>
                new Date(s.endAt) < now &&
                s.exposures?.some((e) => e.animalId === animal.id) &&
                ordered.some((e) => e.seasonId === s.id && e.type === 'COBERTURA'),
        )
        .sort((a, b) => new Date(b.endAt) - new Date(a.endAt));
    let failures = 0;
    for (const s of rules.usarEstacoes === false ? [] : closed) {
        const final = ordered
            .filter((e) => e.seasonId === s.id && e.type === 'DIAGNOSTICO_PRENHEZ' && e.payload?.finalEstacao)
            .pop();
        if (!final) {
            missing.push(`Diagnóstico final pendente: ${s.name}`);
            break;
        }
        if (final.payload.resultado !== 'VAZIA') break;
        failures++;
    }
    if (rules.usarEstacoes !== false && !closed.length) missing.push('Sem estação concluída com exposição registrada');
    if (rules.usarEstacoes === false) {
        const latestAttempt = ordered.filter((e) => e.type === 'COBERTURA').at(-1);
        const diagnosis =
            latestAttempt &&
            ordered
                .filter(
                    (e) =>
                        e.type === 'DIAGNOSTICO_PRENHEZ' &&
                        e.payload?.tentativaId === (latestAttempt.payload?.tentativaId || latestAttempt.id),
                )
                .at(-1);
        if (!diagnosis) missing.push('Última tentativa sem diagnóstico suficiente');
        else if (diagnosis.payload.resultado === 'VAZIA') yellow.push('Vazia no diagnóstico da última tentativa');
    }
    if (rules.usarEstacoes !== false && failures >= rules.estacoesVazias)
        red.push(`Vazia ao final de ${failures} estações consecutivas`);
    else if (rules.usarEstacoes !== false && failures) yellow.push('Vazia ao final da última estação');
    const losses = ordered.filter((e) => e.type === 'PERDA');
    if (losses.length >= rules.perdas)
        red.push(
            `${losses.length} perdas gestacionais no histórico (${new Date(losses[0].date).toISOString().slice(0, 10)} a ${new Date(losses.at(-1).date).toISOString().slice(0, 10)})`,
        );
    else if (losses.length) yellow.push('Perda gestacional no histórico');
    const numbers = numerosDaVaca(ordered, animal);
    if (rules.iepMeses) {
        if (numbers.iepMeses == null) missing.push('Intervalo entre partos sem histórico suficiente');
        else if (numbers.iepMeses > rules.iepMeses) red.push(`Intervalo entre partos: ${numbers.iepMeses} meses`);
    }
    const weanings = ordered.filter((e) => e.type === 'DESMAME' && Number(e.payload?.pesoAjustado205) > 0);
    if (rules.desmamaKg) {
        if (weanings.length < 2) missing.push('Faltam duas desmamas comparáveis');
        else {
            const recent = weanings.slice(-2);
            if (
                recent.every(
                    (e) =>
                        e.payload?.grupoComparacao &&
                        e.payload.grupoComparacao === recent[0].payload.grupoComparacao &&
                        e.payload.pesoAjustado205 < rules.desmamaKg,
                )
            )
                red.push('Duas crias abaixo do limite de desmama no grupo avaliado');
            else if (
                recent.some(
                    (e) =>
                        !e.payload?.grupoComparacao || e.payload.grupoComparacao !== recent[0].payload.grupoComparacao,
                )
            )
                missing.push('Defina o grupo de comparação das desmamas');
        }
    }
    const dims = [];
    for (const dimension of ['funcional', 'racial']) {
        if (!rules[dimension]) continue;
        const list = assessments
            .filter((a) => a.data.dimensao === dimension)
            .sort((a, b) => new Date(a.data.date) - new Date(b.data.date));
        const last = list.at(-1);
        if (!last) missing.push(`Avaliação ${dimension} pendente`);
        else if (last.data.resultado === 'REVISAR') red.push(`Avaliação ${dimension}: ${last.data.motivo}`);
        else if (last.data.resultado === 'ATENCAO') yellow.push(`Avaliação ${dimension}: ${last.data.motivo}`);
        const rank = { DENTRO: 0, ATENCAO: 1, REVISAR: 2 };
        dims.push({
            nome: dimension,
            resultado: last?.data.resultado || 'SEM_DADOS',
            evolucao:
                list.length < 2
                    ? 'Dados insuficientes'
                    : rank[last.data.resultado] > rank[list.at(-2).data.resultado]
                      ? 'Piorou'
                      : rank[last.data.resultado] < rank[list.at(-2).data.resultado]
                        ? 'Melhorou'
                        : 'Estável',
        });
    }
    const outcomes = closed
        .slice(0, 2)
        .map(
            (s) =>
                ordered
                    .filter((e) => e.type === 'DIAGNOSTICO_PRENHEZ' && e.seasonId === s.id && e.payload?.finalEstacao)
                    .at(-1)?.payload.resultado,
        );
    const evolution =
        outcomes.length < 2 || outcomes.some((v) => !v)
            ? 'Dados insuficientes'
            : outcomes[0] === outcomes[1]
              ? 'Estável'
              : outcomes[0] === 'PRENHE'
                ? 'Melhorou'
                : 'Piorou';
    const lastWeanings = weanings.slice(-2);
    const weaningEvolution =
        lastWeanings.length < 2 ||
        !lastWeanings[0].payload?.grupoComparacao ||
        lastWeanings[0].payload.grupoComparacao !== lastWeanings[1].payload.grupoComparacao
            ? 'Dados insuficientes'
            : lastWeanings[0].payload.pesoAjustado205 === lastWeanings[1].payload.pesoAjustado205
              ? 'Estável'
              : lastWeanings[0].payload.pesoAjustado205 < lastWeanings[1].payload.pesoAjustado205
                ? 'Melhorou'
                : 'Piorou';
    const attempts = new Set(ordered.filter((e) => e.type === 'COBERTURA').map((e) => e.payload?.tentativaId || e.id))
        .size;
    dims.unshift(
        {
            nome: 'Reprodução',
            resultado: `${attempts} tentativa(s); ${failures} estação(ões) vazia(s); ${losses.length} perda(s)`,
            evolucao: evolution,
        },
        {
            nome: 'Produção das crias',
            resultado: weanings.length ? `${weanings.length} desmama(s) registrada(s)` : 'Dados insuficientes',
            evolucao: weaningEvolution,
        },
    );
    const cor = red.length ? 'VERMELHO' : yellow.length ? 'AMARELO' : missing.length ? 'CINZA' : 'VERDE';
    return {
        cor,
        label: {
            VERMELHO: 'Revisar permanência',
            AMARELO: 'Atenção',
            CINZA: 'Dados insuficientes',
            VERDE: 'Dentro dos critérios',
        }[cor],
        motivos: [...red, ...yellow, ...missing],
        dimensoes: dims,
        situacao: calcularSituacao(ordered).situacao,
    };
}
