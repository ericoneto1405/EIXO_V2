import { useFinancialReport } from './useFinancialReport';
import React from 'react';
import { DataQualityReport, getDataQualityReport } from '../../adapters/financialApi';
import { formatCurrency } from '../financeUtils';

const DataQualityTab: React.FC<{ farmId: string; onOpenCategories: () => void; onOpenAccounts: () => void }> = ({ farmId, onOpenCategories, onOpenAccounts }) => {
    const { report, error, retry } = useFinancialReport<DataQualityReport>(farmId, () => getDataQualityReport(farmId));
    if (error) return <div role="alert" className="text-sm text-(--eixo-danger)">{error} <button type="button" onClick={retry} className="underline">Tentar novamente</button></div>;
    if (!report) return <p className="text-sm text-(--eixo-text-muted)">Verificando qualidade...</p>;
    const items = [['Categorias não configuradas', report.unconfiguredCategories], ['Lotes sem fase', report.lotsWithoutPhase], ['Animais sem custo de aquisição', report.animalsWithoutAcquisitionCost], ['Animais sem duas pesagens válidas', report.animalsWithoutSufficientWeighings]] as const;
    return <div className="space-y-4"><div className={`rounded-2xl p-5 ${report.reliable ? 'bg-(--eixo-green-soft)' : 'bg-[rgba(197,138,32,0.10)]'}`}><strong>{report.reliable ? 'Base configurada' : 'Há dados que precisam de atenção'}</strong><p className="mt-1 text-sm">Cobertura dos destinos: {report.allocationCoveragePercent.toFixed(1)}%.</p></div><p className="text-sm text-(--eixo-text-muted)">Diagnóstico de toda a base da fazenda, sem filtro de ano. Lotes e animais devem ser regularizados em Manejo do Rebanho; a distribuição de custos é conferida ao criar lançamentos.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={onOpenCategories} className="rounded-xl border border-(--eixo-border) px-3 py-2 text-sm font-semibold">Revisar categorias</button><button type="button" onClick={onOpenAccounts} className="rounded-xl border border-(--eixo-border) px-3 py-2 text-sm font-semibold">Revisar contas</button></div><div className="grid gap-3 md:grid-cols-2">{items.map(([label, value]) => <div key={label} className="rounded-2xl border border-(--eixo-border) bg-(--eixo-surface) p-5"><p className="text-sm text-(--eixo-text-muted)">{label}</p><strong className="text-2xl">{value}</strong></div>)}<div className="rounded-2xl border border-(--eixo-border) bg-(--eixo-surface) p-5"><p className="text-sm text-(--eixo-text-muted)">Custos sem destino</p><strong className="text-2xl">{formatCurrency(report.unallocatedAmount)}</strong></div></div></div>;
};
export default DataQualityTab;
