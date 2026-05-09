import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { ComposicaoRebanhoData } from '../types';
import { buildApiUrl } from '../api';
import ChartCard from './ChartCard';

const COLORS = ['var(--eixo-green)', '#d97706', '#0369a1', '#6d28d9'];

interface HerdCompositionChartProps {
    farmId?: string | null;
}

const HerdCompositionChart: React.FC<HerdCompositionChartProps> = ({ farmId }) => {
    const [data, setData] = React.useState<ComposicaoRebanhoData[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);

    React.useEffect(() => {
        let isActive = true;

        const loadData = async () => {
            if (!farmId) {
                if (isActive) {
                    setData([]);
                }
                return;
            }

            setIsLoading(true);
            try {
                const response = await fetch(buildApiUrl(`/animals?farmId=${farmId}`), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error('Erro ao carregar composição do rebanho.');
                }

                const animals = Array.isArray(payload?.animals) ? payload.animals : [];
                const poAnimals = animals.filter((animal: any) => animal?.tipoCadastro === 'PO');
                const commercialAnimals = animals.filter((animal: any) => animal?.tipoCadastro !== 'PO');

                const nextData: ComposicaoRebanhoData[] = [
                    { name: 'Comercial', value: commercialAnimals.length },
                    { name: 'P.O.', value: poAnimals.length },
                ].filter((item) => item.value > 0);

                if (isActive) {
                    setData(nextData);
                }
            } catch (error) {
                console.error(error);
                if (isActive) {
                    setData([]);
                }
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };

        loadData();
        return () => {
            isActive = false;
        };
    }, [farmId]);

    if (isLoading) {
        return (
            <ChartCard title="Composição do Rebanho">
                <p className="text-sm text-[var(--eixo-text-muted)]">Carregando composição do rebanho...</p>
            </ChartCard>
        );
    }

    if (!data.length) {
        return (
            <ChartCard title="Composição do Rebanho">
                <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum dado de rebanho disponível.</p>
            </ChartCard>
        );
    }

    return (
        <ChartCard title="Composição do Rebanho">
            <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                    <Pie
                        data={data as any}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                    >
                        {data.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                         contentStyle={{
                            backgroundColor: '#ffffff',
                            borderColor: 'var(--eixo-border)',
                            borderRadius: '0.5rem'
                        }}
                    />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

export default HerdCompositionChart;
