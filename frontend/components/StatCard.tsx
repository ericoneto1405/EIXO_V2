
import React from 'react';

interface StatCardProps {
    title: string;
    value: string;
    change?: string;
    changeType?: 'increase' | 'decrease';
    icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, changeType, icon }) => {
    const changeColor = changeType === 'increase' ? 'text-[var(--eixo-success)]' : 'text-[var(--eixo-danger)]';
    const changeIcon = changeType === 'increase' ? '↑' : '↓';

    return (
        <div className="flex items-center justify-between rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-lg transition-transform transform hover:-translate-y-1">
            <div>
                <p className="text-sm font-medium uppercase tracking-wider text-[var(--eixo-text-muted)]">{title}</p>
                <p className="mt-1 text-3xl font-bold text-[var(--eixo-text)]">{value}</p>
                {change && (
                    <div className={`mt-2 flex items-center text-sm font-semibold ${changeColor}`}>
                        <span>{changeIcon} {change}</span>
                        <span className="ml-1 font-normal text-[var(--eixo-text-muted)]">vs. mês passado</span>
                    </div>
                )}
            </div>
            <div className="rounded-full bg-[var(--eixo-green-soft)] p-3 text-[var(--eixo-green)]">
                {icon}
            </div>
        </div>
    );
};

export default StatCard;
