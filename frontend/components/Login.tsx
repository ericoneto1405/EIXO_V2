import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import LegalModal, { type LegalDoc } from './LegalModal';

interface LoginProps {
    onLogin: (email: string, password: string, rememberMe: boolean) => void;
    isLoading?: boolean;
    error?: string | null;
    success?: string | null;
    onBack?: () => void;
    onRegister?: () => void;
    onForgotPassword?: () => void;
    onRecoverEmail?: () => void;
    onClearError?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, isLoading = false, error, success, onBack, onRegister, onForgotPassword, onRecoverEmail, onClearError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [openModal, setOpenModal] = useState<LegalDoc | null>(null);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (isLoading) return;
        onLogin(email, password, false);
    };

    const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(event.target.value);
        if (error) onClearError?.();
    };

    const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setPassword(event.target.value);
        if (error) onClearError?.();
    };

    const hasError = Boolean(error);

    return (
        <>
            {openModal && <LegalModal doc={openModal} onClose={() => setOpenModal(null)} />}
            <div className="min-h-screen bg-[var(--eixo-bg)] text-[var(--eixo-text)]">
                <div className="relative overflow-hidden min-h-screen">
                    <div
                        className="absolute inset-0 opacity-40"
                        style={{
                            backgroundImage: "url('/hero-curral-1600.webp')",
                            backgroundPosition: 'center -160px',
                            backgroundSize: 'cover',
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--eixo-surface)] via-[var(--eixo-bg)]/82 to-[var(--eixo-bg)]/60" />

                    <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-6 pt-4 sm:pb-10 sm:pt-8 lg:px-8">
                        <div className="mb-4 sm:mb-10">
                            <img src="/logo_eixo_official.svg" alt="EIXO" className="h-10 w-auto" />
                            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--eixo-text)]/72">Gestão para Pecuária de Corte</div>
                        </div>

                        <div className="flex flex-1 items-center justify-center">
                            <div className="w-full max-w-xl rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]/95 shadow-xl backdrop-blur">
                                <div className="flex flex-col justify-center p-5 sm:p-8 lg:p-10">
                                    <div className="max-w-md mx-auto w-full">
                                        {onBack && (
                                            <button
                                                type="button"
                                                onClick={onBack}
                                                disabled={isLoading}
                                                className="mb-2 inline-flex min-h-11 items-center px-1 text-sm font-medium text-[var(--eixo-text)] transition-colors hover:text-[var(--eixo-text)] disabled:cursor-not-allowed disabled:opacity-50 sm:mb-4"
                                            >
                                                ← VOLTAR
                                            </button>
                                        )}
                                        <div className="mb-4 sm:mb-6">
                                            <div>
                                                <h2 className="text-2xl font-black text-[var(--eixo-text)] sm:text-3xl">Entrar na conta</h2>
                                                <p className="mt-2 text-sm leading-relaxed text-[var(--eixo-text)]/72 sm:mt-3">
                                                    Acesse sua fazenda e continue de onde parou.
                                                </p>
                                            </div>
                                        </div>
                                        <form onSubmit={handleSubmit} aria-busy={isLoading} className="space-y-4 sm:space-y-5">
                                            <span className="sr-only" role="status" aria-live="polite">
                                                {isLoading ? 'Preparando sua fazenda. Carregando suas informações.' : ''}
                                            </span>
                                            <div>
                                                <label htmlFor="email" className="block text-sm font-medium text-[var(--eixo-text)]">
                                                    E-mail
                                                </label>
                                                <input
                                                    id="email"
                                                    name="email"
                                                    type="email"
                                                    autoComplete="email"
                                                    inputMode="email"
                                                    autoCapitalize="none"
                                                    spellCheck={false}
                                                    value={email}
                                                    onChange={handleEmailChange}
                                                    disabled={isLoading}
                                                    aria-invalid={hasError}
                                                    aria-describedby={hasError ? 'login-error' : undefined}
                                                    className={`mt-1 w-full rounded-2xl border bg-[var(--eixo-surface-soft)] px-4 py-3 text-[var(--eixo-text)] focus:outline-none focus:ring-2 disabled:cursor-wait disabled:opacity-65 ${
                                                        hasError
                                                            ? 'border-[var(--eixo-danger)] focus:ring-[var(--eixo-danger)]/35'
                                                            : 'border-[var(--eixo-border)] focus:ring-[var(--eixo-green)]'
                                                    }`}
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
                                                        name="password"
                                                        type={showPassword ? 'text' : 'password'}
                                                        autoComplete="current-password"
                                                        value={password}
                                                        onChange={handlePasswordChange}
                                                        disabled={isLoading}
                                                        aria-invalid={hasError}
                                                        aria-describedby={hasError ? 'login-error' : undefined}
                                                        className={`w-full rounded-2xl border bg-[var(--eixo-surface-soft)] px-4 py-3 pr-12 text-[var(--eixo-text)] focus:outline-none focus:ring-2 disabled:cursor-wait disabled:opacity-65 ${
                                                            hasError
                                                                ? 'border-[var(--eixo-danger)] focus:ring-[var(--eixo-danger)]/35'
                                                                : 'border-[var(--eixo-border)] focus:ring-[var(--eixo-green)]'
                                                        }`}
                                                        placeholder="••••••••"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword((v) => !v)}
                                                        disabled={isLoading}
                                                        className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-border)]/70 disabled:cursor-wait disabled:opacity-50"
                                                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                                    >
                                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                    <button
                                                        type="button"
                                                        onClick={onForgotPassword}
                                                        disabled={isLoading}
                                                        className="inline-flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-sm font-medium leading-tight text-[var(--eixo-text)]/72 transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)] hover:underline disabled:cursor-wait disabled:opacity-50"
                                                    >
                                                        Esqueci a senha
                                                    </button>
                                                    {onRecoverEmail && (
                                                        <button
                                                            type="button"
                                                            onClick={onRecoverEmail}
                                                            disabled={isLoading}
                                                            className="inline-flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-sm font-medium leading-tight text-[var(--eixo-text)]/72 transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)] hover:underline disabled:cursor-wait disabled:opacity-50"
                                                        >
                                                            Não lembro meu e-mail
                                                        </button>
                                                    )}
                                            </div>

                                            {success && (
                                                <div className="rounded-2xl bg-[var(--eixo-green-soft)] px-4 py-3 text-sm text-[var(--eixo-success)]">
                                                    {success}
                                                </div>
                                            )}
                                            {error && (
                                                <div
                                                    id="login-error"
                                                    role="alert"
                                                    aria-live="assertive"
                                                    aria-atomic="true"
                                                    className="rounded-2xl bg-[rgba(184,66,50,0.08)] px-4 py-3 text-sm text-[var(--eixo-danger)]"
                                                >
                                                    {error}
                                                </div>
                                            )}
                                            <button
                                                type="submit"
                                                disabled={isLoading}
                                                className={`flex min-h-12 w-full items-center justify-center rounded-2xl px-4 font-semibold transition-all duration-300 ${
                                                    isLoading
                                                        ? 'min-h-16 scale-[1.02] cursor-wait bg-[var(--eixo-graphite)] text-white shadow-[0_14px_30px_rgba(47,47,47,0.28)] ring-4 ring-[rgba(182,226,58,0.28)]'
                                                        : 'bg-[var(--eixo-green)] py-3 text-[#1a1a1a] hover:bg-[var(--eixo-green-dark)]'
                                                }`}
                                            >
                                                {isLoading ? (
                                                    <span className="flex items-center justify-center gap-4">
                                                        <span className="eixo-loading-map" aria-hidden="true">
                                                            {Array.from({ length: 9 }, (_, index) => (
                                                                <span key={index} className="eixo-loading-map__plot" />
                                                            ))}
                                                        </span>
                                                        <span className="text-left">
                                                            <span className="block text-base font-bold leading-5">Preparando sua fazenda…</span>
                                                            <span className="block text-xs font-medium leading-4 text-white/70">Carregando suas informações…</span>
                                                        </span>
                                                    </span>
                                                ) : (
                                                    'Entrar'
                                                )}
                                            </button>

                                            {onRegister && (
                                                <button
                                                    type="button"
                                                    onClick={onRegister}
                                                    disabled={isLoading}
                                                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-2 text-center text-sm text-[var(--eixo-text)]/72 transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]/78 disabled:cursor-wait disabled:opacity-50"
                                                >
                                                    <span>Ainda não tem conta? </span>
                                                    <span className="ml-1 font-semibold text-[var(--eixo-green-dark)] underline decoration-[var(--eixo-green)]/45 underline-offset-2">
                                                        Criar conta grátis
                                                    </span>
                                                </button>
                                            )}

                                            <p className="text-center text-[11px] leading-relaxed text-[var(--eixo-text)]/58">
                                                Ao continuar, você concorda com os{' '}
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenModal('terms')}
                                                    disabled={isLoading}
                                                    className="inline-flex min-h-11 items-center rounded-lg px-1 align-middle font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2 hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)] disabled:cursor-wait disabled:opacity-50"
                                                >
                                                    Termos de Uso
                                                </button>{' '}
                                                e{' '}
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenModal('privacy')}
                                                    disabled={isLoading}
                                                    className="inline-flex min-h-11 items-center rounded-lg px-1 align-middle font-medium text-[var(--eixo-text)]/72 underline decoration-[var(--eixo-border-strong)]/70 underline-offset-2 hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)] disabled:cursor-wait disabled:opacity-50"
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
