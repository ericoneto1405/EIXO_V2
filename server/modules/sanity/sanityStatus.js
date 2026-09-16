// Regras puras: semáforo da fazenda, venda x carência, casos de doença/morte e temperatura.
import { proximoPrazoBrucelose } from './sanityAlerts.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const fmt = (data) => new Date(data).toISOString().slice(0, 10).split('-').reverse().join('/');
const ORDEM = { VERDE: 0, CINZA: 0, AMARELO: 1, VERMELHO: 2 };
const pior = (lista) => lista.reduce((atual, item) => (ORDEM[item] > ORDEM[atual] ? item : atual), 'VERDE');

// ── Semáforo ──────────────────────────────────────────────────────────────────

// Semestre cujo prazo já passou mais recentemente (ex.: em set/2026 → 1º semestre de 2026, prazo 10/07/2026).
export function ultimoPeriodoVencido(hoje) {
    const d = new Date(hoje);
    const ano = d.getUTCFullYear();
    const julho = Date.UTC(ano, 6, 10, 23, 59, 59);
    const janeiro = Date.UTC(ano, 0, 10, 23, 59, 59);
    if (d.getTime() > julho) return { period: `${ano}-S1`, prazo: new Date(Date.UTC(ano, 6, 10)), label: `1º semestre de ${ano}` };
    if (d.getTime() > janeiro) return { period: `${ano - 1}-S2`, prazo: new Date(Date.UTC(ano, 0, 10)), label: `2º semestre de ${ano - 1}` };
    return { period: `${ano - 1}-S1`, prazo: new Date(Date.UTC(ano - 1, 6, 10)), label: `1º semestre de ${ano - 1}` };
}

export function periodoAtual(hoje) {
    const { prazo } = proximoPrazoBrucelose(hoje);
    const ano = prazo.getUTCMonth() === 6 ? prazo.getUTCFullYear() : prazo.getUTCFullYear() - 1;
    const semestre = prazo.getUTCMonth() === 6 ? 'S1' : 'S2';
    return { period: `${ano}-${semestre}`, prazo, label: `${semestre === 'S1' ? '1º' : '2º'} semestre de ${ano}` };
}

export function calcularSemaforo({ hoje = new Date(), lembretes, comprovacoes, settings, estado, temFemeas }) {
    const achar = (prefixo) => lembretes.filter((item) => item.id.startsWith(prefixo));
    const entregues = new Set(comprovacoes.filter((item) => item.kind === 'BRUCELOSE').map((item) => item.period));

    // Brucelose
    const bruc = { status: 'VERDE', motivos: [] };
    if (!temFemeas) {
        bruc.motivos.push('Nenhuma fêmea no rebanho.');
    } else {
        const vencido = ultimoPeriodoVencido(hoje);
        if (!entregues.has(vencido.period)) {
            bruc.status = 'VERMELHO';
            bruc.motivos.push(`Comprovação do ${vencido.label} (prazo ${fmt(vencido.prazo)}) não registrada no EIXO.`);
        }
        const atual = periodoAtual(hoje);
        const diasPrazo = Math.round((atual.prazo.getTime() - new Date(hoje).getTime()) / DAY_MS);
        if (!entregues.has(atual.period) && diasPrazo <= 30) {
            bruc.status = pior([bruc.status, 'AMARELO']);
            bruc.motivos.push(`Comprovação do ${atual.label} vence em ${fmt(atual.prazo)}.`);
        }
        const passou = achar('b19-passou')[0];
        if (passou) {
            bruc.status = pior([bruc.status, 'AMARELO']);
            bruc.motivos.push(`${passou.totalAnimais} fêmea(s) passaram de 8 meses sem vacina registrada.`);
        }
        const naIdade = achar('b19-na-idade')[0];
        if (naIdade && naIdade.dias <= 7) {
            bruc.status = pior([bruc.status, 'AMARELO']);
            bruc.motivos.push(`${naIdade.totalAnimais} bezerra(s) saem da idade da B19 até ${fmt(naIdade.data)}.`);
        }
        if (!bruc.motivos.length) bruc.motivos.push('Sem pendências registradas.');
    }

    // Raiva
    const raiva = { status: 'VERDE', motivos: [] };
    if (settings.rabiesRequired === 'NAO') {
        raiva.status = 'CINZA';
        raiva.motivos.push('Marcada como não obrigatória na região.');
    } else if (settings.rabiesRequired === 'NAO_SEI') {
        raiva.status = 'AMARELO';
        raiva.motivos.push(`Confirme com o ${estado.orgao} se a vacina é obrigatória no seu município.`);
    } else {
        const itens = [...achar('raiva-reforco'), ...achar('raiva-anual'), ...achar('raiva-nunca')];
        const vencidos = itens.filter((item) => item.dias < 0 || item.id === 'raiva-nunca');
        const proximos = itens.filter((item) => item.dias >= 0 && item.dias <= 7 && item.id !== 'raiva-nunca');
        if (vencidos.length) {
            raiva.status = 'VERMELHO';
            const total = vencidos.reduce((soma, item) => soma + item.totalAnimais, 0);
            raiva.motivos.push(`${total} animal(is) com reforço, revacinação ou 1ª dose em atraso.`);
        }
        if (proximos.length) {
            raiva.status = pior([raiva.status, 'AMARELO']);
            raiva.motivos.push(`${proximos.reduce((soma, item) => soma + item.totalAnimais, 0)} animal(is) com dose vencendo em até 7 dias.`);
        }
        if (!raiva.motivos.length) raiva.motivos.push('Vacinação em dia.');
    }

    const geral = pior([bruc.status, raiva.status === 'CINZA' ? 'VERDE' : raiva.status]);
    return {
        geral,
        mensagem: geral === 'VERDE'
            ? 'Sem pendências sanitárias registradas.'
            : geral === 'AMARELO'
                ? 'Atenção: há prazos próximos. Resolva para não ter a GTA bloqueada.'
                : `Pendência sanitária: o ${estado.orgao} pode bloquear a emissão de GTA até a regularização.`,
        brucelose: bruc,
        raiva,
        periodoAtual: periodoAtual(hoje),
        ultimoPeriodoVencido: ultimoPeriodoVencido(hoje),
        comprovacoes: comprovacoes.filter((item) => item.kind === 'BRUCELOSE').map((item) => item.period),
    };
}

