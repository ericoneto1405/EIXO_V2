import { buildApiUrl } from '../api';

export type Situacao = 'LIBERADA' | 'VAZIA' | 'COBERTA' | 'PRENHE' | 'PARIDA' | 'DESCARTE' | null;
export type Cor = 'VERDE' | 'AMARELO' | 'VERMELHO' | null;
export type TipoEvento =
  | 'LIBERACAO' | 'COBERTURA' | 'IATF' | 'DIAGNOSTICO_PRENHEZ' | 'PERDA'
  | 'PARTO' | 'DESMAME' | 'ECC' | 'OBSERVACAO' | 'DESCARTE';

export interface ReproConfig {
  idadeMinMeses: number | null;
  pesoMinKg: number | null;
  eccMin: number | null;
  gestacaoDias: number | null;
  desmamaIdadeMeses: number | null;
  desmamaPesoKg: number | null;
  pesoNascerKg: number | null;
  minVacasIndicador: number;
  vaziasSeguidasLimite: number | null;
  iepMaxMeses: number | null;
  pesoMinDesmamaFarol: number | null;
  metaPrenhez: number | null;
  metaNatalidade: number | null;
  metaDesmama: number | null;
  metaIepMeses: number | null;
  metaIdadePrimeiroParto: number | null;
}

export interface ConfigResposta {
  config: ReproConfig | null;
  performance: boolean;
  motivosDescarte: string[];
  tiposManuais: TipoEvento[];
}

export interface Candidata {
  id: string;
  brinco: string;
  raca: string | null;
  dataNascimento: string | null;
  dataNascimentoEstimada: boolean;
  lote: string | null;
  peso: number | null;
  pesadoEm: string | null;
  ecc: number | null;
  brucelose: boolean;
  bloqueios: string[];
  farol?: { cor: Cor; motivos: string[] };
  faltaKg?: number;
}

export interface VacaResumo {
  id: string;
  brinco: string;
  status: string;
  situacao: Situacao;
  previsaoParto: string | null;
  lote: string | null;
}

export interface EventoRepro {
  id: string;
  type: TipoEvento;
  date: string;
  payload: Record<string, any>;
  notes: string | null;
  createdAt: string;
}

export interface Ficha {
  vaca: {
    id: string;
    brinco: string;
    raca: string | null;
    dataNascimento: string | null;
    lote: string | null;
    status: string;
    situacao: Situacao;
    previsaoParto: string | null;
    categoria: string;
    historicoDesconhecido: boolean;
  };
  eventos: EventoRepro[];
  numeros: { partos: number; idadePrimeiroParto: number | null; iepMeses: number | null; pesoMedioDesmama: number | null; vaziasSeguidas: number } | null;
  farol?: { cor: Cor; motivos: string[] } | null;
  performance: boolean;
}

export interface EventoPayload {
  type: TipoEvento;
  date: string;
  payload?: Record<string, any>;
  notes?: string;
}

export class ReproApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init?.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ReproApiError(payload?.message || 'Não foi possível concluir a operação.', response.status);
  return payload as T;
}

const base = (farmId: string) => `/farms/${encodeURIComponent(farmId)}/reproducao`;

export const fetchReproConfig = (farmId: string) => request<ConfigResposta>(`${base(farmId)}/config`);

export const salvarReproConfig = (farmId: string, config: Partial<ReproConfig>) =>
  request<{ config: ReproConfig }>(`${base(farmId)}/config`, { method: 'PUT', body: JSON.stringify(config) });

export const listarCandidatas = (farmId: string) =>
  request<{ candidatas: Candidata[]; performance: boolean; criteriosDefinidos: boolean }>(`${base(farmId)}/candidatas`);

