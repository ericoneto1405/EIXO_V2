import React, { useMemo } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CATEGORIA_LABELS, FinancialTransaction } from '../../adapters/financialApi';
import { formatCurrency, MESES, PIE_COLORS } from '../financeUtils';
import ChartCard from '../ChartCard';

interface VisaoGeralTabProps {
    transactions: FinancialTransaction[];
    isLoading: boolean;
    loadError: string | null;
    selectedMes: number;
    setSelectedMes: (mes: number) => void;
    selectedAno: number;
    setSelectedAno: (ano: number) => void;
    anos: number[];
}

const VisaoGeralTab: React.FC<VisaoGeralTabProps> = ({
    transactions,
    isLoading,
    loadError,
    selectedMes,
    setSelectedMes,
    selectedAno,
    setSelectedAno,
    anos,
}) => {
    const monthlyGroupCharts = useMemo(() => {
        const receitas = new Map<string, number>();
        const despesas = new Map<string, number>();

        for (const transaction of transactions) {
            const groupName =
                transaction.accountCategoryGroup ||
                transaction.accountCategoryName ||
                CATEGORIA_LABELS[transaction.categoria] ||
                'Outros';

            if (transaction.type === 'ENTRADA') {
                receitas.set(groupName, (receitas.get(groupName) ?? 0) + transaction.valor);
            } else {
                despesas.set(groupName, (despesas.get(groupName) ?? 0) + transaction.valor);
            }
        }

        const toChartData = (map: Map<string, number>) =>
            Array.from(map.entries())
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);

        return {
            receitas: toChartData(receitas),
            despesas: toChartData(despesas),
        };
    }, [transactions]);

    return (
        <>
            <div className="flex flex-wrap gap-3">
                <select value={selectedMes} onChange={e => setSelectedMes(Number(e.target.value))}
                    className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none">
                    {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select value={selectedAno} onChange={e => setSelectedAno(Number(e.target.value))}
                    className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none">
                    {anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            {loadError && (
                <div className="rounded-xl border border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]">{loadError}</div>
            )}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <ChartCard title="Receitas por grupo">
                    {isLoading ? (
                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando receitas...</p>
                    ) : monthlyGroupCharts.receitas.length === 0 ? (
                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma receita no período selecionado.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={360}>
                            <PieChart>
                                <Pie
                                    data={monthlyGroupCharts.receitas}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={120}
                                    dataKey="value"
                                    nameKey="name"
                                    labelLine={false}
                                    label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {monthlyGroupCharts.receitas.map((_, index) => (
                                        <Cell key={`receita-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => formatCurrency(Number(value))}
                                    contentStyle={{ backgroundColor: '#fffaf1', borderColor: 'var(--eixo-border)', borderRadius: '0.75rem' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                <ChartCard title="Despesas por grupo">
                    {isLoading ? (
                        <p className="text-sm text-[var(--eixo-text-muted)]">Carregando despesas...</p>
                    ) : monthlyGroupCharts.despesas.length === 0 ? (
                        <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma despesa no período selecionado.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={360}>
                            <PieChart>
                                <Pie
                                    data={monthlyGroupCharts.despesas}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={120}
                                    dataKey="value"
                                    nameKey="name"
                                    labelLine={false}
                                    label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {monthlyGroupCharts.despesas.map((_, index) => (
                                        <Cell key={`despesa-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => formatCurrency(Number(value))}
                                    contentStyle={{ backgroundColor: '#fffaf1', borderColor: 'var(--eixo-border)', borderRadius: '0.75rem' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>
        </>
    );
};

export default VisaoGeralTab;
