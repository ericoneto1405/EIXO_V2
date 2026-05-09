import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsItem {
    title: string;
    link: string;
    pubDate: string | null;
    description: string | null;
    source: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const relativeDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000 / 60); // minutes
    if (diff < 60) return `${diff}min atrás`;
    if (diff < 60 * 24) return `${Math.floor(diff / 60)}h atrás`;
    return `${Math.floor(diff / 60 / 24)}d atrás`;
};

// ─── Componente ───────────────────────────────────────────────────────────────

const CattleNewsCard: React.FC = () => {
    const [items, setItems] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            setError(false);
            try {
                const res = await fetch(buildApiUrl('/api/news/cattle'), { credentials: 'include' });
                if (!res.ok) throw new Error(`${res.status}`);
                const data = await res.json();
                if (!active) return;
                setItems(data?.items ?? []);
            } catch {
                if (active) setError(true);
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => { active = false; };
    }, []);

    return (
        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm overflow-hidden">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-5 py-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--eixo-green-soft)] text-lg">
                        📰
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">Notícias do Agro</p>
                        <p className="text-xs text-[var(--eixo-text-muted)]">Canal Rural, BeefPoint, Globo Rural, DBO</p>
                    </div>
                </div>
            </div>

            {/* Conteúdo */}
            {loading ? (
                <div className="divide-y divide-[var(--eixo-surface-soft)]">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="px-5 py-3.5 space-y-2">
                            <div className="h-3.5 w-full animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
                            <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--eixo-surface-soft)]" />
                        </div>
                    ))}
                </div>
            ) : error || items.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[#a8a29e]">
                    {error ? 'Não foi possível carregar as notícias.' : 'Nenhuma notícia disponível.'}
                </p>
            ) : (
                <div className="divide-y divide-[var(--eixo-surface-soft)]">
                    {items.map((item, i) => (
                        <a
                            key={i}
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col gap-0.5 px-5 py-3.5 transition-colors hover:bg-[var(--eixo-surface-soft)]"
                        >
                            <p className="line-clamp-2 text-sm font-semibold text-[var(--eixo-text)] leading-snug">
                                {item.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="rounded-full bg-[var(--eixo-green-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--eixo-graphite)]">
                                    {item.source}
                                </span>
                                {item.pubDate && (
                                    <span className="text-[11px] text-[#a8a29e]">{relativeDate(item.pubDate)}</span>
                                )}
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CattleNewsCard;
