import React, { useState } from 'react';
import { buildApiUrl } from '../api';

interface ForgotPasswordProps {
    onBack: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBack }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(buildApiUrl('/auth/forgot-password'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.message || 'Não foi possível solicitar a recuperação.');
            }
            setSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível solicitar a recuperação.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--eixo-bg)] text-[var(--eixo-text)]">
            <div className="relative min-h-screen overflow-hidden">
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
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--eixo-text)]/72">Plataforma de Gestão Pecuária</div>
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                        <div className="w-full max-w-xl rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]/95 shadow-xl backdrop-blur">
                            <div className="flex flex-col justify-center p-8 lg:p-10">
                                <div className="mx-auto w-full max-w-md">
                                    <button
                                        type="button"
                                        onClick={onBack}
                                        className="mb-6 inline-flex items-center text-sm font-medium text-[var(--eixo-text)] transition-colors hover:underline"
                                    >
                                        ← VOLTAR AO LOGIN
                                    </button>

                                    {submitted ? (
                                        <div>
                                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                                E-mail enviado
                                            </div>
                                            <h2 className="text-3xl font-black text-[var(--eixo-text)]">Verifique seu e-mail</h2>
                                            <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                                Se o endereço estiver cadastrado, você receberá as instruções para redefinir sua senha em breve.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={onBack}
                                                className="mt-6 w-full rounded-2xl bg-[var(--eixo-green)] py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                                            >
                                                Voltar ao login
                                            </button>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleSubmit} className="space-y-5">
                                            <div>
                                                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                                    Recuperação segura
                                                </div>
                                                <h2 className="text-3xl font-black text-[var(--eixo-text)]">Recuperar senha</h2>
                                                <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                                    Informe seu e-mail para receber um link seguro de redefinição.
                                                </p>
                                            </div>

                                            <div>
                                                <label htmlFor="forgot-email" className="block text-sm font-medium text-[var(--eixo-text)]">
                                                    E-mail
                                                </label>
                                                <input
                                                    id="forgot-email"
                                                    type="email"
                                                    value={email}
                                                    onChange={(event) => setEmail(event.target.value)}
                                                    className="mt-1 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                    placeholder="nome@fazenda.com"
                                                    required
                                                />
                                            </div>

                                            {error && (
                                                <div className="rounded-2xl bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                                                    {error}
                                                </div>
                                            )}

                                            <button
                                                type="submit"
                                                disabled={isLoading}
                                                className="w-full rounded-2xl bg-[var(--eixo-green)] py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-60"
                                            >
                                                {isLoading ? 'Enviando...' : 'Enviar instruções'}
                                            </button>
                                        </form>
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

export default ForgotPassword;
