export enum AnimalSexo {
    MACHO = 'Macho',
    FEMEA = 'Fêmea',
}

export interface Animal {
    id: string;
    brinco: string;
    raca: string;
    sexo: AnimalSexo;
    dataNascimento: string;
    pesoAtual: number;
    gmd: number | null; // GMD atual (últimas duas pesagens válidas)
    gmdLast?: number | null;
    gmd30?: number | null;
    farmId?: string;
    lotId?: string | null;
    currentPaddockId?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface AtividadeRecente {
    id: string;
    tipo: 'Pesagem' | 'Vacinação' | 'Manejo' | 'Venda';
    descricao: string;
    data: string;
}

export interface Tarefa {
    id: string;
    titulo: string;
    responsavel: string;
    prazo: string;
    concluida: boolean;
}

export interface FluxoCaixaData {
    mes: string;
    receita: number;
    despesa: number;
}

export interface ComposicaoRebanhoData {
    name: string;
    value: number;
}

export interface Alert {
    id: string;
    message: string;
    type: 'info' | 'warning' | 'critical';
}

export interface WeighingHistory {
    id: string;
    data: string;
    peso: number;
    gmd: number;
}

export interface LotUI {
    id: string;
    name: string;
    notes?: string | null;
    farmId: string;
}

export interface AnimalUI {
    id: string;
    farmId: string;
    brinco?: string | null;
    nome?: string | null;
    identificacao: string;
    raca: string;
    sexo: string;
    dataNascimento?: string | null;
    pesoAtual: number | null;
    gmd: number | null;
    gmdLast?: number | null;
    gmd30?: number | null;
    lotId?: string | null;
    registro?: string | null;
    categoria?: string | null;
    currentPaddockId?: string | null;
    currentPaddockName?: string | null;
    nutritionPlan?: {
        id: string;
        nome: string;
        fase?: string | null;
        metaGmd?: number | null;
    } | null;
}

export interface WeighingUI {
    id: string;
    data: string;
    peso: number;
    gmd: number;
}

export interface Lot {
    id: string;
    name: string;
    notes?: string | null;
    farmId: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface Paddock {
    id: string;
    name: string;
    areaHa?: number | null;
    divisionType?: string | null;
    capacity?: number | null;
    active?: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface PaddockMove {
    id: string;
    paddockId: string;
    paddockName?: string | null;
    startAt: string;
    endAt?: string | null;
    notes?: string | null;
}

export interface Farm {
    id: string;
    name: string;
    city: string;
    lat?: number | null;
    lng?: number | null;
    size: number;
    notes?: string;
    responsibleName?: string | null;
    paddocks: Paddock[];
    createdAt: string;
    userId?: string;
}
