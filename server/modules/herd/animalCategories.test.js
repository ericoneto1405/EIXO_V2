import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CATEGORIAS_ANIMAL,
  normalizarCategoria,
  normalizarCategoriaParaGravar,
  idadeEmMeses,
  derivarCategoria,
  resolverCategoria,
} from './animalCategories.js';

// Data fixa para os testes não dependerem do dia em que rodam.
const AGORA = new Date('2026-08-23T12:00:00Z');
const mesesAtras = (n) => new Date(AGORA.getTime() - n * 30.4375 * 86400000);

// Este é o teste que impede as listas de divergirem de novo. O front não pode
// importar JS do servidor, então a lista está duplicada em TypeScript — aqui a
// gente lê o arquivo do front e compara item a item.
test('a lista do front é idêntica à do servidor', () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const caminhoTs = resolve(aqui, '../../../frontend/constants/animalCategories.ts');
  const fonte = readFileSync(caminhoTs, 'utf8');

  const bloco = fonte.match(/export const CATEGORIAS_ANIMAL = \[([\s\S]*?)\]/);
  assert.ok(bloco, 'não achei CATEGORIAS_ANIMAL em frontend/constants/animalCategories.ts');

  const doFront = [...bloco[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    doFront,
    CATEGORIAS_ANIMAL,
    'As listas divergiram. Alinhe frontend/constants/animalCategories.ts com server/modules/herd/animalCategories.js.',
  );
});

test('normalizarCategoria aceita acento, caixa e grafias antigas', () => {
  assert.equal(normalizarCategoria('bezerro'), 'Bezerro');
  assert.equal(normalizarCategoria('  NOVILHA  '), 'Novilha');
  assert.equal(normalizarCategoria('Bezerro(a)'), 'Bezerro');
  assert.equal(normalizarCategoria('boi gordo'), 'Boi');
  assert.equal(normalizarCategoria('matriz'), 'Reprodutora');
  assert.equal(normalizarCategoria('vaca de descarte'), 'Vaca de descarte');
  assert.equal(normalizarCategoria('coisa que não existe'), null);
  assert.equal(normalizarCategoria(''), null);
  assert.equal(normalizarCategoria(null), null);
});

test('a lista canônica cobre os valores que as três telas antigas usavam', () => {
  const antigos = [
    'Bezerro', 'Bezerra', 'Novilho', 'Novilha', 'Garrote', 'Garrota',
    'Boi', 'Vaca', 'Vaca de cria', 'Vaca seca', 'Vaca de descarte',
    'Touro', 'Reprodutora', 'Bezerro(a)',
  ];
  antigos.forEach((valor) => {
    assert.ok(normalizarCategoria(valor), `"${valor}" deveria ser reconhecido`);
  });
  assert.equal(new Set(CATEGORIAS_ANIMAL).size, CATEGORIAS_ANIMAL.length, 'sem duplicados');
});

test('idadeEmMeses conta meses cheios e rejeita data futura', () => {
  assert.equal(idadeEmMeses(mesesAtras(18), AGORA), 18);
  assert.equal(idadeEmMeses(null, AGORA), null);
  assert.equal(idadeEmMeses(new Date('2027-01-01'), AGORA), null);
});

test('macho: bezerro, novilho e boi pela idade', () => {
  // Corte em 36 meses: tradicional (4 a 6 dentes), que atende a maioria que
  // termina a pasto. Confinamento abate com 20-24 e ajusta a faixa.
  const d = (meses) => derivarCategoria({ sexo: 'MACHO', dataNascimento: mesesAtras(meses), agora: AGORA });
  assert.equal(d(3), 'Bezerro');
  assert.equal(d(7), 'Bezerro');
  assert.equal(d(9), 'Novilho');
  assert.equal(d(29), 'Novilho');
  assert.equal(d(35), 'Novilho');
  assert.equal(d(37), 'Boi');
  assert.equal(d(60), 'Boi');
});

