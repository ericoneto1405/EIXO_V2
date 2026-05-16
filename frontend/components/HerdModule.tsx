import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HerdAnimalModal from './AnimalDetailModal';
import LotDetailModal from './LotDetailModal';
import LotePurchaseModal from './LotePurchaseModal';
import WeighingsTab from './WeighingsTab';
import HerdSettingsTab from './HerdSettingsTab';
import OnboardingSpotlight from './OnboardingSpotlight';
import {
    HerdAnimal,
    HerdLot,
    HerdType,
    createAnimal,
    createLot,
    createWeighing,
    importAnimalsBatch,
    listAnimals,
    listLots,
} from '../adapters/herdApi';
import { buildApiUrl } from '../api';
import type { Paddock } from '../types';

type TabKey = 'overview' | 'animals' | 'pastures' | 'lots' | 'weighings' | 'settings';
type HealthQuickFilter = 'none' | 'sem_pasto' | 'pesagem_atrasada' | 'sem_categoria' | 'gmd_baixo';
type AnimalHeaderFilterKey = 'identificacao' | 'registro' | 'raca' | 'sexo' | 'pasto' | 'lote' | 'categoria' | 'peso' | 'nutricao' | null;
type ImportCorrectionRow = {
    id: string;
    selected: boolean;
    deferred?: boolean;
    isPoCandidate?: boolean;
    values: {
        brinco: string;
        sexo: string;
        raca: string;
        dataNascimento: string;
        registro: string;
        paddockId: string;
        tipoCadastro: string;
        tatuagem: string;
        sisbov: string;
        maeNome: string;
        paiNome: string;
    };
    fieldErrors: Partial<Record<'brinco' | 'sexo' | 'raca' | 'dataNascimento' | 'registro', string>>;
};

const LOT_OBJECTIVE_OPTIONS = [
    'Cria',
    'Recria',
    'Engorda',
    'Matrizes',
    'Bezerros',
    'Apartação',
    'Venda',
    'Confinamento',
    'Semi-confinamento',
    'Manejo sanitário',
    'Observação',
];
const LOT_OBJECTIVE_HELP = [
    'Cria: produção de bezerros.',
    'Recria: crescimento dos animais.',
    'Engorda: ganho de peso para venda.',
    'Matrizes: vacas do rebanho.',
    'Bezerros: animais jovens separados.',
    'Apartação: separação temporária.',
    'Venda: animais separados para negociação.',
    'Confinamento: sistema intensivo no cocho.',
    'Semi-confinamento: pasto com suplementação forte.',
    'Manejo sanitário: vacina, vermífugo ou tratamento.',
    'Observação: animais que exigem acompanhamento.',
];
const LOT_STATUS_OPTIONS = ['ATIVO', 'INATIVO'];

const LotObjectiveHelp: React.FC = () => (
    <span className="group relative inline-flex">
        <span className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-xs font-bold text-[var(--eixo-text-muted)]">
            ?
        </span>
        <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-[320px] -translate-x-1/2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4 text-left text-xs font-normal leading-5 text-[var(--eixo-text-muted)] shadow-xl group-hover:block">
            <span className="mb-2 block font-semibold text-[var(--eixo-text)]">Escolha para que este lote existe.</span>
            {LOT_OBJECTIVE_HELP.map((item) => (
                <span key={item} className="block">{item}</span>
            ))}
        </span>
    </span>
);

interface HerdModuleProps {
    farmId?: string | null;
    farmName?: string | null;
    paddocksRefreshNonce?: number;
    mode?: HerdType;
    herdType?: HerdType;
    isFreePlan?: boolean;
    onUpgradeRequest?: (animalCount?: number) => void;
    initialTabRequest?: { tab: TabKey; nonce: number } | null;
    weighingOnlyMode?: boolean;
}

const LockIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
);
const PlusIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
);
const DownloadIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-9 0V3m0 13.5 4.5-4.5m-4.5 4.5L7.5 12" />
    </svg>
);
const UploadIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-9-13.5V16.5m0-13.5 4.5 4.5m-4.5-4.5L7.5 7.5" />
    </svg>
);
const LayersIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l9 5-9 5-9-5 9-5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10l-9 5-9-5" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 14l-9 5-9-5" />
    </svg>
);
const DotsVerticalIcon: React.FC = () => (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
    </svg>
);

const calculateAge = (birthDateString?: string | null): string => {
    if (!birthDateString) {
        return '—';
    }
    const birthDate = new Date(birthDateString);
    if (Number.isNaN(birthDate.getTime())) {
        return '—';
    }
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
        years--;
        months = (months + 12) % 12;
    }
    const totalMonths = years * 12 + months;
    if (totalMonths < 24) {
        return `${totalMonths}m`;
    }
    return `${years}a ${months}m`;
};

const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) {
        return '—';
    }
    return value.toFixed(2);
};

const PAGE_SIZE = 30;
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const MAX_IMPORT_COLUMNS = 40;
type SortDirection = 'asc' | 'desc';
type SortColumn = 'identificacao' | 'registro' | 'raca' | 'sexo' | 'idade' | 'pasto' | 'pesoAtual' | 'gmd' | 'lote' | 'categoria' | 'nutricao';

// Campos P.O. (tatuagem, mae, pai, sisbov) liberados para todos os planos
const FIELD_PLAN: Record<string, 'free' | 'paid2'> = {
    brinco: 'free',
    nome: 'free',
    tipoCadastro: 'free',
    raca: 'free',
    sexo: 'free',
    dataNascimento: 'free',
    registro: 'free',
    pesoAtual: 'free',
    lote: 'free',
    pasto: 'free',
    categoria: 'free',
    observacoes: 'free',
    dataEntrada: 'free',
    valorCompra: 'free',
    dataPesagem: 'free',
    tatuagem: 'free',
    mae: 'free',
    pai: 'free',
    sisbov: 'free',
    eid: 'paid2',
    ncf: 'paid2',
    rgd: 'paid2',
    rgn: 'paid2',
    abcz: 'paid2',
};

// Campos P.O. que indicam planilha de Puro de Origem
const PO_IMPORT_FIELDS = ['tatuagem', 'mae', 'pai', 'sisbov'];

const loadExcelJs = () => import('exceljs');
const loadXlsx = () => import('xlsx');
const loadPapa = () => import('papaparse');

const FIELD_LABELS: Record<string, string> = {
    brinco: 'Identificação / Brinco',
    nome: 'Nome',
    tipoCadastro: 'Tipo de Cadastro',
    raca: 'Raça',
    sexo: 'Sexo',
    dataNascimento: 'Data de Nascimento',
    registro: 'Registro',
    pesoAtual: 'Peso Atual',
    dataPesagem: 'Data da Pesagem',
    lote: 'Lote',
    pasto: 'Pasto',
    categoria: 'Categoria',
    observacoes: 'Observações',
    dataEntrada: 'Data de Entrada',
    valorCompra: 'Valor de Compra (R$)',
    tatuagem: 'Tatuagem',
    mae: 'Mãe / Matriz',
    pai: 'Pai / Touro',
    sisbov: 'SISBOV',
    eid: 'EID / Chip Eletrônico 🔒',
    ncf: 'NCF 🔒',
    rgd: 'RGD 🔒',
    rgn: 'RGN 🔒',
    abcz: 'Registro ABCZ 🔒',
};

const VALID_CATEGORIES = [
    'Bezerro',
    'Bezerra',
    'Novilho',
    'Novilha',
    'Garrote',
    'Garrota',
    'Boi',
    'Vaca',
    'Vaca de cria',
    'Vaca seca',
    'Vaca de descarte',
    'Touro',
];

const normalizeCategoryKey = (value: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const CATEGORY_NORMALIZATION_MAP: Record<string, string> = {
    bezerro: 'Bezerro',
    bezerra: 'Bezerra',
    'bezerro desmamado': 'Bezerro',
    'bezerra desmamada': 'Bezerra',
    novilho: 'Novilho',
    novilha: 'Novilha',
    'novilho recria': 'Novilho',
    'novilha recria': 'Novilha',
    garrote: 'Garrote',
    garrota: 'Garrota',
    'garrote recria': 'Garrote',
    'garrota recria': 'Garrota',
    boi: 'Boi',
    'boi gordo': 'Boi',
    'boi magro': 'Boi',
    'boi terminacao': 'Boi',
    'boi de engorda': 'Boi',
    vaca: 'Vaca',
    'vaca de cria': 'Vaca de cria',
    matriz: 'Vaca de cria',
    'vaca prenhe': 'Vaca de cria',
    'vaca vazia': 'Vaca',
    'vaca seca': 'Vaca seca',
    'vaca descarte': 'Vaca de descarte',
    'vaca de descarte': 'Vaca de descarte',
    touro: 'Touro',
    reprodutor: 'Touro',
};

const normalizeImportedCategory = (raw: string) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return '';
    const key = normalizeCategoryKey(cleaned);
    if (CATEGORY_NORMALIZATION_MAP[key]) return CATEGORY_NORMALIZATION_MAP[key];
    if (VALID_CATEGORIES.some((cat) => normalizeCategoryKey(cat) === key)) {
        return VALID_CATEGORIES.find((cat) => normalizeCategoryKey(cat) === key) || cleaned;
    }
    return '';
};

const downloadWorkbook = async (fileName: string, sheetName: string, rows: Array<Array<string | number>>) => {
    const { default: ExcelJS } = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    rows.forEach((row) => worksheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
        [buffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
};

const normalizeImportedMatrix = (matrix: string[][]): Record<string, string>[] => {
    const cleanedRows = matrix
        .map((row) => row.map((value) => String(value ?? '').trim()))
        .filter((row) => row.some((value) => value));
    if (!cleanedRows.length) {
        return [];
    }

    const firstRow = cleanedRows[0];
    const firstFilledCount = firstRow.filter(Boolean).length;
    const firstLooksLikeTitle = firstFilledCount <= 1;
    const headerIndex = firstLooksLikeTitle && cleanedRows.length > 1 ? 1 : 0;
    const headers = cleanedRows[headerIndex].map((value, index) => value || `COLUNA_${index + 1}`);

    return cleanedRows
        .slice(headerIndex + 1)
        .filter((row) => row.some((value) => value))
        .map((row) =>
            headers.reduce<Record<string, string>>((accumulator, header, index) => {
                accumulator[header] = row[index] ?? '';
                return accumulator;
            }, {}),
        );
};

const parseImportedFile = async (file: File): Promise<Record<string, string>[]> => {
    if (file.name.toLowerCase().endsWith('.csv')) {
        const { default: Papa } = await loadPapa();
        const csvText = await file.text();
        const parsed = Papa.parse<string[]>(csvText, {
            skipEmptyLines: true,
        });
        if (parsed.errors.length) {
            throw new Error('csv_parse_error');
        }
        return normalizeImportedMatrix(parsed.data);
    }

    const buffer = await file.arrayBuffer();
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
        return [];
    }
    const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });
    return normalizeImportedMatrix(matrix);
};

const FIELD_KEYWORDS: Record<string, string[]> = {
    brinco: [
        'brinco', 'identificacao', 'identificação', 'numero', 'número',
        'num', 'tag', 'ear tag', 'eartag', 'rfid', 'chip', 'matricula', 'matrícula', 'nro',
        'identificador', 'brinco_animal', 'bringo', 'brinku', 'brco', 'brinq',
        'brn', 'idnt', 'identif', 'indentificacao', 'indentificação',
        'idenficacao', 'num.animal', 'id animal', 'n animal', 'nº animal',
        'id brinq', 'brinqu', 'id brinco', 'id',
    ],
    nome: [
        'nome', 'name', 'apelido', 'alcunha', 'denominacao', 'denominação',
        'nome_animal', 'designacao', 'nomo', 'nmae', 'nom', 'nm', 'nme',
    ],
    tipoCadastro: [
        'tipo cadastro', 'tipo de cadastro', 'po comercial', 'p.o comercial',
        'p.o.', 'puro origem', 'puro de origem', 'comercial', 'mestiço',
        'mestico', 'tipo animal registro', 'registro tipo',
    ],
    raca: [
        'raca', 'raça', 'breed', 'raca do animal', 'raça do animal',
        'genética', 'genetica', 'cruzamento', 'sangue', 'composicao',
        'composição racial', 'grupo genetico', 'rassa', 'rasa',
        'raca_do_animal', 'rasso', 'rcaa', 'rça', 'grau sangue', 'g.s', 'gs',
    ],
    sexo: [
        'sexo', 'sex', 'genero', 'gênero', 'macho/femea', 'm/f',
        'categoria sexual', 'sexo_animal', 'tipo sexual', 'macho femea',
        'm f', 'sxo', 'sxu', 'sexo_', 'mac/fem', 'sequisso', 'sexso',
        'sxso', 'sxe', 'sexu', 'sex.', 'gen.',
    ],
    dataNascimento: [
        'nascimento', 'nasc', 'data nasc', 'data de nascimento', 'dt nasc',
        'dt_nasc', 'birthdate', 'birth', 'data_nasc', 'born', 'dob', 'idade',
        'dt_nascimento', 'data_nascimento', 'dn', 'dt.nasc', 'ano nascimento',
        'nascto', 'nscto', 'nac', 'nasct', 'dt.nasc.', 'd/nasc', 'aniversario',
        'aniversário', 'dt_nasc.', 'nassimento',
    ],
    registro: [
        'registro', 'reg', 'registro animal', 'registro po', 'registro p.o', 'n registro',
        'numero registro', 'nro registro', 'registro genealogico', 'rgd', 'rgn',
    ],
    pesoAtual: [
        'peso', 'peso atual', 'peso vivo', 'kg', 'weight', 'pv', 'p.v',
        'peso_atual', 'peso vivo atual', 'wt', 'arroba', 'arrobas', 'arrb',
        '@', '@s', 'pso', 'ps', 'p/', 'pezo', 'pso atual', 'peso@', 'kg atual',
        'kgs', 'peso_vivo', 'ultimo peso', 'último peso', 'peso_kg',
        'pesagem atual', 'peso agora', 'pezo agora', 'pso agora', 'peso vivo agora',
    ],
    dataPesagem: [
        'data pesagem', 'dt pesagem', 'data peso', 'data_pesagem',
        'data do peso', 'weighing date', 'data medicao', 'data medição',
        'dt_pesagem', 'dt.pesagem', 'data ultima pesagem', 'última pesagem',
        'dt.pes', 'd/pesagem', 'dt/pes', 'data_pes', 'd.pesagem',
        'data.pesagem', 'dt pesag', 'dt_pes.', 'dta pesagem',
    ],
    dataEntrada: [
        'data entrada', 'data de entrada', 'dt entrada', 'entrada',
        'data compra', 'data de compra', 'dt compra', 'compra',
        'data aquisicao', 'data aquisição', 'dt aquisicao', 'aquisição',
        'data_entrada', 'dt_entrada', 'data_compra', 'chegada', 'data chegada',
    ],
    valorCompra: [
        'valor', 'valor compra', 'valor de compra', 'custo', 'custo inicial',
        'preco', 'preço', 'price', 'valor pago', 'vl compra', 'vl_compra',
        'custo_inicial', 'valor_compra', 'preco_compra', 'r$', 'rs',
        'valor cabeca', 'valor cabeça', 'custo cabeca', 'custo cabeça',
    ],
    lote: [
        'lote', 'lot', 'grupo', 'group', 'turma', 'categoria lote',
        'lote_animal', 'num lote', 'número lote', 'lote_id', 'agrupamento',
        'lt', 'lto', 'lt.', 'l.', 'lote n', 'lote nº', 'lt_animal', 'turm', 'trm',
        'loti', 'lotu', 'lote do animal', 'lote animal',
    ],
    pasto: [
        'pasto', 'divisao', 'divisão', 'paddock', 'retiro', 'curral',
        'invernada', 'potreiro', 'setor', 'pastagem', 'area', 'área', 'campo',
        'talhao', 'talhão', 'psto', 'pst', 'ps.', 'past', 'divs', 'div.',
        'invernda', 'retro', 'retr', 'pastu', 'pastu do animal', 'pastô', 'past.',
    ],
    categoria: [
        'categoria', 'cat', 'classe', 'tipo', 'finalidade', 'fase',
        'fase produtiva', 'classificacao', 'classificação', 'tipo animal',
        'categoria_animal', 'catg', 'ctg', 'categ', 'catig', 'catigoria',
        'catgoria', 'ctgr', 'cat.', 'classif', 'classific',
    ],
    observacoes: [
        'obs', 'observacao', 'observação', 'observacoes', 'observações',
        'notas', 'nota', 'note', 'notes', 'comentario', 'comentário',
        'detalhes', 'descricao', 'descrição', 'informacoes', 'informações',
        'obss', 'obsv', 'obv', 'obzerv', 'obcerv', 'obss.', 'obs_', 'rem', 'remark',
        'obs do bixu', 'obs do animal', 'obs bixo', 'observ', 'obzervacao',
    ],
    tatuagem: [
        'tatuagem', 'tatoo', 'tattoo', 'tat', 'tatuagem_animal', 'tatg',
        'marca', 'marcacao', 'marcação', 'marca fogo', 'ferro',
    ],
    mae: [
        'mae', 'mãe', 'matriz', 'mater', 'mother', 'dam', 'mae_animal',
        'id mae', 'brinco mae', 'numero mae', 'num mae',
    ],
    pai: [
        'pai', 'touro', 'reprodutor', 'sire', 'father', 'bull', 'pai_animal',
        'id pai', 'brinco pai', 'touro_id', 'reprodutor_id',
    ],
    sisbov: ['sisbov', 'boa', 'rastreabilidade', 'sisbov_id', 'codigo sisbov'],
    eid: ['eid', 'chip eletronico', 'chip eletrônico', 'electronic id', 'rfid_eid', 'transponder'],
    ncf: ['ncf', 'numero controle frigorifico', 'n.c.f', 'ncf_id'],
    rgd: ['rgd', 'registro genealogico definitivo', 'reg.gen.definitivo'],
    rgn: ['rgn', 'registro genealogico nascimento', 'reg.gen.nascimento'],
    abcz: ['abcz', 'registro abcz', 'abcz_id', 'reg abcz'],
};

