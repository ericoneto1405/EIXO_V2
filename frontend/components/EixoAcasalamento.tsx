import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AcasalamentoAnimalOption,
  AcasalamentoAvailabilityMode,
  AcasalamentoBull,
  AcasalamentoIssue,
  AcasalamentoLotOption,
  AcasalamentoObjective,
  AcasalamentoReviewSignals,
  AcasalamentoSession,
  AcasalamentoSourceStatus,
  AcasalamentoSyncJob,
  AcasalamentoTargetMode,
  UploadedMatingLot,
  createAcasalamentoRecommendation,
  getAcasalamentoBulls,
  getAcasalamentoIssues,
  getAcasalamentoOptions,
  getAcasalamentoSessions,
  getAcasalamentoSourcesStatus,
} from '../adapters/acasalamentoApi';

interface EixoAcasalamentoProps {
  farmId: string | null;
}

type BullFilter = 'ALL' | 'READY_ABCZ' | 'VERIFIED' | 'BLOCKED_KEY';

const objectives: Array<{ value: AcasalamentoObjective; title: string; label: string; helper: string; formula: string }> = [
  { value: 'DESMAMA', title: 'Vender bezerro pesado', label: 'Desmama', helper: 'Prioriza desempenho até a desmama com prova oficial específica.', formula: 'DEP desmama x acurácia' },
  { value: 'CARCACA', title: 'Boi gordo para frigorífico', label: 'Carcaça', helper: 'Busca AOL, acabamento ou característica equivalente validada.', formula: 'carcaça + confiança' },
  { value: 'MATERNAL', title: 'Fêmeas de reposição', label: 'Maternal', helper: 'Foco em habilidade materna e formação de base de matrizes.', formula: 'maternal + acurácia' },
  { value: 'PRECOCIDADE', title: 'Precocidade sexual', label: 'Precocidade', helper: 'Só libera touro com prova ou índice ligado à precocidade.', formula: 'precocidade validada' },
  { value: 'NASCIMENTO', title: 'Novilhas e parto seguro', label: 'Nascimento', helper: 'Trava de segurança para reduzir risco de distocia.', formula: 'baixo PN + acurácia' },
];

const targetModes: Array<{ value: AcasalamentoTargetMode; label: string; helper: string }> = [
  { value: 'LOT', label: 'Lotes da fazenda', helper: 'Escolha lotes já existentes apenas como entrada da consultoria.' },
  { value: 'GROUP', label: 'Grupo técnico', helper: 'Monte um grupo de matrizes para simular acasalamento dirigido.' },
  { value: 'INDIVIDUAL', label: 'Matriz individual', helper: 'Use para uma fêmea estratégica ou decisão pontual.' },
  { value: 'UPLOAD', label: 'Planilha externa', helper: 'Use quando o lote ainda não está cadastrado no EIXO.' },
];

const statusLabel: Record<string, string> = { OK: 'OK', PARTIAL: 'Parcial', FAILED: 'Falhou', PENDING: 'Pendente' };
const statusClass: Record<string, string> = {
  OK: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)] border-[#c8ddc4]',
  PARTIAL: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] border-[var(--eixo-border)]',
  FAILED: 'bg-[#fbede8] text-[#8c4d39] border-[#e5c4b7]',
  PENDING: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] border-[var(--eixo-border)]',
};

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR') : 'Nunca');
const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

const parseUploadedLots = async (file: File): Promise<UploadedMatingLot[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  if (!rows.length) throw new Error('A planilha está vazia.');
  return rows.map((row, index) => {
    const lote = String(row.lote || row.Lote || '').trim();
    const quantidade = Number(row.quantidade_cabecas ?? row.Quantidade ?? row.quantidade ?? 0);
    const peso = Number(row.peso_medio ?? row.Peso ?? row.peso ?? 0);
    if (!lote) throw new Error(`Linha ${index + 2}: informe o lote.`);
    if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error(`Linha ${index + 2}: quantidade inválida.`);
    if (!Number.isFinite(peso) || peso <= 0) throw new Error(`Linha ${index + 2}: peso médio inválido.`);
    return { lote, quantidade_cabecas: quantidade, peso_medio: peso };
  });
};

