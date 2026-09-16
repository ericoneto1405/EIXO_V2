import { buildApiUrl } from '../api';

export type AnimalDocumentType = 'REGISTRO_ABCZ' | 'CONTRATO' | 'NOTA' | 'CATALOGO' | 'EXAME' | 'OUTRO';
export type AnimalValuationSource = 'LEILAO' | 'AVALIACAO' | 'OFERTA';

export interface AuctionMoneySummary {
  purchase: number;
  sales: number;
  expenses: number;
  revenues: number;
  invested: number;
  currentValue: number;
  result: number;
  returnPct: number | null;
  ownSharePct: number;
  ownResult: number;
}

export interface AuctionAnimalListItem {
  id: string;
  farmId: string;
  brinco: string;
  nome: string | null;
  registro: string | null;
  raca: string | null;
  sexo: string | null;
  categoria: string | null;
  dataNascimento: string | null;
  status: string;
  hasVideo: boolean;
  partnersCount: number;
  documentsCount: number;
  money: AuctionMoneySummary;
}

export interface AuctionPlantel {
  items: AuctionAnimalListItem[];
  totals: { animals: number; invested: number; currentValue: number; result: number };
}

export interface AnimalPartnerUI {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  sharePct: number;
  isOwnFarm: boolean;
  since: string | null;
  notes: string | null;
}

export interface AnimalDocumentUI {
  id: string;
  type: AnimalDocumentType;
  title: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AnimalValuationUI {
  id: string;
  date: string;
  value: number;
  source: AnimalValuationSource;
  notes: string | null;
}

export interface AuctionAnimalDetail {
  animal: {
    id: string;
    farmId: string;
    brinco: string;
    nome: string | null;
    registro: string | null;
    raca: string | null;
    sexo: string | null;
    categoria: string | null;
    dataNascimento: string | null;
    paiNome: string | null;
    maeNome: string | null;
    status: string;
    videoUrl: string | null;
  };
  partners: AnimalPartnerUI[];
  documents: AnimalDocumentUI[];
  valuations: AnimalValuationUI[];
  trades: Array<{ id: string; type: 'COMPRA' | 'VENDA'; date: string; value: number | null; origem: string | null; destino: string | null }>;
  entries: Array<{ id: string; date: string; description: string | null; kind: 'RECEITA' | 'DESPESA'; amount: number }>;
  genetics: {
    semenBatches: Array<{ id: string; lote: string; dosesTotal: number; dosesDisponiveis: number }>;
    embryoBatches: Array<{ id: string; lote: string; tecnica: string; quantidadeTotal: number; quantidadeDisponivel: number }>;
    reproEvents: Array<{ id: string; type: string; date: string; notes: string | null }>;
  };
  money: AuctionMoneySummary;
}

export type PartnerInput = {
  name: string;
  sharePct: number;
  isOwnFarm?: boolean;
  document?: string;
  phone?: string;
  email?: string;
  since?: string;
  notes?: string;
};

const request = async <T>(path: string, fallbackMessage: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init?.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || fallbackMessage);
  return payload as T;
};

const jsonBody = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const getPlantel = (farmId: string) =>
  request<AuctionPlantel>(`/leiloes/plantel?farmId=${encodeURIComponent(farmId)}`, 'Erro ao carregar o plantel.');

export const getAuctionAnimal = (animalId: string) =>
  request<AuctionAnimalDetail>(`/leiloes/animais/${animalId}`, 'Erro ao carregar a ficha do animal.');

export const saveAnimalVideo = (animalId: string, videoUrl: string) =>
  request<{ videoUrl: string | null }>(`/leiloes/animais/${animalId}/video`, 'Erro ao salvar o vídeo.', jsonBody('PUT', { videoUrl }));

export const addPartner = (animalId: string, input: PartnerInput) =>
  request<{ partner: AnimalPartnerUI }>(`/leiloes/animais/${animalId}/socios`, 'Erro ao salvar o sócio.', jsonBody('POST', input));

export const updatePartner = (partnerId: string, input: PartnerInput) =>
  request<{ partner: AnimalPartnerUI }>(`/leiloes/socios/${partnerId}`, 'Erro ao atualizar o sócio.', jsonBody('PUT', input));

export const removePartner = (partnerId: string) =>
  request<{ success: boolean }>(`/leiloes/socios/${partnerId}`, 'Erro ao remover o sócio.', { method: 'DELETE' });

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
  reader.readAsDataURL(file);
});

export const uploadAnimalDocument = async (animalId: string, file: File, type: AnimalDocumentType, title?: string) => {
  const contentBase64 = await fileToBase64(file);
  return request<{ document: AnimalDocumentUI }>(
    `/leiloes/animais/${animalId}/documentos`,
    'Erro ao enviar o documento.',
    jsonBody('POST', { type, title, fileName: file.name, mimeType: file.type, contentBase64 }),
  );
};

export const documentFileUrl = (documentId: string) => buildApiUrl(`/leiloes/documentos/${documentId}/arquivo`);

export const removeAnimalDocument = (documentId: string) =>
  request<{ success: boolean }>(`/leiloes/documentos/${documentId}`, 'Erro ao remover o documento.', { method: 'DELETE' });

export const addValuation = (animalId: string, input: { date: string; value: number; source: AnimalValuationSource; notes?: string }) =>
  request<{ valuation: AnimalValuationUI }>(`/leiloes/animais/${animalId}/avaliacoes`, 'Erro ao salvar a avaliação.', jsonBody('POST', input));

export const removeValuation = (valuationId: string) =>
  request<{ success: boolean }>(`/leiloes/avaliacoes/${valuationId}`, 'Erro ao remover a avaliação.', { method: 'DELETE' });

// ── Leitura com IA ─────────────────────────────────────────────────────────
export interface DocumentExtraction {
  documentKind: 'CONTRATO' | 'NOTA' | 'CATALOGO' | 'REGISTRO' | 'OUTRO';
  animal: {
    nome: string | null; registro: string | null; raca: string | null; sexo: 'MACHO' | 'FEMEA' | null;
    dataNascimento: string | null; pai: string | null; mae: string | null; lote: string | null;
  };
  leilao: {
    nome: string | null; leiloeira: string | null; data: string | null; valorTotal: number | null;
    parcelas: number | null; valorParcela: number | null; comissaoPct: number | null;
    percentualAdquirido: number | null; vendedor: string | null; comprador: string | null;
  };
  socios: Array<{ nome: string; percentual: number | null }>;
  observacoes: string | null;
}

export interface ApplyReadingInput {
  partners: PartnerInput[];
  valuation?: { date: string; value: number; notes?: string };
  purchase?: { date: string; value: number; origem?: string };
}

export const getReaderStatus = () =>
  request<{ enabled: boolean }>('/leiloes/leitura/status', 'Erro ao verificar a leitura automática.');

export const readDocumentWithAI = (documentId: string) =>
  request<{ extraction: DocumentExtraction; redacted: Record<string, number> }>(
    `/leiloes/documentos/${documentId}/ler`, 'Não foi possível ler o documento.', { method: 'POST' },
  );

export const applyReading = (animalId: string, input: ApplyReadingInput) =>
  request<{ applied: { partners: number; valuation: boolean; purchase: boolean } }>(
    `/leiloes/animais/${animalId}/aplicar-leitura`, 'Erro ao aplicar a leitura.', jsonBody('POST', input),
  );
