import React, { useEffect, useState } from 'react';
import { AnalyticsDimension, AnalyticsReport, getAnalyticsReport } from '../../adapters/financialApi';
import { formatCurrency } from '../financeUtils';

const AnalyticsTab: React.FC<{ farmId: string; year: number }> = ({ farmId, year }) => {
    const [dimension, setDimension] = useState<AnalyticsDimension>('LOT');
    const [compareFarms, setCompareFarms] = useState(false);
    const [report, setReport] = useState<AnalyticsReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { setError(null); getAnalyticsReport(compareFarms ? undefined : farmId, year, compareFarms ? 'FARM' : dimension).then(setReport).catch((e) => setError(e.message)); }, [farmId, year, dimension, compareFarms]);
    return <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><select value={dimension} disabled={compareFarms} onChange={(e) => setDimension(e.target.value as AnalyticsDimension)} className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm disabled:opacity-50"><option value="FARM">Fazenda</option><option value="LOT">Lote</option><option value="PADDOCK">Pasto</option><option value="PRODUCTION_PHASE">Fase produtiva</option></select><button type="button" onClick={() => setCompareFarms((value) => !value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${compareFarms ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'border-[var(--eixo-border)]'}`}>Comparar fazendas</button></div>
        {error && <p className="text-sm text-[var(--eixo-danger)]">{error}</p>}
        <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
            {report?.items.length ? report.items.map((item) => <div key={item.key} className="grid grid-cols-2 gap-2 border-b border-[var(--eixo-border)] px-5 py-4 md:grid-cols-5"><div><strong>{item.label}</strong>{item.topCategories.length > 0 && <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Mais pesaram: {item.topCategories.map((category) => category.name).join(', ')}</p>}</div><span>Receita: {formatCurrency(item.revenue)}</span><span>Custos: {formatCurrency(item.productionCost)}</span><span>Despesas: {formatCurrency(item.operatingExpense)}</span><div><strong>Margem identificada: {formatCurrency(item.margin)}</strong>{dimension === 'LOT' && <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{item.costPerArroba != null ? `Custo direto/@: ${formatCurrency(item.costPerArroba)}` : `Custo/@ indisponível: ${(item.costPerArrobaMissing || []).join(', ')}`}</p>}{dimension === 'PADDOCK' && <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{item.costPerHeadDay != null ? `Custo/cabeça/dia: ${formatCurrency(item.costPerHeadDay)}` : `Custo/cabeça/dia indisponível: ${item.costPerHeadDayMissing}`}</p>}</div></div>) : <p className="p-6 text-sm text-[var(--eixo-text-muted)]">Sem dados atribuídos para esta leitura.</p>}
        </div>
        {report && <p className="text-sm text-[var(--eixo-text-muted)]">Cobertura dos destinos: {report.allocationCoveragePercent.toFixed(1)}%. Não atribuído: {formatCurrency(report.unallocatedAmount)}. {report.metricNotice}</p>}
    </div>;
};
export default AnalyticsTab;
