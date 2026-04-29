
import React from 'react';

interface ChartCardProps {
    title: string;
    children: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, children }) => {
    return (
        <div className="h-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-[var(--eixo-text)]">{title}</h3>
            <div className="h-full">
                {children}
            </div>
        </div>
    );
};

export default ChartCard;
