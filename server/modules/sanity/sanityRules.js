import { avaliarTemperatura } from './sanityStatus.js';

// Regras puras da aplicação sanitária (sem banco). Tudo que bloqueia ou avisa
// no curral passa por aqui, para a tela mostrar o problema ANTES de salvar.

const DAY_MS = 24 * 60 * 60 * 1000;

export const B19_IDADE_MIN_DIAS = 90;   // 3 meses
export const B19_IDADE_MAX_DIAS = 240;  // 8 meses
export const RB51_IDADE_MIN_DIAS = 240; // acima de 8 meses

const BRUCELOSE_B19_REGEX = /\b(b-?19|amostra\s*19|anavac|abor-?vac|anabortina|brucelina)\b/i;
const BRUCELOSE_RB51_REGEX = /\brb-?51\b/i;

export function idadeEmDias(dataNascimento, referencia) {
    if (!dataNascimento || !referencia) return null;
    const nasc = new Date(dataNascimento).getTime();
    const ref = new Date(referencia).getTime();
    if (Number.isNaN(nasc) || Number.isNaN(ref)) return null;
    return Math.floor((ref - nasc) / DAY_MS);
}

// Marcações vêm da lista EIXO; produto cadastrado à mão é reconhecido pelo nome,
// porque vacina de brucelose em macho é erro que não pode passar.
export function marcacoesDoProduto(product, catalogItem) {
    const tags = new Set(catalogItem?.tags || []);
    if (product?.category !== 'VACINA') return tags;
    const texto = `${product?.name || ''} ${product?.activeIngredient || ''}`;
    if (BRUCELOSE_RB51_REGEX.test(texto)) tags.add('BRUCELOSE_RB51');
    else if (BRUCELOSE_B19_REGEX.test(texto) || (/brucel/i.test(texto) && !tags.has('BRUCELOSE_RB51'))) tags.add('BRUCELOSE_B19');
    return tags;
}

export function calcularCarencia(appliedAt, product) {
    const dias = product?.slaughterWithdrawalDays;
    if (Number.isInteger(dias) && dias >= 0) {
        return {
            ate: new Date(new Date(appliedAt).getTime() + dias * DAY_MS),
            dias,
            desconhecida: false,
        };
    }
    // Decisão set/2026: vacina sem carência na bula só avisa; remédio sem carência trava a venda.
    return { ate: null, dias: null, desconhecida: product?.category !== 'VACINA' };
}

export function validarLote(batch, appliedAt) {
    const bloqueios = [];
    const avisos = [];
    if (!batch) {
        bloqueios.push('Escolha o lote do frasco.');
        return { bloqueios, avisos };
    }
    if (batch.expiresAt) {
        const validade = new Date(batch.expiresAt);
        const dia = new Date(appliedAt);
        if (validade.getTime() < new Date(dia.toISOString().slice(0, 10)).getTime()) {
            bloqueios.push(`Lote ${batch.lotNumber} venceu em ${validade.toISOString().slice(0, 10).split('-').reverse().join('/')}.`);
        }
    } else {
        avisos.push(`Lote ${batch.lotNumber} sem validade cadastrada.`);
    }
    return { bloqueios, avisos };
}

export function validarAnimal({ animal, tags, appliedAt }) {
    const bloqueios = [];
    const avisos = [];
    if (animal.status && animal.status !== 'VIVO') {
        bloqueios.push(animal.status === 'VENDIDO' ? 'Animal vendido.' : 'Animal morto.');
    }
    const isB19 = tags.has('BRUCELOSE_B19');
    const isRb51 = tags.has('BRUCELOSE_RB51');
    if (isB19 || isRb51) {
        const vacina = isB19 ? 'B19' : 'RB51';
        if (animal.sexo !== 'FEMEA') {
            bloqueios.push(animal.sexo === 'MACHO'
                ? `Vacina ${vacina} é só para fêmeas.`
                : `Sexo não cadastrado; a vacina ${vacina} é só para fêmeas.`);
        }
        const idade = idadeEmDias(animal.dataNascimento, appliedAt);
        if (idade === null) {
            bloqueios.push('Sem data de nascimento; não dá para conferir a idade da vacina de brucelose.');
        } else {
            if (isB19 && (idade < B19_IDADE_MIN_DIAS || idade > B19_IDADE_MAX_DIAS)) {
                bloqueios.push(`B19 só entre 3 e 8 meses (animal com ${Math.floor(idade / 30)} meses).`);
            }
            if (isRb51 && idade < RB51_IDADE_MIN_DIAS) {
                bloqueios.push(`RB51 é para fêmeas acima de 8 meses; abaixo disso use B19 (animal com ${Math.floor(idade / 30)} meses).`);
            }
            if (animal.dataNascimentoEstimada) avisos.push('Data de nascimento estimada; confira a idade.');
        }
    }
    return { bloqueios, avisos };
}