test('fêmea NUNCA vira vaca só por envelhecer', () => {
  // Vaca é fêmea que pariu — evento, não idade. A média nacional de idade ao
  // primeiro parto (40-48 meses) mede manejo ruim, não biologia: usá-la como
  // régua rebatizaria novilha de vaca em massa, na direção errada.
  const d = (meses) => derivarCategoria({ sexo: 'FEMEA', dataNascimento: mesesAtras(meses), agora: AGORA });
  assert.equal(d(3), 'Bezerra');
  assert.equal(d(9), 'Novilha');
  assert.equal(d(35), 'Novilha');
  assert.equal(d(37), 'Novilha');
  assert.equal(d(60), 'Novilha');
  assert.equal(d(120), 'Novilha', 'nem com 10 anos');
});

test('fêmea que já pariu é vaca mesmo sendo nova', () => {
  const cat = derivarCategoria({
    sexo: 'FEMEA', dataNascimento: mesesAtras(26), jaPariu: true, agora: AGORA,
  });
  assert.equal(cat, 'Vaca');
});

test('desmama registrada tira o animal de bezerro mesmo sem data de nascimento', () => {
  assert.equal(derivarCategoria({ sexo: 'MACHO', desmamadoEm: mesesAtras(2), agora: AGORA }), 'Novilho');
  assert.equal(derivarCategoria({ sexo: 'FEMEA', desmamadoEm: mesesAtras(2), agora: AGORA }), 'Novilha');
});

test('sem idade e sem desmama não inventa categoria', () => {
  assert.equal(derivarCategoria({ sexo: 'MACHO', agora: AGORA }), null);
  assert.equal(derivarCategoria({ sexo: 'FEMEA', agora: AGORA }), null);
});

test('sexo ausente ou inválido não deduz nada', () => {
  assert.equal(derivarCategoria({ sexo: null, dataNascimento: mesesAtras(40), agora: AGORA }), null);
  assert.equal(derivarCategoria({ sexo: 'X', dataNascimento: mesesAtras(40), agora: AGORA }), null);
});

test('Touro e Reprodutora nunca saem da idade, só da função declarada', () => {
  // Macho velho continua Boi — não vira Touro sozinho.
  assert.equal(
    derivarCategoria({ sexo: 'MACHO', dataNascimento: mesesAtras(72), agora: AGORA }),
    'Boi',
  );
  assert.equal(
    derivarCategoria({ sexo: 'MACHO', dataNascimento: mesesAtras(72), funcaoReprodutiva: 'Touro de monta', agora: AGORA }),
    'Touro',
  );
  assert.equal(
    derivarCategoria({ sexo: 'FEMEA', dataNascimento: mesesAtras(72), funcaoReprodutiva: 'matriz', agora: AGORA }),
    'Reprodutora',
  );
});

test('resolverCategoria lê o jaPariu que a rota enriqueceu', () => {
  const animal = { sexo: 'FEMEA', dataNascimento: mesesAtras(30), categoria: null, jaPariu: true };
  assert.deepEqual(resolverCategoria(animal, { agora: AGORA }), { categoria: 'Vaca', automatica: true });
});

test('resolverCategoria: o que o produtor escolheu sempre ganha da dedução', () => {
  const animal = { sexo: 'MACHO', dataNascimento: mesesAtras(60), categoria: 'Novilho' };
  assert.deepEqual(resolverCategoria(animal, { agora: AGORA }), { categoria: 'Novilho', automatica: false });
});

test('resolverCategoria: deduz quando está vazio e marca como automática', () => {
  const animal = { sexo: 'MACHO', dataNascimento: mesesAtras(60), categoria: null };
  assert.deepEqual(resolverCategoria(animal, { agora: AGORA }), { categoria: 'Boi', automatica: true });
});

test('resolverCategoria: texto desconhecido é preservado, não apagado', () => {
  const animal = { sexo: 'MACHO', dataNascimento: mesesAtras(60), categoria: 'Boi magro' };
  assert.deepEqual(resolverCategoria(animal, { agora: AGORA }), { categoria: 'Boi magro', automatica: false });
});

