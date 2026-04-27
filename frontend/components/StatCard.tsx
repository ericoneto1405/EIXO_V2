
import React from 'react';

interface StatCardProps {
    title: string;
    value: string;
    change?: string;
    changeType?: 'increase' | 'decrease';
    icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, changeType, icon }) => {
    const changeColor = changeType === 'increase' ? 'text-[#16a34a]' : 'text-[#8c4d39]';
    const changeIcon = changeType === 'increase' ? '↑' : '↓';

    return (
        <div className="flex items-center justify-between rounded-2xl border border-[#e7e5e4] bg-white p-6 shadow-lg transition-transform transform hover:-translate-y-1">
            <div>
                <p className="text-sm font-medium uppercase tracking-wider text-[#78716c]">{title}</p>
                <p className="mt-1 text-3xl font-bold text-[#1c1917]">{value}</p>
                {change && (
                    <div className={`mt-2 flex items-center text-sm font-semibold ${changeColor}`}>
                        <span>{changeIcon} {change}</span>
                        <span className="ml-1 font-normal text-[#78716c]">vs. mês passado</span>
                    </div>
                )}
            </div>
            <div className="rounded-full bg-[#edf4eb] p-3 text-[#16a34a]">
                {icon}
            </div>
        </div>
    );
};

export default StatCard;
