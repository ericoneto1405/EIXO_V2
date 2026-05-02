import React, { useEffect, useState } from 'react';
import type { Farm, WebUserCreatePayload } from '../types';

interface ModuleCategory {
    title: string;
    modules: string[];
}

interface UserRegisterModalProps {
    isOpen: boolean;
    onClose: () => void;
    farms: Farm[];
    onRegister: (payload: WebUserCreatePayload) => void;
    moduleCategories: ModuleCategory[];
    error?: string | null;
    successMessage?: string | null;
}

const PASSWORD_POLICY_MESSAGE = 'A senha deve ter pelo menos 8 caracteres, com ao menos 1 letra e 1 número.';

const isPasswordStrongEnough = (value: string) =>
    value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

const UserRegisterModal: React.FC<UserRegisterModalProps> = ({
    isOpen,
    onClose,
    farms,
    onRegister,
    moduleCategories,
    error,
    successMessage,
}) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [selectedModules, setSelectedModules] = useState<string[]>([]);
    const [defaultFarmId, setDefaultFarmId] = useState('');
    const [modulesError, setModulesError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [farmError, setFarmError] = useState<string | null>(null);

    const allModules = React.useMemo(
        () => moduleCategories.flatMap((category) => category.modules),
        [moduleCategories],
    );

    useEffect(() => {
        if (!isOpen) {
            setName('');
            setEmail('');
            setPassword('');
            setSelectedModules(allModules);
            setDefaultFarmId('');
            setModulesError(null);
            setPasswordError(null);
            setFarmError(null);
            return;
        }
        setSelectedModules(allModules);
        setModulesError(null);
        setPasswordError(null);
        setFarmError(null);
    }, [isOpen, allModules]);

    if (!isOpen) return null;

    const toggleModule = (module: string) => {
        setSelectedModules((prev) =>
            prev.includes(module) ? prev.filter((item) => item !== module) : [...prev, module],
        );
    };

    const toggleAll = () => {
        setSelectedModules(selectedModules.length === allModules.length ? [] : allModules);
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (selectedModules.length === 0) {
            setModulesError('Selecione pelo menos um módulo para liberar.');
            return;
        }
        if (!defaultFarmId) {
            setFarmError('Selecione a fazenda padrão do usuário.');
            return;
        }
        if (!isPasswordStrongEnough(password)) {
            setPasswordError(PASSWORD_POLICY_MESSAGE);
            return;
        }
        setModulesError(null);
        setPasswordError(null);
        setFarmError(null);
        onRegister({
            name,
            email,
            password,
            modules: selectedModules,
            defaultFarmId,
        });
    };

    const inputClass =
        'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-5">
                    <div>
                        <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            Sistema web
                        </div>
                        <h3 className="font-brand text-xl font-extrabold text-[var(--eixo-text)]">Novo usuário</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    <div>
                        <label htmlFor="user-name" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Nome completo
                        </label>
                        <input
                            id="user-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={inputClass}
                            placeholder="Maria Andrade"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="user-email" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            E-mail
                        </label>
                        <input
                            id="user-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClass}
                            placeholder="nome@fazenda.com"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="user-password" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Senha
                        </label>
                        <input
                            id="user-password"
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setPasswordError(null);
                            }}
                            className={inputClass}
                            placeholder="••••••••"
                            required
                        />
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{PASSWORD_POLICY_MESSAGE}</p>
                        {passwordError && (
                            <p className="mt-2 text-xs font-medium text-[var(--eixo-danger)]">{passwordError}</p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="user-default-farm" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Fazenda padrão
                        </label>
                        <select
                            id="user-default-farm"
                            value={defaultFarmId}
                            onChange={(e) => {
                                setDefaultFarmId(e.target.value);
                                setFarmError(null);
                            }}
                            className={inputClass}
                            required
                        >
                            <option value="">Selecione a fazenda</option>
                            {farms.map((farm) => (
                                <option key={farm.id} value={farm.id}>
                                    {farm.name}
                                </option>
                            ))}
                        </select>
                        {farmError && (
                            <p className="mt-2 text-xs font-medium text-[var(--eixo-danger)]">{farmError}</p>
                        )}
                    </div>

                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Liberar módulos</p>
                                <p className="text-xs text-[var(--eixo-text-muted)]">Escolha quais áreas o usuário poderá acessar.</p>
                            </div>
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="text-xs font-semibold text-[var(--eixo-text)] hover:text-[var(--eixo-graphite)] hover:underline"
                            >
                                {selectedModules.length === allModules.length ? 'Remover todos' : 'Selecionar todos'}
                            </button>
                        </div>

                        <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
                            {moduleCategories.map((category) => (
                                <div key={category.title}>
                                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b0a08a]">
                                        {category.title}
                                    </p>
                                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                        {category.modules.map((module) => {
                                            const isSelected = selectedModules.includes(module);
                                            return (
                                                <label
                                                    key={module}
                                                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                                                        isSelected
                                                            ? 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]'
                                                            : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)] text-[var(--eixo-text-muted)] hover:border-[var(--eixo-text-soft)]'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="accent-[var(--eixo-green)]"
                                                        checked={isSelected}
                                                        onChange={() => toggleModule(module)}
                                                    />
                                                    <span className="font-medium">{module}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {modulesError && (
                            <p className="mt-3 text-xs font-medium text-[var(--eixo-danger)]">{modulesError}</p>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                            {error}
                        </div>
                    )}
                    {successMessage && !error && (
                        <div className="rounded-xl border border-[#b6d4b0] bg-[var(--eixo-green-soft)] px-4 py-3 text-sm text-[var(--eixo-success)]">
                            {successMessage}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            Salvar usuário
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserRegisterModal;
