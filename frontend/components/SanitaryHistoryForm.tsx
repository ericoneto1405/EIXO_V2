import React, { useEffect, useRef, useState } from 'react';
import { fetchSanityOptions, HistoricalApplicationPayload, previewHistory, Previa, SanityApiError, SanityOptions, saveHistory } from '../adapters/sanityApi';
import PharmacyModule from './PharmacyModule';

export interface ImportedSanitaryAnimal { id: string; identificacao: string }
interface Props { farmId: string; farmName?: string | null; initialAnimals?: ImportedSanitaryAnimal[]; onSaved: () => void; onClose: () => void; onPendingChange?: (pending: boolean) => void }
const input = 'mt-1 w-full rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2.5 text-sm';
const primary = 'rounded-xl bg-(--eixo-green) px-4 py-2.5 text-sm font-bold text-(--eixo-text) disabled:opacity-50';
const secondary = 'rounded-xl border border-(--eixo-border) px-4 py-2.5 text-sm font-semibold';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const SanitaryHistoryForm: React.FC<Props> = ({ farmId, farmName, initialAnimals = [], onSaved, onClose, onPendingChange }) => {
    const [options, setOptions] = useState<SanityOptions | null>(null);
    const [step, setStep] = useState(1);
    const [mode, setMode] = useState<'IDS' | 'TEXT' | 'LOT'>(initialAnimals.length ? 'IDS' : 'TEXT');
    const [selected, setSelected] = useState(initialAnimals.map(a => a.id));
    const [text, setText] = useState('');
    const [lotId, setLotId] = useState('');
    const [productId, setProductId] = useState('');
    const [date, setDate] = useState('');
    const [dose, setDose] = useState('');
    const [responsible, setResponsible] = useState('');
    const [notes, setNotes] = useState('');
    const [preview, setPreview] = useState<Previa | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [pharmacy, setPharmacy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { heading.current?.focus(); }, [step, pharmacy, success]);
    useEffect(() => { onPendingChange?.(busy || uncertain); }, [busy, uncertain, onPendingChange]);
    const operation = useRef<{ content: string; requestId: string } | null>(null);
    const refresh = async () => {
        try { setOptions(await fetchSanityOptions(farmId)); }
        catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar produtos.'); }
    };
    useEffect(() => { void refresh(); }, [farmId]);
    const product = options?.products.find(p => p.id === productId);
    const ids: string[] = [...new Set<string>(String(text).split(/[\s,;]+/).filter(Boolean))];
    const count = mode === 'IDS' ? selected.length : mode === 'TEXT' ? ids.length : options?.lots.find(l => l.id === lotId)?.animals || 0;
    const content = () => ({ productId, appliedAt: date, dose: dose.trim() ? Number(dose.replace(',', '.')) : null, doseUnit: dose.trim() ? product?.applicationUnit || 'ml' : null, appliedByName: responsible, notes, selecao: mode === 'IDS' ? { animalIds: selected } : mode === 'TEXT' ? { brincos: ids } : { lotId } });
    const payload = (): HistoricalApplicationPayload => {
        const data = content();
        const signature = JSON.stringify(data);
        if (!operation.current || operation.current.content !== signature) operation.current = { content: signature, requestId: crypto.randomUUID() };
        return { ...data, requestId: operation.current.requestId };
    };
    const check = async () => {
        setBusy(true); setError(null);
        try { setPreview(await previewHistory(farmId, payload())); setStep(3); }
        catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível conferir.'); }
        finally { setBusy(false); }
    };
    const save = async () => {
        setBusy(true); setError(null);
        try {
            const result = await saveHistory(farmId, payload());
            setSuccess(`Histórico registrado para ${result.aplicados} ${result.aplicados === 1 ? 'animal' : 'animais'}.`); setUncertain(false); onSaved();
        } catch (e) {
            if (e instanceof SanityApiError && e.previa) setPreview(e.previa);
            setUncertain(!(e instanceof SanityApiError) || e.status >= 500);
            setError(e instanceof Error ? e.message : 'Não foi possível confirmar o resultado. Repita o mesmo envio para consultar ou concluir a operação.');
        } finally { setBusy(false); }
    };
    if (pharmacy) return <div className="space-y-4">
        <button className={secondary} onClick={() => { setPharmacy(false); void refresh(); }}>Voltar ao histórico sanitário</button>
        <PharmacyModule productOnly farmId={farmId} onProductCreated={id => { setProductId(id); setPharmacy(false); void refresh(); }} />
    </div>;
    return <section className="space-y-4 rounded-2xl border border-(--eixo-border) bg-(--eixo-surface) p-5">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-bold">Registrar aplicação anterior</h2>
        <p className="text-sm">{farmName || 'Fazenda selecionada'} · {count} animais selecionados</p>
        <p className="text-sm text-(--eixo-text-muted)">Registra uma aplicação anterior, sem alterar estoque ou Financeiro.</p>
        {error && <p role="alert" className="text-sm text-(--eixo-danger)">{error}</p>}
        {!options && error && <button className={secondary} onClick={() => void refresh()}>Tentar carregar produtos novamente</button>}
        {uncertain && <p role="alert" className="text-sm">O resultado ainda não foi confirmado. Repita o mesmo envio antes de alterar os dados.</p>}
        {success ? <div className="space-y-3">
            <p role="status">{success}</p>
            <div className="flex flex-wrap gap-2"><button className={primary} onClick={() => { setSuccess(null); setStep(2); setProductId(''); setDate(''); setDose(''); setResponsible(''); setNotes(''); setPreview(null); operation.current = null; }}>Registrar outra aplicação anterior</button><button className={secondary} onClick={onClose}>Concluir</button></div>
        </div> : <>
            <ol className="flex flex-wrap gap-3 text-sm" aria-label="Etapas"><li aria-current={step === 1 ? 'step' : undefined}>1. Animais</li><li aria-current={step === 2 ? 'step' : undefined}>2. Dados da aplicação</li><li aria-current={step === 3 ? 'step' : undefined}>3. Conferir</li></ol>
            {step === 1 && <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    {initialAnimals.length > 0 && <button className={mode === 'IDS' ? primary : secondary} onClick={() => setMode('IDS')}>Animais importados</button>}
                    <button className={mode === 'TEXT' ? primary : secondary} onClick={() => setMode('TEXT')}>Por identificação</button>
                    <button className={mode === 'LOT' ? primary : secondary} onClick={() => setMode('LOT')}>Lote inteiro</button>
                </div>
                {mode === 'IDS' && <div><div className="mb-2 flex gap-2"><button className={secondary} onClick={() => setSelected(initialAnimals.map(a => a.id))}>Selecionar todos os importados</button><button className={secondary} onClick={() => setSelected([])}>Limpar seleção</button></div><div className="max-h-64 overflow-auto">{initialAnimals.map(a => <label className="flex gap-2 py-2" key={a.id}><input type="checkbox" checked={selected.includes(a.id)} onChange={e => setSelected(e.target.checked ? [...selected, a.id] : selected.filter(id => id !== a.id))} />{a.identificacao}</label>)}</div></div>}
                {mode === 'TEXT' && <label className="block text-sm">Identificações (separe por espaço, vírgula ou linha)<textarea className={input} rows={5} value={text} onChange={e => setText(e.target.value)} /></label>}
                {mode === 'LOT' && <label className="block text-sm">Lote de animais<select className={input} value={lotId} onChange={e => setLotId(e.target.value)}><option value="">Selecione</option>{options?.lots.map(l => <option value={l.id} key={l.id}>{l.name} · {l.animals} animais</option>)}</select></label>}
                {count > 2000 && <p role="alert">Selecione no máximo 2.000 animais. Divida a seleção em grupos.</p>}
                <button className={primary} disabled={!count || count > 2000} onClick={() => setStep(2)}>Continuar</button>
            </div>}
            {step === 2 && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void check(); }}>
                <label className="block text-sm">Produto da Farmácia<select required className={input} value={productId} onChange={e => { setProductId(e.target.value); setDose(''); }}><option value="">Selecione</option>{options?.products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
                <button type="button" className={secondary} onClick={() => setPharmacy(true)}>Cadastrar produto</button>
                <label className="block text-sm">Data da aplicação<input required type="date" max={today()} className={input} value={date} onChange={e => setDate(e.target.value)} /></label>
                <label className="block text-sm">Dose por animal ({product?.applicationUnit || 'unidade do produto'}) — opcional<input type="number" min="0.0001" step="any" className={input} value={dose} onChange={e => setDose(e.target.value)} /></label>
                <p className="text-xs text-(--eixo-text-muted)">Deixe vazia se desconhecida. Informe somente a dose realmente aplicada; o peso atual não será usado.</p>
                <label className="block text-sm">Aplicado por — opcional<input className={input} value={responsible} onChange={e => setResponsible(e.target.value)} /></label>
                <label className="block text-sm">Observações — opcional<textarea className={input} value={notes} onChange={e => setNotes(e.target.value)} /></label>
                <div className="flex gap-2"><button type="button" className={secondary} onClick={() => setStep(1)}>Voltar</button><button className={primary} disabled={!options || busy}>Conferir</button></div>
            </form>}
            {step === 3 && preview && <div className="space-y-3">
                <p className="font-semibold">{product?.name} · {date.split('-').reverse().join('/')} · {preview.resumo.total} animais</p>
                {[...preview.bloqueiosGerais, ...preview.avisosGerais].map((message, i) => <p role="status" key={i}>{message}</p>)}
                {preview.naoEncontrados.length > 0 && <p>Não encontrados: {preview.naoEncontrados.join(', ')}</p>}
                {preview.repetidos.length > 0 && <p>Identificações repetidas: {preview.repetidos.join(', ')}</p>}
                <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><caption className="text-left">Animais abrangidos</caption><thead><tr><th className="p-2">Animal</th><th className="p-2">Dose</th><th className="p-2">Conferência</th></tr></thead><tbody>{preview.linhas.map(a => <tr className="border-t border-(--eixo-border)" key={a.animalId}><td className="p-2">{a.brinco}</td><td className="p-2">{a.dose === null ? 'Não informada' : `${a.dose} ${preview.resumo.unidadeDose}`}</td><td className="p-2">{a.apto ? 'Liberado' : a.bloqueios.join(' ')} {a.avisos.join(' ')}</td></tr>)}</tbody></table></div>
                <div className="flex flex-wrap gap-2"><button className={secondary} disabled={busy || uncertain} onClick={() => { setStep(2); setPreview(null); }}>Voltar</button><button className={primary} disabled={busy || preview.bloqueiosGerais.length > 0 || preview.resumo.bloqueados > 0 || !preview.resumo.total} onClick={() => void save()}>{busy ? 'Salvando...' : uncertain ? 'Consultar ou concluir o mesmo envio' : 'Salvar histórico'}</button></div>
            </div>}
            <button className={secondary} disabled={busy || uncertain} onClick={onClose}>Cancelar</button>
        </>}
    </section>;
}

export default SanitaryHistoryForm;
