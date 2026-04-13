import React, { useState } from 'react';

interface LoginProps {
    onLogin: (email: string, password: string, rememberMe: boolean) => void;
    error?: string | null;
    onBack?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, error, onBack }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        onLogin(email, password, rememberMe);
    };

    return (
        <div className="min-h-screen bg-stone-50 text-stone-900">
            <div className="relative overflow-hidden min-h-screen">
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
                <div className="p-8 lg:p-10 flex flex-col justify-center">
                    <div className="max-w-md mx-auto w-full">
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                className="mb-6 inline-flex items-center text-sm font-medium text-stone-700 transition-colors hover:text-stone-900"
                            >
                                ← VOLTAR
                            </button>
                        )}
                        <div className="mb-6">
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-100/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Acesso seguro
                            </div>
                            <div>
                                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Bem-vindo</p>
                                <h2 className="mt-2 text-3xl font-black text-stone-900">Entrar na conta</h2>
                                <p className="mt-3 text-sm leading-relaxed text-stone-600">
                                    Acesse sua fazenda com segurança e continue de onde parou.
                                </p>
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-stone-700">
                                    E-mail corporativo
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="mt-1 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary"
                                    placeholder="nome@fazenda.com"
                                    required
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium text-stone-700"
                                >
                                    Senha
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="mt-1 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-primary"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <div className="flex items-center justify-between text-sm text-stone-600">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    />
                                    <span>Lembrar de mim</span>
                                </label>
                            </div>

                            {error && (
                                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                                    {error}
                                </div>
                            )}
                            <button
                                type="submit"
                                className="w-full rounded-2xl bg-primary py-3 font-semibold text-white transition-colors hover:bg-primary-dark"
                            >
                                Entrar
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

export default Login;
