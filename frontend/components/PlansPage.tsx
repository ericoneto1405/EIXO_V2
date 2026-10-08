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
    ctaVariant: 'outline-solid' | 'primary' | 'dark';
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
        ctaVariant: 'outline-solid',
        features: [
            { text: 'Animais ilimitados', included: true },
            { text: '1 fazenda', included: true },
            { text: 'Até 3 usuários', included: true },
            { text: 'Manejo do Rebanho completo', included: true },
            { text: 'Estrutura da Fazenda', included: true },
            { text: 'Importação da sua planilha atual', included: true },
            { text: 'App EIXO Campo com operação offline', included: false },
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
            { text: 'Gestão Comercial: CRM de clientes e negociações', included: true },
            { text: 'Exportação de dados (Excel/CSV)', included: true },
            { text: 'Nutrição avançada', included: true },
            { text: 'Até 3 fazendas', included: true },
            { text: 'Até 5 usuários', included: true },
            { text: 'App EIXO Campo com operação offline', included: false },
            { text: 'Eixo Acasalamento', included: false },
            { text: 'Confinamento e contratos', included: false },
            { text: 'Meus Leilões: sócios, documentos e resultado do plantel', included: false },
        ],
    },
    {
        id: 'decisao',
        code: 'EIXO_DECISAO',
        name: 'EIXO Performance',
        price: 'R$247/mês',
        priceNote: 'R$197/mês no plano anual',
        description: 'Genética, confinamento e plantel de leilão para quem opera em escala, sem limite de fazendas.',
        cta: 'Solicitar upgrade',
        ctaVariant: 'dark',
        features: [
            { text: 'Tudo do EIXO Gestão', included: true },
            { text: 'Fazendas ilimitadas', included: true },
            { text: 'Usuários ilimitados', included: true },
            { text: 'App EIXO Campo com operação offline', included: true },
            { text: 'Eixo Acasalamento', included: true },
            { text: 'Confinamento e contratos', included: true },
            { text: 'Meus Leilões: sócios, documentos e resultado do plantel, sem taxa por animal', included: true },
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
    <svg className="h-4 w-4 shrink-0 text-(--eixo-green)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);

const XIcon: React.FC = () => (
    <svg className="h-4 w-4 shrink-0 text-[#a8a29e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="min-h-screen bg-(--eixo-surface-soft)">
            {/* Header */}
            <header className="border-b border-(--eixo-border) bg-(--eixo-surface) px-4 py-4 sm:px-6">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-4 py-2 text-sm font-semibold text-(--eixo-text-muted) transition-colors hover:bg-(--eixo-surface-soft) hover:text-(--eixo-text)"
                    >
                        <span aria-hidden="true">←</span>
                        Voltar
                    </button>
                    <div className="inline-flex shrink-0 flex-col items-center leading-none">
                        <img src="/logo_eixo_institucional.svg" alt="EIXO — Gestão para Pecuária de Corte" width={180} height={72} className="h-auto w-[180px] max-w-full" />
                    </div>
                    <div className="hidden w-[92px] shrink-0 sm:block" aria-hidden="true" />
                </div>
            </header>

            {/* Hero */}
            <div className="mx-auto max-w-5xl px-6 py-12 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-(--eixo-green) bg-(--eixo-green-soft) px-4 py-1 text-xs font-bold uppercase tracking-[0.18em] text-(--eixo-graphite) mb-4">
                    ACESSO ANTECIPADO
                </div>
                <h1 className="font-brand text-3xl font-extrabold text-(--eixo-text) md:text-4xl">
                    Comece gratuitamente no EIXO Essencial. Evolua quando precisar avançar!
                </h1>
                <p className="mt-3 text-base text-(--eixo-text-muted) max-w-md mx-auto">
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
                                : 'border-(--eixo-green) bg-(--eixo-green-soft) text-(--eixo-graphite)'
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
                                className={`relative flex flex-col rounded-2xl border bg-(--eixo-surface) p-6 transition-all duration-150 ease-in-out hover:-translate-y-1 hover:border-(--eixo-green) hover:shadow-xl hover:shadow-(--eixo-green)/15 ${
                                    isCurrentPlan || plan.id === 'gestao'
                                        ? 'border-(--eixo-green) shadow-lg shadow-(--eixo-green)/10'
                                        : 'border-(--eixo-border)'
                                }`}
                            >
                            {/* Badge */}
                            {badge && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="rounded-full bg-(--eixo-green) px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
                                        {badge}
                                    </span>
                                </div>
                            )}

                            {/* Nome e preço */}
                            <div className="mb-5">
                                <p className="text-xs font-semibold uppercase tracking-widest text-(--eixo-text-muted)">
                                    {plan.name}
                                </p>
                                <div className="mt-2 flex items-baseline gap-1">
                                    <span className="font-brand text-3xl font-extrabold text-(--eixo-text)">
                                        {plan.price}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-xs text-[#a8a29e]">{plan.priceNote}</p>
                                <p className="mt-3 text-sm text-(--eixo-text-muted)">{plan.description}</p>
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
                                        ? 'border border-(--eixo-border) bg-(--eixo-surface-soft) text-(--eixo-text-muted)'
                                        : plan.ctaVariant === 'primary'
                                        ? 'bg-(--eixo-green) text-[#1a1a1a] hover:bg-(--eixo-green-dark)'
                                        : plan.ctaVariant === 'dark'
                                        ? 'bg-(--eixo-text) text-white hover:bg-(--eixo-graphite)'
                                        : 'border border-(--eixo-border) text-(--eixo-text-muted) hover:bg-(--eixo-surface-soft) hover:text-(--eixo-text)'
                                }`}
                            >
                                {ctaState.label}
                            </button>
                            ) : (
                                <p className="mb-6 w-full rounded-xl border border-dashed border-(--eixo-border) py-2.5 text-center text-sm text-(--eixo-text-muted)">
                                    Assinatura ainda não aberta
                                </p>
                            )}

                            {/* Divider */}
                            <div className="mb-4 border-t border-(--eixo-border)" />

                            {/* Features */}
                            <ul className="flex-1 space-y-2.5">
                                {plan.features.map((f) => (
                                    <li key={f.text} className="flex items-start gap-2.5">
                                        {f.included ? <CheckIcon /> : <XIcon />}
                                        <span className={`text-sm ${f.included ? 'text-(--eixo-text)' : 'text-[#a8a29e] line-through'}`}>
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
