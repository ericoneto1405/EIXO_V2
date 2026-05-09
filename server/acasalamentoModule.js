const SOURCE_DEFINITIONS = [
    {
        code: 'ALTA_GENETICS',
        name: 'Alta Genetics',
        sourceType: 'COMMERCIAL_CENTER',
        breed: 'Nelore',
        baseUrl: 'https://touros.altagenetics.com.br/',
    },
    {
        code: 'ABS_PECPLAN',
        name: 'ABS Pecplan',
        sourceType: 'COMMERCIAL_CENTER',
        breed: 'Nelore',
        baseUrl: 'https://touros.abspecplan.com.br/',
    },
    {
        code: 'CRV_LAGOA',
        name: 'CRV Lagoa',
        sourceType: 'COMMERCIAL_CENTER',
        breed: 'Nelore',
        baseUrl: 'https://touros.crvbrasil.com.br/segment/corte-zebu',
    },
    {
        code: 'SEMEX',
        name: 'Semex',
        sourceType: 'COMMERCIAL_CENTER',
        breed: 'Nelore',
        baseUrl: 'https://semex.com.br/lista-corte-zebu/Zebu',
    },
    {
        code: 'GENEX',
        name: 'Genex',
        sourceType: 'COMMERCIAL_CENTER',
        breed: 'Nelore',
        baseUrl: 'https://produtos.genexbrasil.com.br/search',
    },
    {
        code: 'SELECT_SIRES',
        name: 'Select Sires',
        sourceType: 'COMMERCIAL_CENTER',
        breed: 'Nelore',
        baseUrl: 'https://selectsires.com.br/',
    },
    {
        code: 'RENASCER_BIOTECNOLOGIA',
        name: 'Renascer Biotecnologia',
        sourceType: 'COMMERCIAL_CENTER',
        breed: 'Nelore',
        baseUrl: 'https://www.renascerbiotecnologia.com.br/',
    },
    {
        code: 'ABCZ_PMGZ',
        name: 'ABCZ / PMGZ',
        sourceType: 'OFFICIAL_ASSOCIATION',
        breed: 'Nelore',
        baseUrl: 'https://www.abcz.org.br/',
    },
];

const syncJobState = {
    running: false,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
    lastResults: [],
};

const OBJECTIVE_CONFIG = {
    PRECOCIDADE: {
        label: 'Precocidade',
        requiredTraits: ['PRECOCIDADE'],
        depWeight: 0.6,
        accuracyWeight: 18,
        progenyWeight: 2.5,
    },
    DESMAMA: {
        label: 'Desmama',
        requiredTraits: ['DESMAMA'],
        depWeight: 1,
        accuracyWeight: 14,
        progenyWeight: 2,
    },
    CARCACA: {
        label: 'Carcaça',
        requiredTraits: ['CARCACA'],
        depWeight: 0.8,
        accuracyWeight: 14,
        progenyWeight: 2,
    },
    MATERNAL: {
        label: 'Maternal',
        requiredTraits: ['MATERNAL'],
        depWeight: 0.8,
        accuracyWeight: 14,
        progenyWeight: 2,
    },
    NASCIMENTO: {
        label: 'Nascimento',
        requiredTraits: ['NASCIMENTO'],
        depWeight: -1,
        accuracyWeight: 16,
        progenyWeight: 2,
    },
};

const normalizeText = (value) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();

const normalizeBullName = (value) => normalizeText(value).replace(/\s+/g, ' ');
const normalizeRegistryPart = (value) => {
    const normalized = normalizeText(value).replace(/[^A-Z0-9]/g, '');
    return normalized || null;
};
const normalizeOfficialSeries = (value) => {
    return normalizeRegistryPart(value);
};
const normalizeOfficialRgn = (value) => {
    return normalizeRegistryPart(value);
};
const normalizeRegistryType = (value) => {
    const normalized = normalizeRegistryPart(value);
    return normalized === 'RGN' || normalized === 'RGD' ? normalized : 'UNKNOWN';
};
const buildOfficialKeyNormalized = (series, rgn) => {
    const cleanSeries = normalizeOfficialSeries(series);
    const cleanRgn = normalizeOfficialRgn(rgn);
    return cleanSeries && cleanRgn ? `${cleanSeries}${cleanRgn}` : null;
};
const toIso = (value) => (value instanceof Date ? value.toISOString() : null);
const safeJson = (value) => (value === undefined ? null : value);

const normalizeObjective = (value) => {
    const normalized = normalizeText(value).replace(/\s+/g, '_');
    if (normalized.includes('PRECOC')) return 'PRECOCIDADE';
    if (normalized.includes('DESMAMA')) return 'DESMAMA';
    if (normalized.includes('CARC') || normalized.includes('AOL') || normalized.includes('ACABAMENTO')) return 'CARCACA';
    if (normalized.includes('MATERN')) return 'MATERNAL';
    if (normalized.includes('NASC')) return 'NASCIMENTO';
    return OBJECTIVE_CONFIG[normalized] ? normalized : null;
};

const normalizeTargetMode = (value) => {
    const normalized = normalizeText(value).replace(/\s+/g, '_');
    return ['LOT', 'GROUP', 'INDIVIDUAL', 'UPLOAD'].includes(normalized) ? normalized : null;
};

const fetchHtml = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
    } finally {
        clearTimeout(timeout);
    }
};

const fetchJson = async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
                accept: 'application/json,text/plain,*/*',
                referer: 'https://absbullsearch.absglobal.com/',
            },
        });
        const text = await response.text();
        if (!response.ok) {
            return { ok: false, status: response.status, data: null, text };
        }
        try {
            return { ok: true, status: response.status, data: JSON.parse(text), text };
        } catch {
            return { ok: false, status: response.status, data: null, text };
        }
    } finally {
        clearTimeout(timeout);
    }
};

const fetchJsonWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
                accept: 'application/json,text/plain,*/*',
            },
        });
        const text = await response.text();
        if (!response.ok) {
            return { ok: false, status: response.status, data: null, text };
        }
        try {
            return { ok: true, status: response.status, data: JSON.parse(text), text };
        } catch {
            return { ok: false, status: response.status, data: null, text };
        }
    } finally {
        clearTimeout(timeout);
    }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stripTags = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
const decodeHtml = (value) =>
    String(value || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&aacute;/gi, 'á')
        .replace(/&eacute;/gi, 'é')
        .replace(/&iacute;/gi, 'í')
        .replace(/&oacute;/gi, 'ó')
        .replace(/&uacute;/gi, 'ú')
        .replace(/&atilde;/gi, 'ã')
        .replace(/&otilde;/gi, 'õ')
        .replace(/&ccedil;/gi, 'ç')
        .replace(/&Aacute;/g, 'Á')
        .replace(/&Eacute;/g, 'É')
        .replace(/&Iacute;/g, 'Í')
        .replace(/&Oacute;/g, 'Ó')
        .replace(/&Uacute;/g, 'Ú')
        .replace(/&Atilde;/g, 'Ã')
        .replace(/&Otilde;/g, 'Õ')
        .replace(/&Ccedil;/g, 'Ç');

const cleanText = (value) => decodeHtml(stripTags(String(value || ''))).replace(/\s+/g, ' ').trim();

