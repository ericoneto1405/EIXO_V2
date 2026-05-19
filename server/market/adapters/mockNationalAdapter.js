import { BaseMarketAdapter } from './baseMarketAdapter.js';

const REF_DATE = '2026-05-18';

const MOCK_ROWS = [
  { state: 'BA', region: 'Bahia', marketPlaceName: 'Bahia', productType: 'BOI_GORDO', price: 315, unit: 'ARROBA', paymentType: 'A_VISTA' },
  { state: 'BA', region: 'Bahia', marketPlaceName: 'Bahia', productType: 'BEZERRO_DESMAMA', price: 2900, unit: 'CABECA', paymentType: 'A_VISTA', referenceWeightArrobas: 7 },

  { state: 'GO', region: 'Goiás', marketPlaceName: 'Goiás', productType: 'BOI_GORDO', price: 320, unit: 'ARROBA', paymentType: 'A_VISTA' },
  { state: 'GO', region: 'Goiás', marketPlaceName: 'Goiás', productType: 'BEZERRO_DESMAMA', price: 3000, unit: 'CABECA', paymentType: 'A_VISTA', referenceWeightArrobas: 7 },

  { state: 'MT', region: 'Mato Grosso', marketPlaceName: 'Mato Grosso', productType: 'BOI_GORDO', price: 305, unit: 'ARROBA', paymentType: 'A_VISTA' },
  { state: 'MT', region: 'Mato Grosso', marketPlaceName: 'Mato Grosso', productType: 'BEZERRO_DESMAMA', price: 2850, unit: 'CABECA', paymentType: 'A_VISTA', referenceWeightArrobas: 7 },

  { state: 'MS', region: 'Mato Grosso do Sul', marketPlaceName: 'Mato Grosso do Sul', productType: 'BOI_GORDO', price: 310, unit: 'ARROBA', paymentType: 'A_VISTA' },
  { state: 'MS', region: 'Mato Grosso do Sul', marketPlaceName: 'Mato Grosso do Sul', productType: 'BEZERRO_DESMAMA', price: 2950, unit: 'CABECA', paymentType: 'A_VISTA', referenceWeightArrobas: 7 },

  { state: 'SP', region: 'São Paulo', marketPlaceName: 'São Paulo', productType: 'BOI_GORDO', price: 325, unit: 'ARROBA', paymentType: 'A_VISTA' },
  { state: 'SP', region: 'São Paulo', marketPlaceName: 'São Paulo', productType: 'BEZERRO_DESMAMA', price: 3100, unit: 'CABECA', paymentType: 'A_VISTA', referenceWeightArrobas: 7 },
];

export class MockNationalAdapter extends BaseMarketAdapter {
  constructor() {
    super('mock-national');
  }

  async fetch() {
    return [
      {
        referenceDate: REF_DATE,
        rawTitle: 'Mock nacional de cotações',
        rawText: 'Dados simulados para validação do pipeline EIXO Mercado Nacional.',
        rawUrl: null,
        rawPayload: {
          generatedAt: new Date().toISOString(),
          rows: MOCK_ROWS,
        },
      },
    ];
  }

  async normalize(rawCapture) {
    const rows = Array.isArray(rawCapture?.rawPayload?.rows) ? rawCapture.rawPayload.rows : [];
    return rows.map((row) => ({
      state: row.state,
      regionName: row.region,
      marketPlaceName: row.marketPlaceName || row.region,
      productType: row.productType,
      price: row.price,
      unit: row.unit,
      paymentType: row.paymentType || 'A_VISTA',
      referenceDate: rawCapture.referenceDate || REF_DATE,
      referenceWeightArrobas: row.referenceWeightArrobas ?? null,
      sourceBase: 'MockNationalAdapter',
      normalizedPayload: row,
    }));
  }
}
