import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import {
    Faixa,
    LinhaToque,
    Metodo,
    ReproApiError,
    SessaoToque,
    ToquePayload,
    VacaCurral,
    VaziaDecidir,
    apagarToque,
    baixarVacasCurral,
    enviarToque,
    listarDecidir,
    listarToques,
    resolverPendencia,
    salvarDecisao,
} from '../adapters/reproApi';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const norm = (v: string) => v.trim().toUpperCase();

const SITUACAO: Record<string, string> = {
    LIBERADA: 'nunca pariu', VAZIA: 'falhada', COBERTA: 'coberta', PRENHE: 'cheia', PARIDA: 'parida', DESCARTE: 'descarte',
};

const lerLocal = <T,>(chave: string, padrao: T): T => {
    try {
        const raw = window.localStorage.getItem(chave);
        return raw ? (JSON.parse(raw) as T) : padrao;
    } catch {
        return padrao;
    }
};
const gravarLocal = (chave: string, valor: unknown) => {
    try {
        window.localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
        // sem espaço ou bloqueado: segue só em memória
    }
};

interface Rascunho {
    clientId: string;
    data: string;
    metodo: Metodo;
    veterinario: string;
    crmv: string;
    lotId: string;
    linhas: LinhaToque[];
}

const novoRascunho = (): Rascunho => ({
    clientId: crypto.randomUUID(), data: hoje(), metodo: 'ULTRASSOM', veterinario: '', crmv: '', lotId: '', linhas: [],
});

// ---------- Toque/ultrassom no curral ----------

