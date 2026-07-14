import React, { useMemo } from 'react';
import { FinancialTransaction } from '../../adapters/financialApi';
import { formatCurrency, MESES, MESES_CURTOS } from '../financeUtils';

interface FluxoTabProps {
    annualTransactions: FinancialTransaction[];
    annualLoading: boolean;
    selectedAnoAnual: number;
    setSelectedAnoAnual: (ano: number) => void;
    anos: number[];
}

const FluxoTab: React.FC<FluxoTabProps> = ({
    annualTransactions,
    annualLoading,
    selectedAnoAnual,
    setSelectedAnoAnual,
    anos,
}) => {
    const fluxoMensal = useMemo(() => {
        let acumulado = 0;
        return MESES.map((nomeMes, i) => {
            const mesNum = i + 1;
            const txMes = annualTransactions.filter(t => {
                const d = new Date(t.data);
                return d.getMonth() + 1 === mesNum;
            });
            const entradas = txMes.filter(t => t.type === 'ENTRADA').reduce((s, t) => s + t.valor, 0);
            const saidas = txMes.filter(t => t.type === 'SAIDA').reduce((s, t) => s + t.valor, 0);
            const resultado = entradas - saidas;
            acumulado += resultado;
            return { mes: nomeMes, mesAbrev: MESES_CURTOS[i], entradas, saidas, resultado, acumulado };
        });
    }, [annualTransactions]);

    const fluxoTotais = useMemo(() => {
        const entradas = fluxoMensal.reduce((s, m) => s + m.entradas, 0);
        const saidas = fluxoMensal.reduce((s, m) => s + m.saidas, 0);
        return { entradas, saidas, resultado: entradas - saidas };
    }, [fluxoMensal]);

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

            {/* Tabela mensal */}
            <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-[var(--eixo-text-muted)]">
                        <thead className="bg-[var(--eixo-surface-soft)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                            <tr>
                                <th className="px-5 py-3 text-left">Mês</th>
                                <th className="px-5 py-3 text-right">Entradas</th>
                                <th className="px-5 py-3 text-right">Saídas</th>
                                <th className="px-5 py-3 text-right">Resultado</th>
                                <th className="px-5 py-3 text-right">Saldo Acumulado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fluxoMensal.map((m, i) => {
                                const temDados = m.entradas > 0 || m.saidas > 0;
                                return (
                                    <tr key={i} className={`border-b border-[var(--eixo-border)] transition-colors ${temDados ? 'bg-[var(--eixo-surface)] hover:bg-[var(--eixo-surface)]' : 'bg-[var(--eixo-surface-soft)]'}`}>
                                        <td className={`px-5 py-3 font-semibold ${temDados ? 'text-[var(--eixo-text)]' : 'text-[var(--eixo-text-soft)]'}`}>{m.mes}</td>
                                        <td className="px-5 py-3 text-right text-[var(--eixo-success)]">
                                            {m.entradas > 0 ? formatCurrency(m.entradas) : <span className="text-[var(--eixo-text-soft)]">—</span>}
                                        </td>
                                        <td className="px-5 py-3 text-right text-[var(--eixo-danger)]">
                                            {m.saidas > 0 ? formatCurrency(m.saidas) : <span className="text-[var(--eixo-text-soft)]">—</span>}
                                        </td>
                                        <td className={`px-5 py-3 text-right font-semibold ${m.resultado > 0 ? 'text-[var(--eixo-success)]' : m.resultado < 0 ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-text-soft)]'}`}>
                                            {temDados ? formatCurrency(m.resultado) : <span className="text-[var(--eixo-text-soft)]">—</span>}
                                        </td>
                                        <td className={`px-5 py-3 text-right font-bold ${m.acumulado > 0 ? 'text-[var(--eixo-success)]' : m.acumulado < 0 ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-text-soft)]'}`}>
                                            {formatCurrency(m.acumulado)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)]">
                                <td className="px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">Total {selectedAnoAnual}</td>
                                <td className="px-5 py-3 text-right font-bold text-[var(--eixo-success)]">{formatCurrency(fluxoTotais.entradas)}</td>
                                <td className="px-5 py-3 text-right font-bold text-[var(--eixo-danger)]">{formatCurrency(fluxoTotais.saidas)}</td>
                                <td className={`px-5 py-3 text-right font-extrabold ${fluxoTotais.resultado >= 0 ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]'}`}>
                                    {formatCurrency(fluxoTotais.resultado)}
                                </td>
                                <td className="px-5 py-3" />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </>
    );
};

export default FluxoTab;
