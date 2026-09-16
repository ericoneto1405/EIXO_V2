// ─── Validações e Consultas Externas ───────────────────────────────────────────

export function isPasswordStrongEnough(value) {
    const password = String(value || '');
    return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function validateCNPJ(cnpj) {
    const n = String(cnpj || '').replace(/\D/g, '');
    if (n.length !== 14) return false;
    if (/^(\d)\1+$/.test(n)) return false;
    let sum = 0;
    let weight = 5;
    for (let index = 0; index < 12; index += 1) {
        sum += Number.parseInt(n[index], 10) * weight;
        weight = weight === 2 ? 9 : weight - 1;
    }
    const d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (Number.parseInt(n[12], 10) !== d1) return false;
    sum = 0;
    weight = 6;
    for (let index = 0; index < 13; index += 1) {
        sum += Number.parseInt(n[index], 10) * weight;
        weight = weight === 2 ? 9 : weight - 1;
    }
    const d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return Number.parseInt(n[13], 10) === d2;
}

export function validateCPF(cpf) {
    const n = String(cpf || '').replace(/\D/g, '');
    if (n.length !== 11) return false;
    if (/^(\d)\1+$/.test(n)) return false;
    let sum = 0;
    for (let index = 0; index < 9; index += 1) {
        sum += Number.parseInt(n[index], 10) * (10 - index);
    }
    const d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (Number.parseInt(n[9], 10) !== d1) return false;
    sum = 0;
    for (let index = 0; index < 10; index += 1) {
        sum += Number.parseInt(n[index], 10) * (11 - index);
    }
    const d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return Number.parseInt(n[10], 10) === d2;
}

// Normaliza resposta do CNPJ.ws para o formato padrão interno
function normalizeCnpjWs(data) {
    const est = data?.estabelecimento || {};
    const telefone = [(est.ddd1 || ''), (est.telefone1 || '')].filter(Boolean).join('');
    const logradouro = [
        est.tipo_logradouro,
        est.logradouro,
        est.numero,
        est.complemento,
    ].filter(Boolean).join(' ');
    return {
        cnpj: est.cnpj || '',
        razao_social: data.razao_social || '',
        nome_fantasia: est.nome_fantasia || '',
        descricao_situacao_cadastral: String(est.situacao_cadastral || '').toUpperCase(),
        cnae_fiscal_descricao: est.atividade_principal?.descricao || '',
        logradouro,
        bairro: est.bairro || '',
        cep: est.cep || '',
        municipio: est.municipio?.nome || '',
        uf: est.estado?.sigla || '',
        telefone,
        email: est.email || '',
    };
}

// Normaliza resposta da Minha Receita para o formato padrão interno
function normalizeMinhareceita(data) {
    const logradouro = [
        data.descricao_tipo_de_logradouro,
        data.logradouro,
        data.numero,
        data.complemento,
    ].filter(Boolean).join(' ');
    return {
        cnpj: data.cnpj || '',
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || '',
        descricao_situacao_cadastral: String(data.descricao_situacao_cadastral || '').toUpperCase(),
        cnae_fiscal_descricao: data.cnae_fiscal_descricao || '',
        logradouro,
        bairro: data.bairro || '',
        cep: data.cep || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        telefone: data.ddd_telefone_1 || '',
        email: data.email || '',
    };
}

// Busca dados do CNPJ com fallback: CNPJ.ws → Minha Receita
export async function fetchCnpjData(cnpj) {
    const n = String(cnpj || '').replace(/\D/g, '');

    // 1ª tentativa: CNPJ.ws
    try {
        const res = await fetch(`https://publica.cnpj.ws/cnpj/${n}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.razao_social) {
            return normalizeCnpjWs(data);
        }
    } catch (e) {
        console.warn('CNPJ.ws falhou, tentando Minha Receita...', e?.message);
    }

    // 2ª tentativa: Minha Receita
    try {
        const res = await fetch(`https://minhareceita.org/${n}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.razao_social) {
            return normalizeMinhareceita(data);
        }
        const error = new Error(data?.message || 'CNPJ não encontrado na Receita Federal.');
        error.statusCode = res.status;
        throw error;
    } catch (e) {
        if (e?.statusCode) throw e;
        const error = new Error('Não foi possível consultar a Receita Federal. Tente novamente.');
        error.statusCode = 503;
        throw error;
    }
}

export function parseCoordinate(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string' && value.trim() === '') {
        return null;
    }
    const normalizedValue = typeof value === 'string' ? value.trim().replace(',', '.') : value;
    const parsed = Number(normalizedValue);
    return Number.isFinite(parsed) ? parsed : null;
}

export function validateCoordinatePair(lat, lng) {
    if ((lat === null) !== (lng === null)) {
        return 'Informe latitude e longitude juntas.';
    }
    if (lat !== null && (lat < -90 || lat > 90)) {
        return 'Latitude inválida. Use um valor entre -90 e 90.';
    }
    if (lng !== null && (lng < -180 || lng > 180)) {
        return 'Longitude inválida. Use um valor entre -180 e 180.';
    }
    return null;
}

const UF_IBGE_PREFIX = {
    RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
    MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
    MG: '31', ES: '32', RJ: '33', SP: '35',
    PR: '41', SC: '42', RS: '43',
    MS: '50', MT: '51', GO: '52', DF: '53',
};

// Estado e código IBGE são opcionais (fazendas antigas não têm), mas se vierem precisam bater entre si:
// é o código IBGE que decide regra sanitária por município.
export function parseFarmLocation(uf, ibgeCode) {
    const cleanUf = typeof uf === 'string' ? uf.trim().toUpperCase() : '';
    const cleanCode = ibgeCode === undefined || ibgeCode === null ? '' : String(ibgeCode).trim();
    if (!cleanUf && !cleanCode) return { uf: null, ibgeCode: null };
    if (!UF_IBGE_PREFIX[cleanUf]) return { error: 'Estado inválido.' };
    if (!cleanCode) return { uf: cleanUf, ibgeCode: null };
    if (!/^\d{7}$/.test(cleanCode) || !cleanCode.startsWith(UF_IBGE_PREFIX[cleanUf])) {
        return { error: 'Município não pertence ao estado escolhido.' };
    }
    return { uf: cleanUf, ibgeCode: cleanCode };
}
