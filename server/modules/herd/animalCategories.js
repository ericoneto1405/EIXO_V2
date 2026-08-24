// =============================================
// CATEGORIAS DO ANIMAL — fonte única do sistema
//
// Antes existiam três listas divergentes: a importação aceitava 8 valores, o
// formulário de cadastro oferecia 12 (5 deles rejeitados em silêncio pela
// importação) e a tela de peso-alvo usava outros 6, com grafias próprias como
// "Bezerro(a)". Este arquivo passa a ser a única lista válida; servidor e tela
// devem sempre partir daqui.
// =============================================

/** Lista canônica, na ordem em que faz sentido para o pecuarista. */
export const CATEGORIAS_ANIMAL = [
  'Bezerro',
  'Bezerra',
  'Garrote',
  'Garrota',
  'Novilho',
  'Novilha',
  'Boi',
  'Vaca',
  'Vaca de cria',
  'Vaca seca',
  'Vaca de descarte',
  'Touro',
  'Reprodutora',
];

/** Grafias antigas ou regionais que devem cair numa categoria canônica. */
const ALIASES_CATEGORIA = {
  'bezerro(a)': 'Bezerro',
  'bezerroa': 'Bezerro',
  'bezerro/bezerra': 'Bezerro',
  'garrote(a)': 'Garrote',
  'novilho(a)': 'Novilho',
  'vaca de cria/matriz': 'Vaca de cria',
  'matriz': 'Reprodutora',
  'reprodutor': 'Touro',
  'boi gordo': 'Boi',
  'novilha prenhe': 'Novilha',
};

