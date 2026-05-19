import React from 'react';
import {
  createMarketPrice,
  createMarketRegion,
  createMarketSource,
  listMarketJobs,
  listMarketNormalizedPrices,
  listMarketPrices,
  listMarketRawCaptures,
  listMarketRegions,
  listMarketSources,
  publishMarketNormalizedPrice,
  rejectMarketNormalizedPrice,
  runMockNationalJob,
  type MarketJob,
  type MarketNormalizedPrice,
  type MarketPrice,
  type MarketRawCapture,
  type MarketRegion,
  type MarketSource,
} from '../adapters/marketApi';

const PRODUCT_OPTIONS = [
  { value: 'BOI_GORDO', label: 'Boi gordo' },
  { value: 'VACA_GORDA', label: 'Vaca gorda' },
  { value: 'NOVILHA_GORDA', label: 'Novilha gorda' },
  { value: 'BEZERRO_DESMAMA', label: 'Bezerro desmamado' },
  { value: 'BEZERRO_12M', label: 'Bezerro 8–12 meses' },
  { value: 'GARROTE', label: 'Garrote' },
  { value: 'BOI_MAGRO', label: 'Boi magro' },
];

const UNIT_OPTIONS = [
  { value: 'ARROBA', label: 'R$/@' },
  { value: 'CABECA', label: 'R$/cab' },
  { value: 'KG', label: 'R$/kg' },
];

const PAYMENT_OPTIONS = [
  { value: 'A_VISTA', label: 'À vista' },
  { value: 'TRINTA_DIAS', label: '30 dias' },
  { value: 'NAO_INFORMADO', label: 'Não informado' },
];

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'PUBLISHED', label: 'Publicado' },
  { value: 'ARCHIVED', label: 'Arquivado' },
];

const SOURCE_TYPE_OPTIONS = [
  'MANUAL',
  'SITE_NOTICIAS',
  'CONSULTORIA',
  'API',
  'B3',
  'OUTRO',
];

const REPLACEMENT_PRODUCTS = new Set(['BEZERRO_DESMAMA', 'BEZERRO_12M', 'GARROTE', 'BOI_MAGRO']);

type TabKey = 'published' | 'raw' | 'normalized';

const fmtDate = (value: string | null) => {
  if (!value) return '—';
  const str = String(value);
  const datePart = str.includes('T') ? str.split('T')[0] : str;
  const [yyyy, mm, dd] = datePart.split('-');
  if (!yyyy || !mm || !dd) return '—';
  return `${dd}/${mm}/${yyyy}`;
};

