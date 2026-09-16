import React, { useMemo, useState } from 'react';
import { createLot, type HerdAnimal, type HerdLot, type HerdType } from '../adapters/herdApi';
import { CATEGORIAS_ANIMAL } from '../constants/animalCategories';
import type { Paddock } from '../types';

type Phase = 'CRIA' | 'RECRIA' | 'ENGORDA' | 'CONFINAMENTO' | 'REPRODUCAO' | 'OUTRA';
type Mode = 'ANIMAIS' | 'QUANTIDADE';

interface NewLotFormProps {
    farmId: string;
    herdType: HerdType;
    animals: HerdAnimal[];
    lots: HerdLot[];
    paddocks: Paddock[];
    objectiveOptions: readonly string[];
    onClose: () => void;
    onCreated: () => void | Promise<void>;
}

const PHASES: { value: Phase; label: string }[] = [
    { value: 'CRIA', label: 'Cria' },
    { value: 'RECRIA', label: 'Recria' },
    { value: 'ENGORDA', label: 'Engorda' },
    { value: 'CONFINAMENTO', label: 'Confinamento' },
    { value: 'REPRODUCAO', label: 'Reprodução' },
    { value: 'OUTRA', label: 'Outra' },
];

// Kg de peso vivo que valem 1 UA.
const UA_KG = 450;

const isDrySeason = (isoDate: string) => {
    const month = new Date(`${isoDate}T12:00:00`).getMonth();
    return month >= 3 && month <= 8;
};

const suggestTargets = (phase: Phase, isoDate: string) => {
    const seca = isDrySeason(isoDate);
    const season = seca ? 'seca' : 'águas';
    switch (phase) {
        case 'RECRIA':
            return { gmd: seca ? '0,30' : '0,50', exit: '360', interval: '60', label: `recria na ${season}` };
        case 'ENGORDA':
            return { gmd: seca ? '0,50' : '0,70', exit: '540', interval: '60', label: `engorda na ${season}` };
        case 'CONFINAMENTO':
            return { gmd: '1,40', exit: '540', interval: '30', label: 'confinamento' };
        default:
            return null;
    }
};

const toNumber = (value: string) => {
    const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
    return value.trim() && Number.isFinite(parsed) ? parsed : null;
};

const formatNumber = (value: number, digits = 1) =>
    value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatDate = (date: Date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const inputClass =
    'h-11 w-full rounded-xl border border-[var(--eixo-border-strong)] bg-[var(--eixo-surface)] px-3 text-sm font-semibold text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]/20';
const labelClass = 'mb-1.5 block text-[13px] font-bold text-[var(--eixo-text)]';

const Step: React.FC<{ n: number; title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ n, title, right, children }) => (
    <section className="space-y-4 rounded-2xl bg-[var(--eixo-surface)] p-5">
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2F2F2F] text-[13px] font-extrabold text-[var(--eixo-green)]">{n}</span>
                <h4 className="text-base font-extrabold text-[var(--eixo-text)]">{title}</h4>
            </div>
            {right}
        </div>
        {children}
    </section>
);

const NumberField: React.FC<{ label: string; unit: string; value: string; onChange: (v: string) => void; suggested?: boolean }> = ({ label, unit, value, onChange, suggested }) => (
    <div>
        <label className={labelClass}>{label}</label>
        <div className={`flex h-11 items-center rounded-xl border px-3 ${suggested ? 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)]' : 'border-[var(--eixo-border-strong)] bg-[var(--eixo-surface)]'}`}>
            <input
                inputMode="decimal"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full bg-transparent text-sm font-bold text-[var(--eixo-text)] focus:outline-none"
            />
            <span className="ml-2 shrink-0 text-sm text-[var(--eixo-text-muted)]">{unit}</span>
        </div>
    </div>
);

