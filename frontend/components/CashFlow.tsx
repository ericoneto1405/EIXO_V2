import React from 'react';

const CashFlow: React.FC = () => {
    return (
        <div>
            <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mb-6">Visualize o movimento de entradas e saídas.</p>
            <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-12 text-center flex flex-col items-center justify-center h-96">
                <svg className="w-16 h-16 text-primary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                <h2 className="text-2xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text-soft)]">Módulo em Desenvolvimento</h2>
                <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mt-2 max-w-md">O relatório de fluxo de caixa está sendo desenvolvido para fornecer uma visão clara da saúde financeira da sua operação.</p>
            </div>
        </div>
    );
};

export default CashFlow;