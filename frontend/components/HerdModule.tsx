import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import HerdAnimalModal from './AnimalDetailModal';
import LotDetailModal from './LotDetailModal';
import LotePurchaseModal from './LotePurchaseModal';
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

type TabKey = 'overview' | 'lots' | 'animals' | 'weighings' | 'settings';

interface HerdModuleProps {
    farmId?: string | null;
    farmName?: string | null;
    mode?: HerdType;
    herdType?: HerdType;
    isFreePlan?: boolean;
    onUpgradeRequest?: (animalCount?: number) => void;
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

const FIELD_PLAN: Record<string, 'free' | 'paid1' | 'paid2'> = {
    brinco: 'free',
    nome: 'free',
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
    tatuagem: 'paid1',
    mae: 'paid1',
    pai: 'paid1',
    sisbov: 'paid1',
    eid: 'paid2',
    ncf: 'paid2',
    rgd: 'paid2',
    rgn: 'paid2',
    abcz: 'paid2',
};

const FIELD_LABELS: Record<string, string> = {
    brinco: 'Identificação / Brinco',
    nome: 'Nome',
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
    tatuagem: 'Tatuagem 🔒',
    mae: 'Mãe / Matriz 🔒',
    pai: 'Pai / Touro 🔒',
    sisbov: 'SISBOV 🔒',
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
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        return [];
    }

    const matrix: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values: string[] = [];
        for (let index = 1; index <= row.cellCount; index += 1) {
            values.push(String(row.getCell(index).text ?? '').trim());
        }
        matrix.push(values);
    });
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

