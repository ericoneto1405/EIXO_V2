import React, { useEffect, useRef, useState } from 'react';
import { getIncomeStatementReport, IncomeStatementReport } from '../../adapters/financialApi';
import { formatCurrency } from '../financeUtils';
import { FINANCIAL_RESULT_EVENT, financialResultKey, writeFlag } from '../progressGuideState';

interface DreTabProps {
    userId: string;
    farmId: string;
    selectedAnoAnual: number;
    setSelectedAnoAnual: (ano: number) => void;
    anos: number[];
}

const DreTab: React.FC<DreTabProps> = ({ userId, farmId, selectedAnoAnual, setSelectedAnoAnual, anos }) => {
    const [loadedReport, setReport] = useState<{ context: string; data: IncomeStatementReport } | null>(null);
    const [organizationScope, setOrganizationScope] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const context = JSON.stringify([userId, farmId, selectedAnoAnual, organizationScope]);
    const currentContext = useRef(context);
    currentContext.current = context;
    const report = loadedReport?.context === context ? loadedReport.data : null;

    useEffect(() => {
        let active = true;
        setError(null);
        setReport(null);
        getIncomeStatementReport(organizationScope ? undefined : farmId, selectedAnoAnual).then((data) => {
            if (!active || currentContext.current !== context) return;
            setReport({ context, data });
            if (!organizationScope && userId) {
                writeFlag(financialResultKey(userId, farmId), true);
                window.dispatchEvent(new CustomEvent(FINANCIAL_RESULT_EVENT, { detail: { userId, farmId } }));
            }
        }).catch((e) => { if (active && currentContext.current === context) setError(e.message); });
        return () => { active = false; };
    }, [userId, farmId, selectedAnoAnual, organizationScope]);

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
        <div className="flex gap-2"><select value={selectedAnoAnual} onChange={(e) => setSelectedAnoAnual(Number(e.target.value))} className="rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm">
            {anos.map((ano) => <option key={ano}>{ano}</option>)}
        </select><button type="button" onClick={() => setOrganizationScope((value) => !value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${organizationScope ? 'bg-(--eixo-green) text-[#1a1a1a]' : 'border-(--eixo-border)'}`}>Consolidar organização</button></div>
        {error && <p className="text-sm text-(--eixo-danger)">{error}</p>}
        {!report && !error ? <p className="text-sm text-(--eixo-text-muted)">Carregando resultado...</p> : report && <>
            {report.reliableSince && <p className="rounded-xl bg-(--eixo-green-soft) px-4 py-3 text-sm text-(--eixo-text)">Base analítica confiável a partir de {new Date(report.reliableSince).toLocaleDateString('pt-BR')}.</p>}
            <div className="overflow-hidden rounded-2xl border border-(--eixo-border) bg-(--eixo-surface)">
                <div className="border-b border-(--eixo-border) px-5 py-4"><h3 className="font-bold">Resultado da operação (DRE gerencial)</h3></div>
                {rows.map(([label, value]) => <div key={label} className="flex justify-between border-b border-(--eixo-border) px-5 py-3 text-sm"><span>{label}</span><strong>{formatCurrency(value)}</strong></div>)}
                <div className="flex justify-between bg-(--eixo-green-soft) px-5 py-5"><strong>Resultado gerencial do período</strong><strong className="text-xl">{formatCurrency(report.consolidated.managementResult)}</strong></div>
            </div>
            {organizationScope && report.byFarm.length > 1 && <div className="rounded-2xl border border-(--eixo-border) bg-(--eixo-surface) p-5"><h4 className="mb-3 font-bold">Comparação por fazenda</h4>{report.byFarm.map((farm) => <div key={farm.farmId} className="flex justify-between border-t border-(--eixo-border) py-3 text-sm"><span>{farm.farmName}</span><strong>{formatCurrency(farm.managementResult)}</strong></div>)}</div>}
        </>}
    </div>;
};

export default DreTab;
