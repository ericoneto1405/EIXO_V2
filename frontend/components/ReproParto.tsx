import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import {
    BezerroDesmama,
    CriaPayload,
    DesmamaPayload,
    PartoPayload,
    PartoPrevisto,
    PartoRecente,
    ReproApiError,
    TipoParto,
    VacaCurral,
    apagarParto,
    baixarVacasCurral,
    desfazerDesmama,
    lancarDesmama,
    lancarParto,
    listarDesmama,
    listarPartos,
} from '../adapters/reproApi';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const norm = (v: string) => v.trim().toUpperCase();
const TIPO_PARTO: Record<TipoParto, string> = { NORMAL: 'Normal', ASSISTIDO: 'Assistido', CESAREA: 'Cesárea' };

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
        // sem espaço: segue em memória
    }
};

// Erro de conteúdo (4xx) sai da fila e é mostrado; sem internet, continua guardado.
const tratarEnvio = async (fn: () => Promise<void>, onRecusa: (m: string) => void) => {
    try {
        await fn();
    } catch (e) {
        if (e instanceof ReproApiError && e.status >= 400 && e.status < 500) {
            onRecusa(e.message);
            return;
        }
        throw e;
    }
};

const criaVazia = (): CriaPayload => ({ sexo: 'MACHO', vivo: true, peso: null, identificacao: '' });

// ---------- Partos ----------

