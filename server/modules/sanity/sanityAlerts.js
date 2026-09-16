// Lembretes da Sanidade, calculados na hora a partir dos dados da fazenda.
// Regra de ouro: lembrete errado sobre obrigação legal é pior que nenhum lembrete.
import { B19_IDADE_MAX_DIAS, B19_IDADE_MIN_DIAS, idadeEmDias } from './sanityRules.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const HORIZONTE_DIAS = 90;
const MAX_IDS = 500;

const inicioDoDia = (data) => {
    const d = new Date(data);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const somarDias = (data, dias) => new Date(inicioDoDia(data).getTime() + dias * DAY_MS);
const diasAte = (hoje, data) => Math.round((inicioDoDia(data).getTime() - inicioDoDia(hoje).getTime()) / DAY_MS);
const fmt = (data) => inicioDoDia(data).toISOString().slice(0, 10).split('-').reverse().join('/');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// vermelho: hoje ou vencido · laranja: até 7 dias · amarelo: até 30 dias · azul: mais longe
export function severidade(dias) {
    if (dias <= 0) return 'VERMELHO';
    if (dias <= 7) return 'LARANJA';
    if (dias <= 30) return 'AMARELO';
    return 'AZUL';
}

function lembrete({ id, grupo, titulo, descricao, data, hoje, animais = [], tag = null, acao = 'APLICAR' }) {
    const dias = diasAte(hoje, data);
    return {
        id,
        grupo,
        titulo,
        descricao,
        data: inicioDoDia(data).toISOString(),
        dias,
        severidade: severidade(dias),
        tag,
        acao,
        totalAnimais: animais.length,
        brincos: animais.slice(0, MAX_IDS).map((animal) => animal.brinco),
    };
}

// Última aplicação de cada animal para uma marcação (tag), e a contagem de doses.
function historicoPorTag(aplicacoes, tag) {
    const porAnimal = new Map();
    for (const aplicacao of aplicacoes) {
        if (!aplicacao.tags.has(tag)) continue;
        const atual = porAnimal.get(aplicacao.animalId) || { doses: [], ultima: null };
        atual.doses.push(new Date(aplicacao.appliedAt));
        if (!atual.ultima || new Date(aplicacao.appliedAt) > atual.ultima) atual.ultima = new Date(aplicacao.appliedAt);
        porAnimal.set(aplicacao.animalId, atual);
    }
    for (const item of porAnimal.values()) item.doses.sort((a, b) => a - b);
    return porAnimal;
}

// Agrupa animais pela data de vencimento para não gerar um lembrete por cabeça.
function agruparPorData(itens) {
    const grupos = new Map();
    for (const item of itens) {
        const key = inicioDoDia(item.data).toISOString();
        const atual = grupos.get(key) || { data: item.data, animais: [] };
        atual.animais.push(item.animal);
        grupos.set(key, atual);
    }
    return [...grupos.values()].sort((a, b) => a.data - b.data);
}

function brucelose({ hoje, femeas, aplicacoes, estoque }) {
    const saida = [];
    const vacinadas = new Set([
        ...historicoPorTag(aplicacoes, 'BRUCELOSE_B19').keys(),
        ...historicoPorTag(aplicacoes, 'BRUCELOSE_RB51').keys(),
    ]);
    const naIdade = [];
    const entrando = [];
    const passaram = [];
    for (const animal of femeas) {
        if (vacinadas.has(animal.id)) continue;
        const idade = idadeEmDias(animal.dataNascimento, hoje);
        if (idade === null) continue;
        if (idade >= B19_IDADE_MIN_DIAS && idade <= B19_IDADE_MAX_DIAS) {
            naIdade.push({ animal, limite: somarDias(animal.dataNascimento, B19_IDADE_MAX_DIAS) });
        } else if (idade < B19_IDADE_MIN_DIAS && B19_IDADE_MIN_DIAS - idade <= 30) {
            entrando.push({ animal, inicio: somarDias(animal.dataNascimento, B19_IDADE_MIN_DIAS) });
        } else if (idade > B19_IDADE_MAX_DIAS && idade <= B19_IDADE_MAX_DIAS + 180) {
            passaram.push(animal);
        }
    }
    if (naIdade.length) {
        naIdade.sort((a, b) => a.limite - b.limite);
        const limite = naIdade[0].limite;
        const falta = estoque?.BRUCELOSE_B19 !== undefined && estoque.BRUCELOSE_B19 < naIdade.length
            ? ` Estoque de B19 dá para ${Math.floor(estoque.BRUCELOSE_B19)} e faltam ${naIdade.length - Math.floor(estoque.BRUCELOSE_B19)} doses.`
            : '';
        // Já está na janela: aparece mesmo com o prazo final longe.
        const item = lembrete({
            id: 'b19-na-idade',
            grupo: 'OBRIGATORIO',
            titulo: `Brucelose B19: ${plural(naIdade.length, 'bezerra', 'bezerras')} na idade`,
            descricao: `A primeira sai da idade (8 meses) em ${fmt(limite)}. Vacinação obrigatória, feita por veterinário cadastrado.${falta}`,
            data: limite,
            hoje,
            animais: naIdade.map((item) => item.animal),
            tag: 'BRUCELOSE_B19',
        });
        saida.push({ ...item, sempre: true, severidade: item.severidade === 'AZUL' ? 'AMARELO' : item.severidade });
    }
    if (entrando.length) {
        entrando.sort((a, b) => a.inicio - b.inicio);
        saida.push(lembrete({
            id: 'b19-entrando',
            grupo: 'OBRIGATORIO',
            titulo: `Brucelose B19: ${plural(entrando.length, 'bezerra entra', 'bezerras entram')} na idade`,
            descricao: `A partir de ${fmt(entrando[0].inicio)} (3 meses). Programe a vacinação e o veterinário.`,
            data: entrando[0].inicio,
            hoje,
            animais: entrando.map((item) => item.animal),
            tag: 'BRUCELOSE_B19',
            acao: 'VER',
        }));
    }
    if (passaram.length) {
        saida.push(lembrete({
            id: 'b19-passou',
            grupo: 'OBRIGATORIO',
            titulo: `Brucelose: ${plural(passaram.length, 'fêmea passou', 'fêmeas passaram')} da idade sem B19`,
            descricao: 'Sem vacina registrada até 8 meses. Converse com o veterinário sobre a RB51 e sobre a comprovação no órgão de defesa.',
            data: hoje,
            hoje,
            animais: passaram,
            tag: 'BRUCELOSE_RB51',
        }));
    }
    return saida;
}

// Prazo de referência nacional (semestral). O órgão do estado pode ter datas próprias.
export function proximoPrazoBrucelose(hoje) {
    const d = inicioDoDia(hoje);
    const ano = d.getUTCFullYear();
    const julho = new Date(Date.UTC(ano, 6, 10));
    if (d <= julho) return { prazo: julho, inicioSemestre: new Date(Date.UTC(ano, 0, 1)) };
    return { prazo: new Date(Date.UTC(ano + 1, 0, 10)), inicioSemestre: new Date(Date.UTC(ano, 6, 1)) };
}

function comprovacaoBrucelose({ hoje, aplicacoes, estado }) {
    const { prazo, inicioSemestre } = proximoPrazoBrucelose(hoje);
    if (diasAte(hoje, prazo) > 30) return [];
    const vacinadas = new Set(aplicacoes
        .filter((aplicacao) => (aplicacao.tags.has('BRUCELOSE_B19') || aplicacao.tags.has('BRUCELOSE_RB51'))
            && new Date(aplicacao.appliedAt) >= inicioSemestre && new Date(aplicacao.appliedAt) <= prazo)
        .map((aplicacao) => aplicacao.animalId));
    return [lembrete({
        id: `brucelose-comprovacao-${prazo.toISOString().slice(0, 10)}`,
        grupo: 'OBRIGATORIO',
        titulo: `Comprovar vacinação de brucelose até ${fmt(prazo)}`,
        descricao: `${plural(vacinadas.size, 'fêmea vacinada', 'fêmeas vacinadas')} no semestre. Leve a comprovação ao ${estado.orgao}. Prazo de referência nacional: confira o calendário do seu estado. Sem comprovação, a fazenda fica impedida de emitir GTA.`,
        data: prazo,
        hoje,
        acao: 'VER',
    })];
}

// Reforço (2ª dose) e revacinação anual para uma marcação.
function reforcoEAnual({ hoje, animais, aplicacoes, tag, nome, grupo, reforcoDias, janelaReforco = null, idadeMinimaDias = null, prefixo }) {
    const historico = historicoPorTag(aplicacoes, tag);
    const porId = new Map(animais.map((animal) => [animal.id, animal]));
    const reforcos = [];
    const anuais = [];
    const nunca = [];
    for (const [animalId, item] of historico) {
        const animal = porId.get(animalId);
        if (!animal) continue;
        if (item.doses.length === 1) {
            const vence = somarDias(item.doses[0], reforcoDias);
            if (diasAte(hoje, vence) <= HORIZONTE_DIAS && diasAte(hoje, vence) >= -60) reforcos.push({ animal, data: vence });
        } else {
            const vence = somarDias(item.ultima, 365);
            if (diasAte(hoje, vence) <= HORIZONTE_DIAS && diasAte(hoje, vence) >= -180) anuais.push({ animal, data: vence });
        }
    }
    if (idadeMinimaDias !== null) {
        for (const animal of animais) {
            if (historico.has(animal.id)) continue;
            const idade = idadeEmDias(animal.dataNascimento, hoje);
            if (idade !== null && idade >= idadeMinimaDias) nunca.push(animal);
        }
    }
    const saida = [];
    for (const g of agruparPorData(reforcos)) {
        saida.push(lembrete({
            id: `${prefixo}-reforco-${g.data.toISOString().slice(0, 10)}`,
            grupo,
            titulo: `${nome}: reforço de ${plural(g.animais.length, 'animal', 'animais')}`,
            descricao: janelaReforco
                ? `A 2ª dose deve ser dada ${janelaReforco}. Prazo final: ${fmt(g.data)}.`
                : `A 2ª dose vence em ${fmt(g.data)}.`,
            data: g.data,
            hoje,
            animais: g.animais,
            tag,
        }));
    }
    for (const g of agruparPorData(anuais)) {
        saida.push(lembrete({
            id: `${prefixo}-anual-${g.data.toISOString().slice(0, 10)}`,
            grupo,
            titulo: `${nome}: revacinação anual de ${plural(g.animais.length, 'animal', 'animais')}`,
            descricao: `Um ano da última dose em ${fmt(g.data)}.`,
            data: g.data,
            hoje,
            animais: g.animais,
            tag,
        }));
    }
    if (nunca.length) {
        saida.push(lembrete({
            id: `${prefixo}-nunca`,
            grupo,
            titulo: `${nome}: ${plural(nunca.length, 'animal', 'animais')} sem nenhuma dose registrada`,
            descricao: 'Animais na idade de vacinar sem registro no EIXO. Se já foram vacinados antes, registre a aplicação para o lembrete sumir.',
            data: hoje,
            hoje,
            animais: nunca,
            tag,
        }));
    }
    return saida;
}

function reprodutivas({ hoje, femeas, aplicacoes, estacoes }) {
    const proxima = estacoes
        .filter((estacao) => diasAte(hoje, estacao.startAt) > 0 && diasAte(hoje, estacao.startAt) <= HORIZONTE_DIAS + 60)
        .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))[0];
    if (!proxima) return [];
    const limite = somarDias(proxima.startAt, -30);
    const desde = somarDias(proxima.startAt, -180);
    const vacinadas = new Set(aplicacoes
        .filter((aplicacao) => (aplicacao.tags.has('REPRODUTIVA') || aplicacao.tags.has('IBR_BVD')) && new Date(aplicacao.appliedAt) >= desde)
        .map((aplicacao) => aplicacao.animalId));
    const alvo = femeas.filter((animal) => {
        if (vacinadas.has(animal.id)) return false;
        const idade = idadeEmDias(animal.dataNascimento, hoje);
        return idade === null || idade >= 365;
    });
    if (!alvo.length || diasAte(hoje, limite) > HORIZONTE_DIAS) return [];
    return [lembrete({
        id: `reprodutiva-${proxima.id}`,
        grupo: 'BOAS_PRATICAS',
        titulo: `Vacinas reprodutivas antes da estação "${proxima.name}"`,
        descricao: `${plural(alvo.length, 'fêmea', 'fêmeas')} sem IBR/BVD e leptospirose nos últimos 6 meses. Ideal: entre ${fmt(somarDias(proxima.startAt, -60))} e ${fmt(limite)} (a estação começa em ${fmt(proxima.startAt)}).`,
        data: limite,
        hoje,
        animais: alvo,
        tag: 'REPRODUTIVA',
    })];
}

