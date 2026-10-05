import { useFinancialReport } from './useFinancialReport';
import React, { useState } from 'react';
import { AnalyticsDimension, AnalyticsReport, getAnalyticsReport } from '../../adapters/financialApi';
import { formatCurrency } from '../financeUtils';

const AnalyticsTab: React.FC<{ farmId: string; year: number; anos: number[]; onYearChange: (year: number) => void }> = ({ farmId, year, anos, onYearChange }) => {
    const [dimension, setDimension] = useState<AnalyticsDimension>('LOT');
    const [compareFarms, setCompareFarms] = useState(false);
    const { report, error, retry } = useFinancialReport<AnalyticsReport>(JSON.stringify([farmId, year, dimension, compareFarms]), () => getAnalyticsReport(compareFarms ? undefined : farmId, year, compareFarms ? 'FARM' : dimension));
    return <div className="space-y-4">
        <div className="flex flex-wrap gap-2"><select aria-label="Ano dos custos e margens" value={year} onChange={(e) => onYearChange(Number(e.target.value))} className="rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm">{anos.map((ano) => <option key={ano}>{ano}</option>)}</select><select aria-label="Agrupar custos por" value={dimension} disabled={compareFarms} onChange={(e) => setDimension(e.target.value as AnalyticsDimension)} className="rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm disabled:opacity-50"><option value="FARM">Fazenda</option><option value="LOT">Lote</option><option value="PADDOCK">Pasto</option><option value="PRODUCTION_PHASE">Fase produtiva</option></select><button type="button" aria-pressed={compareFarms} onClick={() => setCompareFarms((value) => !value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${compareFarms ? 'bg-(--eixo-green) text-[#1a1a1a]' : 'border-(--eixo-border)'}`}>Comparar fazendas</button></div>
        <p className="text-sm text-(--eixo-text-muted)">{year} · {compareFarms ? 'Comparação entre fazendas' : 'Fazenda selecionada'} · Valores por competência.</p>
        {error && <div role="alert" className="text-sm text-(--eixo-danger)">{error} <button type="button" onClick={retry} className="underline">Tentar novamente</button></div>}
        <div className="overflow-hidden rounded-2xl border border-(--eixo-border) bg-(--eixo-surface)">
            {!report ? <p role="status" className="p-6 text-sm text-(--eixo-text-muted)">{error ? 'Dados indisponíveis.' : 'Carregando custos e margens...'}</p> : report.items.length ? report.items.map((item) => <div key={item.key} className="grid grid-cols-2 gap-2 border-b border-(--eixo-border) px-5 py-4 md:grid-cols-5"><div><strong>{item.label}</strong>{item.topCategories.length > 0 && <p className="mt-1 text-xs text-(--eixo-text-muted)">Mais pesaram: {item.topCategories.map((category) => category.name).join(', ')}</p>}</div><span>Receita: {formatCurrency(item.revenue)}</span><span>Custos: {formatCurrency(item.productionCost)}</span><span>Despesas: {formatCurrency(item.operatingExpense)}</span><div><strong>Margem identificada: {formatCurrency(item.margin)}</strong>{!compareFarms && dimension === 'LOT' && <p className="mt-1 text-xs text-(--eixo-text-muted)">{item.costPerArroba != null ? `Custo direto/@: ${formatCurrency(item.costPerArroba)}` : `Custo/@ indisponível: ${(item.costPerArrobaMissing || []).join(', ')}`}</p>}{!compareFarms && dimension === 'PADDOCK' && <p className="mt-1 text-xs text-(--eixo-text-muted)">{item.costPerHeadDay != null ? `Custo/cabeça/dia: ${formatCurrency(item.costPerHeadDay)}` : `Custo/cabeça/dia indisponível: ${item.costPerHeadDayMissing}`}</p>}</div></div>) : <p className="p-6 text-sm text-(--eixo-text-muted)">Sem dados atribuídos para esta leitura.</p>}
        </div>
        {report && <p className="text-sm text-(--eixo-text-muted)">Cobertura dos destinos: {report.allocationCoveragePercent.toFixed(1)}%. Não atribuído: {formatCurrency(report.unallocatedAmount)}. {report.metricNotice}</p>}
    </div>;
};
export default AnalyticsTab;
