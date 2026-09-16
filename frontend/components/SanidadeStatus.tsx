import React, { useCallback, useEffect, useState } from 'react';
import { Semaforo, SituacaoSanitaria, buscarSituacao, registrarComprovacao } from '../adapters/sanityApi';

interface SanidadeStatusProps {
    farmId: string;
    refreshKey?: number;
}

const COR: Record<Semaforo, { dot: string; texto: string; label: string }> = {
    VERDE: { dot: 'bg-[var(--eixo-success)]', texto: 'text-[var(--eixo-success)]', label: 'Em dia' },
    AMARELO: { dot: 'bg-amber-400', texto: 'text-amber-700', label: 'Atenção' },
    VERMELHO: { dot: 'bg-[var(--eixo-danger)]', texto: 'text-[var(--eixo-danger)]', label: 'Pendente' },
    CINZA: { dot: 'bg-[var(--eixo-text-muted)]', texto: 'text-[var(--eixo-text-muted)]', label: 'Não se aplica' },
};

const BORDA: Record<Semaforo, string> = {
    VERDE: 'border-[#b6d4b0]',
    AMARELO: 'border-amber-300',
    VERMELHO: 'border-[#efc2ba]',
    CINZA: 'border-[var(--eixo-border)]',
};

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const hoje = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const Linha: React.FC<{ titulo: string; status: Semaforo; motivos: string[] }> = ({ titulo, status, motivos }) => (
    <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3">
        <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${COR[status].dot}`} aria-hidden="true" />
            <span className="text-sm font-bold text-[var(--eixo-text)]">{titulo}</span>
            <span className={`text-xs font-semibold ${COR[status].texto}`}>{COR[status].label}</span>
        </div>
        <ul className="mt-1 space-y-0.5 pl-5 text-xs text-[var(--eixo-text-muted)]">
            {motivos.map((motivo) => <li key={motivo} className="list-disc">{motivo}</li>)}
        </ul>
    </div>
);

const SanidadeStatus: React.FC<SanidadeStatusProps> = ({ farmId, refreshKey = 0 }) => {
    const [situacao, setSituacao] = useState<SituacaoSanitaria | null>(null);
    const [aberto, setAberto] = useState(false);
    const [form, setForm] = useState({ period: '', deliveredAt: hoje(), protocol: '' });
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        try {
            const dados = await buscarSituacao(farmId);
            setSituacao(dados);
            setForm((atual) => ({ ...atual, period: atual.period || (dados.comprovacoes.includes(dados.ultimoPeriodoVencido.period) ? dados.periodoAtual.period : dados.ultimoPeriodoVencido.period) }));
        } catch {
            setSituacao(null);
        }
    }, [farmId]);

    useEffect(() => { void carregar(); }, [carregar, refreshKey]);

    if (!situacao) return null;

    const salvar = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErro(null);
        try {
            setSituacao(await registrarComprovacao(farmId, form));
            setAberto(false);
        } catch (error) {
            setErro(error instanceof Error ? error.message : 'Não foi possível salvar.');
        } finally {
            setSaving(false);
        }
    };

    const periodos = [situacao.ultimoPeriodoVencido, situacao.periodoAtual];

    return (
        <section className={`rounded-2xl border bg-[var(--eixo-surface)] p-4 ${BORDA[situacao.geral]}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={`h-5 w-5 rounded-full ${COR[situacao.geral].dot}`} aria-hidden="true" />
                    <div>
                        <p className="text-sm font-bold text-[var(--eixo-text)]">Situação sanitária da fazenda: <span className={COR[situacao.geral].texto}>{COR[situacao.geral].label}</span></p>
                        <p className="text-xs text-[var(--eixo-text-muted)]">{situacao.mensagem}</p>
                    </div>
                </div>
                <button type="button" onClick={() => setAberto(!aberto)} className="rounded-xl border border-[var(--eixo-border)] px-3 py-2 text-sm font-semibold text-[var(--eixo-text)] hover:bg-[var(--eixo-surface-soft)]">
                    {aberto ? 'Fechar' : 'Registrar comprovação de brucelose'}
                </button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
                <Linha titulo="Brucelose" status={situacao.brucelose.status} motivos={situacao.brucelose.motivos} />
                <Linha titulo="Raiva" status={situacao.raiva.status} motivos={situacao.raiva.motivos} />
            </div>
            {aberto && (
                <form onSubmit={salvar} className="mt-3 grid gap-3 rounded-xl border border-[var(--eixo-border)] p-3 md:grid-cols-4">
                    <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                        Semestre
                        <select className={inputClass} value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })}>
                            {periodos.map((item) => (
                                <option key={item.period} value={item.period}>
                                    {item.label} (prazo {item.prazo.slice(0, 10).split('-').reverse().join('/')}){situacao.comprovacoes.includes(item.period) ? ' · já registrada' : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                        Data da entrega
                        <input type="date" max={hoje()} required className={inputClass} value={form.deliveredAt} onChange={(event) => setForm({ ...form, deliveredAt: event.target.value })} />
                    </label>
                    <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                        Protocolo no {situacao.estado.orgao} (opcional)
                        <input className={inputClass} value={form.protocol} onChange={(event) => setForm({ ...form, protocol: event.target.value })} />
                    </label>
                    <div className="flex items-end">
                        <button type="submit" disabled={saving} className="w-full rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
                    </div>
                    {erro && <p className="text-sm font-semibold text-[var(--eixo-danger)] md:col-span-4">{erro}</p>}
                    <p className="text-xs text-[var(--eixo-text-muted)] md:col-span-4">O EIXO não envia nada ao órgão: registre aqui depois de entregar a comprovação. Prazos de referência nacional (10/07 e 10/01); confira o calendário do seu estado.</p>
                </form>
            )}
        </section>
    );
};

export default SanidadeStatus;
