
import React from 'react';
import { AtividadeRecente } from '../types';
import ChartCard from './ChartCard';

const ActivityIcon: React.FC<{ type: AtividadeRecente['tipo'] }> = ({ type }) => {
    const iconStyles = "w-10 h-10 rounded-lg flex items-center justify-center text-white";
    switch (type) {
        case 'Venda': return <div className={`${iconStyles} bg-[var(--eixo-green)]`}>$</div>;
        case 'Pesagem': return <div className={`${iconStyles} bg-[var(--eixo-success)]`}>⚖️</div>;
        case 'Vacinação': return <div className={`${iconStyles} bg-[#d97706]`}>💉</div>;
        case 'Manejo': return <div className={`${iconStyles} bg-[var(--eixo-graphite-dark)]`}>🐄</div>;
        default: return null;
    }
};

const RecentActivity: React.FC = () => {
    const activities: AtividadeRecente[] = [];

    return (
        <ChartCard title="Atividades Recentes">
            {activities.length === 0 ? (
                <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma atividade registrada.</p>
            ) : (
                <div className="space-y-4">
                    {activities.map(activity => (
                        <div key={activity.id} className="flex items-center space-x-4 rounded-xl p-2 hover:bg-[var(--eixo-surface-soft)]">
                            <ActivityIcon type={activity.tipo} />
                            <div className="flex-1">
                                <p className="font-semibold text-[var(--eixo-text)]">{activity.tipo}</p>
                                <p className="text-sm text-[var(--eixo-text-muted)]">{activity.descricao}</p>
                            </div>
                            <p className="whitespace-nowrap text-sm text-[#a8a29e]">{activity.data}</p>
                        </div>
                    ))}
                </div>
            )}
        </ChartCard>
    );
};

export default RecentActivity;
