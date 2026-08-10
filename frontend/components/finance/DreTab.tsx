import React, { useEffect, useState } from 'react';
import { getIncomeStatementReport, IncomeStatementReport } from '../../adapters/financialApi';
import { formatCurrency } from '../financeUtils';

interface DreTabProps {
    farmId: string;
    selectedAnoAnual: number;
    setSelectedAnoAnual: (ano: number) => void;
    anos: number[];
}

const DreTab: React.FC<DreTabProps> = ({ farmId, selectedAnoAnual, setSelectedAnoAnual, anos }) => {
    const [report, setReport] = useState<IncomeStatementReport | null>(null);
    const [organizationScope, setOrganizationScope] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setError(null);
        getIncomeStatementReport(organizationScope ? undefined : farmId, selectedAnoAnual).then(setReport).catch((e) => setError(e.message));
    }, [farmId, selectedAnoAnual, organizationScope]);

    const rows = report ? [
        ['Receita operacional', report.consolidated.operatingRevenue],
        ['Custos de produção', -report.consolidated.productionCost],
        ['Margem bruta', report.consolidated.grossMargin],
        ['Despesas operacionais', -report.consolidated.operatingExpense],
        ['Resultado operacional', report.consolidated.operatingResult],
        ['Resultado financeiro', report.consolidated.financialResult],
        ['Outros resultados', report.consolidated.otherResult],
    ] as const : [];

    return <div className="space-y-4">
        <div className="flex gap-2"><select value={selectedAnoAnual} onChange={(e) => setSelectedAnoAnual(Number(e.target.value))} className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm">
            {anos.map((ano) => <option key={ano}>{ano}</option>)}
        </select><button type="button" onClick={() => setOrganizationScope((value) => !value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${organizationScope ? 'bg-[var(--eixo-green)] text-[#1a1a1a]' : 'border-[var(--eixo-border)]'}`}>Consolidar organização</button></div>
        {error && <p className="text-sm text-[var(--eixo-danger)]">{error}</p>}
        {!report && !error ? <p className="text-sm text-[var(--eixo-text-muted)]">Carregando resultado...</p> : report && <>
            {report.reliableSince && <p className="rounded-xl bg-[var(--eixo-green-soft)] px-4 py-3 text-sm text-[var(--eixo-text)]">Base analítica confiável a partir de {new Date(report.reliableSince).toLocaleDateString('pt-BR')}.</p>}
            <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                <div className="border-b border-[var(--eixo-border)] px-5 py-4"><h3 className="font-bold">Resultado da operação (DRE gerencial)</h3></div>
                {rows.map(([label, value]) => <div key={label} className="flex justify-between border-b border-[var(--eixo-border)] px-5 py-3 text-sm"><span>{label}</span><strong>{formatCurrency(value)}</strong></div>)}
                <div className="flex justify-between bg-[var(--eixo-green-soft)] px-5 py-5"><strong>Resultado gerencial do período</strong><strong className="text-xl">{formatCurrency(report.consolidated.managementResult)}</strong></div>
            </div>
            {organizationScope && report.byFarm.length > 1 && <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5"><h4 className="mb-3 font-bold">Comparação por fazenda</h4>{report.byFarm.map((farm) => <div key={farm.farmId} className="flex justify-between border-t border-[var(--eixo-border)] py-3 text-sm"><span>{farm.farmName}</span><strong>{formatCurrency(farm.managementResult)}</strong></div>)}</div>}
        </>}
    </div>;
};

export default DreTab;