export const PartosAba: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    onAbrirFicha: (id: string) => void;
}> = ({ farmId, onErro, onAviso, onAbrirFicha }) => {
    const chaveVacas = `eixo:repro:vacas:${farmId}`;
    const [cache, setCache] = useState<{ baixadoEm: string | null; vacas: VacaCurral[]; lotes: { id: string; name: string }[] }>(
        () => lerLocal(chaveVacas, { baixadoEm: null, vacas: [], lotes: [] }),
    );
    const [previstos, setPrevistos] = useState<PartoPrevisto[]>([]);
    const [semPrevisao, setSemPrevisao] = useState(0);
    const [recentes, setRecentes] = useState<PartoRecente[]>([]);
    const [brinco, setBrinco] = useState('');
    const [data, setData] = useState(hoje());
    const [tipo, setTipo] = useState<TipoParto>('NORMAL');
    const [ecc, setEcc] = useState('');
    const [obs, setObs] = useState('');
    const [crias, setCrias] = useState<CriaPayload[]>([criaVazia()]);
    const [recusas, setRecusas] = useState<string[]>([]);
    const [apagarId, setApagarId] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        try {
            const r = await listarPartos(farmId);
            setPrevistos(r.previstos);
            setSemPrevisao(r.semPrevisao);
            setRecentes(r.recentes);
        } catch {
            // sem internet
        }
    }, [farmId]);

    const enviar = async (item: PartoPayload) => {
        await tratarEnvio(async () => {
            const r = await lancarParto(farmId, item);
            if (r.avisos?.length) onAviso(`Parto da ${item.brinco}: ${r.avisos.join(' ')}`);
        }, (m) => setRecusas((x) => [...x, `Parto da ${item.brinco} em ${fmtData(item.data)}: ${m}`]));
    };

    const fila = useOfflineQueue<PartoPayload>('eixo:repro:parto:fila:', farmId, {
        autoSync: enviar,
        onSynced: () => void carregar(),
    });

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const baixar = async () => {
        try {
            const r = await baixarVacasCurral(farmId);
            const novo = { ...cache, baixadoEm: r.baixadoEm, vacas: r.vacas };
            setCache(novo);
            gravarLocal(chaveVacas, novo);
        } catch (e: any) {
            onErro(e.message);
        }
    };

    const vaca = useMemo(() => cache.vacas.find((v) => norm(v.brinco) === norm(brinco)), [cache.vacas, brinco]);
    const setCria = (i: number, campo: keyof CriaPayload, valor: any) =>
        setCrias((lista) => lista.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)));

    const salvar = async () => {
        const item: PartoPayload = {
            clientId: crypto.randomUUID(),
            brinco: brinco.trim(),
            vacaId: vaca?.id,
            data,
            tipoParto: tipo,
            ecc: ecc ? Number(ecc) : null,
            obs: obs.trim() || undefined,
            crias: crias.map((c) => ({ ...c, peso: c.peso ? Number(c.peso) : null, identificacao: c.identificacao?.trim() || null })),
        };
        fila.enqueue(item);
        setBrinco('');
        setEcc('');
        setObs('');
        setCrias([criaVazia()]);
        if (navigator.onLine) {
            const r = await fila.sync(enviar);
            if (r.sent) onAviso('Parto salvo. Bezerro(s) vivo(s) já estão no Rebanho.');
        } else {
            onAviso('Parto guardado no celular. Será enviado quando a internet voltar.');
        }
    };

    const apagar = async (id: string) => {
        try {
            const r = await apagarParto(farmId, id);
            onAviso(`Parto apagado junto com ${r.bezerrosApagados} bezerro(s).`);
            setApagarId(null);
            await carregar();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    return (
        <div className="space-y-4">
            {recusas.length > 0 && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{recusas.map((r) => <p key={r}>{r}</p>)}</div>}

            <div className={`${cardClass} space-y-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold">Lançar parto</h3>
                    <div className="flex gap-2">
                        {fila.items.length > 0 && <button type="button" className={secondaryButton} onClick={() => void fila.sync(enviar)}>Enviar agora ({fila.items.length})</button>}
                        <button type="button" className={secondaryButton} onClick={baixar}>Baixar vacas</button>
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label>
                        <span className={labelClass}>Vaca (identificação)</span>
                        <input className={`${inputClass} text-lg`} value={brinco} onChange={(e) => setBrinco(e.target.value)} autoComplete="off" />
                        {brinco && (
                            <span className={`mt-1 block text-xs ${vaca ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {vaca ? `${vaca.categoria} · ${vaca.situacao === 'PRENHE' ? 'prenhe' : vaca.situacao === 'VAZIA' ? 'estava vazia — confira' : vaca.situacao?.toLowerCase() || 'sem situação'}` : 'Não está na lista do celular — o servidor confere.'}
                            </span>
                        )}
                    </label>
                    <label>
                        <span className={labelClass}>Data do parto</span>
                        <input type="date" className={inputClass} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
                    </label>
                    <label>
                        <span className={labelClass}>Tipo de parto</span>
                        <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as TipoParto)}>
                            {(Object.keys(TIPO_PARTO) as TipoParto[]).map((t) => <option key={t} value={t}>{TIPO_PARTO[t]}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className={labelClass}>ECC da vaca (opcional)</span>
                        <input type="number" inputMode="decimal" min={1} max={5} step={0.25} className={inputClass} value={ecc} onChange={(e) => setEcc(e.target.value)} />
                    </label>
                </div>

                {crias.map((c, i) => (
                    <div key={i} className="grid gap-3 rounded-xl bg-[var(--eixo-surface-soft)] p-3 sm:grid-cols-4">
                        <p className="text-xs font-bold sm:col-span-4">{crias.length > 1 ? `Cria ${i + 1}` : 'Cria'}</p>
                        <div>
                            <span className={labelClass}>Sexo</span>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                {(['MACHO', 'FEMEA'] as const).map((s) => (
                                    <button key={s} type="button" onClick={() => setCria(i, 'sexo', s)}
                                        className={c.sexo === s ? primaryButton : secondaryButton}>{s === 'MACHO' ? 'Macho' : 'Fêmea'}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className={labelClass}>Nasceu</span>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setCria(i, 'vivo', true)} className={c.vivo ? primaryButton : secondaryButton}>Vivo</button>
                                <button type="button" onClick={() => setCria(i, 'vivo', false)} className={!c.vivo ? 'rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white' : secondaryButton}>Morto</button>
                            </div>
                        </div>
                        <label>
                            <span className={labelClass}>Peso ao nascer (kg, opcional)</span>
                            <input type="number" inputMode="decimal" min={1} max={99} className={inputClass} value={c.peso ?? ''} onChange={(e) => setCria(i, 'peso', e.target.value)} />
                        </label>
                        {c.vivo && (
                            <label>
                                <span className={labelClass}>Identificação (opcional)</span>
                                <input className={inputClass} placeholder="Sem brinco: fica provisória" value={c.identificacao ?? ''} onChange={(e) => setCria(i, 'identificacao', e.target.value)} />
                            </label>
                        )}
                    </div>
                ))}
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={crias.length === 2} onChange={(e) => setCrias(e.target.checked ? [crias[0], criaVazia()] : [crias[0]])} />
                    Gêmeos
                </label>
                <label className="block">
                    <span className={labelClass}>Observação</span>
                    <input className={inputClass} value={obs} onChange={(e) => setObs(e.target.value)} />
                </label>
                <button type="button" className={primaryButton} disabled={!brinco.trim()} onClick={salvar}>Salvar parto</button>
            </div>

            <div className={`${cardClass} space-y-2`}>
                <h3 className="font-bold">Partos previstos (próximos 30 dias e atrasados)</h3>
                {!previstos.length && <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum parto previsto para os próximos 30 dias.</p>}
                <ul className="divide-y divide-[var(--eixo-border)] text-sm">
                    {previstos.map((p) => (
                        <li key={p.id} className="flex items-center justify-between py-2">
                            <button type="button" className="font-semibold underline" onClick={() => onAbrirFicha(p.id)}>{p.brinco}</button>
                            <span className={p.status === 'ATRASADO' ? 'font-semibold text-red-700' : ''}>
                                {fmtData(p.previsaoParto)}{p.status === 'ATRASADO' ? ' · parto atrasado, confira a vaca' : ''}{p.lote ? ` · ${p.lote}` : ''}
                            </span>
                        </li>
                    ))}
                </ul>
                {semPrevisao > 0 && <p className="text-xs text-[var(--eixo-text-muted)]">{semPrevisao} vaca(s) prenhe(s) sem previsão (falta dias de gestação, cobertura ou tempo de gestação nos Critérios).</p>}
            </div>

            {recentes.length > 0 && (
                <div className={`${cardClass} space-y-2`}>
                    <h3 className="font-bold">Partos dos últimos 90 dias</h3>
                    <ul className="divide-y divide-[var(--eixo-border)] text-sm">
                        {recentes.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <span>
                                    <b>{p.brinco}</b> · {fmtData(p.date)} · {TIPO_PARTO[p.payload.tipoParto as TipoParto] || '—'}
                                    {Array.isArray(p.payload.crias) && ` · ${p.payload.crias.map((c: any) => `${c.sexo === 'FEMEA' ? 'fêmea' : 'macho'}${c.vivo ? '' : ' (morto)'}${c.brinco ? ` ${c.brinco}` : ''}`).join(', ')}`}
                                </span>
                                {apagarId === p.id ? (
                                    <span className="flex gap-2 text-xs">
                                        <button type="button" className="font-bold text-red-700 underline" onClick={() => apagar(p.id)}>Confirmar: apagar parto e bezerro</button>
                                        <button type="button" className="underline" onClick={() => setApagarId(null)}>Não</button>
                                    </span>
                                ) : (
                                    <button type="button" className="text-xs text-red-700 underline" onClick={() => setApagarId(p.id)}>Apagar</button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

// ---------- Desmama ----------

export const DesmamaAba: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    irParaCriterios: () => void;
}> = ({ farmId, onErro, onAviso, irParaCriterios }) => {
    const chave = `eixo:repro:bezerros:${farmId}`;
    const chaveVacas = `eixo:repro:vacas:${farmId}`;
    const lotes = lerLocal<{ lotes: { id: string; name: string }[] }>(chaveVacas, { lotes: [] }).lotes || [];
    const [info, setInfo] = useState<{ bezerros: BezerroDesmama[]; criteriosDefinidos: boolean; recentes: { id: string; mae: string; date: string; payload: Record<string, any> }[] }>(
        () => lerLocal(chave, { bezerros: [], criteriosDefinidos: false, recentes: [] }),
    );
    const [soProntos, setSoProntos] = useState(true);
    const [data, setData] = useState(hoje());
    const [lotId, setLotId] = useState('');
    const [pesos, setPesos] = useState<Record<string, string>>({});
    const [resultado, setResultado] = useState<string[]>([]);
    const [desfazerId, setDesfazerId] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        try {
            const r = await listarDesmama(farmId);
            setInfo(r);
            gravarLocal(chave, r);
        } catch {
            // sem internet: usa a lista guardada
        }
    }, [farmId, chave]);

    const enviar = async (item: DesmamaPayload) => {
        await tratarEnvio(async () => {
            const r = await lancarDesmama(farmId, item);
            const linhas = r.feitos.filter((f) => !f.repetido).map((f) => `${f.brinco}: ${f.peso} kg${f.pesoAjustado205 ? ` (205 dias: ${f.pesoAjustado205} kg)` : ''}${f.precoce ? ' · desmama precoce' : ''}`);
            const erros = r.erros.map((e) => `${e.brinco}: ${e.motivo}`);
            setResultado((x) => [...x, ...linhas, ...erros.map((e) => `NÃO GRAVADO — ${e}`)]);
        }, (m) => setResultado((x) => [...x, `NÃO GRAVADO — desmama de ${fmtData(item.data)}: ${m}`]));
    };

    const fila = useOfflineQueue<DesmamaPayload>('eixo:repro:desmama:fila:', farmId, {
        autoSync: enviar,
        onSynced: () => void carregar(),
    });

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const lista = info.bezerros.filter((b) => !soProntos || !info.criteriosDefinidos || b.pronto);
    const preenchidos = lista.filter((b) => Number(pesos[b.id]) > 0);

    const salvar = async () => {
        const precoces = preenchidos.filter((b) => b.idadeDias != null && b.idadeDias < 90).map((b) => b.brinco);
        if (precoces.length) onAviso(`Desmama precoce (menos de 90 dias): ${precoces.join(', ')}. Confirme que é manejo planejado.`);
        fila.enqueue({
            clientId: crypto.randomUUID(),
            data,
            lotId: lotId || null,
            linhas: preenchidos.map((b) => ({ animalId: b.id, brinco: b.brinco, peso: Number(pesos[b.id]) })),
        });
        setPesos({});
        setResultado([]);
        if (navigator.onLine) await fila.sync(enviar);
        else onAviso('Desmama guardada no celular. Será enviada quando a internet voltar.');
    };

    const desfazer = async (id: string) => {
        try {
            const r = await desfazerDesmama(farmId, id);
            onAviso(r.aviso);
            setDesfazerId(null);
            await carregar();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    return (
        <div className="space-y-4">
            {!info.criteriosDefinidos && (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Defina a idade e/ou o peso de desmama para o EIXO separar os bezerros prontos.{' '}
                    <button type="button" className="font-bold underline" onClick={irParaCriterios}>Definir critérios</button>
                </div>
            )}
            {resultado.length > 0 && (
                <div className="rounded-xl bg-[var(--eixo-surface-soft)] px-4 py-3 text-sm">
                    {resultado.map((r) => <p key={r} className={r.startsWith('NÃO') ? 'text-red-700' : ''}>{r}</p>)}
                </div>
            )}
            <div className={`${cardClass} space-y-3`}>
                <div className="flex flex-wrap items-end gap-3">
                    <label>
                        <span className={labelClass}>Data da desmama</span>
                        <input type="date" className={inputClass} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
                    </label>
                    <label>
                        <span className={labelClass}>Mandar para o lote (opcional)</span>
                        <select className={inputClass} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                            <option value="">Não mudar</option>
                            {lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </label>
                    {info.criteriosDefinidos && (
                        <label className="flex items-center gap-2 pb-3 text-sm">
                            <input type="checkbox" checked={soProntos} onChange={(e) => setSoProntos(e.target.checked)} />
                            Só os prontos
                        </label>
                    )}
                    {fila.items.length > 0 && <button type="button" className={secondaryButton} onClick={() => void fila.sync(enviar)}>Enviar agora ({fila.items.length})</button>}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                        <thead>
                            <tr className="text-left text-xs text-[var(--eixo-text-muted)]">
                                <th className="py-2">Bezerro</th>
                                <th>Mãe</th>
                                <th>Idade</th>
                                <th>Último peso</th>
                                <th>Peso na desmama (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!lista.length && <tr><td colSpan={5} className="py-6 text-center text-[var(--eixo-text-muted)]">Nenhum bezerro para desmamar.</td></tr>}
                            {lista.map((b) => (
                                <tr key={b.id} className="border-t border-[var(--eixo-border)]">
                                    <td className="py-2 font-semibold">{b.brinco}<span className="block text-xs font-normal text-[var(--eixo-text-muted)]">{b.sexo === 'FEMEA' ? 'Fêmea' : 'Macho'}</span></td>
                                    <td>{b.mae || '—'}</td>
                                    <td className={b.idadeDias != null && b.idadeDias < 90 ? 'text-amber-700' : ''}>
                                        {b.idadeDias == null ? '—' : `${Math.floor(b.idadeDias / 30.4375)} meses`}
                                    </td>
                                    <td>{b.peso != null ? `${b.peso} kg` : '—'}</td>
                                    <td>
                                        <input type="number" inputMode="decimal" min={1} className="w-28 rounded-lg border border-[var(--eixo-border)] px-2 py-1.5"
                                            aria-label={`Peso de ${b.brinco}`} value={pesos[b.id] || ''} onChange={(e) => setPesos((p) => ({ ...p, [b.id]: e.target.value }))} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button type="button" className={primaryButton} disabled={!preenchidos.length} onClick={salvar}>
                    Salvar desmama ({preenchidos.length})
                </button>
            </div>

            {info.recentes.length > 0 && (
                <div className={`${cardClass} space-y-2`}>
                    <h3 className="font-bold">Desmamas dos últimos 90 dias</h3>
                    <ul className="divide-y divide-[var(--eixo-border)] text-sm">
                        {info.recentes.map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <span>
                                    {fmtData(d.date)} · bezerro <b>{d.payload.bezerro}</b> (mãe {d.mae}) · {d.payload.peso} kg
                                    {d.payload.pesoAjustado205 ? ` · 205 dias: ${d.payload.pesoAjustado205} kg` : ''}{d.payload.precoce ? ' · precoce' : ''}
                                </span>
                                {desfazerId === d.id ? (
                                    <span className="flex gap-2 text-xs">
                                        <button type="button" className="font-bold text-red-700 underline" onClick={() => desfazer(d.id)}>Confirmar</button>
                                        <button type="button" className="underline" onClick={() => setDesfazerId(null)}>Não</button>
                                    </span>
                                ) : (
                                    <button type="button" className="text-xs text-red-700 underline" onClick={() => setDesfazerId(d.id)}>Desfazer</button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