function normalizeStr(s: string) {
    return s.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectField(header: string): string | null {
    const normalized = normalizeStr(header);
    const words = normalized.split(' ');

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
        for (const kw of keywords) {
            const k = normalizeStr(kw);
            if (!k) continue;
            // Match exato da string completa
            if (normalized === k) return field;
            // Keyword curta (≤ 2 chars): só aceita como palavra inteira isolada
            if (k.length <= 2) {
                if (words.includes(k)) return field;
                continue;
            }
            // Keyword longa: aceita como substring
            if (normalized.includes(k)) return field;
        }
    }
    return null;
}

const HerdModule: React.FC<HerdModuleProps> = ({
    farmId,
    farmName,
    paddocksRefreshNonce = 0,
    mode,
    herdType,
    isFreePlan = false,
    onUpgradeRequest,
    initialTabRequest,
    weighingOnlyMode = false,
}) => {
    void mode;
    const resolvedMode: HerdType = herdType ?? 'COMMERCIAL';
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [animals, setAnimals] = useState<HerdAnimal[]>([]);
    const [lots, setLots] = useState<HerdLot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [lotFilter, setLotFilter] = useState('');
    const [filterRaca, setFilterRaca] = useState('');
    const [filterCategoria, setFilterCategoria] = useState('');
    const [filterSexo, setFilterSexo] = useState('');
    const [filterRegistro, setFilterRegistro] = useState<'todas' | 'com' | 'sem'>('todas');
    const [filterIdentificacao, setFilterIdentificacao] = useState<'todas' | 'com' | 'sem'>('todas');
    const [filterPesagem, setFilterPesagem] = useState<'todas' | 'sem' | 'desatualizada'>('todas');
    const [filterPaddock, setFilterPaddock] = useState('');
    const [filterGmdMin, setFilterGmdMin] = useState('');
    const [filterGmdMax, setFilterGmdMax] = useState('');
    const [filterNutrition, setFilterNutrition] = useState('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [activeHeaderFilter, setActiveHeaderFilter] = useState<AnimalHeaderFilterKey>(null);
    const [healthQuickFilter, setHealthQuickFilter] = useState<HealthQuickFilter>('none');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [selectedAnimals, setSelectedAnimals] = useState<Set<number>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkMoveToLotOpen, setBulkMoveToLotOpen] = useState(false);
    const [bulkMoveToPastoOpen, setBulkMoveToPastoOpen] = useState(false);
    const [bulkTargetLotId, setBulkTargetLotId] = useState('');
    const [bulkTargetPastoId, setBulkTargetPastoId] = useState('');
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [bulkWeighOpen, setBulkWeighOpen] = useState(false);
    const [bulkWeighDate, setBulkWeighDate] = useState('');
    const [bulkWeighPeso, setBulkWeighPeso] = useState('');
    const [bulkWeighLoading, setBulkWeighLoading] = useState(false);
    const [bulkWeighResult, setBulkWeighResult] = useState<{ success: number; errors: string[] } | null>(null);
    const [selectedAnimal, setSelectedAnimal] = useState<HerdAnimal | null>(null);
    const [selectedLot, setSelectedLot] = useState<HerdLot | null>(null);
    const [lotModalOpen, setLotModalOpen] = useState(false);
    const [animalFormOpen, setAnimalFormOpen] = useState(false);
    const [loteModalOpen, setLoteModalOpen] = useState(false);
    const [animalFormError, setAnimalFormError] = useState<string | null>(null);
    const [lotFormError, setLotFormError] = useState<string | null>(null);
    const [uploadMessage, setUploadMessage] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
    const [importHeaders, setImportHeaders] = useState<string[]>([]);
    const [importMapping, setImportMapping] = useState<Record<string, string>>({});
    const [importWeightUnit, setImportWeightUnit] = useState<'kg' | 'arroba'>('kg');
    const [categoryConfirmOpen, setCategoryConfirmOpen] = useState(false);
    const [importProgress, setImportProgress] = useState<null | {
        total: number; success: number; errors: string[]; failedRows: Record<string, string>[]; weighingIssues: string[];
    }>(null);
    const [importCorrectionOpen, setImportCorrectionOpen] = useState(false);
    const [importCorrectionRows, setImportCorrectionRows] = useState<ImportCorrectionRow[]>([]);
    const [importCorrectionLoading, setImportCorrectionLoading] = useState(false);
    const [bulkCorrectionField, setBulkCorrectionField] = useState<'sexo' | 'raca'>('sexo');
    const [bulkCorrectionValue, setBulkCorrectionValue] = useState('');
    const [deferredCorrectionCount, setDeferredCorrectionCount] = useState(0);
    const [importSessionSuccessCount, setImportSessionSuccessCount] = useState(0);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const headerFilterRef = useRef<HTMLDivElement | null>(null);

    // Modal de nascimento
    const [nascimentoModalOpen, setNascimentoModalOpen] = useState(false);
    const [nascimentoForm, setNascimentoForm] = useState({
        sexo: 'Fêmea',
        dataNascimento: new Date().toISOString().slice(0, 10),
        pesoNascimento: '',
        brinco: '',
        maeId: '',
        maeNome: '',
    });
    const [nascimentoError, setNascimentoError] = useState<string | null>(null);
    const [nascimentoSaving, setNascimentoSaving] = useState(false);

    const [animalForm, setAnimalForm] = useState({
        brinco: '',
        nome: '',
        raca: '',
        sexo: 'Macho',
        dataNascimento: '',
        pesoAtual: '',
        registro: '',
        tipoCadastro: 'MESTICO',
        categoria: '',
        observacoes: '',
        lotId: '',
        paddockId: '',
        paddockStartAt: '',
        valorCompra: '',
        dataCompra: '',
    });
    const [lotForm, setLotForm] = useState({
        name: '',
        objective: '',
        status: 'ATIVO',
        startDate: '',
        notes: '',
    });
    const [paddocks, setPaddocks] = useState<Paddock[]>([]);
    const [farmBreeds, setFarmBreeds] = useState<string[]>([]);
    const isPoMode = resolvedMode === 'PO';
    const advancedFiltersStorageKey = useMemo(
        () => `eixo:herd:advanced-filters:${farmId || 'no-farm'}:${resolvedMode}`,
        [farmId, resolvedMode],
    );

    const normalizeCategoryKey = (value?: string | null) =>
        String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();

    const getGmdTargetByCategory = (category?: string | null) => {
        const key = normalizeCategoryKey(category);
        const byCategory: Record<string, number> = {
            bezerro: 0.6,
            bezerra: 0.6,
            novilho: 0.55,
            novilha: 0.55,
            garrote: 0.7,
            garrota: 0.6,
            boi: 0.7,
            vaca: 0.4,
            'vaca de cria': 0.4,
            'vaca seca': 0.35,
            'vaca de descarte': 0.35,
            touro: 0.6,
        };
        return byCategory[key] ?? 0.6;
    };

    const isPo = false;

    useEffect(() => {
        let isActive = true;
        const loadPaddocks = async () => {
            if (!farmId) {
                if (isActive) {
                    setPaddocks([]);
                }
                return;
            }
            try {
                const response = await fetch(buildApiUrl(`/pastos?farmId=${farmId}`), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.message || 'Erro ao carregar pastos.');
                }
                if (isActive) {
                    setPaddocks(payload.items || []);
                }
            } catch (error) {
                console.error(error);
                if (isActive) {
                    setPaddocks([]);
                }
            }
        };
        const loadBreeds = async () => {
            if (!farmId) {
                if (isActive) setFarmBreeds([]);
                return;
            }
            try {
                const response = await fetch(buildApiUrl(`/farms/${farmId}/breeds`), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (response.ok && isActive) {
                    setFarmBreeds((payload.breeds || []).map((b: { name: string }) => b.name));
                }
            } catch {
                // silently fail — breeds are optional suggestions
            }
        };
        loadPaddocks();
        loadBreeds();
        return () => {
            isActive = false;
        };
    }, [farmId, paddocksRefreshNonce]);

    const tabs = useMemo(() => {
        if (weighingOnlyMode) {
            return [{ key: 'weighings', label: 'Pesagens' }];
        }
        return [
            { key: 'overview', label: 'Visão do Rebanho' },
            { key: 'animals', label: 'Animais' },
            { key: 'pastures', label: 'Pastos' },
            { key: 'lots', label: 'Lotes' },
            { key: 'weighings', label: 'Pesagens' },
            { key: 'settings', label: 'Configurações' },
        ];
    }, [weighingOnlyMode]);

    const title = 'Manejo do Rebanho';

    const loadData = useCallback(async () => {
        if (!farmId) {
            setAnimals([]);
            setLots([]);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const [animalsResult, lotsResult] = await Promise.all([
                listAnimals(farmId, resolvedMode),
                listLots(farmId, resolvedMode),
            ]);
            setAnimals(animalsResult);
            setLots(lotsResult);
        } catch (error: any) {
            console.error(error);
            setLoadError(error?.message || 'Não foi possível carregar o rebanho.');
        } finally {
            setIsLoading(false);
        }
    }, [farmId, resolvedMode, isPo]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (weighingOnlyMode) {
            setActiveTab('weighings');
        }
    }, [weighingOnlyMode]);

    useEffect(() => {
        setSelectedAnimal(null);
        setSelectedLot(null);
        setLotFilter('');
        setSearchTerm('');
        setFilterRaca('');
        setFilterCategoria('');
        setFilterSexo('');
        setFilterRegistro('todas');
        setFilterIdentificacao('todas');
        setFilterPesagem('todas');
        setFilterPaddock('');
        setFilterGmdMin('');
        setFilterGmdMax('');
        setFilterNutrition('');
    }, [farmId, resolvedMode]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = window.localStorage.getItem(advancedFiltersStorageKey);
        setShowAdvancedFilters(saved === '1');
    }, [advancedFiltersStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(advancedFiltersStorageKey, showAdvancedFilters ? '1' : '0');
    }, [advancedFiltersStorageKey, showAdvancedFilters]);

    useEffect(() => {
        if (lotFilter && !lots.some((lot) => lot.id === lotFilter)) {
            setLotFilter('');
        }
    }, [lots, lotFilter]);

    useEffect(() => {
        if (initialTabRequest?.tab) {
            setActiveTab(initialTabRequest.tab);
        }
    }, [initialTabRequest?.nonce]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, lotFilter, filterRaca, filterCategoria, filterSexo, filterRegistro, filterIdentificacao, filterPesagem, filterPaddock, filterGmdMin, filterGmdMax, filterNutrition, activeTab]);

    useEffect(() => {
        const handleOutside = (event: MouseEvent) => {
            if (!headerFilterRef.current) return;
            if (!headerFilterRef.current.contains(event.target as Node)) {
                setActiveHeaderFilter(null);
            }
        };
        if (activeHeaderFilter) {
            document.addEventListener('mousedown', handleOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleOutside);
        };
    }, [activeHeaderFilter]);

    const filteredAnimals = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const gmdMin = filterGmdMin ? Number(filterGmdMin) : null;
        const gmdMax = filterGmdMax ? Number(filterGmdMax) : null;
        const selectedPaddockName = filterPaddock
            ? paddocks.find((paddock) => paddock.id === filterPaddock)?.name || null
            : null;

        return animals.filter((animal) => {
            const lastWeighingAgeDays = animal.dataUltimaPesagem
                ? Math.floor((Date.now() - new Date(animal.dataUltimaPesagem).getTime()) / 86400000)
                : null;
            const hasCategory = Boolean(String(animal.categoria || '').trim());
            const hasPaddock = Boolean(animal.currentPaddockId || animal.currentPaddockName);
            const currentGmd = typeof animal.gmd30 === 'number'
                ? animal.gmd30
                : typeof animal.gmd === 'number'
                    ? animal.gmd
                    : null;

            if (healthQuickFilter === 'sem_pasto' && hasPaddock) {
                return false;
            }
            if (healthQuickFilter === 'pesagem_atrasada') {
                if (lastWeighingAgeDays === null || lastWeighingAgeDays <= 30) return false;
            }
            if (healthQuickFilter === 'sem_categoria' && hasCategory) {
                return false;
            }
            if (healthQuickFilter === 'gmd_baixo') {
                if (currentGmd === null) return false;
                if (currentGmd >= getGmdTargetByCategory(animal.categoria)) return false;
            }

            if (lotFilter && animal.lotId !== lotFilter) {
                return false;
            }

            if (filterRaca && String(animal.raca || '').trim().toLowerCase() !== filterRaca.trim().toLowerCase()) {
                return false;
            }
            if (filterCategoria && (animal.categoria || '') !== filterCategoria) {
                return false;
            }

            if (filterSexo && animal.sexo !== filterSexo) {
                return false;
            }

            if (filterRegistro !== 'todas') {
                const hasRegistro = Boolean(String(animal.registro || '').trim());
                if (filterRegistro === 'sem' && hasRegistro) return false;
                if (filterRegistro === 'com' && !hasRegistro) return false;
            }

            if (filterIdentificacao !== 'todas') {
                const hasIdentification = Boolean(String(animal.brinco || '').trim());
                if (filterIdentificacao === 'sem' && hasIdentification) {
                    return false;
                }
                if (filterIdentificacao === 'com' && !hasIdentification) {
                    return false;
                }
            }

            if (filterPesagem === 'sem') {
                if (animal.pesoAtual != null && animal.pesoAtual > 0) return false;
            }
            if (filterPesagem === 'desatualizada') {
                if (!animal.dataUltimaPesagem) return false;
                const dias = Math.floor((Date.now() - new Date(animal.dataUltimaPesagem).getTime()) / 86400000);
                if (dias <= 30) return false;
            }

            if (selectedPaddockName && animal.currentPaddockName !== selectedPaddockName) {
                return false;
            }

            if (filterNutrition && (animal.nutritionPlan?.nome || '') !== filterNutrition) {
                return false;
            }

            if (gmdMin !== null || gmdMax !== null) {
                if (animal.gmd === null || animal.gmd === undefined) {
                    return false;
                }
                if (gmdMin !== null && animal.gmd < gmdMin) {
                    return false;
                }
                if (gmdMax !== null && animal.gmd > gmdMax) {
                    return false;
                }
            }

            if (!term) {
                return true;
            }
            return [animal.identificacao, animal.nome, animal.raca, animal.sexo, animal.registro, animal.tipoCadastro]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(term);
        });
    }, [
        animals,
        filterGmdMax,
        filterGmdMin,
        healthQuickFilter,
        filterIdentificacao,
        filterRegistro,
        filterPesagem,
        filterNutrition,
        filterPaddock,
        filterCategoria,
        filterRaca,
        filterSexo,
        lotFilter,
        paddocks,
        searchTerm,
    ]);

    const nutritionOptions = useMemo(() => {
        return [...new Set(animals.map((animal) => animal.nutritionPlan?.nome).filter(Boolean) as string[])].sort((a, b) =>
            a.localeCompare(b, 'pt-BR'),
        );
    }, [animals]);

    const racaOptions = useMemo(() => {
        return [...new Set(animals.map((a) => a.raca).filter(Boolean) as string[])].sort((a, b) =>
            a.localeCompare(b, 'pt-BR'),
        );
    }, [animals]);

    const healthOverview = useMemo(() => {
        let withoutPaddock = 0;
        let withoutWeighing = 0;
        let withoutCategory = 0;
        let staleWeighing = 0;
        let belowTargetGmd = 0;

        for (const animal of animals) {
            const hasPaddock = Boolean(animal.currentPaddockId || animal.currentPaddockName);
            if (!hasPaddock) withoutPaddock++;

            const hasCategory = Boolean(String(animal.categoria || '').trim());
            if (!hasCategory) withoutCategory++;

            if (animal.dataUltimaPesagem) {
                const days = Math.floor((Date.now() - new Date(animal.dataUltimaPesagem).getTime()) / 86400000);
                if (days > 30) staleWeighing++;
            } else {
                withoutWeighing++;
            }

            const currentGmd = typeof animal.gmd30 === 'number'
                ? animal.gmd30
                : typeof animal.gmd === 'number'
                    ? animal.gmd
                    : null;
            if (currentGmd !== null && currentGmd < getGmdTargetByCategory(animal.categoria)) {
                belowTargetGmd++;
            }
        }

        return { withoutPaddock, withoutWeighing, staleWeighing, withoutCategory, belowTargetGmd };
    }, [animals]);

    const clearAllFilters = () => {
        setSearchTerm('');
        setLotFilter('');
        setFilterRaca('');
        setFilterCategoria('');
        setFilterSexo('');
        setFilterRegistro('todas');
        setFilterIdentificacao('todas');
        setFilterPesagem('todas');
        setFilterPaddock('');
        setFilterGmdMin('');
        setFilterGmdMax('');
        setFilterNutrition('');
        setHealthQuickFilter('none');
        setActiveHeaderFilter(null);
    };

    const applyHealthQuickFilter = (quickFilter: HealthQuickFilter) => {
        clearAllFilters();
        setHealthQuickFilter(quickFilter);
    };

    const handleImportNextActionAssignPaddock = () => {
        setImportModalOpen(false);
        setActiveTab('animals');
        applyHealthQuickFilter('sem_pasto');
    };

    const handleImportNextActionWeigh = () => {
        const animalsWithoutWeighing = animals.filter((animal) => animal.pesoAtual == null || animal.pesoAtual <= 0);
        if (animalsWithoutWeighing.length === 0) return;
        setImportModalOpen(false);
        setActiveTab('animals');
        setSelectedAnimals(new Set(animalsWithoutWeighing.map((animal) => animal.id as any)));
        setBulkError(null);
        setBulkWeighResult(null);
        setBulkWeighDate('');
        setBulkWeighPeso('');
        setBulkWeighOpen(true);
    };

    const sortedAnimals = useMemo(() => {
        const items = [...filteredAnimals];
        if (!sortColumn) {
            return items;
        }

        const compareText = (left?: string | null, right?: string | null) =>
            String(left || '').localeCompare(String(right || ''), 'pt-BR', { sensitivity: 'base' });

        const compareNullableNumber = (left?: number | null, right?: number | null) => {
            const leftIsNull = left === null || left === undefined;
            const rightIsNull = right === null || right === undefined;
            if (leftIsNull && rightIsNull) {
                return 0;
            }
            if (leftIsNull) {
                return 1;
            }
            if (rightIsNull) {
                return -1;
            }
            return left - right;
        };

        items.sort((left, right) => {
            let result = 0;

            switch (sortColumn) {
                case 'identificacao':
                    result = compareText(left.identificacao, right.identificacao);
                    break;
                case 'registro':
                    result = compareText(left.registro, right.registro);
                    break;
                case 'raca':
                    result = compareText(left.raca, right.raca);
                    break;
                case 'sexo':
                    result = compareText(left.sexo, right.sexo);
                    break;
                case 'idade': {
                    const leftDate = left.dataNascimento ? new Date(left.dataNascimento).getTime() : null;
                    const rightDate = right.dataNascimento ? new Date(right.dataNascimento).getTime() : null;
                    result = compareNullableNumber(rightDate, leftDate);
                    break;
                }
                case 'pasto':
                    result = compareText(left.currentPaddockName, right.currentPaddockName);
                    break;
                case 'pesoAtual':
                    result = compareNullableNumber(left.pesoAtual, right.pesoAtual);
                    break;
                case 'gmd':
                    result = compareNullableNumber(left.gmd, right.gmd);
                    break;
                case 'lote': {
                    const leftLot = lots.find((l) => l.id === left.lotId)?.name || '';
                    const rightLot = lots.find((l) => l.id === right.lotId)?.name || '';
                    result = compareText(leftLot, rightLot);
                    break;
                }
                case 'categoria':
                    result = compareText(left.categoria, right.categoria);
                    break;
                case 'nutricao':
                    result = compareText(left.nutritionPlan?.nome, right.nutritionPlan?.nome);
                    break;
            }

            return sortDirection === 'asc' ? result : result * -1;
        });

        return items;
    }, [filteredAnimals, sortColumn, sortDirection]);

    const overviewStats = useMemo(() => {
        const total = animals.length;

        const weights = animals
            .map((a) => a.pesoAtual)
            .filter((p): p is number => typeof p === 'number');
        const avgWeight = weights.length
            ? weights.reduce((s, v) => s + v, 0) / weights.length
            : null;

        // GMD médio usa gmd30 — mais estável para comparar o rebanho
        const gmds30 = animals
            .map((a) => a.gmd30)
            .filter((g): g is number => typeof g === 'number');
        const avgGmd = gmds30.length
            ? gmds30.reduce((s, v) => s + v, 0) / gmds30.length
            : null;

        const machos = animals.filter((a) =>
            a.sexo?.toLowerCase() === 'macho').length;

        const femeas = animals.filter((a) =>
            a.sexo?.toLowerCase() === 'fêmea' ||
            a.sexo?.toLowerCase() === 'femea').length;

        const semPesagem = animals.filter((a) => !a.pesoAtual || a.pesoAtual <= 0).length;

        const avgArroba = avgWeight !== null ? avgWeight / 15 : null;

        const catMap = new Map<string, { count: number; totalPeso: number }>();
        for (const a of animals) {
            const cat = a.categoria?.trim() || 'Sem categoria';
            const entry = catMap.get(cat) ?? { count: 0, totalPeso: 0 };
            entry.count++;
            if (typeof a.pesoAtual === 'number') entry.totalPeso += a.pesoAtual;
            catMap.set(cat, entry);
        }
        const porCategoria = Array.from(catMap.entries())
            .map(([categoria, { count, totalPeso }]) => ({
                categoria,
                count,
                avgPeso: count > 0 ? totalPeso / count : null,
            }))
            .sort((a, b) => b.count - a.count);

        const racaMap = new Map<string, { count: number; totalPeso: number }>();
        for (const a of animals) {
            const raca = a.raca?.trim() || 'Sem raça';
            const entry = racaMap.get(raca) ?? { count: 0, totalPeso: 0 };
            entry.count++;
            if (typeof a.pesoAtual === 'number') entry.totalPeso += a.pesoAtual;
            racaMap.set(raca, entry);
        }
        const porRaca = Array.from(racaMap.entries())
            .map(([raca, { count, totalPeso }]) => ({
                raca,
                count,
                avgPeso: count > 0 ? totalPeso / count : null,
            }))
            .sort((a, b) => b.count - a.count);

        return { total, avgWeight, avgArroba, avgGmd, machos, femeas, semPesagem, porCategoria, porRaca };
    }, [animals]);

    const resetAnimalForm = () => {
        setAnimalForm({
            brinco: '',
            nome: '',
            raca: '',
            sexo: 'Macho',
            dataNascimento: '',
            pesoAtual: '',
            registro: '',
            tipoCadastro: 'MESTICO',
            categoria: '',
            observacoes: '',
            lotId: '',
            paddockId: '',
            paddockStartAt: '',
            valorCompra: '',
            dataCompra: '',
        });
    };

    const resetLotForm = () => {
        setLotForm({ name: '', objective: '', status: 'ATIVO', startDate: '', notes: '' });
    };

    const openAnimalForm = () => {
        setAnimalFormError(null);
        setAnimalFormOpen(true);
    };

    const closeAnimalForm = () => {
        setAnimalFormError(null);
        setAnimalFormOpen(false);
        resetAnimalForm();
    };

    const openLotForm = () => {
        setLotFormError(null);
        setLotModalOpen(true);
    };

    const closeLotForm = () => {
        setLotFormError(null);
        setLotModalOpen(false);
        resetLotForm();
    };

    const handleDownloadTemplate = () => {
        const fileName = 'modelo_rebanho.xlsx';
        const sheetName = 'Rebanho';
        const headers = [
            'Brinco',
            'Tipo Cadastro (Comercial|P.O.)',
            'Raça',
            'Sexo (Macho|Fêmea)',
            'Data Nascimento (DD/MM/AAAA)',
            'Peso Atual (kg)',
            'Registro',
            'Categoria',
            'Data Pesagem 1 (DD/MM/AAAA)',
            'Peso Pesagem 1 (kg)',
            'Data Pesagem 2 (DD/MM/AAAA)',
            'Peso Pesagem 2 (kg)',
        ];
        const sampleRow = ['BR001', 'Comercial', 'Nelore', 'Macho', '01/01/2023', '450', '', 'Recria', '15/02/2024', '455', '', ''];
        void downloadWorkbook(fileName, sheetName, [headers, sampleRow]);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUploadMessage(null);
        setUploadError(null);
        const file = event.target.files?.[0];
        if (!file) return;
        event.target.value = '';

        const ext = file.name.toLowerCase();
        if (!ext.endsWith('.xlsx')) {
            setUploadError('Envie um arquivo .xlsx.');
            return;
        }
        if (file.size > MAX_IMPORT_FILE_BYTES) {
            setUploadError('A planilha excede o limite de 2 MB.');
            return;
        }
        void (async () => {
            try {
                const rows = await parseImportedFile(file);
                if (!rows.length) {
                    setUploadError('Planilha vazia ou sem dados reconhecíveis.');
                    return;
                }

                const headers = Object.keys(rows[0]);
                if (headers.length > MAX_IMPORT_COLUMNS) {
                    setUploadError(`A planilha tem muitas colunas. Limite: ${MAX_IMPORT_COLUMNS}.`);
                    return;
                }
                if (rows.length > MAX_IMPORT_ROWS) {
                    setUploadError(`A planilha tem muitas linhas. Limite: ${MAX_IMPORT_ROWS} animais por importação.`);
                    return;
                }

                const autoMapping: Record<string, string> = {};
                for (const header of headers) {
                    const detected = detectField(header);
                    if (detected && !Object.values(autoMapping).includes(detected)) {
                        autoMapping[header] = detected;
                    }
                }

                const pesoCol = Object.entries(autoMapping)
                    .find(([, value]) => value === 'pesoAtual')?.[0];
                let suggestArroba = false;
                if (pesoCol) {
                    const vals = rows
                        .slice(0, 20)
                        .map((row) => parseFloat(row[pesoCol]))
                        .filter((value) => !Number.isNaN(value));
                    const allInArrobaRange = vals.length > 0 &&
                        vals.every((value) => value >= 8 && value <= 65);
                    if (allInArrobaRange) suggestArroba = true;
                }

                setImportHeaders(headers);
                setImportRows(rows);
                setImportMapping(autoMapping);
                setImportWeightUnit(suggestArroba ? 'arroba' : 'kg');
                setImportProgress(null);
                setImportModalOpen(true);
            } catch {
                setUploadError(
                    'Não foi possível ler o arquivo. Verifique se é uma planilha válida.',
                );
            }
        })();
    };

    const handleImportConfirm = async () => {
        if (!farmId) return;
        setIsImporting(true);
        const errors: string[] = [];
        const weighingIssues: string[] = [];
        const failedRows: Record<string, string>[] = [];
        const total = importRows.length;
        setImportProgress({ total, success: 0, errors: [], failedRows: [], weighingIssues: [] });

        const normalizeSexo = (raw: string): 'Macho' | 'Fêmea' => {
            const v = raw.toLowerCase().trim();
            if (['f', 'femea', 'fêmea', 'fem', 'female'].includes(v)) return 'Fêmea';
            return 'Macho';
        };

        const normalizeDate = (raw: string): string | null => {
            if (!raw) return null;
            const dmY = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
            const Ymd = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
            if (Ymd) return `${Ymd[1]}-${Ymd[2].padStart(2, '0')}-${Ymd[3].padStart(2, '0')}`;
            return null;
        };
        const parseBirthDateOrAge = (raw: string): string | null => {
            const dateValue = normalizeDate(raw);
            if (dateValue) return dateValue;
            const ageValue = Number(raw.replace(',', '.'));
            if (!Number.isFinite(ageValue) || ageValue <= 0 || ageValue > 40) return null;
            const today = new Date();
            const birth = new Date(today);
            birth.setFullYear(today.getFullYear() - Math.floor(ageValue));
            return birth.toISOString().slice(0, 10);
        };

        const mappingEntries = Object.entries(importMapping);
        try {
            const parsePesoImportado = (raw: string): number | null => {
                const pesoNum = parseFloat(raw.replace(',', '.'));
                if (Number.isNaN(pesoNum) || pesoNum <= 0) return null;
                return importWeightUnit === 'arroba' ? Math.round(pesoNum * 15) : pesoNum;
            };
            const getValue = (row: Record<string, string>, field: string) => {
                const col = mappingEntries.find(([, v]) => v === field)?.[0];
                return col ? (row[col] || '').trim() : '';
            };
            const collectMultipleWeighings = (row: Record<string, string>, rowIndex: number, brincoRef: string) => {
                const grouped = new Map<string, { dateRaw?: string; weightRaw?: string }>();
                for (const header of importHeaders) {
                    const headerNorm = header
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();
                    const dateMatch = headerNorm.match(/^data\s*pesagem\s*(\d+)$/);
                    const weightMatch = headerNorm.match(/^peso\s*pesagem\s*(\d+)$/);
                    if (dateMatch) {
                        const key = dateMatch[1];
                        const prev = grouped.get(key) ?? {};
                        prev.dateRaw = (row[header] || '').trim();
                        grouped.set(key, prev);
                    } else if (weightMatch) {
                        const key = weightMatch[1];
                        const prev = grouped.get(key) ?? {};
                        prev.weightRaw = (row[header] || '').trim();
                        grouped.set(key, prev);
                    }
                }
                const weighings: Array<{ data: string; peso: number }> = [];
                const localErrors: string[] = [];
                for (const key of Array.from(grouped.keys()).sort((a, b) => Number(a) - Number(b))) {
                    const entry = grouped.get(key)!;
                    const hasDate = Boolean(entry.dateRaw);
                    const hasWeight = Boolean(entry.weightRaw);
                    if (!hasDate && !hasWeight) continue;
                    if (!hasDate || !hasWeight) {
                        localErrors.push(`Linha ${rowIndex + 2} (${brincoRef}): Pesagem ${key} incompleta (data/peso).`);
                        continue;
                    }
                    const dataNorm = normalizeDate(entry.dateRaw || '');
                    const pesoNorm = parsePesoImportado(entry.weightRaw || '');
                    if (!dataNorm || !pesoNorm) {
                        localErrors.push(`Linha ${rowIndex + 2} (${brincoRef}): Pesagem ${key} inválida (data/peso).`);
                        continue;
                    }
                    weighings.push({ data: dataNorm, peso: pesoNorm });
                }
                return { weighings, localErrors };
            };

            const items = importRows.map((row, i) => {
                const brinco = getValue(row, 'brinco');
                const dataNasc = parseBirthDateOrAge(getValue(row, 'dataNascimento'));
                const dataEntrada = normalizeDate(getValue(row, 'dataEntrada'));
                const pesoRaw = getValue(row, 'pesoAtual');
                const pesoAtual = pesoRaw ? parsePesoImportado(pesoRaw) : null;
                const valorRaw = getValue(row, 'valorCompra');
                const valorNum = valorRaw
                    ? parseFloat(valorRaw.replace(/[R$\s]/g, '').replace(',', '.'))
                    : NaN;
                const valorCompra = !isNaN(valorNum) && valorNum > 0 ? valorNum : null;
                const pesagensImportacao: Array<{ data: string; peso: number }> = [];
                const dataPesagemRaw = getValue(row, 'dataPesagem');
                const dataPesagemNorm = normalizeDate(dataPesagemRaw);
                if (dataPesagemNorm && pesoAtual) {
                    pesagensImportacao.push({ data: dataPesagemNorm, peso: pesoAtual });
                }
                const { weighings: pesagensMultiplas, localErrors } = collectMultipleWeighings(row, i, brinco || 'sem-id');
                if (localErrors.length > 0) {
                    weighingIssues.push(...localErrors);
                }
                for (const pesagem of pesagensMultiplas) {
                    const exists = pesagensImportacao.some((p) => p.data === pesagem.data && p.peso === pesagem.peso);
                    if (!exists) pesagensImportacao.push(pesagem);
                }
                return {
                    sourceIndex: i,
                    rowLabel: `Linha ${i + 2}`,
                    brinco,
                    nome: brinco,
                    raca: getValue(row, 'raca') || 'Não informada',
                    sexo: normalizeSexo(getValue(row, 'sexo')),
                    dataNascimento: dataNasc || undefined,
                    registro: getValue(row, 'registro') || undefined,
                    pesoAtual: pesoAtual || undefined,
                    categoria: normalizeImportedCategory(getValue(row, 'categoria')) || undefined,
                    dataEntrada: dataEntrada || undefined,
                    valorCompra: valorCompra || undefined,
                    tipoCadastro: getValue(row, 'tipoCadastro') || undefined,
                    tatuagem: getValue(row, 'tatuagem') || undefined,
                    sisbov: getValue(row, 'sisbov') || undefined,
                    maeNome: getValue(row, 'mae') || undefined,
                    paiNome: getValue(row, 'pai') || undefined,
                    lotId: getValue(row, 'lotId') || undefined,
                    paddockId: getValue(row, 'paddockId') || undefined,
                    weighings: pesagensImportacao,
                };
            });

            const poItems = items.filter((item) => {
                const hasPoSignals = Boolean(
                    item.registro?.trim()
                    || item.tatuagem?.trim()
                    || item.maeNome?.trim()
                    || item.paiNome?.trim()
                    || item.sisbov?.trim(),
                );
                return resolvedMode === 'PO' || hasPoSignals;
            });
            const commercialItems = items.filter((item) => !poItems.includes(item));

            let successTotal = 0;
            const applyResults = (batchItems: typeof items, response: Awaited<ReturnType<typeof importAnimalsBatch>>) => {
                successTotal += response.success || 0;
                for (const result of response.results || []) {
                    const sourceIndex = batchItems[result.index]?.sourceIndex ?? result.index;
                    if (!result.success) {
                        errors.push(result.message || `Linha ${sourceIndex + 2}: erro ao importar`);
                        if (importRows[sourceIndex]) failedRows.push(importRows[sourceIndex]);
                    } else if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                        weighingIssues.push(...result.warnings);
                    }
                }
            };

            if (commercialItems.length > 0) {
                const responseCommercial = await importAnimalsBatch(farmId, 'COMMERCIAL', commercialItems);
                applyResults(commercialItems, responseCommercial);
            }
            if (poItems.length > 0) {
                const responsePo = await importAnimalsBatch(farmId, 'PO', poItems);
                applyResults(poItems, responsePo);
            }

            setImportProgress({
                total,
                success: successTotal,
                errors: [...errors],
                failedRows: [...failedRows],
                weighingIssues: [...weighingIssues],
            });
            await loadData();
        } catch (error: any) {
            errors.push(error?.message || 'Erro ao importar em lote.');
            setImportProgress({ total, success: 0, errors: [...errors], failedRows: [...importRows], weighingIssues: [...weighingIssues] });
        } finally {
            setIsImporting(false);
        }
    };

    const categoryNormalizationPreview = useMemo(() => {
        const categoryCol = Object.entries(importMapping).find(([, v]) => v === 'categoria')?.[0];
        if (!categoryCol) return [];
        const uniq = new Map<string, { original: string; normalized: string; changed: boolean; unknown: boolean }>();
        for (const row of importRows) {
            const original = (row[categoryCol] || '').trim();
            if (!original) continue;
            const normalized = normalizeImportedCategory(original);
            const key = `${normalizeCategoryKey(original)}=>${normalizeCategoryKey(normalized)}`;
            if (!uniq.has(key)) {
                uniq.set(key, {
                    original,
                    normalized,
                    changed: normalizeCategoryKey(original) !== normalizeCategoryKey(normalized),
                    unknown: !normalized,
                });
            }
        }
        return Array.from(uniq.values()).slice(0, 10);
    }, [importMapping, importRows]);

    const validateImportBeforeSubmit = () => {
        const errors: string[] = [];
        const failedRows: Record<string, string>[] = [];
        const mappingEntries = Object.entries(importMapping);
        const getValue = (row: Record<string, string>, field: string) => {
            const col = mappingEntries.find(([, v]) => v === field)?.[0];
            return col ? (row[col] || '').trim() : '';
        };
        const normalizeDate = (raw: string): string | null => {
            if (!raw) return null;
            const dmY = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
            const Ymd = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
            if (Ymd) return `${Ymd[1]}-${Ymd[2].padStart(2, '0')}-${Ymd[3].padStart(2, '0')}`;
            return null;
        };
        const parseBirthDateOrAge = (raw: string): string | null => {
            const dateValue = normalizeDate(raw);
            if (dateValue) return dateValue;
            const ageValue = Number(raw.replace(',', '.'));
            if (!Number.isFinite(ageValue) || ageValue <= 0 || ageValue > 40) return null;
            const today = new Date();
            const birth = new Date(today);
            birth.setFullYear(today.getFullYear() - Math.floor(ageValue));
            return birth.toISOString().slice(0, 10);
        };

        const seenBrinco = new Set<string>();
        const duplicatedBrinco = new Set<string>();
        for (const row of importRows) {
            const brinco = getValue(row, 'brinco');
            if (!brinco) continue;
            if (seenBrinco.has(brinco)) duplicatedBrinco.add(brinco);
            seenBrinco.add(brinco);
        }

        for (let i = 0; i < importRows.length; i++) {
            const row = importRows[i];
            const brinco = getValue(row, 'brinco');
            if (!brinco) {
                errors.push(`Linha ${i + 2}: identificação (brinco) não encontrada.`);
                failedRows.push(row);
                continue;
            }
            if (duplicatedBrinco.has(brinco)) {
                errors.push(`Linha ${i + 2} (${brinco}): brinco duplicado na planilha.`);
                failedRows.push(row);
                continue;
            }

            const sexo = getValue(row, 'sexo');
            if (!sexo) {
                errors.push(`Linha ${i + 2} (${brinco}): sexo é obrigatório.`);
                failedRows.push(row);
                continue;
            }

            const raca = getValue(row, 'raca');
            if (!raca) {
                errors.push(`Linha ${i + 2} (${brinco}): raça é obrigatória.`);
                failedRows.push(row);
                continue;
            }

            const isPoImport = resolvedMode === 'PO'
                || Boolean(
                    getValue(row, 'registro')
                    || getValue(row, 'tatuagem')
                    || getValue(row, 'mae')
                    || getValue(row, 'pai')
                    || getValue(row, 'sisbov'),
                );
            if (isPoImport) {
                const registro = getValue(row, 'registro');
                if (!registro) {
                    errors.push(`Linha ${i + 2} (${brinco}): registro é obrigatório para P.O.`);
                    failedRows.push(row);
                    continue;
                }
            }

            const dataNascimento = getValue(row, 'dataNascimento');
            if (dataNascimento && !parseBirthDateOrAge(dataNascimento)) {
                errors.push(`Linha ${i + 2} (${brinco}): data de nascimento inválida.`);
                failedRows.push(row);
                continue;
            }

            const pesoRaw = getValue(row, 'pesoAtual');
            if (pesoRaw) {
                const parsedPeso = parseFloat(pesoRaw.replace(',', '.'));
                if (Number.isNaN(parsedPeso) || parsedPeso <= 0) {
                    errors.push(`Linha ${i + 2} (${brinco}): peso atual inválido.`);
                    failedRows.push(row);
                    continue;
                }
            }
        }

        if (errors.length > 0) {
            setImportProgress({
                total: importRows.length,
                success: 0,
                errors,
                failedRows,
                weighingIssues: [],
            });
            return false;
        }

        return true;
    };

    const validateCorrectionRows = (rows: ImportCorrectionRow[]) => {
        const normalizeDate = (raw: string): string | null => {
            if (!raw) return null;
            const dmY = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
            const Ymd = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
            if (Ymd) return `${Ymd[1]}-${Ymd[2].padStart(2, '0')}-${Ymd[3].padStart(2, '0')}`;
            return null;
        };
        const parseBirthDateOrAge = (raw: string): string | null => {
            const dateValue = normalizeDate(raw);
            if (dateValue) return dateValue;
            const ageValue = Number(raw.replace(',', '.'));
            if (!Number.isFinite(ageValue) || ageValue <= 0 || ageValue > 40) return null;
            return 'ok';
        };
        const normalized = rows.map((row) => {
            const fieldErrors: ImportCorrectionRow['fieldErrors'] = {};
            if (!row.values.brinco.trim()) fieldErrors.brinco = 'Brinco obrigatório';
            if (!row.values.sexo.trim()) fieldErrors.sexo = 'Sexo obrigatório';
            if (!row.values.raca.trim()) fieldErrors.raca = 'Raça obrigatória';
            if (row.values.dataNascimento.trim() && !parseBirthDateOrAge(row.values.dataNascimento.trim())) {
                fieldErrors.dataNascimento = 'Data/idade inválida';
            }
            const isPoRow = resolvedMode === 'PO'
                || Boolean(row.isPoCandidate)
                || Boolean(
                    row.values.registro.trim()
                    || row.values.tatuagem.trim()
                    || row.values.sisbov.trim()
                    || row.values.maeNome.trim()
                    || row.values.paiNome.trim(),
                );
            if (isPoRow && !row.values.registro.trim()) {
                fieldErrors.registro = 'Registro obrigatório para P.O.';
            }
            return { ...row, fieldErrors };
        });
        setImportCorrectionRows(normalized);
        return normalized;
    };

    const openInlineCorrection = () => {
        if (!importProgress?.failedRows?.length) return;
        const mappingEntries = Object.entries(importMapping);
        const getValue = (row: Record<string, string>, field: string) => {
            const col = mappingEntries.find(([, v]) => v === field)?.[0];
            const mappedValue = col ? row[col] : undefined;
            const directValue = row[field];
            return String(mappedValue ?? directValue ?? '').trim();
        };
        const rows = importProgress.failedRows.map((row, idx) => ({
            id: `${idx}-${Date.now()}`,
            selected: false,
            deferred: false,
            isPoCandidate: resolvedMode === 'PO' || Boolean(
                getValue(row, 'registro')
                || getValue(row, 'tatuagem')
                || getValue(row, 'sisbov')
                || getValue(row, 'mae')
                || getValue(row, 'pai')
                || getValue(row, 'tipoCadastro').toUpperCase() === 'PO',
            ),
            values: {
                brinco: getValue(row, 'brinco'),
                sexo: getValue(row, 'sexo'),
                raca: getValue(row, 'raca'),
                dataNascimento: getValue(row, 'dataNascimento'),
                registro: getValue(row, 'registro'),
                paddockId: getValue(row, 'paddockId'),
                tipoCadastro: getValue(row, 'tipoCadastro'),
                tatuagem: getValue(row, 'tatuagem'),
                sisbov: getValue(row, 'sisbov'),
                maeNome: getValue(row, 'mae'),
                paiNome: getValue(row, 'pai'),
            },
            fieldErrors: {},
        }));
        setDeferredCorrectionCount(0);
        setImportSessionSuccessCount(0);
        setImportCorrectionRows(rows);
        setImportCorrectionOpen(true);
    };

    const markSelectedForReviewLater = () => {
        let changed = 0;
        setImportCorrectionRows((prev) => prev.map((row) => {
            if (!row.selected || row.deferred) return row;
            changed += 1;
            return { ...row, deferred: true, selected: false };
        }));
        if (changed > 0) {
            setDeferredCorrectionCount((prev) => prev + changed);
        }
    };

    const applyBulkCorrectionValue = () => {
        const value = bulkCorrectionValue.trim();
        if (!value) return;
        setImportCorrectionRows((prev) => prev.map((row) => {
            if (!row.selected) return row;
            return {
                ...row,
                values: {
                    ...row.values,
                    [bulkCorrectionField]: value,
                },
            };
        }));
    };

    const parseImportDateOrAge = (raw: string): string | null => {
        if (!raw) return null;
        const dmY = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
        const Ymd = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
        if (Ymd) return `${Ymd[1]}-${Ymd[2].padStart(2, '0')}-${Ymd[3].padStart(2, '0')}`;
        const ageValue = Number(raw.replace(',', '.'));
        if (!Number.isFinite(ageValue) || ageValue <= 0 || ageValue > 40) return null;
        const today = new Date();
        const birth = new Date(today);
        birth.setFullYear(today.getFullYear() - Math.floor(ageValue));
        return birth.toISOString().slice(0, 10);
    };

    const handleImportCorrectedRows = async () => {
        if (!farmId || !importProgress) return;
        const normalized = validateCorrectionRows(importCorrectionRows);
        const readyRows = normalized
            .map((row, idx) => ({ row, idx }))
            .filter(({ row }) => !row.deferred && Object.keys(row.fieldErrors).length === 0);

        if (readyRows.length === 0) return;

        setImportCorrectionLoading(true);
        try {
            const toItem = ({ row, idx }: { row: ImportCorrectionRow; idx: number }) => ({
                sourceIndex: idx,
                rowLabel: `Correção ${idx + 1}`,
                brinco: row.values.brinco.trim(),
                nome: row.values.brinco.trim(),
                sexo: row.values.sexo.trim(),
                raca: row.values.raca.trim(),
                dataNascimento: parseImportDateOrAge(row.values.dataNascimento.trim()) || undefined,
                registro: row.values.registro.trim() || undefined,
                paddockId: row.values.paddockId.trim() || undefined,
                tipoCadastro: row.values.tipoCadastro.trim() || undefined,
                tatuagem: row.values.tatuagem.trim() || undefined,
                sisbov: row.values.sisbov.trim() || undefined,
                maeNome: row.values.maeNome.trim() || undefined,
                paiNome: row.values.paiNome.trim() || undefined,
            });

            const readyItems = readyRows.map(toItem);
            const poItems = readyItems.filter((item, index) => {
                const sourceRow = readyRows[index]?.row;
                return resolvedMode === 'PO'
                    || Boolean(sourceRow?.isPoCandidate)
                    || Boolean(item.registro || item.tatuagem || item.sisbov || item.maeNome || item.paiNome);
            });
            const commercialItems = readyItems.filter((item) => !poItems.includes(item));

            let importedNow = 0;
            const serverErrors: Array<{ sourceIndex: number; message: string }> = [];
            const applyResults = (
                batchItems: typeof readyItems,
                response: Awaited<ReturnType<typeof importAnimalsBatch>>,
            ) => {
                importedNow += response.success || 0;
                for (const result of response.results || []) {
                    if (!result.success) {
                        serverErrors.push({
                            sourceIndex: batchItems[result.index]?.sourceIndex ?? 0,
                            message: result.message || 'Erro ao importar linha corrigida.',
                        });
                    }
                }
            };

            if (commercialItems.length > 0) {
                const resp = await importAnimalsBatch(farmId, 'COMMERCIAL', commercialItems);
                applyResults(commercialItems, resp);
            }
            if (poItems.length > 0) {
                const resp = await importAnimalsBatch(farmId, 'PO', poItems);
                applyResults(poItems, resp);
            }

            const serverErrorByIndex = new Map(serverErrors.map((item) => [item.sourceIndex, item.message]));
            const remainingRows = normalized
                .map((row, idx) => ({ row, idx }))
                .filter(({ row, idx }) => row.deferred || Object.keys(row.fieldErrors).length > 0 || serverErrorByIndex.has(idx))
                .map(({ row, idx }) => ({
                    ...row,
                    selected: false,
                    deferred: row.deferred || false,
                    fieldErrors: Object.keys(row.fieldErrors).length > 0
                        ? row.fieldErrors
                        : { brinco: serverErrorByIndex.get(idx) || 'Erro ao importar linha corrigida.' },
                }));

            const nextErrors: string[] = [];
            normalized.forEach((row, idx) => {
                if (row.deferred) return;
                if (serverErrorByIndex.has(idx)) {
                    nextErrors.push(serverErrorByIndex.get(idx)!);
                    return;
                }
                const entries = Object.entries(row.fieldErrors);
                if (entries.length > 0) {
                    nextErrors.push(`Correção ${idx + 1} (${row.values.brinco || 'sem brinco'}): ${entries.map(([, msg]) => msg).join(' · ')}`);
                }
            });

            setImportCorrectionRows(remainingRows);
            setImportSessionSuccessCount((prev) => prev + importedNow);
            setImportProgress({
                ...importProgress,
                success: importProgress.success + importedNow,
                errors: nextErrors,
                failedRows: remainingRows.map((row) => ({
                    brinco: row.values.brinco,
                    sexo: row.values.sexo,
                    raca: row.values.raca,
                    dataNascimento: row.values.dataNascimento,
                    registro: row.values.registro,
                })),
            });
            if (remainingRows.length === 0) {
                setImportCorrectionOpen(false);
            }
            await loadData();
        } finally {
            setImportCorrectionLoading(false);
        }
    };

    const handleImportStart = () => {
        setImportProgress(null);
        if (!validateImportBeforeSubmit()) {
            return;
        }
        const hasCategoriaMap = Object.values(importMapping).includes('categoria');
        if (hasCategoriaMap && categoryNormalizationPreview.length > 0) {
            setCategoryConfirmOpen(true);
            return;
        }
        void handleImportConfirm();
    };

    const importFailedWithoutSuccess = Boolean(
        importProgress
        && !isImporting
        && importProgress.success === 0
        && importProgress.errors.length > 0,
    );

    const handleCreateAnimal = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) {
            setAnimalFormError('Selecione uma fazenda para criar animal.');
            return;
        }
        if (!animalForm.paddockId) {
            setAnimalFormError('Selecione o pasto do animal.');
            return;
        }
        if (!animalForm.brinco.trim() || !animalForm.raca.trim() || !animalForm.dataNascimento) {
            setAnimalFormError('Preencha brinco, raça e data de nascimento.');
            return;
        }

        const parsedPeso = animalForm.pesoAtual ? Number(animalForm.pesoAtual) : null;
        if (animalForm.pesoAtual && (!parsedPeso || parsedPeso <= 0)) {
            setAnimalFormError('Informe um peso atual válido.');
            return;
        }

        try {
            setAnimalFormError(null);
            const payload = {
                brinco: animalForm.brinco.trim(),
                raca: animalForm.raca.trim(),
                sexo: animalForm.sexo,
                dataNascimento: animalForm.dataNascimento,
                pesoAtual: parsedPeso ?? undefined,
                tipoCadastro: animalForm.tipoCadastro,
                registro: animalForm.registro.trim() || undefined,
                categoria: animalForm.categoria.trim() || undefined,
                observacoes: animalForm.observacoes.trim() || undefined,
                lotId: animalForm.lotId || undefined,
                paddockId: animalForm.paddockId,
                paddockStartAt: animalForm.paddockStartAt || undefined,
                valorCompra: animalForm.valorCompra ? parseFloat(animalForm.valorCompra.replace(',', '.')) || undefined : undefined,
                dataCompra: animalForm.dataCompra || undefined,
            };
            await createAnimal(farmId, resolvedMode, payload);
            closeAnimalForm();
            await loadData();
        } catch (error: any) {
            setAnimalFormError(error?.message || 'Não foi possível salvar o animal.');
        }
    };

    const handleCreateLot = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) {
            setLotFormError('Selecione uma fazenda para criar lote.');
            return;
        }
        if (!lotForm.name.trim()) {
            setLotFormError('Informe o nome do lote.');
            return;
        }
        try {
            setLotFormError(null);
            await createLot(farmId, resolvedMode, {
                name: lotForm.name.trim(),
                objective: lotForm.objective || undefined,
                status: lotForm.status,
                startDate: lotForm.startDate || undefined,
                notes: lotForm.notes.trim() || undefined,
            });
            closeLotForm();
            await loadData();
        } catch (error: any) {
            setLotFormError(error?.message || 'Não foi possível salvar o lote.');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedAnimals.size === 0) return;
        setBulkLoading(true);
        setBulkError(null);
        try {
            if (isPoMode) {
                throw new Error('Exclusão em massa ainda não disponível para Plantel P.O.');
            }
            const res = await fetch(buildApiUrl('/animals/bulk-delete'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ids: Array.from(selectedAnimals) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao excluir animais.');
            setSelectedAnimals(new Set());
            setBulkDeleteOpen(false);
            await loadData();
        } catch (err: any) {
            setBulkError(err?.message || 'Erro ao excluir animais.');
        } finally {
            setBulkLoading(false);
        }
    };

    const handleBulkMoveToLot = async () => {
        setBulkLoading(true);
        setBulkError(null);
        try {
            if (isPoMode) {
                throw new Error('Mover lote em massa ainda não disponível para Plantel P.O.');
            }
            const res = await fetch(buildApiUrl('/animals/bulk-move-lot'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ids: Array.from(selectedAnimals), lotId: bulkTargetLotId || null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao mover animais.');
            setSelectedAnimals(new Set());
            setBulkMoveToLotOpen(false);
            setBulkTargetLotId('');
            await loadData();
        } catch (err: any) {
            setBulkError(err?.message || 'Erro ao mover animais.');
        } finally {
            setBulkLoading(false);
        }
    };

    const handleBulkMoveToPasto = async () => {
        if (!bulkTargetPastoId) { setBulkError('Selecione um pasto.'); return; }
        setBulkLoading(true);
        setBulkError(null);
        try {
            if (isPoMode) {
                throw new Error('Mover pasto em massa ainda não disponível para Plantel P.O.');
            }
            const res = await fetch(buildApiUrl('/animals/bulk-move-pasto'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ids: Array.from(selectedAnimals), pastoId: bulkTargetPastoId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Erro ao mover animais.');
            setSelectedAnimals(new Set());
            setBulkMoveToPastoOpen(false);
            setBulkTargetPastoId('');
            await loadData();
        } catch (err: any) {
            setBulkError(err?.message || 'Erro ao mover animais.');
        } finally {
            setBulkLoading(false);
        }
    };

    const handleBulkWeigh = async () => {
        const peso = parseFloat(bulkWeighPeso.replace(',', '.'));
        if (!bulkWeighDate || isNaN(peso) || peso <= 0) {
            setBulkError('Informe data e peso válidos.');
            return;
        }
        setBulkWeighLoading(true);
        setBulkError(null);
        const ids = Array.from(selectedAnimals);
        let success = 0;
        const errors: string[] = [];
        for (const id of ids) {
            try {
                await createWeighing(String(id), resolvedMode, {
                    data: bulkWeighDate,
                    peso,
                });
                success++;
            } catch (err: any) {
                const animal = animals.find((a) => a.id === id);
                errors.push(`${animal?.identificacao || id}: ${err?.message || 'erro'}`);
            }
        }
        setBulkWeighLoading(false);
        setBulkWeighResult({ success, errors });
        if (success > 0) await loadData();
    };

    const handleExportAnimals = async () => {
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `rebanho_${(farmName || 'fazenda').replace(/\s+/g, '_')}_${dateStr}.xlsx`;
        const headers = ['ID / Brinco', 'Raça', 'Sexo', 'Categoria', 'Pasto', 'Lote', 'Peso (kg)', 'Peso (@)', 'GMD (kg/dia)', 'Última pesagem'];
        const rows: Array<Array<string | number>> = [headers];
        for (const a of sortedAnimals) {
            const lotName = lots.find((l) => l.id === a.lotId)?.name || '';
            const arroba = a.pesoAtual != null ? Number((a.pesoAtual / 15).toFixed(1)) : '';
            const gmd = a.gmd30 ?? a.gmd ?? '';
            const ultimaPesagem = a.dataUltimaPesagem
                ? new Date(a.dataUltimaPesagem).toLocaleDateString('pt-BR')
                : '';
            rows.push([
                a.identificacao || '',
                a.raca || '',
                a.sexo || '',
                a.categoria || '',
                a.currentPaddockName || '',
                lotName,
                a.pesoAtual ?? '',
                arroba,
                typeof gmd === 'number' ? Number(gmd.toFixed(3)) : '',
                ultimaPesagem,
            ]);
        }
        await downloadWorkbook(fileName, 'Rebanho', rows);
    };

    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSortColumn(column);
        setSortDirection('asc');
    };

    const getSortIndicator = (column: SortColumn) => {
        if (sortColumn !== column) {
            return '↕';
        }
        return sortDirection === 'asc' ? '↑' : '↓';
    };

    const renderHeaderFilter = (column: Exclude<AnimalHeaderFilterKey, null>) => {
        if (activeHeaderFilter !== column) return null;

        return (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[210px] rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-3 shadow-lg">
                {column === 'identificacao' && (
                    <select
                        value={filterIdentificacao}
                        onChange={(event) => setFilterIdentificacao(event.target.value as 'todas' | 'com' | 'sem')}
                        className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]"
                    >
                        <option value="todas">Todas as identificações</option>
                        <option value="com">Com identificação</option>
                        <option value="sem">Sem identificação</option>
                    </select>
                )}
                {column === 'registro' && (
                    <select
                        value={filterRegistro}
                        onChange={(event) => setFilterRegistro(event.target.value as 'todas' | 'com' | 'sem')}
                        className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]"
                    >
                        <option value="todas">Todos os registros</option>
                        <option value="com">Com registro</option>
                        <option value="sem">Sem registro</option>
                    </select>
                )}
                {column === 'raca' && (
                    <select value={filterRaca} onChange={(event) => setFilterRaca(event.target.value)} className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]">
                        <option value="">Todas as raças</option>
                        {racaOptions.map((raca) => <option key={raca} value={raca}>{raca}</option>)}
                    </select>
                )}
                {column === 'sexo' && (
                    <select value={filterSexo} onChange={(event) => setFilterSexo(event.target.value)} className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]">
                        <option value="">Todos os sexos</option>
                        <option value="Macho">Macho</option>
                        <option value="Fêmea">Fêmea</option>
                    </select>
                )}
                {column === 'pasto' && (
                    <select value={filterPaddock} onChange={(event) => setFilterPaddock(event.target.value)} className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]">
                        <option value="">Todos os pastos</option>
                        {paddocks.map((paddock) => <option key={paddock.id} value={paddock.id}>{paddock.name}</option>)}
                    </select>
                )}
                {column === 'lote' && (
                    <select value={lotFilter} onChange={(event) => setLotFilter(event.target.value)} className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]">
                        <option value="">Todos os lotes</option>
                        {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.name}</option>)}
                    </select>
                )}
                {column === 'categoria' && (
                    <select value={filterCategoria} onChange={(event) => setFilterCategoria(event.target.value)} className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]">
                        <option value="">Todas as categorias</option>
                        <option value="Bezerro">Bezerro</option>
                        <option value="Bezerra">Bezerra</option>
                        <option value="Novilho">Novilho</option>
                        <option value="Novilha">Novilha</option>
                        <option value="Garrote">Garrote</option>
                        <option value="Garrota">Garrota</option>
                        <option value="Boi">Boi</option>
                        <option value="Vaca">Vaca</option>
                        <option value="Vaca de cria">Vaca de cria</option>
                        <option value="Vaca seca">Vaca seca</option>
                        <option value="Vaca de descarte">Vaca de descarte</option>
                        <option value="Touro">Touro</option>
                    </select>
                )}
                {column === 'peso' && (
                    <select
                        value={filterPesagem}
                        onChange={(event) => setFilterPesagem(event.target.value as 'todas' | 'sem' | 'desatualizada')}
                        className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]"
                    >
                        <option value="todas">Todas as pesagens</option>
                        <option value="sem">Sem pesagem</option>
                        <option value="desatualizada">Pesagem desatualizada (+30d)</option>
                    </select>
                )}
                {column === 'nutricao' && (
                    <select value={filterNutrition} onChange={(event) => setFilterNutrition(event.target.value)} className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)]">
                        <option value="">Todas as nutrições</option>
                        {nutritionOptions.map((nutritionName) => <option key={nutritionName} value={nutritionName}>{nutritionName}</option>)}
                    </select>
                )}
            </div>
        );
    };

    const isHeaderFiltered = (column: Exclude<AnimalHeaderFilterKey, null>) => {
        switch (column) {
            case 'identificacao': return filterIdentificacao !== 'todas';
            case 'registro': return filterRegistro !== 'todas';
            case 'raca': return Boolean(filterRaca);
            case 'sexo': return Boolean(filterSexo);
            case 'pasto': return Boolean(filterPaddock);
            case 'lote': return Boolean(lotFilter);
            case 'categoria': return Boolean(filterCategoria);
            case 'peso': return filterPesagem !== 'todas';
            case 'nutricao': return Boolean(filterNutrition);
            default: return false;
        }
    };

    const renderTable = (actionLabel?: string) => {
        const totalPages = Math.ceil(sortedAnimals.length / PAGE_SIZE);
        const paginatedAnimals = sortedAnimals.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

        return (
            <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                {/* Barra de ações em massa */}
                {selectedAnimals.size > 0 && (
                    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--eixo-border)] bg-[#f0f9d4] px-4 py-3">
                        <span className="text-sm font-semibold text-[#3a5c10]">
                            {selectedAnimals.size} {selectedAnimals.size === 1 ? 'animal selecionado' : 'animais selecionados'}
                        </span>
                        <button
                            type="button"
                            onClick={() => { setBulkError(null); setBulkMoveToLotOpen(true); }}
                            className="rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Mover para Lote
                        </button>
                        <button
                            type="button"
                            onClick={() => { setBulkError(null); setBulkMoveToPastoOpen(true); }}
                            className="rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Mover para Pasto
                        </button>
                        <button
                            type="button"
                            onClick={() => { setBulkError(null); setBulkWeighResult(null); setBulkWeighDate(''); setBulkWeighPeso(''); setBulkWeighOpen(true); }}
                            className="rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Registrar pesagem
                        </button>
                        <button
                            type="button"
                            onClick={() => { setBulkError(null); setBulkDeleteOpen(true); }}
                            className="rounded-xl bg-[#fce8e8] px-3 py-1.5 text-xs font-semibold text-[#8c2020] hover:bg-[#f5d0d0]"
                        >
                            Excluir selecionados
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedAnimals(new Set())}
                            className="ml-auto text-xs text-[var(--eixo-text-muted)] hover:underline"
                        >
                            Cancelar seleção
                        </button>
                    </div>
                )}
                <div ref={headerFilterRef} className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[var(--eixo-text-muted)]">
                        <thead className="bg-[var(--eixo-surface-soft)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                            <tr>
                                <th scope="col" className="w-10 px-4 py-3 border-r border-[var(--eixo-border)]">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-[var(--eixo-border)] accent-[#B6E23A] cursor-pointer"
                                        checked={paginatedAnimals.length > 0 && paginatedAnimals.every(a => selectedAnimals.has(a.id))}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedAnimals(prev => new Set([...prev, ...paginatedAnimals.map(a => a.id)]));
                                            } else {
                                                setSelectedAnimals(prev => {
                                                    const next = new Set(prev);
                                                    paginatedAnimals.forEach(a => next.delete(a.id));
                                                    return next;
                                                });
                                            }
                                        }}
                                    />
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'identificacao' ? null : 'identificacao')} className={`relative cursor-pointer px-4 py-3 border-r border-[var(--eixo-border)] ${isHeaderFiltered('identificacao') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>ID</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('identificacao'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('identificacao')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('identificacao')}
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'registro' ? null : 'registro')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('registro') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Registro</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('registro'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('registro')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('registro')}
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'raca' ? null : 'raca')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('raca') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Raça</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('raca'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('raca')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('raca')}
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'sexo' ? null : 'sexo')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('sexo') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Sexo</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('sexo'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('sexo')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('sexo')}
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('idade')} className="flex items-center justify-between gap-2 w-full">
                                        <span>Idade</span>
                                        <span className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)]">{getSortIndicator('idade')}</span>
                                    </button>
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'pasto' ? null : 'pasto')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('pasto') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Pasto</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('pasto'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('pasto')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('pasto')}
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'lote' ? null : 'lote')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('lote') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Lote</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('lote'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('lote')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('lote')}
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'categoria' ? null : 'categoria')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('categoria') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Categoria</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('categoria'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('categoria')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('categoria')}
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'peso' ? null : 'peso')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('peso') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Peso Atual</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('pesoAtual'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('pesoAtual')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('peso')}
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('gmd')} className="flex items-center justify-between gap-2 w-full">
                                        <span>GMD</span>
                                        <span className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)]">{getSortIndicator('gmd')}</span>
                                    </button>
                                </th>
                                <th scope="col" onClick={() => setActiveHeaderFilter((prev) => prev === 'nutricao' ? null : 'nutricao')} className={`relative cursor-pointer px-4 py-2.5 border-r border-[var(--eixo-border)] ${isHeaderFiltered('nutricao') ? 'bg-[#e8f5c9] text-[#3a5c10]' : ''}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Nutrição</span>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSort('nutricao'); }} className="rounded-md border border-[var(--eixo-border)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                                            {getSortIndicator('nutricao')}
                                        </button>
                                    </div>
                                    {renderHeaderFilter('nutricao')}
                                </th>
                                <th scope="col" className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={13} className="px-6 py-10 text-center text-sm text-[var(--eixo-text-muted)]">
                                        Carregando animais...
                                    </td>
                                </tr>
                            ) : sortedAnimals.length === 0 ? (
                                <tr>
                                    <td colSpan={13} className="px-6 py-10 text-center text-sm text-[var(--eixo-text-muted)]">
                                        <OnboardingSpotlight
                                            step={3}
                                            totalSteps={3}
                                            title="Adicione os animais do seu rebanho"
                                            description="Importe uma planilha ou cadastre manualmente para começar a acompanhar seu rebanho."
                                            actionLabel="Adicionar animal"
                                            onAction={openAnimalForm}
                                            iconPath="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                                        />
                                    </td>
                                </tr>
                            ) : (
                                paginatedAnimals.map((animal) => (
                                    <tr
                                        key={animal.id}
                                        className="cursor-pointer border-b border-[var(--eixo-border)] bg-[var(--eixo-surface)] transition-colors duration-150 hover:bg-[var(--eixo-surface)]"
                                        onClick={() => {
                                            setSelectedAnimal(animal);
                                        }}
                                    >
                                        <td className="w-10 border-r border-[var(--eixo-border)] px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-[var(--eixo-border)] accent-[#B6E23A] cursor-pointer"
                                                checked={selectedAnimals.has(animal.id)}
                                                onChange={(e) => {
                                                    setSelectedAnimals(prev => {
                                                        const next = new Set(prev);
                                                        if (e.target.checked) next.add(animal.id);
                                                        else next.delete(animal.id);
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </td>
                                        <th scope="row" className="whitespace-nowrap border-r border-[var(--eixo-border)] px-4 py-3 font-bold text-[var(--eixo-text)]">
                                            <div>{animal.identificacao}</div>
                                            <div className="mt-1">
                                                <span className="rounded-full bg-[var(--eixo-surface-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                                                    {animal.tipoCadastro === 'PO' ? 'P.O.' : 'Comercial'}
                                                </span>
                                            </div>
                                        </th>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">
                                            {animal.registro
                                                ? <span className="inline-flex items-center rounded-full bg-[#f0f9d4] px-2.5 py-0.5 text-xs font-semibold text-[#3a5c10] border border-[#B6E23A]">{animal.registro}</span>
                                                : <span className="text-[var(--eixo-text-muted)]">—</span>
                                            }
                                        </td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{animal.raca}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{animal.sexo}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{calculateAge(animal.dataNascimento)}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">
                                            {animal.currentPaddockName
                                                ? animal.currentPaddockName
                                                : (
                                                    <div className="flex flex-col items-start gap-1.5">
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fce8e8] px-2 py-0.5 text-[10px] font-semibold text-[#8c2020]">
                                                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86l-8.08 14A2 2 0 003.93 21h16.14a2 2 0 001.72-3.14l-8.08-14a2 2 0 00-3.42 0z" />
                                                            </svg>
                                                            Sem pasto
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedAnimals(new Set([animal.id]));
                                                                setBulkError(null);
                                                                setBulkTargetPastoId('');
                                                                setBulkMoveToPastoOpen(true);
                                                            }}
                                                            className="inline-flex items-center rounded-lg border border-[#d7cab3] bg-[#fffaf1] px-2.5 py-1 text-[11px] font-semibold text-[#6d6558] hover:bg-[#f3ebdc]"
                                                        >
                                                            Associar pasto
                                                        </button>
                                                    </div>
                                                )
                                            }
                                        </td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{lots.find((l) => l.id === animal.lotId)?.name || '—'}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{animal.categoria || '—'}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">
                                            {(() => {
                                                const diasDesdePesagem = animal.dataUltimaPesagem
                                                    ? Math.floor((Date.now() - new Date(animal.dataUltimaPesagem).getTime()) / 86400000)
                                                    : null;
                                                const stale = diasDesdePesagem !== null && diasDesdePesagem > 30;
                                                return (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className={`font-semibold ${stale ? 'text-amber-600' : 'text-[var(--eixo-text)]'}`}>
                                                            {animal.pesoAtual != null ? `${animal.pesoAtual} kg` : '—'}
                                                        </span>
                                                        {animal.pesoAtual != null && (
                                                            <span className="text-[10px] text-[var(--eixo-text-muted)]">
                                                                {(animal.pesoAtual / 15).toFixed(1)} @
                                                            </span>
                                                        )}
                                                        {animal.dataUltimaPesagem && diasDesdePesagem !== null && (
                                                            <span className={`text-[10px] ${stale ? 'text-amber-500' : 'text-[var(--eixo-text-muted)]'}`}>
                                                                {stale ? '⚠ ' : ''}{diasDesdePesagem}d atrás
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="border-r border-[var(--eixo-border)] px-6 py-4">
                                            {(() => {
                                                const g30 = animal.gmd30 ?? null;
                                                const gLast = animal.gmdLast ?? animal.gmd ?? null;
                                                const primary = g30 ?? gLast;
                                                const pct = primary !== null ? Math.min(100, (primary / 1.2) * 100) : 0;
                                                const barColor = primary === null
                                                    ? 'bg-[var(--eixo-border)]'
                                                    : primary >= 0.7
                                                        ? 'bg-green-300'
                                                        : primary >= 0.4
                                                            ? 'bg-yellow-200'
                                                            : 'bg-red-300';
                                                const colorCls = primary === null
                                                    ? 'text-[var(--eixo-text-soft)]'
                                                    : primary >= 0.8
                                                        ? 'text-[var(--eixo-success)]'
                                                        : primary >= 0.4
                                                            ? 'text-[var(--eixo-text)]'
                                                            : 'text-[var(--eixo-danger)]';
                                                return (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-1.5 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[var(--eixo-surface-soft)]">
                                                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                                            </div>
                                                            <span className={`text-sm font-semibold ${colorCls}`}>
                                                                {primary !== null ? `${formatNumber(primary)} kg` : '—'}
                                                            </span>
                                                        </div>
                                                        {/* Linha secundária: mostra gmdLast quando gmd30 é o primário */}
                                                        {g30 !== null && gLast !== null && Math.abs(g30 - gLast) > 0.001 && (
                                                            <span className="text-[10px] text-[var(--eixo-text-muted)]" title="Último intervalo">
                                                                {`${formatNumber(gLast)} últ.`}
                                                            </span>
                                                        )}
                                                        {g30 === null && gLast !== null && (
                                                            <span className="text-[10px] text-[var(--eixo-text-muted)]">*últ. intervalo</span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">
                                            {animal.nutritionPlan?.nome || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="rounded-full p-1 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-green)]"
                                                onClick={() => setSelectedAnimal(animal)}
                                                aria-label={actionLabel || 'Abrir detalhes'}
                                            >
                                                <DotsVerticalIcon />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="flex flex-col gap-3 border-t border-[var(--eixo-border)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-[var(--eixo-text-muted)]">
                            Página {currentPage} de {totalPages} — mostrando {paginatedAnimals.length} animais
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((page) => page - 1)}
                                disabled={currentPage === 1}
                                className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((page) => page + 1)}
                                disabled={currentPage === totalPages}
                                className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderOverview = () => (
        <div className="space-y-6">

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

                <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Total de animais</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[var(--eixo-text)]">
                        {overviewStats.total}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">
                        {overviewStats.machos}M · {overviewStats.femeas}F
                    </p>
                </div>

                <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Peso médio</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[var(--eixo-text)]">
                        {overviewStats.avgWeight !== null
                            ? `${overviewStats.avgWeight.toFixed(1)}`
                            : '—'}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">kg por animal</p>
                </div>

                <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Arroba média</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[var(--eixo-text)]">
                        {overviewStats.avgArroba !== null
                            ? `${overviewStats.avgArroba.toFixed(1)}`
                            : '—'}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">@ por animal</p>
                </div>

            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">GMD médio</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[var(--eixo-text)]">
                        {overviewStats.avgGmd !== null
                            ? `${overviewStats.avgGmd.toFixed(3)}`
                            : '—'}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">
                        {overviewStats.avgGmd !== null ? 'kg/dia · últimos 30 dias' : 'Aguardando pesagens'}
                    </p>
                </div>

                {overviewStats.semPesagem > 0 && (
                    <div className="rounded-3xl border border-[#d9ead0] bg-[var(--eixo-green-soft)] p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">Sem pesagem</p>
                        <p className="mt-2 font-brand text-4xl font-black text-[var(--eixo-green)]">
                            {overviewStats.semPesagem}
                        </p>
                        <p className="mt-1 text-xs text-[var(--eixo-graphite)]/70">animais sem registro de peso</p>
                    </div>
                )}

            </div>

            {(overviewStats.porCategoria.length > 0 || overviewStats.porRaca.length > 0) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                    {overviewStats.porCategoria.length > 0 && (
                        <div className="overflow-hidden rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                            <div className="px-5 pt-5 pb-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Por categoria</p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)]">
                                        <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Categoria</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Qtd</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Peso médio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overviewStats.porCategoria.map(({ categoria, count, avgPeso }) => (
                                        <tr key={categoria} className="border-b border-[var(--eixo-border)] last:border-0">
                                            <td className="px-5 py-3 font-medium text-[var(--eixo-text)]">{categoria}</td>
                                            <td className="px-5 py-3 text-right text-[var(--eixo-text-muted)]">{count}</td>
                                            <td className="px-5 py-3 text-right text-[var(--eixo-text-muted)]">
                                                {avgPeso !== null ? `${avgPeso.toFixed(0)} kg` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {overviewStats.porRaca.length > 0 && (
                        <div className="overflow-hidden rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                            <div className="px-5 pt-5 pb-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Por raça</p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)]">
                                        <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Raça</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Qtd</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Peso médio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overviewStats.porRaca.map(({ raca, count, avgPeso }) => (
                                        <tr key={raca} className="border-b border-[var(--eixo-border)] last:border-0">
                                            <td className="px-5 py-3 font-medium text-[var(--eixo-text)]">{raca}</td>
                                            <td className="px-5 py-3 text-right text-[var(--eixo-text-muted)]">{count}</td>
                                            <td className="px-5 py-3 text-right text-[var(--eixo-text-muted)]">
                                                {avgPeso !== null ? `${avgPeso.toFixed(0)} kg` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                </div>
            )}

        </div>
    );

    const renderLots = () => {
        return (
            <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[var(--eixo-text-muted)]">
                        <thead className="bg-[var(--eixo-surface-soft)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                            <tr>
                                <th scope="col" className="px-4 py-2.5">Lote</th>
                                <th scope="col" className="px-4 py-2.5">Finalidade</th>
                                <th scope="col" className="px-4 py-2.5">Status</th>
                                <th scope="col" className="px-4 py-2.5">Início</th>
                                <th scope="col" className="px-4 py-2.5">Observações</th>
                                <th scope="col" className="px-4 py-2.5 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-[var(--eixo-text-muted)]">
                                        Carregando lotes...
                                    </td>
                                </tr>
                            ) : lots.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-[var(--eixo-text-muted)]">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="space-y-1">
                                                <p className="text-base font-semibold text-[var(--eixo-text)]">
                                                    Nenhum lote cadastrado
                                                </p>
                                                <p>Organize seu rebanho criando um lote.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={openLotForm}
                                                className="flex items-center bg-[var(--eixo-green)] hover:bg-[var(--eixo-green-dark)] text-[#1a1a1a] font-bold py-2 px-4 rounded-xl shadow-md transition-colors duration-200"
                                            >
                                                <PlusIcon />
                                                <span className="ml-2">Adicionar lote</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                lots.map((lot) => (
                                    <tr
                                        key={lot.id}
                                        className="cursor-pointer border-b border-[var(--eixo-border)] bg-[var(--eixo-surface)] transition-colors duration-150 hover:bg-[var(--eixo-surface)]"
                                        onClick={() => setSelectedLot(lot)}
                                    >
                                        <td className="px-6 py-4 font-medium text-[var(--eixo-text)]">{lot.name}</td>
                                        <td className="px-4 py-3">{lot.objective || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lot.status === 'INATIVO' ? 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' : 'bg-[var(--eixo-green-soft)] text-[var(--eixo-green)]'}`}>
                                                {lot.status === 'INATIVO' ? 'Inativo' : 'Ativo'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {lot.startDate ? new Date(lot.startDate).toLocaleDateString('pt-BR') : '—'}
                                        </td>
                                        <td className="px-4 py-3">{lot.notes || '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSelectedLot(lot);
                                                }}
                                                className="inline-flex items-center justify-center rounded-xl border border-[var(--eixo-green)] bg-[var(--eixo-green)] px-4 py-2 text-xs font-bold text-[#1a1a1a] shadow-sm transition-colors hover:bg-[var(--eixo-green-dark)]"
                                            >
                                                Gerenciar lote
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderPastures = () => {
        return (
            <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[var(--eixo-text-muted)]">
                        <thead className="bg-[var(--eixo-surface-soft)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                            <tr>
                                <th scope="col" className="px-4 py-2.5">Pasto</th>
                                <th scope="col" className="px-4 py-2.5">Área (ha)</th>
                                <th scope="col" className="px-4 py-2.5">Capacidade</th>
                                <th scope="col" className="px-4 py-2.5">Animais</th>
                                <th scope="col" className="px-4 py-2.5">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paddocks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-[var(--eixo-text-muted)]">
                                        Nenhum pasto cadastrado em Fazendas e Pastos.
                                    </td>
                                </tr>
                            ) : (
                                paddocks.map((paddock) => {
                                    const animalCount = animals.filter(a => a.currentPaddockId === paddock.id).length;
                                    return (
                                    <tr key={paddock.id} className="border-b border-[var(--eixo-border)] last:border-0">
                                        <td className="px-4 py-3 font-medium text-[var(--eixo-text)]">{paddock.name}</td>
                                        <td className="px-4 py-3">{paddock.areaHa ?? '—'}</td>
                                        <td className="px-4 py-3">{paddock.capacity ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            {animalCount > 0 ? (
                                                <span className="inline-flex items-center rounded-full bg-[var(--eixo-green-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--eixo-graphite)]">
                                                    {animalCount}
                                                </span>
                                            ) : (
                                                <span className="text-[var(--eixo-text-muted)]">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {paddock.active === false ? 'Inativo' : 'Ativo'}
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className="mb-4 rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <h2 className="font-brand m-0 text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">{title}</h2>
                        <p className="mt-1 font-sans text-[13px] text-[var(--eixo-text-muted)]">{farmName || 'Fazenda'} · {animals.length} animais ativos</p>
                    </div>
                    <div className="flex flex-col gap-3 xl:items-end">
                        {activeTab === 'animals' && (
                            <>
                                <div className="flex flex-wrap items-start gap-[10px] xl:justify-end">
                                    <button
                                        type="button"
                                        onClick={openAnimalForm}
                                        className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-bold text-[#1a1a1a] shadow-md transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                                    >
                                        <PlusIcon className="h-[18px] w-[18px]" />
                                        <span className="ml-2 hidden sm:block">Adicionar animal</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNascimentoModalOpen(true)}
                                        className="flex h-10 items-center rounded-[10px] border border-[var(--eixo-border)] bg-white px-[14px] text-sm font-semibold text-[var(--eixo-text)] transition-colors duration-200 hover:bg-[var(--eixo-surface-soft)]"
                                    >
                                        <span className="mr-1.5">🐄</span>
                                        <span className="hidden sm:block">Registrar nascimento</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLoteModalOpen(true)}
                                        className="flex h-10 items-center rounded-[10px] border border-[var(--eixo-border)] bg-white px-[14px] text-sm font-semibold text-[var(--eixo-text)] transition-colors duration-200 hover:bg-[var(--eixo-surface-soft)]"
                                    >
                                        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span className="ml-2 hidden sm:block">Entrada de lote</span>
                                    </button>
                                    <div className="h-7 w-px self-center bg-[var(--eixo-border)]" />
                                    <>
                                        <button
                                            className="flex h-10 items-center rounded-[10px] border border-[var(--eixo-border)] bg-white px-[14px] text-sm font-semibold text-[var(--eixo-text)] transition-colors duration-200 hover:bg-[var(--eixo-surface-soft)]"
                                            type="button"
                                            onClick={handleUploadClick}
                                        >
                                            <UploadIcon className="h-[18px] w-[18px]" />
                                            <span className="ml-2 hidden sm:block">Importar planilha</span>
                                        </button>
                                        <button
                                            className="flex h-10 items-center justify-center rounded-[10px] border border-dashed border-[var(--eixo-border)] bg-transparent px-[10px] text-[13px] font-semibold text-[var(--eixo-text-muted)] transition-colors duration-200 hover:bg-[var(--eixo-surface-soft)]"
                                            type="button"
                                            onClick={handleDownloadTemplate}
                                        >
                                            <DownloadIcon className="h-4 w-4" />
                                            <span className="ml-1.5 hidden sm:block">Baixar modelo</span>
                                        </button>
                                    </>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </>
                        )}
                        {activeTab === 'lots' && (
                            <button
                                type="button"
                                onClick={openLotForm}
                                className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-bold text-[#1a1a1a] shadow-md transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                            >
                                <LayersIcon className="h-[18px] w-[18px]" />
                                <span className="ml-2 hidden sm:block">Criar lote</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {uploadMessage && (
                <div className="mb-4 rounded-xl border border-[#c8dbc4] bg-[var(--eixo-green-soft)] px-4 py-3">
                    <p className="text-sm font-medium text-[var(--eixo-success)]">{uploadMessage}</p>
                </div>
            )}
            {uploadError && (
                <div className="mb-4">
                    <p className="text-sm text-[var(--eixo-danger)]">{uploadError}</p>
                </div>
            )}
            {loadError && (
                <div className="mb-4">
                    <p className="text-sm text-[var(--eixo-danger)]">{loadError}</p>
                </div>
            )}

            <div className="mb-6 flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                            activeTab === tab.key
                                ? 'bg-[var(--eixo-green)] text-[#1a1a1a]'
                                : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'animals' && (
                <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <button
                        type="button"
                        onClick={() => applyHealthQuickFilter('sem_pasto')}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            healthQuickFilter === 'sem_pasto'
                                ? 'border-[#e5b9b0] bg-[#fff2ef]'
                                : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface-soft)]'
                        }`}
                    >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-text-muted)]">Sem pasto</p>
                        <p className="mt-1 text-2xl font-extrabold text-[#8c2020]">{healthOverview.withoutPaddock}</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Ver animais sem alocação</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => applyHealthQuickFilter('pesagem_atrasada')}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            healthQuickFilter === 'pesagem_atrasada'
                                ? 'border-[#ecd59b] bg-[#fff9e8]'
                                : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface-soft)]'
                        }`}
                    >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-text-muted)]">Pesagem &gt; 30 dias</p>
                        <p className="mt-1 text-2xl font-extrabold text-[#9a7a19]">{healthOverview.staleWeighing}</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Priorizar atualização</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => applyHealthQuickFilter('sem_categoria')}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            healthQuickFilter === 'sem_categoria'
                                ? 'border-[#d8c39c] bg-[#f9f2e5]'
                                : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface-soft)]'
                        }`}
                    >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-text-muted)]">Sem categoria</p>
                        <p className="mt-1 text-2xl font-extrabold text-[#7a5e2b]">{healthOverview.withoutCategory}</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Organizar classificação</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => applyHealthQuickFilter('gmd_baixo')}
                        className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            healthQuickFilter === 'gmd_baixo'
                                ? 'border-[#f0c4b8] bg-[#fff2ef]'
                                : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface-soft)]'
                        }`}
                    >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-text-muted)]">GMD abaixo da meta</p>
                        <p className="mt-1 text-2xl font-extrabold text-[#8c2020]">{healthOverview.belowTargetGmd}</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Verificar manejo/nutrição</p>
                    </button>
                </div>
            )}

            {activeTab === 'animals' && (
                <div className="mb-6 space-y-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                    <div className="relative">
                        <svg
                            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--eixo-text-muted)]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                        </svg>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Buscar por identificação, raça ou registro..."
                            className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] py-2 pl-9 pr-3 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Limpar filtros
                        </button>
                        <button
                            type="button"
                            onClick={handleExportAnimals}
                            disabled={sortedAnimals.length === 0}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Exportar ({sortedAnimals.length})
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'lots' && renderLots()}
            {activeTab === 'animals' && renderTable()}
            {activeTab === 'pastures' && renderPastures()}
            {activeTab === 'weighings' && farmId && (
                <WeighingsTab
                    farmId={farmId}
                    animals={animals}
                    lots={lots}
                    herdType={resolvedMode}
                    managementMode={weighingOnlyMode}
                />
            )}
            {activeTab === 'settings' && farmId && (
                <HerdSettingsTab farmId={farmId} />
            )}
            {/* Modal: Confirmar exclusão em massa */}
            {bulkDeleteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
                        <header className="border-b border-[var(--eixo-border)] p-5">
                            <h3 className="text-lg font-bold text-[var(--eixo-text)]">Excluir animais</h3>
                        </header>
                        <div className="p-5">
                            <p className="text-sm text-[var(--eixo-text)]">
                                Tem certeza que deseja excluir <strong>{selectedAnimals.size}</strong> {selectedAnimals.size === 1 ? 'animal' : 'animais'}? Esta ação não pode ser desfeita.
                            </p>
                            {bulkError && <p className="mt-3 text-sm text-[#8c2020]">{bulkError}</p>}
                        </div>
                        <footer className="flex justify-end gap-3 border-t border-[var(--eixo-border)] px-5 py-4">
                            <button type="button" onClick={() => setBulkDeleteOpen(false)} disabled={bulkLoading}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                Cancelar
                            </button>
                            <button type="button" onClick={handleBulkDelete} disabled={bulkLoading}
                                className="rounded-xl bg-[#fce8e8] px-4 py-2 text-sm font-semibold text-[#8c2020] hover:bg-[#f5d0d0] disabled:opacity-50">
                                {bulkLoading ? 'Excluindo...' : 'Excluir'}
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal: Mover para Lote */}
            {bulkMoveToLotOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
                        <header className="border-b border-[var(--eixo-border)] p-5">
                            <h3 className="text-lg font-bold text-[var(--eixo-text)]">Mover para Lote</h3>
                        </header>
                        <div className="p-5 space-y-3">
                            <p className="text-sm text-[var(--eixo-text-muted)]">{selectedAnimals.size} {selectedAnimals.size === 1 ? 'animal selecionado' : 'animais selecionados'}</p>
                            <select
                                value={bulkTargetLotId}
                                onChange={(e) => setBulkTargetLotId(e.target.value)}
                                className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[#B6E23A]"
                            >
                                <option value="">Sem lote</option>
                                {lots.map((l) => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                            {bulkError && <p className="text-sm text-[#8c2020]">{bulkError}</p>}
                        </div>
                        <footer className="flex justify-end gap-3 border-t border-[var(--eixo-border)] px-5 py-4">
                            <button type="button" onClick={() => setBulkMoveToLotOpen(false)} disabled={bulkLoading}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                Cancelar
                            </button>
                            <button type="button" onClick={handleBulkMoveToLot} disabled={bulkLoading}
                                className="rounded-xl bg-[#B6E23A] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[#a3d130] disabled:opacity-50">
                                {bulkLoading ? 'Movendo...' : 'Confirmar'}
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal: Mover para Pasto */}
            {bulkMoveToPastoOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
                        <header className="border-b border-[var(--eixo-border)] p-5">
                            <h3 className="text-lg font-bold text-[var(--eixo-text)]">Mover para Pasto</h3>
                        </header>
                        <div className="p-5 space-y-3">
                            <p className="text-sm text-[var(--eixo-text-muted)]">{selectedAnimals.size} {selectedAnimals.size === 1 ? 'animal selecionado' : 'animais selecionados'}</p>
                            <select
                                value={bulkTargetPastoId}
                                onChange={(e) => setBulkTargetPastoId(e.target.value)}
                                className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[#B6E23A]"
                            >
                                <option value="">Selecione um pasto</option>
                                {paddocks.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            {bulkError && <p className="text-sm text-[#8c2020]">{bulkError}</p>}
                        </div>
                        <footer className="flex justify-end gap-3 border-t border-[var(--eixo-border)] px-5 py-4">
                            <button type="button" onClick={() => setBulkMoveToPastoOpen(false)} disabled={bulkLoading}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                Cancelar
                            </button>
                            <button type="button" onClick={handleBulkMoveToPasto} disabled={bulkLoading}
                                className="rounded-xl bg-[#B6E23A] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[#a3d130] disabled:opacity-50">
                                {bulkLoading ? 'Movendo...' : 'Confirmar'}
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {bulkWeighOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-xl rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-xl">
                        <div className="border-b border-[var(--eixo-border)] px-6 py-4">
                            <h3 className="text-base font-bold text-[var(--eixo-text)]">
                                Registrar pesagem — {selectedAnimals.size} {selectedAnimals.size === 1 ? 'animal' : 'animais'}
                            </h3>
                        </div>
                        <div className="space-y-4 px-6 py-4">
                            {bulkWeighResult ? (
                                <>
                                    <div className="rounded-xl border border-[#c8ddc4] bg-[var(--eixo-green-soft)] p-4">
                                        <p className="font-bold text-[var(--eixo-text)]">
                                            {bulkWeighResult.success} {bulkWeighResult.success === 1 ? 'pesagem registrada' : 'pesagens registradas'}
                                        </p>
                                    </div>
                                    {bulkWeighResult.errors.length > 0 && (
                                        <div className="max-h-32 overflow-y-auto rounded-xl border border-[#efc2ba] bg-[#fff2ef] p-3 space-y-1">
                                            {bulkWeighResult.errors.map((e, i) => (
                                                <p key={i} className="text-xs text-[var(--eixo-danger)]">{e}</p>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--eixo-text)]">Data da pesagem</label>
                                        <input
                                            type="date"
                                            value={bulkWeighDate}
                                            onChange={(e) => setBulkWeighDate(e.target.value)}
                                            max={new Date().toISOString().slice(0, 10)}
                                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--eixo-text)]">Peso (kg)</label>
                                        <input
                                            type="number"
                                            value={bulkWeighPeso}
                                            onChange={(e) => setBulkWeighPeso(e.target.value)}
                                            placeholder="ex: 420"
                                            min="1"
                                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                                        />
                                    </div>
                                    {bulkError && <p className="text-xs text-[var(--eixo-danger)]">{bulkError}</p>}
                                </>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 border-t border-[var(--eixo-border)] px-6 py-4">
                            <button
                                type="button"
                                onClick={() => { setBulkWeighOpen(false); setBulkWeighResult(null); if (bulkWeighResult?.success) setSelectedAnimals(new Set()); }}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                            >
                                {bulkWeighResult ? 'Fechar' : 'Cancelar'}
                            </button>
                            {!bulkWeighResult && (
                                <button
                                    type="button"
                                    onClick={handleBulkWeigh}
                                    disabled={bulkWeighLoading || !bulkWeighDate || !bulkWeighPeso}
                                    className="rounded-xl bg-[var(--eixo-green)] px-6 py-2 text-sm font-bold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {bulkWeighLoading ? 'Registrando...' : 'Confirmar'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {animalFormOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={closeAnimalForm}
                >
                    <div
                        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-[var(--eixo-surface)] shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--eixo-border)] p-5">
                            <h3 className="text-lg font-bold text-[var(--eixo-text)]">Adicionar animal</h3>
                            <button
                                type="button"
                                className="rounded-full p-2 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                                onClick={closeAnimalForm}
                                aria-label="Fechar modal"
                            >
                                ✕
                            </button>
                        </header>
                        <form onSubmit={handleCreateAnimal} className="space-y-4 overflow-y-auto p-6">
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Tipo de cadastro</label>
                                <select
                                    value={animalForm.tipoCadastro}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, tipoCadastro: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                >
                                    <option value="MESTICO">Comercial</option>
                                    <option value="PO">P.O.</option>
                                </select>
                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                    Todos ficam no mesmo Rebanho. Este campo apenas classifica o animal.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Brinco</label>
                                <input
                                    type="text"
                                    value={animalForm.brinco}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, brinco: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Raça</label>
                                <input
                                    type="text"
                                    list="breed-suggestions"
                                    value={animalForm.raca}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, raca: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    placeholder="Digite ou selecione a raça"
                                    required
                                />
                                {farmBreeds.length > 0 && (
                                    <datalist id="breed-suggestions">
                                        {farmBreeds.map((name) => (
                                            <option key={name} value={name} />
                                        ))}
                                    </datalist>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Sexo</label>
                                <select
                                    value={animalForm.sexo}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, sexo: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                >
                                    <option value="Macho">Macho</option>
                                    <option value="Fêmea">Fêmea</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Data de nascimento</label>
                                <input
                                    type="date"
                                    value={animalForm.dataNascimento}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, dataNascimento: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Peso atual (kg)</label>
                                <input
                                    type="number"
                                    value={animalForm.pesoAtual}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, pesoAtual: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Pasto</label>
                                <select
                                    value={animalForm.paddockId}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockId: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    required
                                >
                                    <option value="">Selecione um pasto</option>
                                    {paddocks.length === 0 && (
                                        <option value="" disabled>
                                            Cadastre pastos na fazenda
                                        </option>
                                    )}
                                    {paddocks.map((paddock) => (
                                        <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Entrada no pasto</label>
                                <input
                                    type="date"
                                    value={animalForm.paddockStartAt}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockStartAt: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Lote</label>
                                <select
                                    value={animalForm.lotId}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, lotId: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                >
                                    <option value="">Sem lote</option>
                                    {lots.map((lot) => (
                                        <option key={lot.id} value={lot.id}>{lot.name}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Compra */}
                            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Compra (opcional)</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--eixo-text)]">Valor pago (R$)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={animalForm.valorCompra}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, valorCompra: event.target.value }))}
                                            placeholder="0,00"
                                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--eixo-text)]">Data da compra</label>
                                        <input
                                            type="date"
                                            value={animalForm.dataCompra}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, dataCompra: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <p className="mt-2 text-[11px] text-[var(--eixo-text-muted)]">Se informado, o lançamento cai automaticamente no Financeiro.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Registro</label>
                                <input
                                    type="text"
                                    value={animalForm.registro}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, registro: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    placeholder="RGN, RGD ou registro interno"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Categoria</label>
                                <select
                                    value={animalForm.categoria}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, categoria: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                >
                                    <option value="">Selecionar...</option>
                                    <option value="Bezerro">Bezerro</option>
                                    <option value="Bezerra">Bezerra</option>
                                    <option value="Novilho">Novilho</option>
                                    <option value="Novilha">Novilha</option>
                                    <option value="Garrote">Garrote</option>
                                    <option value="Garrota">Garrota</option>
                                    <option value="Boi">Boi</option>
                                    <option value="Vaca">Vaca</option>
                                    <option value="Vaca de cria">Vaca de cria</option>
                                    <option value="Vaca seca">Vaca seca</option>
                                    <option value="Vaca de descarte">Vaca de descarte</option>
                                    <option value="Touro">Touro</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Observações</label>
                                <textarea
                                    value={animalForm.observacoes}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    rows={3}
                                />
                            </div>
                            {animalFormError && (
                                <p className="text-sm text-[var(--eixo-danger)]">{animalFormError}</p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                    onClick={closeAnimalForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {lotModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={closeLotForm}
                >
                    <div
                        className="w-full max-w-2xl rounded-2xl bg-[var(--eixo-surface)] shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex items-center justify-between border-b border-[var(--eixo-border)] p-5">
                            <h3 className="text-lg font-bold text-[var(--eixo-text)]">Criar lote</h3>
                            <button
                                type="button"
                                className="rounded-full p-2 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                                onClick={closeLotForm}
                                aria-label="Fechar modal"
                            >
                                ✕
                            </button>
                        </header>
                        <form onSubmit={handleCreateLot} className="space-y-4 p-6">
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Nome</label>
                                <input
                                    type="text"
                                    value={lotForm.name}
                                    onChange={(event) => setLotForm((prev) => ({ ...prev, name: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    required
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-[var(--eixo-text)]">
                                    <span>Finalidade do lote</span>
                                    <LotObjectiveHelp />
                                </label>
                                <select
                                    value={lotForm.objective}
                                    onChange={(event) => setLotForm((prev) => ({ ...prev, objective: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                >
                                    <option value="">Não definida</option>
                                    {LOT_OBJECTIVE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">Status</label>
                                    <select
                                        value={lotForm.status}
                                        onChange={(event) => setLotForm((prev) => ({ ...prev, status: event.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    >
                                        {LOT_STATUS_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option === 'INATIVO' ? 'Inativo' : 'Ativo'}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">Data de início</label>
                                    <input
                                        type="date"
                                        value={lotForm.startDate}
                                        onChange={(event) => setLotForm((prev) => ({ ...prev, startDate: event.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[var(--eixo-text)]">Observações</label>
                                <textarea
                                    value={lotForm.notes}
                                    onChange={(event) => setLotForm((prev) => ({ ...prev, notes: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                    rows={3}
                                />
                            </div>
                            {lotFormError && (
                                <p className="text-sm text-[var(--eixo-danger)]">{lotFormError}</p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                    onClick={closeLotForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]"
                                >
                                    Salvar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {importModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-xl">

                        <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--eixo-text)]">
                                    Importar Rebanho
                                </h3>
                                {(() => {
                                    const mappedCount = Object.values(importMapping).filter(Boolean).length;
                                    const unmappedCount = importHeaders.length - mappedCount;
                                    return (
                                        <p className="text-sm text-[var(--eixo-text-muted)]">
                                            {importRows.length} animais ·{' '}
                                            {mappedCount} de {importHeaders.length} colunas mapeadas
                                            {unmappedCount > 0 && (
                                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                                    {unmappedCount} coluna{unmappedCount > 1 ? 's' : ''} serão ignoradas
                                                </span>
                                            )}
                                        </p>
                                    );
                                })()}
                            </div>
                            {!isImporting && !importProgress && (
                                <button type="button"
                                    onClick={() => setImportModalOpen(false)}
                                    className="rounded-lg p-1.5 text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]">
                                    ✕
                                </button>
                            )}
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">

                            {!importProgress && (
                                <>
                                    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                                            <p className="text-[28px] font-extrabold leading-tight text-[var(--eixo-text)]">Importar Rebanho</p>
                                            <p className="mt-4 text-sm text-[var(--eixo-text-muted)]">
                                                Primeiramente selecione o arquivo <span className="font-semibold">xlsx</span> em seu computador.
                                            </p>
                                            <p className="mt-4 text-sm text-[var(--eixo-text-muted)]">
                                                Em seguida, selecione a coluna desejada ao lado e nos diga em qual categoria ela se encaixa.
                                            </p>
                                            <p className="mt-4 text-sm font-semibold text-[var(--eixo-text)]">Valores que podem ser importados:</p>
                                            <ul className="mt-2 list-disc pl-5 text-sm text-[var(--eixo-text-muted)]">
                                                <li>ID</li>
                                                <li>SEXO</li>
                                                <li>RAÇA</li>
                                                <li>PESO</li>
                                            </ul>
                                        </div>

                                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                                            {!Object.values(importMapping).includes('brinco') && (
                                                <div className="mb-3 rounded-lg border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-2 text-xs text-[var(--eixo-graphite)]">
                                                    Selecione a coluna que representa o <span className="font-semibold">ID</span> para continuar.
                                                </div>
                                            )}
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-[640px] text-sm">
                                                    <thead>
                                                        <tr>
                                                            {importHeaders.map((h) => (
                                                                <th key={`map-${h}`} className="border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-2 py-2">
                                                                    <select
                                                                        value={importMapping[h] || ''}
                                                                        onChange={(e) => setImportMapping((prev) => ({ ...prev, [h]: e.target.value }))}
                                                                        className="w-full rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                                                                    >
                                                                        <option value="">Excluir campo</option>
                                                                        <option value="brinco">ID</option>
                                                                        <option value="sexo">SEXO</option>
                                                                        <option value="raca">RAÇA</option>
                                                                        <option value="pesoAtual">PESO</option>
                                                                    </select>
                                                                </th>
                                                            ))}
                                                        </tr>
                                                        <tr>
                                                            {importHeaders.map((h) => (
                                                                <th key={`head-${h}`} className="border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-2 py-2 text-left text-xs font-semibold text-[var(--eixo-text-muted)]">
                                                                    {h}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {importRows.slice(0, 20).map((row, rowIndex) => (
                                                            <tr key={`row-${rowIndex}`}>
                                                                {importHeaders.map((h) => (
                                                                    <td key={`cell-${rowIndex}-${h}`} className="border border-[var(--eixo-border)] px-2 py-2 text-xs text-[var(--eixo-text)]">
                                                                        {(row[h] || '').trim() || '—'}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <p className="mt-2 text-xs text-[var(--eixo-text-muted)]">
                                                Apenas as 20 primeiras linhas são exibidas no preview.
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}

                            {importProgress && (
                                <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                                    <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                                        <p className="text-[28px] font-extrabold leading-tight text-[var(--eixo-text)]">Importar Rebanho</p>
                                        <p className="mt-4 text-sm text-[var(--eixo-text-muted)]">
                                            Continue a revisão das linhas nesta mesma tela.
                                        </p>
                                        <p className="mt-4 text-sm font-semibold text-[var(--eixo-text)]">Campos esperados:</p>
                                        <ul className="mt-2 list-disc pl-5 text-sm text-[var(--eixo-text-muted)]">
                                            <li>ID</li>
                                            <li>SEXO</li>
                                            <li>RAÇA</li>
                                            <li>PESO (opcional)</li>
                                        </ul>
                                    </div>
                                    <div className="space-y-3">
                                    {/* Progresso durante importação */}
                                    {isImporting && (
                                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6">
                                            {(() => {
                                                const total = importProgress.total || 0;
                                                const success = importProgress.success || 0;
                                                const percent = total > 0 ? Math.min(100, Math.round((success / total) * 100)) : 0;
                                                const statusLabel = percent >= 95 ? 'Finalizando...' : 'Importando animais...';
                                                return (
                                                    <>
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <p className="text-sm font-semibold text-[var(--eixo-text)]">{statusLabel}</p>
                                                            <p className="text-sm font-bold text-[var(--eixo-text)]">{percent}%</p>
                                                        </div>
                                                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--eixo-surface-soft)]">
                                                            <div
                                                                className="h-full bg-[var(--eixo-green)] transition-all duration-300"
                                                                style={{ width: `${percent}%` }}
                                                            />
                                                        </div>
                                                        <p className="mt-2 text-center text-sm text-[var(--eixo-text-muted)]">
                                                            {success} / {total} animais processados
                                                        </p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* Resultado final */}
                                    {!isImporting && (
                                        <>
                                            {importFailedWithoutSuccess && (
                                                <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] p-4">
                                                    <p className="font-bold text-[var(--eixo-danger)]">
                                                        Nenhum animal foi salvo nesta tentativa.
                                                    </p>
                                                    <p className="mt-1 text-sm text-[var(--eixo-danger)]">
                                                        Corrija os erros listados abaixo e reimporte o arquivo.
                                                    </p>
                                                </div>
                                            )}
                                            {/* Card de sucesso */}
                                            <div className="rounded-xl border border-[#c8ddc4] bg-[var(--eixo-green-soft)] p-4 flex items-center gap-3">
                                                <span className="text-2xl">✓</span>
                                                <div>
                                                    <p className="font-bold text-[var(--eixo-text)]">
                                                        {importProgress.success} {importProgress.success === 1 ? 'animal importado' : 'animais importados'} com sucesso
                                                    </p>
                                                    {importProgress.errors.length === 0 && (
                                                        <p className="text-sm text-[var(--eixo-success)]">Todos os registros foram processados sem erros.</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card de erros — só aparece se houver erros */}
                                            {importProgress.errors.length > 0 && (
                                                <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] p-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-lg">⚠️</span>
                                                        <div>
                                                            <p className="font-bold text-[var(--eixo-danger)]">
                                                                {importProgress.errors.length} {importProgress.errors.length === 1 ? 'linha não foi importada' : 'linhas não foram importadas'}
                                                            </p>
                                                            <p className="text-xs text-[var(--eixo-danger)]">
                                                                Corrija os itens abaixo aqui no sistema e continue sem sair deste modal.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {importProgress.failedRows.length > 0 && !importCorrectionOpen && (
                                                        <div className="mb-3 rounded-xl border-2 border-[#e39b8d] bg-white p-3.5 shadow-sm">
                                                            <p className="text-xs font-bold uppercase tracking-wide text-[var(--eixo-danger)]">Passo 1 (ação principal)</p>
                                                            <p className="mt-1 text-sm font-semibold text-[var(--eixo-danger)]">Abra o editor para corrigir as linhas com erro e continuar a importação.</p>
                                                            <button
                                                                type="button"
                                                                onClick={openInlineCorrection}
                                                                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-[#e39b8d] bg-[#fbede8] px-3 py-2.5 text-sm font-bold text-[var(--eixo-danger)] hover:bg-[#f8ded6]"
                                                            >
                                                                Abrir editor de correção
                                                            </button>
                                                        </div>
                                                    )}
                                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                                        {importProgress.errors.map((err, i) => (
                                                            <div key={i} className="flex gap-2 rounded-lg bg-[var(--eixo-surface)]/60 px-3 py-2 text-xs text-[var(--eixo-danger)]">
                                                                <span className="flex-shrink-0 font-bold">{i + 1}.</span>
                                                                <span>{err}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {importCorrectionOpen && (
                                                        <div className="mt-3 space-y-2 rounded-xl border border-[#efc2ba] bg-white p-3">
                                                            <div className="rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2">
                                                                <p className="text-xs font-semibold text-[var(--eixo-text)]">Passo 2</p>
                                                                <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">Corrija os campos, clique em <span className="font-semibold">Revalidar correções</span> e depois em <span className="font-semibold">Importar corrigidas</span>.</p>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setImportCorrectionRows((prev) => prev.map((row) => ({ ...row, selected: true })))}
                                                                    className="rounded-lg border border-[var(--eixo-border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]"
                                                                >
                                                                    Selecionar todas
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setImportCorrectionRows((prev) => prev.map((row) => ({ ...row, selected: false })))}
                                                                    className="rounded-lg border border-[var(--eixo-border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]"
                                                                >
                                                                    Limpar seleção
                                                                </button>
                                                                <select
                                                                    value={bulkCorrectionField}
                                                                    onChange={(event) => setBulkCorrectionField(event.target.value as 'sexo' | 'raca')}
                                                                    className="rounded-lg border border-[var(--eixo-border)] bg-white px-2 py-1 text-[11px] text-[var(--eixo-text)]"
                                                                >
                                                                    <option value="sexo">Sexo</option>
                                                                    <option value="raca">Raça</option>
                                                                </select>
                                                                <input
                                                                    value={bulkCorrectionValue}
                                                                    onChange={(event) => setBulkCorrectionValue(event.target.value)}
                                                                    placeholder="Valor para aplicar"
                                                                    className="rounded-lg border border-[var(--eixo-border)] bg-white px-2 py-1 text-[11px] text-[var(--eixo-text)]"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={applyBulkCorrectionValue}
                                                                    className="rounded-lg bg-[var(--eixo-green)] px-2.5 py-1 text-[11px] font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]"
                                                                >
                                                                    Aplicar selecionadas
                                                                </button>
                                                            </div>
                                                            <div className="max-h-56 overflow-auto rounded-lg border border-[var(--eixo-border)]">
                                                                <table className="w-full text-xs">
                                                                    <thead className="sticky top-0 z-10 bg-[var(--eixo-surface-soft)]">
                                                                        <tr>
                                                                            <th className="px-2 py-2 text-left">Sel.</th>
                                                                            <th className="px-2 py-2 text-left">ID</th>
                                                                            <th className="px-2 py-2 text-left">Sexo</th>
                                                                            <th className="px-2 py-2 text-left">Raça</th>
                                                                            <th className="px-2 py-2 text-left">Data/Idade (opcional)</th>
                                                                            <th className="px-2 py-2 text-left">Registro</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {importCorrectionRows.map((row) => (
                                                                            <tr key={row.id} className="border-t border-[var(--eixo-border)]">
                                                                                <td className="px-2 py-2">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={row.selected}
                                                                                        onChange={(event) => setImportCorrectionRows((prev) => prev.map((item) => item.id === row.id ? { ...item, selected: event.target.checked } : item))}
                                                                                    />
                                                                                </td>
                                                                                <td className="px-2 py-2">
                                                                                    <input
                                                                                        value={row.values.brinco}
                                                                                        onChange={(event) => setImportCorrectionRows((prev) => prev.map((item) => item.id === row.id ? { ...item, values: { ...item.values, brinco: event.target.value } } : item))}
                                                                                        className={`w-full rounded-lg border px-2 py-1 ${row.fieldErrors.brinco ? 'border-[#ef4444]' : 'border-[var(--eixo-border)]'}`}
                                                                                    />
                                                                                </td>
                                                                                <td className="px-2 py-2">
                                                                                    <input
                                                                                        value={row.values.sexo}
                                                                                        onChange={(event) => setImportCorrectionRows((prev) => prev.map((item) => item.id === row.id ? { ...item, values: { ...item.values, sexo: event.target.value } } : item))}
                                                                                        className={`w-full rounded-lg border px-2 py-1 ${row.fieldErrors.sexo ? 'border-[#ef4444]' : 'border-[var(--eixo-border)]'}`}
                                                                                    />
                                                                                </td>
                                                                                <td className="px-2 py-2">
                                                                                    <input
                                                                                        value={row.values.raca}
                                                                                        onChange={(event) => setImportCorrectionRows((prev) => prev.map((item) => item.id === row.id ? { ...item, values: { ...item.values, raca: event.target.value } } : item))}
                                                                                        className={`w-full rounded-lg border px-2 py-1 ${row.fieldErrors.raca ? 'border-[#ef4444]' : 'border-[var(--eixo-border)]'}`}
                                                                                    />
                                                                                </td>
                                                                                <td className="px-2 py-2">
                                                                                    <input
                                                                                        value={row.values.dataNascimento}
                                                                                        onChange={(event) => setImportCorrectionRows((prev) => prev.map((item) => item.id === row.id ? { ...item, values: { ...item.values, dataNascimento: event.target.value } } : item))}
                                                                                        className={`w-full rounded-lg border px-2 py-1 ${row.fieldErrors.dataNascimento ? 'border-[#ef4444]' : 'border-[var(--eixo-border)]'}`}
                                                                                    />
                                                                                </td>
                                                                                <td className="px-2 py-2">
                                                                                    <input
                                                                                        value={row.values.registro}
                                                                                        onChange={(event) => setImportCorrectionRows((prev) => prev.map((item) => item.id === row.id ? { ...item, values: { ...item.values, registro: event.target.value } } : item))}
                                                                                        className={`w-full rounded-lg border px-2 py-1 ${row.fieldErrors.registro ? 'border-[#ef4444]' : 'border-[var(--eixo-border)]'}`}
                                                                                    />
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-xs font-medium text-[var(--eixo-text-muted)]">
                                                                    {importCorrectionRows.filter((row) => Object.keys(row.fieldErrors).length === 0 && !row.deferred).length} de {importCorrectionRows.filter((row) => !row.deferred).length} linhas prontas
                                                                </p>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => validateCorrectionRows(importCorrectionRows)}
                                                                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                                                    >
                                                                        Revalidar correções
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleImportCorrectedRows}
                                                                        disabled={importCorrectionLoading}
                                                                        className="rounded-xl bg-[var(--eixo-green)] px-3 py-1.5 text-xs font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                                                                    >
                                                                        {importCorrectionLoading ? 'Importando...' : 'Importar corrigidas'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={markSelectedForReviewLater}
                                                                        className="rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]"
                                                                    >
                                                                        Revisar depois
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            {deferredCorrectionCount > 0 && (
                                                                <p className="text-xs text-[var(--eixo-text-muted)]">
                                                                    {deferredCorrectionCount} {deferredCorrectionCount === 1 ? 'linha marcada' : 'linhas marcadas'} para revisar depois.
                                                                </p>
                                                            )}
                                                            <div className="rounded-lg border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2">
                                                                <p className="text-xs font-semibold text-[var(--eixo-text)]">Passo 3</p>
                                                                <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">Depois de importar as corrigidas, finalize no rodapé em <span className="font-semibold">Concluir</span>.</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {importProgress.weighingIssues.length > 0 && (
                                                <div className="rounded-xl border border-[#f3dfb0] bg-[#fff8e8] p-4">
                                                    <div className="mb-3 flex items-center gap-2">
                                                        <span className="text-lg">ℹ️</span>
                                                        <div>
                                                            <p className="font-bold text-[#9a6b06]">
                                                                {importProgress.weighingIssues.length} {importProgress.weighingIssues.length === 1 ? 'pendência de pesagem' : 'pendências de pesagem'}
                                                            </p>
                                                            <p className="text-xs text-[#9a6b06]">
                                                                Os animais foram criados. Apenas algumas pesagens não foram registradas.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="max-h-32 space-y-1.5 overflow-y-auto">
                                                        {importProgress.weighingIssues.map((err, i) => (
                                                            <div key={i} className="flex gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-[#9a6b06]">
                                                                <span className="flex-shrink-0 font-bold">{i + 1}.</span>
                                                                <span>{err}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {importSessionSuccessCount > 0 && (
                                                <div className="rounded-xl border border-[#c8ddc4] bg-[var(--eixo-green-soft)] p-4">
                                                    <p className="text-sm font-bold text-[var(--eixo-text)]">Resumo da sessão de correção</p>
                                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                        <div className="rounded-lg border border-[#d7cab3] bg-white px-3 py-2">
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-text-muted)]">Importadas agora</p>
                                                            <p className="text-base font-bold text-[var(--eixo-text)]">{importSessionSuccessCount}</p>
                                                        </div>
                                                        <div className="rounded-lg border border-[#d7cab3] bg-white px-3 py-2">
                                                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-text-muted)]">Pendentes para revisar depois</p>
                                                            <p className="text-base font-bold text-[var(--eixo-text)]">{deferredCorrectionCount}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {(healthOverview.withoutPaddock > 0 || healthOverview.withoutWeighing > 0) && (
                                                <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                                                    <p className="text-sm font-bold text-[var(--eixo-text)]">Próxima melhor ação</p>
                                                    <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                                        Finalize a base para o manejo diário com as correções abaixo.
                                                    </p>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {healthOverview.withoutPaddock > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={handleImportNextActionAssignPaddock}
                                                                className="rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]"
                                                            >
                                                                Associar {healthOverview.withoutPaddock} {healthOverview.withoutPaddock === 1 ? 'animal sem pasto' : 'animais sem pasto'}
                                                            </button>
                                                        )}
                                                        {healthOverview.withoutWeighing > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={handleImportNextActionWeigh}
                                                                className="rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-xs font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]"
                                                            >
                                                                Registrar pesagem de {healthOverview.withoutWeighing} {healthOverview.withoutWeighing === 1 ? 'animal' : 'animais'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 border-t border-[var(--eixo-border)] px-6 py-4">
                            {!importProgress && !isImporting && (
                                <>
                                    <button type="button"
                                        onClick={() => setImportModalOpen(false)}
                                        className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                                        Cancelar
                                    </button>
                                    <div className="flex flex-col items-end gap-1">
                                        {!Object.values(importMapping).includes('brinco') && (
                                            <p className="text-xs text-[var(--eixo-graphite)]">Mapeie o Brinco/ID para continuar</p>
                                        )}
                                        <button type="button"
                                            onClick={handleImportStart}
                                            disabled={!Object.values(importMapping).includes('brinco')}
                                            className="rounded-xl bg-[var(--eixo-green)] px-6 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-40">
                                            Importar {importRows.length} animais
                                        </button>
                                    </div>
                                </>
                            )}
                            {importProgress && !isImporting && (
                                <>
                                    {importProgress.errors.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setImportModalOpen(false);
                                                setImportProgress(null);
                                                setTimeout(() => fileInputRef.current?.click(), 100);
                                            }}
                                            className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                                        >
                                            Reimportar arquivo
                                        </button>
                                    )}
                                    {importFailedWithoutSuccess ? (
                                        <button
                                            type="button"
                                            onClick={() => setImportModalOpen(false)}
                                            className="rounded-xl border border-[#efc2ba] bg-white px-6 py-2 text-sm font-semibold text-[var(--eixo-danger)] hover:bg-[#fff2ef]"
                                        >
                                            Fechar sem salvar
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setImportModalOpen(false)}
                                            className={`rounded-xl px-6 py-2 text-sm font-semibold text-[#1a1a1a] ${
                                                deferredCorrectionCount > 0
                                                    ? 'bg-amber-300 hover:bg-amber-400'
                                                    : 'bg-[var(--eixo-green)] hover:bg-[var(--eixo-green-dark)]'
                                            }`}
                                        >
                                            {deferredCorrectionCount > 0
                                                ? `Concluir com ${deferredCorrectionCount} pendente${deferredCorrectionCount > 1 ? 's' : ''}`
                                                : importProgress.errors.length > 0 || importProgress.weighingIssues.length > 0
                                                    ? 'Concluir com pendências'
                                                    : 'Concluir'}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {categoryConfirmOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-xl rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-xl">
                        <div className="border-b border-[var(--eixo-border)] px-6 py-4">
                            <h3 className="text-base font-bold text-[var(--eixo-text)]">Confirmar categorias da importação</h3>
                            <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">
                                Revise como as categorias serão lidas antes de importar.
                            </p>
                        </div>
                        <div className="space-y-3 px-6 py-4">
                            {categoryNormalizationPreview.length === 0 ? (
                                <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma categoria detectada para revisar.</p>
                            ) : (
                                <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--eixo-border)]">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[var(--eixo-surface-soft)]">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-semibold text-[var(--eixo-text-muted)]">Categoria na planilha</th>
                                                <th className="px-3 py-2 text-left font-semibold text-[var(--eixo-text-muted)]">Categoria usada</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryNormalizationPreview.map((item, idx) => (
                                                <tr key={`${item.original}-${item.normalized}-${idx}`} className="border-t border-[var(--eixo-border)]">
                                                    <td className="px-3 py-2 text-[var(--eixo-text)]">{item.original}</td>
                                                    <td className={`px-3 py-2 ${
                                                        item.unknown
                                                            ? 'font-semibold text-[var(--eixo-danger)]'
                                                            : item.changed
                                                            ? 'font-semibold text-[var(--eixo-success)]'
                                                            : 'text-[var(--eixo-text)]'
                                                    }`}>
                                                        {item.normalized || 'Sem categoria'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {categoryNormalizationPreview.some((item) => item.unknown) && (
                                <p className="text-xs font-medium text-[var(--eixo-danger)]">
                                    Categorias não reconhecidas serão importadas como “Sem categoria”.
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 border-t border-[var(--eixo-border)] px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setCategoryConfirmOpen(false)}
                                className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]"
                            >
                                Voltar e revisar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCategoryConfirmOpen(false);
                                    void handleImportConfirm();
                                }}
                                className="rounded-xl bg-[var(--eixo-green)] px-6 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]"
                            >
                                Confirmar e importar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedAnimal && (
                <HerdAnimalModal
                    animal={selectedAnimal}
                    mode={resolvedMode}
                    onClose={() => setSelectedAnimal(null)}
                    onAnimalUpdated={loadData}
                />
            )}
            {selectedLot && (
                <LotDetailModal
                    lot={selectedLot}
                    onClose={() => setSelectedLot(null)}
                    onLotUpdated={loadData}
                    onLotDeleted={() => { setSelectedLot(null); loadData(); }}
                    mode={resolvedMode}
                />
            )}
            <LotePurchaseModal
                isOpen={loteModalOpen}
                onClose={() => setLoteModalOpen(false)}
                farmId={farmId ?? ''}
                paddocks={paddocks}
                lots={lots}
                onSuccess={loadData}
            />

            {/* ── Modal de Nascimento ─────────────────────────────────────── */}
            {nascimentoModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-[#B6E23A] bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#B6E23A] bg-[#f0f9d4] px-6 py-4 rounded-t-2xl">
                            <div>
                                <h3 className="text-base font-bold text-[#2F2F2F]">🐄 Registrar nascimento</h3>
                                <p className="text-xs text-[#5E5E5E]">O EIXO herda raça e pasto da mãe automaticamente</p>
                            </div>
                            <button type="button" onClick={() => { setNascimentoModalOpen(false); setNascimentoError(null); }}
                                className="rounded-full p-1.5 text-[#5E5E5E] hover:bg-[#e4f7b0]">✕</button>
                        </div>

                        <form className="space-y-4 p-6" onSubmit={async (e) => {
                            e.preventDefault();
                            if (!farmId) return;
                            setNascimentoError(null);
                            setNascimentoSaving(true);
                            try {
                                if (isPoMode) {
                                    throw new Error('Registro de nascimento está disponível apenas no Rebanho Comercial.');
                                }
                                const res = await fetch(`/animals/nascimento`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({
                                        farmId,
                                        sexo: nascimentoForm.sexo,
                                        dataNascimento: nascimentoForm.dataNascimento,
                                        pesoNascimento: nascimentoForm.pesoNascimento ? Number(nascimentoForm.pesoNascimento) : undefined,
                                        brinco: nascimentoForm.brinco || undefined,
                                        maeId: nascimentoForm.maeId || undefined,
                                        maeNome: nascimentoForm.maeNome || undefined,
                                    }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.message || 'Erro ao registrar nascimento');
                                await loadData();
                                setNascimentoModalOpen(false);
                                setNascimentoForm({ sexo: 'Fêmea', dataNascimento: new Date().toISOString().slice(0, 10), pesoNascimento: '', brinco: '', maeId: '', maeNome: '' });
                                if (data.brincoProvisorio) {
                                    alert(`Nascimento registrado! Brinco provisório: ${data.animal?.brinco}. Edite o animal para atribuir o brinco definitivo.`);
                                }
                            } catch (err: any) {
                                setNascimentoError(err.message || 'Erro ao registrar nascimento');
                            } finally {
                                setNascimentoSaving(false);
                            }
                        }}>
                            {/* Mãe */}
                            <div>
                                <label className="block text-sm font-semibold text-[#2F2F2F]">Mãe (brinco ou nome)</label>
                                <input
                                    type="text"
                                    placeholder="Digite o brinco da mãe..."
                                    value={nascimentoForm.maeNome}
                                    list="mae-suggestions"
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const found = animals.find(a => a.brinco === val || a.nome === val);
                                        setNascimentoForm(prev => ({ ...prev, maeNome: val, maeId: found?.id || '' }));
                                    }}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-2 text-sm focus:border-[#B6E23A] focus:outline-none focus:ring-2 focus:ring-[#B6E23A]/20"
                                />
                                <datalist id="mae-suggestions">
                                    {animals.filter(a => a.sexo === 'Fêmea' || a.sexo === 'FEMEA').map(a => (
                                        <option key={a.id} value={a.brinco}>{a.brinco}{a.nome ? ` — ${a.nome}` : ''}</option>
                                    ))}
                                </datalist>
                                {nascimentoForm.maeId && (
                                    <p className="mt-1 text-xs text-[#3a5c10]">✓ Mãe encontrada no plantel — raça e pasto serão herdados</p>
                                )}
                                {nascimentoForm.maeNome && !nascimentoForm.maeId && (
                                    <p className="mt-1 text-xs text-[#5E5E5E]">Mãe salva como texto — pode ser vinculada depois</p>
                                )}
                            </div>

                            {/* Sexo */}
                            <div>
                                <label className="block text-sm font-semibold text-[#2F2F2F]">Sexo do bezerro</label>
                                <div className="mt-1 flex gap-3">
                                    {(['Fêmea', 'Macho'] as const).map(s => (
                                        <button key={s} type="button"
                                            onClick={() => setNascimentoForm(prev => ({ ...prev, sexo: s }))}
                                            className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors ${
                                                nascimentoForm.sexo === s
                                                    ? 'border-[#B6E23A] bg-[#B6E23A] text-[#1a1a1a]'
                                                    : 'border-[var(--eixo-border)] text-[#5E5E5E] hover:bg-[#f5f5f5]'
                                            }`}>
                                            {s === 'Fêmea' ? '♀ Fêmea' : '♂ Macho'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Data */}
                            <div>
                                <label className="block text-sm font-semibold text-[#2F2F2F]">Data do nascimento</label>
                                <input type="date"
                                    value={nascimentoForm.dataNascimento}
                                    max={new Date().toISOString().slice(0, 10)}
                                    onChange={(e) => setNascimentoForm(prev => ({ ...prev, dataNascimento: e.target.value }))}
                                    required
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-2 text-sm focus:border-[#B6E23A] focus:outline-none focus:ring-2 focus:ring-[#B6E23A]/20"
                                />
                            </div>

                            {/* Campos opcionais */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-[#5E5E5E]">Peso ao nascer (kg) <span className="text-xs">(opcional)</span></label>
                                    <input type="number" min="0" step="0.1"
                                        value={nascimentoForm.pesoNascimento}
                                        onChange={(e) => setNascimentoForm(prev => ({ ...prev, pesoNascimento: e.target.value }))}
                                        placeholder="ex: 32"
                                        className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-2 text-sm focus:border-[#B6E23A] focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[#5E5E5E]">Brinco do bezerro <span className="text-xs">(opcional)</span></label>
                                    <input type="text"
                                        value={nascimentoForm.brinco}
                                        onChange={(e) => setNascimentoForm(prev => ({ ...prev, brinco: e.target.value }))}
                                        placeholder="ex: 0847"
                                        className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-2 text-sm focus:border-[#B6E23A] focus:outline-none"
                                    />
                                </div>
                            </div>
                            {!nascimentoForm.brinco && (
                                <p className="text-xs text-[#5E5E5E]">
                                    Sem brinco? O sistema gera um ID provisório — você completa depois.
                                </p>
                            )}

                            {nascimentoError && (
                                <p className="rounded-xl bg-[#fce8e8] px-3 py-2 text-sm text-[#8c2020]">{nascimentoError}</p>
                            )}

                            <button type="submit" disabled={nascimentoSaving || !nascimentoForm.dataNascimento}
                                className="w-full rounded-xl bg-[#B6E23A] py-2.5 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[#a3d130] disabled:opacity-50">
                                {nascimentoSaving ? 'Registrando...' : '🐄 Registrar nascimento'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HerdModule;
