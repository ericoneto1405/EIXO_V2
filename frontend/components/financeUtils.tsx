import React from 'react';
import { AccountCategory, CATEGORIA_LABELS, FinancialTransaction } from '../adapters/financialApi';

// ── Ícones ────────────────────────────────────────────────────────────────────

export const PlusIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
);

export const LockIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
);

export const CheckIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

export const ArrowUpCircleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V8m0 0-3.5 3.5M12 8l3.5 3.5" />
    </svg>
);

export const ArrowDownCircleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v8m0 0-3.5-3.5M12 16l3.5-3.5" />
    </svg>
);

export const ScaleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M12 3v18M5 7h14M5 7l-2.5 6a2.5 2.5 0 005 0L5 7Zm14 0l-2.5 6a2.5 2.5 0 005 0L19 7Z" />
    </svg>
);

export const CowIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M4 4h3l2 4h6l2-4h3M7 8l-1 8h12l-1-8M9 16v2M15 16v2" />
    </svg>
);

export const PillIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="4" y="9" width="16" height="6" rx="3" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeWidth={1.8} d="M12 9v6" />
    </svg>
);

export const ClockIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 7v5l3.5 2" />
    </svg>
);

export const CalendarCheckIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="15" rx="2" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 9h16M8 3v3m8-3v3M9.5 14l1.8 1.8L15 12" />
    </svg>
);

export const WalletIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M4 7a2 2 0 012-2h11a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7Z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12h3M4 9h16" />
    </svg>
);

// ── Utilitários ───────────────────────────────────────────────────────────────

export const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('pt-BR');
};

export const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const normalizeSearchText = (value: string) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

export const CATTLE_SALE_CATEGORY_NAMES = new Set([
    'venda de animais',
    'venda de bezerros',
    'venda de garrotes',
    'venda de novilhas',
    'venda de bois',
    'venda de vacas',
    'venda de touros',
    'venda de matrizes',
    'venda de reprodutores p.o.',
    'venda de animais para descarte',
]);

export const CATTLE_PURCHASE_CATEGORY_NAMES = new Set([
    'compra de animais',
    'compra de animais para producao',
    'compra de bezerros',
    'compra de garrotes',
    'compra de novilhas',
    'compra de matrizes',
    'compra de reprodutores',
]);

export const FEED_AND_MED_CATEGORY_NAMES = new Set([
    'racao / concentrado',
    'sal mineral',
    'suplementacao mineral',
    'medicamentos veterinarios',
    'vacinas',
    'vermifugos',
    'tratamentos veterinarios',
]);

export const PIE_COLORS = ['#9d7d4d', '#c08a2b', '#6e8b63', '#b35c44', '#8c6d46', '#4f7c83', '#a78b5b', '#7b8f6a'];
export const FINANCIAL_PROGRESS_EVENT = 'eixo:financial-transactions-changed';

// ── Tipos de aba ──────────────────────────────────────────────────────────────

export type FinanceTab = 'visao_geral' | 'contas_pagar' | 'contas_receber' | 'fluxo' | 'dre' | 'analytics' | 'quality' | 'plano_contas';

export const TAB_LABELS: Record<FinanceTab, string> = {
    visao_geral: 'Visão Geral',
    contas_pagar: 'Contas a Pagar',
    contas_receber: 'Contas a Receber',
    fluxo: 'Caixa realizado e projetado',
    dre: 'Resultado da operação',
    analytics: 'Custos e margens',
    quality: 'Qualidade dos dados',
    plano_contas: 'Plano de Contas',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function groupByGroup(cats: AccountCategory[]): Map<string, AccountCategory[]> {
    const map = new Map<string, AccountCategory[]>();
    for (const c of cats) {
        if (!map.has(c.group)) map.set(c.group, []);
        map.get(c.group)!.push(c);
    }
    return map;
}

export function isVencida(t: FinancialTransaction): boolean {
    if (t.status === 'PAGO') return false;
    if (!t.vencimento) return false;
    return new Date(t.vencimento) < new Date();
}

export const getCatLabel = (t: FinancialTransaction) =>
    t.accountCategoryName || CATEGORIA_LABELS[t.categoria] || t.categoria;

export function statusBadge(t: FinancialTransaction) {
    if (t.status === 'PAGO') return { label: 'Pago', cls: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' };
    if (isVencida(t)) return { label: 'Vencido', cls: 'bg-[rgba(184,66,50,0.08)] text-[var(--eixo-danger)]' };
    return { label: 'Pendente', cls: 'bg-[rgba(197,138,32,0.10)] text-[var(--eixo-warning)]' };
}
