// Dados por estado usados pelos lembretes. Órgão de defesa = onde o produtor comprova
// vacinação e confirma se a raiva é obrigatória no município.
// Meses de vermífugo e carrapato são SUGESTÕES por região (a fazenda ajusta com o veterinário).

const REGIOES = {
    CENTRO_SUL_SECO: { vermifugo: [5, 7, 9], carrapato: [10, 11, 12] },
    NORTE: { vermifugo: [6, 8, 10], carrapato: [11, 12, 1] },
    NORDESTE: { vermifugo: [7, 9, 11], carrapato: [2, 3, 4] },
    SUL: { vermifugo: [4, 6, 8], carrapato: [9, 10, 11] },
};

export const UF_INFO = {
    RO: { orgao: 'IDARON', regiao: 'NORTE' },
    AC: { orgao: 'IDAF-AC', regiao: 'NORTE' },
    AM: { orgao: 'ADAF', regiao: 'NORTE' },
    RR: { orgao: 'ADERR', regiao: 'NORTE' },
    PA: { orgao: 'ADEPARÁ', regiao: 'NORTE' },
    AP: { orgao: 'DIAGRO', regiao: 'NORTE' },
    TO: { orgao: 'ADAPEC', regiao: 'CENTRO_SUL_SECO' },
    MA: { orgao: 'AGED-MA', regiao: 'CENTRO_SUL_SECO' },
    PI: { orgao: 'ADAPI', regiao: 'CENTRO_SUL_SECO' },
    CE: { orgao: 'ADAGRI', regiao: 'NORDESTE' },
    RN: { orgao: 'IDIARN', regiao: 'NORDESTE' },
    PB: { orgao: 'SEDAP-PB', regiao: 'NORDESTE' },
    PE: { orgao: 'ADAGRO', regiao: 'NORDESTE' },
    AL: { orgao: 'ADEAL', regiao: 'NORDESTE' },
    SE: { orgao: 'EMDAGRO', regiao: 'NORDESTE' },
    BA: { orgao: 'ADAB', regiao: 'CENTRO_SUL_SECO' },
    MG: { orgao: 'IMA', regiao: 'CENTRO_SUL_SECO' },
    ES: { orgao: 'IDAF-ES', regiao: 'CENTRO_SUL_SECO' },
    RJ: { orgao: 'Defesa Agropecuária do RJ', regiao: 'CENTRO_SUL_SECO' },
    SP: { orgao: 'CDA-SP', regiao: 'CENTRO_SUL_SECO' },
    PR: { orgao: 'ADAPAR', regiao: 'SUL' },
    SC: { orgao: 'CIDASC', regiao: 'SUL' },
    RS: { orgao: 'Secretaria da Agricultura do RS', regiao: 'SUL' },
    MS: { orgao: 'IAGRO', regiao: 'CENTRO_SUL_SECO' },
    MT: { orgao: 'INDEA-MT', regiao: 'CENTRO_SUL_SECO' },
    GO: { orgao: 'AGRODEFESA', regiao: 'CENTRO_SUL_SECO' },
    DF: { orgao: 'SEAGRI-DF', regiao: 'CENTRO_SUL_SECO' },
};

export function infoDoEstado(uf) {
    const info = UF_INFO[String(uf || '').toUpperCase()];
    if (!info) {
        return { uf: null, orgao: 'órgão de defesa agropecuária do seu estado', linkBusca: null, ...REGIOES.CENTRO_SUL_SECO, regiaoConhecida: false };
    }
    const orgaoBusca = `${info.orgao} ${uf} vacinação raiva brucelose`;
    return {
        uf: String(uf).toUpperCase(),
        orgao: info.orgao,
        linkBusca: `https://www.google.com/search?q=${encodeURIComponent(orgaoBusca)}`,
        vermifugo: REGIOES[info.regiao].vermifugo,
        carrapato: REGIOES[info.regiao].carrapato,
        regiaoConhecida: true,
    };
}
