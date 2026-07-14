import React, { useMemo } from 'react';
import { CATEGORIA_LABELS, FinancialTransaction } from '../../adapters/financialApi';
import { formatCurrency } from '../financeUtils';

interface DreTabProps {
    annualTransactions: FinancialTransaction[];
    annualLoading: boolean;
    selectedAnoAnual: number;
    setSelectedAnoAnual: (ano: number) => void;
    anos: number[];
}

const DreTab: React.FC<DreTabProps> = ({
    annualTransactions,
    annualLoading,
    selectedAnoAnual,
    setSelectedAnoAnual,
    anos,
}) => {
    const dreData = useMemo(() => {
        const receitas = new Map<string, number>();
        const despesas = new Map<string, number>();

        for (const t of annualTransactions) {
            const grp = t.accountCategoryGroup || t.accountCategoryName || CATEGORIA_LABELS[t.categoria] || 'Outros';
            if (t.type === 'ENTRADA') {
                receitas.set(grp, (receitas.get(grp) ?? 0) + t.valor);
            } else {
                despesas.set(grp, (despesas.get(grp) ?? 0) + t.valor);
            }
        }

        const totalReceitas = Array.from(receitas.values()).reduce((s, v) => s + v, 0);
        const totalDespesas = Array.from(despesas.values()).reduce((s, v) => s + v, 0);

        return {
            receitas: Array.from(receitas.entries()).sort((a, b) => b[1] - a[1]),
            despesas: Array.from(despesas.entries()).sort((a, b) => b[1] - a[1]),
            totalReceitas,
            totalDespesas,
            resultado: totalReceitas - totalDespesas,
        };
    }, [annualTransactions]);

    return (
        <>
            {/* Seletor de ano */}
            <div className="flex items-center gap-3">
                <select
                    value={selectedAnoAnual}
                    onChange={e => setSelectedAnoAnual(Number(e.target.value))}
                    className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none"
                >
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {annualLoading && <span className="text-sm text-[var(--eixo-text-muted)]">Carregando...</span>}
            </div>

            {annualTransactions.length === 0 && !annualLoading ? (
                <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-10 text-center">
                    <p className="font-semibold text-[var(--eixo-text)]">Sem lançamentos em {selectedAnoAnual}</p>
                    <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Registre entradas e saídas na aba Lançamentos.</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                    {/* Receitas */}
                    <div className="border-b-2 border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-5 py-3">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-success)]">Receitas Operacionais</span>
                    </div>
                    {dreData.receitas.map(([grp, val]) => (
                        <div key={grp} className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-3 hover:bg-[var(--eixo-surface)]">
                            <span className="text-sm text-[var(--eixo-text)]">{grp}</span>
                            <span className="font-semibold text-[var(--eixo-success)]">{formatCurrency(val)}</span>
                        </div>
                    ))}
                    <div className="flex items-center justify-between border-b-2 border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-5 py-3">
                        <span className="font-bold text-[var(--eixo-text)]">Total de Receitas</span>
                        <span className="font-extrabold text-[var(--eixo-success)]">{formatCurrency(dreData.totalReceitas)}</span>
                    </div>

                    {/* Despesas */}
                    <div className="mt-1 border-b border-[var(--eixo-border)] bg-[rgba(184,66,50,0.08)] px-5 py-3">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-danger)]">Despesas Operacionais</span>
                    </div>
                    {dreData.despesas.map(([grp, val]) => (
                        <div key={grp} className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-3 hover:bg-[var(--eixo-surface)]">
                            <span className="text-sm text-[var(--eixo-text)]">{grp}</span>
                            <span className="font-semibold text-[var(--eixo-danger)]">{formatCurrency(val)}</span>
                        </div>
                    ))}
                    <div className="flex items-center justify-between border-b-2 border-[var(--eixo-border)] bg-[rgba(184,66,50,0.08)] px-5 py-3">
                        <span className="font-bold text-[var(--eixo-text)]">Total de Despesas</span>
                        <span className="font-extrabold text-[var(--eixo-danger)]">{formatCurrency(dreData.totalDespesas)}</span>
                    </div>

                    {/* Resultado */}
                    <div className={`flex items-center justify-between px-5 py-5 ${dreData.resultado >= 0 ? 'bg-[var(--eixo-green-soft)]' : 'bg-[rgba(184,66,50,0.08)]'}`}>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--eixo-text-muted)]">Resultado do Exercício</p>
                            <p className="mt-1 text-lg font-extrabold text-[var(--eixo-text)]">{selectedAnoAnual}</p>
                        </div>
                        <span className={`font-brand text-3xl font-extrabold ${dreData.resultado >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                            {formatCurrency(dreData.resultado)}
                        </span>
                    </div>
                </div>
            )}
        </>
    );
};

export default DreTab;
