// Regras puras da Reprodução v3 (sem banco), para testar sem servidor.
// Princípio: critério de manejo é do produtor; o sistema só bloqueia o impossível
// ou o que a lei exige (brucelose).

const DAY_MS = 24 * 60 * 60 * 1000;
export const PESAGEM_VALIDADE_DIAS = 60;
export const TIPOS_MANUAIS = ['COBERTURA', 'DIAGNOSTICO_PRENHEZ', 'PERDA', 'ECC', 'OBSERVACAO', 'DESCARTE'];
export const MOTIVOS_DESCARTE = [
    'Vazia', 'Vazia repetida', 'Aborto', 'Intervalo entre partos longo', 'Bezerro leve',
    'Idade/dentição', 'Úbere', 'Casco/aprumo', 'Temperamento', 'Doença', 'Outro',
];

export function idadeEmMeses(dataNascimento, ref = new Date()) {
    if (!dataNascimento) return null;
    const nasc = new Date(dataNascimento);
    if (Number.isNaN(nasc.getTime())) return null;
    return Math.floor((new Date(ref) - nasc) / (DAY_MS * 30.4375));
}

export function diasEntre(a, b) {
    return Math.floor((new Date(b) - new Date(a)) / DAY_MS);
}

export function temBrucelose({ aplicacoesBrucelose = 0, bruceloseInformadaEm = null } = {}) {
    return aplicacoesBrucelose > 0 || Boolean(bruceloseInformadaEm);
}

// Bloqueios que impedem liberar (valem em qualquer plano).
export function bloqueiosLiberacao(animal, { brucelose }) {
    const motivos = [];
    if (animal?.sexo !== 'FEMEA') motivos.push('Não é fêmea');
    if (animal?.status && animal.status !== 'VIVO') motivos.push('Animal vendido ou morto');
    if (animal?.descartada) motivos.push('Fêmea descartada');
    if (!brucelose) motivos.push('Sem registro de brucelose');
    return motivos;
}

// Farol da candidata contra os critérios do produtor (EIXO Performance).
export function avaliarCandidata(animal, config, ref = new Date()) {
    const temCriterio = config && [config.idadeMinMeses, config.pesoMinKg, config.eccMin].some((v) => v !== null && v !== undefined);
    if (!temCriterio) return { cor: null, motivos: ['Defina seus critérios'] };
    const motivos = [];
    const avisos = [];
    if (config.idadeMinMeses != null) {
        const meses = idadeEmMeses(animal.dataNascimento, ref);
        if (meses === null) avisos.push('Sem data de nascimento');
        else if (meses < config.idadeMinMeses) {
            const faltam = config.idadeMinMeses - meses;
            motivos.push(`Falta${faltam > 1 ? 'm' : ''} ${faltam} ${faltam > 1 ? 'meses' : 'mês'}`);
        }
    }
    if (config.pesoMinKg != null) {
        if (animal.pesoAtual == null) avisos.push('Sem pesagem');
        else {
            if (animal.pesoAtual < config.pesoMinKg) motivos.push(`Falta ${Math.ceil(config.pesoMinKg - animal.pesoAtual)} kg`);
            if (animal.pesadoEm && diasEntre(animal.pesadoEm, ref) > PESAGEM_VALIDADE_DIAS) avisos.push('Pesagem antiga');
        }
    }
    if (config.eccMin != null) {
        if (animal.ecc == null) avisos.push('Sem ECC');
        else if (animal.ecc < config.eccMin) motivos.push('ECC abaixo do mínimo');
    }
    if (motivos.length) return { cor: 'VERMELHO', motivos: [...motivos, ...avisos] };
    if (avisos.length) return { cor: 'AMARELO', motivos: avisos };
    return { cor: 'VERDE', motivos: ['Apta'] };
}

