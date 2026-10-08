import React from 'react';

interface ModuleHeaderProps {
    title: string;
    subtitle: string;
    context?: React.ReactNode;
    farmName?: string | null;
    embedded?: boolean;
    headingLevel?: 'h1' | 'h2';
}

/** Shared module identity; embedded keeps existing actions and tabs in place. */
const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, subtitle, context, farmName, embedded = false, headingLevel = 'h1' }) => {
    const name = farmName?.trim();
    const farmLabel = name ? (/^fazenda(?:\s|$)/i.test(name) ? name.replace(/^fazenda/i, 'Fazenda') : `Fazenda ${name}`) : null;
    const Heading = headingLevel;
    const Container = embedded ? 'div' : 'header';
    return (
        <Container className={embedded ? 'min-w-0' : 'rounded-3xl border border-(--eixo-border) bg-(--eixo-surface) px-6 py-5'}>
            <Heading className="font-brand m-0 text-2xl font-extrabold leading-tight text-(--eixo-text)">{title}</Heading>
            <p className="mt-1 text-sm leading-relaxed text-(--eixo-text-muted)">{subtitle}</p>
            {farmLabel && <p className="mt-2 text-sm font-semibold leading-relaxed text-(--eixo-text-muted)">{farmLabel}</p>}
            {context && <p className="mt-2 text-sm leading-relaxed text-(--eixo-text-muted)">{context}</p>}
        </Container>
    );
};

export default ModuleHeader;
