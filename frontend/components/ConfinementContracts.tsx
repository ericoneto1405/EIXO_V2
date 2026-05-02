import React from 'react';

const ConfinementContracts: React.FC = () => {
    return (
        <div>
            <p className="mb-6 text-[var(--eixo-text-muted)]">
                Contratos, lotes de confinamento e rotinas comerciais.
            </p>

            <div className="flex h-96 flex-col items-center justify-center rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-12 text-center shadow-sm">
                <svg className="mb-4 h-16 w-16 text-[var(--eixo-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 11h8M8 15h5M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
                <h2 className="text-2xl font-semibold text-[var(--eixo-text)]">Confinamento e Contratos</h2>
                <p className="mt-2 max-w-md text-[var(--eixo-text-muted)]">
                    Este módulo será desenvolvido separado das ocorrências do EIXO Campo.
                </p>
            </div>
        </div>
    );
};

export default ConfinementContracts;
