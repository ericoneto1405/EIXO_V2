import test from 'node:test';
import assert from 'node:assert/strict';
import { PHARMACY_CATALOG, findCatalogItem } from './pharmacyCatalog.js';

const CATEGORIES = new Set(['VACINA', 'VERMIFUGO', 'ANTIBIOTICO', 'ANTIPARASITARIO', 'ANTI_INFLAMATORIO', 'VITAMINA_MINERAL', 'HORMONIO_REPRODUCAO', 'DESINFETANTE', 'MATERIAL_VETERINARIO', 'OUTRO_SANITARIO']);
const isDays = (value) => value === null || (Number.isInteger(value) && value >= 0);

test('lista EIXO: todo item tem marca, laboratório, fonte e data de conferência', () => {
    for (const item of PHARMACY_CATALOG) {
        assert.ok(item.key && item.brand && item.laboratory, item.key);
        assert.ok(CATEGORIES.has(item.category), `${item.key}: categoria`);
        assert.ok(item.source, `${item.key}: fonte`);
        assert.match(item.reviewedAt, /^\d{4}-\d{2}-\d{2}$/, `${item.key}: data`);
        assert.ok(isDays(item.slaughterWithdrawalDays), `${item.key}: carência abate`);
        assert.ok(isDays(item.milkWithdrawalDays), `${item.key}: carência leite`);
    }
});

test('lista EIXO: chaves únicas e marca+laboratório sem repetição', () => {
    const keys = PHARMACY_CATALOG.map((item) => item.key);
    assert.equal(new Set(keys).size, keys.length);
    const pairs = PHARMACY_CATALOG.map((item) => `${item.brand}|${item.laboratory}`.toLowerCase());
    assert.equal(new Set(pairs).size, pairs.length);
});

test('lista EIXO: vacinas de brucelose marcadas para as travas de sexo e idade', () => {
    assert.ok(PHARMACY_CATALOG.some((item) => item.tags?.includes('BRUCELOSE_B19')));
    assert.ok(PHARMACY_CATALOG.some((item) => item.tags?.includes('BRUCELOSE_RB51')));
});

test('findCatalogItem: chave inexistente devolve null', () => {
    assert.equal(findCatalogItem('nao-existe'), null);
    assert.equal(findCatalogItem(''), null);
});
