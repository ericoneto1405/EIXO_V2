import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateIdentitiesInAccount } from '../modules/utils/animalIdentity.js';

test('importação antiga verifica todas as fazendas da conta e identifica a fazenda do conflito', async () => {
    let receivedWhere = null;
    const prisma = {
        animal: {
            findMany: async ({ where }) => {
                receivedWhere = where;
                return [{
                    id: 'animal-outra-fazenda',
                    farmId: 'fazenda-b',
                    brinco: '123',
                    identityKey: '123',
                    farm: { name: 'Fazenda B' },
                }];
            },
        },
    };
    const farm = { id: 'fazenda-a', organizationId: 'org-1', userId: 'dono-1' };
    const req = { access: { restrictToFarmIds: ['fazenda-a'] } };

    const duplicates = await findDuplicateIdentitiesInAccount(prisma, req, farm, { identityKeys: ['123'] });

    assert.deepEqual(receivedWhere.farm, { organizationId: 'org-1' });
    assert.equal(duplicates[0].farmId, 'fazenda-b');
    assert.equal(duplicates[0].farmName, 'Fazenda B');
    assert.equal(duplicates[0].canRevealDetails, true);
});
