import React from 'react';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Legend, Bar, CartesianGrid } from 'recharts';
import { FluxoCaixaData } from '../types';
import ChartCard from './ChartCard';

interface CashFlowChartProps {
    farmId?: string | null;
}

const CashFlowChart: React.FC<CashFlowChartProps> = ({ farmId }) => {
    const [data, setData] = React.useState<FluxoCaixaData[]>([]);

    React.useEffect(() => {
        if (!farmId) {
            setData([]);
            return;
        }

        // TODO: conectar ao endpoint financeiro real quando o backend expor série histórica de fluxo de caixa por fazenda.
        setData([]);
    }, [farmId]);

    if (!data.length) {
        return (
            <ChartCard title="Fluxo de Caixa (Últimos 6 Meses)">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum movimento financeiro disponível.
                </p>
            </ChartCard>
        );
    }

    return (
        <ChartCard title="Fluxo de Caixa (Últimos 6 Meses)">
            <ResponsiveContainer width="100%" height={350}>
                <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="mes" tick={{ fill: '#9ca3af' }} />
                    <YAxis tickFormatter={(value) => `R$${Number(value) / 1000}k`} tick={{ fill: '#9ca3af' }} />
                    <Tooltip
                        cursor={{ fill: 'rgba(156, 163, 175, 0.1)' }}
                        contentStyle={{
                            backgroundColor: '#1f2937',
                            borderColor: '#374151',
                            borderRadius: '0.5rem'
                        }}
                    />
                    <Legend />
                    <Bar dataKey="receita" fill="#22c55e" name="Receita" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesa" fill="#ef4444" name="Despesa" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

export default CashFlowChart;
