import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import HerdAnimalModal from './AnimalDetailModal';
import LotDetailModal from './LotDetailModal';
import LotePurchaseModal from './LotePurchaseModal';
import WeighingsTab from './WeighingsTab';
import HerdSettingsTab from './HerdSettingsTab';
import {
    HerdAnimal,
    HerdLot,
    HerdType,
    createAnimal,
    createLot,
    listAnimals,
    listLots,
} from '../adapters/herdApi';
import { buildApiUrl } from '../api';
import type { Paddock } from '../types';

type TabKey = 'overview' | 'animals' | 'pastures' | 'lots' | 'weighings' | 'settings';

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
type SortColumn = 'identificacao' | 'raca' | 'sexo' | 'idade' | 'pasto' | 'pesoAtual' | 'gmd' | 'lote' | 'categoria';

// Campos P.O. (tatuagem, mae, pai, sisbov) liberados para todos os planos
const FIELD_PLAN: Record<string, 'free' | 'paid2'> = {
    brinco: 'free',
    nome: 'free',
    tipoCadastro: 'free',
    raca: 'free',
    sexo: 'free',
    dataNascimento: 'free',
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

const FIELD_LABELS: Record<string, string> = {
    brinco: 'Identificação / Brinco',
    nome: 'Nome',
    tipoCadastro: 'Tipo de Cadastro',
    raca: 'Raça',
    sexo: 'Sexo',
    dataNascimento: 'Data de Nascimento',
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

const downloadWorkbook = async (fileName: string, sheetName: string, rows: Array<Array<string | number>>) => {
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
        'id brinq', 'brinqu', 'id brinco',
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

const HerdModule: React.FC<HerdModuleProps> = ({ farmId, farmName, mode, herdType, isFreePlan = false, onUpgradeRequest, initialTabRequest, weighingOnlyMode = false }) => {
    void mode;
    void herdType;
    const resolvedMode: HerdType = 'COMMERCIAL';
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [animals, setAnimals] = useState<HerdAnimal[]>([]);
    const [lots, setLots] = useState<HerdLot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [lotFilter, setLotFilter] = useState('');
    const [filterRaca, setFilterRaca] = useState('');
    const [filterSexo, setFilterSexo] = useState('');
    const [filterIdentificacao, setFilterIdentificacao] = useState<'todas' | 'com' | 'sem'>('todas');
    const [filterPaddock, setFilterPaddock] = useState('');
    const [filterGmdMin, setFilterGmdMin] = useState('');
    const [filterGmdMax, setFilterGmdMax] = useState('');
    const [filterNutrition, setFilterNutrition] = useState('');
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
    const [importProgress, setImportProgress] = useState<null | {
        total: number; success: number; errors: string[];
    }>(null);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    }, [farmId]);

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
        setFilterSexo('');
        setFilterIdentificacao('todas');
        setFilterPaddock('');
        setFilterGmdMin('');
        setFilterGmdMax('');
        setFilterNutrition('');
    }, [farmId, resolvedMode]);

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
    }, [searchTerm, lotFilter, filterRaca, filterSexo, filterIdentificacao, filterPaddock, filterGmdMin, filterGmdMax, filterNutrition, activeTab]);

    const filteredAnimals = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const gmdMin = filterGmdMin ? Number(filterGmdMin) : null;
        const gmdMax = filterGmdMax ? Number(filterGmdMax) : null;
        const selectedPaddockName = filterPaddock
            ? paddocks.find((paddock) => paddock.id === filterPaddock)?.name || null
            : null;

        return animals.filter((animal) => {
            if (lotFilter && animal.lotId !== lotFilter) {
                return false;
            }

            if (filterRaca && String(animal.raca || '').trim().toLowerCase() !== filterRaca.trim().toLowerCase()) {
                return false;
            }

            if (filterSexo && animal.sexo !== filterSexo) {
                return false;
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
        filterIdentificacao,
        filterNutrition,
        filterPaddock,
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
        if (!ext.endsWith('.xlsx') && !ext.endsWith('.csv')) {
            setUploadError('Envie um arquivo .xlsx ou .csv.');
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
        let success = 0;
        const total = importRows.length;
        setImportProgress({ total, success: 0, errors: [] });

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

        const brincoCol = Object.entries(importMapping)
            .find(([, v]) => v === 'brinco')?.[0];
        const brincosSeen = new Set<string>();
        const duplicatesInFile = new Set<string>();
        if (brincoCol) {
            for (const row of importRows) {
                const b = (row[brincoCol] || '').trim();
                if (b) {
                    if (brincosSeen.has(b)) duplicatesInFile.add(b);
                    brincosSeen.add(b);
                }
            }
        }

        for (let i = 0; i < importRows.length; i++) {
            const row = importRows[i];
            const get = (field: string) => {
                const col = Object.entries(importMapping)
                    .find(([, v]) => v === field)?.[0];
                return col ? (row[col] || '').trim() : '';
            };

            const brinco = get('brinco');
            if (!brinco) {
                errors.push(`Linha ${i + 2}: identificação não encontrada — linha ignorada.`);
                continue;
            }
            if (duplicatesInFile.has(brinco)) {
                errors.push(`Linha ${i + 2} (${brinco}): brinco duplicado na planilha.`);
                continue;
            }

            const dataNasc = normalizeDate(get('dataNascimento'));
            const dataEntrada = normalizeDate(get('dataEntrada'));

            let pesoAtual: number | undefined;
            const pesoRaw = get('pesoAtual');
            if (pesoRaw) {
                const pesoNum = parseFloat(pesoRaw.replace(',', '.'));
                if (!isNaN(pesoNum) && pesoNum > 0) {
                    pesoAtual = importWeightUnit === 'arroba'
                        ? Math.round(pesoNum * 15)
                        : pesoNum;
                }
            }

            let valorCompra: number | undefined;
            const valorRaw = get('valorCompra');
            if (valorRaw) {
                const valorNum = parseFloat(
                    valorRaw.replace(/[R$\s]/g, '').replace(',', '.'),
                );
                if (!isNaN(valorNum) && valorNum > 0) valorCompra = valorNum;
            }

            try {
                await createAnimal(farmId, resolvedMode, {
                    brinco,
                    raca: get('raca') || 'Não informada',
                    sexo: normalizeSexo(get('sexo')),
                    dataNascimento: dataNasc || undefined,
                    pesoAtual,
                    categoria: get('categoria') || undefined,
                    observacoes: get('observacoes') || undefined,
                    dataEntrada: dataEntrada || undefined,
                    valorCompra: valorCompra || undefined,
                    tipoCadastro: get('tipoCadastro') || undefined,
                    // Campos P.O. — liberados para todos os planos
                    tatuagem: get('tatuagem') || undefined,
                    sisbov: get('sisbov') || undefined,
                    maeNome: get('mae') || undefined,
                    paiNome: get('pai') || undefined,
                });
                success++;
                setImportProgress({ total, success, errors: [...errors] });
            } catch (err: any) {
                const msg = err?.message || '';
                if (msg.toLowerCase().includes('unique') ||
                    msg.toLowerCase().includes('duplicado') ||
                    msg.toLowerCase().includes('já existe')) {
                    errors.push(
                        `Linha ${i + 2} (${brinco}): brinco já cadastrado no sistema.`,
                    );
                } else {
                    errors.push(`Linha ${i + 2} (${brinco}): ${msg || 'erro ao importar'}`);
                }
                setImportProgress({ total, success, errors: [...errors] });
            }
        }

        setIsImporting(false);
        await loadData();
    };

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
                <div className="overflow-x-auto">
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
                                <th scope="col" className="px-4 py-3 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('identificacao')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>ID</span>
                                        <span>{getSortIndicator('identificacao')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">Registro</th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('raca')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>Raça</span>
                                        <span>{getSortIndicator('raca')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('sexo')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>Sexo</span>
                                        <span>{getSortIndicator('sexo')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('idade')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>Idade</span>
                                        <span>{getSortIndicator('idade')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('pasto')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>Pasto</span>
                                        <span>{getSortIndicator('pasto')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('lote')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>Lote</span>
                                        <span>{getSortIndicator('lote')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('categoria')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>Categoria</span>
                                        <span>{getSortIndicator('categoria')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('pesoAtual')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>Peso Atual</span>
                                        <span>{getSortIndicator('pesoAtual')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">
                                    <button type="button" onClick={() => handleSort('gmd')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[var(--eixo-surface-soft)]">
                                        <span>GMD</span>
                                        <span>{getSortIndicator('gmd')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5 border-r border-[var(--eixo-border)]">Nutrição</th>
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
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="space-y-1">
                                                <p className="text-base font-semibold text-[var(--eixo-text)]">
                                                    Nenhum animal encontrado
                                                </p>
                                                <p>Use os botões acima para adicionar animais.</p>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={openAnimalForm}
                                                    className="flex items-center rounded-xl bg-[var(--eixo-green)] px-4 py-2 font-bold text-[#1a1a1a] shadow-md transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                                                >
                                                    <PlusIcon />
                                                    <span className="ml-2">Adicionar animal</span>
                                                </button>
                                            </div>
                                        </div>
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
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{animal.currentPaddockName || '—'}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{lots.find((l) => l.id === animal.lotId)?.name || '—'}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">{animal.categoria || '—'}</td>
                                        <td className="border-r border-[var(--eixo-border)] px-4 py-3">
                                            {animal.pesoAtual !== null && animal.pesoAtual !== undefined
                                                ? `${animal.pesoAtual} kg`
                                                : '—'}
                                        </td>
                                        <td className="border-r border-[var(--eixo-border)] px-6 py-4">
                                            {(() => {
                                                const g30 = animal.gmd30 ?? null;
                                                const gLast = animal.gmdLast ?? animal.gmd ?? null;
                                                const primary = g30 ?? gLast;
                                                const colorCls = primary === null
                                                    ? 'text-[var(--eixo-text-soft)]'
                                                    : primary >= 0.8
                                                        ? 'text-[var(--eixo-success)]'
                                                        : primary >= 0.4
                                                            ? 'text-[var(--eixo-text)]'
                                                            : 'text-[var(--eixo-danger)]';
                                                return (
                                                    <div className="flex flex-col">
                                                        <span className={`font-semibold ${colorCls}`}>
                                                            {primary !== null ? `${formatNumber(primary)} kg` : '—'}
                                                        </span>
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
                                <th scope="col" className="px-4 py-2.5">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paddocks.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-[var(--eixo-text-muted)]">
                                        Nenhum pasto cadastrado em Fazendas e Pastos.
                                    </td>
                                </tr>
                            ) : (
                                paddocks.map((paddock) => (
                                    <tr key={paddock.id} className="border-b border-[var(--eixo-border)] last:border-0">
                                        <td className="px-4 py-3 font-medium text-[var(--eixo-text)]">{paddock.name}</td>
                                        <td className="px-4 py-3">{paddock.areaHa ?? '—'}</td>
                                        <td className="px-4 py-3">{paddock.capacity ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            {paddock.active === false ? 'Inativo' : 'Ativo'}
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

    return (
        <div>
            <div className="mb-4 rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1 xl:max-w-[420px]">
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            {farmName || 'Fazenda'}
                        </div>
                        <h2 className="font-brand m-0 max-w-[12ch] text-2xl font-extrabold leading-tight text-[var(--eixo-text)] sm:max-w-none xl:whitespace-nowrap">{title}</h2>
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
                                        className="flex h-10 items-center rounded-[10px] border-2 border-[#B6E23A] bg-[#f0f9d4] px-[14px] text-sm font-bold text-[#2F2F2F] transition-colors duration-200 hover:bg-[#e4f7b0]"
                                    >
                                        <span className="mr-1.5">🐄</span>
                                        <span className="hidden sm:block">Registrar nascimento</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLoteModalOpen(true)}
                                        className="flex h-10 items-center rounded-[10px] border border-[var(--eixo-green)] bg-[var(--eixo-surface)] px-[14px] text-sm font-semibold text-[var(--eixo-text)] transition-colors duration-200 hover:bg-[var(--eixo-surface)]"
                                    >
                                        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span className="ml-2 hidden sm:block">Entrada de lote</span>
                                    </button>
                                    <>
                                        <div className="flex flex-col items-center">
                                            <button
                                                className="flex h-10 items-center rounded-[10px] bg-[var(--eixo-green)] px-[14px] font-bold text-[#1a1a1a] shadow-md transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                                                type="button"
                                                onClick={handleUploadClick}
                                            >
                                                <UploadIcon className="h-[18px] w-[18px]" />
                                                <span className="ml-2 hidden sm:block">Importar planilha</span>
                                            </button>
                                            <span className="mt-1 text-center text-xs font-medium text-[var(--eixo-text-muted)]">
                                                Funciona com qualquer planilha sua
                                            </span>
                                        </div>
                                        <button
                                            className="flex h-10 items-center justify-center rounded-[10px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-[10px] text-[13px] font-semibold text-[var(--eixo-text-muted)] transition-colors duration-200 hover:bg-[var(--eixo-surface-soft)]"
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
                        <select
                            value={filterSexo}
                            onChange={(event) => setFilterSexo(event.target.value)}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        >
                            <option value="">Todos os sexos</option>
                            <option value="Macho">Macho</option>
                            <option value="Fêmea">Fêmea</option>
                        </select>
                        <select
                            value={filterIdentificacao}
                            onChange={(event) => setFilterIdentificacao(event.target.value as 'todas' | 'com' | 'sem')}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        >
                            <option value="todas">Todas as identificações</option>
                            <option value="com">Com identificação</option>
                            <option value="sem">Sem identificação</option>
                        </select>
                        <select
                            value={filterPaddock}
                            onChange={(event) => setFilterPaddock(event.target.value)}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        >
                            <option value="">Todos os pastos</option>
                            {paddocks.map((paddock) => (
                                <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                            ))}
                        </select>
                        <select
                            value={lotFilter}
                            onChange={(event) => setLotFilter(event.target.value)}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        >
                            <option value="">Todos os lotes</option>
                            {lots.map((lot) => (
                                <option key={lot.id} value={lot.id}>{lot.name}</option>
                            ))}
                        </select>
                        <select
                            value={filterNutrition}
                            onChange={(event) => setFilterNutrition(event.target.value)}
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        >
                            <option value="">Todas as nutrições</option>
                            {nutritionOptions.map((nutritionName) => (
                                <option key={nutritionName} value={nutritionName}>{nutritionName}</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <input
                            type="number"
                            value={filterGmdMin}
                            onChange={(event) => setFilterGmdMin(event.target.value)}
                            placeholder="GMD mín"
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        />
                        <input
                            type="number"
                            value={filterGmdMax}
                            onChange={(event) => setFilterGmdMax(event.target.value)}
                            placeholder="GMD máx"
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        />
                        <input
                            type="text"
                            value={filterRaca}
                            onChange={(event) => setFilterRaca(event.target.value)}
                            placeholder="Filtrar por raça..."
                            className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] placeholder:text-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/10"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                setSearchTerm('');
                                setLotFilter('');
                                setFilterRaca('');
                                setFilterSexo('');
                                setFilterIdentificacao('todas');
                                setFilterPaddock('');
                                setFilterGmdMin('');
                                setFilterGmdMax('');
                                setFilterNutrition('');
                            }}
                            className="w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Limpar filtros
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
                    <div className="w-full max-w-sm rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
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
                    <div className="w-full max-w-sm rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
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
                    <div className="w-full max-w-sm rounded-2xl bg-[var(--eixo-surface)] shadow-2xl">
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

            {animalFormOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={closeAnimalForm}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl bg-[var(--eixo-surface)] shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex items-center justify-between border-b border-[var(--eixo-border)] p-5">
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
                        <form onSubmit={handleCreateAnimal} className="space-y-4 p-6">
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
                                <input
                                    type="text"
                                    value={animalForm.categoria}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, categoria: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/10"
                                />
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
                        className="w-full max-w-lg rounded-2xl bg-[var(--eixo-surface)] shadow-2xl"
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
                    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-xl">

                        <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--eixo-text)]">
                                    Importar planilha
                                </h3>
                                <p className="text-sm text-[var(--eixo-text-muted)]">
                                    {importRows.length} animais encontrados ·{' '}
                                    {importHeaders.length} colunas detectadas ·{' '}
                                    {Object.values(importMapping).filter(Boolean).length} mapeadas automaticamente
                                </p>
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
                                    <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                                        <p className="mb-2 text-sm font-semibold text-[var(--eixo-text)]">
                                            Unidade de peso
                                        </p>
                                        <div className="flex gap-3">
                                            {(['kg', 'arroba'] as const).map((u) => (
                                                <button key={u} type="button"
                                                    onClick={() => setImportWeightUnit(u)}
                                                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                                                        importWeightUnit === u
                                                            ? 'border-[var(--eixo-green)] bg-[var(--eixo-green)] text-[#1a1a1a]'
                                                            : 'border-[var(--eixo-border)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]'
                                                    }`}>
                                                    {u === 'kg' ? 'Quilos (kg)' : 'Arrobas (@) × 15'}
                                                </button>
                                            ))}
                                        </div>
                                        {importWeightUnit === 'arroba' && (
                                            <p className="mt-2 text-xs text-[var(--eixo-text)]">
                                                ⚠️ Detectamos valores que podem ser arrobas. Cada arroba será convertida para 15 kg.
                                            </p>
                                        )}
                                    </div>

                                    {/* Banner P.O. — aparece quando a planilha tem dados de genética */}
                                    {PO_IMPORT_FIELDS.some(f => Object.values(importMapping).includes(f)) && (
                                        <div className="rounded-xl border-2 border-[#B6E23A] bg-[#f0f9d4] p-4">
                                            <div className="flex items-start gap-3">
                                                <span className="text-2xl">🧬</span>
                                                <div>
                                                    <p className="text-sm font-bold text-[#2F2F2F]">
                                                        Planilha com dados de P.O. detectada
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-[#5E5E5E]">
                                                        O EIXO identificou campos de genealogia — tatuagem, mãe, pai ou SISBOV. Esses dados serão importados e vinculados ao plantel.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                                        <p className="mb-1 text-sm font-semibold text-[var(--eixo-text)]">
                                            Mapeamento de colunas
                                        </p>
                                        <p className="mb-3 text-xs text-[var(--eixo-text-muted)]">
                                            Confirme os campos detectados automaticamente e ajuste os que ficaram em branco.
                                        </p>

                                        {/* Aviso quando brinco não está mapeado */}
                                        {!Object.values(importMapping).includes('brinco') && (
                                            <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-2.5">
                                                <span className="mt-0.5 flex-shrink-0 text-[var(--eixo-green)]">⚠️</span>
                                                <p className="text-xs text-[var(--eixo-graphite)]">
                                                    <span className="font-semibold">Campo obrigatório não identificado:</span> selecione qual coluna da planilha contém o <span className="font-semibold">Brinco / ID</span> do animal para continuar.
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {importHeaders.map((h) => {
                                                const mapped = importMapping[h] || '';
                                                const plan = mapped ? FIELD_PLAN[mapped] : null;
                                                const isLocked = plan === 'paid2';
                                                const isUnmapped = !mapped;
                                                const isPO = mapped ? PO_IMPORT_FIELDS.includes(mapped) : false;
                                                return (
                                                <div key={h} className={`flex items-center gap-3 rounded-lg px-2 py-1 transition-colors ${isUnmapped ? 'bg-[var(--eixo-green-soft)]' : isPO ? 'bg-[#f0f9d4]' : ''}`}>
                                                    <span className="w-44 truncate text-sm text-[var(--eixo-text-muted)]" title={h}>
                                                        "{h}"
                                                    </span>
                                                    <span className="text-[var(--eixo-text-muted)]">→</span>
                                                    <select
                                                        value={mapped}
                                                        onChange={(e) => setImportMapping(
                                                            (prev) => ({
                                                                ...prev,
                                                                [h]: e.target.value,
                                                            }),
                                                        )}
                                                        className={`flex-1 rounded-xl border px-3 py-1.5 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none ${
                                                            isUnmapped
                                                                ? 'border-[#d9ead0] bg-[var(--eixo-green-soft)]'
                                                                : isPO
                                                                ? 'border-[#B6E23A] bg-[#f0f9d4]'
                                                                : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)]'
                                                        }`}
                                                    >
                                                        <option value="">
                                                            — Selecionar campo —
                                                        </option>
                                                        <optgroup label="Campos básicos">
                                                            <option value="brinco">{FIELD_LABELS.brinco}</option>
                                                            <option value="tipoCadastro">{FIELD_LABELS.tipoCadastro}</option>
                                                            <option value="nome">{FIELD_LABELS.nome}</option>
                                                            <option value="raca">{FIELD_LABELS.raca}</option>
                                                            <option value="sexo">{FIELD_LABELS.sexo}</option>
                                                            <option value="dataNascimento">{FIELD_LABELS.dataNascimento}</option>
                                                            <option value="pesoAtual">{FIELD_LABELS.pesoAtual}</option>
                                                            <option value="dataPesagem">{FIELD_LABELS.dataPesagem}</option>
                                                            <option value="lote">{FIELD_LABELS.lote}</option>
                                                            <option value="pasto">{FIELD_LABELS.pasto}</option>
                                                            <option value="categoria">{FIELD_LABELS.categoria}</option>
                                                            <option value="observacoes">{FIELD_LABELS.observacoes}</option>
                                                            <option value="dataEntrada">{FIELD_LABELS.dataEntrada}</option>
                                                            <option value="valorCompra">{FIELD_LABELS.valorCompra}</option>
                                                        </optgroup>
                                                        <optgroup label="🧬 Genealogia / P.O.">
                                                            <option value="tatuagem">{FIELD_LABELS.tatuagem}</option>
                                                            <option value="mae">{FIELD_LABELS.mae}</option>
                                                            <option value="pai">{FIELD_LABELS.pai}</option>
                                                            <option value="sisbov">{FIELD_LABELS.sisbov}</option>
                                                        </optgroup>
                                                        <optgroup label="── Eixo Decisão — faça upgrade para importar ──">
                                                            <option value="" disabled>{FIELD_LABELS.eid}</option>
                                                            <option value="" disabled>{FIELD_LABELS.ncf}</option>
                                                            <option value="" disabled>{FIELD_LABELS.rgd}</option>
                                                            <option value="" disabled>{FIELD_LABELS.rgn}</option>
                                                            <option value="" disabled>{FIELD_LABELS.abcz}</option>
                                                        </optgroup>
                                                    </select>
                                                    {mapped && !isLocked && (
                                                        <span className={`text-sm font-bold ${isPO ? 'text-[#3a5c10]' : 'text-[var(--eixo-success)]'}`}>
                                                            {isPO ? '🧬' : '✓'}
                                                        </span>
                                                    )}
                                                    {mapped && isLocked && (
                                                        <span className="text-[var(--eixo-text)] text-sm">🔒</span>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-3">
                                        <p className="mb-1 text-xs font-semibold text-[var(--eixo-text)]">
                                            Prévia — primeiros 3 animais detectados:
                                        </p>
                                        <p className="text-xs text-[var(--eixo-text-muted)]">
                                            {importRows.slice(0, 3).map((r, i) => {
                                                const idCol = Object.entries(importMapping)
                                                    .find(([, v]) => v === 'brinco')?.[0];
                                                return idCol ? r[idCol] : `linha ${i + 1}`;
                                            }).filter(Boolean).join(' · ') || '—'}
                                        </p>
                                    </div>
                                </>
                            )}

                            {importProgress && (
                                <div className="space-y-3">
                                    {/* Progresso durante importação */}
                                    {isImporting && (
                                        <div className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 text-center">
                                            <p className="text-sm text-[var(--eixo-text-muted)]">Importando...</p>
                                            <p className="mt-1 text-3xl font-bold text-[var(--eixo-text)]">
                                                {importProgress.success} / {importProgress.total}
                                            </p>
                                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">animais processados</p>
                                        </div>
                                    )}

                                    {/* Resultado final */}
                                    {!isImporting && (
                                        <>
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
                                                                Corrija os itens abaixo na planilha e reimporte o arquivo.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                                        {importProgress.errors.map((err, i) => (
                                                            <div key={i} className="flex gap-2 rounded-lg bg-[var(--eixo-surface)]/60 px-3 py-2 text-xs text-[var(--eixo-danger)]">
                                                                <span className="flex-shrink-0 font-bold">{i + 1}.</span>
                                                                <span>{err}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
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
                                            onClick={handleImportConfirm}
                                            disabled={!Object.values(importMapping).includes('brinco')}
                                            className="rounded-xl bg-[var(--eixo-green)] px-6 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-40">
                                            Importar {importRows.length} animais
                                        </button>
                                    </div>
                                </>
                            )}
                            {importProgress && !isImporting && (
                                <button type="button"
                                    onClick={() => setImportModalOpen(false)}
                                    className="rounded-xl bg-[var(--eixo-green)] px-6 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]">
                                    {importProgress.errors.length > 0 ? 'Fechar' : 'Concluir'}
                                </button>
                            )}
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
