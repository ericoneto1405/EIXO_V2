import React from 'react';

interface OnboardingSpotlightProps {
    step: number;
    totalSteps: number;
    iconPath: string;
    title: string;
    description: string;
    actionLabel: string;
    onAction: () => void;
    hint?: string;
}

const OnboardingSpotlight: React.FC<OnboardingSpotlightProps> = ({
    step,
    totalSteps,
    iconPath,
    title,
    description,
    actionLabel,
    onAction,
    hint,
}) => (
    <div className="mx-auto w-full max-w-md rounded-[24px] border-2 border-primary bg-(--eixo-surface) p-8 shadow-md transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02]">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-[#3a5c10]">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>Passo {step} de {totalSteps}</span>
        </div>

        <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-(--eixo-green-soft)">
            <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d={iconPath} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
            </svg>
        </div>

        <h2 className="mt-5 font-brand text-xl font-bold text-(--eixo-graphite)">{title}</h2>
        <p className="mt-2 text-sm text-(--eixo-text-muted)">{description}</p>

        <button
            type="button"
            onClick={onAction}
            className="mt-6 inline-flex items-center rounded-xl border-2 border-[#5a8c00] bg-primary px-6 py-3 font-bold text-[#1a1a1a] shadow-md transition-all duration-200 hover:bg-primary-dark hover:shadow-lg"
        >
            {actionLabel}
        </button>

        {hint && (
            <p className="mt-3 text-xs text-(--eixo-text-soft)">{hint}</p>
        )}
    </div>
);

export default OnboardingSpotlight;
