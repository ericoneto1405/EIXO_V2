import React, { useState } from 'react';

interface LoginProps {
    onLogin: (email: string, password: string, rememberMe: boolean) => void;
    error?: string | null;
    success?: string | null;
    onBack?: () => void;
    onRegister?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, error, success, onBack, onRegister }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        onLogin(email, password, rememberMe);
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
                        <img src="/eixo-logo-render.png" alt="eixo" className="h-10 w-auto opacity-95 contrast-110" />
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--eixo-text)]/72">Plataforma de Gestão Pecuária</div>
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                        <div className="w-full max-w-xl rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]/95 shadow-xl backdrop-blur">
                <div className="p-8 lg:p-10 flex flex-col justify-center">
                    <div className="max-w-md mx-auto w-full">
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                className="mb-6 inline-flex items-center text-sm font-medium text-[var(--eixo-text)] transition-colors hover:text-[var(--eixo-text)]"
                            >
                                ← VOLTAR
                            </button>
                        )}
                        <div className="mb-6">
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite-dark)]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                Acesso seguro
                            </div>
                            <div>
                                <p className="text-sm uppercase tracking-[0.16em] text-[var(--eixo-text)]/72">Bem-vindo</p>
                                <h2 className="mt-2 text-3xl font-black text-[var(--eixo-text)]">Entrar na conta</h2>
                                <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                    Acesse sua fazenda com segurança e continue de onde parou.
                                </p>
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-[var(--eixo-text)]">
                                    E-mail
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="mt-1 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                    placeholder="nome@fazenda.com"
                                    required
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium text-[var(--eixo-text)]"
                                >
                                    Senha
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mt-1 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <div className="flex items-center justify-between gap-4 text-sm">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="h-4 w-4 rounded border-[var(--eixo-border)] text-[var(--eixo-green)] focus:ring-[var(--eixo-green)]"
                                    />
                                    <span className="text-[var(--eixo-text)]/72">Lembrar de mim</span>
                                </label>
                                {/* TODO: implementar recuperação de senha */}
                                <button
                                    type="button"
                                    onClick={() => {}}
                                    className="text-sm font-medium text-[var(--eixo-text)]/72 transition-colors hover:text-[var(--eixo-text)] hover:underline"
                                >
                                    Esqueci minha senha
                                </button>
                            </div>

                            {success && (
                                <div className="rounded-2xl bg-[var(--eixo-green-soft)] px-4 py-3 text-sm text-[var(--eixo-success)]">
                                    {success}
                                </div>
                            )}
                            {error && (
                                <div className="rounded-2xl bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                                    {error}
                                </div>
                            )}
                            <button
                                type="submit"
                                className="w-full rounded-2xl bg-[var(--eixo-green)] py-3 font-semibold text-white transition-colors hover:bg-[var(--eixo-green-dark)]"
                            >
                                Entrar
                            </button>

                            {onRegister && (
                                <button
                                    type="button"
                                    onClick={onRegister}
                                    className="w-full text-center text-sm text-[var(--eixo-text)]/72 transition-colors hover:text-[var(--eixo-text)]/78"
                                >
                                    <span>Ainda não tem conta? </span>
                                    <span className="font-semibold text-[var(--eixo-green-dark)] underline decoration-[var(--eixo-green)]/45 underline-offset-2">
                                        Criar conta grátis
                                    </span>
                                </button>
                            )}

                            <p className="text-center text-xs leading-relaxed text-[var(--eixo-text)]/66">
                                Ao continuar, você concorda com os{' '}
                                <span className="font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2">
                                    Termos de Uso
                                </span>{' '}
                                e{' '}
                                <span className="font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2">
                                    Política de Privacidade
                                </span>.
                            </p>
                        </form>
                    </div>
                </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
