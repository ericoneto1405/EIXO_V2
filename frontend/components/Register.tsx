import React, { useState } from 'react';
import { buildApiUrl } from '../api';

interface RegisterProps {
    onSuccess: () => void;
    onBack: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSuccess, onBack }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!name.trim() || !email.trim() || !password || !confirmPassword) {
            setError('Preencha nome, e-mail, senha e confirmação de senha.');
            return;
        }

        if (password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        if (password !== confirmPassword) {
            setError('A confirmação de senha precisa ser igual à senha.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(buildApiUrl('/register'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim(),
                    password,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(payload?.message || 'Não foi possível criar sua conta.');
                return;
            }
            onSuccess();
        } catch (submitError) {
            console.error(submitError);
            setError('Não foi possível conectar ao servidor.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900">
            <div className="relative min-h-screen overflow-hidden">
                <div
                    className="absolute inset-0 opacity-40"
                    style={{
                        backgroundImage: "url('/pasture-horizon.jpg')",
                        backgroundPosition: 'center -160px',
                        backgroundSize: 'cover',
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-50 via-stone-50/80 to-stone-50/55" />

                <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-8 lg:px-8">
                    <div className="mb-10">
                        <div className="text-[2rem] font-black leading-none text-stone-900">eixo</div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Plataforma de Gestão Pecuária</div>
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                        <div className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white/95 shadow-xl backdrop-blur">
                            <div className="flex flex-col justify-center p-8 lg:p-10">
                                <div className="mx-auto w-full max-w-md">
                                    <button
                                        type="button"
                                        onClick={onBack}
                                        className="mb-6 inline-flex items-center text-sm font-medium text-stone-700 transition-colors hover:text-stone-900"
                                    >
                                        ← VOLTAR
                                    </button>
                                    <div className="mb-6">
                                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-100/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                            Crie sua conta
                                        </div>
                                        <div>
                                            <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Plano grátis</p>
                                            <h2 className="mt-2 text-3xl font-black text-stone-900">Comece agora</h2>
                                            <p className="mt-3 text-sm leading-relaxed text-stone-600">
                                                Sem cartão para começar. Organize sua fazenda hoje.
                                            </p>
                                        </div>
                                    </div>
                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        <div>
                                            <label htmlFor="register-name" className="block text-sm font-medium text-stone-700">
                                                Nome completo
                                            </label>
                                            <input
                                                id="register-name"
                                                type="text"
                                                value={name}
                                                onChange={(event) => setName(event.target.value)}
                                                className="mt-1 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary"
                                                placeholder="Seu nome completo"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="register-email" className="block text-sm font-medium text-stone-700">
                                                E-mail
                                            </label>
                                            <input
                                                id="register-email"
                                                type="email"
                                                value={email}
                                                onChange={(event) => setEmail(event.target.value)}
                                                className="mt-1 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary"
                                                placeholder="nome@fazenda.com"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="register-password" className="block text-sm font-medium text-stone-700">
                                                Senha
                                            </label>
                                            <input
                                                id="register-password"
                                                type="password"
                                                value={password}
                                                onChange={(event) => setPassword(event.target.value)}
                                                className="mt-1 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary"
                                                placeholder="Mínimo de 6 caracteres"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="register-password-confirm" className="block text-sm font-medium text-stone-700">
                                                Confirmar senha
                                            </label>
                                            <input
                                                id="register-password-confirm"
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(event) => setConfirmPassword(event.target.value)}
                                                className="mt-1 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary"
                                                placeholder="Repita sua senha"
                                                required
                                            />
                                        </div>

                                        {error && (
                                            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                                                {error}
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full rounded-2xl bg-primary py-3 font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
                                        >
                                            {isSubmitting ? 'Criando conta...' : 'Criar conta grátis'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={onBack}
                                            className="w-full text-center text-sm font-medium text-stone-700 transition-colors hover:text-stone-900"
                                        >
                                            Já tenho conta
                                        </button>

                                        <p className="text-center text-xs text-stone-500">
                                            Ao continuar, você concorda com os Termos de Uso e Política de Privacidade.
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

export default Register;