const NewLotForm: React.FC<NewLotFormProps> = ({ farmId, herdType, animals, lots, paddocks, objectiveOptions, onClose, onCreated }) => {
    const today = new Date().toISOString().slice(0, 10);
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState(today);
    const [phase, setPhase] = useState<Phase | ''>('');
    const [categoria, setCategoria] = useState('');
    const [paddockId, setPaddockId] = useState('');
    const [mode, setMode] = useState<Mode>('ANIMAIS');
    const [selected, setSelected] = useState<Record<string, string>>({});
    const [search, setSearch] = useState('');
    const [headcount, setHeadcount] = useState('');
    const [avgWeight, setAvgWeight] = useState('');
    const [targetGmd, setTargetGmd] = useState('');
    const [targetExit, setTargetExit] = useState('');
    const [interval, setIntervalDays] = useState('');
    const [targetsTouched, setTargetsTouched] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [objective, setObjective] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const suggestion = phase ? suggestTargets(phase, startDate || today) : null;
    const lotNameById = useMemo(() => new Map(lots.map((lot) => [lot.id, lot.name])), [lots]);

    const applySuggestion = (nextPhase: Phase | '', nextDate: string) => {
        if (targetsTouched) return;
        const next = nextPhase ? suggestTargets(nextPhase, nextDate || today) : null;
        setTargetGmd(next?.gmd ?? '');
        setTargetExit(next?.exit ?? '');
        setIntervalDays(next?.interval ?? '');
    };

    const touchTarget = (setter: (v: string) => void) => (value: string) => {
        setTargetsTouched(true);
        setter(value);
    };

    const filteredAnimals = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = term
            ? animals.filter((animal) =>
                [animal.identificacao, animal.brinco, animal.nome, animal.categoria]
                    .some((value) => String(value || '').toLowerCase().includes(term)))
            : animals;
        return list.slice(0, 200);
    }, [animals, search]);

    const selectedIds = Object.keys(selected);
    const typedWeights = selectedIds.map((id) => toNumber(selected[id])).filter((v): v is number => v !== null && v > 0);
    const weightsAvg = typedWeights.length ? typedWeights.reduce((a, b) => a + b, 0) / typedWeights.length : null;

    const count = mode === 'ANIMAIS' ? selectedIds.length : Math.round(toNumber(headcount) ?? 0);
    const entryAvg = mode === 'ANIMAIS' ? (weightsAvg ?? toNumber(avgWeight)) : toNumber(avgWeight);
    const gmdValue = toNumber(targetGmd);
    const exitValue = toNumber(targetExit);
    const intervalValue = toNumber(interval);

    const daysToExit = entryAvg && exitValue && gmdValue && exitValue > entryAvg ? Math.ceil((exitValue - entryAvg) / gmdValue) : null;
    const baseDate = new Date(`${startDate || today}T12:00:00`);
    const nextWeighing = intervalValue ? new Date(baseDate.getTime() + intervalValue * 86400000) : null;

    const paddock = paddocks.find((item) => item.id === paddockId) || null;
    const stocking = useMemo(() => {
        if (!paddock?.areaHa || !count || !entryAvg) return null;
        const moving = new Set(mode === 'ANIMAIS' ? selectedIds : []);
        const currentUa = animals
            .filter((animal) => animal.currentPaddockId === paddock.id && !moving.has(animal.id))
            .reduce((sum, animal) => sum + (animal.ultimoPeso || UA_KG) / UA_KG, 0);
        const before = currentUa / paddock.areaHa;
        const after = (currentUa + (count * entryAvg) / UA_KG) / paddock.areaHa;
        return { before, after, limit: paddock.lotacaoUaHa ?? null };
    }, [paddock, count, entryAvg, animals, mode, selectedIds]);

    const toggleAnimal = (animal: HerdAnimal) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (animal.id in next) delete next[animal.id];
            else next[animal.id] = '';
            return next;
        });
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return setError('Dê um nome ao lote.');
        if (!phase) return setError('Escolha a fase do lote.');
        if (!categoria) return setError('Escolha a categoria dos animais.');
        if (!paddockId) return setError('Informe onde o lote vai ficar.');
        if (!count) return setError(mode === 'ANIMAIS' ? 'Escolha os animais do lote.' : 'Informe quantas cabeças tem o lote.');
        if (!entryAvg) return setError('Informe o peso de entrada. Sem ele não dá para calcular o ganho de peso.');

        setSaving(true);
        setError(null);
        try {
            await createLot(farmId, herdType, {
                name: name.trim(),
                productionPhase: phase,
                startDate,
                categoria,
                paddockId,
                objective: objective || undefined,
                notes: notes.trim() || undefined,
                targetGmd: targetGmd || undefined,
                targetExitWeight: targetExit || undefined,
                weighIntervalDays: interval || undefined,
                ...(mode === 'ANIMAIS'
                    ? {
                        animalIds: selectedIds,
                        entryWeights: selectedIds
                            .filter((id) => toNumber(selected[id]))
                            .map((id) => ({ animalId: id, peso: toNumber(selected[id]) })),
                        entryWeightAvg: weightsAvg ? undefined : avgWeight,
                    }
                    : { entryHeadcount: count, entryWeightAvg: avgWeight }),
            });
            await onCreated();
        } catch (err: any) {
            setError(err?.message || 'Não foi possível criar o lote.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#EDEDED]" role="dialog" aria-modal="true">
            <form onSubmit={handleSubmit} className="mx-auto max-w-6xl space-y-6 px-6 py-7">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-[13px] font-semibold text-[var(--eixo-text-muted)]">Lotes / Novo lote</p>
                        <h3 className="text-[28px] font-extrabold tracking-tight text-[var(--eixo-text)]">Novo lote</h3>
                    </div>
                    <div className="flex gap-2.5">
                        <button type="button" onClick={onClose} className="h-11 rounded-xl border border-[var(--eixo-border-strong)] px-5 text-sm font-bold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface)]">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving} className="h-11 rounded-xl bg-[var(--eixo-green)] px-6 text-sm font-extrabold text-[#2F2F2F] hover:bg-[var(--eixo-green-dark)] disabled:opacity-60">
                            {saving ? 'Criando...' : 'Criar lote'}
                        </button>
                    </div>
                </header>

                {error && <p className="rounded-xl bg-[var(--eixo-surface)] px-4 py-3 text-sm font-semibold text-[var(--eixo-danger)]">{error}</p>}

                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1 space-y-4">
                        <Step n={1} title="Identificação">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={labelClass}>Nome do lote *</label>
                                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Garrotes 04" className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Data de entrada *</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => { setStartDate(e.target.value); applySuggestion(phase, e.target.value); }}
                                        className={inputClass}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Fase *</label>
                                <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                                    {PHASES.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => { setPhase(option.value); applySuggestion(option.value, startDate); }}
                                            className={`h-11 rounded-xl text-sm font-bold ${phase === option.value ? 'bg-[#2F2F2F] text-white' : 'border border-[var(--eixo-border-strong)] text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]'}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={labelClass}>Categoria *</label>
                                    <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputClass}>
                                        <option value="">Selecione...</option>
                                        {CATEGORIAS_ANIMAL.map((item) => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Onde fica *</label>
                                    <select value={paddockId} onChange={(e) => setPaddockId(e.target.value)} className={inputClass}>
                                        <option value="">{paddocks.length ? 'Selecione o pasto...' : 'Cadastre um pasto primeiro'}</option>
                                        {paddocks.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {[item.name, item.forrageira, item.areaHa ? `${formatNumber(item.areaHa, 0)} ha` : null].filter(Boolean).join(' · ')}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </Step>

                        <Step n={2} title="Animais e peso de entrada">
                            <div className="inline-flex gap-1 rounded-xl bg-[var(--eixo-surface-soft)] p-1">
                                {([['ANIMAIS', 'Escolher animais'], ['QUANTIDADE', 'Só quantidade']] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setMode(value)}
                                        className={`rounded-lg px-4 py-2 text-[13px] font-bold ${mode === value ? 'bg-[var(--eixo-surface)] text-[var(--eixo-text)] shadow-sm' : 'text-[var(--eixo-text-muted)]'}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {mode === 'QUANTIDADE' ? (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <NumberField label="Quantidade de cabeças *" unit="cab" value={headcount} onChange={setHeadcount} />
                                    <NumberField label="Peso médio de entrada *" unit="kg" value={avgWeight} onChange={setAvgWeight} />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Buscar por brinco, nome ou categoria"
                                        className={inputClass}
                                    />
                                    <div className="max-h-72 divide-y divide-[var(--eixo-border)] overflow-y-auto rounded-xl border border-[var(--eixo-border)]">
                                        {filteredAnimals.length === 0 && (
                                            <p className="p-4 text-sm text-[var(--eixo-text-muted)]">Nenhum animal encontrado.</p>
                                        )}
                                        {filteredAnimals.map((animal) => {
                                            const checked = animal.id in selected;
                                            const currentLot = animal.lotId ? lotNameById.get(animal.lotId) : null;
                                            return (
                                                <div key={animal.id} className={`flex min-h-[48px] items-center gap-3 px-3 py-2 ${checked ? 'bg-[var(--eixo-green-soft)]' : ''}`}>
                                                    <input type="checkbox" checked={checked} onChange={() => toggleAnimal(animal)} className="h-5 w-5 accent-[#2F2F2F]" />
                                                    <button type="button" onClick={() => toggleAnimal(animal)} className="min-w-0 flex-1 text-left">
                                                        <span className="block truncate text-sm font-bold text-[var(--eixo-text)]">{animal.identificacao}</span>
                                                        <span className="block truncate text-xs text-[var(--eixo-text-muted)]">
                                                            {[animal.categoria, animal.ultimoPeso ? `${formatNumber(animal.ultimoPeso, 0)} kg` : null, currentLot ? `sai do lote ${currentLot}` : null].filter(Boolean).join(' · ')}
                                                        </span>
                                                    </button>
                                                    {checked && (
                                                        <div className="flex h-9 w-28 items-center rounded-lg border border-[var(--eixo-border-strong)] bg-[var(--eixo-surface)] px-2">
                                                            <input
                                                                inputMode="decimal"
                                                                value={selected[animal.id]}
                                                                onChange={(e) => setSelected((prev) => ({ ...prev, [animal.id]: e.target.value }))}
                                                                placeholder="Peso"
                                                                className="w-full bg-transparent text-sm font-semibold focus:outline-none"
                                                            />
                                                            <span className="text-xs text-[var(--eixo-text-muted)]">kg</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="grid items-end gap-4 sm:grid-cols-2">
                                        <div className="flex h-11 items-center rounded-xl bg-[var(--eixo-surface-soft)] px-3 text-sm font-bold text-[var(--eixo-text)]">
                                            {selectedIds.length} {selectedIds.length === 1 ? 'animal escolhido' : 'animais escolhidos'}
                                            {typedWeights.length > 0 && ` · ${typedWeights.length} com peso`}
                                        </div>
                                        {weightsAvg ? (
                                            <div className="flex h-11 items-center rounded-xl bg-[var(--eixo-surface-soft)] px-3 text-sm font-bold text-[var(--eixo-text)]">
                                                Peso médio: {formatNumber(weightsAvg)} kg
                                            </div>
                                        ) : (
                                            <NumberField label="Peso médio (se não pesou um a um) *" unit="kg" value={avgWeight} onChange={setAvgWeight} />
                                        )}
                                    </div>
                                </div>
                            )}
                        </Step>

                        <Step
                            n={3}
                            title="Metas do lote"
                            right={suggestion && !targetsTouched ? (
                                <span className="rounded-full bg-[var(--eixo-green-soft)] px-3 py-1 text-xs font-extrabold text-[#4d6b0a]">Sugerido para {suggestion.label}</span>
                            ) : null}
                        >
                            <div className="grid gap-4 sm:grid-cols-3">
                                <NumberField label="Ganho de peso esperado" unit="kg/dia" value={targetGmd} onChange={touchTarget(setTargetGmd)} suggested={Boolean(suggestion) && !targetsTouched} />
                                <NumberField label="Peso de saída" unit="kg" value={targetExit} onChange={touchTarget(setTargetExit)} suggested={Boolean(suggestion) && !targetsTouched} />
                                <NumberField label="Pesar pelo menos a cada" unit="dias" value={interval} onChange={touchTarget(setIntervalDays)} suggested={Boolean(suggestion) && !targetsTouched} />
                            </div>
                        </Step>

                        <section className="rounded-2xl bg-[var(--eixo-surface)]">
                            <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
                                <span>
                                    <span className="block text-[15px] font-extrabold text-[var(--eixo-text)]">Mais detalhes</span>
                                    <span className="block text-[13px] text-[var(--eixo-text-muted)]">Finalidade e observações — pode preencher depois</span>
                                </span>
                                <span className="text-xl font-bold text-[var(--eixo-text-muted)]">{detailsOpen ? '−' : '+'}</span>
                            </button>
                            {detailsOpen && (
                                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
                                    <div>
                                        <label className={labelClass}>Finalidade</label>
                                        <select value={objective} onChange={(e) => setObjective(e.target.value)} className={inputClass}>
                                            <option value="">Não definida</option>
                                            {objectiveOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Observações</label>
                                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-[var(--eixo-border-strong)] px-3 py-2 text-sm focus:border-[var(--eixo-green)] focus:outline-none" />
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="w-full space-y-4 lg:sticky lg:top-6 lg:w-[340px]">
                        <div className="space-y-4 rounded-2xl bg-[#2F2F2F] p-5 text-white">
                            <p className="text-[13px] font-bold text-white/60">Como vai aparecer no painel</p>
                            <div>
                                <p className="text-lg font-extrabold">{name.trim() || 'Nome do lote'}</p>
                                <p className="text-[13px] text-white/60">
                                    {[PHASES.find((p) => p.value === phase)?.label, count ? `${count} cab` : null, paddock?.name].filter(Boolean).join(' · ') || 'Preencha os dados ao lado'}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                {[
                                    ['Entrada', entryAvg ? `${formatNumber(entryAvg, 0)} kg` : '—', false],
                                    ['Meta de saída', exitValue ? `${formatNumber(exitValue, 0)} kg` : '—', false],
                                    ['Previsão de saída', daysToExit ? `~${daysToExit} dias` : '—', true],
                                    ['Próxima pesagem', nextWeighing ? `até ${formatDate(nextWeighing)}` : '—', false],
                                ].map(([label, value, highlight]) => (
                                    <div key={String(label)} className="rounded-xl bg-white/10 p-3">
                                        <p className="text-xs text-white/60">{label}</p>
                                        <p className={`text-lg font-extrabold ${highlight ? 'text-[var(--eixo-green)]' : ''}`}>{value}</p>
                                    </div>
                                ))}
                            </div>
                            {paddock && (
                                <div className="border-t border-white/15 pt-3">
                                    <p className="text-[13px] font-bold">Lotação do {paddock.name}</p>
                                    <p className="text-[13px] text-white/60">
                                        {stocking
                                            ? `Passa de ${formatNumber(stocking.before)} para ${formatNumber(stocking.after)} UA/ha${stocking.limit ? (stocking.after > stocking.limit ? ` · acima do limite de ${formatNumber(stocking.limit)}` : ' · dentro do limite') : ''}`
                                            : paddock.areaHa ? 'Informe animais e peso para calcular.' : 'Cadastre a área do pasto para calcular.'}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-2 rounded-2xl bg-[var(--eixo-surface)] p-5">
                            <p className="text-sm font-extrabold text-[var(--eixo-text)]">Por que pedimos isso?</p>
                            <p className="text-[13px] leading-relaxed text-[var(--eixo-text-muted)]">
                                Com fase, peso de entrada e meta, o ganho de peso sai certo por lote — sem média falsa do rebanho inteiro.
                            </p>
                        </div>
                    </aside>
                </div>
            </form>
        </div>
    );
};

export default NewLotForm;
