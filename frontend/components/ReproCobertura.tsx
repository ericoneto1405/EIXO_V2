import React, { useCallback, useEffect, useState } from 'react';
import {
    AgendaPasso,
    PartidaSemen,
    PassoProtocolo,
    ProdutoFarmacia,
    Protocolo,
    SessaoIatf,
    Tanque,
    abrirIatf,
    apagarIatf,
    apagarProtocolo,
    atualizarPartida,
    fetchBotijao,
    lancarEntradaSemen,
    lancarInseminacao,
    lancarMedicao,
    lancarMontaNatural,
    listarIatf,
    listarProtocolos,
    marcarPasso,
    movimentarDoses,
    salvarProtocolo,
    salvarTanque,
} from '../adapters/reproApi';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const QUANDO: Record<AgendaPasso['quando'], string> = { ATRASADO: 'atrasado', HOJE: 'hoje', AMANHA: 'amanhã', FUTURO: '' };

// ---------- Cobertura: monta natural, protocolos e IATF ----------

export const CoberturaAba: React.FC<{
    farmId: string;
    lotes: { id: string; name: string }[];
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, lotes, onErro, onAviso }) => {
    const [sessoes, setSessoes] = useState<SessaoIatf[]>([]);
    const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
    const [produtos, setProdutos] = useState<ProdutoFarmacia[]>([]);
    const [partidas, setPartidas] = useState<PartidaSemen[]>([]);
    const [mostrarProtocolos, setMostrarProtocolos] = useState(false);
    const [inseminando, setInseminando] = useState<SessaoIatf | null>(null);

    const carregar = useCallback(async () => {
        try {
            const [i, p, b] = await Promise.all([listarIatf(farmId), listarProtocolos(farmId), fetchBotijao(farmId)]);
            setSessoes(i.sessoes);
            setProtocolos(p.protocolos);
            setProdutos(p.produtos);
            setPartidas(b.partidas);
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
            <MontaNatural farmId={farmId} lotes={lotes} onErro={onErro} onAviso={onAviso} />
            <AbrirIatf farmId={farmId} lotes={lotes} protocolos={protocolos.filter((p) => p.ativo)} onErro={onErro} onAviso={onAviso} onCriada={carregar} />

            <div className={`${cardClass} space-y-3`}>
                <div className="flex items-center justify-between">
                    <h3 className="font-bold">Protocolos de IATF</h3>
                    <button type="button" className={secondaryButton} onClick={() => setMostrarProtocolos((v) => !v)}>
                        {mostrarProtocolos ? 'Esconder' : 'Ver e cadastrar'}
                    </button>
                </div>
                {mostrarProtocolos && (
                    <Protocolos farmId={farmId} protocolos={protocolos} produtos={produtos} onErro={onErro} onAviso={onAviso} onMudou={carregar} />
                )}
            </div>

            <div className={`${cardClass} space-y-3`}>
                <h3 className="font-bold">IATF em andamento</h3>
                {!sessoes.length && <p className="text-sm text-[var(--eixo-text-muted)]">Nenhum protocolo aberto.</p>}
                {sessoes.map((s) => (
                    <div key={s.id} className="rounded-xl border border-[var(--eixo-border)] p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="font-semibold">
                                    Dia 0 em {fmtData(s.dia0)} · {s.protocolo || 'sem protocolo'} · {s.vacas.length} vaca(s)
                                    {s.status === 'INSEMINADO' ? ' · inseminada' : ''}
                                </p>
                                {s.responsavel && <p className="text-xs text-[var(--eixo-text-muted)]">Responsável: {s.responsavel}</p>}
                                {s.resumo?.alertas?.map((a) => <p key={a} className="text-xs text-amber-700">{a}</p>)}
                                {s.resumo?.fora?.length ? (
                                    <p className="text-xs text-[var(--eixo-text-muted)]">
                                        Fora do protocolo: {s.resumo.fora.map((f) => `${f.brinco} (${f.motivo})`).join('; ')}
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex gap-2">
                                {s.status !== 'INSEMINADO' && (
                                    <>
                                        <button type="button" className={primaryButton} onClick={() => setInseminando(s)}>Lançar inseminação</button>
                                        <button type="button" className="text-xs text-red-700 underline"
                                            onClick={async () => { try { await apagarIatf(farmId, s.id); await carregar(); } catch (e: any) { onErro(e.message); } }}>
                                            Apagar
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        {s.agenda.length > 0 && (
                            <ul className="mt-2 space-y-1">
                                {s.agenda.map((p) => {
                                    const feito = s.passosFeitos.some((f) => Number(f.dia) === p.dia);
                                    return (
                                        <li key={p.dia} className="flex flex-wrap items-center justify-between gap-2">
                                            <span className={p.quando === 'ATRASADO' && !feito ? 'text-red-700' : ''}>
                                                Dia {p.dia} · {fmtData(p.data)} {QUANDO[p.quando] && `(${QUANDO[p.quando]})`} — {p.titulo}
                                            </span>
                                            {feito ? <span className="text-xs text-emerald-700">feito</span> : (
                                                <button type="button" className={secondaryButton}
                                                    onClick={async () => {
                                                        try {
                                                            const r = await marcarPasso(farmId, s.id, p.dia);
                                                            onAviso(r.consumo ? `Passo marcado. Baixou ${r.consumo} da Farmácia.` : 'Passo marcado.');
                                                            await carregar();
                                                        } catch (e: any) { onErro(e.message); }
                                                    }}>
                                                    Marcar feito
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {s.resumo?.pendencias?.length ? (
                            <p className="mt-2 text-xs text-amber-700">
                                Não lançadas: {s.resumo.pendencias.map((p) => `${p.brinco} (${p.motivo})`).join('; ')}
                            </p>
                        ) : null}
                    </div>
                ))}
            </div>

            {inseminando && (
                <Inseminacao farmId={farmId} sessao={inseminando} partidas={partidas} onFechar={() => setInseminando(null)}
                    onErro={onErro} onAviso={onAviso} onPronto={async () => { setInseminando(null); await carregar(); }} />
            )}
        </div>
    );
};

const MontaNatural: React.FC<{
    farmId: string;
    lotes: { id: string; name: string }[];
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, lotes, onErro, onAviso }) => {
    const [lotId, setLotId] = useState('');
    const [touro, setTouro] = useState('');
    const [inicio, setInicio] = useState(hoje());
    const [fim, setFim] = useState('');
    const [repasse, setRepasse] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const salvar = async () => {
        setSalvando(true);
        try {
            const r = await lancarMontaNatural(farmId, { lotId, touro, inicio, fim: fim || null, repasse });
            onAviso(`Monta natural registrada em ${r.total} vaca(s).`);
            setTouro('');
            setFim('');
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`${cardClass} space-y-3`}>
            <h3 className="font-bold">Monta natural</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label>
                    <span className={labelClass}>Lote</span>
                    <select className={inputClass} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                        <option value="">Escolha</option>
                        {lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </label>
                <label>
                    <span className={labelClass}>Touro</span>
                    <input className={inputClass} value={touro} onChange={(e) => setTouro(e.target.value)} />
                </label>
                <label>
                    <span className={labelClass}>Entrou no lote</span>
                    <input type="date" className={inputClass} value={inicio} max={hoje()} onChange={(e) => setInicio(e.target.value)} />
                </label>
                <label>
                    <span className={labelClass}>Saiu do lote (opcional)</span>
                    <input type="date" className={inputClass} value={fim} max={hoje()} onChange={(e) => setFim(e.target.value)} />
                </label>
                <label className="flex items-center gap-2 pb-3 text-sm sm:self-end">
                    <input type="checkbox" checked={repasse} onChange={(e) => setRepasse(e.target.checked)} />
                    Touro de repasse (depois da IATF)
                </label>
            </div>
            <button type="button" className={primaryButton} disabled={!lotId || !touro.trim() || salvando} onClick={salvar}>
                {salvando ? 'Salvando…' : 'Registrar monta natural'}
            </button>
        </div>
    );
};

const AbrirIatf: React.FC<{
    farmId: string;
    lotes: { id: string; name: string }[];
    protocolos: Protocolo[];
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    onCriada: () => void;
}> = ({ farmId, lotes, protocolos, onErro, onAviso, onCriada }) => {
    const [protocolId, setProtocolId] = useState('');
    const [dia0, setDia0] = useState(hoje());
    const [lotId, setLotId] = useState('');
    const [responsavel, setResponsavel] = useState('');
    const [salvando, setSalvando] = useState(false);

    const abrir = async () => {
        setSalvando(true);
        try {
            const r = await abrirIatf(farmId, { clientId: crypto.randomUUID(), protocolId: protocolId || null, dia0, lotId, responsavel });
            const partes = [`Protocolo aberto com ${r.dentro?.length || 0} vaca(s).`];
            if (r.fora?.length) partes.push(`Fora: ${r.fora.map((f) => `${f.brinco} (${f.motivo})`).join('; ')}.`);
            if (r.alertas?.length) partes.push(r.alertas.join(' '));
            onAviso(partes.join(' '));
            onCriada();
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`${cardClass} space-y-3`}>
            <h3 className="font-bold">Abrir protocolo de IATF</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label>
                    <span className={labelClass}>Protocolo</span>
                    <select className={inputClass} value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
                        <option value="">Sem protocolo (só agrupa as vacas)</option>
                        {protocolos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                </label>
                <label>
                    <span className={labelClass}>Dia 0</span>
                    <input type="date" className={inputClass} value={dia0} onChange={(e) => setDia0(e.target.value)} />
                </label>
                <label>
                    <span className={labelClass}>Lote</span>
                    <select className={inputClass} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                        <option value="">Escolha</option>
                        {lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                </label>
                <label>
                    <span className={labelClass}>Responsável</span>
                    <input className={inputClass} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
                </label>
            </div>
            <p className="text-xs text-[var(--eixo-text-muted)]">
                Vaca prenhe não entra: o hormônio pode causar aborto. O protocolo é definido pelo veterinário responsável.
            </p>
            <button type="button" className={primaryButton} disabled={!lotId || salvando} onClick={abrir}>
                {salvando ? 'Abrindo…' : 'Abrir protocolo'}
            </button>
        </div>
    );
};

const Protocolos: React.FC<{
    farmId: string;
    protocolos: Protocolo[];
    produtos: ProdutoFarmacia[];
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    onMudou: () => void;
}> = ({ farmId, protocolos, produtos, onErro, onAviso, onMudou }) => {
    const [nome, setNome] = useState('');
    const [passos, setPassos] = useState<PassoProtocolo[]>([{ dia: 0, titulo: '', produtoId: '', dose: null }]);

    const setPasso = (i: number, campo: keyof PassoProtocolo, valor: any) =>
        setPassos((lista) => lista.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));

    const salvar = async () => {
        try {
            await salvarProtocolo(farmId, { nome, passos });
            onAviso('Protocolo salvo.');
            setNome('');
            setPassos([{ dia: 0, titulo: '', produtoId: '', dose: null }]);
            onMudou();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    return (
        <div className="space-y-3">
            <ul className="divide-y divide-[var(--eixo-border)] text-sm">
                {protocolos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2">
                        <span>
                            <b>{p.nome}</b>{!p.ativo && ' (desativado)'} · {p.passos.map((x) => `dia ${x.dia}`).join(', ')}
                        </span>
                        <button type="button" className="text-xs text-red-700 underline"
                            onClick={async () => {
                                try {
                                    const r = await apagarProtocolo(farmId, p.id);
                                    onAviso(r.desativado ? 'Protocolo já usado: foi desativado, não apagado.' : 'Protocolo apagado.');
                                    onMudou();
                                } catch (e: any) { onErro(e.message); }
                            }}>
                            Apagar
                        </button>
                    </li>
                ))}
            </ul>

            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3">
                <label className="block">
                    <span className={labelClass}>Nome do protocolo</span>
                    <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
                </label>
                {passos.map((p, i) => (
                    <div key={i} className="mt-2 grid gap-2 sm:grid-cols-4">
                        <label>
                            <span className={labelClass}>Dia</span>
                            <input type="number" min={0} max={60} className={inputClass} value={p.dia} onChange={(e) => setPasso(i, 'dia', Number(e.target.value))} />
                        </label>
                        <label>
                            <span className={labelClass}>O que fazer</span>
                            <input className={inputClass} value={p.titulo} onChange={(e) => setPasso(i, 'titulo', e.target.value)} />
                        </label>
                        <label>
                            <span className={labelClass}>Hormônio (Farmácia)</span>
                            <select className={inputClass} value={p.produtoId || ''} onChange={(e) => setPasso(i, 'produtoId', e.target.value)}>
                                <option value="">Nenhum</option>
                                {produtos.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                        </label>
                        <label>
                            <span className={labelClass}>Dose por vaca</span>
                            <input type="number" min={0} step={0.1} className={inputClass} value={p.dose ?? ''} onChange={(e) => setPasso(i, 'dose', e.target.value ? Number(e.target.value) : null)} />
                        </label>
                    </div>
                ))}
                <div className="mt-3 flex gap-2">
                    <button type="button" className={secondaryButton} onClick={() => setPassos((l) => [...l, { dia: (l[l.length - 1]?.dia ?? 0) + 1, titulo: '', produtoId: '', dose: null }])}>
                        Adicionar passo
                    </button>
                    <button type="button" className={primaryButton} disabled={!nome.trim()} onClick={salvar}>Salvar protocolo</button>
                </div>
            </div>
        </div>
    );
};

const Inseminacao: React.FC<{
    farmId: string;
    sessao: SessaoIatf;
    partidas: PartidaSemen[];
    onFechar: () => void;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    onPronto: () => void;
}> = ({ farmId, sessao, partidas, onFechar, onErro, onAviso, onPronto }) => {
    const [data, setData] = useState(hoje());
    const [inseminador, setInseminador] = useState('');
    const [padrao, setPadrao] = useState('');
    const [escolhas, setEscolhas] = useState<Record<string, string>>({});
    const [salvando, setSalvando] = useState(false);

    const linhas = sessao.vacas
        .map((v) => ({ brinco: v.brinco, semenBatchId: escolhas[v.brinco] || padrao, inseminador }))
        .filter((l) => l.semenBatchId);

    const salvar = async () => {
        setSalvando(true);
        try {
            const r = await lancarInseminacao(farmId, sessao.id, { data, linhas });
            const partes = [`${r.inseminadas || 0} vaca(s) inseminada(s).`];
            if (r.pendencias?.length) partes.push(`Não lançadas: ${r.pendencias.map((p) => `${p.brinco} (${p.motivo})`).join('; ')}.`);
            onAviso(partes.join(' '));
            onPronto();
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`${cardClass} space-y-3`}>
            <h3 className="font-bold">Lançar inseminação — {sessao.vacas.length} vaca(s)</h3>
            <div className="grid gap-3 sm:grid-cols-3">
                <label>
                    <span className={labelClass}>Data</span>
                    <input type="date" className={inputClass} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
                </label>
                <label>
                    <span className={labelClass}>Inseminador</span>
                    <input className={inputClass} value={inseminador} onChange={(e) => setInseminador(e.target.value)} />
                </label>
                <label>
                    <span className={labelClass}>Sêmen para todas</span>
                    <select className={inputClass} value={padrao} onChange={(e) => setPadrao(e.target.value)}>
                        <option value="">Escolha</option>
                        {partidas.map((p) => <option key={p.id} value={p.id}>{p.touro} · {p.lote} ({p.dosesDisponiveis} doses)</option>)}
                    </select>
                </label>
            </div>
            <ul className="max-h-64 divide-y divide-[var(--eixo-border)] overflow-y-auto text-sm">
                {sessao.vacas.map((v) => (
                    <li key={v.animalId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="font-semibold">{v.brinco}</span>
                        <select className="rounded-lg border border-[var(--eixo-border)] px-2 py-1 text-sm"
                            value={escolhas[v.brinco] || padrao} onChange={(e) => setEscolhas((x) => ({ ...x, [v.brinco]: e.target.value }))}>
                            <option value="">Sem sêmen (não lança)</option>
                            {partidas.map((p) => <option key={p.id} value={p.id}>{p.touro} · {p.lote}</option>)}
                        </select>
                    </li>
                ))}
            </ul>
            <div className="flex gap-2">
                <button type="button" className={primaryButton} disabled={!linhas.length || salvando} onClick={salvar}>
                    {salvando ? 'Salvando…' : `Salvar (${linhas.length})`}
                </button>
                <button type="button" className={secondaryButton} onClick={onFechar}>Cancelar</button>
            </div>
        </div>
    );
};

// ---------- Botijão ----------

export const BotijaoAba: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, onErro, onAviso }) => {
    const [dados, setDados] = useState<{ tanques: Tanque[]; partidas: PartidaSemen[]; alertas: { cor: string | null; texto: string }[] }>({ tanques: [], partidas: [], alertas: [] });
    const [novoTanque, setNovoTanque] = useState({ name: '', canecas: '', nivelMinCm: '', intervaloMedicaoDias: '' });
    const [medicao, setMedicao] = useState<Record<string, string>>({});
    const [entrada, setEntrada] = useState({ lote: '', touro: '', fornecedor: '', doses: '', tankId: '', caneca: '', custoDose: '' });
    const [movimento, setMovimento] = useState<{ id: string; tipo: 'OUT' | 'ADJUST' } | null>(null);
    const [movQtd, setMovQtd] = useState('');
    const [movMotivo, setMovMotivo] = useState('');

    const carregar = useCallback(async () => {
        try {
            setDados(await fetchBotijao(farmId));
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
            {dados.alertas.map((a) => (
                <div key={a.texto} className={`rounded-xl px-4 py-3 text-sm ${a.cor === 'VERMELHO' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{a.texto}</div>
            ))}

            <div className={`${cardClass} space-y-3`}>
                <h3 className="font-bold">Botijões</h3>
                {dados.tanques.map((t) => {
                    const ultima = t.readings[t.readings.length - 1];
                    return (
                        <div key={t.id} className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--eixo-border)] p-3 text-sm">
                            <div>
                                <p className="font-semibold">{t.name}{t.canecas ? ` · ${t.canecas} canecas` : ''}</p>
                                <p className="text-xs text-[var(--eixo-text-muted)]">
                                    {ultima ? `Última medição: ${fmtData(ultima.date)}${ultima.nivelCm != null ? ` · ${ultima.nivelCm} cm` : ''}` : 'Sem medição'}
                                    {t.nivelMinCm != null ? ` · mínimo ${t.nivelMinCm} cm` : ''}
                                    {t.ultimaRecargaEm ? ` · recarga em ${fmtData(t.ultimaRecargaEm)}` : ''}
                                </p>
                            </div>
                            <div className="flex items-end gap-2">
                                <label>
                                    <span className={labelClass}>Nível hoje (cm)</span>
                                    <input type="number" min={0} step={0.5} className="w-28 rounded-lg border border-[var(--eixo-border)] px-2 py-1.5"
                                        value={medicao[t.id] || ''} onChange={(e) => setMedicao((m) => ({ ...m, [t.id]: e.target.value }))} />
                                </label>
                                <button type="button" className={secondaryButton}
                                    onClick={async () => {
                                        try {
                                            await lancarMedicao(farmId, t.id, { nivelCm: medicao[t.id] ? Number(medicao[t.id]) : null });
                                            setMedicao((m) => ({ ...m, [t.id]: '' }));
                                            await carregar();
                                        } catch (e: any) { onErro(e.message); }
                                    }}>
                                    Salvar medição
                                </button>
                                <button type="button" className={secondaryButton}
                                    onClick={async () => {
                                        try {
                                            await lancarMedicao(farmId, t.id, { nivelCm: medicao[t.id] ? Number(medicao[t.id]) : null, recarregado: true });
                                            setMedicao((m) => ({ ...m, [t.id]: '' }));
                                            onAviso('Recarga de nitrogênio registrada.');
                                            await carregar();
                                        } catch (e: any) { onErro(e.message); }
                                    }}>
                                    Registrar recarga
                                </button>
                            </div>
                        </div>
                    );
                })}
                <div className="grid gap-2 sm:grid-cols-5">
                    <label>
                        <span className={labelClass}>Novo botijão</span>
                        <input className={inputClass} value={novoTanque.name} onChange={(e) => setNovoTanque({ ...novoTanque, name: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Canecas</span>
                        <input type="number" min={1} className={inputClass} value={novoTanque.canecas} onChange={(e) => setNovoTanque({ ...novoTanque, canecas: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Nível mínimo (cm)</span>
                        <input type="number" min={0} className={inputClass} value={novoTanque.nivelMinCm} onChange={(e) => setNovoTanque({ ...novoTanque, nivelMinCm: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Medir a cada (dias)</span>
                        <input type="number" min={1} className={inputClass} value={novoTanque.intervaloMedicaoDias} onChange={(e) => setNovoTanque({ ...novoTanque, intervaloMedicaoDias: e.target.value })} />
                    </label>
                    <button type="button" className={`${primaryButton} sm:self-end`} disabled={!novoTanque.name.trim()}
                        onClick={async () => {
                            try {
                                await salvarTanque(farmId, novoTanque);
                                setNovoTanque({ name: '', canecas: '', nivelMinCm: '', intervaloMedicaoDias: '' });
                                await carregar();
                            } catch (e: any) { onErro(e.message); }
                        }}>
                        Adicionar
                    </button>
                </div>
            </div>

            <div className={`${cardClass} space-y-3`}>
                <h3 className="font-bold">Doses no botijão</h3>
                <p className="text-xs text-[var(--eixo-text-muted)]">É o mesmo estoque do Eixo Acasalamento: o que você lança aqui aparece lá.</p>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead>
                            <tr className="text-left text-xs text-[var(--eixo-text-muted)]">
                                <th className="py-2">Touro</th>
                                <th>Partida</th>
                                <th>Doses</th>
                                <th>Botijão / caneca</th>
                                <th>Custo por dose</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {!dados.partidas.length && <tr><td colSpan={6} className="py-6 text-center text-[var(--eixo-text-muted)]">Nenhuma dose no estoque.</td></tr>}
                            {dados.partidas.map((p) => (
                                <tr key={p.id} className="border-t border-[var(--eixo-border)]">
                                    <td className="py-2 font-semibold">{p.touro}</td>
                                    <td>{p.lote}</td>
                                    <td className={p.dosesDisponiveis === 0 ? 'text-red-700' : ''}>{p.dosesDisponiveis} de {p.dosesTotal}</td>
                                    <td>
                                        <select className="rounded-lg border border-[var(--eixo-border)] px-2 py-1"
                                            value={p.tankId || ''} onChange={async (e) => { try { await atualizarPartida(farmId, p.id, { tankId: e.target.value || null }); await carregar(); } catch (err: any) { onErro(err.message); } }}>
                                            <option value="">Sem botijão</option>
                                            {dados.tanques.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                        <input className="ml-2 w-20 rounded-lg border border-[var(--eixo-border)] px-2 py-1" placeholder="caneca" defaultValue={p.caneca || ''}
                                            onBlur={async (e) => { if (e.target.value !== (p.caneca || '')) { try { await atualizarPartida(farmId, p.id, { caneca: e.target.value }); await carregar(); } catch (err: any) { onErro(err.message); } } }} />
                                    </td>
                                    <td>
                                        <input type="number" min={0} step={0.01} className="w-24 rounded-lg border border-[var(--eixo-border)] px-2 py-1" defaultValue={p.custoDose ?? ''}
                                            onBlur={async (e) => { if (Number(e.target.value || 0) !== (p.custoDose || 0)) { try { await atualizarPartida(farmId, p.id, { custoDose: e.target.value }); await carregar(); } catch (err: any) { onErro(err.message); } } }} />
                                    </td>
                                    <td className="text-xs">
                                        <button type="button" className="underline" onClick={() => { setMovimento({ id: p.id, tipo: 'OUT' }); setMovQtd(''); setMovMotivo(''); }}>Perda/descarte</button>
                                        {' · '}
                                        <button type="button" className="underline" onClick={() => { setMovimento({ id: p.id, tipo: 'ADJUST' }); setMovQtd(''); setMovMotivo(''); }}>Acertar contagem</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {movimento && (
                    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-[var(--eixo-surface-soft)] p-3">
                        <label>
                            <span className={labelClass}>{movimento.tipo === 'OUT' ? 'Doses perdidas' : 'Diferença (+ ou −)'}</span>
                            <input type="number" className={inputClass} value={movQtd} onChange={(e) => setMovQtd(e.target.value)} />
                        </label>
                        <label className="min-w-[220px] flex-1">
                            <span className={labelClass}>Motivo</span>
                            <input className={inputClass} value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} />
                        </label>
                        <button type="button" className={primaryButton} disabled={!movQtd || !movMotivo.trim()}
                            onClick={async () => {
                                try {
                                    await movimentarDoses(farmId, movimento.id, { tipo: movimento.tipo, quantidade: Number(movQtd), motivo: movMotivo });
                                    setMovimento(null);
                                    await carregar();
                                } catch (e: any) { onErro(e.message); }
                            }}>
                            Confirmar
                        </button>
                        <button type="button" className="text-xs underline" onClick={() => setMovimento(null)}>Cancelar</button>
                    </div>
                )}

                <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    <label className="sm:col-span-2">
                        <span className={labelClass}>Touro</span>
                        <input className={inputClass} value={entrada.touro} onChange={(e) => setEntrada({ ...entrada, touro: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Partida</span>
                        <input className={inputClass} value={entrada.lote} onChange={(e) => setEntrada({ ...entrada, lote: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Doses</span>
                        <input type="number" min={1} className={inputClass} value={entrada.doses} onChange={(e) => setEntrada({ ...entrada, doses: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Botijão</span>
                        <select className={inputClass} value={entrada.tankId} onChange={(e) => setEntrada({ ...entrada, tankId: e.target.value })}>
                            <option value="">Sem botijão</option>
                            {dados.tanques.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className={labelClass}>Caneca</span>
                        <input className={inputClass} value={entrada.caneca} onChange={(e) => setEntrada({ ...entrada, caneca: e.target.value })} />
                    </label>
                    <label>
                        <span className={labelClass}>Custo por dose</span>
                        <input type="number" min={0} step={0.01} className={inputClass} value={entrada.custoDose} onChange={(e) => setEntrada({ ...entrada, custoDose: e.target.value })} />
                    </label>
                </div>
                <button type="button" className={primaryButton} disabled={!entrada.lote.trim() || !entrada.doses}
                    onClick={async () => {
                        try {
                            await lancarEntradaSemen(farmId, entrada);
                            setEntrada({ lote: '', touro: '', fornecedor: '', doses: '', tankId: '', caneca: '', custoDose: '' });
                            onAviso('Entrada de sêmen registrada.');
                            await carregar();
                        } catch (e: any) { onErro(e.message); }
                    }}>
                    Lançar entrada de sêmen
                </button>
            </div>
        </div>
    );
};
