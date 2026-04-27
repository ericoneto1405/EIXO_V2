
import React from 'react';
import { AtividadeRecente } from '../types';
import ChartCard from './ChartCard';

const ActivityIcon: React.FC<{ type: AtividadeRecente['tipo'] }> = ({ type }) => {
    const iconStyles = "w-10 h-10 rounded-lg flex items-center justify-center text-white";
    switch (type) {
        case 'Venda': return <div className={`${iconStyles} bg-[#a8442a]`}>$</div>;
        case 'Pesagem': return <div className={`${iconStyles} bg-[#16a34a]`}>⚖️</div>;
        case 'Vacinação': return <div className={`${iconStyles} bg-[#d97706]`}>💉</div>;
        case 'Manejo': return <div className={`${iconStyles} bg-[#7a2a14]`}>🐄</div>;
        default: return null;
    }
};

const RecentActivity: React.FC = () => {
    const activities: AtividadeRecente[] = [];

    return (
        <ChartCard title="Atividades Recentes">
            {activities.length === 0 ? (
                <p className="text-sm text-[#78716c]">Nenhuma atividade registrada.</p>
            ) : (
                <div className="space-y-4">
                    {activities.map(activity => (
                        <div key={activity.id} className="flex items-center space-x-4 rounded-xl p-2 hover:bg-[#f5f5f4]">
                            <ActivityIcon type={activity.tipo} />
                            <div className="flex-1">
                                <p className="font-semibold text-[#1c1917]">{activity.tipo}</p>
                                <p className="text-sm text-[#78716c]">{activity.descricao}</p>
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
