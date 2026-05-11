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
    <div className="group mx-auto w-full max-w-md rounded-[24px] border-t border-r border-b border-[#B6E23A]/70 border-l-4 border-l-[#B6E23A] bg-[var(--eixo-surface)] p-8 shadow-md transition-shadow duration-300 hover:shadow-[0_6px_24px_rgba(182,226,58,0.25)]">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#f0f9d4] px-3 py-1 text-xs font-semibold text-[#3a5c10]">
            <span className="h-2 w-2 rounded-full bg-[#B6E23A]" />
            <span>Passo {step} de {totalSteps}</span>
        </div>

        <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--eixo-green-soft)]">
            <svg className="h-6 w-6 text-[#B6E23A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d={iconPath} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
            </svg>
        </div>

        <h2 className="mt-5 font-brand text-xl font-bold text-[var(--eixo-graphite)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">{description}</p>

        <button
            type="button"
            onClick={onAction}
            className="mt-6 inline-flex items-center rounded-xl bg-[#B6E23A] px-6 py-3 font-bold text-[#1a1a1a] shadow-md ring-1 ring-[#8fb82e] transition-all duration-200 hover:bg-[#a3d130] hover:shadow-lg"
        >
            {actionLabel}
        </button>

        {hint && (
            <p className="mt-3 text-xs text-[var(--eixo-text-soft)]">{hint}</p>
        )}
    </div>
);

export default OnboardingSpotlight;