// ── Venda x carência ──────────────────────────────────────────────────────────

export const SALE_TYPES = new Set(['ABATE', 'RECRIA', 'REPRODUCAO', 'OUTRO']);

// Sem finalidade informada conta como abate: é o caso em que a carência protege o consumidor.
export function avaliarVenda({ saleType, dataVenda, carencia }) {
    const tipo = SALE_TYPES.has(saleType) ? saleType : 'ABATE';
    if (!carencia) return { permitido: true, tipo, aviso: null };
    const liberaEm = carencia.liberaEm ? new Date(carencia.liberaEm) : null;
    const emCarencia = carencia.semCarencia || (liberaEm && liberaEm > new Date(dataVenda));
    if (!emCarencia) return { permitido: true, tipo, aviso: null };
    const produtos = carencia.produtos?.join(', ') || 'produto aplicado';
    const texto = carencia.semCarencia
        ? `recebeu ${produtos} sem carência cadastrada`
        : `está em carência até ${fmt(liberaEm)} (${produtos})`;
    if (tipo === 'ABATE') {
        return {
            permitido: false,
            tipo,
            mensagem: `Venda para abate bloqueada: o animal ${texto}.${carencia.semCarencia ? ' Preencha a carência do produto na Farmácia.' : ''}`,
        };
    }
    return { permitido: true, tipo, aviso: `Atenção: o animal ${texto}. Informe o comprador; ele não pode ir para o abate antes disso.` };
}

// ── Doenças e mortes ──────────────────────────────────────────────────────────

export const DOENCAS = [
    { key: 'TRISTEZA_PARASITARIA', label: 'Tristeza parasitária (babesiose/anaplasmose)' },
    { key: 'PNEUMONIA', label: 'Pneumonia / doença respiratória' },
    { key: 'DIARREIA', label: 'Diarreia' },
    { key: 'ONFALITE', label: 'Infecção de umbigo' },
    { key: 'MIIASE', label: 'Bicheira (miíase)' },
    { key: 'VERMINOSE', label: 'Verminose' },
    { key: 'CERATOCONJUNTIVITE', label: 'Doença de olho (ceratoconjuntivite)' },
    { key: 'CASCO', label: 'Problema de casco (pododermatite)' },
    { key: 'CLOSTRIDIOSE', label: 'Clostridiose (carbúnculo sintomático etc.)' },
    { key: 'BOTULISMO', label: 'Botulismo' },
    { key: 'TETANO', label: 'Tétano' },
    { key: 'TIMPANISMO', label: 'Timpanismo (estufamento)' },
    { key: 'ACIDOSE', label: 'Acidose (confinamento)' },
    { key: 'INTOXICACAO_PLANTA', label: 'Intoxicação por planta' },
    { key: 'FOTOSSENSIBILIZACAO', label: 'Fotossensibilização' },
    { key: 'RAIVA', label: 'Suspeita de raiva', notificavel: true },
    { key: 'DOENCA_NERVOSA', label: 'Sinais nervosos (andar em círculo, agressividade, paralisia)', notificavel: true },
    { key: 'VESICULAR', label: 'Feridas na boca e nos cascos (suspeita de doença vesicular)', notificavel: true },
    { key: 'ABORTO', label: 'Aborto', notificavel: true },
    { key: 'OUTRA', label: 'Outra' },
];

export const CAUSAS_MORTE = [
    ...DOENCAS.filter((item) => !['ABORTO', 'OUTRA'].includes(item.key)),
    { key: 'PARTO', label: 'Problema no parto' },
    { key: 'PICADA_COBRA', label: 'Picada de cobra' },
    { key: 'RAIO', label: 'Raio' },
    { key: 'ACIDENTE', label: 'Acidente / trauma' },
    { key: 'PREDADOR', label: 'Ataque de predador' },
    { key: 'DESCONHECIDA', label: 'Causa desconhecida', notificavel: true },
    { key: 'OUTRA', label: 'Outra' },
];

