import React, { useEffect, useMemo, useState } from 'react';
import {
  AnimalDocumentType,
  AnimalValuationSource,
  AuctionAnimalDetail,
  AuctionMoneySummary,
  AuctionPlantel,
  addPartner,
  addValuation,
  applyReading,
  DocumentExtraction,
  getReaderStatus,
  readDocumentWithAI,
  documentFileUrl,
  getAuctionAnimal,
  getPlantel,
  removeAnimalDocument,
  removePartner,
  removeValuation,
  saveAnimalVideo,
  uploadAnimalDocument,
} from '../adapters/auctionApi';
import { HerdAnimal, listAnimals } from '../adapters/herdApi';
import DocumentReadingReview from './meusLeiloes/DocumentReadingReview';

interface MeusLeiloesProps {
  farmId?: string | null;
  farmName?: string | null;
}

type DetailTab = 'socios' | 'documentos' | 'dinheiro' | 'genetica';

const DOCUMENT_LABELS: Record<AnimalDocumentType, string> = {
  REGISTRO_ABCZ: 'Registro ABCZ',
  CONTRATO: 'Contrato de compra/venda',
  NOTA: 'Nota do leilão',
  CATALOGO: 'Catálogo',
  EXAME: 'Exame',
  OUTRO: 'Outro',
};

const VALUATION_LABELS: Record<AnimalValuationSource, string> = {
  LEILAO: 'Leilão',
  AVALIACAO: 'Avaliação',
  OFERTA: 'Oferta recebida',
};

const TAB_LABELS: Record<DetailTab, string> = {
  socios: 'Sócios',
  documentos: 'Documentos',
  dinheiro: 'Dinheiro',
  genetica: 'Genética',
};

const inputClass = 'w-full rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-2 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const primaryBtn = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-bold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:opacity-60';
const ghostBtn = 'rounded-xl border border-[var(--eixo-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]';
const dangerLink = 'text-xs font-semibold text-[var(--eixo-danger)] hover:underline';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-white p-4';

const brl = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');
const today = () => new Date().toISOString().slice(0, 10);
const animalLabel = (a: { nome?: string | null; brinco?: string | null }) => [a.nome, a.brinco].filter(Boolean).join(' · ') || 'Sem identificação';
const resultTone = (value: number) => (value >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]');

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-xs font-semibold text-[var(--eixo-text-soft)]">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const Stat: React.FC<{ label: string; value: string; tone?: string; hint?: string }> = ({ label, value, tone, hint }) => (
  <div className={cardClass}>
    <p className="text-xs font-semibold text-[var(--eixo-text-soft)]">{label}</p>
    <p className={`mt-1 text-xl font-bold tabular-nums ${tone || 'text-[var(--eixo-text)]'}`}>{value}</p>
    {hint && <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{hint}</p>}
  </div>
);

const MoneyCards: React.FC<{ money: AuctionMoneySummary }> = ({ money }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    <Stat label="Investido" value={brl(money.invested)} hint={`Compra ${brl(money.purchase)} + gastos ${brl(money.expenses)}`} />
    <Stat label={money.sales > 0 ? 'Vendido por' : 'Vale hoje'} value={brl(money.sales > 0 ? money.sales : money.currentValue)} />
    <Stat label="Receitas" value={brl(money.revenues)} hint="Vendas, sêmen, embriões, prenhezes" />
    <Stat
      label={`Resultado (sua parte ${money.ownSharePct}%)`}
      value={brl(money.ownResult)}
      tone={resultTone(money.ownResult)}
      hint={money.returnPct !== null ? `Retorno do animal: ${money.returnPct.toLocaleString('pt-BR')}%` : undefined}
    />
  </div>
);