// Tratamento por mês (vermífugo, carrapato): lembra do mês até 30 dias antes e até 30 dias depois.
function porMes({ hoje, meses, aplicacoes, filtro, nome, prefixo, animaisVivos, tag }) {
    const saida = [];
    const d = inicioDoDia(hoje);
    for (const offsetAno of [-1, 0, 1]) {
        for (const mes of meses) {
            const inicio = new Date(Date.UTC(d.getUTCFullYear() + offsetAno, mes - 1, 1));
            const fim = new Date(Date.UTC(d.getUTCFullYear() + offsetAno, mes, 0));
            const diasInicio = diasAte(hoje, inicio);
            const diasFim = diasAte(hoje, fim);
            if (diasInicio > 30 || diasFim < -30) continue;
            const feitos = aplicacoes.some((aplicacao) => filtro(aplicacao)
                && new Date(aplicacao.appliedAt) >= somarDias(inicio, -15) && new Date(aplicacao.appliedAt) <= somarDias(fim, 15));
            if (feitos) continue;
            const nomeMes = inicio.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
            saida.push(lembrete({
                id: `${prefixo}-${inicio.toISOString().slice(0, 7)}`,
                grupo: 'BOAS_PRATICAS',
                titulo: `${nome} de ${nomeMes}`,
                descricao: `Tratamento estratégico programado para ${nomeMes}, para ${plural(animaisVivos.length, 'animal', 'animais')} da fazenda. Nenhuma aplicação registrada no período. Na aplicação, escolha lote por lote.`,
                data: fim,
                hoje,
                tag,
            }));
        }
    }
    return saida;
}

