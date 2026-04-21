
import React from 'react';
import StatCard from './StatCard';
import RecentActivity from './RecentActivity';
import TaskList from './TaskList';
import CashFlowChart from './CashFlowChart';
import HerdCompositionChart from './HerdCompositionChart';

const CattleIcon: React.FC = () => <svg className="w-8 h-8 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.8 6.2c.5-.5.8-1.2.8-2s-.3-1.5-.8-2c-.5-.5-1.2-.8-2-.8s-1.5.3-2 .8L12 5 9.2 2.2c-.5-.5-1.2-.8-2-.8s-1.5.3-2 .8c-.5.5-.8 1.2-.8 2s.3 1.5.8 2L8 9v5H7c-1.1 0-2 .9-2 2v1c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-1c0-1.1-.9-2-2-2h-1V9l2.8-2.8z"></path></svg>;
const WeightIcon: React.FC = () => <svg className="w-8 h-8 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L6 8h12L12 2zM6 8v10c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V8H6zM10 12h4"></path></svg>;
const MoneyIcon: React.FC = () => <svg className="w-8 h-8 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="8"></line></svg>;
const ProfitIcon: React.FC = () => <svg className="w-8 h-8 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>;

interface DashboardProps {
    farmId?: string | null;
}

const Dashboard: React.FC<DashboardProps> = ({ farmId }) => {
    const stats = [
        { title: 'Total de Animais', value: '—', icon: <CattleIcon /> },
        { title: 'GMD Médio', value: '—', icon: <WeightIcon /> },
        { title: 'Custo/@', value: '—', icon: <MoneyIcon /> },
        { title: 'Lucro do Mês', value: '—', icon: <ProfitIcon /> },
    ];

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => (
                    <StatCard
                        key={stat.title}
                        title={stat.title}
                        value={stat.value}
                        icon={stat.icon}
                    />
                ))}
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CashFlowChart farmId={farmId} />
                <HerdCompositionChart farmId={farmId} />
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RecentActivity />
                <TaskList />
            </div>
        </div>
    );
};

export default Dashboard;
