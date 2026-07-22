import React from 'react';

// ─── Dados dos planos ─────────────────────────────────────────────────────────

interface PlanFeature {
    text: string;
    included: boolean;
}

interface Plan {
    id: string;
    name: string;
    badge?: string;
    price: string;
    priceNote: string;
    description: string;
    cta: string;
    ctaVariant: 'outline' | 'primary' | 'dark';
    features: PlanFeature[];
}

const PLANS: Plan[] = [
    {
        id: 'gratis',
        name: 'EIXO Essencial',
        price: 'R$0,00/mês',
        priceNote: '',
        description: 'O plano gratuito mais completo do mercado, para quem entendeu que planilhas e cadernos já não dão conta de gerir sua fazenda.',
        cta: 'Comece agora!',
        ctaVariant: 'outline',
        features: [
            { text: 'Animais ilimitados', included: true },
            { text: '1 fazenda', included: true },
            { text: 'Até 3 usuários', included: true },
            { text: 'Manejo do Rebanho (básico)', included: true },
            { text: 'Estrutura da Fazenda', included: true },
            { text: 'Financeiro básico', included: true },
            { text: 'Dashboard (Visão Geral)', included: true },
            { text: 'Nutrição avançada', included: false },
            { text: 'Exportação de dados (Excel/PDF)', included: false },
            { text: 'Múltiplas fazendas', included: false },
        ],
    },
    {
        id: 'gestao',
        name: 'EIXO Gestão',
        badge: 'Mais popular',
        price: 'Em breve',
        priceNote: '',
        description: 'Inclui Dashboard completo, Nutrição avançada e exportação de dados.',
        cta: 'Quero saber mais',
        ctaVariant: 'primary',
        features: [
            { text: 'Animais ilimitados', included: true },
            { text: 'Até 3 fazendas', included: true },
            { text: 'Até 5 usuários', included: true },
            { text: 'Tudo do EIXO Essencial', included: true },
            { text: 'Dashboard (Visão Geral)', included: true },
            { text: 'Nutrição avançada', included: true },
            { text: 'Pesagens avançadas', included: true },
            { text: 'Exportação de dados (Excel/PDF)', included: true },
            { text: 'Eixo Acasalamento', included: false },
            { text: 'Confinamento e rastreabilidade', included: false },
        ],
    },
    {
        id: 'decisao',
        name: 'EIXO Performance',
        price: 'Em breve',
        priceNote: '',
        description: 'Operação profissional, P.O. e exportação sem limites.',
        cta: 'Quero saber mais',
        ctaVariant: 'dark',
        features: [
            { text: 'Animais ilimitados', included: true },
            { text: 'Fazendas ilimitadas', included: true },
            { text: 'Usuários ilimitados', included: true },
            { text: 'Tudo do EIXO Gestão', included: true },
            { text: 'Eixo Acasalamento', included: true },
            { text: 'Confinamento e contratos', included: true },
            { text: 'Rastreabilidade completa', included: true },
            { text: 'Integração com balanças eletrônicas', included: true },
            { text: 'Relatório de erros auditável', included: true },
        ],
    },
];

// ─── Componente ───────────────────────────────────────────────────────────────

interface PlansPageProps {
    onBack?: () => void;
    isAuthenticated?: boolean;
}

