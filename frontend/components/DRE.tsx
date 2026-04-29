import React from 'react';

const DRE: React.FC = () => {
    return (
        <div>
            <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mb-6">Analise a lucratividade da sua operação.</p>
            <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-12 text-center flex flex-col items-center justify-center h-96">
                <svg className="w-16 h-16 text-primary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <h2 className="text-2xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text-soft)]">Módulo em Desenvolvimento</h2>
                <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mt-2 max-w-md">O DRE Gerencial está sendo implementado para ajudar a entender a fundo os resultados e a rentabilidade do seu negócio.</p>
            </div>
        </div>
    );
};

export default DRE;