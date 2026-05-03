import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { buildApiUrl } from '../api';

interface AcceptInviteProps {
    token: string;
    onSuccess: () => void;
}

const ROLE_LABEL: Record<string, string> = {
    OWNER: 'Proprietário',
    ADMIN: 'Gestor',
    MEMBER: 'Operador',
};

const AcceptInvite: React.FC<AcceptInviteProps> = ({ token, onSuccess }) => {
    const [info, setInfo] = useState<{ email: string; orgName: string; role: string } | null>(null);
    const [invalid, setInvalid] = useState(false);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        fetch(buildApiUrl(`/invitations/${token}`))
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then(setInfo)
            .catch(() => setInvalid(true));
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch(buildApiUrl('/invitations/accept'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, name, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message || 'Erro ao aceitar convite.');
                return;
            }
            setSuccess(true);
            setTimeout(() => onSuccess(), 2000);
        } catch {
            setError('Erro inesperado. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--eixo-bg)] text-[var(--eixo-text)]">
            <div className="relative overflow-hidden min-h-screen">
                <div
                    className="absolute inset-0 opacity-40"
                    style={{
                        backgroundImage: "url('/pasture-horizon.jpg')",
                        backgroundPosition: 'center -160px',
                        backgroundSize: 'cover',
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--eixo-surface)] via-[var(--eixo-bg)]/82 to-[var(--eixo-bg)]/60" />

                <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-8 lg:px-8">
                    <div className="mb-10">
                        <img src="/logo_eixo_official.svg" alt="EIXO" className="h-10 w-auto" />
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--eixo-text)]/72">
                            Plataforma de Gestão Pecuária
                        </div>
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                        <div className="w-full max-w-xl rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]/95 shadow-xl backdrop-blur">
                            <div className="p-8 lg:p-10">
                                <div className="max-w-md mx-auto w-full">

                                    {/* Convite inválido */}
                                    {invalid && (
                                        <>
                                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[rgba(184,66,50,0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-danger)]">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-danger)]" />
                                                Convite inválido
                                            </div>
                                            <h2 className="mt-2 text-2xl font-black text-[var(--eixo-text)]">
                                                Este convite não está mais disponível
                                            </h2>
                                            <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                                O link pode ter expirado ou já foi utilizado. Peça ao proprietário da organização que envie um novo convite.
                                            </p>
                                        </>
                                    )}

                                    {/* Carregando */}
                                    {!invalid && !info && (
                                        <p className="text-sm text-[var(--eixo-text)]/72">Verificando convite…</p>
                                    )}

                                    {/* Formulário */}
                                    {!invalid && info && !success && (
                                        <>
                                            <div className="mb-6">
                                                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                                    Convite recebido
                                                </div>
                                                <p className="text-sm uppercase tracking-[0.16em] text-[var(--eixo-text)]/72">
                                                    {info.orgName}
                                                </p>
                                                <h2 className="mt-2 text-3xl font-black text-[var(--eixo-text)]">
                                                    Criar sua conta
                                                </h2>
                                                <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                                    Você foi convidado como{' '}
                                                    <span className="font-semibold text-[var(--eixo-text)]">
                                                        {ROLE_LABEL[info.role] ?? info.role}
                                                    </span>
                                                    . Preencha seus dados para começar.
                                                </p>
                                            </div>

                                            <form onSubmit={handleSubmit} className="space-y-5">
                                                <div>
                                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">
                                                        E-mail
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={info.email}
                                                        readOnly
                                                        className="mt-1 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-[var(--eixo-text)]/60 cursor-not-allowed"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">
                                                        Seu nome
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={name}
                                                        onChange={(e) => setName(e.target.value)}
                                                        className="mt-1 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                        placeholder="Como você quer ser chamado"
                                                        required
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-[var(--eixo-text)]">
                                                        Criar senha
                                                    </label>
                                                    <div className="relative mt-1">
                                                        <input
                                                            type={showPassword ? 'text' : 'password'}
                                                            value={password}
                                                            onChange={(e) => setPassword(e.target.value)}
                                                            className="w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 pr-12 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                            placeholder="Mínimo 8 caracteres"
                                                            required
                                                            minLength={8}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowPassword((v) => !v)}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--eixo-text-muted)]"
                                                            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                                        >
                                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                        </button>
                                                    </div>
                                                </div>

                                                {error && (
                                                    <div className="rounded-2xl bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                                                        {error}
                                                    </div>
                                                )}

                                                <button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="w-full rounded-2xl bg-[var(--eixo-green)] py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-60"
                                                >
                                                    {loading ? 'Criando conta…' : 'Entrar no EIXO'}
                                                </button>
                                            </form>
                                        </>
                                    )}

                                    {/* Sucesso */}
                                    {success && (
                                        <>
                                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                                Conta criada
                                            </div>
                                            <h2 className="mt-2 text-2xl font-black text-[var(--eixo-text)]">
                                                Bem-vindo ao EIXO!
                                            </h2>
                                            <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                                Sua conta foi criada. Redirecionando para o login…
                                            </p>
                                        </>
                                    )}

                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AcceptInvite;
