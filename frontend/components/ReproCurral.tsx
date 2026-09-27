import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOfflineQueue, type OfflineQueueItem } from '../hooks/useOfflineQueue';
import OfflineRejectedItems from './OfflineRejectedItems';
import {
    AcaoVaca,
    LancamentoCurral,
    VacaCurralUnico,
    baixarCurral,
    enviarLancamento,
} from '../adapters/reproApi';

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';
const botaoGrande = 'w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-4 text-left text-lg font-bold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)]';

const hoje = () => new Date().toISOString().slice(0, 10);
const norm = (v: string) => v.trim().toUpperCase();

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

type Passo = { acao: AcaoVaca; vaca: VacaCurralUnico } | null;

export const CurralUnico: React.FC<{
    farmId: string;
    currentUserId?: string | null;
    lotes: { id: string; name: string }[];
    onErro: (m: string | null) => void;
    onAviso: (m: string | null) => void;
}> = ({ farmId, currentUserId, lotes, onErro, onAviso }) => {
    const chave = `eixo:repro:curral:${currentUserId || 'none'}:${farmId}`;
    const [cache, setCache] = useState<{ baixadoEm: string | null; vacas: VacaCurralUnico[] }>(() => lerLocal(chave, { baixadoEm: null, vacas: [] }));
    const [ident, setIdent] = useState('');
    const [passo, setPasso] = useState<Passo>(null);
    const [correcaoOffline, setCorrecaoOffline] = useState<OfflineQueueItem<LancamentoCurral> | null>(null);
    const [feitos, setFeitos] = useState<string[]>([]);
    const [baixando, setBaixando] = useState(false);
    const identRef = useRef<HTMLInputElement | null>(null);

    const enviar = async (item: LancamentoCurral) => {
        const r = await enviarLancamento(farmId, item);
        if (r.avisos?.length) onAviso(`${item.brinco}: ${r.avisos.join(' ')}`);
    };

    const fila = useOfflineQueue<LancamentoCurral>('eixo:repro:curral:fila:', farmId, {
        userId: currentUserId,
        autoSync: enviar,
        onSynced: (result) => {
            if (result.storageError) onErro('O lançamento chegou ao servidor, mas a fila do aparelho não pôde ser atualizada. Não envie novamente.');
        },
    });

    const baixar = useCallback(async () => {
        setBaixando(true);
        try {
            const r = await baixarCurral(farmId);
            const novo = { baixadoEm: r.baixadoEm, vacas: r.vacas };
            setCache(novo);
            gravarLocal(chave, novo);
            onErro(null);
        } catch (e: any) {
            onErro(`Não deu para baixar as vacas: ${e.message}`);
        } finally {
            setBaixando(false);
        }
    }, [farmId, chave, onErro]);

    useEffect(() => {
        void baixar();
    }, [baixar]);

    const porIdent = useMemo(() => new Map(cache.vacas.map((v) => [norm(v.brinco), v])), [cache.vacas]);
    const vaca = ident ? porIdent.get(norm(ident)) : undefined;

    const lancar = async (item: LancamentoCurral, frase: string) => {
        const payload = correcaoOffline ? { ...item, clientId: correcaoOffline.clientId } : item;
        const queued = correcaoOffline
            ? (await fila.update(correcaoOffline.tempId, payload)
                ? { ok: true as const }
                : { ok: false as const, error: 'Não foi possível atualizar o lançamento salvo no celular.' })
            : await fila.enqueue(payload);
        if (!queued.ok) {
            onErro(queued.error);
            return;
        }
        setCorrecaoOffline(null);
        setFeitos((f) => [frase, ...f].slice(0, 6));
        setPasso(null);
        setIdent('');
        identRef.current?.focus();
        if (navigator.onLine) await fila.sync(enviar);
        else onAviso('Guardado no celular. Vai sozinho quando a internet voltar.');
    };

    return (
        <div className="space-y-4">
            <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
                <div className="text-sm">
                    <p className="font-semibold">{cache.vacas.length} vaca(s) no celular</p>
                    <p className="text-xs text-[var(--eixo-text-muted)]">
                        {cache.baixadoEm ? `Baixadas em ${new Date(cache.baixadoEm).toLocaleString('pt-BR')}` : 'Baixe antes de ir ao curral.'}
                        {fila.waitingCount > 0 ? ` · ${fila.waitingCount} lançamento(s) esperando internet` : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    {fila.waitingCount > 0 && <button type="button" className={secondaryButton} onClick={() => void fila.sync(enviar)}>Enviar agora</button>}
                    <button type="button" className={secondaryButton} disabled={baixando} onClick={baixar}>{baixando ? 'Baixando…' : 'Baixar vacas'}</button>
                </div>
            </div>

            <OfflineRejectedItems<OfflineQueueItem<LancamentoCurral>>
                items={fila.rejectedItems}
                getLabel={(item) => `${item.brinco} · ${item.tipo}`}
                onCorrect={(item) => {
                    const target = cache.vacas.find((candidate) => candidate.id === item.animalId);
                    const action = target?.acoes.find((candidate) => candidate.tipo === item.tipo);
                    if (!target || !action) {
                        onErro('Baixe novamente as vacas para corrigir este lançamento.');
                        return;
                    }
                    setIdent(item.brinco);
                    setPasso({ vaca: target, acao: action });
                    setCorrecaoOffline(item);
                    onAviso('Lançamento carregado para correção. Confira e salve novamente.');
                }}
                onDiscard={(tempId) => {
                    void fila.remove(tempId);
                    if (correcaoOffline?.tempId === tempId) {
                        setCorrecaoOffline(null);
                        setPasso(null);
                    }
                }}
            />

            {!passo && (
                <div className={`${cardClass} space-y-3`}>
                    <label className="block">
                        <span className={labelClass}>Qual a identificação?</span>
                        <input ref={identRef} autoFocus autoComplete="off" className={`${inputClass} text-3xl font-bold`} value={ident}
                            onChange={(e) => setIdent(e.target.value)} placeholder="digite ou leia o brinco" />
                    </label>

                    {ident && !vaca && (
                        <p className="text-sm text-amber-700">Não achei essa identificação na lista do celular. Baixe de novo ou confira o número.</p>
                    )}

                    {vaca && (
                        <>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] px-4 py-3">
                                <p className="text-lg font-bold">{vaca.brinco}{vaca.lote ? ` · ${vaca.lote}` : ''}</p>
                                <p className="text-sm text-[var(--eixo-text-muted)]">{vaca.resumo}</p>
                            </div>
                            <div className="space-y-2">
                                {vaca.acoes.map((a) => (
                                    <button key={a.tipo} type="button" className={a.tipo === 'DESCARTE' ? `${botaoGrande} text-red-700` : botaoGrande}
                                        onClick={() => {
                                            setCorrecaoOffline(null);
                                            setPasso({ acao: a, vaca });
                                        }}>
                                        {a.titulo}
                                        <span className="block text-sm font-normal text-[var(--eixo-text-muted)]">{a.ajuda}</span>
                                    </button>
                                ))}
                                {!vaca.acoes.length && <p className="text-sm text-[var(--eixo-text-muted)]">Nada a lançar para esta vaca hoje.</p>}
                            </div>
                        </>
                    )}

                    {feitos.length > 0 && (
                        <div className="border-t border-[var(--eixo-border)] pt-3 text-sm">
                            <p className={labelClass}>Últimos lançamentos</p>
                            {feitos.map((f) => <p key={f} className="text-[var(--eixo-text-muted)]">{f}</p>)}
                        </div>
                    )}
                </div>
            )}

            {passo && <FormPasso
                key={correcaoOffline?.tempId || `${passo.vaca.id}:${passo.acao.tipo}`}
                passo={passo}
                lotes={lotes}
                initialItem={correcaoOffline}
                onVoltar={() => {
                    setPasso(null);
                    setCorrecaoOffline(null);
                }}
                onLancar={lancar}
            />}
        </div>
    );
};

