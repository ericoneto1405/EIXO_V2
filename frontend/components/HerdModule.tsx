import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import HerdAnimalModal from './AnimalDetailModal';
import LotDetailModal from './LotDetailModal';
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
    mode?: HerdType;
    herdType?: HerdType;
}

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
    if (years > 0) {
        return `${years}a ${months}m`;
    }
    return `${months}m`;
};

const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) {
        return '—';
    }
    return value.toFixed(2);
};

const PAGE_SIZE = 30;
type SortDirection = 'asc' | 'desc';
type SortColumn = 'identificacao' | 'raca' | 'sexo' | 'idade' | 'pasto' | 'pesoAtual' | 'gmd';

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

const FIELD_KEYWORDS: Record<string, string[]> = {
    brinco: [
        'brinco', 'id', 'identificacao', 'identificação', 'numero', 'número',
        'num', 'tag', 'animal', 'cod', 'código', 'codigo', 'ear tag', 'eartag',
        'nº', 'n°', 'rfid', 'chip', 'matricula', 'matrícula', 'nro',
        'identificador', 'brinco_animal', 'bringo', 'brinku', 'brco', 'bco',
        'b.co', 'brn', 'idnt', 'identif', 'indentificacao', 'indentificação',
        'idenficacao', 'nº animal', 'n animal', 'num.animal',
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
        'm f', 'sxo', 'sxu', 'sexo_', 'sx', 'mac/fem',
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
        'pesagem atual',
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
    ],
    pasto: [
        'pasto', 'divisao', 'divisão', 'paddock', 'retiro', 'curral',
        'invernada', 'potreiro', 'setor', 'pastagem', 'area', 'área', 'campo',
        'talhao', 'talhão', 'psto', 'pst', 'ps.', 'past', 'divs', 'div.',
        'invernda', 'retro', 'retr',
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

function detectField(header: string): string | null {
    const normalized = header
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
        if (keywords.some((k) =>
            normalized === k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            || normalized.includes(
                k.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
            )
        )) return field;
    }
    return null;
}

const HerdModule: React.FC<HerdModuleProps> = ({ farmId, mode, herdType }) => {
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
            { key: 'lots', label: 'Lotes/Grupos' },
            { key: 'weighings', label: 'Pesagens' },
            { key: 'settings', label: 'Configurações' },
        ];
    }, []);

    const title = isPo ? 'Rebanho P.O.' : 'Rebanho Comercial';
    const subtitle = isPo
        ? 'Gerencie seu plantel P.O. com o mesmo fluxo do rebanho comercial.'
        : 'Gerencie seu rebanho comercial de corte.';

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

        const gmds = animals
            .map((a) => a.gmd)
            .filter((g): g is number => typeof g === 'number');
        const avgGmd = gmds.length
            ? gmds.reduce((s, v) => s + v, 0) / gmds.length
            : null;

        const machos = animals.filter((a) =>
            a.sexo?.toLowerCase() === 'macho').length;

        const femeas = animals.filter((a) =>
            a.sexo?.toLowerCase() === 'fêmea' ||
            a.sexo?.toLowerCase() === 'femea').length;

        const semPesagem = animals.filter((a) => a.gmd === null).length;

        return { total, avgWeight, avgGmd, machos, femeas, semPesagem };
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
        const aoa = [headers, sampleRow];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isPo ? 'Rebanho P.O.' : 'Rebanho Comercial');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = isPo ? 'modelo_rebanho_po.xlsx' : 'modelo_rebanho_comercial.xlsx';
        link.click();
        URL.revokeObjectURL(url);
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
        if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') &&
            !ext.endsWith('.csv')) {
            setUploadError('Envie um arquivo .xlsx, .xls ou .csv.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(
                    ws, { raw: false, defval: '' },
                );
                if (!rows.length) {
                    setUploadError('Planilha vazia ou sem dados reconhecíveis.');
                    return;
                }
                const headers = Object.keys(rows[0]);

                // Detectar mapeamento automático
                const autoMapping: Record<string, string> = {};
                for (const h of headers) {
                    const detected = detectField(h);
                    if (detected && !Object.values(autoMapping).includes(detected)) {
                        autoMapping[h] = detected;
                    }
                }

                // Detectar se peso está em arrobas
                const pesoCol = Object.entries(autoMapping)
                    .find(([, v]) => v === 'pesoAtual')?.[0];
                let suggestArroba = false;
                if (pesoCol) {
                    const vals = rows
                        .slice(0, 20)
                        .map((r) => parseFloat(r[pesoCol]))
                        .filter((v) => !isNaN(v));
                    const allInArrobaRange = vals.length > 0 &&
                        vals.every((v) => v >= 8 && v <= 65);
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
        };
        reader.readAsArrayBuffer(file);
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
            <div className="overflow-hidden rounded-2xl border border-[#d7cab3] bg-[#fffaf1] shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[#6d6558]">
                        <thead className="bg-[#f1e7d8] text-[10px] font-bold uppercase tracking-[0.12em] text-[#74644e]">
                            <tr>
                                <th scope="col" className="px-6 py-3">
                                    <button type="button" onClick={() => handleSort('identificacao')} className="flex cursor-pointer select-none items-center gap-2 hover:bg-[#e8ddd0]">
                                        <span>Identificação</span>
                                        <span>{getSortIndicator('identificacao')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3">
                                    <button type="button" onClick={() => handleSort('raca')} className="flex cursor-pointer select-none items-center gap-2 hover:bg-[#e8ddd0]">
                                        <span>Raça</span>
                                        <span>{getSortIndicator('raca')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3">
                                    <button type="button" onClick={() => handleSort('sexo')} className="flex cursor-pointer select-none items-center gap-2 hover:bg-[#e8ddd0]">
                                        <span>Sexo</span>
                                        <span>{getSortIndicator('sexo')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3">
                                    <button type="button" onClick={() => handleSort('idade')} className="flex cursor-pointer select-none items-center gap-2 hover:bg-[#e8ddd0]">
                                        <span>Idade</span>
                                        <span>{getSortIndicator('idade')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3">
                                    <button type="button" onClick={() => handleSort('pasto')} className="flex cursor-pointer select-none items-center gap-2 hover:bg-[#e8ddd0]">
                                        <span>Pasto</span>
                                        <span>{getSortIndicator('pasto')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3">
                                    <button type="button" onClick={() => handleSort('pesoAtual')} className="flex cursor-pointer select-none items-center gap-2 hover:bg-[#e8ddd0]">
                                        <span>Peso Atual</span>
                                        <span>{getSortIndicator('pesoAtual')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3">
                                    <button type="button" onClick={() => handleSort('gmd')} className="flex cursor-pointer select-none items-center gap-2 hover:bg-[#e8ddd0]">
                                        <span>GMD</span>
                                        <span>{getSortIndicator('gmd')}</span>
                                    </button>
                                </th>
                                <th scope="col" className="px-6 py-3">Nutrição</th>
                                <th scope="col" className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-10 text-center text-sm text-[#6d6558]">
                                        Carregando animais...
                                    </td>
                                </tr>
                            ) : sortedAnimals.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-10 text-center text-sm text-[#6d6558]">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="space-y-1">
                                                <p className="text-base font-semibold text-[#2f3a2d]">
                                                    Nenhum animal encontrado
                                                </p>
                                                <p>Use os botões acima para adicionar animais.</p>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={openAnimalForm}
                                                    className="flex items-center rounded-lg bg-primary px-4 py-2 font-bold text-white shadow-md transition-colors duration-200 hover:bg-primary-dark"
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
                                        className="cursor-pointer border-b border-[#e8ddd0] bg-[#fffaf1] transition-colors duration-150 hover:bg-[#f5ede2]"
                                        onClick={() => {
                                            setSelectedAnimal(animal);
                                        }}
                                    >
                                        <th scope="row" className="whitespace-nowrap px-6 py-4 font-bold text-[#2f3a2d]">
                                            <div>{animal.identificacao}</div>
                                            {animal.registro && (
                                                <div className="text-xs text-[#6d6558]">Registro: {animal.registro}</div>
                                            )}
                                        </th>
                                        <td className="px-6 py-4">{animal.raca}</td>
                                        <td className="px-6 py-4">{animal.sexo}</td>
                                        <td className="px-6 py-4">{calculateAge(animal.dataNascimento)}</td>
                                        <td className="px-6 py-4">{animal.currentPaddockName || '—'}</td>
                                        <td className="px-6 py-4">
                                            {animal.pesoAtual !== null && animal.pesoAtual !== undefined
                                                ? `${animal.pesoAtual} kg`
                                                : '—'}
                                        </td>
                                        <td className={`px-6 py-4 font-semibold ${
                                            animal.gmd !== null && animal.gmd !== undefined
                                                ? animal.gmd >= 0.8
                                                    ? 'text-[#4a6741]'
                                                    : animal.gmd >= 0.4
                                                        ? 'text-[#9d7d4d]'
                                                        : 'text-[#8c4d39]'
                                                : 'text-[#b0a090]'
                                        }`}>
                                            {animal.gmd !== null && animal.gmd !== undefined
                                                ? `${formatNumber(animal.gmd)} kg`
                                                : '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {animal.nutritionPlan?.nome || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="rounded-full p-1 text-[#6d6558] hover:bg-[#e8ddd0] hover:text-[#2f3a2d]"
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
                    <div className="flex flex-col gap-3 border-t border-[#e8ddd0] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-[#6d6558]">
                            Página {currentPage} de {totalPages} — mostrando {paginatedAnimals.length} animais
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((page) => page - 1)}
                                disabled={currentPage === 1}
                                className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-4 py-2 text-sm text-[#4a3f35] hover:bg-[#f1e7d8] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((page) => page + 1)}
                                disabled={currentPage === totalPages}
                                className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-4 py-2 text-sm text-[#4a3f35] hover:bg-[#f1e7d8] disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">

            <div className="rounded-3xl border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9d8b77]">Total de animais</p>
                <p className="mt-2 font-brand text-4xl font-black text-[#2f3a2d]">
                    {overviewStats.total}
                </p>
            </div>

            <div className="rounded-3xl border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9d8b77]">Peso médio</p>
                <p className="mt-2 font-brand text-4xl font-black text-[#2f3a2d]">
                    {overviewStats.avgWeight
                        ? `${overviewStats.avgWeight.toFixed(1)}`
                        : '—'}
                </p>
                {overviewStats.avgWeight && (
                    <p className="text-xs text-[#9d8b77]">kg por animal</p>
                )}
            </div>

            <div className="rounded-3xl border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9d8b77]">GMD médio</p>
                <p className="mt-2 font-brand text-4xl font-black text-[#2f3a2d]">
                    {overviewStats.avgGmd !== null
                        ? `${overviewStats.avgGmd.toFixed(3)}`
                        : '—'}
                </p>
                {overviewStats.avgGmd !== null && (
                    <p className="text-xs text-[#9d8b77]">kg/dia</p>
                )}
            </div>

            <div className="rounded-3xl border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9d8b77]">Machos</p>
                <p className="mt-2 font-brand text-4xl font-black text-[#2f3a2d]">
                    {overviewStats.machos}
                </p>
            </div>

            <div className="rounded-3xl border border-[#d7cab3] bg-[#fffaf1] p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9d8b77]">Fêmeas</p>
                <p className="mt-2 font-brand text-4xl font-black text-[#2f3a2d]">
                    {overviewStats.femeas}
                </p>
            </div>

            <div className="rounded-3xl border border-amber-300/40 bg-amber-50/60 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Sem pesagem</p>
                <p className="mt-2 font-brand text-4xl font-black text-amber-700">
                    {overviewStats.semPesagem}
                </p>
                <p className="mt-1 text-xs text-amber-600/70">
                    animais sem registro de peso
                </p>
            </div>

        </div>
    );

    const renderLots = () => {
        return (
            <div className="overflow-hidden rounded-2xl border border-[#d7cab3] bg-[#fffaf1] shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-[#6d6558]">
                        <thead className="bg-[#f1e7d8] text-[10px] font-bold uppercase tracking-[0.12em] text-[#74644e]">
                            <tr>
                                <th scope="col" className="px-6 py-3">Lote</th>
                                <th scope="col" className="px-6 py-3">Observações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={2} className="px-6 py-10 text-center text-sm text-[#6d6558]">
                                        Carregando lotes...
                                    </td>
                                </tr>
                            ) : lots.length === 0 ? (
                                <tr>
                                    <td colSpan={2} className="px-6 py-10 text-center text-sm text-[#6d6558]">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="space-y-1">
                                                <p className="text-base font-semibold text-[#2f3a2d]">
                                                    Nenhum lote cadastrado
                                                </p>
                                                <p>Organize seu rebanho criando um lote.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={openLotForm}
                                                className="flex items-center bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors duration-200"
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
                                        className="cursor-pointer border-b border-[#e8ddd0] bg-[#fffaf1] transition-colors duration-150 hover:bg-[#f5ede2]"
                                        onClick={() => setSelectedLot(lot)}
                                    >
                                        <td className="px-6 py-4 font-medium text-[#2f3a2d]">{lot.name}</td>
                                        <td className="px-6 py-4">{lot.notes || '—'}</td>
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
            <div className="mb-4 rounded-3xl border border-[#d7cab3] bg-[#fffaf1] px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-100/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {isPo ? 'Plantel P.O.' : 'Rebanho Comercial'}
                        </div>
                        <h2 className="font-brand m-0 text-2xl font-extrabold leading-tight text-[#2f3a2d]">{title}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-[#6d6558]">
                            {subtitle}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-[10px]">
                        {activeTab === 'animals' && (
                            <>
                                <button
                                    type="button"
                                    onClick={openAnimalForm}
                                    className="flex h-10 items-center rounded-[10px] bg-primary px-[14px] font-bold text-white shadow-md transition-colors duration-200 hover:bg-primary-dark"
                                >
                                    <PlusIcon className="h-[18px] w-[18px]" />
                                    <span className="ml-2 hidden sm:block">Adicionar animal</span>
                                </button>
                                <button
                                    className="flex h-10 items-center rounded-[10px] border border-[#d7cab3] bg-[#fffaf1] px-[14px] text-sm font-semibold text-[#6d6558] transition-colors duration-200 hover:bg-[#f1e7d8]"
                                    type="button"
                                    onClick={handleDownloadTemplate}
                                >
                                    <DownloadIcon className="h-[18px] w-[18px]" />
                                    <span className="ml-2 hidden sm:block">Baixar modelo de exemplo</span>
                                </button>
                                <div className="flex flex-col items-end">
                                    <button
                                        className="flex h-10 items-center rounded-[10px] bg-[#9d7d4d] px-[14px] font-bold text-white shadow-md transition-colors duration-200 hover:bg-[#8f7144]"
                                        type="button"
                                        onClick={handleUploadClick}
                                    >
                                        <UploadIcon className="h-[18px] w-[18px]" />
                                        <span className="ml-2 hidden sm:block">Importar planilha</span>
                                    </button>
                                    <span className="mt-0.5 hidden text-[10px] text-[#9d8b77] sm:block">
                                        Funciona com qualquer planilha sua
                                    </span>
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
                                className="flex h-10 items-center rounded-[10px] bg-[#9d7d4d] px-[14px] font-bold text-white shadow-md transition-colors duration-200 hover:bg-[#8f7144]"
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
                    <p className="text-sm font-medium text-[#4a6741]">{uploadMessage}</p>
                </div>
            )}
            {uploadError && (
                <div className="mb-4">
                    <p className="text-sm text-red-600">{uploadError}</p>
                </div>
            )}
            {loadError && (
                <div className="mb-4">
                    <p className="text-sm text-red-600">{loadError}</p>
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
                                ? 'bg-[#9d7d4d] text-white'
                                : 'bg-[#f1e7d8] text-[#6d6558] hover:bg-[#e8ddd0]'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'animals' && (
                <div className="mb-6 space-y-3 rounded-2xl border border-[#d7cab3] bg-[#fffaf1] p-4">
                    <div className="relative">
                        <svg
                            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9d8b77]"
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
                            className="w-full rounded-xl border border-[#d7cab3] bg-white py-2 pl-9 pr-3 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <select
                            value={filterSexo}
                            onChange={(event) => setFilterSexo(event.target.value)}
                            className="rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
                        >
                            <option value="">Todos os sexos</option>
                            <option value="Macho">Macho</option>
                            <option value="Fêmea">Fêmea</option>
                        </select>
                        <select
                            value={filterPaddock}
                            onChange={(event) => setFilterPaddock(event.target.value)}
                            className="rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
                        >
                            <option value="">Todos os pastos</option>
                            {paddocks.map((paddock) => (
                                <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                            ))}
                        </select>
                        <select
                            value={lotFilter}
                            onChange={(event) => setLotFilter(event.target.value)}
                            className="rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
                        >
                            <option value="">Todos os lotes</option>
                            {lots.map((lot) => (
                                <option key={lot.id} value={lot.id}>{lot.name}</option>
                            ))}
                        </select>
                        <select
                            value={filterNutrition}
                            onChange={(event) => setFilterNutrition(event.target.value)}
                            className="rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
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
                            className="rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
                        />
                        <input
                            type="number"
                            value={filterGmdMax}
                            onChange={(event) => setFilterGmdMax(event.target.value)}
                            placeholder="GMD máx"
                            className="rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
                        />
                        <input
                            type="text"
                            value={filterRaca}
                            onChange={(event) => setFilterRaca(event.target.value)}
                            placeholder="Filtrar por raça..."
                            className="rounded-xl border border-[#d7cab3] bg-white px-3 py-2 text-sm text-[#4a3f35] placeholder:text-[#b0a090] focus:border-[#9d7d4d] focus:outline-none focus:ring-1 focus:ring-[#9d7d4d]"
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
                            className="w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm text-[#6d6558] transition-colors hover:bg-[#f1e7d8]"
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
                <div className="rounded-2xl border border-dashed border-[#d7cab3] bg-[#fffaf1] p-8 text-center text-[#6d6558]">
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
                        className="w-full max-w-lg rounded-2xl bg-[#f5ede2] shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex items-center justify-between border-b border-[#e3d4c0] p-5">
                            <h3 className="text-lg font-bold text-[#2f3a2d]">Adicionar animal</h3>
                            <button
                                type="button"
                                className="rounded-full p-2 text-[#6d6558] hover:bg-[#e8ddd0]"
                                onClick={closeAnimalForm}
                                aria-label="Fechar modal"
                            >
                                ✕
                            </button>
                        </header>
                        <form onSubmit={handleCreateAnimal} className="space-y-4 p-6">
                            {isPo && (
                                <div>
                                    <label className="block text-sm font-medium text-[#4a3f35]">Nome</label>
                                    <input
                                        type="text"
                                        value={animalForm.nome}
                                        onChange={(event) => setAnimalForm((prev) => ({ ...prev, nome: event.target.value }))}
                                        className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                        required
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Brinco</label>
                                <input
                                    type="text"
                                    value={animalForm.brinco}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, brinco: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    required={!isPo}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Raça</label>
                                <input
                                    type="text"
                                    value={animalForm.raca}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, raca: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Sexo</label>
                                <select
                                    value={animalForm.sexo}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, sexo: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="Macho">Macho</option>
                                    <option value="Fêmea">Fêmea</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Data de nascimento</label>
                                <input
                                    type="date"
                                    value={animalForm.dataNascimento}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, dataNascimento: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    required={!isPo}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Peso atual (kg)</label>
                                <input
                                    type="number"
                                    value={animalForm.pesoAtual}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, pesoAtual: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Pasto</label>
                                <select
                                    value={animalForm.paddockId}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockId: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
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
                                <label className="block text-sm font-medium text-[#4a3f35]">Entrada no pasto</label>
                                <input
                                    type="date"
                                    value={animalForm.paddockStartAt}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, paddockStartAt: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Lote</label>
                                <select
                                    value={animalForm.lotId}
                                    onChange={(event) => setAnimalForm((prev) => ({ ...prev, lotId: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="">Sem lote</option>
                                    {lots.map((lot) => (
                                        <option key={lot.id} value={lot.id}>{lot.name}</option>
                                    ))}
                                </select>
                            </div>
                            {isPo && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-[#4a3f35]">Registro</label>
                                        <input
                                            type="text"
                                            value={animalForm.registro}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, registro: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#4a3f35]">Categoria</label>
                                        <input
                                            type="text"
                                            value={animalForm.categoria}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, categoria: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#4a3f35]">Observações</label>
                                        <textarea
                                            value={animalForm.observacoes}
                                            onChange={(event) => setAnimalForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                                            className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                            rows={3}
                                        />
                                    </div>
                                </>
                            )}
                            {animalFormError && (
                                <p className="text-sm text-red-600">{animalFormError}</p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-xl border border-[#d7cab3] px-4 py-2 text-sm font-semibold text-[#4a3f35] hover:bg-[#e8ddd0]"
                                    onClick={closeAnimalForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
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
                        className="w-full max-w-lg rounded-2xl bg-[#f5ede2] shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="flex items-center justify-between border-b border-[#e3d4c0] p-5">
                            <h3 className="text-lg font-bold text-[#2f3a2d]">Criar lote</h3>
                            <button
                                type="button"
                                className="rounded-full p-2 text-[#6d6558] hover:bg-[#e8ddd0]"
                                onClick={closeLotForm}
                                aria-label="Fechar modal"
                            >
                                ✕
                            </button>
                        </header>
                        <form onSubmit={handleCreateLot} className="space-y-4 p-6">
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Nome</label>
                                <input
                                    type="text"
                                    value={lotForm.name}
                                    onChange={(event) => setLotForm((prev) => ({ ...prev, name: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#4a3f35]">Observações</label>
                                <textarea
                                    value={lotForm.notes}
                                    onChange={(event) => setLotForm((prev) => ({ ...prev, notes: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#d7cab3] bg-[#fffaf1] px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    rows={3}
                                />
                            </div>
                            {lotFormError && (
                                <p className="text-sm text-red-600">{lotFormError}</p>
                            )}
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-xl border border-[#d7cab3] px-4 py-2 text-sm font-semibold text-[#4a3f35] hover:bg-[#e8ddd0]"
                                    onClick={closeLotForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
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
                    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#d7cab3] bg-[#f5ede2] shadow-xl">

                        <div className="flex items-center justify-between border-b border-[#e3d4c0] px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-[#2f3a2d]">
                                    Importar planilha
                                </h3>
                                <p className="text-sm text-[#6d6558]">
                                    {importRows.length} animais encontrados ·{' '}
                                    {importHeaders.length} colunas detectadas ·{' '}
                                    {Object.values(importMapping).filter(Boolean).length} mapeadas automaticamente
                                </p>
                            </div>
                            {!isImporting && !importProgress && (
                                <button type="button"
                                    onClick={() => setImportModalOpen(false)}
                                    className="rounded-lg p-1.5 text-[#6d6558] hover:bg-[#e8ddd0]">
                                    ✕
                                </button>
                            )}
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">

                            {!importProgress && (
                                <>
                                    <div className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] p-4">
                                        <p className="mb-2 text-sm font-semibold text-[#4a3f35]">
                                            Unidade de peso
                                        </p>
                                        <div className="flex gap-3">
                                            {(['kg', 'arroba'] as const).map((u) => (
                                                <button key={u} type="button"
                                                    onClick={() => setImportWeightUnit(u)}
                                                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                                                        importWeightUnit === u
                                                            ? 'border-[#9d7d4d] bg-[#9d7d4d] text-white'
                                                            : 'border-[#d7cab3] text-[#6d6558] hover:bg-[#f1e7d8]'
                                                    }`}>
                                                    {u === 'kg' ? 'Quilos (kg)' : 'Arrobas (@) × 15'}
                                                </button>
                                            ))}
                                        </div>
                                        {importWeightUnit === 'arroba' && (
                                            <p className="mt-2 text-xs text-[#9d7d4d]">
                                                ⚠️ Detectamos valores que podem ser arrobas. Cada arroba será convertida para 15 kg.
                                            </p>
                                        )}
                                    </div>

                                    <div className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] p-4">
                                        <p className="mb-1 text-sm font-semibold text-[#4a3f35]">
                                            Mapeamento de colunas
                                        </p>
                                        <p className="mb-3 text-xs text-[#9d8b77]">
                                            Campos com 🔒 exigem plano superior. Confirme ou ajuste o mapeamento.
                                        </p>
                                        <div className="space-y-2">
                                            {importHeaders.map((h) => {
                                                const mapped = importMapping[h] || '';
                                                const plan = mapped ? FIELD_PLAN[mapped] : null;
                                                const isLocked = plan === 'paid1' || plan === 'paid2';
                                                return (
                                                <div key={h} className="flex items-center gap-3">
                                                    <span className="w-44 truncate text-sm text-[#6d6558]" title={h}>
                                                        "{h}"
                                                    </span>
                                                    <span className="text-[#9d8b77]">→</span>
                                                    <select
                                                        value={mapped}
                                                        onChange={(e) => setImportMapping(
                                                            (prev) => ({
                                                                ...prev,
                                                                [h]: e.target.value,
                                                            }),
                                                        )}
                                                        className="flex-1 rounded-xl border border-[#d7cab3] bg-white px-3 py-1.5 text-sm text-[#4a3f35] focus:border-[#9d7d4d] focus:outline-none"
                                                    >
                                                        <option value="">
                                                            — Ignorar coluna —
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
                                                        <optgroup label="Plano Pago 1 🔒">
                                                            <option value="tatuagem">{FIELD_LABELS.tatuagem}</option>
                                                            <option value="mae">{FIELD_LABELS.mae}</option>
                                                            <option value="pai">{FIELD_LABELS.pai}</option>
                                                            <option value="sisbov">{FIELD_LABELS.sisbov}</option>
                                                        </optgroup>
                                                        <optgroup label="Plano Pago 2 🔒">
                                                            <option value="eid">{FIELD_LABELS.eid}</option>
                                                            <option value="ncf">{FIELD_LABELS.ncf}</option>
                                                            <option value="rgd">{FIELD_LABELS.rgd}</option>
                                                            <option value="rgn">{FIELD_LABELS.rgn}</option>
                                                            <option value="abcz">{FIELD_LABELS.abcz}</option>
                                                        </optgroup>
                                                    </select>
                                                    {mapped && !isLocked && (
                                                        <span className="text-[#4a6741] text-sm font-bold">✓</span>
                                                    )}
                                                    {mapped && isLocked && (
                                                        <span className="text-[#9d7d4d] text-sm">🔒</span>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] p-3">
                                        <p className="mb-1 text-xs font-semibold text-[#4a3f35]">
                                            Prévia — primeiros 3 animais detectados:
                                        </p>
                                        <p className="text-xs text-[#6d6558]">
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
                                    <div className="rounded-xl border border-[#d7cab3] bg-[#fffaf1] p-6 text-center">
                                        {isImporting ? (
                                            <>
                                                <p className="text-sm text-[#6d6558]">
                                                    Importando...
                                                </p>
                                                <p className="mt-1 text-3xl font-bold text-[#2f3a2d]">
                                                    {importProgress.success} / {importProgress.total}
                                                </p>
                                                <p className="mt-1 text-xs text-[#9d8b77]">animais processados</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-3xl font-bold text-[#2f3a2d]">
                                                    ✓ {importProgress.success} animais importados!
                                                </p>
                                                {importProgress.errors.length > 0 && (
                                                    <p className="mt-2 text-sm text-[#8c4d39]">
                                                        {importProgress.errors.length} linha(s) com problema
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    {importProgress.errors.length > 0 && (
                                        <div className="rounded-xl border border-[#e3d4c0] bg-white p-3 max-h-36 overflow-y-auto">
                                            <p className="mb-1 text-xs font-semibold text-[#8c4d39]">
                                                Erros encontrados:
                                            </p>
                                            {importProgress.errors.map((e, i) => (
                                                <p key={i} className="text-xs text-[#8c4d39]">{e}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 border-t border-[#e3d4c0] px-6 py-4">
                            {!importProgress && !isImporting && (
                                <>
                                    <button type="button"
                                        onClick={() => setImportModalOpen(false)}
                                        className="rounded-xl border border-[#d7cab3] px-4 py-2 text-sm text-[#4a3f35] hover:bg-[#e8ddd0]">
                                        Cancelar
                                    </button>
                                    <button type="button"
                                        onClick={handleImportConfirm}
                                        disabled={!Object.values(importMapping)
                                            .includes('brinco')}
                                        className="rounded-xl bg-[#9d7d4d] px-6 py-2 text-sm font-semibold text-white hover:bg-[#8f7144] disabled:cursor-not-allowed disabled:opacity-40">
                                        Importar {importRows.length} animais
                                    </button>
                                </>
                            )}
                            {importProgress && !isImporting && (
                                <button type="button"
                                    onClick={() => setImportModalOpen(false)}
                                    className="rounded-xl bg-[#9d7d4d] px-6 py-2 text-sm font-semibold text-white hover:bg-[#8f7144]">
                                    Concluir
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
                    mode={resolvedMode}
                />
            )}
        </div>
    );
};

export default HerdModule;
