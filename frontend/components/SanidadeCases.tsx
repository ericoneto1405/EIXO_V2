import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CasoSanitario, CasosResposta, NovoCaso, encerrarCaso, listarCasos, registrarCaso } from '../adapters/sanityApi';

interface SanidadeCasesProps {
    farmId: string;
    onChanged?: () => void;
}

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';
const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-xs font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const hoje = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const formatDate = (value: string | null) => (value ? value.slice(0, 10).split('-').reverse().join('/') : '—');

const STATUS_LABEL: Record<CasoSanitario['status'], { label: string; className: string }> = {
    EM_TRATAMENTO: { label: 'Em tratamento', className: 'bg-amber-100 text-amber-800' },
    CURADO: { label: 'Curado', className: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    MORTO: { label: 'Morreu', className: 'bg-[#fff2ef] text-[var(--eixo-danger)]' },
    DESCARTADO: { label: 'Descartado', className: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
};

const vazio = (kind: NovoCaso['kind']): NovoCaso => ({ kind, brinco: '', disease: '', otherDisease: '', startedAt: hoje(), symptoms: '', diagnosedBy: '', necropsy: false, notes: '' });

const SanidadeCases: React.FC<SanidadeCasesProps> = ({ farmId, onChanged }) => {
    const [dados, setDados] = useState<CasosResposta | null>(null);
    const [form, setForm] = useState<NovoCaso>(vazio('DOENCA'));
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);
    const [avisoNotificacao, setAvisoNotificacao] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<'ABERTOS' | 'TODOS'>('ABERTOS');

    const carregar = useCallback(async () => {
        try {
            setDados(await listarCasos(farmId));
        } catch (error) {
            setErro(error instanceof Error ? error.message : 'Não foi possível carregar os casos.');
        }
    }, [farmId]);

    useEffect(() => { void carregar(); }, [carregar]);

    const opcoes = form.kind === 'MORTE' ? dados?.causasMorte || [] : dados?.doencas || [];
    const escolhida = opcoes.find((item) => item.key === form.disease);
    const lista = useMemo(
        () => (dados?.casos || []).filter((caso) => filtro === 'TODOS' || caso.status === 'EM_TRATAMENTO'),
        [dados, filtro],
    );

    const salvar = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErro(null);
        setSucesso(null);
        setAvisoNotificacao(null);
        try {
            const result = await registrarCaso(farmId, form);
            setSucesso(form.kind === 'MORTE'
                ? `Morte do animal ${form.brinco} registrada. O animal saiu do rebanho ativo.`
                : `Caso do animal ${form.brinco} aberto. Registre os remédios em Aplicações.`);
            setAvisoNotificacao(result.aviso);
            setForm(vazio(form.kind));
            await carregar();
            onChanged?.();
        } catch (error) {
            setErro(error instanceof Error ? error.message : 'Não foi possível salvar.');
        } finally {
            setSaving(false);
        }
    };

    const encerrar = async (caso: CasoSanitario, status: CasoSanitario['status']) => {
        if (status === 'MORTO' && !window.confirm(`Confirmar a morte do animal ${caso.brinco}? Ele sai do rebanho ativo.`)) return;
        setErro(null);
        try {
            await encerrarCaso(farmId, caso.id, { status, closedAt: hoje() });
            setSucesso(status === 'MORTO'
                ? `Morte do animal ${caso.brinco} registrada.`
                : status === 'DESCARTADO'
                    ? `Caso encerrado como descarte. Registre a venda no Rebanho (a carência é conferida na venda para abate).`
                    : `Animal ${caso.brinco} marcado como curado.`);
            await carregar();
            onChanged?.();
        } catch (error) {
            setErro(error instanceof Error ? error.message : 'Não foi possível atualizar.');
        }
    };

    if (!dados) {
        return <div className={`${cardClass} text-center text-sm text-[var(--eixo-text-muted)]`}>{erro || 'Carregando casos...'}</div>;
    }
    const ind = dados.indicadores;

    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
                <div className={cardClass}><p className={labelClass}>Em tratamento</p><p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{ind.emTratamento}</p></div>
                <div className={cardClass}><p className={labelClass}>Casos em 12 meses</p><p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{ind.casos12m}</p></div>
                <div className={cardClass}><p className={labelClass}>Mortes em 12 meses</p><p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{ind.mortes12m}</p></div>
                <div className={`${cardClass} ${ind.mortalidade12m > 2 ? 'border-[#efc2ba]' : ''}`}>
                    <p className={labelClass}>Mortalidade em 12 meses</p>
                    <p className="mt-1 text-2xl font-extrabold text-[var(--eixo-text)]">{ind.mortalidade12m.toLocaleString('pt-BR')}%</p>
                    <p className="text-xs text-[var(--eixo-text-muted)]">Referência usada: até 2% ao ano em animais adultos.</p>
                </div>
            </div>

            {sucesso && <div role="status" className="rounded-xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-4 py-3 text-sm font-semibold text-[var(--eixo-success)]">{sucesso}</div>}
            {avisoNotificacao && <div role="alert" className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm font-bold text-[var(--eixo-danger)]">{avisoNotificacao}</div>}
            {erro && <div role="alert" className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[var(--eixo-danger)]">{erro}</div>}

            <section className={cardClass}>
                <div className="flex gap-2">
                    <button type="button" className={form.kind === 'DOENCA' ? primaryButton : `${secondaryButton} text-sm`} onClick={() => setForm(vazio('DOENCA'))}>Registrar doença</button>
                    <button type="button" className={form.kind === 'MORTE' ? primaryButton : `${secondaryButton} text-sm`} onClick={() => setForm(vazio('MORTE'))}>Registrar morte</button>
                </div>
                <form onSubmit={salvar} className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className={labelClass}>
                        Identificação do animal
                        <input required className={inputClass} value={form.brinco} onChange={(event) => setForm({ ...form, brinco: event.target.value })} />
                    </label>
                    <label className={labelClass}>
                        {form.kind === 'MORTE' ? 'Data da morte' : 'Data dos primeiros sinais'}
                        <input type="date" required max={hoje()} className={inputClass} value={form.startedAt} onChange={(event) => setForm({ ...form, startedAt: event.target.value })} />
                    </label>
                    <label className={labelClass}>
                        {form.kind === 'MORTE' ? 'Causa provável' : 'Doença'}
                        <select required className={inputClass} value={form.disease} onChange={(event) => setForm({ ...form, disease: event.target.value })}>
                            <option value="">Selecione</option>
                            {opcoes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                        </select>
                    </label>
                    {form.disease === 'OUTRA' && (
                        <label className={labelClass}>
                            Qual?
                            <input required className={inputClass} value={form.otherDisease} onChange={(event) => setForm({ ...form, otherDisease: event.target.value })} />
                        </label>
                    )}
                    <label className={`${labelClass} md:col-span-2`}>
                        {form.kind === 'MORTE' ? 'O que foi observado' : 'Sinais observados'}
                        <input className={inputClass} value={form.symptoms} onChange={(event) => setForm({ ...form, symptoms: event.target.value })} placeholder="Ex.: febre, sem comer, urina escura" />
                    </label>
                    <label className={labelClass}>
                        Quem avaliou (veterinário)
                        <input className={inputClass} value={form.diagnosedBy} onChange={(event) => setForm({ ...form, diagnosedBy: event.target.value })} />
                    </label>
                    {form.kind === 'MORTE' && (
                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--eixo-text)]">
                            <input type="checkbox" checked={Boolean(form.necropsy)} onChange={(event) => setForm({ ...form, necropsy: event.target.checked })} />
                            Foi feita necropsia
                        </label>
                    )}
                    <label className={`${labelClass} md:col-span-3`}>
                        Observações
                        <input className={inputClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                    </label>
                    {escolhida?.notificavel && (
                        <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-3 py-2 text-xs font-bold text-[var(--eixo-danger)] md:col-span-3">
                            Doença de notificação obrigatória: comunique o {dados.orgao} em até 24 horas e não mexa na carcaça sem orientação.
                        </div>
                    )}
                    <div className="flex justify-end md:col-span-3">
                        <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Salvando...' : form.kind === 'MORTE' ? 'Registrar morte' : 'Abrir caso'}</button>
                    </div>
                </form>
            </section>

            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-[var(--eixo-text)]">Casos</h2>
                    <div className="flex gap-2">
                        <button type="button" className={filtro === 'ABERTOS' ? primaryButton : secondaryButton} onClick={() => setFiltro('ABERTOS')}>Em tratamento</button>
                        <button type="button" className={filtro === 'TODOS' ? primaryButton : secondaryButton} onClick={() => setFiltro('TODOS')}>Todos</button>
                    </div>
                </div>
                {lista.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--eixo-text-muted)]">Nenhum caso {filtro === 'ABERTOS' ? 'em tratamento' : 'registrado'}.</p>
                ) : (
                    <div className="mt-3 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-xs text-[var(--eixo-text-muted)]">
                                <tr>
                                    <th className="py-2 pr-3">Data</th>
                                    <th className="py-2 pr-3">Animal</th>
                                    <th className="py-2 pr-3">Doença / causa</th>
                                    <th className="py-2 pr-3">Situação</th>
                                    <th className="py-2">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map((caso) => (
                                    <tr key={caso.id} className="border-t border-[var(--eixo-border)] align-top">
                                        <td className="py-2 pr-3">{formatDate(caso.startedAt)}</td>
                                        <td className="py-2 pr-3 font-semibold text-[var(--eixo-text)]">{caso.brinco}{caso.lote && <span className="block text-xs font-normal text-[var(--eixo-text-muted)]">{caso.lote}</span>}</td>
                                        <td className="py-2 pr-3">
                                            {caso.diseaseLabel}
                                            {caso.notifiable && <span className="ml-1 rounded bg-[#fff2ef] px-1 text-[10px] font-bold text-[var(--eixo-danger)]">NOTIFICAR</span>}
                                            {caso.symptoms && <span className="block text-xs text-[var(--eixo-text-muted)]">{caso.symptoms}</span>}
                                        </td>
                                        <td className="py-2 pr-3">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_LABEL[caso.status].className}`}>{STATUS_LABEL[caso.status].label}</span>
                                            {caso.closedAt && caso.kind === 'DOENCA' && <span className="block text-xs text-[var(--eixo-text-muted)]">em {formatDate(caso.closedAt)}</span>}
                                        </td>
                                        <td className="py-2">
                                            {caso.status === 'EM_TRATAMENTO' && (
                                                <div className="flex flex-wrap gap-1">
                                                    <button type="button" className={secondaryButton} onClick={() => void encerrar(caso, 'CURADO')}>Curado</button>
                                                    <button type="button" className={secondaryButton} onClick={() => void encerrar(caso, 'DESCARTADO')}>Descarte</button>
                                                    <button type="button" className={`${secondaryButton} text-[var(--eixo-danger)]`} onClick={() => void encerrar(caso, 'MORTO')}>Morreu</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {ind.porCausa.length > 0 && (
                <section className={cardClass}>
                    <h2 className="text-base font-bold text-[var(--eixo-text)]">Principais causas nos últimos 12 meses</h2>
                    <table className="mt-3 w-full text-left text-sm">
                        <thead className="text-xs text-[var(--eixo-text-muted)]"><tr><th className="py-2 pr-3">Doença / causa</th><th className="py-2 pr-3">Casos</th><th className="py-2">Mortes</th></tr></thead>
                        <tbody>
                            {ind.porCausa.map((item) => (
                                <tr key={item.causa} className="border-t border-[var(--eixo-border)]">
                                    <td className="py-2 pr-3 text-[var(--eixo-text)]">{item.causa}</td>
                                    <td className="py-2 pr-3">{item.casos}</td>
                                    <td className="py-2">{item.mortes}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
};

export default SanidadeCases;
