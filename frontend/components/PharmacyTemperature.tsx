import React, { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../api';

interface Leitura {
    id: string;
    location: string;
    tempC: number;
    measuredAt: string;
    measuredByName: string | null;
}

interface Situacao {
    leituras: Leitura[];
    locais: { location: string; tempC: number; measuredAt: string; foraDaFaixa: boolean; diasSemLeitura: number }[];
    alertas: { tipo: 'FORA_DA_FAIXA' | 'SEM_LEITURA'; location: string | null; texto: string }[];
}

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2.5 text-sm text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-green)]';
const labelClass = 'block text-xs font-semibold text-[var(--eixo-text-muted)]';

const agoraLocal = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const PharmacyTemperature: React.FC<{ farmId: string }> = ({ farmId }) => {
    const [dados, setDados] = useState<Situacao | null>(null);
    const [form, setForm] = useState({ location: 'Geladeira 1', tempC: '', measuredAt: agoraLocal() });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ tone: 'ok' | 'erro' | 'alerta'; text: string } | null>(null);

    const carregar = useCallback(async () => {
        const res = await fetch(buildApiUrl(`/farms/${farmId}/pharmacy/temperaturas`), { credentials: 'include' });
        const payload = await res.json().catch(() => ({}));
        if (res.ok) setDados(payload);
    }, [farmId]);

    useEffect(() => { void carregar(); }, [carregar]);

    const salvar = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch(buildApiUrl(`/farms/${farmId}/pharmacy/temperaturas`), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, measuredAt: new Date(form.measuredAt).toISOString() }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.message || 'Não foi possível salvar.');
            setMsg(payload.foraDaFaixa
                ? { tone: 'alerta', text: `Leitura fora da faixa de 2 a 8 °C. Ajuste a geladeira e confira com o veterinário se as vacinas ainda podem ser usadas.` }
                : { tone: 'ok', text: 'Leitura registrada.' });
            setForm({ ...form, tempC: '', measuredAt: agoraLocal() });
            await carregar();
        } catch (error) {
            setMsg({ tone: 'erro', text: error instanceof Error ? error.message : 'Não foi possível salvar.' });
        } finally {
            setSaving(false);
        }
    };

    const tones = {
        ok: 'border-[#b6d4b0] bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]',
        erro: 'border-[#efc2ba] bg-[#fff2ef] text-[var(--eixo-danger)]',
        alerta: 'border-[#efc2ba] bg-[#fff2ef] text-[var(--eixo-danger)]',
    };

    return (
        <section className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
            <h3 className="font-bold text-[var(--eixo-text)]">Temperatura da geladeira</h3>
            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Vacinas ficam entre 2 e 8 °C. Anote pelo menos uma leitura por semana de cada geladeira ou caixa térmica.</p>
            {dados?.alertas.map((alerta) => (
                <div key={alerta.texto} role="alert" className={`mt-3 rounded-xl border px-3 py-2 text-sm font-semibold ${alerta.tipo === 'FORA_DA_FAIXA' ? tones.erro : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{alerta.texto}</div>
            ))}
            {msg && <div role="status" className={`mt-3 rounded-xl border px-3 py-2 text-sm font-semibold ${tones[msg.tone]}`}>{msg.text}</div>}
            <form onSubmit={salvar} className="mt-4 grid gap-3 md:grid-cols-4">
                <label className={labelClass}>
                    Local
                    <input required list="pharmacy-temp-locais" className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
                    <datalist id="pharmacy-temp-locais">
                        {(dados?.locais || []).map((local) => <option key={local.location} value={local.location} />)}
                    </datalist>
                </label>
                <label className={labelClass}>
                    Temperatura (°C)
                    <input required type="text" inputMode="decimal" className={inputClass} value={form.tempC} onChange={(event) => setForm({ ...form, tempC: event.target.value })} placeholder="Ex.: 5" />
                </label>
                <label className={labelClass}>
                    Data e hora
                    <input required type="datetime-local" max={agoraLocal()} className={inputClass} value={form.measuredAt} onChange={(event) => setForm({ ...form, measuredAt: event.target.value })} />
                </label>
                <div className="flex items-end">
                    <button type="submit" disabled={saving} className="w-full rounded-xl bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-bold text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)] disabled:opacity-50">{saving ? 'Salvando...' : 'Registrar leitura'}</button>
                </div>
            </form>
            {dados && dados.leituras.length > 0 && (
                <div className="mt-4 max-h-56 overflow-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs text-[var(--eixo-text-muted)]"><tr><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Local</th><th className="py-2 pr-3">Temperatura</th><th className="py-2">Anotado por</th></tr></thead>
                        <tbody>
                            {dados.leituras.map((leitura) => {
                                const fora = leitura.tempC < 2 || leitura.tempC > 8;
                                return (
                                    <tr key={leitura.id} className="border-t border-[var(--eixo-border)]">
                                        <td className="py-2 pr-3">{new Date(leitura.measuredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                        <td className="py-2 pr-3">{leitura.location}</td>
                                        <td className={`py-2 pr-3 font-bold ${fora ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-success)]'}`}>{leitura.tempC.toLocaleString('pt-BR')} °C{fora ? ' · fora' : ''}</td>
                                        <td className="py-2">{leitura.measuredByName || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};

export default PharmacyTemperature;
