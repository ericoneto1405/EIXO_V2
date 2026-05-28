import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { buildApiUrl } from '../api';

interface ResetPasswordProps {
    token: string;
    onSuccess: () => void;
    onBack: () => void;
}

const PASSWORD_POLICY_MESSAGE = 'A senha deve ter pelo menos 8 caracteres, com ao menos 1 letra e 1 número.';
const isPasswordStrongEnough = (value: string) =>
    value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

const ResetPassword: React.FC<ResetPasswordProps> = ({ token, onSuccess, onBack }) => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!isPasswordStrongEnough(password)) {
            setError(PASSWORD_POLICY_MESSAGE);
            return;
        }
        if (password !== confirm) {
            setError('A confirmação precisa ser igual à nova senha.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(buildApiUrl('/auth/reset-password'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ token, password }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.message || 'Não foi possível redefinir a senha.');
            }
            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
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

                                    {success ? (
                                        <div>
                                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                                Senha atualizada
                                            </div>
                                            <h2 className="text-3xl font-black text-[var(--eixo-text)]">Senha redefinida</h2>
                                            <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                                Sua senha foi atualizada com sucesso. Faça login usando a nova senha.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={onSuccess}
                                                className="mt-6 w-full rounded-2xl bg-[var(--eixo-green)] py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                                            >
                                                Ir para o login
                                            </button>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleSubmit} className="space-y-5">
                                            <div>
                                                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-green-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                                    Nova senha
                                                </div>
                                                <h2 className="text-3xl font-black text-[var(--eixo-text)]">Redefinir senha</h2>
                                                <p className="mt-3 text-sm leading-relaxed text-[var(--eixo-text)]/72">
                                                    Crie uma nova senha com pelo menos 8 caracteres, com letra e número.
                                                </p>
                                            </div>

                                            <div>
                                                <label htmlFor="new-password" className="block text-sm font-medium text-[var(--eixo-text)]">
                                                    Nova senha
                                                </label>
                                                <div className="relative mt-1">
                                                    <input
                                                        id="new-password"
                                                        type={showPassword ? 'text' : 'password'}
                                                        value={password}
                                                        onChange={(event) => setPassword(event.target.value)}
                                                        className="w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 pr-12 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                        placeholder="Mínimo 8 caracteres"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword((value) => !value)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--eixo-text-muted)]"
                                                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                                    >
                                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label htmlFor="confirm-password" className="block text-sm font-medium text-[var(--eixo-text)]">
                                                    Confirmar senha
                                                </label>
                                                <div className="relative mt-1">
                                                    <input
                                                        id="confirm-password"
                                                        type={showConfirm ? 'text' : 'password'}
                                                        value={confirm}
                                                        onChange={(event) => setConfirm(event.target.value)}
                                                        className="w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 pr-12 text-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                                                        placeholder="Repita a nova senha"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConfirm((value) => !value)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--eixo-text-muted)]"
                                                        aria-label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                                                    >
                                                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
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
                                                disabled={isLoading}
                                                className="w-full rounded-2xl bg-[var(--eixo-green)] py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:opacity-60"
                                            >
                                                {isLoading ? 'Salvando...' : 'Atualizar senha'}
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

export default ResetPassword;
