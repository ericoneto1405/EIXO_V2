
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

        // Simulação de chamada de API
        console.log('Alterando senha...');
        
        // Simulação de sucesso
        setMessage({ text: 'Senha alterada com sucesso!', type: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-6">
                 <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configurações</h1>
                 <p className="text-gray-500 dark:text-gray-400 mt-1">Gerencie suas preferências e segurança.</p>
            </div>
           
            <div className="bg-white dark:bg-dark-card rounded-xl shadow-lg p-6 md:p-8">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-6 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Segurança
                </h2>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Alterar Senha</h3>
                    
                    {message && (
                        <div className={`p-4 mb-6 rounded-lg ${
                            message.type === 'success' 
                                ? 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' 
                                : 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                        }`}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
                        <div>
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Senha Atual
                            </label>
                            <input
                                type="password"
                                id="currentPassword"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="block w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#1c1917]/10 focus:border-transparent dark:text-white transition-colors"
                                placeholder="Digite sua senha atual"
                            />
                        </div>

                        <div>
                            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Nova Senha
                            </label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="block w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#1c1917]/10 focus:border-transparent dark:text-white transition-colors"
                                placeholder="Digite a nova senha"
                            />
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Confirmar Nova Senha
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="block w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#1c1917]/10 focus:border-transparent dark:text-white transition-colors"
                                placeholder="Confirme a nova senha"
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1c1917]/10 transition-colors disabled:opacity-50"
                            >
                                Atualizar Senha
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="mt-8 bg-white dark:bg-dark-card rounded-xl shadow-lg p-6 md:p-8 opacity-60">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Preferências Gerais</h2>
                <p className="text-gray-500 dark:text-gray-400">Opções de idioma, tema e notificações estarão disponíveis em breve.</p>
            </div>
        </div>
    );
};

export default Settings;