const CheckIcon: React.FC = () => (
    <svg className="h-4 w-4 flex-shrink-0 text-[var(--eixo-green)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);

const XIcon: React.FC = () => (
    <svg className="h-4 w-4 flex-shrink-0 text-[#a8a29e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const PlansPage: React.FC<PlansPageProps> = ({ onBack, isAuthenticated }) => {
    const handleBack = () => {
        if (onBack) {
            onBack();
            return;
        }
        if (window.history.length > 1) {
            window.history.back();
            return;
        }
        window.location.href = '/';
    };

    const handleCta = (plan: Plan) => {
        if (plan.id === 'gratis') {
            window.location.href = '/?register=1';
            return;
        }
        window.open('mailto:contato@eixo.ag?subject=Interesse no ' + plan.name, '_blank');
    };

    return (
        <div className="min-h-screen bg-[var(--eixo-surface-soft)]">
            {/* Header */}
            <header className="border-b border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-4">
                <div className="mx-auto flex max-w-5xl items-center justify-between">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]"
                    >
                        <span aria-hidden="true">←</span>
                        Voltar
                    </button>
                    <div className="inline-flex flex-col items-center leading-none">
                        <img src="/logo_eixo_official.svg" alt="EIXO" className="h-7" />
                        <span className="mt-[4px] text-[10px] font-semibold uppercase tracking-[0.18em] whitespace-nowrap text-[var(--eixo-text)]/75">
                            Tecnologia para Gestão Pecuária
                        </span>
                    </div>
                    <div className="w-[92px]" aria-hidden="true" />
                </div>
            </header>

            {/* Hero */}
            <div className="mx-auto max-w-5xl px-6 py-12 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] px-4 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--eixo-graphite)] mb-4">
                    ACESSO ANTECIPADO
                </div>
                <h1 className="font-brand text-3xl font-extrabold text-[var(--eixo-text)] md:text-4xl">
                    Comece gratuitamente no Plano Essencial. Evolua quando precisar avançar!
                </h1>
                <p className="mt-3 text-base text-[var(--eixo-text-muted)] max-w-md mx-auto">
                    O plano mais completo do mercado para quem quer sair das planilhas e cadernos, e elevar o nível de Gestão da sua Fazenda.
                </p>
            </div>

            {/* Cards */}
            <div className="mx-auto max-w-5xl px-6 pb-16">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={`relative flex flex-col rounded-2xl border bg-[var(--eixo-surface)] p-6 ${
                                plan.id === 'gestao'
                                    ? 'border-[var(--eixo-green)] shadow-lg shadow-[var(--eixo-green)]/10'
                                    : 'border-[var(--eixo-border)]'
                            }`}
                        >
                            {/* Badge */}
                            {plan.badge && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="rounded-full bg-[var(--eixo-green)] px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
                                        {plan.badge}
                                    </span>
                                </div>
                            )}

                            {/* Nome e preço */}
                            <div className="mb-5">
                                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--eixo-text-muted)]">
                                    {plan.name}
                                </p>
                                <div className="mt-2 flex items-baseline gap-1">
                                    <span className={`font-brand text-3xl font-extrabold ${
                                        plan.price === 'Em breve' ? 'text-[var(--eixo-text-muted)] text-xl' : 'text-[var(--eixo-text)]'
                                    }`}>
                                        {plan.price}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-xs text-[#a8a29e]">{plan.priceNote}</p>
                                <p className="mt-3 text-sm text-[var(--eixo-text-muted)]">{plan.description}</p>
                            </div>

                            {/* CTA */}
                            <button
                                onClick={() => handleCta(plan)}
                                className={`mb-6 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                                    plan.ctaVariant === 'primary'
                                        ? 'bg-[var(--eixo-green)] text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]'
                                        : plan.ctaVariant === 'dark'
                                        ? 'bg-[var(--eixo-text)] text-white hover:bg-[var(--eixo-graphite)]'
                                        : 'border border-[var(--eixo-border)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]'
                                }`}
                            >
                                {plan.cta}
                            </button>

                            {/* Divider */}
                            <div className="mb-4 border-t border-[var(--eixo-border)]" />

                            {/* Features */}
                            <ul className="flex-1 space-y-2.5">
                                {plan.features.map((f) => (
                                    <li key={f.text} className="flex items-start gap-2.5">
                                        {f.included ? <CheckIcon /> : <XIcon />}
                                        <span className={`text-sm ${f.included ? 'text-[var(--eixo-text)]' : 'text-[#a8a29e] line-through'}`}>
                                            {f.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Nota de preços + Early Access */}
                <p className="mt-8 text-center text-sm text-[#a8a29e]">
                    Os primeiros 100 produtores que cadastrarem agora ganham <span className="font-semibold text-[var(--eixo-text)]">EIXO Base Vitalício</span> + prioridade no suporte.
                </p>
                <p className="mt-1 text-center text-xs text-[#a8a29e]">
                    Preços dos planos pagos em breve. Dúvidas? <a href="mailto:contato@eixo.ag" className="text-[var(--eixo-green)] hover:underline">contato@eixo.ag</a>
                </p>
            </div>
        </div>
    );
};

export default PlansPage;
