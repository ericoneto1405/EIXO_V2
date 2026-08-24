// =============================================
// CATEGORIAS DO ANIMAL — lista única da tela
//
// ⚠️ ESPELHO de server/modules/herd/animalCategories.js
// Mudou lá, muda aqui. Existe um teste no servidor
// (animalCategories.test.js) que quebra se as duas listas divergirem.
//
// Antes havia três listas diferentes espalhadas pelo app: o formulário de
// cadastro tinha 12 valores, a importação aceitava 8 e a tela de peso-alvo
// usava outros 6. O produtor escolhia "Garrote" na tela, importava "Garrote"
// na planilha e o valor era apagado sem aviso.
// =============================================

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
] as const;

export type CategoriaAnimal = (typeof CATEGORIAS_ANIMAL)[number];

/** Categorias oferecidas na configuração de peso-alvo por categoria. */
export const CATEGORIAS_PESO_ALVO: readonly string[] = [
    'Bezerro',
    'Bezerra',
    'Garrote',
    'Garrota',
    'Novilho',
    'Novilha',
    'Boi',
    'Vaca',
    'Touro',
];