export const liberarFemeas = (
  farmId: string,
  body: { animalIds: string[]; data: string; historicoDesconhecido?: boolean; partosAnteriores?: number; situacaoAtual?: string },
) =>
  request<{ liberadas: { id: string; brinco: string }[]; bloqueadas: { id: string; brinco: string; motivos: string[] }[]; naoEncontradas: string[] }>(
    `${base(farmId)}/candidatas/liberar`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const informarBrucelose = (farmId: string, animalId: string, body: { data: string; vacina: 'B19' | 'RB51' }) =>
  request<{ ok: true }>(`${base(farmId)}/animais/${encodeURIComponent(animalId)}/brucelose`, { method: 'POST', body: JSON.stringify(body) });

export const listarVacas = (farmId: string, busca = '') =>
  request<{ vacas: VacaResumo[] }>(`${base(farmId)}/vacas${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`);

export const fetchFicha = (farmId: string, animalId: string) =>
  request<Ficha>(`${base(farmId)}/vacas/${encodeURIComponent(animalId)}`);

export const lancarEvento = (farmId: string, animalId: string, body: EventoPayload) =>
  request<{ evento: EventoRepro; avisos: string[] }>(`${base(farmId)}/vacas/${encodeURIComponent(animalId)}/eventos`, { method: 'POST', body: JSON.stringify(body) });

export const editarEvento = (farmId: string, eventId: string, body: Omit<EventoPayload, 'type'>) =>
  request<{ evento: EventoRepro; avisos: string[] }>(`${base(farmId)}/eventos/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(body) });

export const apagarEvento = (farmId: string, eventId: string) =>
  request<{ ok: true }>(`${base(farmId)}/eventos/${encodeURIComponent(eventId)}`, { method: 'DELETE' });

// ---------- Fase 2: toque/ultrassom em lote ----------

export type Metodo = 'TOQUE' | 'ULTRASSOM';
export type Faixa = 'INICIAL' | 'MEIO' | 'FINAL';

export interface VacaCurral {
  id: string;
  brinco: string;
  situacao: Situacao;
  categoria: string;
  lotId: string | null;
  lote: string | null;
}

export interface LinhaToque {
  brinco: string;
  resultado: 'PRENHE' | 'VAZIA';
  diasGestacao?: number | null;
  faixa?: Faixa | null;
  ecc?: number | null;
  obs?: string | null;
}

export interface PendenciaToque extends LinhaToque {
  motivo: string;
}

export interface ToquePayload {
  clientId: string;
  data: string;
  metodo: Metodo;
  veterinario?: string;
  crmv?: string;
  lotId?: string | null;
  notes?: string;
  linhas: LinhaToque[];
}

export interface ResumoToque {
  prenhes: number;
  vazias: number;
  perdas: number;
  pendencias: number;
  naoPassaram: string[];
}

export interface SessaoToque {
  id: string;
  date: string;
  metodo: Metodo;
  vetName: string | null;
  lotId: string | null;
  lote: string | null;
  resumo: ResumoToque | null;
  pendencias: PendenciaToque[];
}

export interface VaziaDecidir {
  id: string;
  brinco: string;
  lote: string | null;
  vaziaEm: string;
  categoria: string;
  vaziasSeguidas: number;
  perdaRecente: boolean;
}

export const baixarVacasCurral = (farmId: string) =>
  request<{ baixadoEm: string; vacas: VacaCurral[] }>(`${base(farmId)}/toque/vacas`);

export const enviarToque = (farmId: string, body: ToquePayload) =>
  request<{ sessao: { id: string }; resumo?: ResumoToque; pendencias?: PendenciaToque[]; repetido?: boolean }>(
    `${base(farmId)}/toque/sessoes`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const listarToques = (farmId: string) =>
  request<{ sessoes: SessaoToque[]; lotes: { id: string; name: string }[] }>(`${base(farmId)}/toque/sessoes`);

export const apagarToque = (farmId: string, id: string) =>
  request<{ ok: true; vacasRecalculadas: number }>(`${base(farmId)}/toque/sessoes/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const resolverPendencia = (farmId: string, sessaoId: string, indice: number, body: { animalId?: string; descartar?: boolean }) =>
  request<{ ok: true; pendencias: PendenciaToque[] }>(
    `${base(farmId)}/toque/sessoes/${encodeURIComponent(sessaoId)}/pendencias/${indice}`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const listarDecidir = (farmId: string) =>
  request<{ vacas: VaziaDecidir[]; decisoes: string[]; motivosDescarte: string[] }>(`${base(farmId)}/decidir`);

export const salvarDecisao = (farmId: string, body: { animalIds: string[]; decisao: string; motivo?: string }) =>
  request<{ ok: true; total: number }>(`${base(farmId)}/decidir`, { method: 'POST', body: JSON.stringify(body) });

// ---------- Fase 3: parto e desmama ----------

export type TipoParto = 'NORMAL' | 'ASSISTIDO' | 'CESAREA';

export interface CriaPayload {
  sexo: 'MACHO' | 'FEMEA';
  vivo: boolean;
  peso?: number | null;
  identificacao?: string | null;
}

export interface PartoPayload {
  clientId: string;
  brinco?: string;
  vacaId?: string;
  data: string;
  tipoParto: TipoParto;
  ecc?: number | null;
  obs?: string;
  crias: CriaPayload[];
}

export interface PartoPrevisto {
  id: string;
  brinco: string;
  lote: string | null;
  previsaoParto: string;
  status: 'ATRASADO' | 'PROXIMO';
}

export interface PartoRecente {
  id: string;
  vacaId: string;
  brinco: string;
  date: string;
  payload: Record<string, any>;
}

export interface BezerroDesmama {
  id: string;
  brinco: string;
  sexo: 'MACHO' | 'FEMEA' | null;
  idadeDias: number | null;
  peso: number | null;
  mae: string | null;
  pronto: boolean | null;
}

export interface DesmamaPayload {
  clientId: string;
  data: string;
  lotId?: string | null;
  linhas: { animalId?: string; brinco: string; peso: number }[];
}

export const listarPartos = (farmId: string) =>
  request<{ previstos: PartoPrevisto[]; semPrevisao: number; recentes: PartoRecente[] }>(`${base(farmId)}/partos`);

export const lancarParto = (farmId: string, body: PartoPayload) =>
  request<{ eventoId: string; crias?: { brinco?: string; vivo: boolean }[]; avisos?: string[]; repetido?: boolean }>(
    `${base(farmId)}/partos`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const apagarParto = (farmId: string, eventId: string) =>
  request<{ ok: true; bezerrosApagados: number }>(`${base(farmId)}/partos/${encodeURIComponent(eventId)}`, { method: 'DELETE' });

export const listarDesmama = (farmId: string) =>
  request<{ bezerros: BezerroDesmama[]; criteriosDefinidos: boolean; recentes: { id: string; mae: string; date: string; payload: Record<string, any> }[] }>(`${base(farmId)}/desmama`);

export const lancarDesmama = (farmId: string, body: DesmamaPayload) =>
  request<{ feitos: { brinco: string; peso?: number; pesoAjustado205?: number | null; precoce?: boolean; repetido?: boolean }[]; erros: { brinco: string; motivo: string }[] }>(
    `${base(farmId)}/desmama`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const desfazerDesmama = (farmId: string, eventId: string) =>
  request<{ ok: true; aviso: string }>(`${base(farmId)}/desmama/${encodeURIComponent(eventId)}`, { method: 'DELETE' });

// ---------- Fase 4: indicadores e farol (Performance) ----------

export interface Indicador {
  chave: string;
  nome: string;
  unidade: string;
  valor: number | null;
  base: number;
  meta: number | null;
  cor: Cor;
  menorMelhor?: boolean;
  insuficiente: boolean;
}

export interface VacaFarol {
  id: string;
  brinco: string;
  lote: string | null;
  categoria: string;
  cor: Cor;
  motivos: string[];
  mantida: boolean;
}

export interface ItemPainel {
  chave: string;
  titulo: string;
  total: number;
  aba: string;
}

export const fetchIndicadores = (farmId: string, filtros: { lotId?: string; categoria?: string } = {}) => {
  const q = new URLSearchParams();
  if (filtros.lotId) q.set('lotId', filtros.lotId);
  if (filtros.categoria) q.set('categoria', filtros.categoria);
  const qs = q.toString();
  return request<{ indicadores: Indicador[]; janela: string; minimo: number; totalVacas: number; lotes: { id: string; name: string }[]; categorias: string[] }>(
    `${base(farmId)}/indicadores${qs ? `?${qs}` : ''}`,
  );
};

export const fetchFarol = (farmId: string) =>
  request<{ vacas: VacaFarol[]; descarte: VacaFarol[]; resumo: Record<'VERDE' | 'AMARELO' | 'VERMELHO', number>; limitesDefinidos: boolean; motivosDescarte: string[] }>(`${base(farmId)}/farol`);

export const manterVaca = (farmId: string, animalId: string, justificativa: string) =>
  request<{ ok: true }>(`${base(farmId)}/farol/manter`, { method: 'POST', body: JSON.stringify({ animalId, justificativa }) });

export const fetchPainel = (farmId: string) => request<{ itens: ItemPainel[] }>(`${base(farmId)}/painel`);

// ---------- Fase 5: cobertura (monta natural e IATF) e botijão ----------

export interface PassoProtocolo {
  dia: number;
  titulo: string;
  produtoId?: string | null;
  dose?: number | null;
}

export interface Protocolo {
  id: string;
  nome: string;
  passos: PassoProtocolo[];
  ativo: boolean;
}

export interface ProdutoFarmacia {
  id: string;
  name: string;
  unit: string;
  applicationUnit: string | null;
  batches: { id: string; lotNumber: string; quantity: number; expiresAt: string | null }[];
}

export interface Tanque {
  id: string;
  name: string;
  canecas: number | null;
  nivelMinCm: number | null;
  intervaloMedicaoDias: number | null;
  ultimaRecargaEm: string | null;
  readings: { id: string; date: string; nivelCm: number | null; recarregado: boolean }[];
}

export interface PartidaSemen {
  id: string;
  lote: string;
  touro: string;
  bullRegistry: string | null;
  fornecedor: string | null;
  dosesTotal: number;
  dosesDisponiveis: number;
  tankId: string | null;
  caneca: string | null;
  custoDose: number | null;
}

export interface AgendaPasso {
  dia: number;
  titulo: string;
  produtoId: string | null;
  dose: number | null;
  data: string;
  quando: 'ATRASADO' | 'HOJE' | 'AMANHA' | 'FUTURO';
  emDias: number;
}

export interface SessaoIatf {
  id: string;
  dia0: string;
  status: string;
  responsavel: string | null;
  lotId: string | null;
  protocolo: string | null;
  vacas: { animalId: string; brinco: string; avisos?: string[] }[];
  passosFeitos: { dia: number; data: string; consumo: number }[];
  agenda: AgendaPasso[];
  resumo: { fora?: { brinco: string; motivo: string }[]; alertas?: string[]; inseminadas?: number; pendencias?: { brinco: string; motivo: string }[] } | null;
}

export interface InseminacaoPayload {
  data: string;
  linhas: { brinco: string; semenBatchId: string; inseminador?: string }[];
}

export const listarProtocolos = (farmId: string) =>
  request<{ protocolos: Protocolo[]; produtos: ProdutoFarmacia[] }>(`${base(farmId)}/protocolos`);

export const salvarProtocolo = (farmId: string, body: { id?: string; nome: string; passos: PassoProtocolo[] }) =>
  request<{ protocolo: Protocolo }>(`${base(farmId)}/protocolos`, { method: 'POST', body: JSON.stringify(body) });

export const apagarProtocolo = (farmId: string, id: string) =>
  request<{ ok: true; desativado?: boolean }>(`${base(farmId)}/protocolos/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const fetchBotijao = (farmId: string) =>
  request<{ tanques: Tanque[]; partidas: PartidaSemen[]; alertas: { cor: Cor; tankId: string; texto: string }[] }>(`${base(farmId)}/botijao`);

export const salvarTanque = (farmId: string, body: Record<string, any>) =>
  request<{ tanque: Tanque }>(`${base(farmId)}/botijao/tanques`, { method: 'POST', body: JSON.stringify(body) });

export const lancarMedicao = (farmId: string, tankId: string, body: { data?: string; nivelCm?: number | null; recarregado?: boolean; notes?: string }) =>
  request<{ ok: true }>(`${base(farmId)}/botijao/tanques/${encodeURIComponent(tankId)}/medicoes`, { method: 'POST', body: JSON.stringify(body) });

export const lancarEntradaSemen = (farmId: string, body: Record<string, any>) =>
  request<{ partida: PartidaSemen }>(`${base(farmId)}/botijao/partidas`, { method: 'POST', body: JSON.stringify(body) });

export const atualizarPartida = (farmId: string, id: string, body: Record<string, any>) =>
  request<{ partida: PartidaSemen }>(`${base(farmId)}/botijao/partidas/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });

export const movimentarDoses = (farmId: string, id: string, body: { tipo: 'OUT' | 'ADJUST'; quantidade: number; motivo: string }) =>
  request<{ ok: true; dosesDisponiveis: number }>(`${base(farmId)}/botijao/partidas/${encodeURIComponent(id)}/movimentos`, { method: 'POST', body: JSON.stringify(body) });

export const lancarMontaNatural = (farmId: string, body: { lotId?: string | null; animalIds?: string[]; touro: string; inicio: string; fim?: string | null; repasse?: boolean; notes?: string }) =>
  request<{ total: number }>(`${base(farmId)}/coberturas/monta-natural`, { method: 'POST', body: JSON.stringify(body) });

export const listarIatf = (farmId: string) => request<{ sessoes: SessaoIatf[] }>(`${base(farmId)}/iatf`);

export const abrirIatf = (farmId: string, body: { clientId?: string; protocolId?: string | null; dia0: string; lotId?: string | null; animalIds?: string[]; responsavel?: string }) =>
  request<{ sessao: { id: string }; dentro?: { brinco: string }[]; fora?: { brinco: string; motivo: string }[]; alertas?: string[]; repetido?: boolean }>(
    `${base(farmId)}/iatf`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const marcarPasso = (farmId: string, sessaoId: string, dia: number) =>
  request<{ ok: true; consumo: number }>(`${base(farmId)}/iatf/${encodeURIComponent(sessaoId)}/passos/${dia}`, { method: 'POST', body: JSON.stringify({}) });

export const lancarInseminacao = (farmId: string, sessaoId: string, body: InseminacaoPayload) =>
  request<{ inseminadas?: number; pendencias?: { brinco: string; motivo: string }[]; repetido?: boolean }>(
    `${base(farmId)}/iatf/${encodeURIComponent(sessaoId)}/inseminacao`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const apagarIatf = (farmId: string, sessaoId: string) =>
  request<{ ok: true }>(`${base(farmId)}/iatf/${encodeURIComponent(sessaoId)}`, { method: 'DELETE' });
