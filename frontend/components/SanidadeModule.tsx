import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AnimalEmCarencia,
    AplicacaoPayload,
    AplicacaoResumo,
    CustoSanitario,
    DoseModo,
    Previa,
    SanityApiError,
    SanityOptions,
    fetchSanityOptions,
    listarAplicacoes,
    listarCarencia,
    listarCustos,
    previewAplicacao,
    salvarAplicacao,
} from '../adapters/sanityApi';
import PharmacyModule from './PharmacyModule';

interface SanidadeModuleProps {
    farmId?: string | null;
    farmName?: string | null;
}

type Passo = 1 | 2 | 3 | 4;
type ModoSelecao = 'IDENTIFICACAO' | 'LOTE';
type Aba = 'APLICACOES' | 'FARMACIA';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const ROUTE_LABELS: Record<string, string> = {
    SUBCUTANEA: 'Subcutânea',
    INTRAMUSCULAR: 'Intramuscular',
    INTRAVENOSA: 'Na veia',
    ORAL: 'Oral',
    POUR_ON: 'Pour-on (no dorso)',
    PULVERIZACAO: 'Pulverização',
    IMERSAO: 'Banho de imersão',
    OUTRA: 'Outra',
};

const PASSOS: { id: Passo; label: string }[] = [
    { id: 1, label: 'Animais' },
    { id: 2, label: 'Produto' },
    { id: 3, label: 'Como aplicar' },
    { id: 4, label: 'Conferir' },
];

