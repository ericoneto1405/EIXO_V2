import React from 'react';
import { buildApiUrl } from '../api';

// ─── Dados dos planos ─────────────────────────────────────────────────────────

interface PlanFeature {
    text: string;
    included: boolean;
}

interface Plan {
    id: string;
    code: 'GRATIS' | 'EIXO_GESTAO' | 'EIXO_DECISAO';
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
        code: 'GRATIS',
        name: 'EIXO Essencial',
        price: 'R$0,00/mês',
        priceNote: 'Para sempre, com o rebanho inteiro',
        description: 'Traga o rebanho todo, sem limite de animais. O plano gratuito mais completo do mercado, para quem entendeu que planilhas e cadernos já não dão conta de gerir sua fazenda.',
        cta: 'Comece agora!',
        ctaVariant: 'outline',
        features: [
            { text: 'Animais ilimitados', included: true },
            { text: '1 fazenda', included: true },
            { text: 'Até 3 usuários', included: true },
            { text: 'Manejo do Rebanho completo', included: true },
            { text: 'Estrutura da Fazenda', included: true },
            { text: 'Importação da sua planilha atual', included: true },
            { text: 'Pesagem no curral pelo celular, sem internet', included: true },
            { text: 'Financeiro: entradas, saídas e saldo', included: true },
            { text: 'DRE e fluxo de caixa', included: false },
            { text: 'Exportação de dados (Excel/CSV)', included: false },
        ],
    },
    {
        id: 'gestao',
        code: 'EIXO_GESTAO',
        name: 'EIXO Gestão',
        badge: 'Mais popular',
        price: 'R$97/mês',
        priceNote: 'R$79/mês no plano anual',
        description: 'O grátis anota o dinheiro. Aqui você entende o que ele está dizendo.',
        cta: 'Solicitar upgrade',
        ctaVariant: 'primary',
        features: [
            { text: 'Tudo do EIXO Essencial', included: true },
            { text: 'DRE e fluxo de caixa', included: true },
            { text: 'Reprodução: estação de monta e prenhez', included: true },
            { text: 'Compra e venda de animais', included: true },
            { text: 'Exportação de dados (Excel/CSV)', included: true },
            { text: 'Nutrição avançada', included: true },
            { text: 'Até 3 fazendas', included: true },
            { text: 'Até 5 usuários', included: true },
            { text: 'Eixo Acasalamento', included: false },
            { text: 'Confinamento e contratos', included: false },
        ],
    },
    {
        id: 'decisao',
        code: 'EIXO_DECISAO',
        name: 'EIXO Performance',
        price: 'R$247/mês',
        priceNote: 'R$197/mês no plano anual',
        description: 'Genética e confinamento para quem opera em escala, sem limite de fazendas.',
        cta: 'Solicitar upgrade',
        ctaVariant: 'dark',
        features: [
            { text: 'Tudo do EIXO Gestão', included: true },
            { text: 'Fazendas ilimitadas', included: true },
            { text: 'Usuários ilimitados', included: true },
            { text: 'Eixo Acasalamento', included: true },
            { text: 'Confinamento e contratos', included: true },
            { text: 'Suporte prioritário', included: true },
        ],
    },
];

// ─── Componente ───────────────────────────────────────────────────────────────

interface PlansPageProps {
    onBack?: () => void;
    isAuthenticated?: boolean;
    currentPlanCode?: Plan['code'];
    canRequestUpgrade?: boolean;
}

const PLAN_ORDER: Record<Plan['code'], number> = {
    GRATIS: 0,
    EIXO_GESTAO: 1,
    EIXO_DECISAO: 2,
};

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

