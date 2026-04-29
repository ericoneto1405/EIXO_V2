import React from 'react';

const AccountsPayable: React.FC = () => {
    return (
        <div>
            <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mb-6">Gerencie todas as suas despesas e pagamentos.</p>
            <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-12 text-center flex flex-col items-center justify-center h-96">
                <svg className="w-16 h-16 text-primary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                <h2 className="text-2xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text-soft)]">Módulo em Desenvolvimento</h2>
                <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mt-2 max-w-md">A seção de contas a pagar está sendo construída para oferecer um controle preciso sobre seus compromissos financeiros.</p>
            </div>
        </div>
    );
};

export default AccountsPayable;