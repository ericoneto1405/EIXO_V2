import { BaseMarketAdapter } from './baseMarketAdapter.js';

export class ManualImportAdapter extends BaseMarketAdapter {
  constructor() {
    super('manual-import');
  }

  async fetch() {
    return [];
  }
}
