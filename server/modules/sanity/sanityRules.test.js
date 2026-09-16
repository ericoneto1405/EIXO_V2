import test from 'node:test';
import assert from 'node:assert/strict';
import {
    idadeEmDias, marcacoesDoProduto, calcularCarencia, validarLote, validarAnimal,
    extrairDosePorPeso, calcularDose, calcularConsumo, montarPrevia,
} from './sanityRules.js';

const HOJE = '2026-09-16T12:00:00.000Z';
const nascidoHa = (dias) => new Date(new Date(HOJE).getTime() - dias * 86400000);
const B19 = new Set(['BRUCELOSE_B19']);
const RB51 = new Set(['BRUCELOSE_RB51']);

test('idadeEmDias', () => {
    assert.equal(idadeEmDias(nascidoHa(100), HOJE), 100);
    assert.equal(idadeEmDias(null, HOJE), null);
});

test('marcações: lista EIXO e produto cadastrado à mão', () => {
    assert.ok(marcacoesDoProduto({ category: 'VACINA', name: 'Abor-Vac' }, { tags: ['BRUCELOSE_B19'] }).has('BRUCELOSE_B19'));
    assert.ok(marcacoesDoProduto({ category: 'VACINA', name: 'Vacina brucelose B-19' }, null).has('BRUCELOSE_B19'));
    const rb = marcacoesDoProduto({ category: 'VACINA', name: 'Vacina RB51' }, null);
    assert.ok(rb.has('BRUCELOSE_RB51') && !rb.has('BRUCELOSE_B19'));
    assert.equal(marcacoesDoProduto({ category: 'VACINA', name: 'Raivacel' }, null).size, 0);
    assert.equal(marcacoesDoProduto({ category: 'OUTRO_SANITARIO', name: 'Antígeno brucelose' }, null).size, 0);
});

test('B19: bloqueia macho, sexo vazio, fora da idade e sem nascimento', () => {
    const ok = validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(120) }, tags: B19, appliedAt: HOJE });
    assert.deepEqual(ok.bloqueios, []);
    assert.equal(validarAnimal({ animal: { status: 'VIVO', sexo: 'MACHO', dataNascimento: nascidoHa(120) }, tags: B19, appliedAt: HOJE }).bloqueios.length, 1);
    assert.equal(validarAnimal({ animal: { status: 'VIVO', sexo: null, dataNascimento: nascidoHa(120) }, tags: B19, appliedAt: HOJE }).bloqueios.length, 1);
    assert.equal(validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(60) }, tags: B19, appliedAt: HOJE }).bloqueios.length, 1);
    assert.equal(validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(300) }, tags: B19, appliedAt: HOJE }).bloqueios.length, 1);
    assert.equal(validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: null }, tags: B19, appliedAt: HOJE }).bloqueios.length, 1);
    assert.deepEqual(validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(90) }, tags: B19, appliedAt: HOJE }).bloqueios, []);
    assert.deepEqual(validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(240) }, tags: B19, appliedAt: HOJE }).bloqueios, []);
});

test('B19: data estimada só avisa', () => {
    const r = validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(120), dataNascimentoEstimada: true }, tags: B19, appliedAt: HOJE });
    assert.deepEqual(r.bloqueios, []);
    assert.equal(r.avisos.length, 1);
});

test('RB51: só fêmea acima de 8 meses', () => {
    assert.deepEqual(validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(400) }, tags: RB51, appliedAt: HOJE }).bloqueios, []);
    assert.equal(validarAnimal({ animal: { status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(150) }, tags: RB51, appliedAt: HOJE }).bloqueios.length, 1);
    assert.equal(validarAnimal({ animal: { status: 'VIVO', sexo: 'MACHO', dataNascimento: nascidoHa(400) }, tags: RB51, appliedAt: HOJE }).bloqueios.length, 1);
});

test('animal vendido ou morto é bloqueado; produto comum não olha sexo', () => {
    assert.equal(validarAnimal({ animal: { status: 'VENDIDO', sexo: 'MACHO' }, tags: new Set(), appliedAt: HOJE }).bloqueios.length, 1);
    assert.deepEqual(validarAnimal({ animal: { status: 'VIVO', sexo: 'MACHO' }, tags: new Set(), appliedAt: HOJE }).bloqueios, []);
});

test('carência: com dias, vacina sem dias e remédio sem dias', () => {
    const c = calcularCarencia(HOJE, { slaughterWithdrawalDays: 35, category: 'ANTIPARASITARIO' });
    assert.equal(c.ate.toISOString().slice(0, 10), '2026-10-21');
    assert.equal(c.desconhecida, false);
    assert.equal(calcularCarencia(HOJE, { slaughterWithdrawalDays: 0 }).ate.toISOString(), HOJE);
    assert.equal(calcularCarencia(HOJE, { slaughterWithdrawalDays: null, category: 'VACINA' }).desconhecida, false);
    assert.equal(calcularCarencia(HOJE, { slaughterWithdrawalDays: null, category: 'ANTIBIOTICO' }).desconhecida, true);
});

