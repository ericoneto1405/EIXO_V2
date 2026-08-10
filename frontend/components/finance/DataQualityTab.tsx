import React, { useEffect, useState } from 'react';
import { DataQualityReport, getDataQualityReport } from '../../adapters/financialApi';
import { formatCurrency } from '../financeUtils';

const DataQualityTab: React.FC<{ farmId: string }> = ({ farmId }) => {
    const [report, setReport] = useState<DataQualityReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { getDataQualityReport(farmId).then(setReport).catch((e) => setError(e.message)); }, [farmId]);
    if (error) return <p className="text-sm text-[var(--eixo-danger)]">{error}</p>;
    if (!report) return <p className="text-sm text-[var(--eixo-text-muted)]">Verificando qualidade...</p>;
    const items = [['Categorias não configuradas', report.unconfiguredCategories], ['Lotes sem fase', report.lotsWithoutPhase], ['Animais sem custo de aquisição', report.animalsWithoutAcquisitionCost], ['Animais sem duas pesagens válidas', report.animalsWithoutSufficientWeighings]] as const;
    return <div className="space-y-4"><div className={`rounded-2xl p-5 ${report.reliable ? 'bg-[var(--eixo-green-soft)]' : 'bg-[rgba(197,138,32,0.10)]'}`}><strong>{report.reliable ? 'Base configurada' : 'Há dados que precisam de atenção'}</strong><p className="mt-1 text-sm">Cobertura dos destinos: {report.allocationCoveragePercent.toFixed(1)}%.</p></div><div className="grid gap-3 md:grid-cols-2">{items.map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5"><p className="text-sm text-[var(--eixo-text-muted)]">{label}</p><strong className="text-2xl">{value}</strong></div>)}<div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5"><p className="text-sm text-[var(--eixo-text-muted)]">Custos sem destino</p><strong className="text-2xl">{formatCurrency(report.unallocatedAmount)}</strong></div></div></div>;
};
export default DataQualityTab;