const extractRenascerBullLinks = (html, baseUrl) => {
    const links = new Set();
    const matches = html.matchAll(/href=["']([^"']*\/touro\/[^"']+\.html)["']/gi);
    for (const match of matches) {
        const href = match[1];
        if (!href) continue;
        const url = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
        links.add(url);
    }
    return Array.from(links);
};

const extractRenascerField = (html, label) => {
    const pattern = new RegExp(`<span[^>]*>\\s*${label}:\\s*<\\/span>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`, 'i');
    const match = html.match(pattern);
    return match ? cleanText(match[1]) : null;
};

const extractOfficialRegistryParts = ({ html = '', text = '', registration = '', registryType = null }) => {
    const pageText = cleanText(text || html);
    const explicitRegistryType = normalizeRegistryType(registryType);
    const series =
        extractRenascerField(html, 'Série')
        || pageText.match(/\bS[EÉ]RIE\s*[:\-]?\s*([A-Z0-9]{1,12})\b/i)?.[1]
        || pageText.match(/\bSERIE\s*[:\-]?\s*([A-Z0-9]{1,12})\b/i)?.[1];
    const rgn =
        extractRenascerField(html, 'RGN')
        || pageText.match(/\bRGN\s*[:\-]?\s*([A-Z0-9.\/-]{1,20})\b/i)?.[1]
        || pageText.match(/\bRGD\s*[:\-]?\s*([A-Z0-9.\/-]{1,20})\b/i)?.[1];
    if (series || rgn) {
        const officialSeries = normalizeOfficialSeries(series);
        const officialRgn = normalizeOfficialRgn(rgn);
        return {
            officialSeries,
            officialRgn,
            officialRegistryType: explicitRegistryType !== 'UNKNOWN'
                ? explicitRegistryType
                : pageText.match(/\bRGD\b/i) ? 'RGD' : pageText.match(/\bRGN\b/i) ? 'RGN' : 'UNKNOWN',
            officialKeyNormalized: buildOfficialKeyNormalized(officialSeries, officialRgn),
        };
    }

    const cleanRegistration = cleanText(registration);
    const direct = cleanRegistration.match(/\b([A-Z]{1,8})\s*[-/ ]\s*([A-Z0-9]{0,6}[0-9][A-Z0-9]{0,12})\b/i);
    if (direct) {
        const officialSeries = normalizeOfficialSeries(direct[1]);
        const officialRgn = normalizeOfficialRgn(direct[2]);
        return {
            officialSeries,
            officialRgn,
            officialRegistryType: explicitRegistryType,
            officialKeyNormalized: buildOfficialKeyNormalized(officialSeries, officialRgn),
        };
    }
    const compact = cleanRegistration.match(/\b([A-Z]{2,10})([0-9][A-Z0-9]{0,12})\b/i);
    if (compact) {
        const officialSeries = normalizeOfficialSeries(compact[1]);
        const officialRgn = normalizeOfficialRgn(compact[2]);
        return {
            officialSeries,
            officialRgn,
            officialRegistryType: explicitRegistryType,
            officialKeyNormalized: buildOfficialKeyNormalized(officialSeries, officialRgn),
        };
    }
    return { officialSeries: null, officialRgn: null, officialRegistryType: explicitRegistryType, officialKeyNormalized: null };
};

const extractImageUrls = (html, predicate) => {
    const urls = [];
    const matches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
    for (const match of matches) {
        const tag = match[0] || '';
        const src = match[1] || '';
        if (!src || !predicate(`${tag} ${src}`)) continue;
        urls.push(src.startsWith('http') ? src : new URL(src, 'https://www.renascerbiotecnologia.com.br/').toString());
    }
    return Array.from(new Set(urls));
};

const parseRenascerBullDetail = ({ html, url, source }) => {
    const pageText = cleanText(html);
    if (!/\bNELORE\b/i.test(pageText)) {
        return null;
    }

    const hiddenName = html.match(/<input[^>]+name=["']apelido["'][^>]+value=["']([^"']+)["']/i)?.[1];
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const name = cleanText(hiddenName || h1 || title)
        .replace(/^Touro\s+NELORE\s*/i, '')
        .replace(/\s*\|\s*Renascer.*$/i, '')
        .trim();
    const normalizedName = normalizeBullName(name);
    if (!normalizedName || normalizedName.length < 3) {
        return null;
    }

    const registration = extractRenascerField(html, 'Registro');
    const official = extractOfficialRegistryParts({ html, text: pageText, registration });
    const birthDate = extractRenascerField(html, 'Nascimento');
    const weight = extractRenascerField(html, 'Peso');
    const scrotal = extractRenascerField(html, 'PE');
    const pmgzImageUrls = extractImageUrls(html, (value) => /pmgz|avaliacao-genomica/i.test(value));
    const geneplusImageUrls = extractImageUrls(html, (value) => /geneplus|avaliacao-genetica/i.test(value));
    const progenyImageUrls = extractImageUrls(html, (value) => /prog[eê]nie/i.test(value));
    const sealTraits = [];
    if (/modal-carcaca|selo-carcaca/i.test(html)) sealTraits.push('CARCACA');
    if (/modal-iatf|selo-iatf/i.test(html)) sealTraits.push('IATF');
    if (/modal-novilha|selo-novilha/i.test(html)) sealTraits.push('NOVILHA');
    if (/precocidade|per[ií]metro escrotal|PE ao ano|PE ao sobreano/i.test(pageText)) sealTraits.push('PRECOCIDADE');

    return {
        name,
        normalizedName,
        registration,
        officialSeries: official.officialSeries,
        officialRgn: official.officialRgn,
        officialRegistryType: official.officialRegistryType || 'UNKNOWN',
        officialKeyNormalized: official.officialKeyNormalized,
        breed: source.breed,
        central: source.name,
        commercialUrl: url,
        rawData: {
            extraction: 'renascer-detail',
            sourceCode: source.code,
            birthDate,
            officialSeries: official.officialSeries,
            officialRgn: official.officialRgn,
            officialRegistryType: official.officialRegistryType || 'UNKNOWN',
            officialKeyNormalized: official.officialKeyNormalized,
            weight,
            scrotal,
            pmgzImageUrls,
            geneplusImageUrls,
            progenyImageUrls,
            sealTraits: Array.from(new Set(sealTraits)),
            hasPmgzMention: /PMGZ/i.test(pageText),
            hasProgenyMention: /prog[eê]nie|filhos/i.test(pageText),
            capturedAt: new Date().toISOString(),
        },
    };
};

const extractRenascerCandidates = async (source) => {
    const listUrl = new URL('/touros/', source.baseUrl).toString();
    const listResponse = await fetchHtml(listUrl);
    if (!listResponse.ok) {
        throw new Error(`Renascer lista touros HTTP ${listResponse.status}`);
    }

    const seedLinks = [
        ...extractRenascerBullLinks(listResponse.text, source.baseUrl),
        'https://www.renascerbiotecnologia.com.br/touro/7633-da-santa-nice-131.html',
        'https://www.renascerbiotecnologia.com.br/touro/calibre-132.html',
        'https://www.renascerbiotecnologia.com.br/touro/turbo-98.html',
        'https://www.renascerbiotecnologia.com.br/touro/depender-166.html',
        'https://www.renascerbiotecnologia.com.br/touro/river-dp-191.html',
        'https://www.renascerbiotecnologia.com.br/touro/jaquetao-da-javahe-182.html',
    ];
    const maxLinks = Number(process.env.RENASCER_MAX_BULL_LINKS || 350);
    const links = Array.from(new Set(seedLinks)).slice(0, maxLinks);
    const candidates = new Map();

    for (let index = 0; index < links.length; index += 1) {
        const url = links[index];
        try {
            const detailResponse = await fetchHtml(url);
            if (!detailResponse.ok) continue;
            const parsed = parseRenascerBullDetail({ html: detailResponse.text, url, source });
            if (parsed) {
                candidates.set(parsed.normalizedName, parsed);
                for (const related of extractRenascerBullLinks(detailResponse.text, source.baseUrl).slice(0, 12)) {
                    if (!links.includes(related) && links.length < maxLinks) links.push(related);
                }
            }
        } catch {
            // Individual pages can fail without invalidating the whole central.
        }
    }

    return Array.from(candidates.values());
};

const parseAbsBullDetail = ({ html, url, source }) => {
    const text = cleanText(html);
    if (/Search for your next bull below|Bull Search Users|Select Your Criteria/i.test(text) && !/RGD|Nascimento|SUMÁRIO|PMGZ|ANCP/i.test(text)) {
        return null;
    }
    if (!/Nelore|Corte Zebu|PMGZ|ANCP|RGD/i.test(text)) {
        return null;
    }
    const name = cleanText(
        html.match(/Nome\s*<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/[^>]+>/i)?.[1]
        || text.match(/Nome\s+([A-ZÀ-Ú0-9 .'-]{3,80})\s+RGD/i)?.[1]
        || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
        || '',
    ).replace(/^Nelore\s*-\s*/i, '').trim();
    const normalizedName = normalizeBullName(name);
    if (!normalizedName || normalizedName.length < 3) {
        return null;
    }
    const registration = cleanText(
        text.match(/RGD\s+([A-Z0-9 .-]{2,40})\s+(Nascimento|Código|Proprietário|Criador)/i)?.[1]
        || '',
    ) || null;
    const official = extractOfficialRegistryParts({ html, text, registration });
    const pmgzRows = {};
    const traits = ['iABCZg', 'PN-EDg', 'PD-EDg', 'PA-EDg', 'PS-EDg', 'PM-EMg', 'IPPg', 'PE-365g', 'PE-450g', 'AOLg', 'ACABg'];
    for (const trait of traits) {
        const escaped = trait.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = text.match(new RegExp(`${escaped}\\s+(-?\\d+(?:[,.]\\d+)?)\\s+(\\d+)\\s+(\\d+)`, 'i'));
        if (match) {
            pmgzRows[trait] = {
                dep: Number(match[1].replace(',', '.')),
                accuracy: Number(match[2]) / 100,
                deca: Number(match[3]),
            };
        }
    }
    const progenyNumbers = {};
    const nft = text.match(/NFT\s+(\d+)/i)?.[1];
    const nrt = text.match(/NRT\s+(\d+)/i)?.[1];
    if (nft) progenyNumbers.NFT = Number(nft);
    if (nrt) progenyNumbers.NRT = Number(nrt);

    return {
        name,
        normalizedName,
        registration,
        officialSeries: official.officialSeries,
        officialRgn: official.officialRgn,
        officialRegistryType: official.officialRegistryType || 'UNKNOWN',
        officialKeyNormalized: official.officialKeyNormalized,
        breed: /Nelore/i.test(text) ? 'Nelore' : source.breed,
        central: source.name,
        commercialUrl: url,
        rawData: {
            extraction: 'abs-detail',
            sourceCode: source.code,
            pmgzRows,
            progenyNumbers,
            hasPmgzMention: /PMGZ|SUMÁRIO ABCZ/i.test(text),
            hasAncpMention: /ANCP|MGTe/i.test(text),
            hasProgenyMention: /Prog[eê]nie|Número de filhos|NFT/i.test(text),
            capturedAt: new Date().toISOString(),
        },
    };
};

const extractAbsCandidates = async (source) => {
    const gridApiUrl = 'https://absbullsearch.absglobal.com/api/animal/all/grid/false?LanguageCode=en&BreedCode=NE&ProofCode=BRA&VisibilityCountryCode=BRA&LanguageCountryCode=US&BreedTypeCode=ZB&CountryLanguageId=1';
    const gridResponse = await fetchJson(gridApiUrl, {
        headers: {
            accept: 'application/json, text/plain, */*',
            referer: 'https://absbullsearch.absglobal.com/BullList?VisibilityCountryCode=BRA&BreedTypeCode=ZB&BreedCode=NE&ProofCode=BRA',
            'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
        },
    });
    if (gridResponse.ok && Array.isArray(gridResponse.data)) {
        return gridResponse.data.map((row) => {
            const name = cleanText(row.NAME || row.staticName || '');
            const normalizedName = normalizeBullName(name);
            const registration = cleanText(row.RGD || '') || null;
            const official = extractOfficialRegistryParts({ registration, registryType: registration ? 'RGD' : null });
            return {
                name,
                normalizedName,
                registration,
                officialSeries: official.officialSeries,
                officialRgn: official.officialRgn,
                officialRegistryType: official.officialRegistryType,
                officialKeyNormalized: official.officialKeyNormalized,
                breed: 'Nelore',
                central: source.name,
                commercialUrl: `https://absbullsearch.absglobal.com/details/bull/${encodeURIComponent(row.NAAB || row.staticCode || name)}/ZB/BRA/NELORE/EN/US/BRA`,
                semenAvailable: Boolean(row.conventional || row.female_sexed || row.male_sexed || row.semen_type),
                rawData: {
                    extraction: 'abs-bullsearch-grid-api',
                    sourceCode: source.code,
                    apiUrl: gridApiUrl,
                    animalId: row.AnimalId || null,
                    bovineId: row.BovineId || null,
                    naab: row.NAAB || row.staticCode || null,
                    rgd: registration,
                    officialRegistryType: official.officialRegistryType,
                    sire: row['SIRE-NAME'] || null,
                    pedigree: row.staticPedigree || null,
                    semenType: row.semen_type || null,
                    conventional: row.conventional ?? null,
                    femaleSexed: row.female_sexed ?? null,
                    maleSexed: row.male_sexed ?? null,
                    pmgz: {
                        iabcz: row.PMGZ_IABCZ_DEP ?? null,
                        iabczDeca: row.PMGZ_IABCZ_DECA ?? null,
                        pdedgDep: row.PMGZ_PDEDG_DEP ?? null,
                        pdedgAccuracy: row.PMGZ_PDEDG_AC ?? null,
                        pdedgDeca: row.PMGZ_PDEDG_DECA ?? null,
                        pmemgDep: row.PMGZ_PMEMG_DEP ?? null,
                        pmemgAccuracy: row.PMGZ_PMEMG_AC ?? null,
                        pmemgDeca: row.PMGZ_PMEMG_DECA ?? null,
                        aolgDep: row.PMGZ_AOLG_DEP ?? null,
                        aolgAccuracy: row.PMGZ_AOLG_AC ?? null,
                        aolgDeca: row.PMGZ_AOLG_DECA ?? null,
                        acabgDep: row.PMGZ_ACABG_DEP ?? null,
                        acabgAccuracy: row.PMGZ_ACABG_AC ?? null,
                        acabgDeca: row.PMGZ_ACABG_DECA ?? null,
                        totalChildren: row.PMGZ_NFT ?? null,
                        totalHerds: row.PMGZ_NRT ?? null,
                        childrenP210: row.PMGZ_NFP210 ?? null,
                        herdsP210: row.PMGZ_NREBP210 ?? null,
                        childrenP450: row.PMGZ_NFP450 ?? null,
                        herdsP450: row.PMGZ_NREBP450 ?? null,
                    },
                    hasOfficialProof: false,
                    officialProofWarning: 'Dado técnico publicado pela ABS. A recomendação continua exigindo validação oficial ABCZ/PMGZ por característica.',
                    capturedAt: new Date().toISOString(),
                },
            };
        }).filter((candidate) => candidate.normalizedName);
    }

    const searchTerms = [
        'nelore',
        'rem',
        'fiv',
        'mat',
        'jmp',
        'bino',
        'caete',
        'navirai',
        'santa',
        'nice',
        'camparino',
        'terra',
        'arca',
        'bm',
        'eao',
    ];
    const searchDelayMs = Number(process.env.ABS_SEARCH_DELAY_MS || 1200);
    const endpoint = 'https://absbullsearch.absglobal.com/api/animal/textsearch';
    const candidates = new Map();

    for (const term of searchTerms) {
        const params = new URLSearchParams({
            Animal: term,
            ProofCode: '*',
            VisibilityCountryCode: 'BRA',
            SearchIncludesPedigree: 'true',
            SearchFilterBeefOnly: 'true',
            SearchFilterDairyOnly: 'false',
            _: String(Date.now()),
        });
        const apiUrl = `${endpoint}?${params.toString()}`;
        try {
            const response = await fetchJson(apiUrl);
            if (!response.ok) continue;
            const rows = Array.isArray(response.data)
                ? response.data
                : Array.isArray(response.data?.Results)
                    ? response.data.Results
                    : Array.isArray(response.data?.items)
                        ? response.data.items
                        : [];

            for (const row of rows) {
                const item = row?.Item || row?.item || row || {};
                const links = Array.isArray(row?.Links)
                    ? row.Links
                    : Array.isArray(row?.links)
                        ? row.links
                        : row?.Link || row?.link
                            ? [row.Link || row.link]
                            : [];
                const primaryLink = links[0] || {};
                const breedCode = item.BreedCode || item.breedCode || '';
                const breedName = item.BreedName || item.breedName || '';
                const isNelore = normalizeText(`${breedCode} ${breedName}`).includes('NELORE') || normalizeText(breedCode) === 'NE';
                if (!isNelore) continue;

                const name = cleanText(item.RegName || item.ShortName || item.Name || item.name || '');
                const normalizedName = normalizeBullName(name);
                if (!normalizedName || normalizedName.length < 3) continue;

                const naab = item.NAAB || item.naab || item.AIcode || item.Code || null;
                const animalId = item.AnimalId || item.animalId || item.ID || null;
                const bovineId = item.BovineId || item.bovineId || null;
                const proofCode = primaryLink.ProofCode || item.ProofCode || item.proofCode || null;
                const detailsViewable = primaryLink.DetailsViewable ?? row?.DetailsViewable ?? null;
                const isOurs = item.IsOurs ?? item.isOurs ?? row?.IsOurs ?? null;
                const commercialUrl = `https://absbullsearch.absglobal.com/Search/Bull?animal=${encodeURIComponent(name)}&proof=*&country=BRA`;

                candidates.set(`${normalizedName}:${naab || animalId || bovineId || term}`, {
                    name,
                    normalizedName,
                    registration: naab ? String(naab) : null,
                    officialSeries: null,
                    officialRgn: null,
                    officialRegistryType: 'UNKNOWN',
                    officialKeyNormalized: null,
                    breed: 'Nelore',
                    central: source.name,
                    commercialUrl,
                    semenAvailable: isOurs === false ? false : true,
                    rawData: {
                        extraction: 'abs-bullsearch-api',
                        sourceCode: source.code,
                        searchTerm: term,
                        apiUrl,
                        naab,
                        animalId,
                        bovineId,
                        proofCode,
                        breedCode,
                        breedName,
                        sire: item.SireName || item.Sire || item.sire || null,
                        maternalGrandsire: item.MgsName || item.MGS || item.MaternalGrandsire || item.maternalGrandsire || null,
                        owner: item.Owner || item.owner || null,
                        rank: row?.Rank ?? row?.rank ?? null,
                        detailsViewable,
                        links,
                        isOurs,
                        hasOfficialProof: false,
                        officialProofWarning: 'Dado comercial da ABS. Não é prova oficial ABCZ/PMGZ.',
                        capturedAt: new Date().toISOString(),
                    },
                });
            }
        } catch {
            // Keep the central sync alive. Source-level issue is created if nothing useful is extracted.
        }
        if (searchDelayMs > 0) {
            await sleep(searchDelayMs);
        }
    }
    return Array.from(candidates.values());
};

const extractSemexCandidates = async (source) => {
    const listPaths = [
        '/lista-corte-zebu/Zebu',
        '/lista-corte-zebu/zebu/17', // Nelore PO
        '/lista-corte-zebu/zebu/44', // Nelore CEIP
        '/lista-corte-zebu/zebu/39', // Nelore Mocho
        '/lista-corte-zebu/zebu/91', // Nelore Pintado
    ];
    const candidates = new Map();
    const detailLimit = Number(process.env.SEMEX_DETAIL_LIMIT || 80);
    let detailCount = 0;

    for (const path of listPaths) {
        const url = new URL(path, source.baseUrl).toString();
        const response = await fetchHtml(url);
        if (!response.ok) continue;

        const links = response.text.matchAll(/<a[^>]+href=["']([^"']*\/info\/Corte\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi);
        for (const match of links) {
            const href = match[1] || '';
            const label = cleanText(match[2] || '');
            const normalizedName = normalizeBullName(label);
            if (!normalizedName || normalizedName.length < 3) continue;
            if (/^\d+$|INDF|DECA|DEP|ACUR/i.test(label)) continue;
            const commercialUrl = href.startsWith('http') ? href : new URL(href, source.baseUrl).toString();
            let candidate = null;
            if (detailCount < detailLimit) try {
                const detailResponse = await fetchHtml(commercialUrl);
                if (detailResponse.ok) {
                    candidate = parseSemexBullDetail({
                        html: detailResponse.text,
                        url: commercialUrl,
                        source,
                        fallbackName: label,
                    });
                    detailCount += 1;
                }
            } catch {
                // Detail pages can fail without invalidating the list capture.
            }
            candidates.set(`${normalizedName}:${commercialUrl}`, candidate || {
                name: label,
                normalizedName,
                registration: null,
                officialSeries: null,
                officialRgn: null,
                officialRegistryType: 'UNKNOWN',
                officialKeyNormalized: null,
                breed: 'Nelore',
                central: source.name,
                commercialUrl,
                semenAvailable: true,
                rawData: {
                    extraction: 'semex-lista-corte-zebu',
                    sourceCode: source.code,
                    listUrl: url,
                    capturedAt: new Date().toISOString(),
                    officialProofWarning: 'Dado comercial da Semex. Não é prova oficial ABCZ/PMGZ.',
                },
            });
        }
    }

    return Array.from(candidates.values());
};

const extractSemexDetailField = (text, label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}\\s*:\\s*([^:]+?)(?=\\s+(Nome|Registro|Código|Raça|Nascimento|Criador\\/Prop\\.|Pedigree|Provas)\\s*:|\\s+Pedigree|\\s+Provas|$)`, 'i'));
    return match ? cleanText(match[1]) : null;
};

const parseSemexPmgzRows = (html) => {
    const rows = {};
    const traitNames = ['PN-ED', 'PD-ED', 'PA-ED', 'PS-ED', 'PM-EM', 'IPP', 'PE-365', 'PE-450', 'AOL', 'ACAB', 'MAR', 'iABCZ'];
    for (const trait of traitNames) {
        const escaped = trait.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = html.match(new RegExp(`<td[^>]*>\\s*${escaped}\\s*<\\/td>\\s*<td[^>]*>([^<]*)<\\/td>\\s*<td[^>]*>([^<]*)<\\/td>\\s*<td[^>]*[^>]*>([^<]*)<\\/td>`, 'i'));
        if (!match) continue;
        const dep = Number(String(match[1]).replace(',', '.'));
        const accuracy = Number(String(match[2]).replace(',', '.')) / 100;
        const deca = Number(String(match[3]).replace(',', '.'));
        rows[trait] = {
            dep: Number.isFinite(dep) ? dep : null,
            accuracy: Number.isFinite(accuracy) ? accuracy : null,
            deca: Number.isFinite(deca) ? deca : null,
        };
    }
    return rows;
};

const parseSemexBullDetail = ({ html, url, source, fallbackName }) => {
    const text = cleanText(html);
    const name = extractSemexDetailField(text, 'Nome') || fallbackName;
    const normalizedName = normalizeBullName(name);
    if (!normalizedName || normalizedName.length < 3) return null;

    const registration = extractSemexDetailField(text, 'Registro');
    const commercialCode = extractSemexDetailField(text, 'Código');
    const breed = extractSemexDetailField(text, 'Raça') || source.breed;
    const birthDate = extractSemexDetailField(text, 'Nascimento');
    const official = extractOfficialRegistryParts({ html, text, registration });
    const pmgzRows = parseSemexPmgzRows(html);

    return {
        name,
        normalizedName,
        registration,
        officialSeries: official.officialSeries,
        officialRgn: official.officialRgn,
        officialRegistryType: official.officialRegistryType || 'UNKNOWN',
        officialKeyNormalized: official.officialKeyNormalized,
        breed: /Nelore/i.test(breed) ? 'Nelore' : source.breed,
        central: source.name,
        commercialUrl: url,
        semenAvailable: true,
        rawData: {
            extraction: 'semex-detail',
            sourceCode: source.code,
            commercialCode,
            birthDate,
            breed,
            pmgzRows,
            hasPmgzMention: /PMGZ/i.test(text),
            officialProofWarning: 'PMGZ capturado no catálogo Semex. A recomendação continua exigindo validação oficial ABCZ/PMGZ.',
            capturedAt: new Date().toISOString(),
        },
    };
};

const decodeFirestoreValue = (value) => {
    if (!value) return null;
    if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
    if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
    if (value.mapValue) {
        return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, nested]) => [key, decodeFirestoreValue(nested)]));
    }
    if (value.arrayValue) {
        return (value.arrayValue.values || []).map(decodeFirestoreValue);
    }
    return null;
};

const decodeFirestoreDocument = (document) => ({
    id: String(document?.name || '').split('/').pop(),
    ...Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)])),
});

const fetchGenexBullDocuments = async () => {
    const projectId = 'ens-genex';
    const apiKey = 'AIzaSyAqA527FQRCTz9pDkvVkLt6H9Ipm4-XvGQ';
    const maxPages = Number(process.env.GENEX_FIRESTORE_MAX_PAGES || 40);
    const pageSize = Number(process.env.GENEX_FIRESTORE_PAGE_SIZE || 100);
    const documents = [];
    let pageToken = '';

    for (let page = 0; page < maxPages; page += 1) {
        const params = new URLSearchParams({
            key: apiKey,
            pageSize: String(pageSize),
        });
        if (pageToken) params.set('pageToken', pageToken);
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bulls?${params.toString()}`;
        const response = await fetchJson(url);
        if (!response.ok) {
            throw new Error(`Genex Firestore HTTP ${response.status}`);
        }
        const pageDocs = Array.isArray(response.data?.documents) ? response.data.documents.map(decodeFirestoreDocument) : [];
        documents.push(...pageDocs);
        pageToken = response.data?.nextPageToken || '';
        if (!pageToken) break;
    }

    return documents;
};

const parseGenexBullDocument = ({ document, source }) => {
    if (document.removed === true) return null;
    if (normalizeText(document.breed) !== 'NELORE') return null;

    const general = document.PEDIGREE?.['Informações Gerais'] || {};
    const geral = document.PEDIGREE?.GERAL || {};
    const name = cleanText(general.Nome || geral.apelido || document.nome || document.name || '');
    const normalizedName = normalizeBullName(name);
    if (!normalizedName || normalizedName.length < 3) return null;

    const registration = cleanText(general['Serie/RGD'] || general['Série/RGD'] || document.registro || '') || null;
    const official = extractOfficialRegistryParts({ registration });
    const code = cleanText(document.codigo || document.id || '');
    const market = document.PEDIGREE?.Mercado || {};
    const semenAvailable = Boolean(market.BRASIL || market.OM || market.LATAM || true);
    const pdfPath = document.pdf?.path || null;

    return {
        name,
        normalizedName,
        registration: registration || code || null,
        officialSeries: official.officialSeries,
        officialRgn: official.officialRgn,
        officialRegistryType: official.officialRegistryType || 'UNKNOWN',
        officialKeyNormalized: official.officialKeyNormalized,
        breed: 'Nelore',
        central: source.name,
        commercialUrl: code
            ? `${source.baseUrl}?q=${encodeURIComponent(code)}`
            : source.baseUrl,
        semenAvailable,
        rawData: {
            extraction: 'genex-firestore-bulls',
            sourceCode: source.code,
            firestoreId: document.id,
            code,
            registration,
            birthDate: general.Nasc || null,
            owner: general.PROP || null,
            market,
            pdfPath,
            pmgz: document.PMGZ || null,
            geneplus: document.GENEPLUS || null,
            ancp: document.ANCP || null,
            pedigree: document.PEDIGREE || null,
            hasPmgzMention: Boolean(document.PMGZ),
            hasProgenyMention: Boolean(document.PMGZ?.['PROGÊNIE'] || document.GENEPLUS?.['PROGÊNIE'] || document.ANCP?.['PROGÊNIE']),
            officialProofWarning: 'Dado comercial/técnico publicado no app Genex. A recomendação continua exigindo validação oficial ABCZ/PMGZ por característica.',
            capturedAt: new Date().toISOString(),
        },
    };
};

const extractGenexCandidates = async (source) => {
    const documents = await fetchGenexBullDocuments();
    const maxBulls = Number(process.env.GENEX_MAX_BULLS || 500);
    const candidates = new Map();
    for (const document of documents) {
        const parsed = parseGenexBullDocument({ document, source });
        if (!parsed) continue;
        candidates.set(parsed.officialKeyNormalized || `${parsed.normalizedName}:${parsed.rawData.code}`, parsed);
        if (candidates.size >= maxBulls) break;
    }
    return Array.from(candidates.values());
};

const parseAltaBullRow = ({ row, source, searchTerm }) => {
    const breed = cleanText(row.Raca || row.raca || '');
    if (!/Nelore/i.test(breed)) return null;

    const name = cleanText(row.Nome || row.nome || '');
    const normalizedName = normalizeBullName(name);
    if (!normalizedName || normalizedName.length < 3) return null;

    const registration = cleanText(row.Registro || row.registro || '') || null;
    const official = extractOfficialRegistryParts({ registration });
    const link = row.Link || row.link || '';
    const photo = row.Foto || row.foto || null;
    const productId = row.ProductID || row.productId || row.id || null;
    const commercialUrl = link
        ? new URL(link, source.baseUrl).toString()
        : productId
            ? new URL(`/Busca/Touro/${productId}`, source.baseUrl).toString()
            : source.baseUrl;

    return {
        name,
        normalizedName,
        registration,
        officialSeries: official.officialSeries,
        officialRgn: official.officialRgn,
        officialRegistryType: official.officialRegistryType || 'UNKNOWN',
        officialKeyNormalized: official.officialKeyNormalized,
        breed: 'Nelore',
        central: source.name,
        commercialUrl,
        semenAvailable: true,
        rawData: {
            extraction: 'alta-bullsearch-current-list',
            sourceCode: source.code,
            searchTerm,
            productId,
            code: cleanText(row.Code || row.code || '') || null,
            codePadrao: cleanText(row.CodePadrao || row.codePadrao || '') || null,
            breed,
            category: cleanText(row.Category || row.category || '') || null,
            photo: photo ? new URL(photo, source.baseUrl).toString() : null,
            sire: cleanText(row.Genealogia_Pai_Nome || row.sire || '') || null,
            dam: cleanText(row.Genealogia_Mae_Nome || row.dam || '') || null,
            pedigree: cleanText(row.Pedigree || row.pedigree || '') || null,
            officialSeries: official.officialSeries,
            officialRgn: official.officialRgn,
            officialRegistryType: official.officialRegistryType || 'UNKNOWN',
            officialKeyNormalized: official.officialKeyNormalized,
            officialProofWarning: 'Dado comercial publicado na busca pública da Alta. A recomendação continua exigindo validação oficial ABCZ/PMGZ por característica.',
            capturedAt: new Date().toISOString(),
        },
    };
};

const extractAltaCandidates = async (source) => {
    const searchTerms = [
        'nelore',
        'rem',
        'fiv',
        'navirai',
        'mat',
        'bons',
        'camparino',
        'santa',
        'nice',
        'eao',
        'caete',
        'jaburi',
        'sino',
        'terra',
        'arca',
        'col',
        'mn',
        'da',
    ];
    const searchDelayMs = Number(process.env.ALTA_SEARCH_DELAY_MS || 800);
    const candidates = new Map();

    for (const term of searchTerms) {
        const url = new URL(`/Busca/GetCurrentList/${encodeURIComponent(term)}`, source.baseUrl).toString();
        try {
            const response = await fetchJson(url);
            if (!response.ok || !Array.isArray(response.data)) continue;
            for (const row of response.data) {
                const parsed = parseAltaBullRow({ row, source, searchTerm: term });
                if (!parsed) continue;
                candidates.set(parsed.officialKeyNormalized || `${parsed.normalizedName}:${parsed.rawData.code || parsed.rawData.productId}`, parsed);
            }
        } catch {
            // One search term failing should not invalidate the central.
        }
        if (searchDelayMs > 0) {
            await sleep(searchDelayMs);
        }
    }

    return Array.from(candidates.values());
};

const fetchCrvBullCatalog = async () => {
    const timeoutMs = Number(process.env.CRV_FETCH_TIMEOUT_MS || 90000);
    const response = await fetchJsonWithTimeout('https://api-main-e6pbdwdwoa-rj.a.run.app/bull/find', timeoutMs);
    if (!response.ok) {
        throw new Error(`CRV API HTTP ${response.status}`);
    }
    return Array.isArray(response.data?.bulls) ? response.data.bulls : [];
};

const summarizeCrvProofs = (proofs) => {
    const summaries = [];
    for (const proofGroup of Array.isArray(proofs) ? proofs : []) {
        for (const [name, payload] of Object.entries(proofGroup || {})) {
            const table = Array.isArray(payload?.table) ? payload.table : [];
            summaries.push({
                name,
                crvCode: payload?.CRVcode || null,
                rows: table.slice(0, 80).map((row) => ({
                    name: row?.name || null,
                    headers: row?.headers || [],
                    type: row?.type || [],
                    values: row?.values || [],
                })),
            });
        }
    }
    return summaries;
};

const parseCrvBull = ({ bull, source }) => {
    const breed = cleanText(bull.breed || '');
    const isCorteZebu = String(bull.segment || '') === '1' && String(bull.type || '') === '2';
    if (!isCorteZebu || !/Nelore/i.test(breed)) return null;

    const name = cleanText(bull.warName && bull.warName !== '-' ? bull.warName : bull.name || '');
    const normalizedName = normalizeBullName(name);
    if (!normalizedName || normalizedName.length < 3) return null;

    const registration = cleanText(bull.registry || '') || null;
    const official = extractOfficialRegistryParts({ registration });
    const crvCode = cleanText(bull.CRVcode || bull.crvCode || '') || null;
    const segmentPath = breed.toLowerCase().includes('ceip')
        ? 'nelore-ceip'
        : breed.toLowerCase().includes('mocho')
            ? 'nelore-mocho'
            : breed.toLowerCase().includes('pintado')
                ? 'nelore-pintado'
                : 'nelore-po';
    const commercialUrl = crvCode
        ? `https://touros.crvbrasil.com.br/segment/corte-zebu/${segmentPath}/${encodeURIComponent(crvCode.toUpperCase())}`
        : source.baseUrl;
    const proofSummaries = summarizeCrvProofs(bull.proof);

    return {
        name,
        normalizedName,
        registration: registration || crvCode,
        officialSeries: official.officialSeries,
        officialRgn: official.officialRgn,
        officialRegistryType: official.officialRegistryType || 'UNKNOWN',
        officialKeyNormalized: official.officialKeyNormalized,
        breed: 'Nelore',
        central: source.name,
        commercialUrl,
        semenAvailable: true,
        rawData: {
            extraction: 'crv-api-bull-find',
            sourceCode: source.code,
            crvCode,
            fullName: cleanText(bull.name || '') || null,
            warName: cleanText(bull.warName || '') || null,
            registry: registration,
            breed,
            birthDate: bull.birthDate || null,
            age: bull.age || null,
            creator: bull.creator || null,
            owner: bull.owner || null,
            progenyTest: bull.progenyTest || null,
            selectionObjective: bull.selectionObjective || null,
            stamps: Array.isArray(bull.stamps) ? bull.stamps : [],
            pdf: bull.pdf || null,
            ecommerce: bull.ecommerce || null,
            picture: bull.picture || null,
            images: bull.images || [],
            comments: [bull.comment1, bull.comment2, bull.comment3, bull.comment4].filter((item) => item && item !== '-'),
            proofSummaries,
            pedigree: bull.pedigree || null,
            hasPmgzMention: proofSummaries.some((proof) => /PMGZ/i.test(proof.name)),
            hasAncpMention: proofSummaries.some((proof) => /ANCP/i.test(proof.name)),
            hasGeneplusMention: proofSummaries.some((proof) => /GENEPLUS/i.test(proof.name)),
            hasProgenyMention: /provado|prog[eê]nie|filhos/i.test(`${bull.progenyTest || ''} ${JSON.stringify(proofSummaries)}`),
            officialProofWarning: 'Provas capturadas do catálogo CRV. A recomendação continua exigindo validação oficial ABCZ/PMGZ por característica.',
            capturedAt: new Date().toISOString(),
        },
    };
};

const extractCrvCandidates = async (source) => {
    const bulls = await fetchCrvBullCatalog();
    const maxBulls = Number(process.env.CRV_MAX_BULLS || 600);
    const candidates = new Map();
    for (const bull of bulls) {
        const parsed = parseCrvBull({ bull, source });
        if (!parsed) continue;
        candidates.set(parsed.officialKeyNormalized || `${parsed.normalizedName}:${parsed.rawData.crvCode}`, parsed);
        if (candidates.size >= maxBulls) break;
    }
    return Array.from(candidates.values());
};

const extractCommercialCandidates = ({ html, source }) => {
    const text = stripTags(html).replace(/\s+/g, ' ');
    const candidates = new Map();
    const titleMatches = html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
    const blockedLabels = /\b(TOUROS?|VER TOUROS?|TODOS|CONSULTORES?|CORTE|ZEBU|TAURINO|LEITE|CAT[AÁ]LOGO|COMPARAR|EXPORTAR|BAIXAR|MENU|SOLU[CÇ][OÕ]ES|SOBRE|CONTATO|FACEBOOK|INSTAGRAM|YOUTUBE|MAPA)\b/i;
    for (const match of titleMatches) {
        const href = match[1] || '';
        const label = stripTags(match[2] || '').replace(/\s+/g, ' ').trim();
        const normalized = normalizeBullName(label);
        if (!normalized || normalized.length < 4 || normalized.length > 80) continue;
        if (blockedLabels.test(label)) continue;
        if (!/\/touro\/|\/bull\/|\/catalogo\/\d+|\/produto\/|\/reprodutor\//i.test(href)) continue;
        const url = href.startsWith('http') ? href : new URL(href, source.baseUrl).toString();
        candidates.set(normalized, {
            name: label,
            normalizedName: normalized,
            registration: null,
            breed: source.breed,
            central: source.name,
            commercialUrl: url,
            rawData: { extraction: 'anchor', sourceCode: source.code },
        });
    }

    return Array.from(candidates.values()).slice(0, 60);
};

const createIssue = async (prisma, { source, severity = 'WARNING', message, detail, referenceUrl }) => {
    return prisma.acasalamentoCollectionIssue.create({
        data: {
            sourceId: source?.id || null,
            sourceCode: source?.code || 'UNKNOWN',
            severity,
            message,
            detail: detail ? String(detail).slice(0, 1000) : null,
            referenceUrl: referenceUrl || source?.baseUrl || null,
        },
    });
};

const createIssueOnce = async (prisma, { source, severity = 'WARNING', message, detail, referenceUrl }) => {
    const existing = await prisma.acasalamentoCollectionIssue.findFirst({
        where: {
            sourceCode: source?.code || 'UNKNOWN',
            message,
            referenceUrl: referenceUrl || source?.baseUrl || null,
            resolvedAt: null,
        },
        orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    return createIssue(prisma, { source, severity, message, detail, referenceUrl });
};

const clearSourceSyncIssues = async (prisma, source) => {
    const messages = [
        'Touro comercial importado sem série/RGN.',
        'Nenhum touro Nelore foi extraído automaticamente da central.',
        'Renascer pausada temporariamente na sincronização automática.',
        'Renascer coletada com parser específico.',
        'ABS Pecplan coletada pelo BullSearch.',
        'Semex coletada por catálogo Corte Zebu.',
        'Genex coletada pelo catálogo público Firestore.',
        'Alta Genetics coletada pela busca pública de touros.',
        'CRV Lagoa coletada pela API pública de touros.',
        'Falha ao coletar central comercial.',
    ];
    await prisma.acasalamentoCollectionIssue.updateMany({
        where: {
            sourceId: source.id,
            resolvedAt: null,
            message: { in: messages },
        },
        data: { resolvedAt: new Date() },
    });
};

const resolveCommercialSource = async (prisma, { sourceCode, central }) => {
    await ensureSources(prisma);
    const normalizedSourceCode = normalizeRegistryPart(sourceCode);
    const normalizedCentral = normalizeBullName(central);
    const sources = await prisma.acasalamentoSource.findMany({
        where: { sourceType: 'COMMERCIAL_CENTER' },
    });
    return sources.find((source) => {
        const sourceCodeKey = normalizeRegistryPart(source.code);
        const sourceNameKey = normalizeBullName(source.name);
        return (normalizedSourceCode && sourceCodeKey === normalizedSourceCode)
            || (normalizedCentral && sourceNameKey === normalizedCentral)
            || (normalizedCentral && sourceNameKey.includes(normalizedCentral))
            || (normalizedCentral && normalizedCentral.includes(sourceNameKey));
    }) || null;
};

const ensureSources = async (prisma) => {
    const sources = [];
    for (const definition of SOURCE_DEFINITIONS) {
        const source = await prisma.acasalamentoSource.upsert({
            where: { code: definition.code },
            update: {
                name: definition.name,
                sourceType: definition.sourceType,
                breed: definition.breed,
                baseUrl: definition.baseUrl,
            },
            create: definition,
        });
        sources.push(source);
    }
    return sources;
};

const normalizeCommercialBullCandidate = ({ item, source, extraction }) => {
    const name = cleanText(item.name || item.nome || item.bullName || item.touro || '');
    const normalizedName = normalizeBullName(name);
    if (!normalizedName || normalizedName.length < 3) {
        const error = new Error('Informe o nome do touro.');
        error.statusCode = 400;
        throw error;
    }

    const registration = cleanText(item.registration || item.registro || item.rgd || item.rgnCompleto || item.codigo || '') || null;
    const officialSeries = normalizeOfficialSeries(item.officialSeries || item.serie || item['série'] || item.series);
    const officialRgn = normalizeOfficialRgn(item.officialRgn || item.rgn || item.RGN);
    const inferredOfficial = officialSeries && officialRgn
        ? {
            officialSeries,
            officialRgn,
            officialRegistryType: normalizeRegistryType(item.officialRegistryType || item.registryType || item.tipoRegistro),
            officialKeyNormalized: buildOfficialKeyNormalized(officialSeries, officialRgn),
        }
        : extractOfficialRegistryParts({
            registration,
            registryType: item.officialRegistryType || item.registryType || item.tipoRegistro,
        });
    const breed = cleanText(item.breed || item.raca || item.raça || source.breed || 'Nelore') || 'Nelore';
    const semenAvailable = item.semenAvailable ?? item.semenDisponivel ?? item.disponivel ?? item.available;

    return {
        name,
        normalizedName,
        registration,
        officialSeries: inferredOfficial.officialSeries,
        officialRgn: inferredOfficial.officialRgn,
        officialRegistryType: inferredOfficial.officialRegistryType || 'UNKNOWN',
        officialKeyNormalized: inferredOfficial.officialKeyNormalized,
        breed,
        central: source.name,
        commercialUrl: item.commercialUrl || item.url || item.link || source.baseUrl,
        semenAvailable: semenAvailable === undefined ? true : Boolean(semenAvailable),
        rawData: {
            extraction,
            sourceCode: source.code,
            importedBy: 'admin-controlled-batch',
            original: item,
            officialSeries: inferredOfficial.officialSeries,
            officialRgn: inferredOfficial.officialRgn,
            officialRegistryType: inferredOfficial.officialRegistryType || 'UNKNOWN',
            officialKeyNormalized: inferredOfficial.officialKeyNormalized,
            capturedAt: new Date().toISOString(),
        },
    };
};

const upsertCommercialBullCandidate = async (prisma, { source, candidate }) => {
    const officialKeyNormalized = candidate.officialKeyNormalized || buildOfficialKeyNormalized(candidate.officialSeries, candidate.officialRgn);
    const existingByName = await prisma.acasalamentoBull.findUnique({
        where: {
            sourceId_normalizedName: {
                sourceId: source.id,
                normalizedName: candidate.normalizedName,
            },
        },
    });
    const existingByOfficialKey = officialKeyNormalized
        ? await prisma.acasalamentoBull.findUnique({
            where: {
                breed_officialKeyNormalized: {
                    breed: candidate.breed,
                    officialKeyNormalized,
                },
            },
        })
        : null;
    const existing = existingByName || existingByOfficialKey;
    const identityData = {
        name: candidate.name,
        normalizedName: candidate.normalizedName,
        registration: candidate.registration,
        officialSeries: candidate.officialSeries || null,
        officialRgn: candidate.officialRgn || null,
        officialRegistryType: normalizeRegistryType(candidate.officialRegistryType),
        officialKeyNormalized,
        breed: candidate.breed,
        lastSeenAt: new Date(),
    };
    const legacyCommercialData = {
        sourceId: source.id,
        central: candidate.central,
        commercialUrl: candidate.commercialUrl,
        semenAvailable: candidate.semenAvailable ?? true,
        sourceStatus: 'OK',
        rawData: safeJson(candidate.rawData),
    };

    const bull = existing
        ? await prisma.acasalamentoBull.update({
            where: { id: existing.id },
            data: existingByOfficialKey
                ? identityData
                : { ...identityData, ...legacyCommercialData },
        })
        : await prisma.acasalamentoBull.create({
            data: {
                ...identityData,
                ...legacyCommercialData,
            },
        });

    await prisma.acasalamentoCommercialListing.upsert({
        where: {
            sourceId_normalizedName: {
                sourceId: source.id,
                normalizedName: candidate.normalizedName,
            },
        },
        update: {
            bullId: bull.id,
            central: candidate.central,
            name: candidate.name,
            registration: candidate.registration,
            commercialUrl: candidate.commercialUrl,
            semenAvailable: candidate.semenAvailable ?? true,
            sourceStatus: 'OK',
            lastSeenAt: new Date(),
            rawData: safeJson(candidate.rawData),
        },
        create: {
            bullId: bull.id,
            sourceId: source.id,
            central: candidate.central,
            name: candidate.name,
            normalizedName: candidate.normalizedName,
            registration: candidate.registration,
            commercialUrl: candidate.commercialUrl,
            semenAvailable: candidate.semenAvailable ?? true,
            sourceStatus: 'OK',
            lastSeenAt: new Date(),
            rawData: safeJson(candidate.rawData),
        },
    });

    if (existingByName && existingByOfficialKey && existingByName.id !== existingByOfficialKey.id) {
        await createIssueOnce(prisma, {
            source,
            severity: 'WARNING',
            message: 'Possível duplicidade lógica de touro comercial.',
            detail: `${candidate.name} tem nome já existente na central e chave oficial associada a outro registro. A EIXO preservou o registro por nome para evitar duplicação automática insegura.`,
            referenceUrl: candidate.commercialUrl || source.baseUrl,
        });
    }

    if (!officialKeyNormalized) {
        await createIssue(prisma, {
            source,
            severity: 'WARNING',
            message: 'Touro comercial importado sem série/RGN.',
            detail: `${candidate.name} (${source.name}) entrou na prateleira comercial, mas fica pendente porque não possui série + RGN confiáveis para validação ABCZ/PMGZ.`,
            referenceUrl: candidate.commercialUrl || source.baseUrl,
        });
    }

    return bull;
};

const looksLikeCommercialCodeOnly = (registration) => {
    const normalized = normalizeText(registration).replace(/\s+/g, '');
    if (!normalized) return true;
    if (/^\d{1,3}[A-Z]{1,3}\d{2,8}$/.test(normalized)) return true; // Ex.: NAAB ABS 29NE5624.
    if (/^[A-Z]{1,3}\d{2,8}$/.test(normalized) && normalized.includes('NE')) return true;
    return false;
};

const buildOfficialReferenceUrl = (bull) => {
    const query = bull.officialSeries && bull.officialRgn
        ? `${bull.officialSeries} ${bull.officialRgn}`
        : bull.registration || bull.name;
    const url = new URL('/produtos-e-servicos/consulta-publica-de-animais', 'https://www.abcz.org.br/');
    url.searchParams.set('q', query);
    return url.toString();
};

const buildAbczNameSearchReferenceUrl = (name) => {
    const url = new URL('/produtos-e-servicos/consulta-publica-de-animais', 'https://www.abcz.org.br/');
    url.searchParams.set('tipo', 'nome');
    url.searchParams.set('nome', name || '');
    return url.toString();
};

const buildAbczNameSearchTerms = (name) => {
    const terms = new Set();
    const original = cleanText(name);
    const normalized = normalizeBullName(name);
    if (original.length >= 4) terms.add(original);
    if (normalized.length >= 4) terms.add(normalized);
    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length > 2) {
        const withoutCommonCommercialSuffixes = tokens.filter((token) => !['PO', 'P0', 'CEIP'].includes(token)).join(' ');
        if (withoutCommonCommercialSuffixes.length >= 4) terms.add(withoutCommonCommercialSuffixes);
    }
    return Array.from(terms);
};

const parsePositiveInteger = (value) => {
    const number = Number(String(value ?? '').replace(/\D/g, ''));
    return Number.isFinite(number) && number > 0 ? number : 0;
};

const getRawDataObject = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const getBullReviewSignals = (bull, candidateCount = 0) => {
    const raw = getRawDataObject(bull.rawData);
    const rawText = normalizeText(JSON.stringify(raw));
    const nameText = normalizeBullName(bull.name);
    const listings = Array.isArray(bull.commercialListings) ? bull.commercialListings : [];
    const listingRawText = normalizeText(JSON.stringify(listings.map((listing) => listing.rawData || {})));
    const progenyCount = Math.max(
        parsePositiveInteger(raw.progenyCount),
        parsePositiveInteger(raw.totalChildren),
        parsePositiveInteger(raw.pmgz?.totalChildren),
        parsePositiveInteger(raw.pmgz?.NFT),
        parsePositiveInteger(raw.pmgz?.PMGZ_NFT),
    );
    const hasFiv = /\bFIV\b/.test(`${nameText} ${rawText} ${listingRawText}`);
    const hasPedigree = Boolean(raw.pedigree || raw.sire || raw.dam || raw.fatherName || raw.motherName || rawText.includes('PEDIGREE'));
    const hasProgenySignal = progenyCount > 0 || raw.hasProgenyMention === true || rawText.includes('PROGENIE') || rawText.includes('FILHOS');
    const hasCommercialProofSignal = raw.hasPmgzMention === true || raw.pmgz || rawText.includes('PMGZ') || rawText.includes('IABCZ') || listingRawText.includes('PMGZ');
    const multipleCenters = new Set(listings.map((listing) => listing.central).filter(Boolean)).size > 1;
    const relevant = hasFiv || hasPedigree || hasProgenySignal || hasCommercialProofSignal || multipleCenters || candidateCount > 0;
    return {
        relevant,
        hasFiv,
        hasPedigree,
        hasProgenySignal,
        hasCommercialProofSignal,
        multipleCenters,
        progenyCount,
        candidateCount,
        centersCount: new Set(listings.map((listing) => listing.central).filter(Boolean)).size || (bull.central ? 1 : 0),
    };
};

const PMGZ_SUMMARY_URL = 'https://www.abczstat.com.br/comunicacoes/sumario/default.aspx?acesso=publico';

const PMGZ_TRAIT_SPECS = {
    DESMAMA: [{ value: '0', code: 'PD-ED', label: 'Peso a desmama - efeito direto' }],
    NASCIMENTO: [{ value: '3', code: 'PN-ED', label: 'Peso ao nascimento - efeito direto' }],
    MATERNAL: [{ value: '4', code: 'PM-EM', label: 'Peso a fase materna - efeito materno' }],
    PRECOCIDADE: [{ value: '15', code: 'PSN', label: 'Precocidade sexual natural' }],
    CARCACA: [
        { value: '12', code: 'AOL', label: 'Area de olho de lombo' },
        { value: '13', code: 'ACAB', label: 'Acabamento de carcaca' },
    ],
};

const decodeHtmlEntity = (value) =>
    String(value || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

const stripHtml = (value) =>
    decodeHtmlEntity(String(value || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();

const parseBrazilianNumber = (value) => {
    const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
};

const parseIntegerValue = (value) => {
    const number = parseBrazilianNumber(value);
    return number === null ? null : Math.trunc(number);
};

const buildWebFormsParams = (html) => {
    const params = new URLSearchParams();
    const controls = String(html || '').matchAll(/<(input|textarea|select)\b[\s\S]*?(?:>|<\/select>)/gi);
    for (const match of controls) {
        const tag = match[0];
        const tagName = match[1].toLowerCase();
        const name = tag.match(/\bname=["']([^"']+)/i)?.[1];
        if (!name) continue;
        if (tagName === 'select') {
            const selectedOption = tag.match(/<option[^>]+selected=["']selected["'][^>]*value=["']([^"']*)/i)
                || tag.match(/<option[^>]*value=["']([^"']*)/i);
            params.set(name, decodeHtmlEntity(selectedOption?.[1] || ''));
            continue;
        }
        if (tagName === 'textarea') {
            params.set(name, decodeHtmlEntity(tag.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i)?.[1] || ''));
            continue;
        }
        const type = (tag.match(/\btype=["']([^"']+)/i)?.[1] || 'text').toLowerCase();
        if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(tag)) continue;
        params.set(name, decodeHtmlEntity(tag.match(/\bvalue=["']([^"']*)/i)?.[1] || ''));
    }
    return params;
};

const fetchPmgzPage = async ({ cookie = '', params = null }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.PMGZ_FETCH_TIMEOUT_MS || 15000));
    const headers = {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
        referer: PMGZ_SUMMARY_URL,
        ...(cookie ? { cookie } : {}),
        ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    };
    try {
        const response = await fetch(PMGZ_SUMMARY_URL, {
            method: params ? 'POST' : 'GET',
            signal: controller.signal,
            headers,
            body: params || undefined,
        });
        const text = await response.text();
        const setCookie = response.headers.get('set-cookie')?.split(',').map((item) => item.split(';')[0]).join('; ') || '';
        return { ok: response.ok, status: response.status, text, cookie: [cookie, setCookie].filter(Boolean).join('; ') };
    } finally {
        clearTimeout(timeout);
    }
};

const createPmgzIndividualSession = async () => {
    const initial = await fetchPmgzPage({});
    if (!initial.ok) throw new Error(`PMGZ sumario HTTP ${initial.status}`);
    const params = buildWebFormsParams(initial.text);
    params.set('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$rbPesquisa$1');
    params.set('__EVENTARGUMENT', '');
    params.set('ctl00$ContentPlaceHolder1$rbPesquisa', '1');
    const individual = await fetchPmgzPage({ cookie: initial.cookie, params });
    if (!individual.ok) throw new Error(`PMGZ modo individual HTTP ${individual.status}`);
    return { cookie: individual.cookie || initial.cookie, html: individual.text };
};

const parsePmgzResultRow = ({ html, bull, traitSpec }) => {
    const row = String(html || '').match(/<tr[^>]+id=["']ctl00_ContentPlaceHolder1_TableRow1["'][\s\S]*?<\/tr>/i)?.[0];
    if (!row) return null;
    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/gi)].map((cell) => stripHtml(cell[0]));
    const registry = cells[6] || '';
    const registryMatchesBull = normalizeRegistryPart(registry) === bull.officialKeyNormalized;
    if (!registryMatchesBull) return null;
    const dep = parseBrazilianNumber(cells[11]);
    const deca = parseIntegerValue(cells[12]);
    if (dep === null && deca === null) return null;
    return {
        animalId: row.match(/chk_(\d+)/)?.[1] || null,
        name: (cells[1] || '').replace(/^\d+\s*-\s*/, ''),
        registry,
        birthDate: cells[7] || null,
        iabcz: parseBrazilianNumber(cells[8]),
        top: parseBrazilianNumber(cells[9]),
        percentile: parseBrazilianNumber(cells[10]),
        dep,
        deca,
        accuracy: null,
        progenyCount: null,
        traitCode: traitSpec.code,
        traitLabel: traitSpec.label,
        fatherName: cells[13] || null,
        motherRegistry: cells[14] || null,
    };
};

const queryPmgzTrait = async ({ session, bull, traitSpec }) => {
    const params = buildWebFormsParams(session.html);
    params.set('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$btOK');
    params.set('__EVENTARGUMENT', '');
    params.set('ctl00$ContentPlaceHolder1$rbPesquisa', '1');
    params.set('ctl00$ContentPlaceHolder1$ucFiltros1$rbTipoFiltro', '0');
    params.set('ctl00$ContentPlaceHolder1$ucFiltros1$tbSerie', bull.officialSeries || '');
    params.set('ctl00$ContentPlaceHolder1$ucFiltros1$tbRGN', bull.officialRgn || '');
    params.set('ctl00$ContentPlaceHolder1$ddlCaracteristica', traitSpec.value);
    const response = await fetchPmgzPage({ cookie: session.cookie, params });
    if (!response.ok) return { ok: false, status: response.status, proof: null };
    return { ok: true, status: response.status, proof: parsePmgzResultRow({ html: response.text, bull, traitSpec }) };
};

const queryPmgzOfficialProofs = async ({ session, bull }) => {
    const proofsByTrait = {};
    for (const [trait, specs] of Object.entries(PMGZ_TRAIT_SPECS)) {
        for (const spec of specs) {
            const result = await queryPmgzTrait({ session, bull, traitSpec: spec });
            if (!result.ok) {
                proofsByTrait[trait] = { status: 'PENDING', reason: `PMGZ retornou HTTP ${result.status} para ${spec.code}.` };
                break;
            }
            if (result.proof) {
                proofsByTrait[trait] = { status: 'VERIFIED', proof: result.proof };
                break;
            }
        }
        if (!proofsByTrait[trait]) {
            proofsByTrait[trait] = { status: 'INCONCLUSIVE', reason: 'Animal encontrado na ABCZ, mas a característica não apareceu no sumário PMGZ público consultado.' };
        }
    }
    return proofsByTrait;
};

const markOfficialProofPending = async (prisma, { source, bull, trait, detail, status = 'PENDING' }) => {
    const referenceUrl = buildOfficialReferenceUrl(bull);
    const registry = bull.officialSeries && bull.officialRgn ? `${bull.officialSeries}-${bull.officialRgn}` : bull.registration;
    return prisma.acasalamentoOfficialProof.upsert({
        where: {
            bullId_sourceId_proofTrait: {
                bullId: bull.id,
                sourceId: source.id,
                proofTrait: trait,
            },
        },
        update: {
            traitLabel: OBJECTIVE_CONFIG[trait]?.label || trait,
            registry,
            proofStatus: status,
            referenceUrl,
            collectedAt: new Date(),
            rawData: {
                validation: 'abcz-pmgz-pending',
                reason: detail,
                bullName: bull.name,
                registration: bull.registration,
                officialSeries: bull.officialSeries,
                officialRgn: bull.officialRgn,
                commercialCentral: bull.central,
                capturedAt: new Date().toISOString(),
            },
        },
        create: {
            bullId: bull.id,
            sourceId: source.id,
            proofTrait: trait,
            traitLabel: OBJECTIVE_CONFIG[trait]?.label || trait,
            registry,
            proofStatus: status,
            referenceUrl,
            collectedAt: new Date(),
            rawData: {
                validation: 'abcz-pmgz-pending',
                reason: detail,
                bullName: bull.name,
                registration: bull.registration,
                officialSeries: bull.officialSeries,
                officialRgn: bull.officialRgn,
                commercialCentral: bull.central,
                capturedAt: new Date().toISOString(),
            },
        },
    });
};

const createAbczSession = async () => {
    const url = 'https://www.abcz.org.br/produtos-e-servicos/consulta-publica-de-animais';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ABCZ_FETCH_TIMEOUT_MS || 12000));
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`ABCZ consulta pública HTTP ${response.status}`);
        }
        const cookie = response.headers.get('set-cookie')?.split(',').map((item) => item.split(';')[0]).join('; ') || '';
        return { cookie, text };
    } finally {
        clearTimeout(timeout);
    }
};

const queryAbczAnimalByUniqueId = async ({ cookie, series, rgn }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ABCZ_FETCH_TIMEOUT_MS || 12000));
    const body = new URLSearchParams({
        tipo: 'identificacao-unica',
        serie: series,
        rgn,
        pagina: '1',
    });
    try {
        const response = await fetch('https://www.abcz.org.br/produtos-e-servicos/consulta-publica-de-animais-ajax', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                accept: 'application/json, text/javascript, */*; q=0.01',
                'x-requested-with': 'XMLHttpRequest',
                'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
                referer: 'https://www.abcz.org.br/produtos-e-servicos/consulta-publica-de-animais',
                cookie,
            },
            body,
        });
        const text = await response.text();
        if (!response.ok) {
            return { ok: false, status: response.status, data: null, text };
        }
        try {
            return { ok: true, status: response.status, data: JSON.parse(text), text };
        } catch {
            return { ok: false, status: response.status, data: null, text };
        }
    } finally {
        clearTimeout(timeout);
    }
};

const queryAbczAnimalByName = async ({ cookie, name, page = 1 }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ABCZ_NAME_FETCH_TIMEOUT_MS || process.env.ABCZ_FETCH_TIMEOUT_MS || 30000));
    const body = new URLSearchParams({
        tipo: 'nome',
        raca: '5',
        sexo: 'M',
        nome: name,
        tipo_pesquisa: '0',
        pagina: String(page),
    });
    try {
        const response = await fetch('https://www.abcz.org.br/produtos-e-servicos/consulta-publica-de-animais-ajax', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                accept: 'application/json, text/javascript, */*; q=0.01',
                'x-requested-with': 'XMLHttpRequest',
                'user-agent': 'EIXO-Acasalamento/1.0 (+https://eixo.ag)',
                referer: 'https://www.abcz.org.br/produtos-e-servicos/consulta-publica-de-animais',
                cookie,
            },
            body,
        });
        const text = await response.text();
        if (!response.ok) {
            return { ok: false, status: response.status, data: null, text };
        }
        try {
            return { ok: true, status: response.status, data: JSON.parse(text), text };
        } catch {
            return { ok: false, status: response.status, data: null, text };
        }
    } finally {
        clearTimeout(timeout);
    }
};

const createRelevantIdentityIssue = async (prisma, { source, bull, severity = null, detail, referenceUrl, candidateCount = 0 }) => {
    const reviewSignals = getBullReviewSignals(bull, candidateCount);
    return createIssue(prisma, {
        source,
        severity: severity || (reviewSignals.relevant ? 'CRITICAL' : 'WARNING'),
        message: reviewSignals.relevant
            ? 'PENDENTE_IDENTIDADE_RELEVANTE: touro comercial exige revisão ABCZ.'
            : 'Busca ABCZ por nome não confirmou identidade oficial.',
        detail: `${detail} Sinais: FIV=${reviewSignals.hasFiv ? 'sim' : 'não'}, pedigree=${reviewSignals.hasPedigree ? 'sim' : 'não'}, progênie=${reviewSignals.hasProgenySignal ? 'sim' : 'não'}, PMGZ/comercial=${reviewSignals.hasCommercialProofSignal ? 'sim' : 'não'}, centrais=${reviewSignals.centersCount}. A EIXO não descarta o touro; mantém em revisão de identidade e não recomenda por aproximação.`,
        referenceUrl,
    });
};

const parseAbczAnimalResult = ({ data, bull }) => {
    if (!data || data.status !== 'sucesso' || !Array.isArray(data.itens) || !data.itens.length) {
        return { found: false, match: null };
    }
    const officialKey = buildOfficialKeyNormalized(bull.officialSeries, bull.officialRgn);
    const match = data.itens.find((item) => normalizeRegistryPart(item.registro) === officialKey) || data.itens[0];
    return {
        found: Boolean(match),
        match,
    };
};

const parseAbczNameSearchResult = ({ data, expectedName }) => {
    if (!data || data.status !== 'sucesso' || !Array.isArray(data.itens) || !data.itens.length) {
        return { status: 'NOT_FOUND', match: null, candidates: [] };
    }
    const expectedNormalizedName = normalizeBullName(expectedName);
    const candidates = data.itens.map((item) => ({
        ...item,
        normalizedName: normalizeBullName(item.nome),
        official: extractOfficialRegistryParts({ registration: item.registro, registryType: 'RGN' }),
    }));
    const exactMatches = candidates.filter((item) => item.normalizedName === expectedNormalizedName);
    if (exactMatches.length === 1) {
        return { status: 'UNIQUE_EXACT', match: exactMatches[0], candidates };
    }
    if (candidates.length === 1 && exactMatches.length === 0) {
        return { status: 'WEAK_SINGLE', match: candidates[0], candidates };
    }
    return { status: 'AMBIGUOUS', match: null, candidates };
};

const resolveOfficialIdentityByName = async (prisma, { source, session, bull }) => {
    const searchTerms = buildAbczNameSearchTerms(bull.name);
    let result = { status: 'NOT_FOUND', match: null, candidates: [] };
    let searchedName = bull.name;
    for (const term of searchTerms) {
        let response;
        try {
            response = await queryAbczAnimalByName({ cookie: session.cookie, name: term });
        } catch (error) {
            await createRelevantIdentityIssue(prisma, {
                source,
                bull,
                detail: `${bull.name}: busca ABCZ por nome falhou tecnicamente ao buscar "${term}": ${String(error?.message || error).slice(0, 300)}.`,
                referenceUrl: buildAbczNameSearchReferenceUrl(term),
            });
            return { resolved: false, bull, reason: 'falha técnica na busca por nome' };
        }
        if (!response.ok) {
            await createRelevantIdentityIssue(prisma, {
                source,
                bull,
                detail: `${bull.name}: ABCZ retornou HTTP ${response.status} ao buscar "${term}".`,
                referenceUrl: buildAbczNameSearchReferenceUrl(term),
            });
            return { resolved: false, bull, reason: `ABCZ por nome HTTP ${response.status}` };
        }
        const parsed = parseAbczNameSearchResult({ data: response.data, expectedName: term });
        searchedName = term;
        result = parsed;
        if (parsed.status === 'UNIQUE_EXACT') break;
        if (parsed.status === 'AMBIGUOUS' || parsed.status === 'WEAK_SINGLE') break;
    }
    if (result.status !== 'UNIQUE_EXACT') {
        const label = result.status === 'NOT_FOUND'
            ? 'nenhum resultado'
            : result.status === 'WEAK_SINGLE'
                ? 'resultado único sem nome exato'
                : 'resultado ambíguo';
        const candidates = result.candidates.slice(0, 5).map((item) => `${item.registro || 'sem registro'} - ${item.nome || 'sem nome'}`).join('; ');
        await createRelevantIdentityIssue(prisma, {
            source,
            bull,
            detail: `${bull.name}: ${label} na ABCZ ao buscar "${searchedName}". ${candidates ? `Candidatos: ${candidates}. ` : ''}`,
            referenceUrl: buildAbczNameSearchReferenceUrl(searchedName),
            candidateCount: result.candidates.length,
        });
        return { resolved: false, bull, reason: label };
    }

    const official = result.match.official;
    if (!official.officialKeyNormalized) {
        await createIssueOnce(prisma, {
            source,
            severity: 'WARNING',
            message: 'Busca ABCZ por nome encontrou animal sem registro normalizável.',
            detail: `${bull.name}: ABCZ retornou ${result.match.registro || 'registro vazio'}, mas não foi possível separar série/RGN.`,
            referenceUrl: result.match.url ? new URL(result.match.url, 'https://www.abcz.org.br/').toString() : buildOfficialReferenceUrl(bull),
        });
        return { resolved: false, bull, reason: 'registro ABCZ sem série/RGN normalizável' };
    }

    const existing = await prisma.acasalamentoBull.findUnique({
        where: {
            breed_officialKeyNormalized: {
                breed: bull.breed,
                officialKeyNormalized: official.officialKeyNormalized,
            },
        },
    });
    if (existing && existing.id !== bull.id) {
        await createIssueOnce(prisma, {
            source,
            severity: 'CRITICAL',
            message: 'Busca ABCZ por nome encontrou chave oficial já usada.',
            detail: `${bull.name}: ABCZ retornou ${result.match.registro}, mas essa chave já pertence a ${existing.name}. Precisa revisão manual antes de unificar.`,
            referenceUrl: result.match.url ? new URL(result.match.url, 'https://www.abcz.org.br/').toString() : buildOfficialReferenceUrl(bull),
        });
        return { resolved: false, bull, reason: 'chave oficial já vinculada a outro touro' };
    }

    const updatedBull = await prisma.acasalamentoBull.update({
        where: { id: bull.id },
        data: {
            registration: result.match.registro || bull.registration,
            officialSeries: official.officialSeries,
            officialRgn: official.officialRgn,
            officialRegistryType: official.officialRegistryType || 'RGN',
            officialKeyNormalized: official.officialKeyNormalized,
            rawData: {
                ...(bull.rawData && typeof bull.rawData === 'object' && !Array.isArray(bull.rawData) ? bull.rawData : {}),
                abczNameResolution: {
                    validation: 'abcz-public-name-search',
                    name: bull.name,
                    searchedName,
                    matchedName: result.match.nome,
                    registry: result.match.registro,
                    url: result.match.url ? new URL(result.match.url, 'https://www.abcz.org.br/').toString() : null,
                    capturedAt: new Date().toISOString(),
                },
            },
        },
        include: { commercialListings: true },
    });
    return { resolved: true, bull: updatedBull, officialAnimal: result.match };
};

const markOfficialProofFromAbcz = async (prisma, { source, bull, trait, status, detail, officialAnimal }) => {
    const referenceUrl = officialAnimal?.url
        ? new URL(officialAnimal.url, 'https://www.abcz.org.br/').toString()
        : buildOfficialReferenceUrl(bull);
    const registry = officialAnimal?.registro || (bull.officialSeries && bull.officialRgn ? `${bull.officialSeries} ${bull.officialRgn}` : bull.registration);
    return prisma.acasalamentoOfficialProof.upsert({
        where: {
            bullId_sourceId_proofTrait: {
                bullId: bull.id,
                sourceId: source.id,
                proofTrait: trait,
            },
        },
        update: {
            traitLabel: OBJECTIVE_CONFIG[trait]?.label || trait,
            registry,
            proofStatus: status,
            referenceUrl,
            collectedAt: new Date(),
            rawData: {
                validation: 'abcz-public-animal-search',
                reason: detail,
                bullName: bull.name,
                registration: bull.registration,
                officialSeries: bull.officialSeries,
                officialRgn: bull.officialRgn,
                officialAnimal: officialAnimal || null,
                commercialCentral: bull.central,
                capturedAt: new Date().toISOString(),
            },
        },
        create: {
            bullId: bull.id,
            sourceId: source.id,
            proofTrait: trait,
            traitLabel: OBJECTIVE_CONFIG[trait]?.label || trait,
            registry,
            proofStatus: status,
            referenceUrl,
            collectedAt: new Date(),
            rawData: {
                validation: 'abcz-public-animal-search',
                reason: detail,
                bullName: bull.name,
                registration: bull.registration,
                officialSeries: bull.officialSeries,
                officialRgn: bull.officialRgn,
                officialAnimal: officialAnimal || null,
                commercialCentral: bull.central,
                capturedAt: new Date().toISOString(),
            },
        },
    });
};

const markOfficialProofFromPmgz = async (prisma, { source, bull, trait, proof }) => {
    const referenceUrl = PMGZ_SUMMARY_URL;
    const registry = proof.registry || (bull.officialSeries && bull.officialRgn ? `${bull.officialSeries} ${bull.officialRgn}` : bull.registration);
    const rawData = {
        validation: 'abcz-pmgz-summary',
        reason: 'DEP e DECA oficiais extraidos do sumario publico PMGZ por serie/RGN. Acuracia nao apareceu nesta tela publica e foi mantida nula.',
        bullName: bull.name,
        registration: bull.registration,
        officialSeries: bull.officialSeries,
        officialRgn: bull.officialRgn,
        commercialCentral: bull.central,
        pmgz: proof,
        capturedAt: new Date().toISOString(),
    };
    return prisma.acasalamentoOfficialProof.upsert({
        where: {
            bullId_sourceId_proofTrait: {
                bullId: bull.id,
                sourceId: source.id,
                proofTrait: trait,
            },
        },
        update: {
            traitLabel: proof.traitLabel || OBJECTIVE_CONFIG[trait]?.label || trait,
            registry,
            dep: proof.dep,
            deca: proof.deca,
            accuracy: proof.accuracy,
            progenyCount: proof.progenyCount,
            proofStatus: 'VERIFIED',
            referenceUrl,
            collectedAt: new Date(),
            rawData,
        },
        create: {
            bullId: bull.id,
            sourceId: source.id,
            proofTrait: trait,
            traitLabel: proof.traitLabel || OBJECTIVE_CONFIG[trait]?.label || trait,
            registry,
            dep: proof.dep,
            deca: proof.deca,
            accuracy: proof.accuracy,
            progenyCount: proof.progenyCount,
            proofStatus: 'VERIFIED',
            referenceUrl,
            collectedAt: new Date(),
            rawData,
        },
    });
};

const validateCommercialBullsAgainstOfficialSource = async (prisma, source, options = {}) => {
    const limit = Number(options.officialLimit || process.env.ABCZ_VALIDATION_LIMIT || 20);
    const nameSearchLimit = Number(options.nameSearchLimit || process.env.ABCZ_NAME_SEARCH_LIMIT || 10);
    const delayMs = Number(options.officialDelayMs || process.env.ABCZ_VALIDATION_DELAY_MS || 700);
    const commercialBullsWithKey = await prisma.acasalamentoBull.findMany({
        where: {
            breed: 'Nelore',
            officialKeyNormalized: { not: null },
            OR: [
                { semenAvailable: true },
                { commercialListings: { some: { semenAvailable: true } } },
            ],
        },
        include: { commercialListings: true },
        orderBy: [{ updatedAt: 'asc' }, { central: 'asc' }, { name: 'asc' }],
        take: limit,
    });
    const commercialBullsWithoutKey = nameSearchLimit > 0
        ? await prisma.acasalamentoBull.findMany({
            where: {
                breed: 'Nelore',
                officialKeyNormalized: null,
                OR: [
                    { semenAvailable: true },
                    { commercialListings: { some: { semenAvailable: true } } },
                ],
            },
            include: { commercialListings: true },
            orderBy: [{ updatedAt: 'asc' }, { central: 'asc' }, { name: 'asc' }],
            take: nameSearchLimit,
        })
        : [];
    const commercialBulls = [...commercialBullsWithKey, ...commercialBullsWithoutKey];
    const traits = Object.keys(OBJECTIVE_CONFIG);
    const session = await createAbczSession();
    let pending = 0;
    let verifiedIdentity = 0;
    let notFound = 0;
    let failed = 0;
    let verifiedTraitProofs = 0;
    let pmgzFailed = 0;
    let blockedWithoutOfficialIdentifier = 0;
    let nameSearchResolved = 0;
    let nameSearchBlocked = 0;
    let pmgzSession = null;

    for (const originalBull of commercialBulls) {
        let bull = originalBull;
        let hasOfficialKey = Boolean(bull.officialSeries && bull.officialRgn);
        if (!hasOfficialKey) {
            try {
                const resolution = await resolveOfficialIdentityByName(prisma, { source, session, bull });
                if (resolution.resolved) {
                    bull = resolution.bull;
                    nameSearchResolved += 1;
                    hasOfficialKey = Boolean(bull.officialSeries && bull.officialRgn);
                } else {
                    nameSearchBlocked += 1;
                }
            } catch (error) {
                nameSearchBlocked += 1;
                await createIssueOnce(prisma, {
                    source,
                    severity: 'WARNING',
                    message: 'Busca ABCZ por nome falhou.',
                    detail: `${bull.name}: ${String(error?.message || error).slice(0, 300)}. O touro continua bloqueado sem série/RGN oficial.`,
                    referenceUrl: buildOfficialReferenceUrl(bull),
                });
            }
        }
        if (!hasOfficialKey) {
            blockedWithoutOfficialIdentifier += 1;
            continue;
        }

        try {
            const response = await queryAbczAnimalByUniqueId({
                cookie: session.cookie,
                series: bull.officialSeries,
                rgn: bull.officialRgn,
            });
            if (!response.ok) {
                failed += 1;
                await markOfficialProofFromAbcz(prisma, {
                    source,
                    bull,
                    trait: 'INDICE_GERAL',
                    status: 'PENDING',
                    detail: `Consulta ABCZ falhou tecnicamente com HTTP ${response.status}. Nenhuma prova foi inferida.`,
                    officialAnimal: null,
                });
                continue;
            }
            const result = parseAbczAnimalResult({ data: response.data, bull });
            if (result.found) {
                verifiedIdentity += 1;
                await markOfficialProofFromAbcz(prisma, {
                    source,
                    bull,
                    trait: 'INDICE_GERAL',
                    status: 'VERIFIED',
                    detail: 'Identidade oficial confirmada na consulta pública ABCZ por série/RGN. Isto não comprova prova PMGZ específica por característica.',
                    officialAnimal: result.match,
                });
                try {
                    if (!pmgzSession) pmgzSession = await createPmgzIndividualSession();
                    const pmgzProofs = await queryPmgzOfficialProofs({ session: pmgzSession, bull });
                    for (const trait of traits.filter((item) => item !== 'INDICE_GERAL')) {
                        const pmgzProof = pmgzProofs[trait];
                        if (pmgzProof?.status === 'VERIFIED') {
                            verifiedTraitProofs += 1;
                            await markOfficialProofFromPmgz(prisma, {
                                source,
                                bull,
                                trait,
                                proof: pmgzProof.proof,
                            });
                        } else {
                            await markOfficialProofFromAbcz(prisma, {
                                source,
                                bull,
                                trait,
                                status: pmgzProof?.status || 'INCONCLUSIVE',
                                detail: pmgzProof?.reason || 'Animal encontrado na ABCZ, mas DEP/DECA/acurácia oficial da característica ainda não foi extraída do PMGZ. Não recomendado para esta característica.',
                                officialAnimal: result.match,
                            });
                        }
                    }
                } catch (error) {
                    pmgzFailed += 1;
                    for (const trait of traits.filter((item) => item !== 'INDICE_GERAL')) {
                        await markOfficialProofFromAbcz(prisma, {
                            source,
                            bull,
                            trait,
                            status: 'PENDING',
                            detail: `Identidade ABCZ confirmada, mas a consulta PMGZ falhou: ${String(error?.message || error).slice(0, 300)}.`,
                            officialAnimal: result.match,
                        });
                    }
                }
            } else {
                notFound += 1;
                for (const trait of traits) {
                    await markOfficialProofFromAbcz(prisma, {
                        source,
                        bull,
                        trait,
                        status: 'NOT_FOUND',
                        detail: 'Série/RGN não retornou animal na consulta pública ABCZ. Sem prova oficial, o touro fica bloqueado.',
                        officialAnimal: null,
                    });
                }
            }
            pending += 1;
            if (delayMs > 0) await sleep(delayMs);
        } catch (error) {
            failed += 1;
            await markOfficialProofFromAbcz(prisma, {
                source,
                bull,
                trait: 'INDICE_GERAL',
                status: 'PENDING',
                detail: `Consulta ABCZ falhou: ${String(error?.message || error).slice(0, 300)}. Nenhuma prova foi inferida.`,
                officialAnimal: null,
            });
        }
    }

    return {
        checked: commercialBulls.length,
        pending,
        verifiedIdentity,
        notFound,
        failed,
        verifiedTraitProofs,
        pmgzFailed,
        blockedWithoutOfficialIdentifier,
        nameSearchResolved,
        nameSearchBlocked,
    };
};

const syncCommercialSource = async (prisma, source) => {
    try {
        await clearSourceSyncIssues(prisma, source);
        let candidates = [];
        if (source.code === 'RENASCER_BIOTECNOLOGIA' && process.env.ACASALAMENTO_SYNC_RENASCER !== 'true') {
            await createIssueOnce(prisma, {
                source,
                severity: 'INFO',
                message: 'Renascer pausada temporariamente na sincronização automática.',
                detail: 'A central possui muitas páginas individuais e foi pausada para acelerar a Fase 2. Pode ser reativada com ACASALAMENTO_SYNC_RENASCER=true.',
            });
            await prisma.acasalamentoSource.update({
                where: { id: source.id },
                data: { status: 'PENDING', lastSyncAt: new Date(), lastError: 'Sincronização pausada temporariamente.' },
            });
            return { sourceCode: source.code, imported: 0, status: 'PENDING', skipped: true };
        } else if (source.code === 'RENASCER_BIOTECNOLOGIA') {
            candidates = await extractRenascerCandidates(source);
        } else if (source.code === 'ABS_PECPLAN') {
            candidates = await extractAbsCandidates(source);
        } else if (source.code === 'SEMEX') {
            candidates = await extractSemexCandidates(source);
        } else if (source.code === 'GENEX') {
            candidates = await extractGenexCandidates(source);
        } else if (source.code === 'ALTA_GENETICS') {
            candidates = await extractAltaCandidates(source);
        } else if (source.code === 'CRV_LAGOA') {
            candidates = await extractCrvCandidates(source);
        } else {
            const response = await fetchHtml(source.baseUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            candidates = extractCommercialCandidates({ html: response.text, source });
        }
        if (!candidates.length) {
            await createIssue(prisma, {
                source,
                severity: 'WARNING',
                message: 'Nenhum touro Nelore foi extraído automaticamente da central.',
                detail: source.code === 'ABS_PECPLAN'
                    ? 'A busca ABS BullSearch não retornou touros Nelore para os termos iniciais. A coleta foi registrada como pendência sem inventar dados.'
                    : 'O site pode exigir catálogo em PDF, busca dinâmica ou parser específico.',
            });
            await prisma.acasalamentoSource.update({
                where: { id: source.id },
                data: { status: 'PARTIAL', lastSyncAt: new Date(), lastError: 'Nenhum touro extraído automaticamente.' },
            });
            return { sourceCode: source.code, imported: 0, status: 'PARTIAL' };
        }

        for (const candidate of candidates) {
            await upsertCommercialBullCandidate(prisma, { source, candidate });
        }

        await prisma.acasalamentoSource.update({
            where: { id: source.id },
            data: { status: 'OK', lastSyncAt: new Date(), lastSuccessAt: new Date(), lastError: null },
        });
        if (source.code === 'RENASCER_BIOTECNOLOGIA') {
            const withPmgz = candidates.filter((candidate) => candidate.rawData?.hasPmgzMention || candidate.rawData?.pmgzImageUrls?.length).length;
            const withProgeny = candidates.filter((candidate) => candidate.rawData?.hasProgenyMention || candidate.rawData?.progenyImageUrls?.length).length;
            await createIssue(prisma, {
                source,
                severity: 'INFO',
                message: 'Renascer coletada com parser específico.',
                detail: `${candidates.length} touro(s) Nelore importado(s). ${withPmgz} com menção/imagem PMGZ no catálogo e ${withProgeny} com menção/imagem de progênie. Esses sinais comerciais não substituem a validação oficial ABCZ/PMGZ.`,
            });
        }
        if (source.code === 'ABS_PECPLAN') {
            const available = candidates.filter((candidate) => candidate.semenAvailable !== false).length;
            await createIssue(prisma, {
                source,
                severity: 'INFO',
                message: 'ABS Pecplan coletada pelo BullSearch.',
                detail: `${candidates.length} touro(s) Nelore importado(s), ${available} marcado(s) como comercialmente disponível(is). Esses registros são oferta comercial; a recomendação continua bloqueada até validação oficial ABCZ/PMGZ por característica.`,
            });
        }
        if (source.code === 'SEMEX') {
            await createIssue(prisma, {
                source,
                severity: 'INFO',
                message: 'Semex coletada por catálogo Corte Zebu.',
                detail: `${candidates.length} touro(s) Nelore importado(s) das listas públicas de Corte Zebu. Esses registros são oferta comercial; a recomendação continua bloqueada até validação oficial ABCZ/PMGZ por característica.`,
            });
        }
        if (source.code === 'GENEX') {
            const withOfficialKey = candidates.filter((candidate) => candidate.officialKeyNormalized).length;
            const withPmgz = candidates.filter((candidate) => candidate.rawData?.hasPmgzMention).length;
            await createIssue(prisma, {
                source,
                severity: 'INFO',
                message: 'Genex coletada pelo catálogo público Firestore.',
                detail: `${candidates.length} touro(s) Nelore ativo(s) importado(s), ${withOfficialKey} com série/RGD normalizados e ${withPmgz} com bloco PMGZ publicado no catálogo. A recomendação continua bloqueada até validação oficial ABCZ/PMGZ por característica.`,
            });
        }
        if (source.code === 'ALTA_GENETICS') {
            const withOfficialKey = candidates.filter((candidate) => candidate.officialKeyNormalized).length;
            await createIssue(prisma, {
                source,
                severity: 'INFO',
                message: 'Alta Genetics coletada pela busca pública de touros.',
                detail: `${candidates.length} touro(s) Nelore importado(s), ${withOfficialKey} com série/RGN normalizados. Esses registros são oferta comercial; a recomendação continua bloqueada até validação oficial ABCZ/PMGZ por característica.`,
            });
        }
        if (source.code === 'CRV_LAGOA') {
            const withOfficialKey = candidates.filter((candidate) => candidate.officialKeyNormalized).length;
            const withPmgz = candidates.filter((candidate) => candidate.rawData?.hasPmgzMention).length;
            const withAncp = candidates.filter((candidate) => candidate.rawData?.hasAncpMention).length;
            await createIssue(prisma, {
                source,
                severity: 'INFO',
                message: 'CRV Lagoa coletada pela API pública de touros.',
                detail: `${candidates.length} touro(s) Nelore importado(s), ${withOfficialKey} com série/RGN normalizados, ${withPmgz} com bloco PMGZ e ${withAncp} com bloco ANCP no catálogo. Esses registros são oferta comercial/técnica; a recomendação continua bloqueada até validação oficial ABCZ/PMGZ por característica.`,
            });
        }
        return { sourceCode: source.code, imported: candidates.length, status: 'OK' };
    } catch (error) {
        await createIssue(prisma, {
            source,
            severity: 'CRITICAL',
            message: 'Falha ao coletar central comercial.',
            detail: error?.message || error,
        });
        await prisma.acasalamentoSource.update({
            where: { id: source.id },
            data: { status: 'FAILED', lastSyncAt: new Date(), lastError: String(error?.message || error).slice(0, 500) },
        });
        return { sourceCode: source.code, imported: 0, status: 'FAILED' };
    }
};

const syncOfficialSource = async (prisma, source, options = {}) => {
    try {
        const response = await fetchHtml(source.baseUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const validation = await validateCommercialBullsAgainstOfficialSource(prisma, source, options);
        await createIssueOnce(prisma, {
            source,
            severity: 'INFO',
            message: 'Validação oficial ABCZ/PMGZ preparada.',
            detail: `${validation.checked} touro(s) comerciais Nelore consultado(s) na ABCZ. ${validation.verifiedIdentity} tiveram identidade oficial confirmada por série/RGN, ${validation.verifiedTraitProofs} prova(s) específicas tiveram DEP/DECA extraídas do PMGZ, ${validation.notFound} não foram encontrados e ${validation.failed + validation.pmgzFailed} falharam tecnicamente. Acurácia fica nula quando a tela pública do PMGZ não informa esse campo.`,
        });
        await prisma.acasalamentoSource.update({
            where: { id: source.id },
            data: {
                status: validation.checked ? 'PARTIAL' : 'OK',
                lastSyncAt: new Date(),
                lastSuccessAt: new Date(),
                lastError: validation.checked ? 'Touros comerciais aguardando consulta oficial por animal.' : null,
            },
        });
        return { sourceCode: source.code, imported: validation.checked, status: validation.checked ? 'PARTIAL' : 'OK', validation };
    } catch (error) {
        await createIssue(prisma, {
            source,
            severity: 'CRITICAL',
            message: 'Falha ao acessar fonte oficial de validação.',
            detail: error?.message || error,
        });
        await prisma.acasalamentoSource.update({
            where: { id: source.id },
            data: { status: 'FAILED', lastSyncAt: new Date(), lastError: String(error?.message || error).slice(0, 500) },
        });
        return { sourceCode: source.code, imported: 0, status: 'FAILED' };
    }
};

const normalizeSourceCodeList = (value) => {
    const raw = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];
    return raw.map((item) => normalizeRegistryPart(item)).filter(Boolean);
};

export const runSourcesSync = async (prisma, options = {}) => {
    const sources = await ensureSources(prisma);
    const sourceCodes = normalizeSourceCodeList(options.sourceCodes);
    const selectedSources = sourceCodes.length
        ? sources.filter((source) => sourceCodes.includes(normalizeRegistryPart(source.code)))
        : sources;
    const results = [];
    for (const source of selectedSources) {
        if (source.sourceType === 'COMMERCIAL_CENTER') {
            results.push(await syncCommercialSource(prisma, source));
        } else {
            results.push(await syncOfficialSource(prisma, source, options));
        }
    }
    return results;
};

const startSourcesSyncJob = (prisma, options = {}) => {
    if (syncJobState.running) {
        return { accepted: false, state: syncJobState };
    }
    syncJobState.running = true;
    syncJobState.lastStartedAt = new Date();
    syncJobState.lastFinishedAt = null;
    syncJobState.lastError = null;
    syncJobState.lastResults = [];
    runSourcesSync(prisma, options)
        .then((results) => {
            syncJobState.lastResults = results;
        })
        .catch((error) => {
            syncJobState.lastError = String(error?.message || error).slice(0, 500);
            console.error('Acasalamento sync job failed', error);
        })
        .finally(() => {
            syncJobState.running = false;
            syncJobState.lastFinishedAt = new Date();
        });
    return { accepted: true, state: syncJobState };
};

const serializeSyncJob = () => ({
    running: syncJobState.running,
    lastStartedAt: toIso(syncJobState.lastStartedAt),
    lastFinishedAt: toIso(syncJobState.lastFinishedAt),
    lastError: syncJobState.lastError,
    lastResults: syncJobState.lastResults,
});

const isAdminUser = (req) => {
    const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((role) => String(role).toLowerCase()) : [];
    return roles.includes('admin') || req.user?.membershipRole === 'OWNER' || req.saas?.membershipRole === 'OWNER';
};

const serializeSource = (source) => ({
    id: source.id,
    code: source.code,
    name: source.name,
    sourceType: source.sourceType,
    breed: source.breed,
    baseUrl: source.baseUrl,
    status: source.status,
    lastSyncAt: toIso(source.lastSyncAt),
    lastSuccessAt: toIso(source.lastSuccessAt),
    lastError: source.lastError,
    bullsCount: source._count?.bulls ?? undefined,
    listingsCount: source._count?.commercialListings ?? undefined,
    proofsCount: source._count?.officialProofs ?? undefined,
    issuesCount: source._count?.issues ?? undefined,
});

const serializeProof = (proof) => ({
    id: proof.id,
    registry: proof.registry,
    proofTrait: proof.proofTrait,
    traitLabel: proof.traitLabel,
    dep: proof.dep,
    deca: proof.deca,
    accuracy: proof.accuracy,
    progenyCount: proof.progenyCount,
    proofStatus: proof.proofStatus,
    referenceUrl: proof.referenceUrl,
    collectedAt: toIso(proof.collectedAt),
});

const serializeCommercialListing = (listing) => ({
    id: listing.id,
    central: listing.central,
    name: listing.name,
    registration: listing.registration,
    commercialUrl: listing.commercialUrl,
    semenAvailable: listing.semenAvailable,
    sourceStatus: listing.sourceStatus,
    lastSeenAt: toIso(listing.lastSeenAt),
    source: listing.source ? serializeSource(listing.source) : undefined,
});

const serializeBull = (bull) => ({
    id: bull.id,
    name: bull.name,
    registration: bull.registration,
    officialSeries: bull.officialSeries,
    officialRgn: bull.officialRgn,
    officialRegistryType: bull.officialRegistryType || 'UNKNOWN',
    officialKeyNormalized: bull.officialKeyNormalized,
    breed: bull.breed,
    central: bull.central,
    commercialUrl: bull.commercialUrl,
    semenAvailable: bull.semenAvailable,
    sourceStatus: bull.sourceStatus,
    lastSeenAt: toIso(bull.lastSeenAt),
    rawData: bull.rawData || null,
    source: bull.source ? serializeSource(bull.source) : undefined,
    commercialListings: Array.isArray(bull.commercialListings) ? bull.commercialListings.map(serializeCommercialListing) : [],
    officialProofs: Array.isArray(bull.officialProofs) ? bull.officialProofs.map(serializeProof) : [],
});

const serializeIssue = (issue) => ({
    id: issue.id,
    sourceCode: issue.sourceCode,
    severity: issue.severity,
    message: issue.message,
    detail: issue.detail,
    referenceUrl: issue.referenceUrl,
    resolvedAt: toIso(issue.resolvedAt),
    createdAt: toIso(issue.createdAt),
    source: issue.source ? { code: issue.source.code, name: issue.source.name } : null,
});

const serializeSession = (session) => ({
    id: session.id,
    organizationId: session.organizationId,
    farmId: session.farmId,
    targetMode: session.targetMode,
    objective: session.objective,
    breed: session.breed,
    inputSnapshot: session.inputSnapshot,
    summary: session.summary,
    createdAt: toIso(session.createdAt),
    results: Array.isArray(session.results) ? session.results.map((result) => ({
        id: result.id,
        rank: result.rank,
        score: result.score,
        status: result.status,
        reason: result.reason,
        alerts: result.alerts,
        proofSnapshot: result.proofSnapshot,
        commercialSnapshot: result.commercialSnapshot,
        bull: result.bull ? serializeBull(result.bull) : null,
    })) : [],
});

const scoreProof = (proof, objective) => {
    const config = OBJECTIVE_CONFIG[objective];
    const dep = typeof proof.dep === 'number' ? proof.dep : 0;
    const decaScore = typeof proof.deca === 'number' ? Math.max(0, 10 - proof.deca) : 0;
    const accuracy = typeof proof.accuracy === 'number' ? proof.accuracy : 0;
    return (dep * config.depWeight) + (decaScore * 3) + (accuracy * config.accuracyWeight);
};

const normalizeInventoryKey = (value) => normalizeRegistryPart(value) || normalizeBullName(value).replace(/\s+/g, '');

const buildSemenInventory = async ({ prisma, farmId }) => {
    const batches = await prisma.semenBatch.findMany({
        where: { farmId, dosesDisponiveis: { gt: 0 } },
        include: { bullAnimal: true, bullPoAnimal: true },
        orderBy: { createdAt: 'desc' },
    });
    const byKey = new Map();
    for (const batch of batches) {
        const keys = [
            normalizeInventoryKey(batch.bullRegistry),
            normalizeInventoryKey(batch.bullName),
            normalizeInventoryKey(batch.bullAnimal?.registro),
            normalizeInventoryKey(batch.bullAnimal?.brinco),
            normalizeInventoryKey(batch.bullPoAnimal?.registro),
            normalizeInventoryKey(batch.bullPoAnimal?.nome),
        ].filter(Boolean);
        for (const key of keys) {
            const current = byKey.get(key) || {
                dosesDisponiveis: 0,
                batches: [],
            };
            current.dosesDisponiveis += batch.dosesDisponiveis;
            current.batches.push({
                id: batch.id,
                lote: batch.lote,
                bullName: batch.bullName || batch.bullAnimal?.brinco || batch.bullPoAnimal?.nome || null,
                bullRegistry: batch.bullRegistry || batch.bullAnimal?.registro || batch.bullPoAnimal?.registro || null,
                fornecedor: batch.fornecedor || null,
                localArmazenamento: batch.localArmazenamento || null,
                dosesDisponiveis: batch.dosesDisponiveis,
            });
            byKey.set(key, current);
        }
    }
    return byKey;
};

const getBullInventoryMatch = (bull, inventory) => {
    const keys = [
        bull.officialKeyNormalized,
        buildOfficialKeyNormalized(bull.officialSeries, bull.officialRgn),
        normalizeInventoryKey(bull.registration),
        normalizeInventoryKey(bull.name),
    ].filter(Boolean);
    for (const key of keys) {
        const match = inventory.get(key);
        if (match) return match;
    }
    return null;
};

const getAvailabilitySnapshot = (bull, inventoryMatch) => {
    const listings = Array.isArray(bull.commercialListings) ? bull.commercialListings : [];
    const availableListings = listings.filter((listing) => listing.semenAvailable);
    const hasCentral = availableListings.length ? true : Boolean(bull.semenAvailable);
    const hasInventory = Boolean(inventoryMatch?.dosesDisponiveis);
    const origin = hasCentral && hasInventory
        ? 'CENTRAL_AND_FARM'
        : hasInventory
            ? 'FARM_INVENTORY'
            : hasCentral
                ? 'COMMERCIAL_CENTER'
                : 'NONE';
    return {
        hasCentral,
        hasInventory,
        origin,
        label: origin === 'CENTRAL_AND_FARM'
            ? 'Central + botijão'
            : origin === 'FARM_INVENTORY'
                ? 'Botijão da fazenda'
                : origin === 'COMMERCIAL_CENTER'
                    ? 'Central comercial'
                    : 'Indisponível',
        commercialCenters: availableListings.length
            ? availableListings.map((listing) => ({
                central: listing.central,
                commercialUrl: listing.commercialUrl,
                sourceStatus: listing.sourceStatus,
            }))
            : (bull.semenAvailable ? [{ central: bull.central, commercialUrl: bull.commercialUrl, sourceStatus: bull.sourceStatus }] : []),
        farmDosesAvailable: inventoryMatch?.dosesDisponiveis || 0,
        farmBatches: inventoryMatch?.batches || [],
    };
};

const buildTargetSnapshot = async ({ prisma, farmId, targetMode, lotIds, animalIds, uploadedLots }) => {
    if (targetMode === 'UPLOAD') {
        const lots = Array.isArray(uploadedLots) ? uploadedLots : [];
        const totalHeads = lots.reduce((sum, item) => sum + (Number(item.quantidade_cabecas || item.quantity || 0) || 0), 0);
        const avgWeight = lots.length
            ? lots.reduce((sum, item) => sum + (Number(item.peso_medio || item.averageWeight || 0) || 0), 0) / lots.length
            : null;
        return { lots, animals: [], totalHeads, averageWeight: avgWeight };
    }

    const lotFilter = Array.isArray(lotIds) && lotIds.length ? { lotId: { in: lotIds.map(String) } } : {};
    const animalFilter = Array.isArray(animalIds) && animalIds.length ? { id: { in: animalIds.map(String) } } : {};
    const animals = await prisma.animal.findMany({
        where: {
            farmId,
            sexo: 'FEMEA',
            ...(targetMode === 'LOT' ? lotFilter : {}),
            ...(targetMode === 'INDIVIDUAL' || targetMode === 'GROUP' ? animalFilter : {}),
        },
        include: { lot: true },
        orderBy: { brinco: 'asc' },
    });
    const weights = animals.map((animal) => animal.pesoAtual).filter((value) => typeof value === 'number' && Number.isFinite(value));
    const averageWeight = weights.length ? weights.reduce((sum, value) => sum + value, 0) / weights.length : null;
    return {
        animals: animals.map((animal) => ({
            id: animal.id,
            brinco: animal.brinco,
            raca: animal.raca,
            pesoAtual: animal.pesoAtual,
            categoria: animal.categoria,
            lotId: animal.lotId,
            lotName: animal.lot?.name || null,
        })),
        lots: [],
        totalHeads: animals.length,
        averageWeight,
    };
};

const buildRecommendation = async ({ prisma, farm, req, payload }) => {
    const objective = normalizeObjective(payload.objective);
    const targetMode = normalizeTargetMode(payload.targetMode || payload.mode);
    if (!objective || !targetMode) {
        const error = new Error('Objetivo ou modo de análise inválido.');
        error.statusCode = 400;
        throw error;
    }

    const target = await buildTargetSnapshot({
        prisma,
        farmId: farm.id,
        targetMode,
        lotIds: payload.lotIds,
        animalIds: payload.animalIds,
        uploadedLots: payload.uploadedLots,
    });

    if (!target.totalHeads) {
        const error = new Error('Informe pelo menos um lote, matriz ou planilha com dados válidos.');
        error.statusCode = 400;
        throw error;
    }

    const commercialBulls = await prisma.acasalamentoBull.findMany({
        where: { breed: 'Nelore' },
        include: { source: true, commercialListings: { include: { source: true } }, officialProofs: { include: { source: true } } },
        orderBy: [{ central: 'asc' }, { name: 'asc' }],
        take: 300,
    });
    const semenInventory = await buildSemenInventory({ prisma, farmId: farm.id });
    const availabilityMode = payload.availabilityMode === 'FARM_INVENTORY_ONLY' ? 'FARM_INVENTORY_ONLY' : 'MARKET_AND_FARM';
    const requiredDoses = Math.ceil(target.totalHeads * 1.15);

    const config = OBJECTIVE_CONFIG[objective];
    const recommended = [];
    const blocked = [];

    for (const bull of commercialBulls) {
        const inventoryMatch = getBullInventoryMatch(bull, semenInventory);
        const availability = getAvailabilitySnapshot(bull, inventoryMatch);
        if (availabilityMode === 'FARM_INVENTORY_ONLY' && !availability.hasInventory) {
            blocked.push({ bull: serializeBull(bull), category: 'SEM_ESTOQUE_BOTIJAO', reason: 'Touro fora do botijão da fazenda para a análise restrita ao estoque próprio.' });
            continue;
        }
        if (!availability.hasCentral && !availability.hasInventory) {
            blocked.push({ bull: serializeBull(bull), category: 'SEM_DISPONIBILIDADE', reason: 'Touro sem disponibilidade comercial de sêmen e sem doses no botijão da fazenda.' });
            continue;
        }
        if (availabilityMode === 'FARM_INVENTORY_ONLY' && availability.farmDosesAvailable < requiredDoses) {
            blocked.push({ bull: serializeBull(bull), category: 'ESTOQUE_INSUFICIENTE', reason: `Botijão possui ${availability.farmDosesAvailable} dose(s), abaixo das ${requiredDoses} dose(s) estimadas para IATF.` });
            continue;
        }
        if (!bull.officialKeyNormalized && !bull.officialSeries && !bull.officialRgn) {
            const reviewSignals = getBullReviewSignals(bull);
            blocked.push({
                bull: serializeBull(bull),
                category: reviewSignals.relevant ? 'PENDENTE_IDENTIDADE_RELEVANTE' : 'SEM_SERIE_RGN',
                reason: reviewSignals.relevant
                    ? 'Touro com sinais genéticos/comerciais relevantes, mas ainda sem identidade oficial ABCZ confirmada. Não descartado; fica em revisão assistida.'
                    : 'Touro sem série/RGN confiáveis para bater na ABCZ/PMGZ.',
                reviewSignals,
            });
            continue;
        }
        const proof = bull.officialProofs.find((item) =>
            item.proofStatus === 'VERIFIED' && config.requiredTraits.includes(item.proofTrait),
        );
        if (!proof) {
            blocked.push({
                bull: serializeBull(bull),
                category: 'SEM_PROVA_OFICIAL',
                reason: `Touro encontrado na central, mas sem comprovação oficial de ${config.label.toLowerCase()} na ABCZ/PMGZ. Não recomendado.`,
            });
            continue;
        }
        const score = scoreProof(proof, objective);
        const alerts = [];
        if (target.averageWeight !== null && target.averageWeight < 350 && objective !== 'NASCIMENTO') {
            const birthProof = bull.officialProofs.find((item) => item.proofStatus === 'VERIFIED' && item.proofTrait === 'NASCIMENTO');
            if (!birthProof) {
                alerts.push('Grupo com peso médio abaixo de 350 kg: falta prova oficial de nascimento/facilidade de parto.');
                blocked.push({ bull: serializeBull(bull), category: 'RISCO_PARTO', reason: 'Grupo leve/novilha sem prova oficial de nascimento ou facilidade de parto.' });
                continue;
            }
        }
        recommended.push({ bull, proof, score, alerts, availability });
    }

    recommended.sort((a, b) => b.score - a.score);
    const top = recommended.slice(0, 10);

    const session = await prisma.acasalamentoSession.create({
        data: {
            organizationId: req.saas.organizationId,
            farmId: farm.id,
            createdById: req.user.id,
            targetMode,
            objective,
            breed: 'Nelore',
            inputSnapshot: {
                objective,
                targetMode,
                lotIds: payload.lotIds || [],
                animalIds: payload.animalIds || [],
                uploadedLots: payload.uploadedLots || [],
                availabilityMode,
                target,
            },
            summary: {
                totalCommercialBulls: commercialBulls.length,
                recommendedCount: top.length,
                blockedCount: blocked.length,
                targetHeads: target.totalHeads,
                averageWeight: target.averageWeight,
                requiredDoses,
                availabilityMode,
            },
            results: {
                create: top.map((item, index) => ({
                    bullId: item.bull.id,
                    rank: index + 1,
                    score: Number(item.score.toFixed(4)),
                    status: 'RECOMMENDED',
                    reason: `Comprovação oficial de ${config.label.toLowerCase()} encontrada e disponibilidade confirmada: ${item.availability.label}.`,
                    alerts: item.alerts,
                    proofSnapshot: serializeProof(item.proof),
                    commercialSnapshot: {
                        ...serializeBull(item.bull),
                        availability: item.availability,
                    },
                })),
            },
        },
        include: { results: { include: { bull: { include: { source: true, commercialListings: { include: { source: true } }, officialProofs: true } } }, orderBy: { rank: 'asc' } } },
    });

    return { session, recommended: session.results, blocked: blocked.slice(0, 30) };
};

export function registerAcasalamentoRoutes({ app, prisma, buildFarmScopeFilter, buildFarmRelationFilter }) {
    app.get('/genetics/acasalamento/sources/status', async (_req, res) => {
        try {
            await ensureSources(prisma);
            const sources = await prisma.acasalamentoSource.findMany({
                orderBy: [{ sourceType: 'asc' }, { name: 'asc' }],
                include: { _count: { select: { bulls: true, commercialListings: true, officialProofs: true, issues: true } } },
            });
            return res.json({ sources: sources.map(serializeSource), syncJob: serializeSyncJob() });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar status das fontes.' });
        }
    });

    app.post('/genetics/acasalamento/sources/sync', async (req, res) => {
        try {
            if (!isAdminUser(req)) {
                return res.status(403).json({ message: 'Sincronização técnica disponível apenas para administradores.' });
            }
            const job = startSourcesSyncJob(prisma, { sourceCodes: req.body?.sourceCodes || req.query?.sourceCodes });
            return res.status(job.accepted ? 202 : 409).json({ syncJob: serializeSyncJob() });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao sincronizar fontes.' });
        }
    });

    app.post('/genetics/acasalamento/admin/sources/sync', async (req, res) => {
        try {
            if (!isAdminUser(req)) {
                return res.status(403).json({ message: 'Acesso administrativo obrigatório.' });
            }
            const job = startSourcesSyncJob(prisma, { sourceCodes: req.body?.sourceCodes || req.query?.sourceCodes });
            return res.status(job.accepted ? 202 : 409).json({ syncJob: serializeSyncJob() });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao iniciar sincronização administrativa.' });
        }
    });

    app.post('/genetics/acasalamento/admin/bulls/import', async (req, res) => {
        try {
            if (!isAdminUser(req)) {
                return res.status(403).json({ message: 'Acesso administrativo obrigatório.' });
            }

            const rows = Array.isArray(req.body?.bulls)
                ? req.body.bulls
                : Array.isArray(req.body?.items)
                    ? req.body.items
                    : [];
            if (!rows.length) {
                return res.status(400).json({ message: 'Envie uma lista em bulls ou items.' });
            }
            if (rows.length > 3000) {
                return res.status(400).json({ message: 'Importe no máximo 3000 touros por lote.' });
            }

            const imported = [];
            const errors = [];
            const sourceStats = new Map();

            for (const [index, item] of rows.entries()) {
                try {
                    const source = await resolveCommercialSource(prisma, {
                        sourceCode: item.sourceCode || item.source || req.body.sourceCode,
                        central: item.central || item.centralName || req.body.central,
                    });
                    if (!source) {
                        throw new Error('Central não reconhecida. Use uma das centrais oficiais da Fase 2.');
                    }

                    const candidate = normalizeCommercialBullCandidate({
                        item,
                        source,
                        extraction: 'admin-controlled-import',
                    });
                    const bull = await upsertCommercialBullCandidate(prisma, { source, candidate });
                    const stat = sourceStats.get(source.id) || {
                        source,
                        imported: 0,
                        withOfficialKey: 0,
                        withoutOfficialKey: 0,
                    };
                    stat.imported += 1;
                    if (bull.officialKeyNormalized) stat.withOfficialKey += 1;
                    else stat.withoutOfficialKey += 1;
                    sourceStats.set(source.id, stat);
                    imported.push(serializeBull({ ...bull, officialProofs: [] }));
                } catch (error) {
                    errors.push({
                        row: index + 1,
                        message: error?.message || 'Erro ao importar touro.',
                    });
                }
            }

            for (const stat of sourceStats.values()) {
                await prisma.acasalamentoSource.update({
                    where: { id: stat.source.id },
                    data: {
                        status: stat.withoutOfficialKey ? 'PARTIAL' : 'OK',
                        lastSyncAt: new Date(),
                        lastSuccessAt: new Date(),
                        lastError: stat.withoutOfficialKey ? `${stat.withoutOfficialKey} touro(s) importado(s) sem série/RGN.` : null,
                    },
                });
                await createIssueOnce(prisma, {
                    source: stat.source,
                    severity: stat.withoutOfficialKey ? 'WARNING' : 'INFO',
                    message: 'Importação comercial controlada concluída.',
                    detail: `${stat.imported} touro(s) importado(s) para ${stat.source.name}. ${stat.withOfficialKey} com série/RGN normalizados e ${stat.withoutOfficialKey} pendente(s) de chave oficial.`,
                    referenceUrl: stat.source.baseUrl,
                });
            }

            return res.status(errors.length ? 207 : 201).json({
                importedCount: imported.length,
                errorCount: errors.length,
                sources: Array.from(sourceStats.values()).map((stat) => ({
                    sourceCode: stat.source.code,
                    sourceName: stat.source.name,
                    imported: stat.imported,
                    withOfficialKey: stat.withOfficialKey,
                    withoutOfficialKey: stat.withoutOfficialKey,
                })),
                bulls: imported.slice(0, 100),
                errors,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao importar touros comerciais.' });
        }
    });

    app.get('/genetics/acasalamento/bulls', async (req, res) => {
        try {
            await ensureSources(prisma);
            const { central, search } = req.query || {};
            const searchTerm = typeof search === 'string' ? normalizeBullName(search) : '';
            const bulls = await prisma.acasalamentoBull.findMany({
                where: {
                    breed: 'Nelore',
                    ...(central ? {
                        OR: [
                            { central: String(central) },
                            { commercialListings: { some: { central: String(central) } } },
                        ],
                    } : {}),
                    ...(searchTerm ? { normalizedName: { contains: searchTerm, mode: 'insensitive' } } : {}),
                },
                include: { source: true, commercialListings: { include: { source: true } }, officialProofs: true },
                orderBy: [{ central: 'asc' }, { name: 'asc' }],
                take: 200,
            });
            return res.json({ bulls: bulls.map(serializeBull), total: bulls.length });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar touros comerciais.' });
        }
    });

    app.get('/genetics/acasalamento/bulls/:id', async (req, res) => {
        try {
            const bull = await prisma.acasalamentoBull.findUnique({
                where: { id: String(req.params.id) },
                include: { source: true, commercialListings: { include: { source: true } }, officialProofs: { include: { source: true } } },
            });
            if (!bull) return res.status(404).json({ message: 'Touro não encontrado.' });
            return res.json({ bull: serializeBull(bull) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar touro.' });
        }
    });

    app.get('/genetics/acasalamento/lots', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) return res.status(400).json({ message: 'Informe a fazenda.' });
        try {
            const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const [lots, animals] = await Promise.all([
                prisma.lot.findMany({ where: { farmId: farm.id }, include: { _count: { select: { animals: true } } }, orderBy: { name: 'asc' } }),
                prisma.animal.findMany({ where: { farmId: farm.id, sexo: 'FEMEA' }, orderBy: { brinco: 'asc' }, take: 500 }),
            ]);
            return res.json({
                lots: lots.map((lot) => ({ id: lot.id, name: lot.name, animalsCount: lot._count.animals })),
                animals: animals.map((animal) => ({ id: animal.id, brinco: animal.brinco, raca: animal.raca, pesoAtual: animal.pesoAtual, lotId: animal.lotId })),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar lotes e matrizes.' });
        }
    });

    app.post('/genetics/acasalamento/recommendations', async (req, res) => {
        const { farmId } = req.body || {};
        if (!farmId) return res.status(400).json({ message: 'Informe a fazenda.' });
        try {
            const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const result = await buildRecommendation({ prisma, farm, req, payload: req.body || {} });
            return res.status(201).json({
                session: serializeSession(result.session),
                blocked: result.blocked,
            });
        } catch (error) {
            if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
            console.error(error);
            return res.status(500).json({ message: 'Erro ao gerar recomendação de acasalamento.' });
        }
    });

    app.get('/genetics/acasalamento/sessions', async (req, res) => {
        const { farmId } = req.query || {};
        if (!farmId) return res.status(400).json({ message: 'Informe a fazenda.' });
        try {
            const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
            if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada.' });
            const sessions = await prisma.acasalamentoSession.findMany({
                where: { farmId: farm.id, farm: buildFarmRelationFilter(req) },
                include: { results: { include: { bull: { include: { source: true, commercialListings: { include: { source: true } }, officialProofs: true } } }, orderBy: { rank: 'asc' } } },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
            return res.json({ sessions: sessions.map(serializeSession) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar sessões de acasalamento.' });
        }
    });

    app.get('/genetics/acasalamento/sessions/:id', async (req, res) => {
        try {
            const session = await prisma.acasalamentoSession.findFirst({
                where: { id: String(req.params.id), farm: buildFarmRelationFilter(req) },
                include: { results: { include: { bull: { include: { source: true, commercialListings: { include: { source: true } }, officialProofs: true } } }, orderBy: { rank: 'asc' } } },
            });
            if (!session) return res.status(404).json({ message: 'Sessão não encontrada.' });
            return res.json({ session: serializeSession(session) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar sessão de acasalamento.' });
        }
    });

    app.get('/genetics/acasalamento/collection-issues', async (_req, res) => {
        try {
            const issues = await prisma.acasalamentoCollectionIssue.findMany({
                where: { resolvedAt: null },
                include: { source: true },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            return res.json({ issues: issues.map(serializeIssue) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao listar pendências de coleta.' });
        }
    });
}