const hasOfficialKey = (bull: AcasalamentoBull) => Boolean(bull.officialKeyNormalized || (bull.officialSeries && bull.officialRgn));
const hasVerifiedProof = (bull: AcasalamentoBull) => bull.officialProofs.some((proof) => proof.proofStatus === 'VERIFIED');
const getProgenyCount = (bull: AcasalamentoBull) => bull.officialProofs.reduce((max, proof) => Math.max(max, proof.progenyCount || 0), 0);
const getProofCount = (bull: AcasalamentoBull, status: string) => bull.officialProofs.filter((proof) => proof.proofStatus === status).length;
const isRelevantIdentityIssue = (issue: AcasalamentoIssue) => issue.message.startsWith('PENDENTE_IDENTIDADE_RELEVANTE');
const getIssueBullName = (issue: AcasalamentoIssue) => (issue.detail || '').split(':')[0]?.trim() || 'Touro pendente';
const signalLabels: Array<{ key: keyof AcasalamentoReviewSignals; label: string }> = [
  { key: 'hasFiv', label: 'FIV' },
  { key: 'hasPedigree', label: 'Pedigree' },
  { key: 'hasProgenySignal', label: 'Progênie' },
  { key: 'hasCommercialProofSignal', label: 'PMGZ comercial' },
  { key: 'multipleCenters', label: 'Múltiplas centrais' },
];

const SignalPills: React.FC<{ signals?: AcasalamentoReviewSignals }> = ({ signals }) => {
  if (!signals) return null;
  const active = signalLabels.filter((item) => Boolean(signals[item.key]));
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {active.map((item) => <span key={item.key} className="rounded-full bg-[var(--eixo-surface-soft)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--eixo-text-muted)]">{item.label}</span>)}
      {signals.progenyCount ? <span className="rounded-full bg-[var(--eixo-surface-soft)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--eixo-text-muted)]">{signals.progenyCount} filhos</span> : null}
      {signals.centersCount && signals.centersCount > 1 ? <span className="rounded-full bg-[var(--eixo-surface-soft)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--eixo-text-muted)]">{signals.centersCount} centrais</span> : null}
    </div>
  );
};

