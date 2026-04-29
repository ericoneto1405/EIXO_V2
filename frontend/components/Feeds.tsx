import React from 'react';

const Feeds: React.FC = () => {
    return (
        <div>
            <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mb-6">Controle de estoque e dietas com rações.</p>
            <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-12 text-center flex flex-col items-center justify-center h-96">
                <svg className="w-16 h-16 text-primary mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a5 5 0 0 0-5 5v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V7a5 5 0 0 0-5-5z"></path><path d="M7 9.5c0 1 .8 2.3 2 3.2V22h6v-9.3c1.2-.9 2-2.2 2-3.2V9.5H7z"></path></svg>
                <h2 className="text-2xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text-soft)]">Módulo em Desenvolvimento</h2>
                <p className="text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mt-2 max-w-md">A seção para gerenciamento de rações está em construção.</p>
            </div>
        </div>
    );
};

export default Feeds;