const hoje = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const formatDate = (value: string | null | undefined) => (value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—');
const formatNumber = (value: number | null | undefined, digits = 2) =>
    value === null || value === undefined ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
const formatMoney = (value: number | null | undefined) =>
    (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const parseIdentificacoes = (texto: string) =>
    [...new Set(texto.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))];

const sugerirVia = (texto: string | null) => {
    const t = (texto || '').toLowerCase();
    if (t.includes('subcut')) return 'SUBCUTANEA';
    if (t.includes('intramus')) return 'INTRAMUSCULAR';
    if (t.includes('oral')) return 'ORAL';
    if (t.includes('pulveriz')) return 'PULVERIZACAO';
    if (t.includes('dorso')) return 'POUR_ON';
    return '';
};

const Aviso: React.FC<{ tone: 'danger' | 'warning' | 'success'; children: React.ReactNode }> = ({ tone, children }) => {
    const styles = {
        danger: 'border-[#efc2ba] bg-[#fff2ef] text-[var(--eixo-danger)]',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        success: 'border-[#b6d4b0] bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]',
    }[tone];
    return <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${styles}`}>{children}</div>;
};

const SanidadeModule: React.FC<SanidadeModuleProps> = ({ farmId, farmName }) => {
    const [aba, setAba] = useState<Aba>('APLICACOES');
    const [options, setOptions] = useState<SanityOptions | null>(null);
    const [historico, setHistorico] = useState<AplicacaoResumo[]>([]);
    const [carencia, setCarencia] = useState<AnimalEmCarencia[]>([]);
    const [custos, setCustos] = useState<CustoSanitario | null>(null);
    const [verAnimais, setVerAnimais] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [passo, setPasso] = useState<Passo>(1);
    const [modoSelecao, setModoSelecao] = useState<ModoSelecao>('IDENTIFICACAO');
    const [identificacoesTexto, setIdentificacoesTexto] = useState('');
    const [lotId, setLotId] = useState('');
    const [productId, setProductId] = useState('');
    const [batchId, setBatchId] = useState('');
    const [rendimento, setRendimento] = useState('');
    const [appliedAt, setAppliedAt] = useState(hoje());
    const [doseModo, setDoseModo] = useState<DoseModo>('FIXA');
    const [doseFixa, setDoseFixa] = useState('');
    const [dosePorKgTexto, setDosePorKgTexto] = useState({ ml: '', kg: '' });
    const [route, setRoute] = useState('');
    const [appliedByName, setAppliedByName] = useState('');
    const [vetName, setVetName] = useState('');
    const [vetCrmv, setVetCrmv] = useState('');
    const [notes, setNotes] = useState('');

    const [previa, setPrevia] = useState<Previa | null>(null);
    const [checking, setChecking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [somenteAptos, setSomenteAptos] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        if (!farmId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const [opcoes, lista, emCarencia, custo] = await Promise.all([
                fetchSanityOptions(farmId),
                listarAplicacoes(farmId),
                listarCarencia(farmId),
                listarCustos(farmId),
            ]);
            setCustos(custo);
            setOptions(opcoes);
            setHistorico(lista.aplicacoes);
            setCarencia(emCarencia.animais);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar a Sanidade.');
        } finally {
            setLoading(false);
        }
    }, [farmId]);

    useEffect(() => { void carregar(); }, [carregar]);

    const identificacoes = useMemo(() => parseIdentificacoes(identificacoesTexto), [identificacoesTexto]);
    const produto = options?.products.find((item) => item.id === productId) || null;
    const lote = produto?.batches.find((item) => item.id === batchId) || null;
    const precisaRendimento = Boolean(produto && produto.unit !== produto.applicationUnit && !produto.applicationPerUnit);
    const dosePorKg = Number(dosePorKgTexto.ml.replace(',', '.')) / Number(dosePorKgTexto.kg.replace(',', '.'));

    const escolherProduto = (id: string) => {
        setProductId(id);
        const escolhido = options?.products.find((item) => item.id === id);
        setBatchId(escolhido?.batches[0]?.id || '');
        setRendimento('');
        if (escolhido?.suggestedDosePerKg) {
            setDoseModo('POR_PESO');
            const match = (escolhido.suggestedDose || '').match(/([\d.,]+)\s*m[lL]\s*\/\s*([\d.,]+)\s*kg/);
            setDosePorKgTexto(match ? { ml: match[1], kg: match[2] } : { ml: String(escolhido.suggestedDosePerKg), kg: '1' });
        } else {
            setDoseModo('FIXA');
            const fixa = (escolhido?.suggestedDose || '').match(/^([\d.,]+)\s*m[lL]\b/);
            setDoseFixa(fixa ? fixa[1].replace(',', '.') : '');
        }
        setRoute(sugerirVia(escolhido?.suggestedRoute || null));
    };

    const payload = (extra?: Partial<AplicacaoPayload>): AplicacaoPayload => ({
        selecao: modoSelecao === 'LOTE' ? { lotId } : { brincos: identificacoes },
        productId,
        batchId,
        appliedAt,
        doseModo,
        doseFixa: doseModo === 'FIXA' ? Number(doseFixa.replace(',', '.')) : null,
        dosePorKg: doseModo === 'POR_PESO' && Number.isFinite(dosePorKg) ? dosePorKg : null,
        applicationPerUnit: rendimento ? Number(rendimento.replace(',', '.')) : null,
        route: route || null,
        appliedByName,
        vetName,
        vetCrmv,
        notes,
        ...extra,
    });

    const passo1Ok = modoSelecao === 'LOTE' ? Boolean(lotId) : identificacoes.length > 0;
    const passo2Ok = Boolean(productId && batchId && (!precisaRendimento || Number(rendimento.replace(',', '.')) > 0));
    const passo3Ok = Boolean(appliedAt) && (doseModo === 'FIXA' ? Number(doseFixa.replace(',', '.')) > 0 : Number.isFinite(dosePorKg) && dosePorKg > 0);

    const conferir = async () => {
        if (!farmId) return;
        setChecking(true);
        setErro(null);
        setSomenteAptos(false);
        try {
            setPrevia(await previewAplicacao(farmId, payload()));
            setPasso(4);
        } catch (error) {
            setErro(error instanceof Error ? error.message : 'Não foi possível conferir.');
        } finally {
            setChecking(false);
        }
    };

    const recomecar = () => {
        setPasso(1);
        setIdentificacoesTexto('');
        setLotId('');
        setPrevia(null);
        setSomenteAptos(false);
        setNotes('');
    };

    const salvar = async () => {
        if (!farmId || !previa) return;
        setSaving(true);
        setErro(null);
        try {
            const result = await salvarAplicacao(farmId, payload({ aplicarSomenteAptos: somenteAptos }));
            setSucesso(`Aplicação salva em ${result.aplicados} animais${result.ignorados ? ` (${result.ignorados} ficaram de fora)` : ''}.${result.carenciaAte ? ` Carência até ${formatDate(result.carenciaAte)}.` : ''}`);
            recomecar();
            await carregar();
        } catch (error) {
            if (error instanceof SanityApiError && error.previa) setPrevia(error.previa);
            setErro(error instanceof Error ? error.message : 'Não foi possível salvar.');
        } finally {
            setSaving(false);
        }
    };

    if (!farmId) return null;
    if (loading && !options) {
        return <div className={`${cardClass} text-center text-sm text-[var(--eixo-text-muted)]`}>Carregando Sanidade...</div>;
    }
    if (loadError && !options) {
        return (
            <div className={`${cardClass} space-y-3 text-center`}>
                <Aviso tone="danger">{loadError}</Aviso>
                <button type="button" className={secondaryButton} onClick={() => void carregar()}>Tentar de novo</button>
            </div>
        );
    }

    const semProdutos = !options?.products.length;
    const temBloqueioGeral = Boolean(previa && (previa.bloqueiosGerais.length || previa.naoEncontrados.length || previa.repetidos.length));
    const podeSalvar = Boolean(previa && !temBloqueioGeral && previa.resumo.aptos > 0 && (previa.resumo.bloqueados === 0 || somenteAptos));
    const liberadosEmBreve = carencia.filter((item) => !item.semCarencia).length;
    const semCarencia = carencia.filter((item) => item.semCarencia).length;

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-extrabold text-[var(--eixo-text)]">Sanidade</h1>
                <p className="text-sm text-[var(--eixo-text-muted)]">{farmName ? `${farmName} · ` : ''}Aplicações no curral e estoque de vacinas e remédios.</p>
            </div>

            <div className="flex gap-2" role="tablist">
                <button type="button" role="tab" aria-selected={aba === 'APLICACOES'} className={aba === 'APLICACOES' ? primaryButton : secondaryButton} onClick={() => setAba('APLICACOES')}>Aplicações</button>
                <button type="button" role="tab" aria-selected={aba === 'FARMACIA'} className={aba === 'FARMACIA' ? primaryButton : secondaryButton} onClick={() => setAba('FARMACIA')}>Farmácia</button>
            </div>

            {aba === 'FARMACIA' && <PharmacyModule key={farmId} farmId={farmId} onStockChanged={() => void carregar()} />}

            {aba === 'APLICACOES' && (
            <>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className={cardClass}>
                    <p className={labelClass}>Aplicações registradas</p>
                    <p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{historico.length}</p>
                </div>
                <div className={`${cardClass} ${liberadosEmBreve ? 'border-amber-300' : ''}`}>
                    <p className={labelClass}>Animais em carência</p>
                    <p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{liberadosEmBreve}</p>
                    <p className="text-xs text-[var(--eixo-text-muted)]">Não podem ir para o abate ainda.</p>
                </div>
                <div className={`${cardClass} ${semCarencia ? 'border-[#efc2ba]' : ''}`}>
                    <p className={labelClass}>Sem carência cadastrada</p>
                    <p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{semCarencia}</p>
                    <p className="text-xs text-[var(--eixo-text-muted)]">Preencha a carência do produto na Farmácia.</p>
                </div>
            </div>

            {sucesso && <Aviso tone="success">{sucesso}</Aviso>}

            <section className={cardClass}>
                <ol className="mb-5 grid grid-cols-4 gap-2">
                    {PASSOS.map((item) => (
                        <li
                            key={item.id}
                            className={`rounded-xl border px-2 py-2 text-center text-xs font-bold ${
                                passo === item.id
                                    ? 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] text-[var(--eixo-text)]'
                                    : passo > item.id
                                        ? 'border-[var(--eixo-border)] text-[var(--eixo-text)]'
                                        : 'border-[var(--eixo-border)] text-[var(--eixo-text-muted)]'
                            }`}
                        >
                            {item.id}. {item.label}
                        </li>
                    ))}
                </ol>

                {erro && <div className="mb-4"><Aviso tone="danger">{erro}</Aviso></div>}

                {semProdutos && (
                    <div className="space-y-3">
                        <Aviso tone="warning">Cadastre o produto e registre a compra do frasco na Farmácia antes de registrar uma aplicação.</Aviso>
                        <button type="button" className={primaryButton} onClick={() => setAba('FARMACIA')}>Abrir Farmácia</button>
                    </div>
                )}

                {!semProdutos && passo === 1 && (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <button type="button" className={modoSelecao === 'IDENTIFICACAO' ? primaryButton : secondaryButton} onClick={() => setModoSelecao('IDENTIFICACAO')}>Por identificação</button>
                            <button type="button" className={modoSelecao === 'LOTE' ? primaryButton : secondaryButton} onClick={() => setModoSelecao('LOTE')}>Lote inteiro</button>
                        </div>
                        {modoSelecao === 'IDENTIFICACAO' ? (
                            <label className={labelClass}>
                                Identificações (separe por espaço, vírgula ou linha)
                                <textarea rows={5} className={inputClass} value={identificacoesTexto} onChange={(event) => setIdentificacoesTexto(event.target.value)} placeholder="Ex.: 1023 1024 1031" />
                                <span className="mt-1 block text-[var(--eixo-text-muted)]">{identificacoes.length} animais digitados</span>
                            </label>
                        ) : (
                            <label className={labelClass}>
                                Lote
                                <select className={inputClass} value={lotId} onChange={(event) => setLotId(event.target.value)}>
                                    <option value="">Selecione</option>
                                    {options?.lots.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.animals} animais</option>)}
                                </select>
                            </label>
                        )}
                        <div className="flex justify-end">
                            <button type="button" className={primaryButton} disabled={!passo1Ok} onClick={() => setPasso(2)}>Continuar</button>
                        </div>
                    </div>
                )}

                {!semProdutos && passo === 2 && (
                    <div className="space-y-4">
                        <label className={labelClass}>
                            Produto da Farmácia
                            <select className={inputClass} value={productId} onChange={(event) => escolherProduto(event.target.value)}>
                                <option value="">Selecione</option>
                                {options?.products.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name}{item.manufacturer ? ` · ${item.manufacturer}` : ''}</option>
                                ))}
                            </select>
                        </label>
                        {produto && (
                            <>
                                <label className={labelClass}>
                                    Lote do frasco
                                    <select className={inputClass} value={batchId} onChange={(event) => setBatchId(event.target.value)}>
                                        <option value="">Selecione</option>
                                        {produto.batches.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.lotNumber} · validade {formatDate(item.expiresAt)} · saldo {formatNumber(item.quantity)} {produto.unit}
                                            </option>
                                        ))}
                                    </select>
                                    {!produto.batches.length && <span className="mt-1 block text-[var(--eixo-danger)]">Sem saldo. Registre a entrada na Farmácia.</span>}
                                </label>
                                {precisaRendimento && (
                                    <label className={labelClass}>
                                        Quanto rende 1 {produto.unit} (em {produto.applicationUnit})
                                        <input type="number" min="0" step="0.01" className={inputClass} value={rendimento} onChange={(event) => setRendimento(event.target.value)} placeholder="Ex.: 500" />
                                        <span className="mt-1 block text-[var(--eixo-text-muted)]">Fica salvo no produto para as próximas vezes.</span>
                                    </label>
                                )}
                                <div className="rounded-xl bg-[var(--eixo-surface-soft)] px-4 py-3 text-xs text-[var(--eixo-text-muted)]">
                                    Carência para abate: <strong className="text-[var(--eixo-text)]">{produto.slaughterWithdrawalDays === null ? 'não cadastrada' : `${produto.slaughterWithdrawalDays} dias`}</strong>
                                    {produto.suggestedDose && <> · Dose da bula: <strong className="text-[var(--eixo-text)]">{produto.suggestedDose}</strong></>}
                                </div>
                            </>
                        )}
                        <div className="flex justify-between">
                            <button type="button" className={secondaryButton} onClick={() => setPasso(1)}>Voltar</button>
                            <button type="button" className={primaryButton} disabled={!passo2Ok} onClick={() => setPasso(3)}>Continuar</button>
                        </div>
                    </div>
                )}

                {!semProdutos && passo === 3 && produto && (
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className={labelClass}>
                                Data da aplicação
                                <input type="date" max={hoje()} className={inputClass} value={appliedAt} onChange={(event) => setAppliedAt(event.target.value)} />
                            </label>
                            <label className={labelClass}>
                                Via de aplicação
                                <select className={inputClass} value={route} onChange={(event) => setRoute(event.target.value)}>
                                    <option value="">Selecione</option>
                                    {options?.routes.map((item) => <option key={item} value={item}>{ROUTE_LABELS[item] || item}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" className={doseModo === 'FIXA' ? primaryButton : secondaryButton} onClick={() => setDoseModo('FIXA')}>Mesma dose para todos</button>
                            <button type="button" className={doseModo === 'POR_PESO' ? primaryButton : secondaryButton} onClick={() => setDoseModo('POR_PESO')}>Dose pelo peso</button>
                        </div>
                        {doseModo === 'FIXA' ? (
                            <label className={labelClass}>
                                Dose por animal ({produto.applicationUnit})
                                <input type="number" min="0" step="0.01" className={inputClass} value={doseFixa} onChange={(event) => setDoseFixa(event.target.value)} />
                            </label>
                        ) : (
                            <div>
                                <p className={labelClass}>Dose pelo peso</p>
                                <div className="mt-1 flex items-center gap-2 text-sm text-[var(--eixo-text)]">
                                    <input type="text" inputMode="decimal" aria-label="Quantidade" className={`${inputClass} mt-0 w-24`} value={dosePorKgTexto.ml} onChange={(event) => setDosePorKgTexto({ ...dosePorKgTexto, ml: event.target.value })} />
                                    <span>{produto.applicationUnit} a cada</span>
                                    <input type="text" inputMode="decimal" aria-label="Peso" className={`${inputClass} mt-0 w-24`} value={dosePorKgTexto.kg} onChange={(event) => setDosePorKgTexto({ ...dosePorKgTexto, kg: event.target.value })} />
                                    <span>kg</span>
                                </div>
                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Usa o último peso de cada animal. Animal sem peso fica de fora.</p>
                            </div>
                        )}
                        <div className="grid gap-3 sm:grid-cols-3">
                            <label className={labelClass}>
                                Quem aplicou
                                <input className={inputClass} value={appliedByName} onChange={(event) => setAppliedByName(event.target.value)} placeholder="Seu nome se vazio" />
                            </label>
                            <label className={labelClass}>
                                Veterinário responsável
                                <input className={inputClass} value={vetName} onChange={(event) => setVetName(event.target.value)} />
                            </label>
                            <label className={labelClass}>
                                CRMV
                                <input className={inputClass} value={vetCrmv} onChange={(event) => setVetCrmv(event.target.value)} />
                            </label>
                        </div>
                        {produto.tags.some((tag) => tag.startsWith('BRUCELOSE')) && !vetName.trim() && (
                            <Aviso tone="warning">Vacina de brucelose exige veterinário cadastrado no órgão de defesa do estado. Informe o nome e o CRMV.</Aviso>
                        )}
                        <label className={labelClass}>
                            Observações
                            <textarea rows={2} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
                        </label>
                        <div className="flex justify-between">
                            <button type="button" className={secondaryButton} onClick={() => setPasso(2)}>Voltar</button>
                            <button type="button" className={primaryButton} disabled={!passo3Ok || checking} onClick={() => void conferir()}>
                                {checking ? 'Conferindo...' : 'Conferir'}
                            </button>
                        </div>
                    </div>
                )}

                {!semProdutos && passo === 4 && previa && produto && (
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-4">
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3">
                                <p className={labelClass}>Vão receber</p>
                                <p className="text-xl font-extrabold text-[var(--eixo-text)]">{previa.resumo.aptos} <span className="text-sm font-semibold text-[var(--eixo-text-muted)]">de {previa.resumo.total}</span></p>
                            </div>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3">
                                <p className={labelClass}>Dose total</p>
                                <p className="text-xl font-extrabold text-[var(--eixo-text)]">{formatNumber(previa.resumo.doseTotal)} {previa.resumo.unidadeDose}</p>
                            </div>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3">
                                <p className={labelClass}>Sai do estoque</p>
                                <p className="text-xl font-extrabold text-[var(--eixo-text)]">{formatNumber(previa.resumo.consumoEstoque, 3)} {previa.resumo.unidadeEstoque || ''}</p>
                                {lote && <p className="text-xs text-[var(--eixo-text-muted)]">Lote {lote.lotNumber}</p>}
                            </div>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3">
                                <p className={labelClass}>Custo do produto usado</p>
                                <p className="text-xl font-extrabold text-[var(--eixo-text)]">{formatMoney(previa.resumo.custoTotal)}</p>
                                <p className="text-xs text-[var(--eixo-text-muted)]">
                                    {previa.resumo.carenciaAte ? `Carência até ${formatDate(previa.resumo.carenciaAte)}` : 'Carência não cadastrada'}
                                </p>
                            </div>
                        </div>

                        {previa.naoEncontrados.length > 0 && (
                            <Aviso tone="danger">Identificações não encontradas nesta fazenda: {previa.naoEncontrados.join(', ')}. Corrija no passo 1.</Aviso>
                        )}
                        {previa.repetidos.length > 0 && (
                            <Aviso tone="danger">Identificações usadas por mais de um animal: {previa.repetidos.join(', ')}. Corrija o cadastro antes de aplicar.</Aviso>
                        )}
                        {previa.bloqueiosGerais.map((item) => <Aviso key={item} tone="danger">{item}</Aviso>)}
                        {previa.avisosGerais.map((item) => <Aviso key={item} tone="warning">{item}</Aviso>)}

                        {previa.linhas.length > 0 && (
                            <div className="max-h-80 overflow-auto rounded-xl border border-[var(--eixo-border)]">
                                <table className="w-full text-left text-sm">
                                    <thead className="sticky top-0 bg-[var(--eixo-surface-soft)] text-xs text-[var(--eixo-text-muted)]">
                                        <tr>
                                            <th className="px-3 py-2">Identificação</th>
                                            <th className="px-3 py-2">Sexo</th>
                                            <th className="px-3 py-2">Idade</th>
                                            <th className="px-3 py-2">Peso</th>
                                            <th className="px-3 py-2">Dose</th>
                                            <th className="px-3 py-2">Situação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...previa.linhas].sort((a, b) => Number(a.apto) - Number(b.apto)).map((linha) => (
                                            <tr key={linha.animalId} className="border-t border-[var(--eixo-border)]">
                                                <td className="px-3 py-2 font-semibold text-[var(--eixo-text)]">{linha.brinco}</td>
                                                <td className="px-3 py-2">{linha.sexo === 'FEMEA' ? 'Fêmea' : linha.sexo === 'MACHO' ? 'Macho' : '—'}</td>
                                                <td className="px-3 py-2">{linha.idadeDias === null ? '—' : `${Math.floor(linha.idadeDias / 30)} meses`}</td>
                                                <td className="px-3 py-2">{linha.peso ? `${formatNumber(linha.peso, 0)} kg` : '—'}</td>
                                                <td className="px-3 py-2">{linha.dose === null ? '—' : `${formatNumber(linha.dose)} ${previa.resumo.unidadeDose}`}</td>
                                                <td className="px-3 py-2">
                                                    {linha.apto
                                                        ? <span className="font-semibold text-[var(--eixo-success)]">Liberado</span>
                                                        : <span className="font-semibold text-[var(--eixo-danger)]">{linha.bloqueios.join(' ')}</span>}
                                                    {linha.avisos.length > 0 && <span className="block text-xs text-amber-700">{linha.avisos.join(' ')}</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {previa.resumo.bloqueados > 0 && previa.resumo.aptos > 0 && !temBloqueioGeral && (
                            <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">
                                <input type="checkbox" checked={somenteAptos} onChange={(event) => setSomenteAptos(event.target.checked)} />
                                Aplicar só nos {previa.resumo.aptos} liberados ({previa.resumo.bloqueados} ficam de fora)
                            </label>
                        )}

                        <div className="flex justify-between">
                            <button type="button" className={secondaryButton} onClick={() => setPasso(3)}>Voltar</button>
                            <div className="flex gap-2">
                                <button type="button" className={secondaryButton} disabled={checking} onClick={() => void conferir()}>Conferir de novo</button>
                                <button type="button" className={primaryButton} disabled={!podeSalvar || saving} onClick={() => void salvar()}>
                                    {saving ? 'Salvando...' : 'Salvar aplicação'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {carencia.length > 0 && (
                <section className={cardClass}>
                    <h2 className="text-base font-bold text-[var(--eixo-text)]">Animais que ainda não podem ir para o abate</h2>
                    <div className="mt-3 max-h-64 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-xs text-[var(--eixo-text-muted)]">
                                <tr><th className="py-2 pr-3">Identificação</th><th className="py-2 pr-3">Libera em</th><th className="py-2">Produtos</th></tr>
                            </thead>
                            <tbody>
                                {carencia.map((item) => (
                                    <tr key={item.animalId} className="border-t border-[var(--eixo-border)]">
                                        <td className="py-2 pr-3 font-semibold text-[var(--eixo-text)]">{item.brinco}</td>
                                        <td className="py-2 pr-3">
                                            {item.semCarencia
                                                ? <span className="font-semibold text-[var(--eixo-danger)]">Sem carência cadastrada</span>
                                                : formatDate(item.liberaEm)}
                                        </td>
                                        <td className="py-2 text-[var(--eixo-text-muted)]">{item.produtos.join(', ')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {custos && custos.porLote.length > 0 && (
                <section className={cardClass}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-base font-bold text-[var(--eixo-text)]">Custo sanitário por lote</h2>
                        <p className="text-sm text-[var(--eixo-text-muted)]">Total aplicado: <strong className="text-[var(--eixo-text)]">{formatMoney(custos.total)}</strong></p>
                    </div>
                    <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Valor do produto usado em cada lote. Esse custo já entrou no resultado da fazenda na compra.</p>
                    <div className="mt-3 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-xs text-[var(--eixo-text-muted)]">
                                <tr><th className="py-2 pr-3">Lote</th><th className="py-2 pr-3">Animais</th><th className="py-2 pr-3">Aplicações</th><th className="py-2 pr-3">Custo</th><th className="py-2">Por animal</th></tr>
                            </thead>
                            <tbody>
                                {custos.porLote.map((item) => (
                                    <tr key={item.lotId || 'sem-lote'} className="border-t border-[var(--eixo-border)]">
                                        <td className="py-2 pr-3 font-semibold text-[var(--eixo-text)]">{item.lote}</td>
                                        <td className="py-2 pr-3">{item.animais}</td>
                                        <td className="py-2 pr-3">{item.aplicacoes}</td>
                                        <td className="py-2 pr-3">{formatMoney(item.custo)}</td>
                                        <td className="py-2">{formatMoney(item.custoPorAnimal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" className={`${secondaryButton} mt-3`} onClick={() => setVerAnimais(!verAnimais)}>
                        {verAnimais ? 'Ocultar custo por animal' : 'Ver custo por animal'}
                    </button>
                    {verAnimais && (
                        <div className="mt-3 max-h-64 overflow-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-xs text-[var(--eixo-text-muted)]">
                                    <tr><th className="py-2 pr-3">Identificação</th><th className="py-2 pr-3">Lote</th><th className="py-2 pr-3">Aplicações</th><th className="py-2">Custo</th></tr>
                                </thead>
                                <tbody>
                                    {custos.porAnimal.map((item) => (
                                        <tr key={item.animalId} className="border-t border-[var(--eixo-border)]">
                                            <td className="py-2 pr-3 font-semibold text-[var(--eixo-text)]">{item.brinco}</td>
                                            <td className="py-2 pr-3">{item.lote || 'Sem lote'}</td>
                                            <td className="py-2 pr-3">{item.aplicacoes}</td>
                                            <td className="py-2">{formatMoney(item.custo)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            <section className={cardClass}>
                <h2 className="text-base font-bold text-[var(--eixo-text)]">Últimas aplicações</h2>
                {historico.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Nenhuma aplicação registrada ainda.</p>
                ) : (
                    <div className="mt-3 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-xs text-[var(--eixo-text-muted)]">
                                <tr>
                                    <th className="py-2 pr-3">Data</th>
                                    <th className="py-2 pr-3">Produto</th>
                                    <th className="py-2 pr-3">Animais</th>
                                    <th className="py-2 pr-3">Lote do frasco</th>
                                    <th className="py-2 pr-3">Carência até</th>
                                    <th className="py-2 pr-3">Aplicado por</th>
                                    <th className="py-2">Custo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historico.map((item) => (
                                    <tr key={item.groupId} className="border-t border-[var(--eixo-border)]">
                                        <td className="py-2 pr-3">{formatDate(item.appliedAt)}</td>
                                        <td className="py-2 pr-3 font-semibold text-[var(--eixo-text)]">{item.produto}</td>
                                        <td className="py-2 pr-3">{item.animais}</td>
                                        <td className="py-2 pr-3">{item.loteFrasco || '—'}</td>
                                        <td className="py-2 pr-3">{item.carenciaDesconhecida ? 'Não cadastrada' : formatDate(item.carenciaAte)}</td>
                                        <td className="py-2 pr-3">{item.aplicadoPor || '—'}</td>
                                        <td className="py-2">{item.custoTotal ? formatMoney(item.custoTotal) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            </>
            )}

            <p className="text-xs text-[var(--eixo-text-muted)]">
                O EIXO ajuda a registrar e conferir, mas não substitui a orientação do veterinário responsável. Siga sempre a bula do produto.
            </p>
        </div>
    );
};

export default SanidadeModule;
