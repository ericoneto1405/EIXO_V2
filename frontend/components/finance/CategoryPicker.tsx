import React, { useEffect, useMemo, useState } from 'react';
import { AccountCategory } from '../../adapters/financialApi';
import { groupByGroup, normalizeSearchText } from '../financeUtils';

interface CategoryPickerProps {
    categories: AccountCategory[];
    value: string;
    onChange: (id: string) => void;
    inputCls: string;
    disabled?: boolean;
}

// Campo de categoria com busca: em vez de rolar uma lista longa (72+ itens),
// a pessoa digita parte do nome e o campo filtra na hora.
const CategoryPicker: React.FC<CategoryPickerProps> = ({ categories, value, onChange, inputCls, disabled }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selected = useMemo(() => categories.find((c) => c.id === value) || null, [categories, value]);

    useEffect(() => {
        if (!open) setQuery(selected?.name ?? '');
    }, [selected, open]);

    const filtered = useMemo(() => {
        const q = normalizeSearchText(query.trim());
        if (!q) return categories;
        return categories.filter(
            (c) => normalizeSearchText(c.name).includes(q) || normalizeSearchText(c.group).includes(q),
        );
    }, [categories, query]);

    const grouped = useMemo(() => Array.from(groupByGroup(filtered).entries()), [filtered]);

    return (
        <div className="relative">
            <input
                type="text"
                className={inputCls}
                value={query}
                placeholder="Buscar categoria..."
                disabled={disabled}
                onFocus={() => {
                    setOpen(true);
                    setQuery('');
                }}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => {
                    // pequeno atraso pra deixar o clique na opção ser processado antes de fechar
                    window.setTimeout(() => setOpen(false), 120);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
                }}
            />
            {open && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-lg">
                    {grouped.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-[var(--eixo-text-muted)]">Nenhuma categoria encontrada.</p>
                    ) : (
                        grouped.map(([grp, cats]) => (
                            <div key={grp}>
                                <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                                    {grp}
                                </p>
                                {cats.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => onChange(c.id)}
                                        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--eixo-surface-soft)] ${
                                            c.id === value ? 'font-semibold text-[var(--eixo-green)]' : 'text-[var(--eixo-text)]'
                                        }`}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default CategoryPicker;
