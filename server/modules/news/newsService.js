import { requireAuth } from '../middlewares/requireAuth.js';

const NEWS_SOURCES = [
    { url: 'https://www.canalrural.com.br/feed/',             source: 'Canal Rural' },
    { url: 'https://www.beefpoint.com.br/feed/',              source: 'BeefPoint'   },
    { url: 'https://revistagloborural.globo.com/rss/',        source: 'Globo Rural' },
    { url: 'https://www.dbo.com.br/feed/',                    source: 'DBO'         },
];

const NEWS_KEYWORDS = [
    // Pecuária e animais
    'boi','vaca','bovino','gado','bezerro','novilho','novilha',
    'nelore','angus','brahman','zebu','rebanho','plantel','matriz',
    'reprodutor','touro',
    // Mercado e preços
    'arroba','@boi','carcaça','frigorífico','abate','carne bovina','proteína animal',
    // Manejo e produção
    'confinamento','pastagem','pasto','forrageira','brachiaria','capim',
    'suplementação','sal mineral','vermífugo','sanidade','vacinação','aftosa','brucelose',
    // Agro geral que impacta o pecuarista
    'clima','seca','chuva','ração','milho','soja','câmbio','dólar','exportação','importação',
    // Instituições e mercado
    'cepea','esalq','mapa','sif','rastreabilidade','gtb','minerva','jbs','marfrig','frigol',
];

const newsMatchesKeyword = (text) => {
    const lower = text.toLowerCase();
    return NEWS_KEYWORDS.some((kw) => lower.includes(kw));
};

const parseRssItems = (xml, source) => {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
        const c = m[1];
        const title = (c.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) || c.match(/<title>(.*?)<\/title>/s))?.[1]?.trim();
        const link = (c.match(/<link>(https?:\/\/[^<]+)<\/link>/) || c.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/))?.[1]?.trim();
        const pubDate = c.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || null;
        const rawDesc = (c.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || c.match(/<description>([\s\S]*?)<\/description>/))?.[1] || '';
        const description = rawDesc.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, ' ').trim().slice(0, 140) || null;
        if (title && link && newsMatchesKeyword(title + ' ' + (description || ''))) {
            items.push({ title, link, pubDate, description, source });
        }
    }
    return items;
};

let _newsCache = null;
let _newsCacheTs = 0;
const NEWS_CACHE_TTL = 30 * 60 * 1000; // 30 min

export function registerNewsRoutes(app) {
    app.get('/api/news/cattle', requireAuth, async (req, res) => {
        try {
            if (_newsCache && Date.now() - _newsCacheTs < NEWS_CACHE_TTL) {
                return res.json(_newsCache);
            }

            const fetches = NEWS_SOURCES.map(({ url, source }) =>
                fetch(url, { headers: { 'User-Agent': 'EIXO-Sistema/1.0' }, signal: AbortSignal.timeout(8000) })
                    .then((r) => r.ok ? r.text() : Promise.resolve(''))
                    .then((xml) => parseRssItems(xml, source))
                    .catch(() => [])
            );

            const results = await Promise.all(fetches);
            const allItems = results.flat();

            // Ordena por data (mais recente primeiro) e pega os 6 melhores
            allItems.sort((a, b) => {
                const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
                const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
                return db - da;
            });

            const items = allItems.slice(0, 6);
            const result = { items, fetchedAt: new Date().toISOString() };
            _newsCache = result;
            _newsCacheTs = Date.now();
            res.json(result);
        } catch (err) {
            console.error('News proxy error:', err.message);
            if (_newsCache) return res.json({ ..._newsCache, stale: true });
            res.status(502).json({ error: 'Não foi possível carregar as notícias.' });
        }
    });
}
