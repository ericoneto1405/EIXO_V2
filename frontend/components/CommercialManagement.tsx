import React from 'react';

const CommercialManagement: React.FC = () => {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--eixo-green)]/10 text-[var(--eixo-green)]">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m-9 0h14a2 2 0 002-2V9.5a1 1 0 00-.4-.8l-7-5.25a1 1 0 00-1.2 0l-7 5.25a1 1 0 00-.4.8V17a2 2 0 002 2z" />
                </svg>
            </div>
            <h1 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Gestão Comercial</h1>
            <p className="max-w-md text-sm text-[var(--eixo-text-soft)]">
                Estamos construindo o CRM do EIXO: pipeline de negociação, margem por lote e histórico
                comercial num só lugar. Em breve por aqui.
            </p>
        </div>
    );
};

export default CommercialManagement;
