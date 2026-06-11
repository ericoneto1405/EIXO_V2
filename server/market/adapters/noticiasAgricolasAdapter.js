import { BaseMarketAdapter } from './baseMarketAdapter.js';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.noticiasagricolas.com.br/cotacoes/boi-gordo';

const STATE_MAP = {
  'SP Barretos': { state: 'SP', region: 'São Paulo', city: 'Barretos' },
  'SP Araçatuba': { state: 'SP', region: 'São Paulo', city: 'Araçatuba' },
  'MG Triângulo': { state: 'MG', region: 'Minas Gerais', city: 'Triângulo' },
  'MG B.Horizonte': { state: 'MG', region: 'Minas Gerais', city: 'Belo Horizonte' },
  'MG Norte': { state: 'MG', region: 'Minas Gerais', city: 'Norte de MG' },
  'MG Sul': { state: 'MG', region: 'Minas Gerais', city: 'Sul de MG' },
  'GO Goiânia': { state: 'GO', region: 'Goiás', city: 'Goiânia' },
  'GO Reg. Sul': { state: 'GO', region: 'Goiás', city: 'Região Sul de GO' },
  'MS Dourados': { state: 'MS', region: 'Mato Grosso do Sul', city: 'Dourados' },
  'MS C. Grande': { state: 'MS', region: 'Mato Grosso do Sul', city: 'Campo Grande' },
  'MS Três Lagoas': { state: 'MS', region: 'Mato Grosso do Sul', city: 'Três Lagoas' },
  'BA Sul': { state: 'BA', region: 'Bahia', city: 'Sul da Bahia' },
  'BA Oeste': { state: 'BA', region: 'Bahia', city: 'Oeste da Bahia' },
  'MT Norte': { state: 'MT', region: 'Mato Grosso', city: 'Norte de MT' },
  'MT Sudoeste': { state: 'MT', region: 'Mato Grosso', city: 'Sudoeste de MT' },
  'MT Cuiabá*': { state: 'MT', region: 'Mato Grosso', city: 'Cuiabá' },
  'MT Sudeste': { state: 'MT', region: 'Mato Grosso', city: 'Sudeste de MT' },
  'PR Noroeste': { state: 'PR', region: 'Paraná', city: 'Noroeste do PR' },
  'MA Oeste': { state: 'MA', region: 'Maranhão', city: 'Oeste do MA' },
  'PA Marabá': { state: 'PA', region: 'Pará', city: 'Marabá' },
  'PA Redenção': { state: 'PA', region: 'Pará', city: 'Redenção' },
  'PA Paragominas': { state: 'PA', region: 'Pará', city: 'Paragominas' },
  'RO Sudeste': { state: 'RO', region: 'Rondônia', city: 'Sudeste de RO' },
  'TO Sul': { state: 'TO', region: 'Tocantins', city: 'Sul do TO' },
  'TO Norte': { state: 'TO', region: 'Tocantins', city: 'Norte do TO' },
  'Acre': { state: 'AC', region: 'Acre', city: null },
  'ES': { state: 'ES', region: 'Espírito Santo', city: null },
  'RJ': { state: 'RJ', region: 'Rio de Janeiro', city: null },
  'Roraima': { state: 'RR', region: 'Roraima', city: null },
  'Alagoas': { state: 'AL', region: 'Alagoas', city: null },
};

const REPLACEMENT_STATE_MAP = {
  'SP': { state: 'SP', region: 'São Paulo' },
  'MG': { state: 'MG', region: 'Minas Gerais' },
  'GO': { state: 'GO', region: 'Goiás' },
  'MS': { state: 'MS', region: 'Mato Grosso do Sul' },
  'BA': { state: 'BA', region: 'Bahia' },
  'MT': { state: 'MT', region: 'Mato Grosso' },
  'PR': { state: 'PR', region: 'Paraná' },
  'PA': { state: 'PA', region: 'Pará' },
  'RO': { state: 'RO', region: 'Rondônia' },
  'TO': { state: 'TO', region: 'Tocantins' },
  'AC': { state: 'AC', region: 'Acre' },
  'MA': { state: 'MA', region: 'Maranhão' },
  'RJ': { state: 'RJ', region: 'Rio de Janeiro' },
  'RS': { state: 'RS', region: 'Rio Grande do Sul' },
  'SC': { state: 'SC', region: 'Santa Catarina' },
};

