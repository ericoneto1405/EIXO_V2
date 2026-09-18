import React, { useCallback, useEffect, useState } from 'react';
import {
    Indicador,
    ItemPainel,
    VacaFarol,
    fetchFarol,
    fetchIndicadores,
    fetchPainel,
    manterVaca,
    salvarDecisao,
} from '../adapters/reproApi';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const COR_BORDA: Record<string, string> = {
    VERDE: 'border-l-4 border-l-emerald-500',
    AMARELO: 'border-l-4 border-l-amber-500',
    VERMELHO: 'border-l-4 border-l-red-500',
};
const COR_TEXTO: Record<string, string> = { VERDE: 'text-emerald-700', AMARELO: 'text-amber-700', VERMELHO: 'text-red-700' };

const fmt = (i: Indicador) => (i.valor == null ? null : `${i.valor.toLocaleString('pt-BR')}${i.unidade === '%' ? '%' : ` ${i.unidade}`}`);

export const PainelAba: React.FC<{
    farmId: string;
    modo: 'HOJE' | 'NUMEROS';
    performance: boolean;
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
    onIr: (aba: string) => void;
    onAbrirFicha: (id: string) => void;
}> = ({ farmId, modo, performance, onErro, onAviso, onIr, onAbrirFicha }) => {
    const [itens, setItens] = useState<ItemPainel[]>([]);
    const [indicadores, setIndicadores] = useState<Indicador[]>([]);
    const [info, setInfo] = useState<{ janela: string; minimo: number; totalVacas: number; lotes: { id: string; name: string }[]; categorias: string[] } | null>(null);
    const [lotId, setLotId] = useState('');
    const [categoria, setCategoria] = useState('');
    const [farol, setFarol] = useState<{ vacas: VacaFarol[]; descarte: VacaFarol[]; resumo: Record<string, number>; limitesDefinidos: boolean; motivosDescarte: string[] } | null>(null);
    const [acao, setAcao] = useState<{ id: string; tipo: 'DESCARTAR' | 'MANTER' } | null>(null);
    const [texto, setTexto] = useState('');

    const carregarFarol = useCallback(async () => {
        try {
            if (modo === 'HOJE') {
                setItens((await fetchPainel(farmId)).itens);
                return;
            }
            if (performance) setFarol(await fetchFarol(farmId));
        } catch (e: any) {
            onErro(e.message);
        }
    }, [farmId, modo, performance, onErro]);

    useEffect(() => {
        void carregarFarol();
    }, [carregarFarol]);

    useEffect(() => {
        if (modo !== 'NUMEROS' || !performance) return;
        fetchIndicadores(farmId, { lotId, categoria })
            .then((r) => {
                setIndicadores(r.indicadores);
                setInfo(r);
            })
            .catch((e) => onErro(e.message));
    }, [farmId, modo, performance, lotId, categoria, onErro]);

    const confirmar = async () => {
        if (!acao) return;
        try {
            if (acao.tipo === 'DESCARTAR') await salvarDecisao(farmId, { animalIds: [acao.id], decisao: 'DESCARTE', motivo: texto });
            else await manterVaca(farmId, acao.id, texto);
            onAviso(acao.tipo === 'DESCARTAR' ? 'Descarte registrado na ficha.' : 'Vaca mantida. Ela volta a aparecer depois do próximo toque se continuar no vermelho.');
            setAcao(null);
            setTexto('');
            await carregarFarol();
        } catch (e: any) {
            onErro(e.message);
        }
    };

    const atencao = farol ? farol.vacas.filter((v) => v.cor === 'AMARELO' || (v.cor === 'VERMELHO' && v.mantida)) : [];

    if (modo === 'NUMEROS' && !performance) {
        return (
            <div className={`${cardClass} text-sm`}>
                <p className="font-bold">Os números e o farol fazem parte do EIXO Performance.</p>
                <p className="mt-1 text-[var(--eixo-text-muted)]">No EIXO Gestão você anota tudo e vê o que fazer hoje. O Performance transforma essas anotações em números e no farol com o motivo.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {modo === 'HOJE' && (
            <div>
                <h2 className="mb-2 text-lg font-bold">O que fazer agora</h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {itens.map((i) => (
                        <button key={i.chave} type="button" onClick={() => onIr(i.aba)}
                            className={`${cardClass} text-left transition hover:bg-[var(--eixo-surface-soft)] ${i.total > 0 && i.chave === 'vermelhas' ? 'border-red-300' : ''}`}>
                            <p className={`text-3xl font-bold ${i.total > 0 && ['vermelhas', 'atrasados'].includes(i.chave) ? 'text-red-700' : ''}`}>{i.total}</p>
                            <p className="text-xs text-[var(--eixo-text-muted)]">{i.titulo}</p>
                        </button>
                    ))}
                </div>
                {!itens.length && <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Nada pendente por aqui hoje.</p>}
            </div>
            )}

            {modo === 'NUMEROS' && (
            <div className={`${cardClass} space-y-3`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold">Indicadores</h2>
                        {info && <p className="text-xs text-[var(--eixo-text-muted)]">{info.janela} · {info.totalVacas} vaca(s) · mínimo de {info.minimo} para mostrar número</p>}
                    </div>
                    <div className="flex gap-2">
                        <label>
                            <span className={labelClass}>Lote</span>
                            <select className={inputClass} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                                <option value="">Todos</option>
                                {info?.lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </label>
                        <label>
                            <span className={labelClass}>Categoria</span>
                            <select className={inputClass} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                                <option value="">Todas</option>
                                {info?.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </label>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {indicadores.map((i) => (
                        <div key={i.chave} className={`rounded-xl bg-[var(--eixo-surface-soft)] px-3 py-3 ${i.cor ? COR_BORDA[i.cor] : ''}`}>
                            <p className="text-xs text-[var(--eixo-text-muted)]">{i.nome}</p>
                            {i.insuficiente ? (
                                <p className="text-sm font-semibold text-[var(--eixo-text-muted)]">Dados insuficientes</p>
                            ) : (
                                <p className={`text-xl font-bold ${i.cor ? COR_TEXTO[i.cor] : ''}`}>{fmt(i)}</p>
                            )}
                            <p className="text-[11px] text-[var(--eixo-text-muted)]">
                                base: {i.base}{i.meta != null ? ` · meta ${i.menorMelhor ? 'até ' : ''}${i.meta.toLocaleString('pt-BR')}${i.unidade === '%' ? '%' : ` ${i.unidade}`}` : ''}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
            )}

            {modo === 'NUMEROS' && farol && (
                <div className={`${cardClass} space-y-3`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-lg font-bold">Farol das vacas</h2>
                        <p className="text-sm">
                            <span className="text-emerald-700">{farol.resumo.VERDE} verdes</span> · <span className="text-amber-700">{farol.resumo.AMARELO} amarelas</span> · <span className="text-red-700">{farol.resumo.VERMELHO} vermelhas</span>
                        </p>
                    </div>
                    {!farol.limitesDefinidos && (
                        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Defina em Critérios os limites do farol (vazias seguidas, intervalo entre partos máximo e peso mínimo à desmama). Sem eles, só as regras fixas entram.{' '}
                            <button type="button" className="font-bold underline" onClick={() => onIr('CRITERIOS')}>Definir limites</button>
                        </p>
                    )}

                    <h3 className="font-semibold">Sugestão de descarte ({farol.descarte.length})</h3>
                    {!farol.descarte.length && <p className="text-sm text-[var(--eixo-text-muted)]">Nenhuma vaca no vermelho.</p>}
                    <ul className="space-y-2">
                        {farol.descarte.map((v) => (
                            <li key={v.id} className={`rounded-xl bg-[var(--eixo-surface-soft)] p-3 text-sm ${COR_BORDA.VERMELHO}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                        <button type="button" className="font-bold underline" onClick={() => onAbrirFicha(v.id)}>{v.brinco}</button>
                                        {' '}· {v.categoria}{v.lote ? ` · ${v.lote}` : ''} — {v.motivos.join(' · ')}
                                    </span>
                                    <span className="flex gap-2">
                                        <button type="button" className={secondaryButton} onClick={() => { setAcao({ id: v.id, tipo: 'DESCARTAR' }); setTexto(''); }}>Descartar</button>
                                        <button type="button" className={secondaryButton} onClick={() => { setAcao({ id: v.id, tipo: 'MANTER' }); setTexto(''); }}>Manter</button>
                                    </span>
                                </div>
                                {acao?.id === v.id && (
                                    <div className="mt-2 flex flex-wrap items-end gap-2">
                                        {acao.tipo === 'DESCARTAR' ? (
                                            <label>
                                                <span className={labelClass}>Motivo</span>
                                                <select className={inputClass} value={texto} onChange={(e) => setTexto(e.target.value)}>
                                                    <option value="">Escolha</option>
                                                    {farol.motivosDescarte.map((m) => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </label>
                                        ) : (
                                            <label className="min-w-[240px] flex-1">
                                                <span className={labelClass}>Por que ela fica?</span>
                                                <input className={inputClass} value={texto} onChange={(e) => setTexto(e.target.value)} />
                                            </label>
                                        )}
                                        <button type="button" className="rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                                            disabled={acao.tipo === 'DESCARTAR' ? !texto : texto.trim().length < 3} onClick={confirmar}>Confirmar</button>
                                        <button type="button" className="text-xs underline" onClick={() => setAcao(null)}>Cancelar</button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>

                    {atencao.length > 0 && (
                        <>
                            <h3 className="font-semibold">Atenção</h3>
                            <ul className="divide-y divide-[var(--eixo-border)] text-sm">
                                {atencao.map((v) => (
                                    <li key={v.id} className="py-2">
                                        <button type="button" className="font-semibold underline" onClick={() => onAbrirFicha(v.id)}>{v.brinco}</button>
                                        <span className={v.cor ? COR_TEXTO[v.cor] : ''}> · {v.motivos.join(' · ')}{v.mantida ? ' · mantida pelo produtor' : ''}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
