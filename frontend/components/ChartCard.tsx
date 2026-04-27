
import React from 'react';

interface ChartCardProps {
    title: string;
    children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => {
    return (
        <div className="h-full rounded-2xl border border-[#e7e5e4] bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-[#1c1917]">{title}</h3>
            <div className="h-full">
                {children}
            </div>
        </div>
    );
};

export default ChartCard;
