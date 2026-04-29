import React from 'react';

const Operations: React.FC = () => {
    return (
        <div>
            <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mb-6">Registro de manejos, tarefas e rotinas.</p>
            <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-12 text-center flex flex-col items-center justify-center h-96">
                 <svg className="w-16 h-16 text-primary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                <h2 className="text-2xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text-soft)]">Módulo em Desenvolvimento</h2>
                <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mt-2 max-w-md">O gerenciamento de tarefas e operações de campo, incluindo o modo offline, está sendo desenvolvido e será lançado em breve.</p>
            </div>
        </div>
    );
};

export default Operations;