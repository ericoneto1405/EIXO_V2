import React, { useState } from 'react';
import { ApplyReadingInput, DocumentExtraction } from '../../adapters/auctionApi';

interface Props {
  extraction: DocumentExtraction;
  redacted: Record<string, number>;
  hasPurchase: boolean;
  busy: boolean;
  onApply: (input: ApplyReadingInput) => void;
  onCancel: () => void;
}

const inputClass = 'w-full rounded-lg border border-[var(--eixo-border)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--eixo-green)]';
const label = 'block text-xs font-semibold text-[var(--eixo-text-soft)]';

const Line: React.FC<{ name: string; value: string | number | null }> = ({ name, value }) => (
  <p className="text-sm"><span className="text-[var(--eixo-text-soft)]">{name}:</span> {value ?? '—'}</p>
);

// O criador confere e corrige tudo antes de salvar; nada da IA entra direto.
const DocumentReadingReview: React.FC<Props> = ({ extraction, redacted, hasPurchase, busy, onApply, onCancel }) => {
  const { animal, leilao } = extraction;
  const [partners, setPartners] = useState(extraction.socios.map((s) => ({
    name: s.nome, sharePct: s.percentual !== null ? String(s.percentual) : '', isOwnFarm: false, include: true,
  })));
  const [useValuation, setUseValuation] = useState(Boolean(leilao.valorTotal));
  const [valuation, setValuation] = useState({ date: leilao.data || '', value: leilao.valorTotal ? String(leilao.valorTotal) : '' });
  const [usePurchase, setUsePurchase] = useState(!hasPurchase && Boolean(leilao.valorTotal));
  const [purchase, setPurchase] = useState({
    date: leilao.data || '',
    value: leilao.valorTotal ? String(leilao.valorTotal) : '',
    origem: [leilao.nome, leilao.leiloeira].filter(Boolean).join(' · '),
  });

  const redactedTotal = Object.values(redacted).reduce<number>((a, b) => a + Number(b), 0);
  const selectedSum = partners.filter((p) => p.include).reduce((sum, p) => sum + (Number(p.sharePct) || 0), 0);

  const submit = () => {
    onApply({
      partners: partners.filter((p) => p.include && p.name.trim()).map((p) => ({
        name: p.name.trim(), sharePct: Number(p.sharePct), isOwnFarm: p.isOwnFarm,
      })),
      valuation: useValuation && Number(valuation.value) > 0
        ? { date: valuation.date, value: Number(valuation.value), notes: [leilao.nome, animal.lote ? `lote ${animal.lote}` : null].filter(Boolean).join(' · ') }
        : undefined,
      purchase: usePurchase && !hasPurchase ? { date: purchase.date, value: Number(purchase.value), origem: purchase.origem } : undefined,
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border-2 border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-[var(--eixo-text)]">Confira o que a IA encontrou</h4>
        {redactedTotal > 0 && <span className="text-xs text-[var(--eixo-text-muted)]">{redactedTotal} dado(s) pessoal(is) escondido(s) antes do envio</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-white p-3">
          <p className="mb-1 text-xs font-bold uppercase text-[var(--eixo-text-soft)]">Animal no documento</p>
          <Line name="Nome" value={animal.nome} />
          <Line name="Registro" value={animal.registro} />
          <Line name="Raça / sexo" value={[animal.raca, animal.sexo === 'FEMEA' ? 'Fêmea' : animal.sexo === 'MACHO' ? 'Macho' : null].filter(Boolean).join(' · ') || null} />
          <Line name="Pai / mãe" value={[animal.pai, animal.mae].filter(Boolean).join(' × ') || null} />
          <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Se não for este animal, cancele.</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="mb-1 text-xs font-bold uppercase text-[var(--eixo-text-soft)]">Leilão</p>
          <Line name="Leilão" value={[leilao.nome, leilao.leiloeira].filter(Boolean).join(' · ') || null} />
          <Line name="Data" value={leilao.data ? new Date(`${leilao.data}T12:00:00`).toLocaleDateString('pt-BR') : null} />
          <Line name="Valor" value={leilao.valorTotal !== null ? leilao.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null} />
          <Line name="Parcelas" value={leilao.parcelas ? `${leilao.parcelas}x${leilao.valorParcela ? ` de ${leilao.valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}` : null} />
          <Line name="Comissão" value={leilao.comissaoPct !== null ? `${leilao.comissaoPct}%` : null} />
          <Line name="% comprado" value={leilao.percentualAdquirido !== null ? `${leilao.percentualAdquirido}%` : null} />
        </div>
      </div>

      {extraction.observacoes && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">IA: {extraction.observacoes}</p>}

      <div className="rounded-xl bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-[var(--eixo-text-soft)]">Sócios</p>
          <span className="text-xs text-[var(--eixo-text-muted)]">Selecionados: {selectedSum.toLocaleString('pt-BR')}%</span>
        </div>
        {partners.length === 0 && <p className="text-sm text-[var(--eixo-text-soft)]">Nenhum sócio encontrado.</p>}
        {partners.map((p, i) => (
          <div key={i} className="mb-2 grid grid-cols-[auto_2fr_1fr_auto] items-center gap-2">
            <input type="checkbox" checked={p.include} onChange={(e) => setPartners((rows) => rows.map((r, j) => j === i ? { ...r, include: e.target.checked } : r))} aria-label="Incluir" />
            <input className={inputClass} value={p.name} onChange={(e) => setPartners((rows) => rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
            <input className={inputClass} type="number" min="0.01" max="100" step="0.01" placeholder="%" value={p.sharePct} onChange={(e) => setPartners((rows) => rows.map((r, j) => j === i ? { ...r, sharePct: e.target.value } : r))} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.isOwnFarm} onChange={(e) => setPartners((rows) => rows.map((r, j) => j === i ? { ...r, isOwnFarm: e.target.checked } : r))} />minha fazenda</label>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--eixo-text-muted)]">Valores abaixo são do animal inteiro (100%). A sua parte é calculada pela cota.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-xl bg-white p-3">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={useValuation} onChange={(e) => setUseValuation(e.target.checked)} />Registrar valor do leilão em "Quanto vale"</label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Data<input className={inputClass} type="date" value={valuation.date} onChange={(e) => setValuation((v) => ({ ...v, date: e.target.value }))} /></label>
            <label className={label}>Valor (R$)<input className={inputClass} type="number" min="1" value={valuation.value} onChange={(e) => setValuation((v) => ({ ...v, value: e.target.value }))} /></label>
          </div>
        </div>
        <div className="space-y-2 rounded-xl bg-white p-3">
          {hasPurchase ? (
            <p className="text-sm text-[var(--eixo-text-soft)]">Este animal já tem compra no Rebanho; não será criada outra.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={usePurchase} onChange={(e) => setUsePurchase(e.target.checked)} />Registrar a compra no Rebanho</label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Data<input className={inputClass} type="date" value={purchase.date} onChange={(e) => setPurchase((v) => ({ ...v, date: e.target.value }))} /></label>
                <label className={label}>Valor (R$)<input className={inputClass} type="number" min="1" value={purchase.value} onChange={(e) => setPurchase((v) => ({ ...v, value: e.target.value }))} /></label>
              </div>
              <label className={label}>Origem<input className={inputClass} value={purchase.origem} onChange={(e) => setPurchase((v) => ({ ...v, origem: e.target.value }))} /></label>
              <p className="text-xs text-[var(--eixo-text-muted)]">As parcelas a pagar continuam sendo lançadas no Financeiro.</p>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-[var(--eixo-border)] bg-white px-4 py-2 text-sm font-semibold" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button
          type="button"
          className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-bold text-[#1a1a1a] disabled:opacity-60"
          onClick={submit}
          disabled={busy || (usePurchase && !hasPurchase && (!purchase.date || !(Number(purchase.value) > 0)))}
        >
          {busy ? 'Salvando…' : 'Confirmar e salvar'}
        </button>
      </div>
    </div>
  );
};

export default DocumentReadingReview;
