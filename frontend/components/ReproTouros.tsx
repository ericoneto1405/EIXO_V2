import React, { useCallback, useEffect, useState } from 'react';
import {
    Estacao,
    LotacaoLote,
    TouroFicha,
    apagarEstacao,
    colocarTouroNoLote,
    fetchLotacao,
    lancarExameTouro,
    listarEstacoes,
    listarTouros,
    salvarEstacao,
    tirarTouroDoLote,
} from '../adapters/reproApi';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const COR_TEXTO: Record<string, string> = { VERDE: 'text-emerald-700', AMARELO: 'text-amber-700', VERMELHO: 'text-red-700' };
const TIPO_ESTACAO: Record<string, string> = { MONTA_NATURAL: 'Monta natural', IATF: 'IATF', IATF_REPASSE: 'IATF com repasse' };
const RESULTADO: Record<string, string> = { SUPERIOR: 'Superior', APTO: 'Apto', APTO_RESTRICAO: 'Apto com restrição', INAPTO: 'Inapto' };

export const EstacaoAba: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, onErro, onAviso }) => {
    const [estacoes, setEstacoes] = useState<Estacao[]>([]);
    const [lotes, setLotes] = useState<{ id: string; name: string }[]>([]);
    const [form, setForm] = useState({ name: '', startAt: hoje(), endAt: '', tipo: 'MONTA_NATURAL', lotIds: [] as string[] });
    const [apagarId, setApagarId] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        try {
            const r = await listarEstacoes(farmId);
            setEstacoes(r.estacoes);
            setLotes(r.lotes);
            onErro(null);
        } catch (e: any) {
            onErro(e.message);
        }
    }, [farmId, onErro]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const salvar = async () => {
        try {
            await salvarEstacao(farmId, form);
            onAviso('Estação salva.');
            setForm({ name: '', startAt: hoje(), endAt: '', tipo: 'MONTA_NATURAL', lotIds: [] });
            await carregar();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-[var(--eixo-text-muted)]">
                A estação de monta é opcional. Quem cobre o ano todo não precisa cadastrar nada: o EIXO usa os últimos 12 meses.
            </p>

            {estacoes.map((e) => (
                <div key={e.id} className={`${cardClass} space-y-2`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h3 className="font-bold">
                                {e.name} · {fmtData(e.startAt)} a {fmtData(e.endAt)}
                                {e.tipo ? ` · ${TIPO_ESTACAO[e.tipo]}` : ''}
                            </h3>
                            <p className="text-xs text-[var(--eixo-text-muted)]">
                                {e.duracaoDias} dias{e.emAndamento ? ` · em andamento, faltam ${e.diasRestantes} dia(s)` : ' · encerrada'}
                            </p>
                        </div>
                        {apagarId === e.id ? (
                            <span className="flex gap-2 text-xs">
                                <button type="button" className="font-bold text-red-700 underline"
                                    onClick={async () => { try { await apagarEstacao(farmId, e.id); setApagarId(null); await carregar(); } catch (err: any) { onErro(err.message); } }}>
                                    Confirmar
                                </button>
                                <button type="button" className="underline" onClick={() => setApagarId(null)}>Não</button>
                            </span>
                        ) : (
                            <button type="button" className="text-xs text-red-700 underline" onClick={() => setApagarId(e.id)}>Apagar</button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                            ['Fêmeas na estação', e.painel.expostas],
                            ['Cobertas', e.painel.cobertas],
                            ['Diagnosticadas', e.painel.diagnosticadas],
                            ['Prenhes', e.painel.prenhes],
                        ].map(([titulo, valor]) => (
                            <div key={String(titulo)} className="rounded-xl bg-[var(--eixo-surface-soft)] px-3 py-2">
                                <p className="text-xs text-[var(--eixo-text-muted)]">{titulo}</p>
                                <p className="text-xl font-bold">{valor}</p>
                            </div>
                        ))}
                    </div>
                    {e.alertas.map((a) => (
                        <p key={a.texto} className={`text-sm ${a.cor === 'VERMELHO' ? 'text-red-700' : 'text-amber-700'}`}>{a.texto}</p>
                    ))}
                </div>
            ))}

            <div className={`${cardClass} space-y-3`}>
                <h3 className="font-bold">Nova estação</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label>
                        <span className={labelClass}>Nome</span>
                        <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Estação 2026/2027" />
                    </label>
                    <label>
                        <span className={labelClass}>Início</span>
                        <input type="date" className={inputClass} value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Fim</span>
                        <input type="date" className={inputClass} value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Tipo</span>
                        <select className={inputClass} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                            {Object.entries(TIPO_ESTACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </label>
                </div>
                <div>
                    <span className={labelClass}>Lotes da estação</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                        {lotes.map((l) => {
                            const marcado = form.lotIds.includes(l.id);
                            return (
                                <button key={l.id} type="button" className={marcado ? primaryButton : secondaryButton}
                                    onClick={() => setForm({ ...form, lotIds: marcado ? form.lotIds.filter((x) => x !== l.id) : [...form.lotIds, l.id] })}>
                                    {l.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <button type="button" className={primaryButton} disabled={!form.name.trim() || !form.endAt} onClick={salvar}>Salvar estação</button>
            </div>
        </div>
    );
};

export const TourosAba: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, onErro, onAviso }) => {
    const [touros, setTouros] = useState<TouroFicha[]>([]);
    const [lotes, setLotes] = useState<{ id: string; name: string }[]>([]);
    const [lotacao, setLotacao] = useState<LotacaoLote[]>([]);
    const [exameDe, setExameDe] = useState<TouroFicha | null>(null);
    const [exame, setExame] = useState({ date: hoje(), resultado: 'APTO', libido: '', perimetroCm: '', vetName: '' });
    const [loteDe, setLoteDe] = useState<TouroFicha | null>(null);
    const [aloc, setAloc] = useState({ lotId: '', startAt: hoje(), repasse: false });

    const carregar = useCallback(async () => {
        try {
            const [t, l] = await Promise.all([listarTouros(farmId), fetchLotacao(farmId)]);
            setTouros(t.touros);
            setLotes(t.lotes);
            setLotacao(l.lotes);
            onErro(null);
        } catch (e: any) {
            onErro(e.message);
        }
    }, [farmId, onErro]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    return (
        <div className="space-y-4">
            {lotacao.length > 0 && (
                <div className={`${cardClass} space-y-2`}>
                    <h3 className="font-bold">Touro por lote</h3>
                    {lotacao.map((l) => (
                        <p key={l.lotId} className={`text-sm ${l.cor ? COR_TEXTO[l.cor] : ''}`}>{l.texto}</p>
                    ))}
                </div>
            )}

            <div className={`${cardClass} space-y-3`}>
                <h3 className="font-bold">Touros</h3>
                {!touros.length && <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum touro ainda. Lance o exame de fertilidade de um macho do rebanho para ele aparecer aqui.</p>}
                {touros.map((t) => (
                    <div key={t.id} className="space-y-2 rounded-xl border border-[var(--eixo-border)] p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="font-semibold">
                                    {t.brinco}{t.raca ? ` · ${t.raca}` : ''}{t.idadeMeses != null ? ` · ${Math.floor(t.idadeMeses / 12)} anos` : ''}
                                    {t.noLote ? ` · no lote ${t.noLote.lote}${t.noLote.repasse ? ' (repasse)' : ''} desde ${fmtData(t.noLote.startAt)}` : ''}
                                </p>
                                <p className={`text-xs ${t.inapto ? 'text-red-700' : t.exame?.valido ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {t.exame
                                        ? `Exame de ${fmtData(t.exame.date)}: ${RESULTADO[t.exame.resultado]}${t.exame.valido ? '' : ' (vencido)'}${t.exame.vetName ? ` · ${t.exame.vetName}` : ''}`
                                        : 'Sem exame de fertilidade registrado'}
                                </p>
                                {t.inapto && <p className="text-xs text-red-700">Reprovado: saiu do lote e foi para a lista de descarte.</p>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={secondaryButton} onClick={() => { setExameDe(t); setExame({ date: hoje(), resultado: 'APTO', libido: '', perimetroCm: '', vetName: '' }); }}>
                                    Lançar exame
                                </button>
                                {t.noLote ? (
                                    <button type="button" className={secondaryButton}
                                        onClick={async () => { try { await tirarTouroDoLote(farmId, t.noLote!.id); onAviso(`${t.brinco} saiu do lote.`); await carregar(); } catch (e: any) { onErro(e.message); } }}>
                                        Tirar do lote
                                    </button>
                                ) : (
                                    <button type="button" className={secondaryButton} disabled={t.inapto} onClick={() => { setLoteDe(t); setAloc({ lotId: '', startAt: hoje(), repasse: false }); }}>
                                        Colocar em lote
                                    </button>
                                )}
                            </div>
                        </div>

                        {exameDe?.id === t.id && (
                            <div className="grid gap-2 rounded-xl bg-[var(--eixo-surface-soft)] p-3 sm:grid-cols-5">
                                <label>
                                    <span className={labelClass}>Data</span>
                                    <input type="date" className={inputClass} value={exame.date} max={hoje()} onChange={(e) => setExame({ ...exame, date: e.target.value })} />
                                </label>
                                <label>
                                    <span className={labelClass}>Resultado</span>
                                    <select className={inputClass} value={exame.resultado} onChange={(e) => setExame({ ...exame, resultado: e.target.value })}>
                                        {Object.entries(RESULTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </label>
                                <label>
                                    <span className={labelClass}>Libido (opcional)</span>
                                    <select className={inputClass} value={exame.libido} onChange={(e) => setExame({ ...exame, libido: e.target.value })}>
                                        <option value="">—</option>
                                        <option value="ALTA">Alta</option>
                                        <option value="MEDIA">Média</option>
                                        <option value="BAIXA">Baixa</option>
                                    </select>
                                </label>
                                <label>
                                    <span className={labelClass}>Perímetro (cm)</span>
                                    <input type="number" min={0} className={inputClass} value={exame.perimetroCm} onChange={(e) => setExame({ ...exame, perimetroCm: e.target.value })} />
                                </label>
                                <label>
                                    <span className={labelClass}>Veterinário</span>
                                    <input className={inputClass} value={exame.vetName} onChange={(e) => setExame({ ...exame, vetName: e.target.value })} />
                                </label>
                                <div className="flex gap-2 sm:col-span-5">
                                    <button type="button" className={primaryButton}
                                        onClick={async () => {
                                            try {
                                                const r = await lancarExameTouro(farmId, t.id, exame);
                                                onAviso(r.descartado ? `${t.brinco} reprovou: saiu do lote e foi para o descarte.` : 'Exame salvo.');
                                                setExameDe(null);
                                                await carregar();
                                            } catch (e: any) { onErro(e.message); }
                                        }}>
                                        Salvar exame
                                    </button>
                                    <button type="button" className={secondaryButton} onClick={() => setExameDe(null)}>Cancelar</button>
                                </div>
                            </div>
                        )}

                        {loteDe?.id === t.id && (
                            <div className="grid gap-2 rounded-xl bg-[var(--eixo-surface-soft)] p-3 sm:grid-cols-4">
                                <label>
                                    <span className={labelClass}>Lote</span>
                                    <select className={inputClass} value={aloc.lotId} onChange={(e) => setAloc({ ...aloc, lotId: e.target.value })}>
                                        <option value="">Escolha</option>
                                        {lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </label>
                                <label>
                                    <span className={labelClass}>Entrou em</span>
                                    <input type="date" className={inputClass} value={aloc.startAt} max={hoje()} onChange={(e) => setAloc({ ...aloc, startAt: e.target.value })} />
                                </label>
                                <label className="flex items-center gap-2 pb-3 sm:self-end">
                                    <input type="checkbox" checked={aloc.repasse} onChange={(e) => setAloc({ ...aloc, repasse: e.target.checked })} />
                                    Touro de repasse
                                </label>
                                <div className="flex gap-2 sm:self-end sm:pb-2">
                                    <button type="button" className={primaryButton} disabled={!aloc.lotId}
                                        onClick={async () => {
                                            try {
                                                const r = await colocarTouroNoLote(farmId, t.id, aloc);
                                                onAviso([`${t.brinco} entrou no lote.`, ...(r.avisos || [])].join(' '));
                                                setLoteDe(null);
                                                await carregar();
                                            } catch (e: any) { onErro(e.message); }
                                        }}>
                                        Salvar
                                    </button>
                                    <button type="button" className={secondaryButton} onClick={() => setLoteDe(null)}>Cancelar</button>
                                </div>
                            </div>
                        )}

                        {t.historico.length > 0 && (
                            <p className="text-xs text-[var(--eixo-text-muted)]">
                                Histórico: {t.historico.map((h) => `${h.lote} (${fmtData(h.startAt)}${h.endAt ? ` a ${fmtData(h.endAt)}` : ' até hoje'})`).join(', ')}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
