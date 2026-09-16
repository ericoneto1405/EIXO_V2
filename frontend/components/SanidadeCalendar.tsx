import React, { useCallback, useEffect, useState } from 'react';
import {
    ConfiguracaoSanitaria,
    EstadoSanitario,
    Lembrete,
    Severidade,
    buscarConfiguracao,
    listarLembretes,
    salvarConfiguracao,
} from '../adapters/sanityApi';

interface SanidadeCalendarProps {
    farmId: string;
    onAplicar: (lembrete: Lembrete) => void;
    onAbrirFarmacia: () => void;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const SEVERIDADE_STYLE: Record<Severidade, { card: string; badge: string; label: string }> = {
    VERMELHO: { card: 'border-[#efc2ba] bg-[#fff2ef]', badge: 'bg-[var(--eixo-danger)] text-white', label: 'Hoje ou vencido' },
    LARANJA: { card: 'border-orange-200 bg-orange-50', badge: 'bg-orange-500 text-white', label: 'Até 7 dias' },
    AMARELO: { card: 'border-amber-200 bg-amber-50', badge: 'bg-amber-400 text-[#1a1a1a]', label: 'Até 30 dias' },
    AZUL: { card: 'border-[var(--eixo-border)] bg-[var(--eixo-surface)]', badge: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]', label: 'Programado' },
};

const GRUPO_LABEL: Record<Lembrete['grupo'], string> = {
    OBRIGATORIO: 'Obrigatório por lei',
    BOAS_PRATICAS: 'Boas práticas',
    GESTAO: 'Gestão',
};

const cardClass = 'rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5';
const primaryButton = 'rounded-xl bg-[var(--eixo-green)] px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-semibold text-[var(--eixo-text)] transition hover:bg-[var(--eixo-surface-soft)] disabled:opacity-50';

const formatDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
const quando = (dias: number) => (dias < 0 ? `venceu há ${-dias} dia(s)` : dias === 0 ? 'hoje' : `em ${dias} dia(s)`);

const MesesPicker: React.FC<{ value: number[]; onChange: (value: number[]) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
        {MESES.map((label, index) => {
            const mes = index + 1;
            const ativo = value.includes(mes);
            return (
                <button
                    key={label}
                    type="button"
                    disabled={disabled}
                    aria-pressed={ativo}
                    onClick={() => onChange(ativo ? value.filter((item) => item !== mes) : [...value, mes].sort((a, b) => a - b))}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition disabled:opacity-40 ${ativo ? 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] text-[var(--eixo-text)]' : 'border-[var(--eixo-border)] text-[var(--eixo-text-muted)]'}`}
                >
                    {label}
                </button>
            );
        })}
    </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string; hint: string }> = ({ checked, onChange, label, hint }) => (
    <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>
            <span className="block text-sm font-semibold text-[var(--eixo-text)]">{label}</span>
            <span className="block text-xs text-[var(--eixo-text-muted)]">{hint}</span>
        </span>
    </label>
);

const SanidadeCalendar: React.FC<SanidadeCalendarProps> = ({ farmId, onAplicar, onAbrirFarmacia }) => {
    const [lembretes, setLembretes] = useState<Lembrete[]>([]);
    const [estado, setEstado] = useState<EstadoSanitario | null>(null);
    const [config, setConfig] = useState<ConfiguracaoSanitaria | null>(null);
    const [configurada, setConfigurada] = useState(true);
    const [mostrarConfig, setMostrarConfig] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const [lista, cfg] = await Promise.all([listarLembretes(farmId), buscarConfiguracao(farmId)]);
            setLembretes(lista.lembretes);
            setEstado(lista.estado);
            setConfigurada(lista.configurada);
            setConfig(cfg);
            if (!lista.configurada) setMostrarConfig(true);
        } catch (error) {
            setErro(error instanceof Error ? error.message : 'Não foi possível carregar o calendário.');
        } finally {
            setLoading(false);
        }
    }, [farmId]);

    useEffect(() => { void carregar(); }, [carregar]);

    const salvar = async () => {
        if (!config) return;
        setSaving(true);
        setErro(null);
        try {
            const salvo = await salvarConfiguracao(farmId, config);
            setConfig(salvo);
            setMostrarConfig(false);
            setAviso('Configuração salva.');
            await carregar();
        } catch (error) {
            setErro(error instanceof Error ? error.message : 'Não foi possível salvar.');
        } finally {
            setSaving(false);
        }
    };

    const acionar = (lembrete: Lembrete) => {
        if (lembrete.acao === 'CONFIGURAR') setMostrarConfig(true);
        else if (lembrete.acao === 'FARMACIA') onAbrirFarmacia();
        else onAplicar(lembrete);
    };

    if (loading && !config) {
        return <div className={`${cardClass} text-center text-sm text-[var(--eixo-text-muted)]`}>Carregando calendário...</div>;
    }

    const grupos = (['OBRIGATORIO', 'BOAS_PRATICAS', 'GESTAO'] as const)
        .map((grupo) => ({ grupo, itens: lembretes.filter((item) => item.grupo === grupo) }))
        .filter((grupo) => grupo.itens.length > 0);

    return (
        <div className="space-y-4">
            {erro && <div role="alert" className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[var(--eixo-danger)]">{erro}</div>}
            {aviso && <div role="status" className="rounded-xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-4 py-3 text-sm font-semibold text-[var(--eixo-success)]">{aviso}</div>}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[var(--eixo-text-muted)]">
                    Lembretes dos próximos 90 dias{estado?.uf ? ` · ${estado.uf} · órgão de defesa: ${estado.orgao}` : ''}.
                </p>
                <button type="button" className={secondaryButton} onClick={() => setMostrarConfig(!mostrarConfig)}>
                    {mostrarConfig ? 'Fechar configuração' : 'Configurar calendário'}
                </button>
            </div>

            {estado && !estado.uf && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Cadastre o estado e a cidade da fazenda em Estrutura da Fazenda para os lembretes usarem a sua região.
                </div>
            )}

            {mostrarConfig && config && (
                <section className={`${cardClass} space-y-5`}>
                    {!configurada && <p className="text-sm font-semibold text-[var(--eixo-text)]">Antes de começar, confirme como a sua fazenda trabalha.</p>}
                    <div>
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">A vacina da raiva é obrigatória na sua região?</p>
                        <p className="text-xs text-[var(--eixo-text-muted)]">
                            A obrigação muda por município. Confirme no {estado?.orgao || 'órgão de defesa do estado'}
                            {estado?.linkBusca && <> (<a href={estado.linkBusca} target="_blank" rel="noreferrer" className="underline">buscar</a>)</>}.
                        </p>
                        <div className="mt-2 flex gap-2">
                            {([['SIM', 'Sim'], ['NAO', 'Não'], ['NAO_SEI', 'Não sei']] as const).map(([value, label]) => (
                                <button key={value} type="button" className={config.rabiesRequired === value ? primaryButton : secondaryButton} onClick={() => setConfig({ ...config, rabiesRequired: value })}>{label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Toggle checked={config.clostridialEnabled} onChange={(value) => setConfig({ ...config, clostridialEnabled: value })} label="Clostridioses" hint="Reforço 4 a 6 semanas após a 1ª dose e revacinação anual." />
                        <Toggle checked={config.reproductiveEnabled} onChange={(value) => setConfig({ ...config, reproductiveEnabled: value })} label="Vacinas reprodutivas (IBR/BVD e leptospirose)" hint="30 a 60 dias antes da estação de monta cadastrada na Reprodução." />
                    </div>
                    <div>
                        <Toggle checked={config.dewormEnabled} onChange={(value) => setConfig({ ...config, dewormEnabled: value })} label="Vermífugo estratégico" hint={`Sugestão para a sua região: ${(estado?.vermifugo || []).map((mes) => MESES[mes - 1]).join(', ')}. Ajuste com o seu veterinário.`} />
                        <MesesPicker value={config.dewormMonths} disabled={!config.dewormEnabled} onChange={(value) => setConfig({ ...config, dewormMonths: value })} />
                    </div>
                    <div>
                        <Toggle checked={config.tickEnabled} onChange={(value) => setConfig({ ...config, tickEnabled: value })} label="Carrapaticida" hint={`Sugestão para a sua região: ${(estado?.carrapato || []).map((mes) => MESES[mes - 1]).join(', ')}. Só conta produto marcado como carrapaticida.`} />
                        <MesesPicker value={config.tickMonths} disabled={!config.tickEnabled} onChange={(value) => setConfig({ ...config, tickMonths: value })} />
                    </div>
                    <div className="flex justify-end">
                        <button type="button" className={primaryButton} disabled={saving} onClick={() => void salvar()}>{saving ? 'Salvando...' : 'Salvar configuração'}</button>
                    </div>
                </section>
            )}

            {grupos.length === 0 ? (
                <div className={`${cardClass} text-center text-sm text-[var(--eixo-text-muted)]`}>Nenhum lembrete para os próximos 90 dias.</div>
            ) : grupos.map(({ grupo, itens }) => (
                <section key={grupo} className="space-y-2">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--eixo-text-muted)]">{GRUPO_LABEL[grupo]}</h2>
                    {itens.map((item) => {
                        const style = SEVERIDADE_STYLE[item.severidade];
                        return (
                            <article key={item.id} className={`rounded-2xl border p-4 ${style.card}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.badge}`}>{style.label}</span>
                                            <span className="text-xs font-semibold text-[var(--eixo-text-muted)]">{formatDate(item.data)} · {quando(item.dias)}</span>
                                        </div>
                                        <h3 className="mt-1 font-bold text-[var(--eixo-text)]">{item.titulo}</h3>
                                        <p className="mt-0.5 text-sm text-[var(--eixo-text-muted)]">{item.descricao}</p>
                                        {item.brincos.length > 0 && (
                                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                                {item.brincos.slice(0, 12).join(', ')}{item.totalAnimais > 12 ? ` e mais ${item.totalAnimais - 12}` : ''}
                                            </p>
                                        )}
                                        {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold underline">Buscar o órgão de defesa</a>}
                                    </div>
                                    {(item.acao !== 'VER' || item.brincos.length > 0) && (
                                    <button type="button" className={item.acao === 'APLICAR' ? primaryButton : secondaryButton} onClick={() => acionar(item)}>
                                        {item.acao === 'APLICAR' ? 'Aplicar agora' : item.acao === 'FARMACIA' ? 'Abrir Farmácia' : item.acao === 'CONFIGURAR' ? 'Responder' : 'Ver animais'}
                                    </button>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </section>
            ))}
        </div>
    );
};

export default SanidadeCalendar;