function gestao({ hoje, carencias, lotes }) {
    const saida = [];
    const liberando = carencias.filter((item) => !item.semCarencia && item.liberaEm && diasAte(hoje, item.liberaEm) >= 0 && diasAte(hoje, item.liberaEm) <= 7);
    for (const g of agruparPorData(liberando.map((item) => ({ animal: { id: item.animalId, brinco: item.brinco }, data: new Date(item.liberaEm) })))) {
        saida.push({
            ...lembrete({
                id: `carencia-${g.data.toISOString().slice(0, 10)}`,
                grupo: 'GESTAO',
                titulo: `${plural(g.animais.length, 'animal liberado', 'animais liberados')} para abate em ${fmt(g.data)}`,
                descricao: 'Fim da carência dos produtos aplicados.',
                data: g.data,
                hoje,
                animais: g.animais,
                acao: 'VER',
            }),
            severidade: 'AZUL',
        });
    }
    const vencendo = lotes.filter((lote) => lote.quantity > 0 && lote.expiresAt && diasAte(hoje, lote.expiresAt) <= 60);
    for (const lote of vencendo) {
        const dias = diasAte(hoje, lote.expiresAt);
        saida.push(lembrete({
            id: `validade-${lote.id}`,
            grupo: 'GESTAO',
            titulo: dias < 0 ? `${lote.productName} (lote ${lote.lotNumber}) vencido` : `${lote.productName} (lote ${lote.lotNumber}) vence em ${fmt(lote.expiresAt)}`,
            descricao: `Saldo de ${lote.quantity} ${lote.unit}.${dias < 0 ? ' Produto vencido é perda da fazenda: não aplique.' : ' Use antes de abrir outro lote.'}`,
            data: new Date(lote.expiresAt),
            hoje,
            acao: 'FARMACIA',
        }));
    }
    return saida;
}