const FormPasso: React.FC<{
    passo: NonNullable<Passo>;
    lotes: { id: string; name: string }[];
    initialItem?: LancamentoCurral | null;
    onVoltar: () => void;
    onLancar: (item: LancamentoCurral, frase: string) => void;
}> = ({ passo, lotes, initialItem, onVoltar, onLancar }) => {
    const { acao, vaca } = passo;
    const [dados, setDados] = useState<Record<string, any>>({ sexo: 'MACHO', vivo: true, tipoParto: 'NORMAL', ...(initialItem?.dados || {}) });
    const [data, setData] = useState(initialItem?.data || hoje());
    const set = (campo: string, valor: any) => setDados((d) => ({ ...d, [campo]: valor }));

    const enviar = (extra: Record<string, any>, frase: string) => {
        onLancar(
            { clientId: initialItem?.clientId || crypto.randomUUID(), animalId: vaca.id, brinco: vaca.brinco, tipo: acao.tipo, data, dados: { ...dados, ...extra } },
            `${vaca.brinco}: ${frase}`,
        );
    };

    return (
        <div className={`${cardClass} space-y-4`}>
            <div>
                <p className="text-sm text-[var(--eixo-text-muted)]">{vaca.brinco} · {vaca.resumo}</p>
                <h3 className="text-xl font-bold">{acao.titulo}</h3>
            </div>
            <label className="block"><span className={labelClass}>Data</span>
                <input type="date" className={inputClass} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} /></label>

            {acao.tipo === 'DIAGNOSTICO' && (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" className="rounded-2xl bg-emerald-600 py-6 text-xl font-bold text-white"
                            onClick={() => enviar({ resultado: 'PRENHE' }, 'cheia')}>CHEIA</button>
                        <button type="button" className="rounded-2xl bg-red-600 py-6 text-xl font-bold text-white"
                            onClick={() => enviar({ resultado: 'VAZIA' }, 'falhada')}>FALHADA</button>
                    </div>
                    <details>
                        <summary className="cursor-pointer text-sm text-[var(--eixo-text-muted)]">Anotar mais (opcional)</summary>
                        <div className="mt-2 grid gap-3 sm:grid-cols-3">
                            <label><span className={labelClass}>Dias de gestação</span>
                                <input type="number" inputMode="numeric" className={inputClass} value={dados.diasGestacao ?? ''} onChange={(e) => set('diasGestacao', e.target.value ? Number(e.target.value) : null)} /></label>
                            <label><span className={labelClass}>ECC (1 a 5)</span>
                                <input type="number" inputMode="decimal" min={1} max={5} step={0.25} className={inputClass} value={dados.ecc ?? ''} onChange={(e) => set('ecc', e.target.value ? Number(e.target.value) : null)} /></label>
                            <label><span className={labelClass}>Veterinário</span>
                                <input className={inputClass} value={dados.veterinario || ''} onChange={(e) => set('veterinario', e.target.value)} /></label>
                        </div>
                    </details>
                </>
            )}

            {acao.tipo === 'PARTO' && (
                <>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <span className={labelClass}>Sexo da cria</span>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                {(['MACHO', 'FEMEA'] as const).map((sx) => (
                                    <button key={sx} type="button" className={dados.sexo === sx ? primaryButton : secondaryButton} onClick={() => set('sexo', sx)}>
                                        {sx === 'MACHO' ? 'Macho' : 'Fêmea'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className={labelClass}>Nasceu</span>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                <button type="button" className={dados.vivo ? primaryButton : secondaryButton} onClick={() => set('vivo', true)}>Vivo</button>
                                <button type="button" className={!dados.vivo ? 'rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white' : secondaryButton} onClick={() => set('vivo', false)}>Morto</button>
                            </div>
                        </div>
                        <label><span className={labelClass}>Peso ao nascer (opcional)</span>
                            <input type="number" inputMode="decimal" min={1} max={99} className={inputClass} value={dados.peso ?? ''} onChange={(e) => set('peso', e.target.value)} /></label>
                    </div>
                    <button type="button" className={primaryButton}
                        onClick={() => enviar({ crias: [{ sexo: dados.sexo, vivo: dados.vivo, peso: dados.peso || null }] }, dados.vivo ? 'pariu' : 'pariu (cria morta)')}>
                        Salvar parto
                    </button>
                </>
            )}

            {acao.tipo === 'DESMAMA' && (
                <>
                    <label className="block"><span className={labelClass}>Peso do bezerro {vaca.bezerroPronto ? `(${vaca.bezerroPronto.brinco})` : ''}</span>
                        <input type="number" inputMode="decimal" min={1} autoFocus className={`${inputClass} text-2xl font-bold`} value={dados.peso ?? ''} onChange={(e) => set('peso', e.target.value)} /></label>
                    <label className="block"><span className={labelClass}>Mandar para o lote (opcional)</span>
                        <select className={inputClass} value={dados.lotId || ''} onChange={(e) => set('lotId', e.target.value || null)}>
                            <option value="">Não mudar</option>
                            {lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select></label>
                    <button type="button" className={primaryButton} disabled={!dados.peso}
                        onClick={() => enviar({ bezerroId: vaca.bezerroPronto?.id || null }, `bezerro desmamado com ${dados.peso} kg`)}>
                        Salvar desmama
                    </button>
                </>
            )}

            {acao.tipo === 'COBERTURA' && (
                <>
                    <label className="block"><span className={labelClass}>Qual touro?</span>
                        <input autoFocus className={`${inputClass} text-xl`} value={dados.touro || ''} onChange={(e) => set('touro', e.target.value)} /></label>
                    <button type="button" className={primaryButton} disabled={!dados.touro}
                        onClick={() => enviar({ inicio: data }, `solta com o touro ${dados.touro}`)}>
                        Salvar
                    </button>
                </>
            )}

            {acao.tipo === 'PERDA' && (
                <>
                    <p className="text-sm text-[var(--eixo-text-muted)]">Fica na história da vaca e ela volta a aparecer para conferir prenhez.</p>
                    <button type="button" className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white" onClick={() => enviar({}, 'perdeu a cria')}>
                        Confirmar
                    </button>
                </>
            )}

            {acao.tipo === 'DESCARTE' && (
                <>
                    <label className="block"><span className={labelClass}>Motivo</span>
                        <select className={inputClass} value={dados.motivo || ''} onChange={(e) => set('motivo', e.target.value)}>
                            <option value="">Escolha</option>
                            {['Vazia', 'Vazia repetida', 'Aborto', 'Intervalo entre partos longo', 'Bezerro leve', 'Idade/dentição', 'Úbere', 'Casco/aprumo', 'Temperamento', 'Doença', 'Outro'].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select></label>
                    <p className="text-sm text-[var(--eixo-text-muted)]">O descarte encerra a ficha dela na reprodução. A venda continua no Rebanho.</p>
                    <button type="button" className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" disabled={!dados.motivo}
                        onClick={() => enviar({}, `para descarte (${dados.motivo})`)}>
                        Confirmar descarte
                    </button>
                </>
            )}

            <button type="button" className={secondaryButton} onClick={onVoltar}>Voltar</button>
        </div>
    );
};