const ordenar = (eventos) => [...eventos].sort((a, b) => new Date(a.date) - new Date(b.date)
    || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

// Recalcula a situação da vaca a partir da linha do tempo inteira.
export function calcularSituacao(eventos = [], config = {}) {
    const lista = ordenar(eventos);
    const liberacao = lista.find((e) => e.type === 'LIBERACAO');
    const partosAnteriores = Number(liberacao?.payload?.partosAnteriores) || 0;
    const partos = lista.filter((e) => e.type === 'PARTO').length;
    const totalPartos = partos + partosAnteriores;
    const categoria = totalPartos === 0 ? 'Novilha' : totalPartos === 1 ? 'Primípara' : 'Multípara';

    let situacao = liberacao ? (totalPartos > 0 ? 'VAZIA' : 'LIBERADA') : null;
    const inicial = liberacao?.payload?.situacaoAtual;
    if (inicial === 'PRENHE') situacao = 'PRENHE';
    if (inicial === 'PARIDA') situacao = 'PARIDA';
    let previsaoParto = null;
    let ultimaCobertura = null;
    let diagnosticoPrenhe = null;

    for (const e of lista) {
        switch (e.type) {
            case 'COBERTURA':
            case 'IATF':
                situacao = 'COBERTA';
                ultimaCobertura = e;
                previsaoParto = null;
                break;
            case 'DIAGNOSTICO_PRENHEZ':
                if (e.payload?.resultado === 'PRENHE') {
                    situacao = 'PRENHE';
                    diagnosticoPrenhe = e;
                } else {
                    situacao = totalPartos > 0 ? 'VAZIA' : 'LIBERADA';
                    diagnosticoPrenhe = null;
                    previsaoParto = null;
                }
                break;
            case 'PERDA':
                situacao = totalPartos > 0 ? 'VAZIA' : 'LIBERADA';
                diagnosticoPrenhe = null;
                previsaoParto = null;
                break;
            case 'PARTO':
                situacao = 'PARIDA';
                diagnosticoPrenhe = null;
                ultimaCobertura = null;
                previsaoParto = null;
                break;
            default:
                break;
        }
    }

    if (situacao === 'PRENHE' && config?.gestacaoDias) {
        const dias = Number(diagnosticoPrenhe?.payload?.diasGestacao);
        if (diagnosticoPrenhe && dias > 0) {
            previsaoParto = new Date(new Date(diagnosticoPrenhe.date).getTime() + (config.gestacaoDias - dias) * DAY_MS);
        } else if (ultimaCobertura) {
            previsaoParto = new Date(new Date(ultimaCobertura.date).getTime() + config.gestacaoDias * DAY_MS);
        }
    }
    if (lista.some((e) => e.type === 'DESCARTE')) situacao = 'DESCARTE';

    return { situacao, previsaoParto, categoria, totalPartos, historicoDesconhecido: Boolean(liberacao?.payload?.historicoDesconhecido) };
}

// Números da vaca (EIXO Performance). Pouco dado = null, nunca número enganoso.
export function numerosDaVaca(eventos = [], animal = {}) {
    const lista = ordenar(eventos);
    const desconhecido = Boolean(lista.find((e) => e.type === 'LIBERACAO')?.payload?.historicoDesconhecido);
    const partos = lista.filter((e) => e.type === 'PARTO');
    let idadePrimeiroParto = null;
    if (!desconhecido && partos.length && animal.dataNascimento) {
        idadePrimeiroParto = idadeEmMeses(animal.dataNascimento, partos[0].date);
    }
    let iepMeses = null;
    if (!desconhecido && partos.length >= 2) {
        const intervalos = partos.slice(1).map((p, i) => diasEntre(partos[i].date, p.date));
        iepMeses = Math.round((intervalos.reduce((s, d) => s + d, 0) / intervalos.length / 30.4375) * 10) / 10;
    }
    const pesos = lista.filter((e) => e.type === 'DESMAME' && Number(e.payload?.pesoAjustado205) > 0)
        .map((e) => Number(e.payload.pesoAjustado205));
    const pesoMedioDesmama = pesos.length ? Math.round(pesos.reduce((s, p) => s + p, 0) / pesos.length) : null;

    let vaziasSeguidas = 0;
    for (const e of lista) {
        if (e.type === 'DIAGNOSTICO_PRENHEZ') vaziasSeguidas = e.payload?.resultado === 'VAZIA' ? vaziasSeguidas + 1 : 0;
        if (e.type === 'PARTO') vaziasSeguidas = 0;
    }
    return { partos: partos.length, idadePrimeiroParto, iepMeses, pesoMedioDesmama, vaziasSeguidas };
}

// Checagens de um evento lançado à mão na ficha.
export function validarEvento({ type, date, payload = {} }, { eventos = [], sexo, hoje = new Date() } = {}) {
    const erros = [];
    const avisos = [];
    if (sexo !== 'FEMEA') erros.push('Macho não tem ficha reprodutiva.');
    if (!TIPOS_MANUAIS.includes(type)) erros.push('Tipo de evento inválido.');
    const d = new Date(date);
    if (!date || Number.isNaN(d.getTime())) erros.push('Data inválida.');
    else if (d.getTime() > new Date(hoje).getTime() + DAY_MS) erros.push('Data no futuro não é permitida.');
    if (type === 'DIAGNOSTICO_PRENHEZ' && !['PRENHE', 'VAZIA'].includes(payload.resultado)) erros.push('Informe prenhe ou vazia.');
    if (type === 'ECC') {
        const v = Number(payload.ecc);
        if (!(v >= 1 && v <= 5)) erros.push('ECC vai de 1 a 5.');
    }
    if (type === 'DESCARTE' && !payload.motivo) erros.push('Informe o motivo do descarte.');
    if (type === 'COBERTURA' && !['MONTA_NATURAL', 'IATF'].includes(payload.tipo)) erros.push('Informe monta natural ou IATF.');
    if (erros.length) return { erros, avisos };

    const ultimoParto = ordenar(eventos).filter((e) => e.type === 'PARTO').pop();
    if (type === 'DIAGNOSTICO_PRENHEZ' && payload.resultado === 'PRENHE' && ultimoParto && diasEntre(ultimoParto.date, d) < 30) {
        avisos.push('Prenhe com menos de 30 dias do parto — confira a data.');
    }
    if (type === 'DIAGNOSTICO_PRENHEZ') {
        const cobertura = ordenar(eventos).filter((e) => e.type === 'COBERTURA' && new Date(e.date) <= d).pop();
        if (cobertura && diasEntre(cobertura.date, d) < 30) avisos.push('Diagnóstico com menos de 30 dias da cobertura — cedo para ter certeza.');
    }
    return { erros, avisos };
}

// ---------- Fase 2: toque/ultrassom em lote ----------

export const METODOS_DIAGNOSTICO = ['TOQUE', 'ULTRASSOM'];
export const DECISOES_VAZIA = ['NOVA_COBERTURA', 'REPASSE'];
export const normalizarIdent = (v) => String(v ?? '').trim().toUpperCase();

// A vaca estava prenhe no último diagnóstico e nada (parto/perda) aconteceu depois?
export function estavaPrenhe(eventos = [], ate = null) {
    const lista = ordenar(eventos).filter((e) => !ate || new Date(e.date) <= new Date(ate));
    for (let i = lista.length - 1; i >= 0; i -= 1) {
        const e = lista[i];
        if (e.type === 'PARTO' || e.type === 'PERDA') return false;
        if (e.type === 'DIAGNOSTICO_PRENHEZ') return e.payload?.resultado === 'PRENHE';
    }
    return false;
}

/**
 * Separa as linhas digitadas no tronco em: diagnósticos válidos e pendências.
 * Nunca descarta linha em silêncio — o que não dá para gravar vira pendência com motivo.
 * vacas: Map(identificação normalizada -> { id, liberada, descartada, vivo, sexo })
 * eventosPorVaca: Map(id -> eventos)
 */
export function processarToque(linhas = [], { data, vacas = new Map(), eventosPorVaca = new Map() } = {}) {
    const validas = [];
    const pendencias = [];
    const vistos = new Set();
    for (const bruta of linhas) {
        const ident = normalizarIdent(bruta?.brinco);
        const linha = {
            brinco: ident,
            resultado: bruta?.resultado,
            diasGestacao: Number(bruta?.diasGestacao) > 0 ? Math.round(Number(bruta.diasGestacao)) : null,
            faixa: ['INICIAL', 'MEIO', 'FINAL'].includes(bruta?.faixa) ? bruta.faixa : null,
            ecc: Number(bruta?.ecc) >= 1 && Number(bruta?.ecc) <= 5 ? Number(bruta.ecc) : null,
            obs: bruta?.obs ? String(bruta.obs).slice(0, 500) : null,
        };
        if (!ident) continue;
        const pend = (motivo) => pendencias.push({ ...linha, motivo });
        if (!['PRENHE', 'VAZIA'].includes(linha.resultado)) { pend('Sem resultado (prenhe ou vazia)'); continue; }
        if (vistos.has(ident)) { pend('Lançada duas vezes neste toque'); continue; }
        vistos.add(ident);
        const vaca = vacas.get(ident);
        if (!vaca) { pend('Identificação não encontrada'); continue; }
        if (vaca.sexo !== 'FEMEA') { pend('Não é fêmea'); continue; }
        if (!vaca.vivo) { pend('Animal vendido ou morto'); continue; }
        if (vaca.descartada) { pend('Vaca descartada'); continue; }
        if (!vaca.liberada) { pend('Fêmea não liberada para reprodução'); continue; }
        const eventos = eventosPorVaca.get(vaca.id) || [];
        const avisos = [];
        const cobertura = ordenar(eventos).filter((e) => (e.type === 'COBERTURA' || e.type === 'IATF') && new Date(e.date) <= new Date(data)).pop();
        if (cobertura && diasEntre(cobertura.date, data) < 30) avisos.push('Menos de 30 dias da cobertura');
        const perda = linha.resultado === 'VAZIA' && estavaPrenhe(eventos, data);
        validas.push({ ...linha, animalId: vaca.id, perda, avisos });
    }
    return {
        validas,
        pendencias,
        resumo: {
            prenhes: validas.filter((l) => l.resultado === 'PRENHE').length,
            vazias: validas.filter((l) => l.resultado === 'VAZIA').length,
            perdas: validas.filter((l) => l.perda).length,
            pendencias: pendencias.length,
        },
    };
}

// Vazias esperando decisão: último diagnóstico vazio e nada lançado depois.
export function aguardaDecisao(eventos = []) {
    const lista = ordenar(eventos);
    if (lista.some((e) => e.type === 'DESCARTE')) return null;
    const idx = lista.map((e) => e.type).lastIndexOf('DIAGNOSTICO_PRENHEZ');
    if (idx < 0) return null;
    const diag = lista[idx];
    if (diag.payload?.resultado !== 'VAZIA') return null;
    const depois = lista.slice(idx + 1).filter((e) => e.type !== 'ECC' && !(e.type === 'OBSERVACAO' && !e.payload?.decisao) && e.type !== 'PERDA');
    if (depois.length) return null;
    return diag;
}

// ---------- Fase 3: parto e desmama ----------

export const TIPOS_PARTO = ['NORMAL', 'ASSISTIDO', 'CESAREA'];
export const INTERVALO_MIN_PARTOS_DIAS = 280;
export const COBERTURA_MIN_PARTO_DIAS = 260;
export const DESMAMA_PRECOCE_DIAS = 90;
export const ATRASO_PARTO_DIAS = 15;

export function validarParto({ data, crias = [], tipoParto }, { eventos = [], sexo, hoje = new Date() } = {}) {
    const erros = [];
    const avisos = [];
    if (sexo !== 'FEMEA') erros.push('Só fêmea tem parto.');
    const d = new Date(data);
    if (!data || Number.isNaN(d.getTime())) erros.push('Data do parto inválida.');
    else if (d.getTime() > new Date(hoje).getTime() + DAY_MS) erros.push('Data no futuro não é permitida.');
    if (!TIPOS_PARTO.includes(tipoParto)) erros.push('Informe o tipo de parto.');
    if (!crias.length || crias.length > 2) erros.push('Informe uma cria (ou duas, se gêmeos).');
    for (const c of crias) {
        if (!['MACHO', 'FEMEA'].includes(c?.sexo)) erros.push('Informe o sexo de cada cria.');
        if (c?.peso != null && c.peso !== '' && !(Number(c.peso) > 0 && Number(c.peso) < 100)) erros.push('Peso ao nascer fora da faixa (1 a 99 kg).');
    }
    const lista = ordenar(eventos);
    if (!lista.some((e) => e.type === 'LIBERACAO')) erros.push('Libere a fêmea para reprodução antes de lançar o parto.');
    if (lista.some((e) => e.type === 'DESCARTE')) erros.push('Vaca descartada.');
    if (erros.length) return { erros: [...new Set(erros)], avisos };

    const partoAnterior = lista.filter((e) => e.type === 'PARTO' && new Date(e.date) <= d).pop();
    if (partoAnterior && diasEntre(partoAnterior.date, d) < INTERVALO_MIN_PARTOS_DIAS) {
        erros.push(`Parto anterior em ${new Date(partoAnterior.date).toISOString().slice(0, 10)}: menos de ${INTERVALO_MIN_PARTOS_DIAS} dias, impossível.`);
    }
    const partoDepois = lista.find((e) => e.type === 'PARTO' && new Date(e.date) > d && diasEntre(d, e.date) < INTERVALO_MIN_PARTOS_DIAS);
    if (partoDepois) erros.push('Já existe parto registrado perto desta data.');
    const cobertura = lista.filter((e) => (e.type === 'COBERTURA' || e.type === 'IATF') && new Date(e.date) <= d).pop();
    if (cobertura && diasEntre(cobertura.date, d) < COBERTURA_MIN_PARTO_DIAS) avisos.push('Parto com menos de 260 dias da cobertura — confira as datas.');
    const diag = lista.filter((e) => e.type === 'DIAGNOSTICO_PRENHEZ' && new Date(e.date) <= d).pop();
    if (diag?.payload?.resultado === 'VAZIA') avisos.push(`Estava vazia no diagnóstico de ${new Date(diag.date).toISOString().slice(0, 10)} — confirme.`);
    return { erros, avisos };
}

export function pesoAjustado205({ peso, idadeDias, pesoNascer }) {
    const p = Number(peso);
    const pn = Number(pesoNascer);
    if (!(p > 0) || !(idadeDias > 0) || !(pn > 0) || p <= pn) return null;
    return Math.round(pn + ((p - pn) / idadeDias) * 205);
}

// Parto previsto: 'ATRASADO' passou da previsão + 15 dias; 'PROXIMO' nos próximos 30.
export function statusPrevisao(previsaoParto, ref = new Date()) {
    if (!previsaoParto) return null;
    const dias = diasEntre(ref, previsaoParto);
    if (dias < -ATRASO_PARTO_DIAS) return 'ATRASADO';
    if (dias <= 30) return 'PROXIMO';
    return null;
}

export function prontoParaDesmama({ idadeDias, peso }, config = {}) {
    const temIdade = config?.desmamaIdadeMeses != null;
    const temPeso = config?.desmamaPesoKg != null;
    if (!temIdade && !temPeso) return null;
    const porIdade = temIdade && idadeDias != null && idadeDias >= config.desmamaIdadeMeses * 30.4375;
    const porPeso = temPeso && peso != null && peso >= config.desmamaPesoKg;
    return Boolean(porIdade || porPeso);
}

// ---------- Fase 4: indicadores e farol (EIXO Performance) ----------

const JANELA_DIAS = 365;

const dentro = (data, inicio, fim) => {
    const t = new Date(data).getTime();
    return t >= inicio.getTime() && t <= fim.getTime();
};

const media = (lista) => (lista.length ? lista.reduce((s, v) => s + v, 0) / lista.length : null);
const arred = (v, casas = 1) => (v == null ? null : Math.round(v * 10 ** casas) / 10 ** casas);

// Maior é melhor, salvo nos indicadores marcados com menorMelhor.
export const INDICADORES = [
    { chave: 'prenhez', nome: 'Taxa de prenhez', unidade: '%', meta: 'metaPrenhez' },
    { chave: 'perdaGestacional', nome: 'Perda de gestação', unidade: '%', menorMelhor: true },
    { chave: 'natalidade', nome: 'Taxa de natalidade', unidade: '%', meta: 'metaNatalidade' },
    { chave: 'desmama', nome: 'Taxa de desmama', unidade: '%', meta: 'metaDesmama' },
    { chave: 'idadePrimeiroParto', nome: 'Idade ao 1º parto', unidade: 'meses', meta: 'metaIdadePrimeiroParto', menorMelhor: true },
    { chave: 'iep', nome: 'Intervalo entre partos', unidade: 'meses', meta: 'metaIepMeses', menorMelhor: true },
    { chave: 'pesoDesmama205', nome: 'Peso à desmama (205 dias)', unidade: 'kg' },
    { chave: 'kgPorVaca', nome: 'Kg de bezerro desmamado por vaca', unidade: 'kg' },
    { chave: 'partosAssistidos', nome: 'Partos assistidos', unidade: '%', menorMelhor: true },
    { chave: 'natimortos', nome: 'Natimortos', unidade: '%', menorMelhor: true },
    { chave: 'descarte', nome: 'Taxa de descarte', unidade: '%' },
];

/**
 * vacas: [{ id, eventos, dataNascimento }] — só fêmeas liberadas.
 * Janela: últimos 12 meses. Base abaixo do mínimo = valor null ("dados insuficientes").
 */
export function calcularIndicadores(vacas = [], config = {}, ref = new Date()) {
    const fim = new Date(ref);
    const inicio = new Date(fim.getTime() - JANELA_DIAS * DAY_MS);
    const minimo = Number(config?.minVacasIndicador) || 10;

    let expostas = 0;
    let diagnosticadas = 0;
    let prenhes = 0;
    let prenhesAlgumaVez = 0;
    let perdas = 0;
    let partos = 0;
    let assistidos = 0;
    let criasTotal = 0;
    let criasVivas = 0;
    let criasMortas = 0;
    let desmamas = 0;
    let kgDesmamados = 0;
    let descartes = 0;
    const pesos205 = [];
    const idades1Parto = [];
    const ieps = [];

    for (const v of vacas) {
        const lista = ordenar(v.eventos || []);
        const lib = lista.find((e) => e.type === 'LIBERACAO');
        if (!lib || new Date(lib.date) > fim) continue;
        const descarte = lista.find((e) => e.type === 'DESCARTE');
        if (descarte && new Date(descarte.date) < inicio) continue;
        expostas += 1;
        const desconhecido = Boolean(lib.payload?.historicoDesconhecido);

        const diags = lista.filter((e) => e.type === 'DIAGNOSTICO_PRENHEZ' && dentro(e.date, inicio, fim));
        if (diags.length) {
            diagnosticadas += 1;
            if (diags[diags.length - 1].payload?.resultado === 'PRENHE') prenhes += 1;
            if (diags.some((d) => d.payload?.resultado === 'PRENHE')) prenhesAlgumaVez += 1;
        }
        perdas += lista.filter((e) => e.type === 'PERDA' && dentro(e.date, inicio, fim)).length;

        const todosPartos = lista.filter((e) => e.type === 'PARTO');
        todosPartos.forEach((p, i) => {
            if (!dentro(p.date, inicio, fim)) return;
            partos += 1;
            if (['ASSISTIDO', 'CESAREA'].includes(p.payload?.tipoParto)) assistidos += 1;
            const crias = Array.isArray(p.payload?.crias) ? p.payload.crias : [{ vivo: true }];
            criasTotal += crias.length;
            criasVivas += crias.filter((c) => c.vivo !== false).length;
            criasMortas += crias.filter((c) => c.vivo === false).length;
            if (!desconhecido && i === 0 && v.dataNascimento) idades1Parto.push(idadeEmMeses(v.dataNascimento, p.date));
            if (!desconhecido && i > 0) ieps.push(diasEntre(todosPartos[i - 1].date, p.date) / 30.4375);
        });

        for (const d of lista.filter((e) => e.type === 'DESMAME' && dentro(e.date, inicio, fim))) {
            desmamas += 1;
            kgDesmamados += Number(d.payload?.peso) || 0;
            if (Number(d.payload?.pesoAjustado205) > 0) pesos205.push(Number(d.payload.pesoAjustado205));
        }
        if (descarte && dentro(descarte.date, inicio, fim)) descartes += 1;
    }

    const taxa = (parte, base) => (base >= minimo ? arred((parte / base) * 100) : null);
    const valores = {
        prenhez: { valor: taxa(prenhes, diagnosticadas), base: diagnosticadas },
        perdaGestacional: { valor: taxa(perdas, prenhesAlgumaVez), base: prenhesAlgumaVez },
        natalidade: { valor: taxa(criasVivas, expostas), base: expostas },
        desmama: { valor: taxa(desmamas, expostas), base: expostas },
        idadePrimeiroParto: { valor: idades1Parto.length >= minimo ? arred(media(idades1Parto)) : null, base: idades1Parto.length },
        iep: { valor: ieps.length >= minimo ? arred(media(ieps)) : null, base: ieps.length },
        pesoDesmama205: { valor: pesos205.length >= minimo ? Math.round(media(pesos205)) : null, base: pesos205.length },
        kgPorVaca: { valor: expostas >= minimo ? Math.round(kgDesmamados / expostas) : null, base: expostas },
        partosAssistidos: { valor: taxa(assistidos, partos), base: partos },
        natimortos: { valor: taxa(criasMortas, criasTotal), base: criasTotal },
        descarte: { valor: taxa(descartes, expostas), base: expostas },
    };

    return INDICADORES.map((ind) => {
        const { valor, base } = valores[ind.chave];
        const meta = ind.meta ? config?.[ind.meta] ?? null : null;
        let cor = null;
        if (valor != null && meta != null) cor = (ind.menorMelhor ? valor <= meta : valor >= meta) ? 'VERDE' : 'VERMELHO';
        return { ...ind, valor, base, meta, cor, insuficiente: valor == null };
    });
}

// Farol da vaca: sempre com o motivo. Limites que o produtor não definiu não entram.
export function farolVaca(eventos = [], config = {}, ref = new Date(), extras = {}) {
    const lista = ordenar(eventos);
    if (!lista.some((e) => e.type === 'LIBERACAO')) return null;
    if (lista.some((e) => e.type === 'DESCARTE')) return { cor: null, motivos: ['Descartada'] };
    const s = calcularSituacao(lista, config);
    const n = numerosDaVaca(lista, extras.animal || {});
    const vermelho = [];
    const amarelo = [];

    const limiteVazias = config?.vaziasSeguidasLimite;
    if (limiteVazias && n.vaziasSeguidas >= limiteVazias) vermelho.push(`Vazia ${n.vaziasSeguidas} vezes seguidas`);
    const perdas = lista.filter((e) => e.type === 'PERDA').length;
    if (perdas >= 2) vermelho.push(`${perdas} perdas de gestação`);
    if (config?.iepMaxMeses && n.iepMeses != null && n.iepMeses > config.iepMaxMeses) vermelho.push(`Intervalo entre partos de ${n.iepMeses} meses`);
    if (config?.pesoMinDesmamaFarol) {
        const leves = lista.filter((e) => e.type === 'DESMAME' && Number(e.payload?.pesoAjustado205) > 0 && e.payload.pesoAjustado205 < config.pesoMinDesmamaFarol).length;
        if (leves >= 2) vermelho.push(`${leves} bezerros leves na desmama`);
    }
    if (lista.some((e) => e.payload?.sugereDescarte)) vermelho.push('Veterinário sugeriu descarte');

    const ultimoDiag = lista.filter((e) => e.type === 'DIAGNOSTICO_PRENHEZ').pop();
    const ultimo = lista[lista.length - 1];
    if (ultimoDiag?.payload?.resultado === 'VAZIA' && ['VAZIA', 'LIBERADA'].includes(s.situacao) && !vermelho.length) {
        amarelo.push(s.categoria === 'Primípara' ? 'Primípara vazia' : 'Vazia no último diagnóstico');
    }
    if (perdas === 1 && ultimo?.type === 'PERDA') amarelo.push('Perdeu a gestação');
    if (s.situacao === 'PRENHE' && statusPrevisao(s.previsaoParto, ref) === 'ATRASADO') amarelo.push('Parto atrasado');
    const ultimoEcc = lista.filter((e) => e.type === 'ECC').pop();
    if (config?.eccMin != null && ultimoEcc && Number(ultimoEcc.payload?.ecc) < config.eccMin) amarelo.push(`ECC ${ultimoEcc.payload.ecc}, abaixo do mínimo`);
    const referencia = ultimoDiag || lista.find((e) => e.type === 'LIBERACAO');
    const ultimoParto = lista.filter((e) => e.type === 'PARTO').pop();
    const recente = [ultimoDiag, ultimoParto].filter(Boolean).map((e) => new Date(e.date).getTime());
    const maisRecente = recente.length ? Math.max(...recente) : new Date(referencia.date).getTime();
    if (s.situacao !== 'PRENHE' && (new Date(ref).getTime() - maisRecente) / DAY_MS > JANELA_DIAS) amarelo.push('Sem diagnóstico há mais de 12 meses');

    if (vermelho.length) return { cor: 'VERMELHO', motivos: [...vermelho, ...amarelo] };
    if (amarelo.length) return { cor: 'AMARELO', motivos: amarelo };
    return { cor: 'VERDE', motivos: [s.situacao === 'PRENHE' ? 'Prenhe' : s.situacao === 'PARIDA' ? 'Parida' : 'Em dia'] };
}

// "Manter" tira a vaca da lista de descarte até o próximo diagnóstico.
export function mantidaAteProximoToque(eventos = []) {
    const lista = ordenar(eventos);
    const idx = lista.map((e) => (e.type === 'OBSERVACAO' && e.payload?.manter ? 1 : 0)).lastIndexOf(1);
    if (idx < 0) return false;
    return !lista.slice(idx + 1).some((e) => e.type === 'DIAGNOSTICO_PRENHEZ');
}