const HerdModule: React.FC<HerdModuleProps> = ({ farmId, farmName, mode, herdType, isFreePlan = false, onUpgradeRequest }) => {
    const resolvedMode = mode ?? herdType ?? 'COMMERCIAL';
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [animals, setAnimals] = useState<HerdAnimal[]>([]);
    const [lots, setLots] = useState<HerdLot[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [lotFilter, setLotFilter] = useState('');
    const [filterRaca, setFilterRaca] = useState('');
    const [filterSexo, setFilterSexo] = useState('');
    const [filterPaddock, setFilterPaddock] = useState('');
    const [filterGmdMin, setFilterGmdMin] = useState('');
    const [filterGmdMax, setFilterGmdMax] = useState('');
    const [filterNutrition, setFilterNutrition] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
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

    const [animalForm, setAnimalForm] = useState({
        brinco: '',
        nome: '',
        raca: '',
        sexo: 'Macho',
        dataNascimento: '',
        pesoAtual: '',
        registro: '',
        categoria: '',
        observacoes: '',
        lotId: '',
        paddockId: '',
        paddockStartAt: '',
        valorCompra: '',
        dataCompra: '',
    });
    const [lotForm, setLotForm] = useState({ name: '', notes: '' });
    const [paddocks, setPaddocks] = useState<Paddock[]>([]);

    const isPo = resolvedMode === 'PO';

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
        loadPaddocks();
        return () => {
            isActive = false;
        };
    }, [farmId]);

    const tabs = useMemo(() => {
        return [
            { key: 'overview', label: 'Visão do Rebanho' },
            { key: 'animals', label: 'Animais' },
            { key: 'lots', label: 'Lotes' },
            { key: 'weighings', label: 'Pesagens' },
            { key: 'settings', label: 'Configurações' },
        ];
    }, []);

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
        setSelectedAnimal(null);
        setSelectedLot(null);
        setLotFilter('');
        setSearchTerm('');
        setFilterRaca('');
        setFilterSexo('');
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
        setCurrentPage(1);
    }, [searchTerm, lotFilter, filterRaca, filterSexo, filterPaddock, filterGmdMin, filterGmdMax, filterNutrition, activeTab]);

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

            if (isPo) {
                const haystack = [
                    animal.identificacao,
                    animal.nome,
                    animal.brinco,
                    animal.registro,
                    animal.raca,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return !term || haystack.includes(term);
            }
            if (!term) {
                return true;
            }
            return [animal.identificacao, animal.raca, animal.sexo, animal.registro]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(term);
        });
    }, [
        animals,
        filterGmdMax,
        filterGmdMin,
        filterNutrition,
        filterPaddock,
        filterRaca,
        filterSexo,
        isPo,
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

        const semPesagem = animals.filter((a) => a.gmd30 === null && a.gmdLast === null).length;

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
            categoria: '',
            observacoes: '',
            lotId: '',
            paddockId: '',
            paddockStartAt: '',
        });
    };

    const resetLotForm = () => {
        setLotForm({ name: '', notes: '' });
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
        const fileName = isPo ? 'modelo_rebanho_po.xlsx' : 'modelo_rebanho_comercial.xlsx';
        const sheetName = isPo ? 'Rebanho P.O.' : 'Rebanho Comercial';
        const headers = isPo
            ? ['Brinco', 'Nome', 'Raça', 'Sexo (Macho|Fêmea)', 'Data Nascimento (DD/MM/AAAA)', 'Peso Atual (kg)', 'Registro', 'Categoria']
            : [
                'Brinco',
                'Raça',
                'Sexo (Macho|Fêmea)',
                'Data Nascimento (DD/MM/AAAA)',
                'Peso Atual (kg)',
                'Data Pesagem 1 (DD/MM/AAAA)',
                'Peso Pesagem 1 (kg)',
                'Data Pesagem 2 (DD/MM/AAAA)',
                'Peso Pesagem 2 (kg)',
            ];
        const sampleRow = isPo
            ? ['PO001', 'Matriz Top', 'Nelore', 'Fêmea', '01/01/2022', '450', 'ABCZ-123', 'Doadora']
            : ['BR001', 'Nelore', 'Macho', '01/01/2023', '450', '15/02/2024', '455', '', ''];
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
        if (isPo) {
            if (!animalForm.nome.trim() || !animalForm.raca.trim()) {
                setAnimalFormError('Preencha nome e raça.');
                return;
            }
        } else if (!animalForm.brinco.trim() || !animalForm.raca.trim() || !animalForm.dataNascimento) {
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
            const payload = isPo
                ? {
                    brinco: animalForm.brinco.trim() || undefined,
                    nome: animalForm.nome.trim(),
                    raca: animalForm.raca.trim(),
                    sexo: animalForm.sexo,
                    dataNascimento: animalForm.dataNascimento || undefined,
                    pesoAtual: parsedPeso ?? undefined,
                    registro: animalForm.registro.trim() || undefined,
                    categoria: animalForm.categoria.trim() || undefined,
                    observacoes: animalForm.observacoes.trim() || undefined,
                    lotId: animalForm.lotId || undefined,
                    paddockId: animalForm.paddockId,
                    paddockStartAt: animalForm.paddockStartAt || undefined,
                }
                : {
                    brinco: animalForm.brinco.trim(),
                    raca: animalForm.raca.trim(),
                    sexo: animalForm.sexo,
                    dataNascimento: animalForm.dataNascimento,
                    pesoAtual: parsedPeso ?? undefined,
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
                notes: lotForm.notes.trim() || undefined,
            });
            closeLotForm();
            await loadData();
        } catch (error: any) {
            setLotFormError(error?.message || 'Não foi possível salvar o lote.');
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
            <div className="overflow-hidden rounded-2xl border border-[#e7e5e4] bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[#78716c]">
                        <thead className="bg-[#f5f5f4] text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">
                            <tr>
                                <th scope="col" className="px-4 py-3">
                                    <button type="button" onClick={() => handleSort('identificacao')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>ID</span>
                                        <span>{getSortIndicator('identificacao')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('raca')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>Raça</span>
                                        <span>{getSortIndicator('raca')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('sexo')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>Sexo</span>
                                        <span>{getSortIndicator('sexo')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('idade')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>Idade</span>
                                        <span>{getSortIndicator('idade')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('pasto')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>Pasto</span>
                                        <span>{getSortIndicator('pasto')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('lote')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>Lote</span>
                                        <span>{getSortIndicator('lote')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('categoria')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>Categoria</span>
                                        <span>{getSortIndicator('categoria')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('pesoAtual')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>Peso Atual</span>
                                        <span>{getSortIndicator('pesoAtual')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    <button type="button" onClick={() => handleSort('gmd')} className="flex cursor-pointer select-none items-center gap-1 hover:bg-[#f5f5f4]">
                                        <span>GMD</span>
                                        <span>{getSortIndicator('gmd')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-4 py-2.5">Nutrição</th>
                                <th scope="col" className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={11} className="px-6 py-10 text-center text-sm text-[#78716c]">
                                        Carregando animais...
                                    </td>
                                </tr>
                            ) : sortedAnimals.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="px-6 py-10 text-center text-sm text-[#78716c]">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="space-y-1">
                                                <p className="text-base font-semibold text-[#1c1917]">
                                                    Nenhum animal encontrado
                                                </p>
                                                <p>Use os botões acima para adicionar animais.</p>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={openAnimalForm}
                                                    className="flex items-center rounded-xl bg-[#a8442a] px-4 py-2 font-bold text-white shadow-md transition-colors duration-200 hover:bg-[#933a22]"
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
                                        className="cursor-pointer border-b border-[#e7e5e4] bg-white transition-colors duration-150 hover:bg-white"
                                        onClick={() => {
                                            setSelectedAnimal(animal);
                                        }}
                                    >
                                        <th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-[#1c1917]">
                                            <div>{animal.identificacao}</div>
                                            {animal.registro && (
                                                <div className="text-xs text-[#78716c]">Registro: {animal.registro}</div>
                                            )}
                                        </th>
                                        <td className="px-4 py-3">{animal.raca}</td>
                                        <td className="px-4 py-3">{animal.sexo}</td>
                                        <td className="px-4 py-3">{calculateAge(animal.dataNascimento)}</td>
                                        <td className="px-4 py-3">{animal.currentPaddockName || '—'}</td>
                                        <td className="px-4 py-3">{lots.find((l) => l.id === animal.lotId)?.name || '—'}</td>
                                        <td className="px-4 py-3">{animal.categoria || '—'}</td>
                                        <td className="px-4 py-3">
                                            {animal.pesoAtual !== null && animal.pesoAtual !== undefined
                                                ? `${animal.pesoAtual} kg`
                                                : '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const g30 = animal.gmd30 ?? null;
                                                const gLast = animal.gmdLast ?? animal.gmd ?? null;
                                                const primary = g30 ?? gLast;
                                                const colorCls = primary === null
                                                    ? 'text-[#b0a090]'
                                                    : primary >= 0.8
                                                        ? 'text-[#16a34a]'
                                                        : primary >= 0.4
                                                            ? 'text-[#1c1917]'
                                                            : 'text-[#8c4d39]';
                                                return (
                                                    <div className="flex flex-col">
                                                        <span className={`font-semibold ${colorCls}`}>
                                                            {primary !== null ? `${formatNumber(primary)} kg` : '—'}
                                                        </span>
                                                        {/* Linha secundária: mostra gmdLast quando gmd30 é o primário */}
                                                        {g30 !== null && gLast !== null && Math.abs(g30 - gLast) > 0.001 && (
                                                            <span className="text-[10px] text-[#78716c]" title="Último intervalo">
                                                                {`${formatNumber(gLast)} últ.`}
                                                            </span>
                                                        )}
                                                        {g30 === null && gLast !== null && (
                                                            <span className="text-[10px] text-[#78716c]">*últ. intervalo</span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-3">
                                            {animal.nutritionPlan?.nome || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="rounded-full p-1 text-[#78716c] hover:bg-[#f5f5f4] hover:text-[#a8442a]"
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
                    <div className="flex flex-col gap-3 border-t border-[#e7e5e4] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-[#78716c]">
                            Página {currentPage} de {totalPages} — mostrando {paginatedAnimals.length} animais
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((page) => page - 1)}
                                disabled={currentPage === 1}
                                className="rounded-xl border border-[#e7e5e4] bg-white px-4 py-2 text-sm text-[#44403c] hover:bg-[#f5f5f4] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((page) => page + 1)}
                                disabled={currentPage === totalPages}
                                className="rounded-xl border border-[#e7e5e4] bg-white px-4 py-2 text-sm text-[#44403c] hover:bg-[#f5f5f4] disabled:cursor-not-allowed disabled:opacity-40"
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

                <div className="rounded-3xl border border-[#e7e5e4] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78716c]">Total de animais</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[#1c1917]">
                        {overviewStats.total}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">
                        {overviewStats.machos}M · {overviewStats.femeas}F
                    </p>
                </div>

                <div className="rounded-3xl border border-[#e7e5e4] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78716c]">Peso médio</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[#1c1917]">
                        {overviewStats.avgWeight !== null
                            ? `${overviewStats.avgWeight.toFixed(1)}`
                            : '—'}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">kg por animal</p>
                </div>

                <div className="rounded-3xl border border-[#e7e5e4] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78716c]">Arroba média</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[#1c1917]">
                        {overviewStats.avgArroba !== null
                            ? `${overviewStats.avgArroba.toFixed(1)}`
                            : '—'}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">@ por animal</p>
                </div>

            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <div className="rounded-3xl border border-[#e7e5e4] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78716c]">GMD médio</p>
                    <p className="mt-2 font-brand text-4xl font-black text-[#1c1917]">
                        {overviewStats.avgGmd !== null
                            ? `${overviewStats.avgGmd.toFixed(3)}`
                            : '—'}
                    </p>
                    <p className="mt-1 text-xs text-[#a8a29e]">
                        {overviewStats.avgGmd !== null ? 'kg/dia · últimos 30 dias' : 'Aguardando pesagens'}
                    </p>
                </div>

                {overviewStats.semPesagem > 0 && (
                    <div className="rounded-3xl border border-[#f0d5ca] bg-[#faeee8] p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a2a14]">Sem pesagem</p>
                        <p className="mt-2 font-brand text-4xl font-black text-[#a8442a]">
                            {overviewStats.semPesagem}
                        </p>
                        <p className="mt-1 text-xs text-[#7a2a14]/70">animais sem registro de peso</p>
                    </div>
                )}

            </div>

            {(overviewStats.porCategoria.length > 0 || overviewStats.porRaca.length > 0) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                    {overviewStats.porCategoria.length > 0 && (
                        <div className="overflow-hidden rounded-3xl border border-[#e7e5e4] bg-white shadow-sm">
                            <div className="px-5 pt-5 pb-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78716c]">Por categoria</p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#e7e5e4] bg-[#f5f5f4]">
                                        <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">Categoria</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">Qtd</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">Peso médio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overviewStats.porCategoria.map(({ categoria, count, avgPeso }) => (
                                        <tr key={categoria} className="border-b border-[#e7e5e4] last:border-0">
                                            <td className="px-5 py-3 font-medium text-[#1c1917]">{categoria}</td>
                                            <td className="px-5 py-3 text-right text-[#78716c]">{count}</td>
                                            <td className="px-5 py-3 text-right text-[#78716c]">
                                                {avgPeso !== null ? `${avgPeso.toFixed(0)} kg` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {overviewStats.porRaca.length > 0 && (
                        <div className="overflow-hidden rounded-3xl border border-[#e7e5e4] bg-white shadow-sm">
                            <div className="px-5 pt-5 pb-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#78716c]">Por raça</p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#e7e5e4] bg-[#f5f5f4]">
                                        <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">Raça</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">Qtd</th>
                                        <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">Peso médio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overviewStats.porRaca.map(({ raca, count, avgPeso }) => (
                                        <tr key={raca} className="border-b border-[#e7e5e4] last:border-0">
                                            <td className="px-5 py-3 font-medium text-[#1c1917]">{raca}</td>
                                            <td className="px-5 py-3 text-right text-[#78716c]">{count}</td>
                                            <td className="px-5 py-3 text-right text-[#78716c]">
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
            <div className="overflow-hidden rounded-2xl border border-[#e7e5e4] bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[#78716c]">
                        <thead className="bg-[#f5f5f4] text-[10px] font-bold uppercase tracking-[0.12em] text-[#78716c]">
                            <tr>
                                <th scope="col" className="px-4 py-2.5">Lote</th>
                                <th scope="col" className="px-4 py-2.5">Observações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={2} className="px-6 py-10 text-center text-sm text-[#78716c]">
                                        Carregando lotes...
                                    </td>
                                </tr>
                            ) : lots.length === 0 ? (
                                <tr>
                                    <td colSpan={2} className="px-6 py-10 text-center text-sm text-[#78716c]">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="space-y-1">
                                                <p className="text-base font-semibold text-[#1c1917]">
                                                    Nenhum lote cadastrado
                                                </p>
                                                <p>Organize seu rebanho criando um lote.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={openLotForm}
                                                className="flex items-center bg-[#a8442a] hover:bg-[#933a22] text-white font-bold py-2 px-4 rounded-xl shadow-md transition-colors duration-200"
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
                                        className="cursor-pointer border-b border-[#e7e5e4] bg-white transition-colors duration-150 hover:bg-white"
                                        onClick={() => setSelectedLot(lot)}
                                    >
                                        <td className="px-6 py-4 font-medium text-[#1c1917]">{lot.name}</td>
                                        <td className="px-4 py-3">{lot.notes || '—'}</td>
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
            <div className="mb-4 rounded-3xl border border-[#e7e5e4] bg-white px-6 py-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1 xl:max-w-[420px]">
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#f0d5ca] bg-[#faeee8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a2a14]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#a8442a]" />
                            {farmName || 'Fazenda'}
                        </div>
                        <h2 className="font-brand m-0 max-w-[12ch] text-2xl font-extrabold leading-tight text-[#1c1917] sm:max-w-none xl:whitespace-nowrap">{title}</h2>
                    </div>
                    <div className="flex flex-col gap-3 xl:items-end">
                        {activeTab === 'animals' && (
                            <>
                                <div className="flex flex-wrap items-start gap-[10px] xl:justify-end">
                                    <button
                                        type="button"
                                        onClick={openAnimalForm}
                                        className="flex h-10 items-center rounded-[10px] bg-[#a8442a] px-[14px] font-bold text-white shadow-md transition-colors duration-200 hover:bg-[#933a22]"
                                    >
                                        <PlusIcon className="h-[18px] w-[18px]" />
                                        <span className="ml-2 hidden sm:block">Adicionar animal</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLoteModalOpen(true)}
                                        className="flex h-10 items-center rounded-[10px] border border-[#a8442a] bg-white px-[14px] text-sm font-semibold text-[#1c1917] transition-colors duration-200 hover:bg-white"
                                    >
                                        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <span className="ml-2 hidden sm:block">Entrada de lote</span>
                                    </button>
                                    {!isFreePlan && (
                                        <>
                                            <div className="flex flex-col items-center">
                                                <button
                                                    className="flex h-10 items-center rounded-[10px] bg-[#a8442a] px-[14px] font-bold text-white shadow-md transition-colors duration-200 hover:bg-[#933a22]"
                                                    type="button"
                                                    onClick={handleUploadClick}
                                                >
                                                    <UploadIcon className="h-[18px] w-[18px]" />
                                                    <span className="ml-2 hidden sm:block">Importar planilha</span>
                                                </button>
                                                <span className="mt-1 text-center text-xs font-medium text-[#78716c]">
                                                    Funciona com qualquer planilha sua
                                                </span>
                                            </div>
                                            <button
                                                className="flex h-10 items-center justify-center rounded-[10px] border border-[#e7e5e4] bg-white px-[10px] text-[13px] font-semibold text-[#78716c] transition-colors duration-200 hover:bg-[#f5f5f4]"
                                                type="button"
                                                onClick={handleDownloadTemplate}
                                            >
                                                <DownloadIcon className="h-4 w-4" />
                                                <span className="ml-1.5 hidden sm:block">Baixar modelo</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                                {!isFreePlan && (
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                )}
                            </>
                        )}
                        {activeTab === 'lots' && (
                            <button
                                type="button"
                                onClick={openLotForm}
                                className="flex h-10 items-center rounded-[10px] bg-[#a8442a] px-[14px] font-bold text-white shadow-md transition-colors duration-200 hover:bg-[#933a22]"
                            >
                                <LayersIcon className="h-[18px] w-[18px]" />
                                <span className="ml-2 hidden sm:block">Criar lote</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {uploadMessage && (
                <div className="mb-4 rounded-xl border border-[#c8dbc4] bg-[#edf4eb] px-4 py-3">
                    <p className="text-sm font-medium text-[#16a34a]">{uploadMessage}</p>
                </div>
            )}
            {uploadError && (
                <div className="mb-4">
                    <p className="text-sm text-[#8c4d39]">{uploadError}</p>
                </div>
            )}
            {loadError && (
                <div className="mb-4">
                    <p className="text-sm text-[#8c4d39]">{loadError}</p>
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
                                ? 'bg-[#a8442a] text-white'
                                : 'bg-[#f5f5f4] text-[#78716c] hover:bg-[#f5f5f4]'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'animals' && (
                <div className="mb-6 space-y-3 rounded-2xl border border-[#e7e5e4] bg-white p-4">
                    <div className="relative">
                        <svg
                            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716c]"
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
                            className="w-full rounded-xl border border-[#e7e5e4] bg-white py-2 pl-9 pr-3 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <select
                            value={filterSexo}
                            onChange={(event) => setFilterSexo(event.target.value)}
                            className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
                        >
                            <option value="">Todos os sexos</option>
                            <option value="Macho">Macho</option>
                            <option value="Fêmea">Fêmea</option>
                        </select>
                        <select
                            value={filterPaddock}
                            onChange={(event) => setFilterPaddock(event.target.value)}
                            className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
                        >
                            <option value="">Todos os pastos</option>
                            {paddocks.map((paddock) => (
                                <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                            ))}
                        </select>
                        <select
                            value={lotFilter}
                            onChange={(event) => setLotFilter(event.target.value)}
                            className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
                        >
                            <option value="">Todos os lotes</option>
                            {lots.map((lot) => (
                                <option key={lot.id} value={lot.id}>{lot.name}</option>
                            ))}
                        </select>
                        <select
                            value={filterNutrition}
                            onChange={(event) => setFilterNutrition(event.target.value)}
                            className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
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
                            className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
                        />
                        <input
                            type="number"
                            value={filterGmdMax}
                            onChange={(event) => setFilterGmdMax(event.target.value)}
                            placeholder="GMD máx"
                            className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
                        />
                        <input
                            type="text"
                            value={filterRaca}
                            onChange={(event) => setFilterRaca(event.target.value)}
                            placeholder="Filtrar por raça..."
                            className="rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#44403c] placeholder:text-[#b0a090] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                setSearchTerm('');
                                setLotFilter('');
                                setFilterRaca('');
                                setFilterSexo('');
                                setFilterPaddock('');
                                setFilterGmdMin('');
                                setFilterGmdMax('');
                                setFilterNutrition('');
                            }}
                            className="w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm text-[#78716c] transition-colors hover:bg-[#f5f5f4]"
                        >
                            Limpar filtros
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'lots' && renderLots()}
            {activeTab === 'animals' && renderTable()}
            {activeTab === 'weighings' && renderTable('Registrar pesagem')}
            {activeTab === 'settings' && (
                <div className="rounded-2xl border border-dashed border-[#e7e5e4] bg-white p-8 text-center text-[#78716c]">
                    Configurações específicas do rebanho em breve.
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
                        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex items-center justify-between border-b border-[#e7e5e4] p-5">
                            <h3 className="text-lg font-bold text-[#1c1917]">Adicionar animal</h3>
                            <button
                                type="button"
                                className="rounded-full p-2 text-[#78716c] hover:bg-[#f5f5f4]"
                                onClick={closeAnimalForm}
                                aria-label="Fechar modal"
                            >
                                ✕
                            </button>
                        </header>
                        <form onSubmit={handleCreateAnimal} className="space-y-4 p-6">
                            {isPo && (
                                <div>
                                    <label className="block text-sm font-medium text-[#44403c]">Nome</label>
                                    <input
                                        type="text"
                                        value={animalForm.nome}
                                        onChange={(event) => setAnimalForm((prev) => ({ ...prev, nome: event.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                        required
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Brinco</label>
                                <input
                                    type="text"
                                    value={animalForm.brinco}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, brinco: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                    required={!isPo}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Raça</label>
                                <input
                                    type="text"
                                    value={animalForm.raca}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, raca: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Sexo</label>
                                <select
                                    value={animalForm.sexo}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, sexo: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                >
                                    <option value="Macho">Macho</option>
                                    <option value="Fêmea">Fêmea</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Data de nascimento</label>
                                <input
                                    type="date"
                                    value={animalForm.dataNascimento}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, dataNascimento: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                    required={!isPo}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Peso atual (kg)</label>
                                <input
                                    type="number"
                                    value={animalForm.pesoAtual}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, pesoAtual: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Pasto</label>
                                <select
                                    value={animalForm.paddockId}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockId: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
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
                                <label className="block text-sm font-medium text-[#44403c]">Entrada no pasto</label>
                                <input
                                    type="date"
                                    value={animalForm.paddockStartAt}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockStartAt: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Lote</label>
                                <select
                                    value={animalForm.lotId}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, lotId: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                >
                                    <option value="">Sem lote</option>
                                    {lots.map((lot) => (
                                        <option key={lot.id} value={lot.id}>{lot.name}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Compra */}
                            <div className="rounded-2xl border border-[#e7e5e4] bg-[#f5f5f4] p-4">
                                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#78716c]">Compra (opcional)</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-[#44403c]">Valor pago (R$)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={animalForm.valorCompra}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, valorCompra: event.target.value }))}
                                            placeholder="0,00"
                                            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#44403c]">Data da compra</label>
                                        <input
                                            type="date"
                                            value={animalForm.dataCompra}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, dataCompra: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <p className="mt-2 text-[11px] text-[#78716c]">Se informado, o lançamento cai automaticamente no Financeiro.</p>
                            </div>

                            {isPo && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-[#44403c]">Registro</label>
                                        <input
                                            type="text"
                                            value={animalForm.registro}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, registro: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#44403c]">Categoria</label>
                                        <input
                                            type="text"
                                            value={animalForm.categoria}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, categoria: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#44403c]">Observações</label>
                                        <textarea
                                            value={animalForm.observacoes}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                            rows={3}
                                        />
                                    </div>
                                </>
                            )}
                            {animalFormError && (
                                <p className="text-sm text-[#8c4d39]">{animalFormError}</p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-xl border border-[#e7e5e4] px-4 py-2 text-sm font-semibold text-[#44403c] hover:bg-[#f5f5f4]"
                                    onClick={closeAnimalForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-[#a8442a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#933a22]"
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
                        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex items-center justify-between border-b border-[#e7e5e4] p-5">
                            <h3 className="text-lg font-bold text-[#1c1917]">Criar lote</h3>
                            <button
                                type="button"
                                className="rounded-full p-2 text-[#78716c] hover:bg-[#f5f5f4]"
                                onClick={closeLotForm}
                                aria-label="Fechar modal"
                            >
                                ✕
                            </button>
                        </header>
                        <form onSubmit={handleCreateLot} className="space-y-4 p-6">
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Nome</label>
                                <input
                                    type="text"
                                    value={lotForm.name}
                                    onChange={(event) => setLotForm((prev) => ({ ...prev, name: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#44403c]">Observações</label>
                                <textarea
                                    value={lotForm.notes}
                                    onChange={(event) => setLotForm((prev) => ({ ...prev, notes: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#e7e5e4] bg-white px-3 py-2 text-sm shadow-sm focus:border-[#a8442a] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/10"
                                    rows={3}
                                />
                            </div>
                            {lotFormError && (
                                <p className="text-sm text-[#8c4d39]">{lotFormError}</p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-xl border border-[#e7e5e4] px-4 py-2 text-sm font-semibold text-[#44403c] hover:bg-[#f5f5f4]"
                                    onClick={closeLotForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-[#a8442a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#933a22]"
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
                    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#e7e5e4] bg-white shadow-xl">

                        <div className="flex items-center justify-between border-b border-[#e7e5e4] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-[#1c1917]">
                                    Importar planilha
                                </h3>
                                <p className="text-sm text-[#78716c]">
                                    {importRows.length} animais encontrados ·{' '}
                                    {importHeaders.length} colunas detectadas ·{' '}
                                    {Object.values(importMapping).filter(Boolean).length} mapeadas automaticamente
                                </p>
                            </div>
                            {!isImporting && !importProgress && (
                                <button type="button"
                                    onClick={() => setImportModalOpen(false)}
                                    className="rounded-lg p-1.5 text-[#78716c] hover:bg-[#f5f5f4]">
                                    ✕
                                </button>
                            )}
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">

                            {!importProgress && (
                                <>
                                    <div className="rounded-xl border border-[#e7e5e4] bg-white p-4">
                                        <p className="mb-2 text-sm font-semibold text-[#44403c]">
                                            Unidade de peso
                                        </p>
                                        <div className="flex gap-3">
                                            {(['kg', 'arroba'] as const).map((u) => (
                                                <button key={u} type="button"
                                                    onClick={() => setImportWeightUnit(u)}
                                                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                                                        importWeightUnit === u
                                                            ? 'border-[#a8442a] bg-[#a8442a] text-white'
                                                            : 'border-[#e7e5e4] text-[#78716c] hover:bg-[#f5f5f4]'
                                                    }`}>
                                                    {u === 'kg' ? 'Quilos (kg)' : 'Arrobas (@) × 15'}
                                                </button>
                                            ))}
                                        </div>
                                        {importWeightUnit === 'arroba' && (
                                            <p className="mt-2 text-xs text-[#1c1917]">
                                                ⚠️ Detectamos valores que podem ser arrobas. Cada arroba será convertida para 15 kg.
                                            </p>
                                        )}
                                    </div>

                                    <div className="rounded-xl border border-[#e7e5e4] bg-white p-4">
                                        <p className="mb-1 text-sm font-semibold text-[#44403c]">
                                            Mapeamento de colunas
                                        </p>
                                        <p className="mb-3 text-xs text-[#78716c]">
                                            Confirme os campos detectados automaticamente e ajuste os que ficaram em branco.
                                        </p>

                                        {/* Aviso quando brinco não está mapeado */}
                                        {!Object.values(importMapping).includes('brinco') && (
                                            <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#f0d5ca] bg-[#faeee8] px-3 py-2.5">
                                                <span className="mt-0.5 flex-shrink-0 text-[#a8442a]">⚠️</span>
                                                <p className="text-xs text-[#7a2a14]">
                                                    <span className="font-semibold">Campo obrigatório não identificado:</span> selecione qual coluna da planilha contém o <span className="font-semibold">Brinco / ID</span> do animal para continuar.
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {importHeaders.map((h) => {
                                                const mapped = importMapping[h] || '';
                                                const plan = mapped ? FIELD_PLAN[mapped] : null;
                                                const isLocked = plan === 'paid1' || plan === 'paid2';
                                                const isUnmapped = !mapped;
                                                return (
                                                <div key={h} className={`flex items-center gap-3 rounded-lg px-2 py-1 transition-colors ${isUnmapped ? 'bg-[#faeee8]' : ''}`}>
                                                    <span className="w-44 truncate text-sm text-[#78716c]" title={h}>
                                                        "{h}"
                                                    </span>
                                                    <span className="text-[#78716c]">→</span>
                                                    <select
                                                        value={mapped}
                                                        onChange={(e) => setImportMapping(
                                                            (prev) => ({
                                                                ...prev,
                                                                [h]: e.target.value,
                                                            }),
                                                        )}
                                                        className={`flex-1 rounded-xl border px-3 py-1.5 text-sm text-[#44403c] focus:border-[#a8442a] focus:outline-none ${
                                                            isUnmapped
                                                                ? 'border-[#f0d5ca] bg-[#faeee8]'
                                                                : 'border-[#e7e5e4] bg-white'
                                                        }`}
                                                    >
                                                        <option value="">
                                                            — Selecionar campo —
                                                        </option>
                                                        <optgroup label="Plano Grátis">
                                                            <option value="brinco">{FIELD_LABELS.brinco}</option>
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
                                                        <optgroup label="── Plano Pago 1 — faça upgrade para importar ──">
                                                            <option value="" disabled>{FIELD_LABELS.tatuagem} 🔒</option>
                                                            <option value="" disabled>{FIELD_LABELS.mae} 🔒</option>
                                                            <option value="" disabled>{FIELD_LABELS.pai} 🔒</option>
                                                            <option value="" disabled>{FIELD_LABELS.sisbov} 🔒</option>
                                                        </optgroup>
                                                        <optgroup label="── Plano Pago 2 — faça upgrade para importar ──">
                                                            <option value="" disabled>{FIELD_LABELS.eid} 🔒</option>
                                                            <option value="" disabled>{FIELD_LABELS.ncf} 🔒</option>
                                                            <option value="" disabled>{FIELD_LABELS.rgd} 🔒</option>
                                                            <option value="" disabled>{FIELD_LABELS.rgn} 🔒</option>
                                                            <option value="" disabled>{FIELD_LABELS.abcz} 🔒</option>
                                                        </optgroup>
                                                    </select>
                                                    {mapped && !isLocked && (
                                                        <span className="text-[#16a34a] text-sm font-bold">✓</span>
                                                    )}
                                                    {mapped && isLocked && (
                                                        <span className="text-[#1c1917] text-sm">🔒</span>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-[#e7e5e4] bg-white p-3">
                                        <p className="mb-1 text-xs font-semibold text-[#44403c]">
                                            Prévia — primeiros 3 animais detectados:
                                        </p>
                                        <p className="text-xs text-[#78716c]">
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
                                        <div className="rounded-xl border border-[#e7e5e4] bg-white p-6 text-center">
                                            <p className="text-sm text-[#78716c]">Importando...</p>
                                            <p className="mt-1 text-3xl font-bold text-[#1c1917]">
                                                {importProgress.success} / {importProgress.total}
                                            </p>
                                            <p className="mt-1 text-xs text-[#78716c]">animais processados</p>
                                        </div>
                                    )}

                                    {/* Resultado final */}
                                    {!isImporting && (
                                        <>
                                            {/* Card de sucesso */}
                                            <div className="rounded-xl border border-[#c8ddc4] bg-[#edf4eb] p-4 flex items-center gap-3">
                                                <span className="text-2xl">✓</span>
                                                <div>
                                                    <p className="font-bold text-[#1c1917]">
                                                        {importProgress.success} {importProgress.success === 1 ? 'animal importado' : 'animais importados'} com sucesso
                                                    </p>
                                                    {importProgress.errors.length === 0 && (
                                                        <p className="text-sm text-[#16a34a]">Todos os registros foram processados sem erros.</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card de erros — só aparece se houver erros */}
                                            {importProgress.errors.length > 0 && (
                                                <div className="rounded-xl border border-[#d9b6a8] bg-[#fef2f2] p-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-lg">⚠️</span>
                                                        <div>
                                                            <p className="font-bold text-[#8c4d39]">
                                                                {importProgress.errors.length} {importProgress.errors.length === 1 ? 'linha não foi importada' : 'linhas não foram importadas'}
                                                            </p>
                                                            <p className="text-xs text-[#8c4d39]">
                                                                Corrija os itens abaixo na planilha e reimporte o arquivo.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                                        {importProgress.errors.map((err, i) => (
                                                            <div key={i} className="flex gap-2 rounded-lg bg-white/60 px-3 py-2 text-xs text-[#8c4d39]">
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

                        <div className="flex justify-end gap-3 border-t border-[#e7e5e4] px-6 py-4">
                            {!importProgress && !isImporting && (
                                <>
                                    <button type="button"
                                        onClick={() => setImportModalOpen(false)}
                                        className="rounded-xl border border-[#e7e5e4] px-4 py-2 text-sm text-[#44403c] hover:bg-[#f5f5f4]">
                                        Cancelar
                                    </button>
                                    <div className="flex flex-col items-end gap-1">
                                        {!Object.values(importMapping).includes('brinco') && (
                                            <p className="text-xs text-[#7a2a14]">Mapeie o Brinco/ID para continuar</p>
                                        )}
                                        <button type="button"
                                            onClick={handleImportConfirm}
                                            disabled={!Object.values(importMapping).includes('brinco')}
                                            className="rounded-xl bg-[#a8442a] px-6 py-2 text-sm font-semibold text-white hover:bg-[#933a22] disabled:cursor-not-allowed disabled:opacity-40">
                                            Importar {importRows.length} animais
                                        </button>
                                    </div>
                                </>
                            )}
                            {importProgress && !isImporting && (
                                <button type="button"
                                    onClick={() => setImportModalOpen(false)}
                                    className="rounded-xl bg-[#a8442a] px-6 py-2 text-sm font-semibold text-white hover:bg-[#933a22]">
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
        </div>
    );
};

export default HerdModule;
