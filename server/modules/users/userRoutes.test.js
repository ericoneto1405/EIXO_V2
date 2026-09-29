import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_PLAN_MODULES } from '../auth/authRoutes.js';
import { normalizeAllowedFarmIds, normalizeManagedUserModules } from './userRoutes.js';

test('novos proprietários recebem permissão para editar animais', () => {
    assert.ok(FREE_PLAN_MODULES.includes('Editar Animais'));
});

test('normaliza módulos ao criar ou atualizar usuário sem lançar erro', () => {
    assert.deepEqual(
        normalizeManagedUserModules(
            [' Rebanho Comercial ', 'Editar Animais', 'Editar Animais'],
            ['user'],
            'WEB',
        ),
        ['Rebanho Comercial', 'Editar Animais'],
    );
});

test('normaliza fazendas específicas e preserva todas as fazendas', () => {
    assert.deepEqual(normalizeAllowedFarmIds([' farm-1 ', 'farm-2', 'farm-1', '']), ['farm-1', 'farm-2']);
    assert.equal(normalizeAllowedFarmIds(null), null);
    assert.equal(normalizeAllowedFarmIds('farm-1'), undefined);
});