function chave(valor) {
  return String(valor || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Devolve a categoria canônica correspondente ao texto, ou null se não
 * reconhecer. Aceita acento, caixa alta/baixa e as grafias antigas.
 */
export function normalizarCategoria(valor) {
  const k = chave(valor);
  if (!k) return null;
  const direta = CATEGORIAS_ANIMAL.find((opcao) => chave(opcao) === k);
  if (direta) return direta;
  return ALIASES_CATEGORIA[k] || null;
}

/**
 * Versão para GRAVAR. Igual à de cima, mas quando o texto não é reconhecido ele
 * é preservado como veio em vez de virar null.
 *
 * Existe porque a leitura (resolverCategoria) preserva texto desconhecido: se a
 * escrita apagasse, abrir um animal com categoria antiga ("Doadora", "Receptora",
 * "Boi magro") e salvar qualquer outro campo destruiria o dado em silêncio.
 * Vazio continua virando null de propósito — é assim que o produtor devolve o
 * animal para a dedução automática.
 */
export function normalizarCategoriaParaGravar(valor) {
  const canonica = normalizarCategoria(valor);
  if (canonica) return canonica;
  const bruto = String(valor ?? '').trim();
  return bruto || null;
}

/** Idade em meses cheios. Devolve null quando não há data de nascimento. */
export function idadeEmMeses(dataNascimento, agora = new Date()) {
  if (!dataNascimento) return null;
  const nascimento = dataNascimento instanceof Date ? dataNascimento : new Date(dataNascimento);
  if (Number.isNaN(nascimento.getTime())) return null;
  const diff = agora.getTime() - nascimento.getTime();
  if (diff < 0) return null;
  // 30,4375 dias/mês = média do ano civil (365,25 / 12).
  return Math.floor(diff / (30.4375 * 86400000));
}

// -------- Faixas usadas na dedução (ajuste aqui se mudar o entendimento) -----
//
// DESMAMA_MESES  — até a desmama o animal é bezerro. Quando existe `desmamadoEm`
//                  no cadastro, o evento real vale mais que a idade.
// BOI_MESES      — macho vira boi. 36 meses é o corte tradicional (4 a 6 dentes)
//                  e atende a maioria, que termina a pasto. O confinamento abate
//                  com 20–24 meses; quem trabalha assim baixa esse número.
//
// NÃO existe faixa de idade para Vaca — e é de propósito. Ver derivarCategoria.
export const FAIXAS_CATEGORIA = {
  DESMAMA_MESES: 8,
  BOI_MESES: 36,
};

// Status que indicam fêmea já dentro do rebanho de cria. RECRIA é o oposto:
// declara explicitamente que ela ainda não entrou em reprodução.
const STATUS_DE_MATRIZ = ['prenhe', 'vazia', 'ciclando'];

function declaraReproducao(funcaoReprodutiva) {
  const k = chave(funcaoReprodutiva);
  if (!k) return false;
  return k.includes('touro') || k.includes('reprodut') || k.includes('matriz');
}

/**
 * Deduz a categoria a partir do que o sistema sabe do animal.
 *
 * Regra de ouro: NUNCA inventa Touro nem Reprodutora por idade — isso é função
 * atribuída pelo produtor, não fase da vida. Só usa `funcaoReprodutiva` quando
 * o próprio cadastro declara a função.
 *
 * Devolve null quando não há base suficiente. Null é resposta honesta: é melhor
 * mostrar "—" do que chutar uma categoria errada.
 */
export function derivarCategoria({
  sexo,
  dataNascimento = null,
  desmamadoEm = null,
  jaPariu = null,
  statusReprodutivo = null,
  funcaoReprodutiva = null,
  agora = new Date(),
} = {}) {
  const s = chave(sexo);
  const macho = s === 'macho' || s === 'm';
  const femea = s === 'femea' || s === 'f';
  if (!macho && !femea) return null;

  if (declaraReproducao(funcaoReprodutiva)) {
    return macho ? 'Touro' : 'Reprodutora';
  }

  const meses = idadeEmMeses(dataNascimento, agora);
  // A desmama registrada vence a idade: quem desmamou aos 5 meses já não é
  // bezerro, mesmo sem ter completado a faixa etária padrão.
  const desmamado = Boolean(desmamadoEm);
  const bezerro = !desmamado && meses !== null && meses < FAIXAS_CATEGORIA.DESMAMA_MESES;

  if (macho) {
    if (bezerro) return 'Bezerro';
    if (meses === null) return desmamado ? 'Novilho' : null;
    if (meses < FAIXAS_CATEGORIA.BOI_MESES) return 'Novilho';
    return 'Boi';
  }

  if (bezerro) return 'Bezerra';

  // FÊMEA NUNCA VIRA VACA POR IDADE. Vaca é fêmea que pariu — é evento, não
  // fase da vida. A tentação é usar a idade ao primeiro parto como régua, mas:
  //   · a média nacional (40 a 48 meses) reflete novilha subnutrida esperando
  //     peso, não a biologia — calibrar por ela seria embutir manejo ruim;
  //   · o gatilho real da puberdade é PESO (novilha Nelore entra em torno de
  //     300 a 320 kg, ~60-65% do peso adulto), e peso responde "está apta a
  //     reproduzir", que não é a mesma pergunta que "já pariu".
  // Então só o que o sistema SABE conta. Na dúvida ela fica Novilha, e o
  // produtor promove as que quiser — errar para menos é recuperável.
  if (jaPariu === true) return 'Vaca';

  const status = chave(statusReprodutivo);
  if (status === 'recria') return 'Novilha';
  if (STATUS_DE_MATRIZ.includes(status)) return 'Vaca';

  if (meses === null) return desmamado ? 'Novilha' : null;
  return 'Novilha';
}

/**
 * Resolve a categoria que deve aparecer na tela.
 * O que o produtor digitou sempre ganha; a dedução só preenche o vazio.
 * `automatica: true` avisa a interface para mostrar como sugestão do sistema.
 */
export function resolverCategoria(animal, opcoes = {}) {
  const manual = normalizarCategoria(animal?.categoria);
  if (manual) return { categoria: manual, automatica: false };

  // Texto que não bate com nenhuma categoria conhecida: preserva o que o
  // produtor escreveu em vez de apagar, mas não marca como automática.
  const bruto = String(animal?.categoria || '').trim();
  if (bruto) return { categoria: bruto, automatica: false };

  // `deduzir: false` desliga a dedução. Usado pelo Plantel P.O., que tem
  // semântica própria de categoria (Doadora, Receptora, registrationCategory) e
  // não guarda `funcaoReprodutiva` — sem esse campo um touro de 8 anos sem
  // categoria seria deduzido como "Boi", que numa central de genética é grave.
  if (opcoes.deduzir === false) return { categoria: null, automatica: false };

  const deduzida = derivarCategoria({
    sexo: animal?.sexo,
    dataNascimento: animal?.dataNascimento,
    desmamadoEm: animal?.desmamadoEm,
    // "Já pariu" não é coluna do banco: vem enriquecido pela rota que listou os
    // animais (uma consulta em lote por maeId). Onde não vier, o status
    // reprodutivo assume, e na falta dele a fêmea fica Novilha.
    jaPariu: opcoes.jaPariu ?? animal?.jaPariu ?? null,
    statusReprodutivo: animal?.statusReprodutivo,
    funcaoReprodutiva: animal?.funcaoReprodutiva,
    agora: opcoes.agora,
  });
  return { categoria: deduzida, automatica: deduzida !== null };
}
