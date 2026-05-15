import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import LegalModal, { type LegalDoc } from './LegalModal';

interface LoginProps {
    onLogin: (email: string, password: string, rememberMe: boolean) => void;
    error?: string | null;
    success?: string | null;
    onBack?: () => void;
    onRegister?: () => void;
    onForgotPassword?: () => void;
    onRecoverEmail?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, error, success, onBack, onRegister, onForgotPassword, onRecoverEmail }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [openModal, setOpenModal] = useState<LegalDoc | null>(null);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        onLogin(email, password, false);
    };

    return (
        <>
            {openModal && <LegalModal doc={openModal} onClose={() => setOpenModal(null)} />}
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
                                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
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
                                                <div className="relative mt-1">
                                                    <input
                                                        id="password"
                                                        type={showPassword ? 'text' : 'password'}
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        className="w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 pr-12 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                        placeholder="••••••••"
                                                        required
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
                                            <div className="flex items-center justify-between gap-4 text-sm">
                                                <div />
                                                <div className="flex flex-col items-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={onForgotPassword}
                                                        className="text-sm font-medium text-[var(--eixo-text)]/72 transition-colors hover:text-[var(--eixo-text)] hover:underline"
                                                    >
                                                        Esqueci minha senha
                                                    </button>
                                                    {onRecoverEmail && (
                                                        <button
                                                            type="button"
                                                            onClick={onRecoverEmail}
                                                            className="text-sm font-medium text-[var(--eixo-text)]/72 transition-colors hover:text-[var(--eixo-text)] hover:underline"
                                                        >
                                                            Esqueci meu e-mail
                                                        </button>
                                                    )}
                                                </div>
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
                                                className="w-full rounded-2xl bg-[var(--eixo-green)] py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
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
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenModal('terms')}
                                                    className="font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2 hover:text-[var(--eixo-text)]"
                                                >
                                                    Termos de Uso
                                                </button>{' '}
                                                e{' '}
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenModal('privacy')}
                                                    className="font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2 hover:text-[var(--eixo-text)]"
                                                >
                                                    Política de Privacidade
                                                </button>.
                                            </p>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Login;