const fmtMoney = (value: number) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MarketAdmin: React.FC = () => {
  const [sources, setSources] = React.useState<MarketSource[]>([]);
  const [regions, setRegions] = React.useState<MarketRegion[]>([]);
  const [prices, setPrices] = React.useState<MarketPrice[]>([]);
  const [rawCaptures, setRawCaptures] = React.useState<MarketRawCapture[]>([]);
  const [normalizedPrices, setNormalizedPrices] = React.useState<MarketNormalizedPrice[]>([]);
  const [jobs, setJobs] = React.useState<MarketJob[]>([]);
  const [activeTab, setActiveTab] = React.useState<TabKey>('published');

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [runningJob, setRunningJob] = React.useState(false);

  const [sourceForm, setSourceForm] = React.useState({ name: '', type: 'MANUAL', url: '', isActive: true });
  const [regionForm, setRegionForm] = React.useState({ name: '', state: 'BA', city: '', marketPlaceName: '', sourceRegionName: '', isActive: true });
  const [priceForm, setPriceForm] = React.useState({
    productType: 'BOI_GORDO',
    regionId: '',
    sourceId: '',
    price: '',
    unit: 'ARROBA',
    paymentType: 'A_VISTA',
    referenceDate: '',
    referenceWeightArrobas: '',
    status: 'PUBLISHED',
    notes: '',
  });

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSources, nextRegions, nextPrices, nextRawCaptures, nextNormalized, nextJobs] = await Promise.all([
        listMarketSources(),
        listMarketRegions(),
        listMarketPrices(),
        listMarketRawCaptures(),
        listMarketNormalizedPrices(),
        listMarketJobs(),
      ]);
      setSources(nextSources);
      setRegions(nextRegions);
      setPrices(nextPrices);
      setRawCaptures(nextRawCaptures);
      setNormalizedPrices(nextNormalized);
      setJobs(nextJobs);
      if (!priceForm.sourceId && nextSources[0]) {
        setPriceForm((prev) => ({ ...prev, sourceId: nextSources[0].id }));
      }
      if (!priceForm.regionId && nextRegions[0]) {
        setPriceForm((prev) => ({ ...prev, regionId: nextRegions[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar EIXO Mercado.');
    } finally {
      setLoading(false);
    }
  }, [priceForm.regionId, priceForm.sourceId]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const handleRunMockNational = async () => {
    clearMessages();
    setRunningJob(true);
    try {
      await runMockNationalJob();
      setSuccess('Pipeline mock nacional executado com sucesso.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar pipeline mock nacional.');
    } finally {
      setRunningJob(false);
    }
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      if (!sourceForm.name.trim()) throw new Error('Nome da fonte é obrigatório.');
      await createMarketSource({
        name: sourceForm.name.trim(),
        type: sourceForm.type,
        url: sourceForm.url.trim() || null,
        isActive: sourceForm.isActive,
      });
      setSuccess('Fonte cadastrada com sucesso.');
      setSourceForm({ name: '', type: 'MANUAL', url: '', isActive: true });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar fonte.');
    }
  };

  const handleCreateRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      if (!regionForm.name.trim()) throw new Error('Nome da região é obrigatório.');
      if (!regionForm.state.trim() || regionForm.state.trim().length !== 2) throw new Error('UF inválida.');
      await createMarketRegion({
        name: regionForm.name.trim(),
        state: regionForm.state.trim().toUpperCase(),
        city: regionForm.city.trim() || null,
        marketPlaceName: regionForm.marketPlaceName.trim() || null,
        sourceRegionName: regionForm.sourceRegionName.trim() || null,
        isActive: regionForm.isActive,
      });
      setSuccess('Região cadastrada com sucesso.');
      setRegionForm({ name: '', state: 'BA', city: '', marketPlaceName: '', sourceRegionName: '', isActive: true });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar região.');
    }
  };

  const handleCreatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      if (!priceForm.regionId) throw new Error('Selecione a região.');
      if (!priceForm.sourceId) throw new Error('Selecione a fonte.');
      if (!priceForm.referenceDate) throw new Error('Data de referência é obrigatória.');
      const numericPrice = Number(priceForm.price);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) throw new Error('Preço inválido.');
      const now = new Date();
      const refDate = new Date(`${priceForm.referenceDate}T00:00:00`);
      if (refDate.getTime() > now.getTime()) throw new Error('Data de referência não pode ser futura.');
      if (priceForm.productType === 'BOI_GORDO' && priceForm.unit !== 'ARROBA') throw new Error('Boi gordo deve usar unidade R$/@.');
      const isReplacementByHead = REPLACEMENT_PRODUCTS.has(priceForm.productType) && priceForm.unit === 'CABECA';
      const weight = priceForm.referenceWeightArrobas.trim() ? Number(priceForm.referenceWeightArrobas) : null;
      if (isReplacementByHead && (!weight || weight <= 0)) throw new Error('Peso estimado em arrobas é obrigatório para reposição por cabeça.');

      await createMarketPrice({
        productType: priceForm.productType,
        regionId: priceForm.regionId,
        sourceId: priceForm.sourceId,
        price: numericPrice,
        unit: priceForm.unit,
        paymentType: priceForm.paymentType,
        referenceDate: priceForm.referenceDate,
        referenceWeightArrobas: weight,
        status: priceForm.status,
        notes: priceForm.notes.trim() || null,
      });
      setSuccess('Cotação cadastrada com sucesso.');
      setPriceForm((prev) => ({ ...prev, price: '', referenceDate: '', referenceWeightArrobas: '', notes: '' }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar cotação.');
    }
  };

  const handlePublishNormalized = async (id: string) => {
    clearMessages();
    try {
      await publishMarketNormalizedPrice(id);
      setSuccess('Cotação normalizada publicada com sucesso.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar normalizada.');
    }
  };

  const handleRejectNormalized = async (id: string) => {
    clearMessages();
    try {
      await rejectMarketNormalizedPrice(id, 'Rejeição manual no backoffice');
      setSuccess('Cotação normalizada rejeitada.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar normalizada.');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-brand text-2xl font-extrabold text-[var(--eixo-text)]">EIXO Mercado</h1>
          <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Curadoria nacional de cotações para publicação no Dashboard.</p>
        </div>
        <button
          type="button"
          disabled={runningJob}
          onClick={handleRunMockNational}
          className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {runningJob ? 'Executando pipeline...' : 'Rodar mock nacional'}
        </button>
      </div>

      {error && <div className="rounded-xl border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-sm text-[#8c2020]">{error}</div>}
      {success && <div className="rounded-xl border border-[#c7dfb8] bg-[#eef8e8] px-4 py-3 text-sm text-[#2f5130]">{success}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={handleCreateSource} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
          <p className="text-sm font-bold text-[var(--eixo-text)]">Cadastrar fonte</p>
          <input className="mt-3 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="Nome" value={sourceForm.name} onChange={(e) => setSourceForm((prev) => ({ ...prev, name: e.target.value }))} />
          <select className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" value={sourceForm.type} onChange={(e) => setSourceForm((prev) => ({ ...prev, type: e.target.value }))}>
            {SOURCE_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="URL (opcional)" value={sourceForm.url} onChange={(e) => setSourceForm((prev) => ({ ...prev, url: e.target.value }))} />
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--eixo-text-muted)]"><input type="checkbox" checked={sourceForm.isActive} onChange={(e) => setSourceForm((prev) => ({ ...prev, isActive: e.target.checked }))} />Ativa</label>
          <button type="submit" className="mt-3 w-full rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a]">Salvar fonte</button>
        </form>

        <form onSubmit={handleCreateRegion} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
          <p className="text-sm font-bold text-[var(--eixo-text)]">Cadastrar região</p>
          <input className="mt-3 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="Nome" value={regionForm.name} onChange={(e) => setRegionForm((prev) => ({ ...prev, name: e.target.value }))} />
          <input className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="UF" value={regionForm.state} maxLength={2} onChange={(e) => setRegionForm((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))} />
          <input className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="Cidade (opcional)" value={regionForm.city} onChange={(e) => setRegionForm((prev) => ({ ...prev, city: e.target.value }))} />
          <input className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="Praça (opcional)" value={regionForm.marketPlaceName} onChange={(e) => setRegionForm((prev) => ({ ...prev, marketPlaceName: e.target.value }))} />
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--eixo-text-muted)]"><input type="checkbox" checked={regionForm.isActive} onChange={(e) => setRegionForm((prev) => ({ ...prev, isActive: e.target.checked }))} />Ativa</label>
          <button type="submit" className="mt-3 w-full rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a]">Salvar região</button>
        </form>

        <form onSubmit={handleCreatePrice} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
          <p className="text-sm font-bold text-[var(--eixo-text)]">Cadastrar cotação</p>
          <select className="mt-3 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" value={priceForm.productType} onChange={(e) => setPriceForm((prev) => ({ ...prev, productType: e.target.value }))}>{PRODUCT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" value={priceForm.regionId} onChange={(e) => setPriceForm((prev) => ({ ...prev, regionId: e.target.value }))}><option value="">Selecione a região</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name} / {region.state}</option>)}</select>
          <select className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" value={priceForm.sourceId} onChange={(e) => setPriceForm((prev) => ({ ...prev, sourceId: e.target.value }))}><option value="">Selecione a fonte</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
          <input className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="Preço" type="number" step="0.01" min="0.01" value={priceForm.price} onChange={(e) => setPriceForm((prev) => ({ ...prev, price: e.target.value }))} />
          <select className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" value={priceForm.unit} onChange={(e) => setPriceForm((prev) => ({ ...prev, unit: e.target.value }))}>{UNIT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" value={priceForm.paymentType} onChange={(e) => setPriceForm((prev) => ({ ...prev, paymentType: e.target.value }))}>{PAYMENT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <input className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" type="date" value={priceForm.referenceDate} onChange={(e) => setPriceForm((prev) => ({ ...prev, referenceDate: e.target.value }))} />
          <input className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="Peso estimado (@)" type="number" step="0.1" min="0.1" value={priceForm.referenceWeightArrobas} onChange={(e) => setPriceForm((prev) => ({ ...prev, referenceWeightArrobas: e.target.value }))} />
          <select className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" value={priceForm.status} onChange={(e) => setPriceForm((prev) => ({ ...prev, status: e.target.value }))}>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <textarea className="mt-2 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm" placeholder="Observação (opcional)" value={priceForm.notes} onChange={(e) => setPriceForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <button type="submit" className="mt-3 w-full rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-semibold text-[#1a1a1a]">Salvar cotação</button>
        </form>
      </div>

      <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab('published')} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'published' ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>Cotações publicadas</button>
          <button type="button" onClick={() => setActiveTab('raw')} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'raw' ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>Capturas brutas</button>
          <button type="button" onClick={() => setActiveTab('normalized')} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'normalized' ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'}`}>Normalizadas / Revisão</button>
        </div>

        {activeTab === 'published' && (
          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[var(--eixo-text-muted)]">
                  <th className="px-2 py-2">Data</th><th className="px-2 py-2">Produto</th><th className="px-2 py-2">Região</th><th className="px-2 py-2">Preço</th><th className="px-2 py-2">Unidade</th><th className="px-2 py-2">Peso @</th><th className="px-2 py-2">Fonte</th><th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((price) => (
                  <tr key={price.id} className="border-t border-[var(--eixo-border)]">
                    <td className="px-2 py-2">{fmtDate(price.referenceDate)}</td>
                    <td className="px-2 py-2">{price.productType}</td>
                    <td className="px-2 py-2">{price.region?.name || '—'} / {price.region?.state || '—'}</td>
                    <td className="px-2 py-2">{fmtMoney(price.price)}</td>
                    <td className="px-2 py-2">{price.unit}</td>
                    <td className="px-2 py-2">{price.referenceWeightArrobas ?? '—'}</td>
                    <td className="px-2 py-2">{price.source?.name || '—'}</td>
                    <td className="px-2 py-2">{price.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-[var(--eixo-text-muted)]">Jobs recentes: {jobs.length}</div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--eixo-text-muted)]">
                    <th className="px-2 py-2">Capturado em</th><th className="px-2 py-2">Referência</th><th className="px-2 py-2">Fonte</th><th className="px-2 py-2">Método</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Título</th>
                  </tr>
                </thead>
                <tbody>
                  {rawCaptures.map((capture) => (
                    <tr key={capture.id} className="border-t border-[var(--eixo-border)]">
                      <td className="px-2 py-2">{capture.capturedAt ? new Date(capture.capturedAt).toLocaleString('pt-BR') : '—'}</td>
                      <td className="px-2 py-2">{fmtDate(capture.referenceDate)}</td>
                      <td className="px-2 py-2">{capture.source?.name || '—'}</td>
                      <td className="px-2 py-2">{capture.captureMethod}</td>
                      <td className="px-2 py-2">{capture.status}</td>
                      <td className="px-2 py-2">{capture.rawTitle || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'normalized' && (
          <div className="mt-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[var(--eixo-text-muted)]">
                  <th className="px-2 py-2">Data</th><th className="px-2 py-2">Produto</th><th className="px-2 py-2">Região</th><th className="px-2 py-2">Preço</th><th className="px-2 py-2">Score</th><th className="px-2 py-2">Validação</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {normalizedPrices.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--eixo-border)]">
                    <td className="px-2 py-2">{fmtDate(item.referenceDate)}</td>
                    <td className="px-2 py-2">{item.productType}</td>
                    <td className="px-2 py-2">{item.region?.name || '—'} / {item.region?.state || '—'}</td>
                    <td className="px-2 py-2">{fmtMoney(item.price)}</td>
                    <td className="px-2 py-2">{item.confidenceScore}</td>
                    <td className="px-2 py-2">{item.validationStatus}</td>
                    <td className="px-2 py-2">{item.status}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handlePublishNormalized(item.id)} className="rounded-lg bg-[var(--eixo-green)] px-2 py-1 text-xs font-semibold text-[#1a1a1a]">Publicar</button>
                        <button type="button" onClick={() => handleRejectNormalized(item.id)} className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-xs text-[var(--eixo-text-muted)]">Rejeitar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Execuções de pipeline</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {jobs.slice(0, 6).map((job) => (
            <div key={job.id} className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3">
              <p className="text-xs text-[var(--eixo-text-muted)]">{new Date(job.createdAt).toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--eixo-text)]">{job.status} • {job.sourceName || 'Sem fonte'}</p>
              <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">{job.errorMessage || JSON.stringify(job.summary || {})}</p>
            </div>
          ))}
          {!jobs.length && !loading && <p className="text-sm text-[var(--eixo-text-soft)]">Nenhum job executado ainda.</p>}
        </div>
      </div>
    </div>
  );
};

export default MarketAdmin;