test('resolverCategoria: sem base devolve null sem quebrar', () => {
  assert.deepEqual(resolverCategoria({ sexo: 'MACHO' }, { agora: AGORA }), { categoria: null, automatica: false });
  assert.deepEqual(resolverCategoria({}, { agora: AGORA }), { categoria: null, automatica: false });
  assert.deepEqual(resolverCategoria(null, { agora: AGORA }), { categoria: null, automatica: false });
});

// ─── Casos que a revisão adversarial pegou ────────────────────────────────────

test('gravar NÃO apaga categoria que não está na lista', () => {
  assert.equal(normalizarCategoriaParaGravar('Doadora'), 'Doadora');
  assert.equal(normalizarCategoriaParaGravar('Receptora'), 'Receptora');
  assert.equal(normalizarCategoriaParaGravar('Boi magro'), 'Boi magro');
  // reconhecidas continuam sendo normalizadas
  assert.equal(normalizarCategoriaParaGravar('bezerro'), 'Bezerro');
  assert.equal(normalizarCategoriaParaGravar('Bezerro(a)'), 'Bezerro');
  // vazio continua virando null: é como o produtor volta para a dedução
  assert.equal(normalizarCategoriaParaGravar(''), null);
  assert.equal(normalizarCategoriaParaGravar('   '), null);
  assert.equal(normalizarCategoriaParaGravar(null), null);
});

test('desmama registrada vence a idade', () => {
  // desmama precoce aos 4 meses: não pode continuar como bezerro
  const macho = derivarCategoria({ sexo: 'MACHO', dataNascimento: mesesAtras(4), desmamadoEm: mesesAtras(1), agora: AGORA });
  const femea = derivarCategoria({ sexo: 'FEMEA', dataNascimento: mesesAtras(4), desmamadoEm: mesesAtras(1), agora: AGORA });
  assert.equal(macho, 'Novilho');
  assert.equal(femea, 'Novilha');
});

test('status reprodutivo diz se a fêmea está no rebanho de cria', () => {
  const d = (status, meses = 40) => derivarCategoria({
    sexo: 'FEMEA', dataNascimento: mesesAtras(meses), statusReprodutivo: status, agora: AGORA,
  });
  assert.equal(d('RECRIA'), 'Novilha', 'RECRIA declara que ainda não entrou em reprodução');
  assert.equal(d('PRENHE'), 'Vaca');
  assert.equal(d('VAZIA'), 'Vaca');
  assert.equal(d('CICLANDO'), 'Vaca');
  // e o parto registrado ganha do status, inclusive numa fêmea nova
  assert.equal(
    derivarCategoria({ sexo: 'FEMEA', dataNascimento: mesesAtras(26), jaPariu: true, statusReprodutivo: 'RECRIA', agora: AGORA }),
    'Vaca',
  );
});

test('novilha apta pelo peso continua novilha — peso não é parto', () => {
  // 350 kg aos 20 meses: está apta a reproduzir, mas não pariu. O peso vira
  // alerta operacional em outro lugar, não categoria.
  const cat = derivarCategoria({ sexo: 'FEMEA', dataNascimento: mesesAtras(20), agora: AGORA });
  assert.equal(cat, 'Novilha');
});

test('Plantel P.O.: com deduzir=false não inventa categoria nenhuma', () => {
  // touro de 8 anos sem categoria não pode aparecer como "Boi" numa central
  const touro = { sexo: 'MACHO', dataNascimento: mesesAtras(96), categoria: null };
  assert.deepEqual(resolverCategoria(touro, { deduzir: false, agora: AGORA }), { categoria: null, automatica: false });
  // mas o que o produtor gravou continua aparecendo
  assert.deepEqual(
    resolverCategoria({ ...touro, categoria: 'Doadora' }, { deduzir: false, agora: AGORA }),
    { categoria: 'Doadora', automatica: false },
  );
});
