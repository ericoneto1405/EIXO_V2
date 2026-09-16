// Lista EIXO de remédios e vacinas (marca + laboratório).
// Regra: carência vem da BULA do produto, nunca do princípio ativo — a mesma molécula
// muda de carência conforme concentração e formulação (ex.: ivermectina 1% x 3,15%).
// Só entra item com fonte e data de conferência. Carência desconhecida fica null
// e o produto não libera venda até o usuário preencher.
//
// Campos:
//   key            identificador fixo (não mudar depois de publicado)
//   brand          nome comercial
//   laboratory     laboratório fabricante
//   activeIngredient, category (mesmas categorias da Farmácia)
//   presentation   texto livre curto
//   route          via de aplicação
//   dose           texto da bula
//   slaughterWithdrawalDays / milkWithdrawalDays  (null = não informado na bula / não usar)
//   refrigerated
//   tags           marcações usadas pelas regras da Sanidade (ex.: BRUCELOSE_B19)
//   notes          cuidados de uso
//   source         de onde saiu a carência
//   reviewedAt     data da conferência (AAAA-MM-DD)

export const PHARMACY_CATALOG_REVISION = '2026-09-16.1';

const BULA = 'bula publicada (bulario.vet.br)';

export const PHARMACY_CATALOG = [
    // ── Vacinas obrigatórias ──
    {
        key: 'abor-vac-zoetis', brand: 'Abor-Vac', laboratory: 'Zoetis',
        activeIngredient: 'Brucella abortus amostra B19 (viva)', category: 'VACINA', tags: ['BRUCELOSE_B19'],
        presentation: 'Liofilizada + diluente', route: 'Subcutânea, atrás da paleta', dose: '2 mL, dose única',
        slaughterWithdrawalDays: null, milkWithdrawalDays: null, refrigerated: true,
        notes: 'Só fêmeas de 3 a 8 meses. Nunca em machos. Usar até 2 h após reconstituir. Aplicação por veterinário cadastrado. Evitar contato com olhos, boca e pele. Carência não consta na bula.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'bovilis-rb51-msd', brand: 'Bovilis RB-51', laboratory: 'MSD Saúde Animal',
        activeIngredient: 'Brucella abortus amostra RB51 (viva)', category: 'VACINA', tags: ['BRUCELOSE_RB51'],
        presentation: 'Liofilizada + diluente', route: 'Subcutânea', dose: '2 mL',
        slaughterWithdrawalDays: 21, milkWithdrawalDays: null, refrigerated: true,
        notes: 'Fêmeas acima de 8 meses não vacinadas com B19 na idade certa. Nunca em machos. Usar até 60 min após reconstituir. Aplicador com luvas e óculos.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'raivacel-multi-msd', brand: 'Raivacel Multi', laboratory: 'MSD Saúde Animal (antiga Vallée)',
        activeIngredient: 'Vírus da raiva inativado', category: 'VACINA', tags: ['RAIVA'],
        presentation: 'Frasco multidose', route: 'Intramuscular ou subcutânea', dose: '2 mL',
        slaughterWithdrawalDays: null, milkWithdrawalDays: null, refrigerated: true,
        notes: 'Primovacinados: reforço 30 dias após a 1ª dose. Revacinação anual. Não congelar. Carência não consta na bula.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    // ── Vacinas estratégicas ──
    {
        key: 'sintoxan-polivalente-t-boehringer', brand: 'Sintoxan Polivalente T', laboratory: 'Boehringer Ingelheim (antiga Merial)',
        activeIngredient: 'Clostridioses + tétano (inativada)', category: 'VACINA', tags: ['CLOSTRIDIOSE'],
        presentation: 'Frasco multidose', route: 'Subcutânea, tábua do pescoço', dose: '3 mL',
        slaughterWithdrawalDays: null, milkWithdrawalDays: null, refrigerated: true,
        notes: 'Primovacinação: 2 doses com 4 a 6 semanas de intervalo. Revacinação anual. Agitar antes de usar. Não vacinar animais doentes ou estressados. Carência não consta na bula.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'bovilis-poli-star-t-msd', brand: 'Bovilis Poli-Star T', laboratory: 'MSD Saúde Animal',
        activeIngredient: 'Clostridioses + tétano + botulismo (inativada)', category: 'VACINA', tags: ['CLOSTRIDIOSE', 'BOTULISMO'],
        presentation: 'Frasco multidose', route: 'Subcutânea', dose: '5 mL (bovinos)',
        slaughterWithdrawalDays: null, milkWithdrawalDays: null, refrigerated: true,
        notes: 'Nunca vacinados: 2 doses com 4 semanas de intervalo. Revacinação anual. Não congelar. Carência não consta na bula.',
        source: 'site do fabricante', reviewedAt: '2026-09-16',
    },
    {
        key: 'vision-10-msd', brand: 'Vision 10', laboratory: 'MSD Saúde Animal',
        activeIngredient: 'Clostridioses + tétano (inativada)', category: 'VACINA', tags: ['CLOSTRIDIOSE'],
        presentation: 'Frasco multidose', route: 'Subcutânea', dose: '2 mL (bovinos)',
        slaughterWithdrawalDays: 0, milkWithdrawalDays: 0, refrigerated: true,
        notes: 'Primovacinação: 2 doses com 6 semanas de intervalo. Revacinação anual. Frasco aberto: usar em até 8 h.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'cattlemaster-4-l5-zoetis', brand: 'CattleMaster 4+L5', laboratory: 'Zoetis',
        activeIngredient: 'IBR, BVD, PI3, BRSV + leptospirose', category: 'VACINA', tags: ['REPRODUTIVA', 'IBR_BVD', 'LEPTOSPIROSE'],
        presentation: 'Liofilizada + diluente', route: 'Intramuscular', dose: '5 mL',
        slaughterWithdrawalDays: 21, milkWithdrawalDays: null, refrigerated: true,
        notes: 'Primovacinação: 2 doses com 2 a 4 semanas de intervalo. Revacinação anual. Usar todo o conteúdo após abrir. Ter adrenalina à mão (risco de reação alérgica).',
        source: 'bula do fabricante', reviewedAt: '2026-09-16',
    },
    {
        key: 'leptoferm-5-zoetis', brand: 'Leptoferm 5/2 mL', laboratory: 'Zoetis',
        activeIngredient: 'Leptospirose (inativada)', category: 'VACINA', tags: ['LEPTOSPIROSE'],
        presentation: 'Frasco multidose', route: 'Intramuscular', dose: '2 mL',
        slaughterWithdrawalDays: 21, milkWithdrawalDays: null, refrigerated: true,
        notes: 'Bovinos: dose única e revacinação anual. Não congelar.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    // ── Endectocidas (vermes, carrapato, berne) ──
    {
        key: 'ivomec-gold-boehringer', brand: 'Ivomec Gold', laboratory: 'Boehringer Ingelheim',
        activeIngredient: 'Ivermectina 3,15%', category: 'ANTIPARASITARIO',
        presentation: 'Solução injetável', route: 'Subcutânea, na frente ou atrás da paleta', dose: '1 mL / 50 kg',
        slaughterWithdrawalDays: 122, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Longa ação. Não usar em vacas em lactação nem até 122 dias antes do parto (leite para consumo). Agitar antes de usar.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'ivomec-pour-on-boehringer', brand: 'Ivomec Pour-On', laboratory: 'Boehringer Ingelheim',
        activeIngredient: 'Ivermectina 0,5%', category: 'ANTIPARASITARIO',
        presentation: 'Solução pour-on', route: 'Dorso, da cernelha à garupa', dose: '1 mL / 10 kg',
        slaughterWithdrawalDays: 48, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não usar em vacas em lactação nem até 48 dias antes do parto.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'master-lp-ourofino', brand: 'Master LP', laboratory: 'Ourofino',
        activeIngredient: 'Ivermectina 4%', category: 'ANTIPARASITARIO',
        presentation: 'Solução injetável', route: 'Subcutânea', dose: '1 mL / 50 kg',
        slaughterWithdrawalDays: 133, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Longa ação. Não usar em fêmeas produtoras de leite para consumo. Nunca na veia ou no músculo.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'dectomax-zoetis', brand: 'Dectomax', laboratory: 'Zoetis',
        activeIngredient: 'Doramectina 1%', category: 'ANTIPARASITARIO',
        presentation: 'Solução injetável', route: 'Subcutânea ou intramuscular', dose: '1 mL / 50 kg',
        slaughterWithdrawalDays: 35, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não usar em fêmeas produtoras de leite para consumo. Proteger da luz.',
        source: 'bula do fabricante', reviewedAt: '2026-09-16',
    },
    {
        key: 'cydectin-zoetis', brand: 'Cydectin', laboratory: 'Zoetis',
        activeIngredient: 'Moxidectina 1%', category: 'ANTIPARASITARIO',
        presentation: 'Solução injetável', route: 'Subcutânea, na frente ou atrás da paleta', dose: '1 mL / 50 kg',
        slaughterWithdrawalDays: 28, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não usar em fêmeas produtoras de leite para consumo.',
        source: 'bula do fabricante', reviewedAt: '2026-09-16',
    },
    // ── Vermífugos ──
    {
        key: 'ripercol-l-150f-zoetis', brand: 'Ripercol L 150F', laboratory: 'Zoetis',
        activeIngredient: 'Fosfato de levamisol 18,8%', category: 'VERMIFUGO',
        presentation: 'Solução injetável', route: 'Subcutânea', dose: '1 mL / 40 kg',
        slaughterWithdrawalDays: 7, milkWithdrawalDays: 2, refrigerated: false,
        notes: null,
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'valbazen-10-cobalto-zoetis', brand: 'Valbazen 10 Cobalto', laboratory: 'Zoetis',
        activeIngredient: 'Albendazol 10% + sulfato de cobalto', category: 'VERMIFUGO',
        presentation: 'Suspensão oral', route: 'Oral, com pistola dosificadora', dose: '2 mL / 20 kg',
        slaughterWithdrawalDays: 14, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não dar a fêmeas nos primeiros 45 dias de prenhez. Não usar em fêmeas produtoras de leite para consumo.',
        source: 'bula do fabricante', reviewedAt: '2026-09-16',
    },
    // ── Carrapaticidas e mosquicidas ──
    {
        key: 'colosso-pulverizacao-ourofino', brand: 'Colosso Pulverização', laboratory: 'Ourofino',
        activeIngredient: 'Cipermetrina 15% + clorpirifós 25% + citronelal 1%', category: 'ANTIPARASITARIO', tags: ['CARRAPATICIDA'],
        presentation: 'Concentrado para diluir', route: 'Pulverização ou banho de imersão', dose: 'Pulverização: 1 L para 800 L de água',
        slaughterWithdrawalDays: 10, milkWithdrawalDays: 3, refrigerated: false,
        notes: 'Não descartar sobras em rios, açudes ou nascentes.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'colosso-pour-on-ourofino', brand: 'Colosso Pour On', laboratory: 'Ourofino',
        activeIngredient: 'Cipermetrina 5% + clorpirifós 7% + citronelal 0,5%', category: 'ANTIPARASITARIO', tags: ['CARRAPATICIDA'],
        presentation: 'Solução pour-on', route: 'Dorso, da cauda até o meio do pescoço', dose: '10 mL / 100 kg (máx. 50 mL)',
        slaughterWithdrawalDays: 10, milkWithdrawalDays: 3, refrigerated: false,
        notes: null,
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'butox-p-ce25-msd', brand: 'Butox P CE25', laboratory: 'MSD Saúde Animal',
        activeIngredient: 'Deltametrina 2,5%', category: 'ANTIPARASITARIO', tags: ['CARRAPATICIDA'],
        presentation: 'Concentrado para diluir', route: 'Pulverização ou aspersão', dose: '10 mL para 10 L de água (mín. 5 L por animal adulto)',
        slaughterWithdrawalDays: null, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não aplicar no calor forte nem em dia de chuva. Não descartar sobras em rios ou açudes. Carência não consta na bula: confirme com o veterinário.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'acatak-pour-on-elanco', brand: 'Acatak Pour-On', laboratory: 'Elanco (antiga Novartis)',
        activeIngredient: 'Fluazuron 2,5%', category: 'ANTIPARASITARIO', tags: ['CARRAPATICIDA'],
        presentation: 'Solução pour-on', route: 'Duas faixas no dorso', dose: '5 mL / 50 kg',
        slaughterWithdrawalDays: 42, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não usar em vacas leiteiras em idade de reprodução. Bezerros mamando em vacas tratadas também cumprem a carência.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    // ── Antibióticos ──
    {
        key: 'terramicina-la-zoetis', brand: 'Terramicina LA', laboratory: 'Zoetis',
        activeIngredient: 'Oxitetraciclina 20%', category: 'ANTIBIOTICO',
        presentation: 'Solução injetável', route: 'Intramuscular profunda ou subcutânea', dose: '1 mL / 10 kg (máx. 10 mL por local)',
        slaughterWithdrawalDays: 28, milkWithdrawalDays: 4, refrigerated: false,
        notes: 'Leite: 96 horas. Casos graves: 2ª dose 3 a 5 dias depois.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'draxxin-zoetis', brand: 'Draxxin', laboratory: 'Zoetis',
        activeIngredient: 'Tulatromicina 10%', category: 'ANTIBIOTICO',
        presentation: 'Solução injetável', route: 'Subcutânea', dose: '1 mL / 40 kg',
        slaughterWithdrawalDays: 18, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não usar em fêmeas produtoras de leite para consumo.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'draxxin-kp-zoetis', brand: 'Draxxin KP', laboratory: 'Zoetis',
        activeIngredient: 'Tulatromicina 10% + cetoprofeno 12%', category: 'ANTIBIOTICO',
        presentation: 'Solução injetável', route: 'Subcutânea', dose: '1 mL / 40 kg',
        slaughterWithdrawalDays: 25, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não usar em fêmeas produtoras de leite para consumo nem em fêmeas com 20 meses ou mais. Não usar junto com outro anti-inflamatório. Frasco aberto: 56 dias.',
        source: 'bula do fabricante', reviewedAt: '2026-09-16',
    },
    {
        key: 'nuflor-injetavel-msd', brand: 'Nuflor Solução Injetável', laboratory: 'MSD Saúde Animal',
        activeIngredient: 'Florfenicol', category: 'ANTIBIOTICO',
        presentation: 'Solução injetável', route: 'Subcutânea (dose única) ou intramuscular no pescoço (2 doses)', dose: 'Dose única: 2 mL / 15 kg; ou 2 doses de 1 mL / 15 kg',
        slaughterWithdrawalDays: 38, milkWithdrawalDays: null, refrigerated: false,
        notes: 'Não usar em fêmeas produtoras de leite para consumo.',
        source: 'site do fabricante', reviewedAt: '2026-09-16',
    },
    {
        key: 'pencivet-plus-ppu-msd', brand: 'Pencivet Plus PPU', laboratory: 'MSD Saúde Animal',
        activeIngredient: 'Penicilinas + estreptomicina + piroxicam', category: 'ANTIBIOTICO',
        presentation: 'Pó + diluente', route: 'Intramuscular profunda', dose: 'Dose única; conferir tabela por peso na bula',
        slaughterWithdrawalDays: 30, milkWithdrawalDays: 5, refrigerated: false,
        notes: 'Leite: 96 a 120 horas. Conservar entre 8 e 25 °C.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'agrovet-plus-elanco', brand: 'Agrovet Plus', laboratory: 'Elanco (antiga Novartis)',
        activeIngredient: 'Benzilpenicilina procaína + di-hidroestreptomicina + piroxicam', category: 'ANTIBIOTICO',
        presentation: 'Suspensão injetável', route: 'Intramuscular profunda, 1 vez ao dia por 3 a 5 dias', dose: '1 mL / 20 kg',
        slaughterWithdrawalDays: 30, milkWithdrawalDays: 3, refrigerated: false,
        notes: 'Leite: 72 horas. Conservar entre 4 e 25 °C.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    // ── Anti-inflamatórios ──
    {
        key: 'banamine-injetavel-msd', brand: 'Banamine Injetável', laboratory: 'MSD Saúde Animal',
        activeIngredient: 'Flunixina meglumina 5%', category: 'ANTI_INFLAMATORIO',
        presentation: 'Solução injetável', route: 'Intramuscular ou intravenosa', dose: '2 mL / 45 kg por dia',
        slaughterWithdrawalDays: 4, milkWithdrawalDays: 2, refrigerated: false,
        notes: 'Leite: 36 horas.',
        source: BULA, reviewedAt: '2026-09-16',
    },
    {
        key: 'maxicam-2-ourofino', brand: 'Maxicam 2%', laboratory: 'Ourofino',
        activeIngredient: 'Meloxicam 2%', category: 'ANTI_INFLAMATORIO',
        presentation: 'Solução injetável', route: 'Intramuscular ou intravenosa', dose: '2,5 mL / 100 kg',
        slaughterWithdrawalDays: 8, milkWithdrawalDays: 3, refrigerated: false,
        notes: 'Leite: 72 horas.',
        source: BULA, reviewedAt: '2026-09-16',
    },
];

const CATALOG_BY_KEY = new Map(PHARMACY_CATALOG.map((item) => [item.key, item]));

export function findCatalogItem(key) {
    if (!key) return null;
    return CATALOG_BY_KEY.get(String(key)) || null;
}