const PlansPage: React.FC<PlansPageProps> = ({
    onBack,
    isAuthenticated = false,
    currentPlanCode,
    canRequestUpgrade = false,
}) => {
    const [submittingPlanCode, setSubmittingPlanCode] = React.useState<Plan['code'] | null>(null);
    const [interestMessage, setInterestMessage] = React.useState<string | null>(null);
    const [interestError, setInterestError] = React.useState<string | null>(null);

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

    const handleCta = async (plan: Plan) => {
        if (!isAuthenticated && plan.id === 'gratis') {
            window.location.href = '/?register=1';
            return;
        }
        if (!canRequestUpgrade || !currentPlanCode || PLAN_ORDER[plan.code] <= PLAN_ORDER[currentPlanCode]) {
            return;
        }

        setSubmittingPlanCode(plan.code);
        setInterestMessage(null);
        setInterestError(null);
        try {
            const response = await fetch(buildApiUrl('/billing/plan-interest'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ planCode: plan.code }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.message || 'Não foi possível registrar seu interesse.');
            }
            setInterestMessage(`Interesse no ${plan.name} registrado. Entramos em contato com você.`);
        } catch (error) {
            setInterestError(error instanceof Error ? error.message : 'Não foi possível registrar seu interesse.');
        } finally {
            setSubmittingPlanCode(null);
        }
    };

    const getCtaState = (plan: Plan) => {
        if (!isAuthenticated || !currentPlanCode) {
            return { label: plan.cta, disabled: false };
        }
        if (plan.code === currentPlanCode) {
            return { label: 'Seu plano atual', disabled: true };
        }
        if (PLAN_ORDER[plan.code] < PLAN_ORDER[currentPlanCode]) {
            return { label: 'Plano anterior', disabled: true };
        }
        if (!canRequestUpgrade) {
            return { label: 'Fale com o administrador', disabled: true };
        }
        return {
            label: submittingPlanCode === plan.code ? 'Registrando...' : 'Solicitar upgrade',
            disabled: submittingPlanCode !== null,
        };
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
                            Gestão para Pecuária de Corte
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
                    Comece gratuitamente no EIXO Essencial. Evolua quando precisar avançar!
                </h1>
                <p className="mt-3 text-base text-[var(--eixo-text-muted)] max-w-md mx-auto">
                    O plano mais completo do mercado para quem quer sair das planilhas e cadernos, e elevar o nível de Gestão da sua Fazenda.
                </p>
            </div>

            {/* Cards */}
            <div className="mx-auto max-w-5xl px-6 pb-16">
                {(interestMessage || interestError) && (
                    <div
                        role="status"
                        aria-live="polite"
                        className={`mb-6 rounded-xl border px-4 py-3 text-center text-sm ${
                            interestError
                                ? 'border-[#c0644a]/40 bg-[#c0644a]/10 text-[#8c4d39]'
                                : 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]'
                        }`}
                    >
                        {interestError || interestMessage}
                    </div>
                )}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    {PLANS.map((plan) => {
                        const isCurrentPlan = isAuthenticated && currentPlanCode === plan.code;
                        const ctaState = getCtaState(plan);
                        const badge = isCurrentPlan ? 'Seu plano' : plan.badge;
                        return (
                            <div
                                key={plan.id}
                                className={`relative flex flex-col rounded-2xl border bg-[var(--eixo-surface)] p-6 ${
                                    isCurrentPlan || plan.id === 'gestao'
                                        ? 'border-[var(--eixo-green)] shadow-lg shadow-[var(--eixo-green)]/10'
                                        : 'border-[var(--eixo-border)]'
                                }`}
                            >
                            {/* Badge */}
                            {badge && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="rounded-full bg-[var(--eixo-green)] px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
                                        {badge}
                                    </span>
                                </div>
                            )}

                            {/* Nome e preço */}
                            <div className="mb-5">
                                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--eixo-text-muted)]">
                                    {plan.name}
                                </p>
                                <div className="mt-2 flex items-baseline gap-1">
                                    <span className="font-brand text-3xl font-extrabold text-[var(--eixo-text)]">
                                        {plan.price}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-xs text-[#a8a29e]">{plan.priceNote}</p>
                                <p className="mt-3 text-sm text-[var(--eixo-text-muted)]">{plan.description}</p>
                            </div>

                            {/* CTA — só aparece quando leva a algum lugar de verdade.
                                Visitante só tem caminho no plano grátis; a assinatura
                                dos pagos ainda não está aberta. */}
                            {(plan.id === 'gratis' || isAuthenticated) ? (
                            <button
                                type="button"
                                onClick={() => handleCta(plan)}
                                disabled={ctaState.disabled}
                                className={`mb-6 w-full rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:cursor-default ${
                                    ctaState.disabled
                                        ? 'border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]'
                                        : plan.ctaVariant === 'primary'
                                        ? 'bg-[var(--eixo-green)] text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]'
                                        : plan.ctaVariant === 'dark'
                                        ? 'bg-[var(--eixo-text)] text-white hover:bg-[var(--eixo-graphite)]'
                                        : 'border border-[var(--eixo-border)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]'
                                }`}
                            >
                                {ctaState.label}
                            </button>
                            ) : (
                                <p className="mb-6 w-full rounded-xl border border-dashed border-[var(--eixo-border)] py-2.5 text-center text-sm text-[var(--eixo-text-muted)]">
                                    Assinatura ainda não aberta
                                </p>
                            )}

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
                        );
                    })}
                </div>

            </div>
        </div>
    );
};

export default PlansPage;
