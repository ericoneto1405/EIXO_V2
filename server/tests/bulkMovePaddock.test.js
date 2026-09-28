import test from 'node:test';
import assert from 'node:assert/strict';
import { moveAnimalsBetweenPaddocks } from '../modules/animals/animalRoutes.js';

const createDatabase = ({ animals, paddock = { id: 'pasto-2', name: 'Pasto 2' }, openMoves = [] }) => {
    const calls = {
        paddockWhere: null,
        openMoveWhere: null,
        updatedMoveWhere: null,
        createdMoves: [],
        updatedAnimalsWhere: null,
        transactions: 0,
    };
    const tx = {
        paddockMove: {
            updateMany: async ({ where }) => { calls.updatedMoveWhere = where; },
            createMany: async ({ data }) => { calls.createdMoves = data; },
        },
        animal: {
            updateMany: async ({ where }) => {
                calls.updatedAnimalsWhere = where;
                return { count: where.id.in.length };
            },
        },
    };
    const database = {
        animal: {
            findMany: async () => animals,
        },
        paddock: {
            findFirst: async ({ where }) => {
                calls.paddockWhere = where;
                return paddock;
            },
        },
        paddockMove: {
            findMany: async ({ where }) => {
                calls.openMoveWhere = where;
                return openMoves;
            },
        },
        $transaction: async (callback) => {
            calls.transactions += 1;
            return callback(tx);
        },
    };
    return { database, calls };
};

const activeAnimal = (id, currentPaddockId = null) => ({
    id,
    farmId: 'fazenda-teste',
    brinco: id,
    currentPaddockId,
    status: 'VIVO',
});

test('movimentação em lote recusa toda a seleção quando houver vendido ou morto', async () => {
    const { database, calls } = createDatabase({
        animals: [
            activeAnimal('animal-vivo'),
            { ...activeAnimal('animal-vendido'), status: 'VENDIDO' },
        ],
    });

    const response = await moveAnimalsBetweenPaddocks({
        ids: ['animal-vivo', 'animal-vendido'],
        paddockId: 'pasto-2',
        scopeFilter: { organizationId: 'org-1' },
        database,
    });

    assert.equal(response.error.status, 409);
    assert.match(response.error.message, /vendidos ou mortos/);
    assert.equal(calls.transactions, 0);
    assert.equal(calls.paddockWhere, null);
});

test('movimentação em lote exige pasto ativo da mesma fazenda', async () => {
    const { database, calls } = createDatabase({
        animals: [activeAnimal('animal-1')],
        paddock: null,
    });

    const response = await moveAnimalsBetweenPaddocks({
        ids: ['animal-1'],
        paddockId: 'pasto-inativo',
        scopeFilter: { organizationId: 'org-1' },
        database,
    });

    assert.equal(response.error.status, 400);
    assert.match(response.error.message, /pasto ativo/);
    assert.equal(calls.paddockWhere.active, true);
    assert.equal(calls.paddockWhere.farmId, 'fazenda-teste');
    assert.equal(calls.transactions, 0);
});

test('animais que já estão no destino ficam parados e os demais movem em uma transação', async () => {
    const { database, calls } = createDatabase({
        animals: [activeAnimal('animal-parado', 'pasto-2'), activeAnimal('animal-movido', null)],
    });

    const response = await moveAnimalsBetweenPaddocks({
        ids: ['animal-parado', 'animal-movido'],
        paddockId: 'pasto-2',
        scopeFilter: { organizationId: 'org-1' },
        database,
    });

    assert.deepEqual(response.result, {
        updated: 1,
        unchanged: 1,
        paddockId: 'pasto-2',
        paddockName: 'Pasto 2',
    });
    assert.equal(calls.transactions, 1);
    assert.deepEqual(calls.openMoveWhere.animalId.in, ['animal-movido']);
    assert.deepEqual(calls.updatedMoveWhere.animalId.in, ['animal-movido']);
    assert.deepEqual(calls.createdMoves.map((move) => move.animalId), ['animal-movido']);
    assert.deepEqual(calls.updatedAnimalsWhere.id.in, ['animal-movido']);
    assert.equal(calls.updatedAnimalsWhere.status, 'VIVO');
});

test('lote inteiro já no destino retorna sucesso sem criar movimento vazio', async () => {
    const { database, calls } = createDatabase({
        animals: [activeAnimal('animal-1', 'pasto-2'), activeAnimal('animal-2', 'pasto-2')],
    });

    const response = await moveAnimalsBetweenPaddocks({
        ids: ['animal-1', 'animal-2'],
        paddockId: 'pasto-2',
        scopeFilter: { organizationId: 'org-1' },
        database,
    });

    assert.deepEqual(response.result, {
        updated: 0,
        unchanged: 2,
        paddockId: 'pasto-2',
        paddockName: 'Pasto 2',
    });
    assert.equal(calls.transactions, 0);
    assert.equal(calls.createdMoves.length, 0);
});
