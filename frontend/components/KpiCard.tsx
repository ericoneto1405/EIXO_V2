
import React from 'react';

export interface KpiCardProps {
    title: string;
    icon: React.ReactNode;
    loading?: boolean;
    tone?: 'neutral' | 'success' | 'danger';
    children: React.ReactNode;
}

const TONE_STYLES: Record<NonNullable<KpiCardProps['tone']>, { card: string; icon: string }> = {
    neutral: {
        card: 'border-(--eixo-border) bg-(--eixo-surface)',
        icon: 'bg-(--eixo-green-soft) text-(--eixo-green)',
    },
    success: {
        card: 'border-(--eixo-border) bg-(--eixo-green-soft)',
        icon: 'bg-white/60 text-(--eixo-graphite)',
    },
    danger: {
        card: 'border-[rgba(184,66,50,0.16)] bg-[rgba(184,66,50,0.08)]',
        icon: 'bg-[rgba(184,66,50,0.16)] text-(--eixo-danger)',
    },
};

const KpiCard: React.FC<KpiCardProps> = ({ title, icon, loading, tone = 'neutral', children }) => {
    const styles = TONE_STYLES[tone];
    return (
        <div className={`flex min-h-[96px] flex-col rounded-2xl border p-5 shadow-xs ${styles.card}`}>
            <div className="mb-3 flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${styles.icon}`}>
                    {icon}
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-(--eixo-text-muted)">{title}</p>
            </div>
            {loading ? (
                <div className="space-y-2">
                    <div className="h-7 w-20 animate-pulse rounded-lg bg-(--eixo-surface-soft)" />
                    <div className="h-3 w-32 animate-pulse rounded-lg bg-(--eixo-surface-soft)" />
                </div>
            ) : children}
        </div>
    );
};

export default KpiCard;