// Aceita "1 mL / 50 kg", "2,5 mL / 100 kg", "1 mL/40kg".
export function extrairDosePorPeso(texto) {
    const match = String(texto || '').match(/([\d.,]+)\s*m[lL]\s*\/\s*([\d.,]+)\s*kg/);
    if (!match) return null;
    const ml = Number(match[1].replace(',', '.'));
    const kg = Number(match[2].replace(',', '.'));
    if (!(ml > 0) || !(kg > 0)) return null;
    return ml / kg;
}

const arredondar = (valor, casas = 2) => Math.round(valor * 10 ** casas) / 10 ** casas;

export function calcularDose({ modo, doseFixa, dosePorKg, peso }) {
    if (modo === 'POR_PESO') {
        if (!(dosePorKg > 0)) return { erro: 'Informe a dose por kg.' };
        if (!(peso > 0)) return { erro: 'Sem peso cadastrado para calcular a dose.' };
        return { dose: arredondar(dosePorKg * peso) };
    }
    if (!(doseFixa > 0)) return { erro: 'Informe a dose.' };
    return { dose: arredondar(doseFixa) };
}

// Quanto sai do estoque: soma das doses dividida pelo que rende cada unidade.
export function calcularConsumo({ doseTotal, applicationPerUnit, unit, applicationUnit }) {
    const rende = unit && applicationUnit && unit === applicationUnit ? 1 : Number(applicationPerUnit);
    if (!(rende > 0)) return { erro: 'Informe quanto rende cada unidade do produto (ex.: 1 frasco = 500 mL).' };
    return { unidades: arredondar(doseTotal / rende, 4) };
}

export function montarPrevia({ animais, product, catalogItem, batch, appliedAt, doseModo, doseFixa, dosePorKg, applicationPerUnit, coolerTempC = null }) {
    const tags = marcacoesDoProduto(product, catalogItem);
    const lote = validarLote(batch, appliedAt);
    const avisosGerais = [...lote.avisos];
    const bloqueiosGerais = [...lote.bloqueios];
    const temperatura = avaliarTemperatura(product, coolerTempC);
    if (temperatura.bloqueio) bloqueiosGerais.push(temperatura.bloqueio);
    if (temperatura.aviso) avisosGerais.push(temperatura.aviso);
    if (tags.has('BRUCELOSE_B19')) avisosGerais.push('Vacina viva: depois de preparada, use em até 2 horas e descarte a sobra.');
    if (tags.has('BRUCELOSE_RB51')) avisosGerais.push('Vacina viva: depois de preparada, use em até 60 minutos e descarte a sobra.');
    const carencia = calcularCarencia(appliedAt, product);
    if (carencia.ate === null) {
        avisosGerais.push(carencia.desconhecida
            ? 'Produto sem carência cadastrada: os animais ficam travados para venda até a carência ser preenchida na Farmácia.'
            : 'A bula desta vacina não informa carência. Confirme com o veterinário antes de vender para abate.');
    }

    const linhas = animais.map((animal) => {
        const regra = validarAnimal({ animal, tags, appliedAt });
        const dose = calcularDose({ modo: doseModo, doseFixa, dosePorKg, peso: animal.pesoAtual });
        const bloqueios = [...regra.bloqueios];
        if (dose.erro) bloqueios.push(dose.erro);
        return {
            animalId: animal.id,
            brinco: animal.brinco,
            sexo: animal.sexo || null,
            idadeDias: idadeEmDias(animal.dataNascimento, appliedAt),
            peso: animal.pesoAtual ?? null,
            dose: dose.dose ?? null,
            apto: bloqueios.length === 0,
            bloqueios,
            avisos: regra.avisos,
        };
    });

    const aptos = linhas.filter((linha) => linha.apto);
    const doseTotal = arredondar(aptos.reduce((soma, linha) => soma + linha.dose, 0));
    let consumo = null;
    if (aptos.length) {
        const calculo = calcularConsumo({
            doseTotal,
            applicationPerUnit: applicationPerUnit ?? product?.applicationPerUnit,
            unit: product?.unit,
            applicationUnit: product?.applicationUnit,
        });
        if (calculo.erro) bloqueiosGerais.push(calculo.erro);
        else {
            consumo = calculo.unidades;
            if (batch && consumo > Number(batch.quantity || 0) + 1e-9) {
                bloqueiosGerais.push(`Estoque insuficiente no lote ${batch.lotNumber}: precisa de ${consumo} ${product.unit}, tem ${batch.quantity}.`);
            }
        }
    }
    if (!animais.length) bloqueiosGerais.push('Nenhum animal selecionado.');

    const custoTotal = consumo !== null && batch?.unitCost > 0 ? arredondar(consumo * batch.unitCost) : 0;

    return {
        linhas,
        resumo: {
            total: linhas.length,
            aptos: aptos.length,
            bloqueados: linhas.length - aptos.length,
            doseTotal,
            unidadeDose: product?.applicationUnit || 'ml',
            consumoEstoque: consumo,
            unidadeEstoque: product?.unit || null,
            custoTotal,
            carenciaAte: carencia.ate,
            carenciaDias: carencia.dias,
            carenciaDesconhecida: carencia.desconhecida,
        },
        bloqueiosGerais,
        avisosGerais,
    };
}