export const CASE_STATUS = new Set(['EM_TRATAMENTO', 'CURADO', 'MORTO', 'DESCARTADO']);

export function doencaInfo(kind, key) {
    const lista = kind === 'MORTE' ? CAUSAS_MORTE : DOENCAS;
    return lista.find((item) => item.key === key) || null;
}

// Doença de notificação obrigatória ou morte sem causa: avisar o órgão em até 24 h.
export function avisoNotificacao(kind, key, orgao) {
    const info = doencaInfo(kind, key);
    if (!info?.notificavel) return null;
    return `Suspeita de doença de notificação obrigatória. Comunique o ${orgao} em até 24 horas e não mexa na carcaça sem orientação do veterinário.`;
}

export function indicadoresCasos({ hoje = new Date(), casos, vivos }) {
    const desde = new Date(new Date(hoje).getTime() - 365 * DAY_MS);
    const ultimos = casos.filter((caso) => new Date(caso.startedAt) >= desde);
    const mortes = ultimos.filter((caso) => caso.kind === 'MORTE' || caso.status === 'MORTO').length;
    const base = vivos + mortes;
    const porCausa = new Map();
    for (const caso of ultimos) {
        const info = doencaInfo(caso.kind, caso.disease);
        const label = info?.label || caso.disease;
        const atual = porCausa.get(label) || { causa: label, casos: 0, mortes: 0 };
        atual.casos += 1;
        if (caso.kind === 'MORTE' || caso.status === 'MORTO') atual.mortes += 1;
        porCausa.set(label, atual);
    }
    return {
        emTratamento: casos.filter((caso) => caso.status === 'EM_TRATAMENTO').length,
        casos12m: ultimos.filter((caso) => caso.kind === 'DOENCA').length,
        mortes12m: mortes,
        mortalidade12m: base > 0 ? Math.round((mortes / base) * 10000) / 100 : 0,
        porCausa: [...porCausa.values()].sort((a, b) => b.casos - a.casos),
    };
}

// ── Temperatura ───────────────────────────────────────────────────────────────

export function faixaDoProduto(product) {
    const min = Number.isFinite(product?.storageMinTemp) ? product.storageMinTemp : (product?.refrigerated ? 2 : null);
    const max = Number.isFinite(product?.storageMaxTemp) ? product.storageMaxTemp : (product?.refrigerated ? 8 : null);
    return min === null && max === null ? null : { min, max };
}

export function avaliarTemperatura(product, tempC) {
    const faixa = faixaDoProduto(product);
    if (!faixa) return { bloqueio: null, aviso: null };
    const texto = `${faixa.min ?? '—'} a ${faixa.max ?? '—'} °C`;
    if (tempC === null || tempC === undefined || tempC === '' || !Number.isFinite(Number(tempC))) {
        return { bloqueio: null, aviso: `Produto deve ficar entre ${texto}. Informe a temperatura da caixa térmica.` };
    }
    const t = Number(tempC);
    if ((faixa.min !== null && t < faixa.min) || (faixa.max !== null && t > faixa.max)) {
        return { bloqueio: `Caixa térmica a ${t} °C, fora da faixa do produto (${texto}). Não aplique: a vacina pode ter perdido o efeito.`, aviso: null };
    }
    return { bloqueio: null, aviso: null };
}

// Última leitura de cada local de armazenamento.
export function situacaoTemperaturas({ hoje = new Date(), leituras, temRefrigerado }) {
    const ultimaPorLocal = new Map();
    for (const leitura of leituras) {
        const atual = ultimaPorLocal.get(leitura.location);
        if (!atual || new Date(leitura.measuredAt) > new Date(atual.measuredAt)) ultimaPorLocal.set(leitura.location, leitura);
    }
    const locais = [...ultimaPorLocal.values()].map((leitura) => {
        const t = Number(leitura.tempC);
        const fora = t < 2 || t > 8;
        const dias = Math.floor((new Date(hoje).getTime() - new Date(leitura.measuredAt).getTime()) / DAY_MS);
        return { location: leitura.location, tempC: t, measuredAt: leitura.measuredAt, foraDaFaixa: fora, diasSemLeitura: dias };
    });
    const alertas = [];
    for (const local of locais) {
        if (local.foraDaFaixa) alertas.push({ tipo: 'FORA_DA_FAIXA', location: local.location, texto: `${local.location}: última leitura ${local.tempC} °C (faixa 2 a 8 °C).` });
        else if (temRefrigerado && local.diasSemLeitura >= 7) alertas.push({ tipo: 'SEM_LEITURA', location: local.location, texto: `${local.location}: sem leitura há ${local.diasSemLeitura} dias.` });
    }
    if (temRefrigerado && !locais.length) alertas.push({ tipo: 'SEM_LEITURA', location: null, texto: 'Há vacinas em estoque e nenhuma leitura de temperatura registrada.' });
    return { locais, alertas };
}
