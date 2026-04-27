
import React, { useState } from 'react';

const Settings: React.FC = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage({ text: 'Todos os campos são obrigatórios.', type: 'error' });
            return;
        }

        if (newPassword.length < 6) {
            setMessage({ text: 'A nova senha deve ter no mínimo 6 caracteres.', type: 'error' });
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage({ text: 'A nova senha e a confirmação não conferem.', type: 'error' });
            return;
        }

        console.log('Alterando senha...');
        setMessage({ text: 'Senha alterada com sucesso!', type: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6">
                <h1 className="font-brand text-2xl font-extrabold text-[#1c1917]">Configurações</h1>
                <p className="mt-1 text-sm text-[#78716c]">Gerencie suas preferências e segurança.</p>
            </div>

            <div className="rounded-2xl border border-[#e7e5e4] bg-white p-6 md:p-8">
                <h2 className="mb-6 flex items-center text-lg font-semibold text-[#1c1917]">
                    <svg className="mr-2 h-5 w-5 text-[#78716c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Segurança
                </h2>

                <div className="border-t border-[#e7e5e4] pt-6">
                    <h3 className="mb-4 text-base font-semibold text-[#1c1917]">Alterar Senha</h3>

                    {message && (
                        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
                            message.type === 'success'
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                        }`}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="max-w-md space-y-5">
                        <div>
                            <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-[#78716c]">
                                Senha Atual
                            </label>
                            <input
                                type="password"
                                id="currentPassword"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="block w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-2 text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10 transition-colors"
                                placeholder="Digite sua senha atual"
                            />
                        </div>

                        <div>
                            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-[#78716c]">
                                Nova Senha
                            </label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="block w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-2 text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10 transition-colors"
                                placeholder="Digite a nova senha"
                            />
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-[#78716c]">
                                Confirmar Nova Senha
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="block w-full rounded-xl border border-[#e7e5e4] bg-white px-4 py-2 text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:border-[#a8442a] focus:outline-none focus:ring-1 focus:ring-[#a8442a]/10 transition-colors"
                                placeholder="Confirme a nova senha"
                            />
                        </div>

                        <div className="pt-1">
                            <button
                                type="submit"
                                className="w-full rounded-xl bg-[#a8442a] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#933a22] focus:outline-none focus:ring-2 focus:ring-[#a8442a]/30 disabled:opacity-50"
                            >
                                Atualizar Senha
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[#e7e5e4] bg-white p-6 opacity-60 md:p-8">
                <h2 className="mb-2 text-base font-semibold text-[#1c1917]">Preferências Gerais</h2>
                <p className="text-sm text-[#78716c]">Opções de idioma e notificações estarão disponíveis em breve.</p>
            </div>
        </div>
    );
};

export default Settings;