test('lote vencido bloqueia; vence hoje ainda vale; sem validade avisa', () => {
    assert.equal(validarLote({ lotNumber: 'A1', expiresAt: '2026-09-15T12:00:00.000Z' }, HOJE).bloqueios.length, 1);
    assert.deepEqual(validarLote({ lotNumber: 'A1', expiresAt: '2026-09-16T12:00:00.000Z' }, HOJE).bloqueios, []);
    assert.equal(validarLote({ lotNumber: 'A1', expiresAt: null }, HOJE).avisos.length, 1);
    assert.equal(validarLote(null, HOJE).bloqueios.length, 1);
});

test('dose por peso: leitura da bula e cálculo', () => {
    assert.equal(extrairDosePorPeso('1 mL / 50 kg'), 0.02);
    assert.equal(extrairDosePorPeso('2,5 mL / 100 kg'), 0.025);
    assert.equal(extrairDosePorPeso('2 mL, dose única'), null);
    assert.deepEqual(calcularDose({ modo: 'POR_PESO', dosePorKg: 0.02, peso: 430 }), { dose: 8.6 });
    assert.ok(calcularDose({ modo: 'POR_PESO', dosePorKg: 0.02, peso: null }).erro);
    assert.deepEqual(calcularDose({ modo: 'FIXA', doseFixa: 2 }), { dose: 2 });
    assert.ok(calcularDose({ modo: 'FIXA', doseFixa: 0 }).erro);
});

test('consumo de estoque', () => {
    assert.deepEqual(calcularConsumo({ doseTotal: 250, applicationPerUnit: 500, unit: 'frasco', applicationUnit: 'ml' }), { unidades: 0.5 });
    assert.deepEqual(calcularConsumo({ doseTotal: 30, unit: 'dose', applicationUnit: 'dose' }), { unidades: 30 });
    assert.ok(calcularConsumo({ doseTotal: 30, applicationPerUnit: null, unit: 'frasco', applicationUnit: 'ml' }).erro);
});

test('prévia: separa aptos, soma dose, custo e estoque', () => {
    const product = { name: 'Abor-Vac', category: 'VACINA', unit: 'dose', applicationUnit: 'dose', slaughterWithdrawalDays: null };
    const batch = { lotNumber: 'L1', expiresAt: '2027-01-01T00:00:00.000Z', quantity: 10, unitCost: 3 };
    const animais = [
        { id: 'a', brinco: '1', status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(120) },
        { id: 'b', brinco: '2', status: 'VIVO', sexo: 'MACHO', dataNascimento: nascidoHa(120) },
        { id: 'c', brinco: '3', status: 'VIVO', sexo: 'FEMEA', dataNascimento: nascidoHa(150) },
    ];
    const p = montarPrevia({ animais, product, catalogItem: { tags: ['BRUCELOSE_B19'] }, batch, appliedAt: HOJE, doseModo: 'FIXA', doseFixa: 1 });
    assert.equal(p.resumo.aptos, 2);
    assert.equal(p.resumo.bloqueados, 1);
    assert.equal(p.resumo.consumoEstoque, 2);
    assert.equal(p.resumo.custoTotal, 6);
    assert.deepEqual(p.bloqueiosGerais, []);
    assert.equal(p.avisosGerais.length, 2);
    assert.ok(p.avisosGerais.some((aviso) => /até 2 horas/.test(aviso)));
});

test('prévia: estoque insuficiente e lote vencido bloqueiam tudo', () => {
    const product = { name: 'Ivomec Gold', category: 'ANTIPARASITARIO', unit: 'frasco', applicationUnit: 'ml', applicationPerUnit: 50, slaughterWithdrawalDays: 122 };
    const batch = { lotNumber: 'X', expiresAt: '2026-01-01T00:00:00.000Z', quantity: 1, unitCost: 100 };
    const animais = Array.from({ length: 10 }, (_, i) => ({ id: String(i), brinco: String(i), status: 'VIVO', sexo: 'MACHO', pesoAtual: 400 }));
    const p = montarPrevia({ animais, product, catalogItem: null, batch, appliedAt: HOJE, doseModo: 'POR_PESO', dosePorKg: 0.02 });
    assert.equal(p.resumo.doseTotal, 80);
    assert.equal(p.resumo.consumoEstoque, 1.6);
    assert.equal(p.bloqueiosGerais.length, 2);
});


test('prévia: caixa térmica fora da faixa bloqueia vacina refrigerada', () => {
    const product = { name: 'Raivacel', category: 'VACINA', unit: 'dose', applicationUnit: 'dose', refrigerated: true, slaughterWithdrawalDays: null };
    const batch = { lotNumber: 'R1', expiresAt: '2027-01-01T00:00:00.000Z', quantity: 10, unitCost: 1 };
    const animais = [{ id: 'a', brinco: '1', status: 'VIVO', sexo: 'MACHO' }];
    const quente = montarPrevia({ animais, product, catalogItem: null, batch, appliedAt: HOJE, doseModo: 'FIXA', doseFixa: 1, coolerTempC: 14 });
    assert.equal(quente.bloqueiosGerais.length, 1);
    const ok = montarPrevia({ animais, product, catalogItem: null, batch, appliedAt: HOJE, doseModo: 'FIXA', doseFixa: 1, coolerTempC: 6 });
    assert.deepEqual(ok.bloqueiosGerais, []);
});