const parsePriceBR = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const parseDateBR = (text) => {
  if (!text) return null;
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

export class NoticiasAgricolasAdapter extends BaseMarketAdapter {
  constructor() {
    super('noticias-agricolas');
  }

  async fetch() {
    const response = await fetch(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EIXO-Market/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Notícias Agrícolas: ${response.status}`);
    }

    const html = await response.text();

    return [
      {
        referenceDate: this._extractDateFromHtml(html),
        rawTitle: 'Cotações boi gordo e reposição - Notícias Agrícolas',
        rawText: `Scraping automático de ${BASE_URL}`,
        rawUrl: BASE_URL,
        rawPayload: {
          html,
          fetchedAt: new Date().toISOString(),
        },
      },
    ];
  }

  _extractDateFromHtml(html) {
    const $ = cheerio.load(html);
    const dateText = $('td:contains("Atualizado em:")').last().text();
    return parseDateBR(dateText) || new Date().toISOString().split('T')[0];
  }

  async normalize(rawCapture) {
    const html = rawCapture?.rawPayload?.html;
    if (!html) return [];

    const $ = cheerio.load(html);
    const rows = [];

    // 1. Mercado Físico - Scot Consultoria (boi gordo por município)
    const scotRows = this._parseScotTable($);
    for (const row of scotRows) {
      rows.push({
        state: row.state,
        regionName: row.region,
        marketPlaceName: row.city || row.region,
        productType: 'BOI_GORDO',
        price: row.price,
        unit: 'ARROBA',
        paymentType: 'A_VISTA',
        referenceDate: rawCapture.referenceDate,
        referenceWeightArrobas: null,
        sourceBase: 'NoticiasAgricolas-Scot',
        normalizedPayload: row,
      });
    }

    // 2. Reposição Nelore - Desmama (bezerro desmama por UF)
    const replacementRows = this._parseReplacementTable($, 'Desmama', 'BEZERRO_DESMAMA', rawCapture.referenceDate);
    rows.push(...replacementRows);

    return rows;
  }

  _parseScotTable($) {
    const results = [];

    // Find the Mercado Físico table (has "Município" in header)
    let targetTable = null;
    $('table').each((_i, table) => {
      const headerText = $(table).find('tr').first().text();
      if (headerText.includes('Município') && headerText.includes('Boi Gordo')) {
        targetTable = table;
        return false; // break
      }
    });

    if (!targetTable) return results;

    const rows = $(targetTable).find('tbody tr');

    rows.each((_i, el) => {
      const cells = $(el).find('td');
      if (cells.length < 2) return;

      const label = $(cells[0]).text().trim();
      const mapping = STATE_MAP[label];
      if (!mapping) return;

      const priceText = $(cells[1]).text().trim();
      const price = parsePriceBR(priceText);
      if (!price) return;

      // RS uses R$/kg instead of R$/@ — skip for now (different unit)
      if (label.includes('RS ')) return;

      results.push({
        state: mapping.state,
        region: mapping.region,
        city: mapping.city,
        price,
        rawLabel: label,
      });
    });

    return results;
  }

  _parseReplacementTable($, categoryKeyword, productType, referenceDate) {
    const results = [];

    // Find the specific table by looking for the category keyword in the text before each table
    let targetTable = null;
    $('table').each((_i, table) => {
      const prevText = $(table).parent().prev().text().trim().toLowerCase();
      if (prevText.includes('nelore') && prevText.includes(categoryKeyword.toLowerCase())) {
        targetTable = table;
        return false; // break
      }
    });

    if (!targetTable) return results;

    const rows = $(targetTable).find('tbody tr');

    rows.each((_i, el) => {
      const cells = $(el).find('td');
      if (cells.length < 2) return;

      const stateLabel = $(cells[0]).text().trim();
      const mapping = REPLACEMENT_STATE_MAP[stateLabel];
      if (!mapping) return;

      const priceText = $(cells[1]).text().trim();
      const price = parsePriceBR(priceText);
      if (!price) return;

      results.push({
        state: mapping.state,
        regionName: mapping.region,
        marketPlaceName: mapping.region,
        productType,
        price,
        unit: 'CABECA',
        paymentType: 'A_VISTA',
        referenceDate,
        referenceWeightArrobas: 7,
        sourceBase: 'NoticiasAgricolas-Scot-Reposição',
        normalizedPayload: {
          stateLabel,
          category: categoryKeyword,
          pricePerHead: price,
        },
      });
    });

    return results;
  }
}
