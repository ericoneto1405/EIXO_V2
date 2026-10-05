import React, { useEffect, useState } from 'react';
import { CashFlowReport, getCashFlowReport } from '../../adapters/financialApi';
import { ArrowDownCircleIcon, ArrowUpCircleIcon, ScaleIcon, WalletIcon, formatCurrency } from '../financeUtils';
import KpiCard from '../KpiCard';

interface FluxoTabProps { farmId: string; selectedAnoAnual: number; setSelectedAnoAnual: (ano: number) => void; anos: number[]; }

const FluxoTab: React.FC<FluxoTabProps> = ({ farmId, selectedAnoAnual, setSelectedAnoAnual, anos }) => {
    const [report, setReport] = useState<CashFlowReport | null>(null);
    const [organizationScope, setOrganizationScope] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { setError(null); getCashFlowReport(organizationScope ? undefined : farmId, selectedAnoAnual).then(setReport).catch((e) => setError(e.message)); }, [farmId, selectedAnoAnual, organizationScope]);
    const card = (label: string, value: number, icon: React.ReactNode, valueClassName = 'text-(--eixo-text)') => (
        <KpiCard title={label} icon={icon}>
            <p className={`font-brand text-2xl font-extrabold ${valueClassName}`}>{formatCurrency(value)}</p>
        </KpiCard>
    );
    return <div className="space-y-4">
        <div className="flex gap-2"><select value={selectedAnoAnual} onChange={(e) => setSelectedAnoAnual(Number(e.target.value))} className="rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm">{anos.map((ano) => <option key={ano}>{ano}</option>)}</select><button type="button" onClick={() => setOrganizationScope((value) => !value)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${organizationScope ? 'bg-(--eixo-green) text-[#1a1a1a]' : 'border-(--eixo-border)'}`}>Consolidar organização</button></div>
        {error && <p className="text-sm text-(--eixo-danger)">{error}</p>}
        {!report && !error ? <p className="text-sm text-(--eixo-text-muted)">Carregando movimentação...</p> : report && <>
            <div className="grid gap-3 md:grid-cols-3">
                {card('Dinheiro que entrou', report.realized.totals.incoming, <ArrowUpCircleIcon />, 'text-(--eixo-success)')}
                {card('Dinheiro que saiu', report.realized.totals.outgoing, <ArrowDownCircleIcon />, 'text-(--eixo-danger)')}
                {card('Movimentação líquida', report.realized.totals.net, <ScaleIcon />, report.realized.totals.net >= 0 ? 'text-(--eixo-success)' : 'text-(--eixo-danger)')}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {card('A receber (projetado)', report.projected.totals.incoming, <WalletIcon />, 'text-(--eixo-success)')}
                {card('A pagar (projetado)', report.projected.totals.outgoing, <WalletIcon />, 'text-(--eixo-danger)')}
            </div>
            <p className="text-sm text-(--eixo-text-muted)">A movimentação líquida não representa saldo bancário disponível.</p>
        </>}
    </div>;
};
export default FluxoTab;
