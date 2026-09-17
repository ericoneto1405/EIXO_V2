import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Candidata,
    ConfigResposta,
    EventoRepro,
    Ficha,
    ReproConfig,
    Situacao,
    TipoEvento,
    VacaResumo,
    apagarEvento,
    apagarParto,
    desfazerDesmama,
    editarEvento,
    fetchFicha,
    fetchReproConfig,
    informarBrucelose,
    lancarEvento,
    liberarFemeas,
    listarCandidatas,
    listarVacas,
    salvarReproConfig,
} from '../adapters/reproApi';
import { DecidirVazias, ToqueCurral } from './ReproToque';
import { DesmamaAba, PartosAba } from './ReproParto';

interface ReproModuleProps {
    farmId?: string | null;
    farmName?: string | null;
}

type Aba = 'CANDIDATAS' | 'TOQUE' | 'DECIDIR' | 'PARTOS' | 'DESMAMA' | 'FICHA' | 'CRITERIOS';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)] disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const idadeMeses = (v?: string | null) => {
    if (!v) return null;
    return Math.floor((Date.now() - new Date(v).getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
};

const SITUACAO_LABEL: Record<string, string> = {
    LIBERADA: 'Liberada (nunca pariu)',
    VAZIA: 'Vazia',
    COBERTA: 'Coberta',
    PRENHE: 'Prenhe',
    PARIDA: 'Parida',
    DESCARTE: 'Em descarte',
};

const TIPO_LABEL: Record<TipoEvento, string> = {
    LIBERACAO: 'Liberação para reprodução',
    COBERTURA: 'Cobertura',
    IATF: 'IATF',
    DIAGNOSTICO_PRENHEZ: 'Diagnóstico',
    PERDA: 'Perda / aborto',
    PARTO: 'Parto',
    DESMAME: 'Desmama',
    ECC: 'ECC',
    OBSERVACAO: 'Observação',
    DESCARTE: 'Descarte',
};

const COR_CLASS: Record<string, string> = {
    VERDE: 'bg-emerald-100 text-emerald-800',
    AMARELO: 'bg-amber-100 text-amber-800',
    VERMELHO: 'bg-red-100 text-red-800',
};

const situacaoTexto = (s: Situacao) => (s ? SITUACAO_LABEL[s] || s : '—');

function resumoEvento(e: EventoRepro) {
    const p = e.payload || {};
    switch (e.type) {
        case 'LIBERACAO':
            return [p.peso ? `${p.peso} kg` : null, p.ecc ? `ECC ${p.ecc}` : null, p.historicoDesconhecido ? `histórico desconhecido (${p.partosAnteriores || 0} partos antes)` : null].filter(Boolean).join(' · ');
        case 'COBERTURA':
            return [p.tipo === 'IATF' ? 'IATF' : 'Monta natural', p.touro, p.inseminador].filter(Boolean).join(' · ');
        case 'DIAGNOSTICO_PRENHEZ':
            return [p.resultado === 'PRENHE' ? 'Prenhe' : 'Vazia', p.diasGestacao ? `${p.diasGestacao} dias` : null, p.faixa ? `gestação ${String(p.faixa).toLowerCase()}` : null, p.metodo === 'ULTRASSOM' ? 'ultrassom' : p.metodo === 'TOQUE' ? 'toque' : null, p.veterinario].filter(Boolean).join(' · ');
        case 'PARTO':
            return [p.tipoParto ? `parto ${String(p.tipoParto).toLowerCase()}` : null,
                ...(Array.isArray(p.crias) ? p.crias.map((c: any) => `${c.sexo === 'FEMEA' ? 'fêmea' : 'macho'}${c.vivo === false ? ' (morto)' : ''}${c.brinco ? ` ${c.brinco}` : ''}${c.peso ? ` ${c.peso} kg` : ''}`) : [])]
                .filter(Boolean).join(' · ');
        case 'DESMAME':
            return [p.bezerro ? `bezerro ${p.bezerro}` : null, p.peso ? `${p.peso} kg` : null, p.pesoAjustado205 ? `205 dias: ${p.pesoAjustado205} kg` : null, p.precoce ? 'precoce' : null].filter(Boolean).join(' · ');
        case 'ECC':
            return `Nota ${p.ecc}`;
        case 'PERDA':
            return p.automatica ? 'Automática: prenhe antes e vazia no toque' : '';
        case 'OBSERVACAO':
            return p.decisao === 'NOVA_COBERTURA' ? 'Decisão: nova cobertura' : p.decisao === 'REPASSE' ? 'Decisão: repasse com touro' : '';
        case 'DESCARTE':
            return p.motivo || '';
        default:
            return '';
    }
}

const ReproModule: React.FC<ReproModuleProps> = ({ farmId, farmName }) => {
    const [aba, setAba] = useState<Aba>('CANDIDATAS');
    const [meta, setMeta] = useState<ConfigResposta | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [fichaId, setFichaId] = useState<string | null>(null);

    const carregarMeta = useCallback(async () => {
        if (!farmId) return;
        try {
            setMeta(await fetchReproConfig(farmId));
        } catch (e: any) {
            setErro(e.message);
        }
    }, [farmId]);

    useEffect(() => {
        void carregarMeta();
    }, [carregarMeta]);

    if (!farmId) return null;

    return (
        <div className="space-y-5 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-bold text-[var(--eixo-text)]">Reprodução</h1>
                <p className="text-sm text-[var(--eixo-text-muted)]">{farmName || 'Fazenda'} · o sistema sugere, o produtor decide.</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {([
                    ['CANDIDATAS', 'Candidatas'],
                    ['TOQUE', 'Toque / ultrassom'],
                    ['DECIDIR', 'Vazias para decidir'],
                    ['PARTOS', 'Partos'],
                    ['DESMAMA', 'Desmama'],
                    ['FICHA', 'Ficha da vaca'],
                    ['CRITERIOS', 'Critérios'],
                ] as [Aba, string][]).map(([valor, label]) => (
                    <button key={valor} type="button" onClick={() => setAba(valor)} className={aba === valor ? primaryButton : secondaryButton}>
                        {label}
                    </button>
                ))}
            </div>

            {erro && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
            {aviso && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{aviso}</div>}

            {aba === 'CANDIDATAS' && <Candidatas farmId={farmId} onErro={setErro} onAviso={setAviso} irParaCriterios={() => setAba('CRITERIOS')} />}
            {aba === 'TOQUE' && <ToqueCurral farmId={farmId} onErro={setErro} onAviso={setAviso} />}
            {aba === 'DECIDIR' && <DecidirVazias farmId={farmId} onErro={setErro} onAviso={setAviso} onAbrirFicha={(id) => { setFichaId(id); setAba('FICHA'); }} />}
            {aba === 'PARTOS' && <PartosAba farmId={farmId} onErro={setErro} onAviso={setAviso} onAbrirFicha={(id) => { setFichaId(id); setAba('FICHA'); }} />}
            {aba === 'DESMAMA' && <DesmamaAba farmId={farmId} onErro={setErro} onAviso={setAviso} irParaCriterios={() => setAba('CRITERIOS')} />}
            {aba === 'FICHA' && meta && <FichaVaca farmId={farmId} meta={meta} vacaId={fichaId} onSelecionar={setFichaId} onErro={setErro} onAviso={setAviso} />}
            {aba === 'CRITERIOS' && meta && <Criterios farmId={farmId} meta={meta} onSalvo={carregarMeta} onErro={setErro} />}
            <p className="text-xs text-[var(--eixo-text-muted)]">
                O EIXO ajuda a organizar o manejo. Diagnóstico, exame de touro e receita de hormônio são do veterinário responsável da fazenda.
            </p>
        </div>
    );
};

// ---------- Parte 0: fêmeas candidatas ----------

const Candidatas: React.FC<{
    farmId: string;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    irParaCriterios: () => void;
}> = ({ farmId, onErro, onAviso, irParaCriterios }) => {
    const [lista, setLista] = useState<Candidata[]>([]);
    const [performance, setPerformance] = useState(false);
    const [criterios, setCriterios] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [busca, setBusca] = useState('');
    const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
    const [data, setData] = useState(hoje());
    const [desconhecido, setDesconhecido] = useState(false);
    const [partosAnteriores, setPartosAnteriores] = useState('0');
    const [situacaoAtual, setSituacaoAtual] = useState('VAZIA');
    const [bruceloseDe, setBruceloseDe] = useState<Candidata | null>(null);
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await listarCandidatas(farmId);
            setLista(r.candidatas);
            setPerformance(r.performance);
            setCriterios(r.criteriosDefinidos);
            onErro(null);
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setCarregando(false);
        }
    }, [farmId, onErro]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const filtradas = useMemo(() => {
        const b = busca.trim().toLowerCase();
        return b ? lista.filter((c) => c.brinco.toLowerCase().includes(b) || (c.lote || '').toLowerCase().includes(b)) : lista;
    }, [lista, busca]);

    const liberaveis = filtradas.filter((c) => c.bloqueios.length === 0);

    const alternar = (id: string) => {
        setSelecionadas((atual) => {
            const novo = new Set(atual);
            if (novo.has(id)) novo.delete(id);
            else novo.add(id);
            return novo;
        });
    };

    const liberar = async () => {
        setSalvando(true);
        try {
            const r = await liberarFemeas(farmId, {
                animalIds: [...selecionadas],
                data,
                historicoDesconhecido: desconhecido,
                partosAnteriores: desconhecido ? Number(partosAnteriores) || 0 : 0,
                situacaoAtual: desconhecido ? situacaoAtual : undefined,
            });
            const partes = [`${r.liberadas.length} fêmea(s) liberada(s).`];
            if (r.bloqueadas.length) partes.push(`Não liberadas: ${r.bloqueadas.map((b) => `${b.brinco} (${b.motivos.join(', ')})`).join('; ')}.`);
            onAviso(partes.join(' '));
            setSelecionadas(new Set());
            setDesconhecido(false);
            await carregar();
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="space-y-4">
            {performance && !criterios && (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Defina seus critérios (idade, peso e ECC mínimos) para ver o farol das candidatas.{' '}
                    <button type="button" className="font-bold underline" onClick={irParaCriterios}>Definir critérios</button>
                </div>
            )}
            {!performance && (
                <div className="rounded-xl bg-[var(--eixo-surface-soft)] px-4 py-3 text-xs text-[var(--eixo-text-muted)]">
                    O farol (apta, falta X kg) faz parte do EIXO Performance.
                </div>
            )}

            <div className={cardClass}>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="min-w-[200px] flex-1">
                        <span className={labelClass}>Buscar identificação ou lote</span>
                        <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} />
                    </label>
                    <button type="button" className={secondaryButton} disabled={!liberaveis.length}
                        onClick={() => setSelecionadas(new Set(liberaveis.map((c) => c.id)))}>
                        Selecionar liberáveis ({liberaveis.length})
                    </button>
                </div>

                <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="text-left text-xs text-[var(--eixo-text-muted)]">
                                <th className="py-2" />
                                <th>Identificação</th>
                                <th>Idade</th>
                                <th>Último peso</th>
                                <th>ECC</th>
                                <th>Brucelose</th>
                                {performance && <th>Farol</th>}
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <tr><td colSpan={8} className="py-6 text-center text-[var(--eixo-text-muted)]">Carregando…</td></tr>}
                            {!carregando && !filtradas.length && <tr><td colSpan={8} className="py-6 text-center text-[var(--eixo-text-muted)]">Nenhuma fêmea aguardando liberação.</td></tr>}
                            {filtradas.map((c) => {
                                const meses = idadeMeses(c.dataNascimento);
                                const bloqueada = c.bloqueios.length > 0;
                                return (
                                    <tr key={c.id} className="border-t border-[var(--eixo-border)]">
                                        <td className="py-2 pr-2">
                                            <input type="checkbox" disabled={bloqueada} checked={selecionadas.has(c.id)} onChange={() => alternar(c.id)}
                                                aria-label={`Selecionar ${c.brinco}`} />
                                        </td>
                                        <td className="font-semibold">
                                            {c.brinco}
                                            {c.lote && <span className="block text-xs font-normal text-[var(--eixo-text-muted)]">{c.lote}</span>}
                                        </td>
                                        <td>{meses === null ? '—' : `${meses} meses${c.dataNascimentoEstimada ? ' (estimada)' : ''}`}</td>
                                        <td>
                                            {c.peso != null ? `${c.peso} kg` : '—'}
                                            {c.pesadoEm && <span className="block text-xs text-[var(--eixo-text-muted)]">{fmtData(c.pesadoEm)}</span>}
                                        </td>
                                        <td>{c.ecc ?? '—'}</td>
                                        <td>
                                            {c.brucelose ? <span className="text-emerald-700">Registrada</span> : (
                                                <span className="text-red-700">
                                                    Sem registro{' '}
                                                    <button type="button" className="block text-xs font-bold underline" onClick={() => setBruceloseDe(c)}>
                                                        Informar vacina anterior
                                                    </button>
                                                </span>
                                            )}
                                        </td>
                                        {performance && (
                                            <td>
                                                {c.farol?.cor ? (
                                                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${COR_CLASS[c.farol.cor]}`}>{c.farol.motivos.join(' · ')}</span>
                                                ) : <span className="text-xs text-[var(--eixo-text-muted)]">{c.farol?.motivos?.[0] || '—'}</span>}
                                            </td>
                                        )}
                                        <td className="text-xs text-red-700">{c.bloqueios.filter((m) => m !== 'Sem registro de brucelose').join(', ')}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {selecionadas.size > 0 && (
                <div className={`${cardClass} space-y-3`}>
                    <p className="font-semibold">{selecionadas.size} fêmea(s) selecionada(s)</p>
                    <div className="flex flex-wrap gap-3">
                        <label>
                            <span className={labelClass}>Data da liberação</span>
                            <input type="date" className={inputClass} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
                        </label>
                        <label className="flex items-center gap-2 self-end pb-3 text-sm">
                            <input type="checkbox" checked={desconhecido} onChange={(e) => setDesconhecido(e.target.checked)} />
                            Comprada / histórico desconhecido
                        </label>
                        {desconhecido && (
                            <>
                                <label>
                                    <span className={labelClass}>Partos anteriores</span>
                                    <input type="number" min={0} className={inputClass} value={partosAnteriores} onChange={(e) => setPartosAnteriores(e.target.value)} />
                                </label>
                                <label>
                                    <span className={labelClass}>Situação atual</span>
                                    <select className={inputClass} value={situacaoAtual} onChange={(e) => setSituacaoAtual(e.target.value)}>
                                        <option value="VAZIA">Vazia</option>
                                        <option value="PRENHE">Prenhe</option>
                                        <option value="PARIDA">Parida</option>
                                    </select>
                                </label>
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className={primaryButton} disabled={salvando} onClick={liberar}>
                            {salvando ? 'Liberando…' : 'Liberar para reprodução'}
                        </button>
                        <button type="button" className={secondaryButton} onClick={() => setSelecionadas(new Set())}>Limpar</button>
                    </div>
                </div>
            )}

            {bruceloseDe && (
                <BruceloseAnterior farmId={farmId} candidata={bruceloseDe} onFechar={() => setBruceloseDe(null)}
                    onSalvo={async () => { setBruceloseDe(null); await carregar(); }} onErro={onErro} />
            )}
        </div>
    );
};

const BruceloseAnterior: React.FC<{
    farmId: string;
    candidata: Candidata;
    onFechar: () => void;
    onSalvo: () => void;
    onErro: (m: string | null) => void;
}> = ({ farmId, candidata, onFechar, onSalvo, onErro }) => {
    const [data, setData] = useState('');
    const [vacina, setVacina] = useState<'B19' | 'RB51'>('B19');
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => {
        setSalvando(true);
        try {
            await informarBrucelose(farmId, candidata.id, { data, vacina });
            onErro(null);
            onSalvo();
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <div className={`${cardClass} w-full max-w-sm space-y-3`}>
                <h2 className="text-lg font-bold">Vacina de brucelose anterior — {candidata.brinco}</h2>
                <p className="text-xs text-[var(--eixo-text-muted)]">Use só para vacina aplicada antes da fazenda usar o EIXO. As novas são registradas na Sanidade.</p>
                <label className="block">
                    <span className={labelClass}>Data da vacina</span>
                    <input type="date" className={inputClass} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
                </label>
                <label className="block">
                    <span className={labelClass}>Vacina</span>
                    <select className={inputClass} value={vacina} onChange={(e) => setVacina(e.target.value as 'B19' | 'RB51')}>
                        <option value="B19">B19</option>
                        <option value="RB51">RB51</option>
                    </select>
                </label>
                <div className="flex justify-end gap-2">
                    <button type="button" className={secondaryButton} onClick={onFechar}>Cancelar</button>
                    <button type="button" className={primaryButton} disabled={!data || salvando} onClick={salvar}>Salvar</button>
                </div>
            </div>
        </div>
    );
};

// ---------- Parte 1: ficha da vaca ----------

const FichaVaca: React.FC<{
    farmId: string;
    meta: ConfigResposta;
    vacaId: string | null;
    onSelecionar: (id: string | null) => void;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, meta, vacaId, onSelecionar, onErro, onAviso }) => {
    const [busca, setBusca] = useState('');
    const [vacas, setVacas] = useState<VacaResumo[]>([]);
    const [ficha, setFicha] = useState<Ficha | null>(null);
    const [editando, setEditando] = useState<EventoRepro | null>(null);
    const [novo, setNovo] = useState(false);
    const [apagarId, setApagarId] = useState<string | null>(null);

    useEffect(() => {
        const t = setTimeout(() => {
            listarVacas(farmId, busca).then((r) => setVacas(r.vacas)).catch((e) => onErro(e.message));
        }, 250);
        return () => clearTimeout(t);
    }, [farmId, busca, onErro]);

    const carregarFicha = useCallback(async () => {
        if (!vacaId) { setFicha(null); return; }
        try {
            setFicha(await fetchFicha(farmId, vacaId));
            onErro(null);
        } catch (e: any) {
            onErro(e.message);
        }
    }, [farmId, vacaId, onErro]);

    useEffect(() => {
        void carregarFicha();
    }, [carregarFicha]);

    const apagar = async (id: string) => {
        try {
            const tipo = ficha?.eventos.find((e) => e.id === id)?.type;
            if (tipo === 'PARTO') await apagarParto(farmId, id);
            else if (tipo === 'DESMAME') onAviso((await desfazerDesmama(farmId, id)).aviso);
            else await apagarEvento(farmId, id);
            setApagarId(null);
            await carregarFicha();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    return (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className={`${cardClass} space-y-3`}>
                <label className="block">
                    <span className={labelClass}>Buscar vaca</span>
                    <input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Identificação" />
                </label>
                <ul className="max-h-[420px] space-y-1 overflow-y-auto">
                    {!vacas.length && <li className="text-sm text-[var(--eixo-text-muted)]">Nenhuma vaca liberada ainda.</li>}
                    {vacas.map((v) => (
                        <li key={v.id}>
                            <button type="button" onClick={() => onSelecionar(v.id)}
                                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${v.id === vacaId ? 'bg-[var(--eixo-surface-soft)] font-bold' : 'hover:bg-[var(--eixo-surface-soft)]'}`}>
                                {v.brinco}
                                <span className="block text-xs text-[var(--eixo-text-muted)]">{situacaoTexto(v.situacao)}{v.status !== 'VIVO' ? ' · fora do rebanho' : ''}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {!ficha ? (
                <div className={`${cardClass} text-sm text-[var(--eixo-text-muted)]`}>Escolha uma vaca para ver a ficha.</div>
            ) : (
                <div className="space-y-4">
                    <div className={cardClass}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-bold">{ficha.vaca.brinco}</h2>
                                <p className="text-sm text-[var(--eixo-text-muted)]">
                                    {ficha.vaca.categoria} · {ficha.vaca.raca || 'raça não informada'} · {idadeMeses(ficha.vaca.dataNascimento) ?? '—'} meses
                                    {ficha.vaca.lote ? ` · ${ficha.vaca.lote}` : ''}
                                </p>
                                {ficha.vaca.historicoDesconhecido && <p className="text-xs text-amber-700">Histórico desconhecido — fora do intervalo entre partos e da idade ao 1º parto.</p>}
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-bold">{situacaoTexto(ficha.vaca.situacao)}</p>
                                {ficha.vaca.previsaoParto && <p className="text-sm">Previsão de parto: {fmtData(ficha.vaca.previsaoParto)}</p>}
                            </div>
                        </div>
                        {ficha.numeros ? (
                            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                                <Numero label="Partos" valor={ficha.numeros.partos} />
                                <Numero label="Idade ao 1º parto" valor={ficha.numeros.idadePrimeiroParto != null ? `${ficha.numeros.idadePrimeiroParto} meses` : 'Dados insuficientes'} />
                                <Numero label="Intervalo entre partos" valor={ficha.numeros.iepMeses != null ? `${ficha.numeros.iepMeses} meses` : 'Dados insuficientes'} />
                                <Numero label="Desmama (205 dias)" valor={ficha.numeros.pesoMedioDesmama != null ? `${ficha.numeros.pesoMedioDesmama} kg` : 'Dados insuficientes'} />
                                <Numero label="Vazias seguidas" valor={ficha.numeros.vaziasSeguidas} />
                            </div>
                        ) : (
                            <p className="mt-3 text-xs text-[var(--eixo-text-muted)]">Números da vaca (partos, intervalo entre partos, desmama) no EIXO Performance.</p>
                        )}
                    </div>

                    <div className={cardClass}>
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="font-bold">Linha do tempo</h3>
                            {ficha.vaca.situacao !== 'DESCARTE' && (
                                <button type="button" className={primaryButton} onClick={() => setNovo(true)}>Lançar evento</button>
                            )}
                        </div>
                        <ol className="space-y-2">
                            {ficha.eventos.map((e) => {
                                const manual = meta.tiposManuais.includes(e.type);
                                return (
                                    <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[var(--eixo-border)] px-3 py-2">
                                        <div>
                                            <p className="text-sm font-semibold">{fmtData(e.date)} · {TIPO_LABEL[e.type] || e.type}</p>
                                            <p className="text-xs text-[var(--eixo-text-muted)]">{[resumoEvento(e), e.notes].filter(Boolean).join(' — ')}</p>
                                        </div>
                                        <div className="flex gap-2 text-xs">
                                            {manual && <button type="button" className="underline" onClick={() => setEditando(e)}>Editar</button>}
                                            {(manual || e.type === 'PARTO' || e.type === 'DESMAME' || (e.type === 'LIBERACAO' && ficha.eventos.length === 1)) && (
                                                apagarId === e.id ? (
                                                    <>
                                                        <button type="button" className="font-bold text-red-700 underline" onClick={() => apagar(e.id)}>Confirmar</button>
                                                        <button type="button" className="underline" onClick={() => setApagarId(null)}>Não</button>
                                                    </>
                                                ) : <button type="button" className="text-red-700 underline" onClick={() => setApagarId(e.id)}>Apagar</button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {(novo || editando) && (
                        <FormEvento
                            farmId={farmId}
                            vacaId={ficha.vaca.id}
                            meta={meta}
                            evento={editando}
                            onFechar={() => { setNovo(false); setEditando(null); }}
                            onSalvo={async (avisos) => {
                                setNovo(false);
                                setEditando(null);
                                onAviso(avisos.length ? avisos.join(' ') : null);
                                await carregarFicha();
                            }}
                            onErro={onErro}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

const Numero: React.FC<{ label: string; valor: React.ReactNode }> = ({ label, valor }) => (
    <div className="rounded-xl bg-[var(--eixo-surface-soft)] px-3 py-2">
        <p className="text-xs text-[var(--eixo-text-muted)]">{label}</p>
        <p className="text-sm font-bold">{valor}</p>
    </div>
);

const FormEvento: React.FC<{
    farmId: string;
    vacaId: string;
    meta: ConfigResposta;
    evento: EventoRepro | null;
    onFechar: () => void;
    onSalvo: (avisos: string[]) => void;
    onErro: (m: string | null) => void;
}> = ({ farmId, vacaId, meta, evento, onFechar, onSalvo, onErro }) => {
    const [tipo, setTipo] = useState<TipoEvento>(evento?.type || 'ECC');
    const [data, setData] = useState(evento ? evento.date.slice(0, 10) : hoje());
    const [payload, setPayload] = useState<Record<string, any>>(evento?.payload || {});
    const [notes, setNotes] = useState(evento?.notes || '');
    const [salvando, setSalvando] = useState(false);
    const set = (campo: string, valor: any) => setPayload((p) => ({ ...p, [campo]: valor }));

    const salvar = async () => {
        setSalvando(true);
        try {
            const corpo = { date: data, payload, notes };
            const r = evento ? await editarEvento(farmId, evento.id, corpo) : await lancarEvento(farmId, vacaId, { type: tipo, ...corpo });
            onErro(null);
            onSalvo(r.avisos || []);
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`${cardClass} space-y-3`}>
            <h3 className="font-bold">{evento ? 'Editar evento' : 'Lançar evento'}</h3>
            <div className="flex flex-wrap gap-3">
                <label>
                    <span className={labelClass}>Tipo</span>
                    <select className={inputClass} value={tipo} disabled={Boolean(evento)} onChange={(e) => { setTipo(e.target.value as TipoEvento); setPayload({}); }}>
                        {meta.tiposManuais.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                    </select>
                </label>
                <label>
                    <span className={labelClass}>Data</span>
                    <input type="date" className={inputClass} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
                </label>

                {tipo === 'COBERTURA' && (
                    <>
                        <label>
                            <span className={labelClass}>Como</span>
                            <select className={inputClass} value={payload.tipo || ''} onChange={(e) => set('tipo', e.target.value)}>
                                <option value="">Escolha</option>
                                <option value="MONTA_NATURAL">Monta natural</option>
                                <option value="IATF">IATF</option>
                            </select>
                        </label>
                        <label>
                            <span className={labelClass}>Touro ou sêmen</span>
                            <input className={inputClass} value={payload.touro || ''} onChange={(e) => set('touro', e.target.value)} />
                        </label>
                        {payload.tipo === 'IATF' && (
                            <label>
                                <span className={labelClass}>Inseminador</span>
                                <input className={inputClass} value={payload.inseminador || ''} onChange={(e) => set('inseminador', e.target.value)} />
                            </label>
                        )}
                    </>
                )}

                {tipo === 'DIAGNOSTICO_PRENHEZ' && (
                    <>
                        <label>
                            <span className={labelClass}>Resultado</span>
                            <select className={inputClass} value={payload.resultado || ''} onChange={(e) => set('resultado', e.target.value)}>
                                <option value="">Escolha</option>
                                <option value="PRENHE">Prenhe</option>
                                <option value="VAZIA">Vazia</option>
                            </select>
                        </label>
                        {payload.resultado === 'PRENHE' && (
                            <label>
                                <span className={labelClass}>Dias de gestação</span>
                                <input type="number" min={1} max={300} className={inputClass} value={payload.diasGestacao || ''} onChange={(e) => set('diasGestacao', e.target.value ? Number(e.target.value) : null)} />
                            </label>
                        )}
                        <label>
                            <span className={labelClass}>Método</span>
                            <select className={inputClass} value={payload.metodo || ''} onChange={(e) => set('metodo', e.target.value)}>
                                <option value="">—</option>
                                <option value="TOQUE">Toque</option>
                                <option value="ULTRASSOM">Ultrassom</option>
                            </select>
                        </label>
                        <label>
                            <span className={labelClass}>Veterinário</span>
                            <input className={inputClass} value={payload.veterinario || ''} onChange={(e) => set('veterinario', e.target.value)} />
                        </label>
                    </>
                )}

                {tipo === 'ECC' && (
                    <label>
                        <span className={labelClass}>ECC (1 a 5)</span>
                        <input type="number" min={1} max={5} step={0.25} className={inputClass} value={payload.ecc ?? ''} onChange={(e) => set('ecc', e.target.value ? Number(e.target.value) : null)} />
                    </label>
                )}

                {tipo === 'DESCARTE' && (
                    <label>
                        <span className={labelClass}>Motivo</span>
                        <select className={inputClass} value={payload.motivo || ''} onChange={(e) => set('motivo', e.target.value)}>
                            <option value="">Escolha</option>
                            {meta.motivosDescarte.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </label>
                )}
            </div>
            <label className="block">
                <span className={labelClass}>Observação</span>
                <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {tipo === 'DESCARTE' && <p className="text-xs text-amber-700">O descarte encerra a ficha: a vaca sai das listas da reprodução. A venda continua no Rebanho.</p>}
            <div className="flex justify-end gap-2">
                <button type="button" className={secondaryButton} onClick={onFechar}>Cancelar</button>
                <button type="button" className={primaryButton} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
        </div>
    );
};

// ---------- Critérios do produtor ----------

const CAMPOS: { campo: keyof ReproConfig; label: string; ref: string; step?: number }[] = [
    { campo: 'idadeMinMeses', label: 'Idade mínima para liberar (meses)', ref: 'Referência: 13–15 meses em programa precoce; 18–24 no tradicional.' },
    { campo: 'pesoMinKg', label: 'Peso mínimo para liberar (kg)', ref: 'Referência Embrapa: 60–65% do peso da vaca adulta.' },
    { campo: 'eccMin', label: 'ECC mínimo (1 a 5)', ref: 'Referência: 3 ou mais.', step: 0.25 },
    { campo: 'gestacaoDias', label: 'Tempo de gestação (dias)', ref: 'Referência: zebuíno ~293 dias; taurino ~283.' },
    { campo: 'desmamaIdadeMeses', label: 'Idade de desmama (meses)', ref: 'Referência: 6–8 meses.' },
    { campo: 'desmamaPesoKg', label: 'Peso de desmama (kg)', ref: 'Referência: ~180–220 kg em Nelore aos 7 meses.' },
    { campo: 'pesoNascerKg', label: 'Peso ao nascer padrão (kg)', ref: 'Usado quando o bezerro não foi pesado. Referência: ~30 kg em Nelore.' },
];

const Criterios: React.FC<{
    farmId: string;
    meta: ConfigResposta;
    onSalvo: () => void;
    onErro: (m: string | null) => void;
}> = ({ farmId, meta, onSalvo, onErro }) => {
    const inicial = useMemo(() => {
        const v: Record<string, string> = {};
        for (const c of CAMPOS) {
            const atual = meta.config?.[c.campo];
            v[c.campo] = atual == null ? '' : String(atual);
        }
        return v;
    }, [meta.config]);
    const [valores, setValores] = useState(inicial);
    const [salvando, setSalvando] = useState(false);
    const [ok, setOk] = useState(false);

    useEffect(() => setValores(inicial), [inicial]);

    const salvar = async () => {
        setSalvando(true);
        setOk(false);
        try {
            const corpo: Record<string, number | null> = {};
            for (const c of CAMPOS) corpo[c.campo] = valores[c.campo] === '' ? null : Number(valores[c.campo]);
            await salvarReproConfig(farmId, corpo);
            onErro(null);
            setOk(true);
            onSalvo();
        } catch (e: any) {
            onErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={`${cardClass} space-y-4`}>
            <p className="text-sm text-[var(--eixo-text-muted)]">
                Os critérios são decisão sua. O EIXO não preenche nada; as referências servem só de apoio.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
                {CAMPOS.map((c) => (
                    <label key={c.campo} className="block">
                        <span className={labelClass}>{c.label}</span>
                        <input type="number" min={0} step={c.step || 1} className={inputClass} value={valores[c.campo]}
                            onChange={(e) => setValores((v) => ({ ...v, [c.campo]: e.target.value }))} />
                        <span className="mt-1 block text-xs text-[var(--eixo-text-muted)]">{c.ref}</span>
                    </label>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button type="button" className={primaryButton} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar critérios'}</button>
                {ok && <span className="text-sm text-emerald-700">Critérios salvos.</span>}
            </div>
        </div>
    );
};

export default ReproModule;