const MeusLeiloes: React.FC<MeusLeiloesProps> = ({ farmId, farmName }) => {
  const [plantel, setPlantel] = useState<AuctionPlantel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuctionAnimalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<DetailTab>('socios');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [farmAnimals, setFarmAnimals] = useState<HerdAnimal[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');

  const [partnerForm, setPartnerForm] = useState({ name: '', sharePct: '', isOwnFarm: false, phone: '', since: '' });
  const [docForm, setDocForm] = useState<{ type: AnimalDocumentType; title: string; file: File | null }>({ type: 'REGISTRO_ABCZ', title: '', file: null });
  const [valuationForm, setValuationForm] = useState({ date: today(), value: '', source: 'AVALIACAO' as AnimalValuationSource, notes: '' });
  const [videoInput, setVideoInput] = useState('');
  const [readerEnabled, setReaderEnabled] = useState(false);
  const [readingDocId, setReadingDocId] = useState<string | null>(null);
  const [reading, setReading] = useState<{ extraction: DocumentExtraction; redacted: Record<string, number> } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPlantel = async () => {
    if (!farmId) return;
    setLoading(true);
    setError(null);
    try {
      setPlantel(await getPlantel(farmId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar o plantel.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (animalId: string) => {
    setDetailLoading(true);
    setActionError(null);
    try {
      const data = await getAuctionAnimal(animalId);
      setDetail(data);
      setVideoInput(data.animal.videoUrl || '');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao carregar a ficha.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { setSelectedId(null); setDetail(null); void loadPlantel(); }, [farmId]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); setReading(null); setNotice(null); }, [selectedId]);
  useEffect(() => { getReaderStatus().then((r) => setReaderEnabled(r.enabled)).catch(() => setReaderEnabled(false)); }, []);

  const handleRead = async (documentId: string) => {
    setReadingDocId(documentId);
    setActionError(null);
    setNotice(null);
    setReading(null);
    try {
      setReading(await readDocumentWithAI(documentId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível ler o documento.');
    } finally {
      setReadingDocId(null);
    }
  };

  const openPicker = async () => {
    if (!farmId) return;
    setPickerOpen(true);
    if (!farmAnimals.length) {
      try { setFarmAnimals(await listAnimals(farmId, 'COMMERCIAL')); } catch { setFarmAnimals([]); }
    }
  };

  // Toda ação na ficha recarrega a ficha e a lista, para os totais ficarem certos.
  const runAction = async (action: () => Promise<unknown>) => {
    if (!selectedId) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await Promise.all([loadDetail(selectedId), loadPlantel()]);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = plantel?.items || [];
    if (!term) return items;
    return items.filter((a) => [a.nome, a.brinco, a.registro, a.raca].some((v) => v?.toLowerCase().includes(term)));
  }, [plantel, search]);

  const pickerItems = useMemo(() => {
    const term = pickerSearch.trim().toLowerCase();
    const inPlantel = new Set((plantel?.items || []).map((a) => a.id));
    return farmAnimals
      .filter((a) => !inPlantel.has(a.id))
      .filter((a) => !term || [a.nome, a.brinco, a.identificacao].some((v) => v?.toLowerCase().includes(term)))
      .slice(0, 30);
  }, [farmAnimals, pickerSearch, plantel]);

  const partnerSum = detail?.partners.reduce((sum, p) => sum + p.sharePct, 0) ?? 0;

  if (!farmId) {
    return (
      <div className={`${cardClass} text-sm text-[var(--eixo-text-soft)]`}>
        Selecione uma fazenda para ver o plantel de leilão.
      </div>
    );
  }

  // ── Ficha do animal ─────────────────────────────────────────────────
  if (selectedId) {
    const a = detail?.animal;
    return (
      <div className="space-y-4">
        <button type="button" className={ghostBtn} onClick={() => { setSelectedId(null); setDetail(null); }}>← Voltar ao plantel</button>
        {detailLoading && !detail && <p className="text-sm text-[var(--eixo-text-soft)]">Carregando ficha…</p>}
        {actionError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-[var(--eixo-danger)]">{actionError}</p>}
        {detail && a && (
          <>
            <div className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[var(--eixo-text)]">{animalLabel(a)}</h2>
                  <p className="text-sm text-[var(--eixo-text-soft)]">
                    {[a.raca, a.categoria, a.sexo === 'FEMEA' ? 'Fêmea' : a.sexo ? 'Macho' : null].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                    Registro {a.registro || '—'} · Nasc. {fmtDate(a.dataNascimento)} · Pai {a.paiNome || '—'} · Mãe {a.maeNome || '—'}
                  </p>
                </div>
                {a.registro && (
                  <a className={ghostBtn} href="https://www.abcz.org.br/" target="_blank" rel="noreferrer">Consultar na ABCZ ↗</a>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[240px] flex-1">
                  <Field label="Vídeo do animal (link do YouTube, Drive…)">
                    <input className={inputClass} value={videoInput} onChange={(e) => setVideoInput(e.target.value)} placeholder="https://" />
                  </Field>
                </div>
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => runAction(() => saveAnimalVideo(a.id, videoInput))}>Salvar link</button>
                {a.videoUrl && <a className={ghostBtn} href={a.videoUrl} target="_blank" rel="noreferrer">Assistir ↗</a>}
              </div>
            </div>

            <MoneyCards money={detail.money} />

            <div className="flex flex-wrap gap-2">
              {(Object.keys(TAB_LABELS) as DetailTab[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'border border-[var(--eixo-border)] bg-white text-[var(--eixo-text)]'}`}
                >
                  {TAB_LABELS[key]}
                </button>
              ))}
            </div>

            {tab === 'socios' && (
              <div className={`${cardClass} space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[var(--eixo-text)]">Condomínio</h3>
                  <span className={`text-sm font-semibold ${Math.abs(partnerSum - 100) < 0.01 || !detail.partners.length ? 'text-[var(--eixo-text-soft)]' : 'text-amber-600'}`}>
                    {detail.partners.length ? `Cotas somam ${partnerSum.toLocaleString('pt-BR')}%` : 'Sem sócios: 100% da fazenda'}
                  </span>
                </div>
                {detail.partners.length > 0 && !detail.partners.some((p) => p.isOwnFarm) && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">Nenhuma cota está marcada como "minha fazenda". Sua parte no resultado aparece como 0%.</p>
                )}
                <ul className="divide-y divide-[var(--eixo-border)]">
                  {detail.partners.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-semibold text-[var(--eixo-text)]">{p.name}{p.isOwnFarm && <span className="ml-2 rounded-full bg-[var(--eixo-surface-soft)] px-2 py-0.5 text-xs">minha fazenda</span>}</p>
                        <p className="text-xs text-[var(--eixo-text-muted)]">{[p.phone, p.since ? `desde ${fmtDate(p.since)}` : null].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold tabular-nums">{p.sharePct.toLocaleString('pt-BR')}%</span>
                        <span className="text-xs text-[var(--eixo-text-soft)] tabular-nums">{brl((detail.money.result * p.sharePct) / 100)}</span>
                        <button type="button" className={dangerLink} disabled={busy} onClick={() => runAction(() => removePartner(p.id))}>Remover</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <form
                  className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const ok = await runAction(() => addPartner(a.id, {
                      name: partnerForm.name,
                      sharePct: Number(partnerForm.sharePct),
                      isOwnFarm: partnerForm.isOwnFarm,
                      phone: partnerForm.phone || undefined,
                      since: partnerForm.since || undefined,
                    }));
                    if (ok) setPartnerForm({ name: '', sharePct: '', isOwnFarm: false, phone: '', since: '' });
                  }}
                >
                  <Field label="Nome do sócio">
                    <input className={inputClass} required value={partnerForm.name} onChange={(e) => setPartnerForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Nelore Cascão" />
                  </Field>
                  <Field label="Cota (%)">
                    <input className={inputClass} required type="number" min="0.01" max="100" step="0.01" value={partnerForm.sharePct} onChange={(e) => setPartnerForm((f) => ({ ...f, sharePct: e.target.value }))} />
                  </Field>
                  <Field label="Telefone">
                    <input className={inputClass} value={partnerForm.phone} onChange={(e) => setPartnerForm((f) => ({ ...f, phone: e.target.value }))} />
                  </Field>
                  <Field label="Sócio desde">
                    <input className={inputClass} type="date" value={partnerForm.since} onChange={(e) => setPartnerForm((f) => ({ ...f, since: e.target.value }))} />
                  </Field>
                  <div className="flex flex-col justify-end gap-1">
                    <label className="flex items-center gap-1 text-xs font-semibold text-[var(--eixo-text-soft)]">
                      <input type="checkbox" checked={partnerForm.isOwnFarm} onChange={(e) => setPartnerForm((f) => ({ ...f, isOwnFarm: e.target.checked }))} />
                      Minha fazenda
                    </label>
                    <button type="submit" className={primaryBtn} disabled={busy}>Adicionar</button>
                  </div>
                </form>
                <p className="text-xs text-[var(--eixo-text-muted)]">Despesas e receitas do animal são divididas pela cota de cada sócio.</p>
              </div>
            )}

            {tab === 'documentos' && (
              <div className={`${cardClass} space-y-3`}>
                <h3 className="font-bold text-[var(--eixo-text)]">Documentos</h3>
                {notice && <p className="rounded-xl bg-[var(--eixo-green-soft)] px-3 py-2 text-sm text-[var(--eixo-text)]">{notice}</p>}
                {reading && (
                  <DocumentReadingReview
                    extraction={reading.extraction}
                    redacted={reading.redacted}
                    hasPurchase={detail.trades.some((t) => t.type === 'COMPRA')}
                    busy={busy}
                    onCancel={() => setReading(null)}
                    onApply={async (input) => {
                      let applied: { partners: number; valuation: boolean; purchase: boolean } | null = null;
                      const ok = await runAction(async () => { applied = (await applyReading(a.id, input)).applied; });
                      if (ok && applied) {
                        const r = applied as { partners: number; valuation: boolean; purchase: boolean };
                        setReading(null);
                        setNotice(`Salvo: ${r.partners} sócio(s)${r.valuation ? ', valor do leilão' : ''}${r.purchase ? ', compra no Rebanho' : ''}.`);
                      }
                    }}
                  />
                )}
                <ul className="divide-y divide-[var(--eixo-border)]">
                  {detail.documents.length === 0 && <li className="py-2 text-sm text-[var(--eixo-text-soft)]">Nenhum documento ainda.</li>}
                  {detail.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-semibold text-[var(--eixo-text)]">{d.title || DOCUMENT_LABELS[d.type]}</p>
                        <p className="text-xs text-[var(--eixo-text-muted)]">{DOCUMENT_LABELS[d.type]} · {d.fileName} · {fmtDate(d.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {readerEnabled && d.mimeType === 'application/pdf' && (
                          <button type="button" className={ghostBtn} disabled={busy || readingDocId !== null} onClick={() => handleRead(d.id)}>
                            {readingDocId === d.id ? 'Lendo…' : 'Ler com IA'}
                          </button>
                        )}
                        <a className={ghostBtn} href={documentFileUrl(d.id)} target="_blank" rel="noreferrer">Abrir</a>
                        <button type="button" className={dangerLink} disabled={busy} onClick={() => runAction(() => removeAnimalDocument(d.id))}>Remover</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <form
                  className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!docForm.file) return;
                    const file = docForm.file;
                    const ok = await runAction(() => uploadAnimalDocument(a.id, file, docForm.type, docForm.title || undefined));
                    if (ok) {
                      setDocForm({ type: docForm.type, title: '', file: null });
                      (e.target as HTMLFormElement).reset();
                    }
                  }}
                >
                  <Field label="Tipo">
                    <select className={inputClass} value={docForm.type} onChange={(e) => setDocForm((f) => ({ ...f, type: e.target.value as AnimalDocumentType }))}>
                      {(Object.keys(DOCUMENT_LABELS) as AnimalDocumentType[]).map((key) => <option key={key} value={key}>{DOCUMENT_LABELS[key]}</option>)}
                    </select>
                  </Field>
                  <Field label="Título (opcional)">
                    <input className={inputClass} value={docForm.title} onChange={(e) => setDocForm((f) => ({ ...f, title: e.target.value }))} />
                  </Field>
                  <Field label="Arquivo (PDF ou foto, até 7 MB)">
                    <input className={inputClass} type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDocForm((f) => ({ ...f, file: e.target.files?.[0] || null }))} />
                  </Field>
                  <div className="flex items-end"><button type="submit" className={primaryBtn} disabled={busy || !docForm.file}>{busy ? 'Enviando…' : 'Enviar'}</button></div>
                </form>
              </div>
            )}

            {tab === 'dinheiro' && (
              <div className="space-y-3">
                <div className={`${cardClass} space-y-2`}>
                  <h3 className="font-bold text-[var(--eixo-text)]">Compra e venda</h3>
                  {detail.trades.length === 0 && <p className="text-sm text-[var(--eixo-text-soft)]">Sem compra ou venda registrada no Rebanho.</p>}
                  {detail.trades.map((t) => (
                    <div key={t.id} className="flex justify-between text-sm">
                      <span>{t.type === 'COMPRA' ? 'Compra' : 'Venda'} · {fmtDate(t.date)} {t.origem || t.destino ? `· ${t.origem || t.destino}` : ''}</span>
                      <span className="font-semibold tabular-nums">{brl(t.value)}</span>
                    </div>
                  ))}
                </div>
                <div className={`${cardClass} space-y-2`}>
                  <h3 className="font-bold text-[var(--eixo-text)]">Gastos e receitas</h3>
                  <p className="text-xs text-[var(--eixo-text-muted)]">Vêm do Financeiro. Ao lançar, use "Dividir entre destinos" e escolha este animal.</p>
                  {detail.entries.length === 0 && <p className="text-sm text-[var(--eixo-text-soft)]">Nenhum lançamento ligado a este animal.</p>}
                  {detail.entries.map((en) => (
                    <div key={en.id} className="flex justify-between text-sm">
                      <span>{fmtDate(en.date)} · {en.description || (en.kind === 'RECEITA' ? 'Receita' : 'Despesa')}</span>
                      <span className={`font-semibold tabular-nums ${en.kind === 'RECEITA' ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                        {en.kind === 'RECEITA' ? '+' : '−'} {brl(en.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={`${cardClass} space-y-3`}>
                  <h3 className="font-bold text-[var(--eixo-text)]">Quanto vale</h3>
                  {detail.valuations.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-sm">
                      <span>{fmtDate(v.date)} · {VALUATION_LABELS[v.source]}{v.notes ? ` · ${v.notes}` : ''}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">{brl(v.value)}</span>
                        <button type="button" className={dangerLink} disabled={busy} onClick={() => runAction(() => removeValuation(v.id))}>Remover</button>
                      </span>
                    </div>
                  ))}
                  <form
                    className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_2fr_auto]"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await runAction(() => addValuation(a.id, {
                        date: valuationForm.date,
                        value: Number(valuationForm.value),
                        source: valuationForm.source,
                        notes: valuationForm.notes || undefined,
                      }));
                      if (ok) setValuationForm({ date: today(), value: '', source: 'AVALIACAO', notes: '' });
                    }}
                  >
                    <Field label="Data"><input className={inputClass} type="date" required value={valuationForm.date} onChange={(e) => setValuationForm((f) => ({ ...f, date: e.target.value }))} /></Field>
                    <Field label="Valor (R$)"><input className={inputClass} type="number" min="1" step="0.01" required value={valuationForm.value} onChange={(e) => setValuationForm((f) => ({ ...f, value: e.target.value }))} /></Field>
                    <Field label="Origem">
                      <select className={inputClass} value={valuationForm.source} onChange={(e) => setValuationForm((f) => ({ ...f, source: e.target.value as AnimalValuationSource }))}>
                        {(Object.keys(VALUATION_LABELS) as AnimalValuationSource[]).map((key) => <option key={key} value={key}>{VALUATION_LABELS[key]}</option>)}
                      </select>
                    </Field>
                    <Field label="Observação"><input className={inputClass} value={valuationForm.notes} onChange={(e) => setValuationForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Ex.: lance máximo no leilão X" /></Field>
                    <div className="flex items-end"><button type="submit" className={primaryBtn} disabled={busy}>Registrar</button></div>
                  </form>
                </div>
              </div>
            )}

            {tab === 'genetica' && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className={cardClass}>
                  <h3 className="font-bold text-[var(--eixo-text)]">Sêmen</h3>
                  {detail.genetics.semenBatches.length === 0 && <p className="mt-2 text-sm text-[var(--eixo-text-soft)]">Nenhum lote no botijão.</p>}
                  {detail.genetics.semenBatches.map((s) => <p key={s.id} className="mt-2 text-sm">Lote {s.lote}: {s.dosesDisponiveis}/{s.dosesTotal} doses</p>)}
                </div>
                <div className={cardClass}>
                  <h3 className="font-bold text-[var(--eixo-text)]">Aspirações e embriões</h3>
                  {detail.genetics.embryoBatches.length === 0 && <p className="mt-2 text-sm text-[var(--eixo-text-soft)]">Nenhum lote de embrião como doadora.</p>}
                  {detail.genetics.embryoBatches.map((b) => <p key={b.id} className="mt-2 text-sm">{b.tecnica} · lote {b.lote}: {b.quantidadeDisponivel}/{b.quantidadeTotal}</p>)}
                </div>
                <div className={cardClass}>
                  <h3 className="font-bold text-[var(--eixo-text)]">Reprodução e prenhezes</h3>
                  {detail.genetics.reproEvents.length === 0 && <p className="mt-2 text-sm text-[var(--eixo-text-soft)]">Nenhum evento reprodutivo.</p>}
                  {detail.genetics.reproEvents.map((r) => <p key={r.id} className="mt-2 text-sm">{fmtDate(r.date)} · {r.type.replace(/_/g, ' ').toLowerCase()}</p>)}
                </div>
                <p className="text-xs text-[var(--eixo-text-muted)] md:col-span-3">Esses dados vêm da Reprodução e do Botijão de Sêmen. Nada é digitado duas vezes.</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Lista do plantel ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--eixo-text)]">Meus Leilões</h1>
          <p className="text-sm text-[var(--eixo-text-soft)]">Patrimônio, sócios e documentos do plantel{farmName ? ` · ${farmName}` : ''}. Sem taxa por animal, de qualquer leiloeira.</p>
        </div>
        <button type="button" className={primaryBtn} onClick={openPicker}>+ Colocar animal no plantel</button>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-[var(--eixo-danger)]">{error}</p>}

      {plantel && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Animais no plantel" value={String(plantel.totals.animals)} />
          <Stat label="Investido (sua parte)" value={brl(plantel.totals.invested)} />
          <Stat label="Vale hoje (sua parte)" value={brl(plantel.totals.currentValue)} />
          <Stat label="Resultado (sua parte)" value={brl(plantel.totals.result)} tone={resultTone(plantel.totals.result)} />
        </div>
      )}

      {pickerOpen && (
        <div className={`${cardClass} space-y-2`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[var(--eixo-text)]">Escolha um animal do Rebanho</h3>
            <button type="button" className={ghostBtn} onClick={() => setPickerOpen(false)}>Fechar</button>
          </div>
          <p className="text-xs text-[var(--eixo-text-muted)]">Animais com registro (P.O.) já aparecem sozinhos. Animal novo entra primeiro pelo Manejo do Rebanho.</p>
          <input className={inputClass} placeholder="Buscar por nome ou identificação" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
          <div className="max-h-64 divide-y divide-[var(--eixo-border)] overflow-y-auto">
            {pickerItems.length === 0 && <p className="py-2 text-sm text-[var(--eixo-text-soft)]">Nenhum animal encontrado.</p>}
            {pickerItems.map((an) => (
              <button
                key={an.id}
                type="button"
                className="block w-full py-2 text-left text-sm hover:bg-[var(--eixo-surface-soft)]"
                onClick={() => { setPickerOpen(false); setTab('socios'); setSelectedId(an.id); }}
              >
                {animalLabel({ nome: an.nome, brinco: an.brinco || an.identificacao })} <span className="text-xs text-[var(--eixo-text-muted)]">{an.raca}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <input className={inputClass} placeholder="Buscar no plantel por nome, identificação, registro ou raça" value={search} onChange={(e) => setSearch(e.target.value)} />

      {loading && !plantel && <p className="text-sm text-[var(--eixo-text-soft)]">Carregando plantel…</p>}

      {plantel && filteredItems.length === 0 && (
        <div className={`${cardClass} text-sm text-[var(--eixo-text-soft)]`}>
          {plantel.items.length === 0
            ? 'Nenhum animal no plantel ainda. Animais com registro (P.O.) aparecem aqui sozinhos; os outros entram quando você adiciona um sócio, documento ou avaliação.'
            : 'Nenhum animal com esse filtro.'}
        </div>
      )}

      {filteredItems.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--eixo-border)] bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--eixo-surface-soft)] text-left text-xs text-[var(--eixo-text-soft)]">
              <tr>
                <th className="px-3 py-2">Animal</th>
                <th className="px-3 py-2">Registro</th>
                <th className="px-3 py-2 text-right">Investido</th>
                <th className="px-3 py-2 text-right">Vale hoje</th>
                <th className="px-3 py-2 text-right">Resultado (sua parte)</th>
                <th className="px-3 py-2 text-center">Sócios</th>
                <th className="px-3 py-2 text-center">Docs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--eixo-border)]">
              {filteredItems.map((item) => (
                <tr key={item.id} className="cursor-pointer hover:bg-[var(--eixo-surface-soft)]" onClick={() => { setTab('socios'); setSelectedId(item.id); }}>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-[var(--eixo-text)]">{animalLabel(item)}{item.hasVideo && <span className="ml-1" title="Tem vídeo">▶</span>}</p>
                    <p className="text-xs text-[var(--eixo-text-muted)]">{[item.raca, item.categoria, item.status !== 'VIVO' ? item.status.toLowerCase() : null].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-3 py-2">{item.registro || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(item.money.invested)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(item.money.sales > 0 ? item.money.sales : item.money.currentValue)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${resultTone(item.money.ownResult)}`}>{brl(item.money.ownResult)}</td>
                  <td className="px-3 py-2 text-center">{item.partnersCount || '—'}</td>
                  <td className="px-3 py-2 text-center">{item.documentsCount || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MeusLeiloes;