const EixoAcasalamento: React.FC<EixoAcasalamentoProps> = ({ farmId }) => {
  const [sources, setSources] = useState<AcasalamentoSourceStatus[]>([]);
  const [syncJob, setSyncJob] = useState<AcasalamentoSyncJob | null>(null);
  const [bulls, setBulls] = useState<AcasalamentoBull[]>([]);
  const [issues, setIssues] = useState<AcasalamentoIssue[]>([]);
  const [lots, setLots] = useState<AcasalamentoLotOption[]>([]);
  const [animals, setAnimals] = useState<AcasalamentoAnimalOption[]>([]);
  const [sessions, setSessions] = useState<AcasalamentoSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AcasalamentoSession | null>(null);
  const [objective, setObjective] = useState<AcasalamentoObjective>('DESMAMA');
  const [targetMode, setTargetMode] = useState<AcasalamentoTargetMode>('LOT');
  const [availabilityMode, setAvailabilityMode] = useState<AcasalamentoAvailabilityMode>('MARKET_AND_FARM');
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [selectedAnimalIds, setSelectedAnimalIds] = useState<string[]>([]);
  const [uploadedLots, setUploadedLots] = useState<UploadedMatingLot[]>([]);
  const [blocked, setBlocked] = useState<Array<{ bull: AcasalamentoBull; category?: string; reason: string; reviewSignals?: AcasalamentoReviewSignals }>>([]);
  const [bullSearch, setBullSearch] = useState('');
  const [centralFilter, setCentralFilter] = useState('ALL');
  const [bullFilter, setBullFilter] = useState<BullFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!farmId) return;
    setLoading(true);
    setError(null);
    try {
      const [sourcePayload, bullPayload, issuePayload, optionsPayload, sessionPayload] = await Promise.all([
        getAcasalamentoSourcesStatus(),
        getAcasalamentoBulls(),
        getAcasalamentoIssues(),
        getAcasalamentoOptions(farmId),
        getAcasalamentoSessions(farmId),
      ]);
      setSources(sourcePayload.sources);
      setSyncJob(sourcePayload.syncJob);
      setBulls(bullPayload.bulls);
      setIssues(issuePayload.issues);
      setLots(optionsPayload.lots);
      setAnimals(optionsPayload.animals);
      setSessions(sessionPayload.sessions);
      setSelectedSession(sessionPayload.sessions[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o módulo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [farmId]);
  useEffect(() => {
    setSelectedLotIds([]);
    setSelectedAnimalIds([]);
    setUploadedLots([]);
    setBlocked([]);
  }, [targetMode]);

  const selectedObjective = useMemo(() => objectives.find((item) => item.value === objective) || objectives[0], [objective]);
  const selectedTargetMode = useMemo(() => targetModes.find((item) => item.value === targetMode) || targetModes[0], [targetMode]);
  const centralOptions = Array.from(new Set(bulls.map((bull) => bull.central).filter(Boolean))).sort();
  const lastSourceSync = sources.map((source) => source.lastSyncAt).filter(Boolean).sort().pop() || syncJob?.lastFinishedAt || null;
  const baseHasBulls = bulls.length > 0;
  const bullsWithKey = bulls.filter(hasOfficialKey).length;
  const verifiedBulls = bulls.filter(hasVerifiedProof).length;
  const relevantIdentityIssues = issues.filter(isRelevantIdentityIssue);

  const plantelSummary = useMemo(() => {
    const selectedLots = lots.filter((lot) => selectedLotIds.includes(lot.id));
    const selectedAnimals = animals.filter((animal) => selectedAnimalIds.includes(animal.id));
    const uploadedHeads = uploadedLots.reduce((sum, lot) => sum + lot.quantidade_cabecas, 0);
    const selectedHeads = targetMode === 'UPLOAD' ? uploadedHeads : targetMode === 'LOT' ? selectedLots.reduce((sum, lot) => sum + lot.animalsCount, 0) : selectedAnimals.length;
    const scopeLabel = targetMode === 'UPLOAD' ? `${uploadedLots.length} lote(s) externos` : targetMode === 'LOT' ? `${selectedLots.length} lote(s) selecionado(s)` : `${selectedAnimals.length} matriz(es) selecionada(s)`;
    const getAnimalWeight = (animal: { ultimoPeso?: number | null }) =>
      typeof animal.ultimoPeso === 'number' ? animal.ultimoPeso : null;
    const missingWeight = selectedAnimals.filter((animal) => getAnimalWeight(animal) === null).length;
    const lightFemales = selectedAnimals.filter((animal) => {
      const weight = getAnimalWeight(animal);
      return typeof weight === 'number' && weight < 350;
    }).length + uploadedLots.filter((lot) => lot.peso_medio < 350).length;
    const estimatedDoses = selectedHeads > 0 ? Math.ceil(selectedHeads * 1.15) : 0;
    return { selectedHeads, scopeLabel, missingWeight, lightFemales, estimatedDoses };
  }, [animals, lots, selectedAnimalIds, selectedLotIds, targetMode, uploadedLots]);

  const filteredBulls = useMemo(() => {
    const search = bullSearch.trim().toUpperCase();
    return bulls.filter((bull) => {
      if (centralFilter !== 'ALL' && bull.central !== centralFilter) return false;
      if (bullFilter === 'READY_ABCZ' && !hasOfficialKey(bull)) return false;
      if (bullFilter === 'VERIFIED' && !hasVerifiedProof(bull)) return false;
      if (bullFilter === 'BLOCKED_KEY' && hasOfficialKey(bull)) return false;
      if (!search) return true;
      return `${bull.name} ${bull.central} ${bull.registration || ''} ${bull.officialSeries || ''} ${bull.officialRgn || ''}`.toUpperCase().includes(search);
    });
  }, [bullFilter, bullSearch, bulls, centralFilter]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = await parseUploadedLots(file);
      setUploadedLots(parsed);
      setMessage(`${parsed.length} lote(s) carregado(s). Plantel externo pronto para diagnóstico.`);
    } catch (err) {
      setUploadedLots([]);
      setError(err instanceof Error ? err.message : 'Erro ao ler planilha.');
    }
  };

  const handleRun = async () => {
    if (!farmId) return;
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await createAcasalamentoRecommendation({
        farmId,
        objective,
        targetMode,
        availabilityMode,
        lotIds: targetMode === 'LOT' ? selectedLotIds : undefined,
        animalIds: targetMode === 'GROUP' || targetMode === 'INDIVIDUAL' ? selectedAnimalIds : undefined,
        uploadedLots: targetMode === 'UPLOAD' ? uploadedLots : undefined,
      });
      setSelectedSession(payload.session);
      setBlocked(payload.blocked);
      setMessage(payload.session.results.length ? 'Consultoria gerada com prova oficial.' : 'Nenhum touro passou pela máquina da verdade.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar recomendação.');
    } finally {
      setRunning(false);
    }
  };

  if (!farmId) {
    return <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 text-[var(--eixo-text-muted)]">Selecione uma fazenda para acessar o Eixo Acasalamento.</div>;
  }

  return (
    <div className="space-y-5 text-[var(--eixo-text)]">
      <header className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--eixo-text-muted)]">Eixo Acasalamento</p>
            <h2 className="mt-2 text-3xl font-black leading-tight">Recomendação de touros</h2>
            <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Plantel, objetivo e prova oficial.</p>
          </div>
          <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-xs text-[var(--eixo-text-muted)]">
            <strong className="block text-[var(--eixo-text)]">Base</strong>
            {formatDate(lastSourceSync)}
          </div>
        </div>
        {(message || error) && <div className={`mt-4 rounded-2xl border p-3 text-sm ${error ? 'border-[#e5c4b7] bg-[#fbede8] text-[#8c4d39]' : 'border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>{error || message}</div>}
      </header>

      <section className="grid gap-3 lg:grid-cols-4">
        {[
          { label: 'Touros', value: bulls.length },
          { label: 'Série/RGN', value: bullsWithKey },
          { label: 'Prova oficial', value: verifiedBulls },
          { label: 'Pendências', value: issues.length },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--eixo-text-muted)]">{card.label}</p>
            <p className="mt-1 text-2xl font-black">{formatNumber(card.value)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <div className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">1. Plantel</p>
                <h3 className="mt-1 text-xl font-black">Entrada da análise</h3>
              </div>
              <span className="rounded-full bg-[var(--eixo-surface-soft)] px-3 py-1 text-xs font-bold text-[var(--eixo-text-muted)]">{plantelSummary.selectedHeads} cabeça(s)</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-[var(--eixo-text-muted)]">Tipo</span>
                <select value={targetMode} onChange={(event) => setTargetMode(event.target.value as AcasalamentoTargetMode)} className="mt-2 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--eixo-green)]">
                  {targetModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[var(--eixo-text-muted)]">Sêmen</span>
                <select value={availabilityMode} onChange={(event) => setAvailabilityMode(event.target.value as AcasalamentoAvailabilityMode)} className="mt-2 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--eixo-green)]">
                  <option value="MARKET_AND_FARM">Mercado + botijão</option>
                  <option value="FARM_INVENTORY_ONLY">Só botijão</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <MiniStat label="Escopo" value={plantelSummary.scopeLabel} />
              <MiniStat label="Trava parto" value={plantelSummary.lightFemales ? `${plantelSummary.lightFemales} alerta(s)` : 'Sem alerta'} />
              <MiniStat label="Doses" value={formatNumber(plantelSummary.estimatedDoses)} />
            </div>

            {targetMode === 'LOT' && <div className="mt-4 grid gap-2 md:grid-cols-2">{lots.filter((lot) => lot.animalsCount > 0).map((lot) => <label key={lot.id} className="flex items-center gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3 text-sm"><input type="checkbox" checked={selectedLotIds.includes(lot.id)} onChange={(event) => setSelectedLotIds((current) => event.target.checked ? [...current, lot.id] : current.filter((id) => id !== lot.id))} /><span><strong>{lot.name}</strong> · {lot.animalsCount}</span></label>)}{!lots.some((lot) => lot.animalsCount > 0) && <p className="rounded-2xl bg-[var(--eixo-surface-soft)] p-4 text-sm text-[var(--eixo-text-muted)]">Nenhum lote apto.</p>}</div>}

            {(targetMode === 'GROUP' || targetMode === 'INDIVIDUAL') && <div className="mt-4 max-h-64 space-y-2 overflow-auto rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">{animals.map((animal) => { const weight = typeof animal.ultimoPeso === 'number' ? animal.ultimoPeso : null; const hasWeight = weight !== null; const isLight = typeof weight === 'number' && weight < 350; return <label key={animal.id} className="flex items-center justify-between gap-3 rounded-xl p-2 text-sm hover:bg-[var(--eixo-surface)]"><span className="flex items-center gap-3"><input type={targetMode === 'INDIVIDUAL' ? 'radio' : 'checkbox'} name="mating-animal" checked={selectedAnimalIds.includes(animal.id)} onChange={(event) => setSelectedAnimalIds((current) => targetMode === 'INDIVIDUAL' ? [animal.id] : event.target.checked ? [...current, animal.id] : current.filter((id) => id !== animal.id))} /><span><strong>{animal.brinco}</strong> · {hasWeight ? `${weight} kg` : 'sem peso'}</span></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isLight || !hasWeight ? 'bg-[#fbede8] text-[#8c4d39]' : 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]'}`}>{isLight ? 'atenção' : hasWeight ? 'apta' : 'sem peso'}</span></label>; })}{!animals.length && <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma matriz disponível.</p>}</div>}

            {targetMode === 'UPLOAD' && <div className="mt-4 rounded-2xl border border-dashed border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4"><input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="text-sm" />{uploadedLots.length > 0 && <p className="mt-2 text-sm font-semibold">{uploadedLots.length} lote(s) carregado(s).</p>}</div>}
          </div>

          <div className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">2. Objetivo</p>
            <div className="mt-4 grid gap-2">
              {objectives.map((item) => <button key={item.value} type="button" onClick={() => setObjective(item.value)} className={`rounded-2xl border p-4 text-left transition ${objective === item.value ? 'border-[var(--eixo-green)] bg-[var(--eixo-surface-soft)]' : 'border-[var(--eixo-border)] hover:bg-[var(--eixo-surface-soft)]'}`}><div className="flex items-center justify-between gap-3"><div><p className="font-black">{item.title}</p><p className="mt-1 text-xs font-bold uppercase text-[var(--eixo-text-muted)]">{item.label}</p></div><span className="rounded-full bg-[var(--eixo-surface-soft)] px-3 py-1 text-[10px] font-bold text-[var(--eixo-text-muted)]">{item.formula}</span></div></button>)}
            </div>
            <button type="button" onClick={handleRun} disabled={running || loading} className="mt-5 w-full rounded-2xl bg-[var(--eixo-green)] px-5 py-3 text-sm font-bold text-[#1a1a1a] transition hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-60">{running ? 'Processando...' : 'Gerar recomendação'}</button>
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">3. Resultado</p>
              <h3 className="mt-1 text-xl font-black">Top touros</h3>
            </div>
            <span className="rounded-full bg-[var(--eixo-surface-soft)] px-3 py-1 text-xs font-bold text-[var(--eixo-text-muted)]">{selectedObjective.label}</span>
          </div>

          {!baseHasBulls && <EmptyState text="Base ainda não sincronizada." />}
          {baseHasBulls && bullsWithKey === 0 && <EmptyState tone="danger" text="Nenhum touro com série/RGN." />}
          {selectedSession && selectedSession.results.length === 0 && <EmptyState tone="danger" text="Nenhum touro aprovado." />}
          {!selectedSession && baseHasBulls && <EmptyState text="Gere uma recomendação para ver o ranking." />}

          {selectedSession && selectedSession.results.length > 0 && <div className="mt-4 space-y-3">{selectedSession.results.slice(0, 3).map((result) => { const accuracy = result.proofSnapshot?.accuracy; const availability = (result.commercialSnapshot as any)?.availability; return <div key={result.id} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--eixo-text-muted)]">Top {result.rank} · Score {result.score.toFixed(2)}</p><h4 className="mt-1 text-lg font-black">{result.bull?.name || 'Touro'}</h4><p className="text-sm text-[var(--eixo-text-muted)]">{result.bull?.central} · {availability?.label || 'disponível'}</p></div><span className="rounded-full bg-[var(--eixo-green-soft)] px-3 py-1 text-xs font-bold text-[var(--eixo-success)]">Aprovado</span></div><div className="mt-3 grid gap-2 text-xs md:grid-cols-4"><span className="rounded-xl bg-[var(--eixo-surface)] p-2">DEP <strong>{result.proofSnapshot?.dep ?? 'n/i'}</strong></span><span className="rounded-xl bg-[var(--eixo-surface)] p-2">DECA <strong>{result.proofSnapshot?.deca ?? 'n/i'}</strong></span><span className="rounded-xl bg-[var(--eixo-surface)] p-2">ACC <strong>{accuracy !== null && accuracy !== undefined ? `${Math.round(accuracy * 100)}%` : 'n/i'}</strong></span><span className="rounded-xl bg-[var(--eixo-surface)] p-2">Filhos <strong>{result.proofSnapshot?.progenyCount ?? 'n/i'}</strong></span></div>{availability?.farmDosesAvailable ? <p className="mt-3 text-xs font-bold text-[var(--eixo-text-muted)]">Botijão: {availability.farmDosesAvailable} dose(s)</p> : null}</div>; })}</div>}

          {blocked.length > 0 && <details className="mt-5 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4"><summary className="cursor-pointer text-sm font-black">Bloqueados ({blocked.length})</summary><div className="mt-3 max-h-72 space-y-2 overflow-auto">{blocked.map((item) => <div key={`${item.bull.id}-${item.reason}`} className="rounded-xl bg-[#fbede8] p-3 text-sm text-[#8c4d39]"><strong>{item.bull.name}</strong><p className="mt-1 text-xs">{item.reason}</p><SignalPills signals={item.reviewSignals} /></div>)}</div></details>}
        </div>
      </section>

      <details className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
        <summary className="cursor-pointer text-lg font-black">Auditoria e prateleira</summary>
        <div className="mt-5 grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-3">
            {sources.map((source) => <div key={source.id} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold">{source.name}</p><p className="text-xs text-[var(--eixo-text-muted)]">{formatDate(source.lastSyncAt)}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass[source.status] || statusClass.PENDING}`}>{statusLabel[source.status] || source.status}</span></div></div>)}
            {relevantIdentityIssues.length > 0 && <div className="rounded-2xl border border-[#e5c4b7] bg-[#fbede8] p-4 text-sm text-[#8c4d39]"><strong>Revisão de identidade</strong><p className="mt-1 text-xs">{relevantIdentityIssues.length} touro(s) relevantes pendentes.</p></div>}
          </div>
          <div>
            <div className="grid gap-3 md:grid-cols-3"><input value={bullSearch} onChange={(event) => setBullSearch(event.target.value)} placeholder="Buscar touro" className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--eixo-green)]" /><select value={centralFilter} onChange={(event) => setCentralFilter(event.target.value)} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--eixo-green)]"><option value="ALL">Todas</option>{centralOptions.map((central) => <option key={central} value={central}>{central}</option>)}</select><select value={bullFilter} onChange={(event) => setBullFilter(event.target.value as BullFilter)} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3 text-sm outline-none focus:border-[var(--eixo-green)]"><option value="ALL">Todos</option><option value="READY_ABCZ">Série/RGN</option><option value="VERIFIED">Prova oficial</option><option value="BLOCKED_KEY">Sem chave</option></select></div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">{filteredBulls.slice(0, 12).map((bull) => <div key={bull.id} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-black">{bull.name}</h4><p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{bull.central} · {bull.registration || 'sem registro'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${hasVerifiedProof(bull) ? 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' : 'bg-[var(--eixo-surface)] text-[var(--eixo-text-muted)]'}`}>{hasVerifiedProof(bull) ? 'Oficial' : 'Pendente'}</span></div></div>)}</div>
          </div>
        </div>
      </details>

      <details className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
        <summary className="cursor-pointer text-lg font-black">Histórico</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{sessions.slice(0, 6).map((session) => <button key={session.id} type="button" onClick={() => setSelectedSession(session)} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3 text-left text-xs hover:bg-[var(--eixo-surface)]"><strong>{session.objective}</strong> · {formatDate(session.createdAt)} · {session.results.length} aprovado(s)</button>)}{!sessions.length && <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma consultoria ainda.</p>}</div>
      </details>
    </div>
  );
};


const MiniStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">
    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--eixo-text-muted)]">{label}</p>
    <p className="mt-1 text-sm font-black text-[var(--eixo-text)]">{value}</p>
  </div>
);

const EmptyState: React.FC<{ text: string; tone?: 'default' | 'danger' }> = ({ text, tone = 'default' }) => (
  <p className={`mt-4 rounded-2xl p-4 text-sm ${tone === 'danger' ? 'bg-[#fbede8] text-[#8c4d39]' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>{text}</p>
);

export default EixoAcasalamento;