export function gerarLembretes({ hoje = new Date(), animais, aplicacoes, settings, estado, estacoes = [], carencias = [], lotes = [], estoque = {} }) {
    const vivos = animais.filter((animal) => animal.status === 'VIVO');
    const femeas = vivos.filter((animal) => animal.sexo === 'FEMEA');
    const lista = [
        ...brucelose({ hoje, femeas, aplicacoes, estoque }),
        ...comprovacaoBrucelose({ hoje, aplicacoes, estado }),
    ];

    if (settings.rabiesRequired === 'SIM') {
        lista.push(...reforcoEAnual({
            hoje, animais: vivos, aplicacoes, tag: 'RAIVA', nome: 'Raiva', grupo: 'OBRIGATORIO',
            reforcoDias: 30, janelaReforco: 'entre 21 e 30 dias após a 1ª', idadeMinimaDias: 90, prefixo: 'raiva',
        }));
    } else if (settings.rabiesRequired === 'NAO_SEI') {
        lista.push({
            ...lembrete({
                id: 'raiva-confirmar',
                grupo: 'OBRIGATORIO',
                titulo: 'Confirme se a vacina da raiva é obrigatória na sua região',
                descricao: `A obrigação muda por município. Consulte o ${estado.orgao} e responda na configuração do Calendário.`,
                data: hoje,
                hoje,
                acao: 'CONFIGURAR',
            }),
            severidade: 'AMARELO',
            link: estado.linkBusca,
        });
    }
    if (settings.clostridialEnabled) {
        lista.push(...reforcoEAnual({
            hoje, animais: vivos, aplicacoes, tag: 'CLOSTRIDIOSE', nome: 'Clostridioses', grupo: 'BOAS_PRATICAS',
            reforcoDias: 42, janelaReforco: '4 a 6 semanas após a 1ª', idadeMinimaDias: 60, prefixo: 'clostridiose',
        }));
    }
    if (settings.reproductiveEnabled) lista.push(...reprodutivas({ hoje, femeas, aplicacoes, estacoes }));
    const ehVermifugo = (aplicacao) => aplicacao.category === 'VERMIFUGO' || (aplicacao.category === 'ANTIPARASITARIO' && !aplicacao.tags.has('CARRAPATICIDA'));
    if (settings.dewormEnabled && settings.dewormMonths?.length) {
        lista.push(...porMes({ hoje, meses: settings.dewormMonths, aplicacoes, filtro: ehVermifugo, nome: 'Vermífugo', prefixo: 'vermifugo', animaisVivos: vivos, tag: 'VERMIFUGO' }));
    }
    if (settings.tickEnabled && settings.tickMonths?.length) {
        lista.push(...porMes({ hoje, meses: settings.tickMonths, aplicacoes, filtro: (a) => a.tags.has('CARRAPATICIDA'), nome: 'Carrapaticida', prefixo: 'carrapato', animaisVivos: vivos, tag: 'CARRAPATICIDA' }));
    }
    lista.push(...gestao({ hoje, carencias, lotes }));

    const ordem = { VERMELHO: 0, LARANJA: 1, AMARELO: 2, AZUL: 3 };
    return lista
        .filter((item) => item.dias <= HORIZONTE_DIAS || item.sempre)
        .sort((a, b) => (ordem[a.severidade] - ordem[b.severidade]) || (a.dias - b.dias));
}