export const ToqueCurral: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, onErro, onAviso }) => {
    const chaveVacas = `eixo:repro:vacas:${farmId}`;
    const chaveRascunho = `eixo:repro:toque:rascunho:${farmId}`;
    const [cache, setCache] = useState<{ baixadoEm: string | null; vacas: VacaCurral[]; lotes: { id: string; name: string }[] }>(
        () => lerLocal(chaveVacas, { baixadoEm: null, vacas: [], lotes: [] }),
    );
    const [rascunho, setRascunho] = useState<Rascunho>(() => lerLocal(chaveRascunho, novoRascunho()));
    const [ident, setIdent] = useState('');
    const [dias, setDias] = useState('');
    const [faixa, setFaixa] = useState<Faixa | ''>('');
    const [ecc, setEcc] = useState('');
    const [obs, setObs] = useState('');
    const [conferindo, setConferindo] = useState(false);
    const [sessoes, setSessoes] = useState<SessaoToque[]>([]);
    const [baixando, setBaixando] = useState(false);
    const [recusados, setRecusados] = useState<string[]>([]);
    const identRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => gravarLocal(chaveRascunho, rascunho), [chaveRascunho, rascunho]);

    const carregarSessoes = useCallback(async () => {
        try {
            const r = await listarToques(farmId);
            setSessoes(r.sessoes);
            setCache((c) => {
                const novo = { ...c, lotes: r.lotes };
                gravarLocal(chaveVacas, novo);
                return novo;
            });
        } catch {
            // sem internet: fica com o que já tem
        }
    }, [farmId, chaveVacas]);

    const enviar = async (item: ToquePayload) => {
        try {
            await enviarToque(farmId, item);
        } catch (e) {
            // Erro de conteúdo não adianta repetir: sai da fila e avisa. Sem internet, continua na fila.
            if (e instanceof ReproApiError && e.status >= 400 && e.status < 500) {
                setRecusados((r) => [...r, `Toque de ${fmtData(item.data)}: ${e.message}`]);
                return;
            }
            throw e;
        }
    };

    const fila = useOfflineQueue<ToquePayload>('eixo:repro:toque:fila:', farmId, {
        autoSync: enviar,
        onSynced: (r) => {
            onAviso(`${r.sent} toque(s) enviado(s). Confira as pendências abaixo.`);
            void carregarSessoes();
        },
    });

    useEffect(() => {
        void carregarSessoes();
    }, [carregarSessoes]);

    const baixar = async () => {
        setBaixando(true);
        try {
            const r = await baixarVacasCurral(farmId);
            const novo = { ...cache, baixadoEm: r.baixadoEm, vacas: r.vacas };
            setCache(novo);
            gravarLocal(chaveVacas, novo);
            onErro(null);
        } catch (e: any) {
            onErro(`Não deu para baixar as vacas: ${e.message}`);
        } finally {
            setBaixando(false);
        }
    };

    const porIdent = useMemo(() => new Map(cache.vacas.map((v) => [norm(v.brinco), v])), [cache.vacas]);
    const vacaDigitada = ident ? porIdent.get(norm(ident)) : undefined;
    const jaLancada = ident ? rascunho.linhas.some((l) => norm(l.brinco) === norm(ident)) : false;
    const esperadas = rascunho.lotId ? cache.vacas.filter((v) => v.lotId === rascunho.lotId) : [];
    const lancadasSet = new Set(rascunho.linhas.map((l) => norm(l.brinco)));
    const naoPassaram = esperadas.filter((v) => !lancadasSet.has(norm(v.brinco)));

    const set = (campo: keyof Rascunho, valor: any) => setRascunho((r) => ({ ...r, [campo]: valor }));

    const lancar = (resultado: 'PRENHE' | 'VAZIA') => {
        if (!ident.trim() || jaLancada) return;
        const linha: LinhaToque = {
            brinco: ident.trim(),
            resultado,
            diasGestacao: resultado === 'PRENHE' && dias ? Number(dias) : null,
            faixa: resultado === 'PRENHE' && faixa ? faixa : null,
            ecc: ecc ? Number(ecc) : null,
            obs: obs.trim() || null,
        };
        setRascunho((r) => ({ ...r, linhas: [linha, ...r.linhas] }));
        setIdent('');
        setDias('');
        setFaixa('');
        setEcc('');
        setObs('');
        identRef.current?.focus();
    };

    const fechar = async () => {
        const { linhas, clientId, data, metodo, veterinario, crmv, lotId } = rascunho;
        fila.enqueue({ clientId, data, metodo, veterinario, crmv, lotId: lotId || null, linhas: [...linhas].reverse() });
        setRascunho(novoRascunho());
        setConferindo(false);
        if (navigator.onLine) {
            await fila.sync(enviar);
        } else {
            onAviso('Toque guardado no celular. Será enviado quando a internet voltar.');
        }
    };

    const prenhes = rascunho.linhas.filter((l) => l.resultado === 'PRENHE').length;

    return (
        <div className="space-y-4">
            <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
                <div className="text-sm">
                    <p className="font-semibold">Vacas no celular: {cache.vacas.length}</p>
                    <p className="text-xs text-[var(--eixo-text-muted)]">
                        {cache.baixadoEm ? `Baixadas em ${new Date(cache.baixadoEm).toLocaleString('pt-BR')}` : 'Baixe antes de ir ao curral.'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {fila.items.length > 0 && (
                        <button type="button" className={secondaryButton} onClick={() => void fila.sync(enviar)}>
                            Enviar agora ({fila.items.length} guardado{fila.items.length > 1 ? 's' : ''})
                        </button>
                    )}
                    <button type="button" className={secondaryButton} disabled={baixando} onClick={baixar}>
                        {baixando ? 'Baixando…' : 'Baixar vacas'}
                    </button>
                </div>
            </div>
            {recusados.length > 0 && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {recusados.map((r) => <p key={r}>{r}</p>)}
                </div>
            )}

            <div className={`${cardClass} space-y-3`}>
                <h3 className="font-bold">Novo toque</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label>
                        <span className={labelClass}>Data</span>
                        <input type="date" className={inputClass} value={rascunho.data} max={hoje()} onChange={(e) => set('data', e.target.value)} />
                    </label>
                    <label>
                        <span className={labelClass}>Método</span>
                        <select className={inputClass} value={rascunho.metodo} onChange={(e) => set('metodo', e.target.value)}>
                            <option value="ULTRASSOM">Ultrassom</option>
                            <option value="TOQUE">Toque</option>
                        </select>
                    </label>
                    <label>
                        <span className={labelClass}>Veterinário</span>
                        <input className={inputClass} value={rascunho.veterinario} onChange={(e) => set('veterinario', e.target.value)} />
                    </label>
                    <label>
                        <span className={labelClass}>CRMV (opcional)</span>
                        <input className={inputClass} value={rascunho.crmv} onChange={(e) => set('crmv', e.target.value)} />
                    </label>
                    <label>
                        <span className={labelClass}>Lote (opcional)</span>
                        <select className={inputClass} value={rascunho.lotId} onChange={(e) => set('lotId', e.target.value)}>
                            <option value="">Sem lote</option>
                            {cache.lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </label>
                </div>

                <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-4">
                    <div className="flex items-baseline justify-between">
                        <p className="text-sm font-semibold">
                            Lançadas: {rascunho.linhas.length}{rascunho.lotId ? ` / ${esperadas.length} do lote` : ''}
                        </p>
                        <p className="text-xs text-[var(--eixo-text-muted)]">{prenhes} cheias · {rascunho.linhas.length - prenhes} falhadas</p>
                    </div>
                    <label className="mt-3 block">
                        <span className={labelClass}>Identificação</span>
                        <input ref={identRef} autoFocus inputMode="text" autoComplete="off" className={`${inputClass} text-lg`}
                            value={ident} onChange={(e) => setIdent(e.target.value)} />
                    </label>
                    {ident && (
                        <p className={`mt-1 text-sm ${jaLancada ? 'text-red-700' : vacaDigitada ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {jaLancada ? 'Já lançada neste toque.'
                                : vacaDigitada ? `${vacaDigitada.categoria} · ${SITUACAO[vacaDigitada.situacao || ''] || 'sem situação'}${vacaDigitada.lote ? ` · ${vacaDigitada.lote}` : ''}`
                                    : 'Não está na lista do celular — vai como pendência para conferir depois.'}
                        </p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {rascunho.metodo === 'ULTRASSOM' ? (
                            <label>
                                <span className={labelClass}>Dias de gestação</span>
                                <input type="number" inputMode="numeric" min={1} max={300} className={inputClass} value={dias} onChange={(e) => setDias(e.target.value)} />
                            </label>
                        ) : (
                            <label>
                                <span className={labelClass}>Gestação</span>
                                <select className={inputClass} value={faixa} onChange={(e) => setFaixa(e.target.value as Faixa | '')}>
                                    <option value="">—</option>
                                    <option value="INICIAL">Inicial</option>
                                    <option value="MEIO">Meio</option>
                                    <option value="FINAL">Final</option>
                                </select>
                            </label>
                        )}
                        <label>
                            <span className={labelClass}>ECC</span>
                            <input type="number" inputMode="decimal" min={1} max={5} step={0.25} className={inputClass} value={ecc} onChange={(e) => setEcc(e.target.value)} />
                        </label>
                        <label className="col-span-2">
                            <span className={labelClass}>Observação do veterinário</span>
                            <input className={inputClass} value={obs} onChange={(e) => setObs(e.target.value)} />
                        </label>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <button type="button" disabled={!ident.trim() || jaLancada} onClick={() => lancar('PRENHE')}
                            className="rounded-2xl bg-emerald-600 py-5 text-lg font-bold text-white disabled:opacity-40">CHEIA</button>
                        <button type="button" disabled={!ident.trim() || jaLancada} onClick={() => lancar('VAZIA')}
                            className="rounded-2xl bg-red-600 py-5 text-lg font-bold text-white disabled:opacity-40">FALHADA</button>
                    </div>
                </div>

                {rascunho.linhas.length > 0 && (
                    <>
                        <ul className="max-h-64 divide-y divide-[var(--eixo-border)] overflow-y-auto text-sm">
                            {rascunho.linhas.map((l) => (
                                <li key={l.brinco} className="flex items-center justify-between py-2">
                                    <span>
                                        <b>{l.brinco}</b> · {l.resultado === 'PRENHE' ? 'Cheia' : 'Falhada'}
                                        {l.diasGestacao ? ` · ${l.diasGestacao} dias` : ''}{l.faixa ? ` · ${l.faixa.toLowerCase()}` : ''}
                                        {l.ecc ? ` · ECC ${l.ecc}` : ''}
                                        {!porIdent.has(norm(l.brinco)) && <span className="text-amber-700"> · conferir</span>}
                                    </span>
                                    <button type="button" className="text-xs text-red-700 underline"
                                        onClick={() => setRascunho((r) => ({ ...r, linhas: r.linhas.filter((x) => x.brinco !== l.brinco) }))}>
                                        Tirar
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {!conferindo ? (
                            <button type="button" className={primaryButton} onClick={() => setConferindo(true)}>Fechar toque</button>
                        ) : (
                            <div className="space-y-2 rounded-xl border border-[var(--eixo-border)] p-4 text-sm">
                                <p className="font-bold">Conferir antes de salvar</p>
                                <p>{prenhes} cheias · {rascunho.linhas.length - prenhes} falhadas · {rascunho.linhas.filter((l) => !porIdent.has(norm(l.brinco))).length} para conferir</p>
                                {rascunho.lotId && naoPassaram.length > 0 && (
                                    <p className="text-amber-700">Do lote, não passaram no tronco ({naoPassaram.length}): {naoPassaram.slice(0, 30).map((v) => v.brinco).join(', ')}{naoPassaram.length > 30 ? '…' : ''}</p>
                                )}
                                <div className="flex gap-2">
                                    <button type="button" className={primaryButton} onClick={fechar}>Confirmar e salvar</button>
                                    <button type="button" className={secondaryButton} onClick={() => setConferindo(false)}>Voltar</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <ToquesAnteriores farmId={farmId} sessoes={sessoes} vacas={cache.vacas} onMudou={carregarSessoes} onErro={onErro} onAviso={onAviso} />
        </div>
    );
};

const ToquesAnteriores: React.FC<{
    farmId: string;
    sessoes: SessaoToque[];
    vacas: VacaCurral[];
    onMudou: () => void;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, sessoes, vacas, onMudou, onErro, onAviso }) => {
    const [apagarId, setApagarId] = useState<string | null>(null);
    const [escolha, setEscolha] = useState<Record<string, string>>({});

    const apagar = async (id: string) => {
        try {
            const r = await apagarToque(farmId, id);
            onAviso(`Toque apagado. ${r.vacasRecalculadas} vaca(s) tiveram a situação refeita.`);
            setApagarId(null);
            onMudou();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    const resolver = async (sessaoId: string, indice: number, descartar = false) => {
        const chave = `${sessaoId}:${indice}`;
        const brinco = escolha[chave];
        const vaca = vacas.find((v) => norm(v.brinco) === norm(brinco || ''));
        if (!descartar && !vaca) {
            onErro('Digite a identificação de uma vaca liberada (baixe as vacas se a lista estiver velha).');
            return;
        }
        try {
            await resolverPendencia(farmId, sessaoId, indice, descartar ? { descartar: true } : { animalId: vaca!.id });
            onErro(null);
            setEscolha((e) => ({ ...e, [chave]: '' }));
            onMudou();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    if (!sessoes.length) return null;
    return (
        <div className={`${cardClass} space-y-3`}>
            <h3 className="font-bold">Toques anteriores</h3>
            {sessoes.map((s) => (
                <div key={s.id} className="rounded-xl border border-[var(--eixo-border)] p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <p className="font-semibold">{fmtData(s.date)} · {s.metodo === 'TOQUE' ? 'Toque' : 'Ultrassom'}{s.vetName ? ` · ${s.vetName}` : ''}{s.lote ? ` · ${s.lote}` : ''}</p>
                            {s.resumo && (
                                <p className="text-xs text-[var(--eixo-text-muted)]">
                                    {s.resumo.prenhes} cheias · {s.resumo.vazias} falhadas · {s.resumo.perdas} perdas
                                    {s.resumo.naoPassaram?.length ? ` · ${s.resumo.naoPassaram.length} do lote não passaram` : ''}
                                </p>
                            )}
                        </div>
                        {apagarId === s.id ? (
                            <span className="flex gap-2 text-xs">
                                <button type="button" className="font-bold text-red-700 underline" onClick={() => apagar(s.id)}>Confirmar: apagar o toque inteiro</button>
                                <button type="button" className="underline" onClick={() => setApagarId(null)}>Não</button>
                            </span>
                        ) : (
                            <button type="button" className="text-xs text-red-700 underline" onClick={() => setApagarId(s.id)}>Apagar toque</button>
                        )}
                    </div>
                    {s.pendencias.length > 0 && (
                        <div className="mt-2 space-y-2">
                            <p className="text-xs font-bold text-amber-700">Pendências ({s.pendencias.length})</p>
                            {s.pendencias.map((p, i) => {
                                const chave = `${s.id}:${i}`;
                                return (
                                    <div key={chave} className="flex flex-wrap items-end gap-2 rounded-lg bg-amber-50 p-2 text-xs">
                                        <span className="min-w-[160px]"><b>{p.brinco}</b> · {p.resultado === 'PRENHE' ? 'cheia' : 'falhada'} — {p.motivo}</span>
                                        <input className="rounded-lg border border-[var(--eixo-border)] px-2 py-1" placeholder="Era a vaca…" list={`vacas-${chave}`}
                                            value={escolha[chave] || ''} onChange={(e) => setEscolha((x) => ({ ...x, [chave]: e.target.value }))} />
                                        <datalist id={`vacas-${chave}`}>
                                            {vacas.slice(0, 500).map((v) => <option key={v.id} value={v.brinco} />)}
                                        </datalist>
                                        <button type="button" className="font-bold underline" onClick={() => resolver(s.id, i)}>Lançar nesta vaca</button>
                                        <button type="button" className="underline" onClick={() => resolver(s.id, i, true)}>Ignorar</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// ---------- Vazias para decidir ----------

const DECISAO_LABEL: Record<string, string> = { NOVA_COBERTURA: 'Nova cobertura', REPASSE: 'Repasse com touro' };

export const DecidirVazias: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    onAbrirFicha: (id: string) => void;
}> = ({ farmId, onErro, onAviso, onAbrirFicha }) => {
    const [vacas, setVacas] = useState<VaziaDecidir[]>([]);
    const [motivos, setMotivos] = useState<string[]>([]);
    const [sel, setSel] = useState<Set<string>>(new Set());
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const r = await listarDecidir(farmId);
            setVacas(r.vacas);
            setMotivos(r.motivosDescarte);
            onErro(null);
        } catch (e: any) {
            onErro(e.message);
        }
    }, [farmId, onErro]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const decidir = async (decisao: string) => {
        setSalvando(true);
        try {
            const r = await salvarDecisao(farmId, { animalIds: [...sel], decisao, motivo: decisao === 'DESCARTE' ? motivo : undefined });
            onAviso(`${r.total} vaca(s): ${decisao === 'DESCARTE' ? `descarte (${motivo})` : DECISAO_LABEL[decisao]}.`);
            setSel(new Set());
            setMotivo('');
            await carregar();
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`${cardClass} space-y-3`}>
            <p className="text-sm text-[var(--eixo-text-muted)]">Vacas que falharam no último toque, esperando sua decisão. O sistema não decide por você.</p>
            {!vacas.length && <p className="text-sm">Nenhuma vaca falhada esperando decisão.</p>}
            {vacas.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="text-left text-xs text-[var(--eixo-text-muted)]">
                                <th className="py-2">
                                    <input type="checkbox" aria-label="Selecionar todas" checked={sel.size === vacas.length}
                                        onChange={(e) => setSel(e.target.checked ? new Set(vacas.map((v) => v.id)) : new Set())} />
                                </th>
                                <th>Identificação</th>
                                <th>Categoria</th>
                                <th>Falhou em</th>
                                <th>Atenção</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vacas.map((v) => (
                                <tr key={v.id} className="border-t border-[var(--eixo-border)]">
                                    <td className="py-2">
                                        <input type="checkbox" aria-label={`Selecionar ${v.brinco}`} checked={sel.has(v.id)}
                                            onChange={() => setSel((s) => { const n = new Set(s); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n; })} />
                                    </td>
                                    <td>
                                        <button type="button" className="font-semibold underline" onClick={() => onAbrirFicha(v.id)}>{v.brinco}</button>
                                        {v.lote && <span className="block text-xs text-[var(--eixo-text-muted)]">{v.lote}</span>}
                                    </td>
                                    <td>{v.categoria}</td>
                                    <td>{fmtData(v.vaziaEm)}</td>
                                    <td className="text-xs">
                                        {[v.vaziasSeguidas >= 2 ? `falhou ${v.vaziasSeguidas} vezes seguidas` : null, v.perdaRecente ? 'perdeu a cria' : null].filter(Boolean).join(' · ') || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {sel.size > 0 && (
                <div className="flex flex-wrap items-end gap-2 border-t border-[var(--eixo-border)] pt-3">
                    <span className="text-sm font-semibold">{sel.size} selecionada(s):</span>
                    <button type="button" className={secondaryButton} disabled={salvando} onClick={() => decidir('NOVA_COBERTURA')}>Nova cobertura</button>
                    <button type="button" className={secondaryButton} disabled={salvando} onClick={() => decidir('REPASSE')}>Repasse com touro</button>
                    <label>
                        <span className={labelClass}>Motivo do descarte</span>
                        <select className={inputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                            <option value="">Escolha</option>
                            {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </label>
                    <button type="button" className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        disabled={salvando || !motivo} onClick={() => decidir('DESCARTE')}>Descartar</button>
                </div>
            )}
        </div>
    );
};
