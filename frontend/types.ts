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
    source?: string;
    sourceType?: string;
    sourceId?: string | null;
    farmId?: string;
    createdAt?: string | null;
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
    objective?: string | null;
    phase?: string | null;
    status?: string | null;
    startDate?: string | null;
    farmId: string;
}

export interface AnimalUI {
    id: string;
    farmId: string;
    brinco?: string | null;
    nome?: string | null;
    tipoCadastro?: 'PO' | 'MESTICO' | string | null;
    identificacao: string;
    raca: string;
    sexo: string;
    dataNascimento?: string | null;
    pesoAtual: number | null;
    dataUltimaPesagem?: string | null;
    gmd: number | null;
    gmdLast?: number | null;
    gmd30?: number | null;
    lotId?: string | null;
    registro?: string | null;
    categoria?: string | null;
    selectionDecision?: string | null;
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
    weighingSessionId?: string | null;
}

export interface WeighingSessionUI {
    id: string;
    name: string;
    responsibleName?: string | null;
    farmId: string;
    createdAt: string;
    weighingsCount?: number;
}

export interface Lot {
    id: string;
    name: string;
    notes?: string | null;
    objective?: string | null;
    phase?: string | null;
    status?: string | null;
    startDate?: string | null;
    farmId: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface Paddock {
    id: string;
    name: string;
    areaHa?: number | null;
    divisionType?: string | null;
    forrageira?: string | null;
    lotacaoUaHa?: number | null;
    capacity?: number | null;
    lat?: number | null;
    lng?: number | null;
    mapGeometry?: object | null;
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

export interface ManagedUser {
    id: string;
    name: string;
    email: string;
    modules: string[];
    roles: string[];
    accessType: 'WEB' | 'APP_MANEJO' | 'WEB_APP';
    fieldProfile: 'VAQUEIRO' | 'ADMIN_CAMPO' | null;
    appActivationStatus: 'PENDENTE_ATIVACAO' | 'ATIVO' | 'CODIGO_EXPIRADO' | 'BLOQUEADO' | 'APARELHO_REVOGADO' | null;
    membershipRole: string | null;
    lastFarmId: string | null;
    allowedFarmIds: string[];
    defaultFarmId: string | null;
    activeAppCode?: {
        createdAt?: string | null;
        expiresAt?: string | null;
        usedAt?: string | null;
        revokedAt?: string | null;
    } | null;
    activeAppDevice?: {
        id: string;
        deviceLabel?: string | null;
        platform?: string | null;
        appVersion?: string | null;
        activatedAt?: string | null;
        lastSeenAt?: string | null;
    } | null;
    appContext?: {
        profile?: string;
        mode?: string;
    } | null;
    createdAt?: string | null;
}

export interface WebUserCreatePayload {
    name: string;
    email: string;
    password: string;
    modules: string[];
    defaultFarmId?: string | null;
}

export interface WebUserUpdatePayload {
    name: string;
    email: string;
    modules: string[];
    defaultFarmId?: string | null;
}

export interface FieldCollaboratorCreatePayload {
    name: string;
    fieldProfile: 'VAQUEIRO' | 'ADMIN_CAMPO';
    defaultFarmId: string;
    email?: string;
    password?: string;
}

export interface FieldCollaboratorUpdatePayload {
    name: string;
    fieldProfile: 'VAQUEIRO' | 'ADMIN_CAMPO';
    defaultFarmId: string;
}

export interface AppActivationCodePayload {
    code: string;
    expiresAt: string;
    userId: string;
}
