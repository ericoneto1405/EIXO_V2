import React, { useEffect, useId, useMemo, useState } from 'react';
import { AccountCategory } from '../../adapters/financialApi';
import { groupByGroup, normalizeSearchText } from '../financeUtils';

interface CategoryPickerProps {
    id?: string;
    categories: AccountCategory[];
    value: string;
    onChange: (id: string) => void;
    inputCls: string;
    disabled?: boolean;
}

// Campo de categoria com busca: em vez de rolar uma lista longa (72+ itens),
// a pessoa digita parte do nome e o campo filtra na hora.
const CategoryPicker: React.FC<CategoryPickerProps> = ({ id, categories, value, onChange, inputCls, disabled }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const generatedId = useId();
    const inputId = id || generatedId;
    const listId = `${inputId}-list`;
    useEffect(() => { setActiveIndex(0); }, [query]);

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

    useEffect(() => {
        if (open && filtered[activeIndex]) document.getElementById(`${listId}-${filtered[activeIndex].id}`)?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIndex, filtered, listId]);

    const grouped = useMemo(() => Array.from(groupByGroup(filtered).entries()), [filtered]);

    return (
        <div className="relative">
            <input
                id={inputId}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${filtered[activeIndex].id}` : undefined}
                type="text"
                className={inputCls}
                value={query}
                placeholder="Buscar categoria..."
                disabled={disabled}
                onFocus={() => {
                    setOpen(true);
                    setQuery('');
                }}
                onChange={(e) => { setQuery(e.target.value); onChange(''); setOpen(true); }}
                onBlur={() => setOpen(false)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault(); setOpen(true);
                        setActiveIndex((index) => Math.max(0, Math.min(filtered.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1))));
                    }
                    if (e.key === 'Enter' && open) {
                        e.preventDefault();
                        if (filtered[activeIndex]) { onChange(filtered[activeIndex].id); setOpen(false); }
                    }
                }}
            />
            {open && (
                <div id={listId} role="listbox" aria-label="Categorias" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-(--eixo-border) bg-(--eixo-surface) shadow-lg">
                    {grouped.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-(--eixo-text-muted)">Nenhuma categoria encontrada.</p>
                    ) : (
                        grouped.map(([grp, cats]) => (
                            <div key={grp}>
                                <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-(--eixo-text-muted)">
                                    {grp}
                                </p>
                                {cats.map((c) => (
                                    <button
                                        key={c.id}
                                        id={`${listId}-${c.id}`}
                                        role="option"
                                        aria-selected={c.id === value}
                                        tabIndex={-1}
                                        onMouseDown={(event) => event.preventDefault()}
                                        type="button"
                                        onClick={() => { onChange(c.id); setOpen(false); }}
                                        className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-(--eixo-surface-soft) ${
                                            c.id === filtered[activeIndex]?.id ? 'font-semibold bg-(--eixo-green-soft) text-(--eixo-text)' : c.id === value ? 'font-semibold text-(--eixo-green)' : 'text-(--eixo-text)'
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
