import React from 'react';
import {
    createFieldCollaborator,
    deleteUser,
    generateAppActivationCode,
    listUsers,
    revokeAppDevice,
    updateFieldCollaborator,
    updateUser,
} from '../adapters/usersApi';
import type {
    AppActivationCodePayload,
    Farm,
    FieldCollaboratorCreatePayload,
    FieldCollaboratorUpdatePayload,
    ManagedUser,
    WebUserUpdatePayload,
} from '../types';

interface TeamPermissionsProps {
    farms: Farm[];
    canManageUsers: boolean;
    currentUserId?: string | null;
    isFreePlan: boolean;
    moduleCategories: {
        title: string;
        modules: string[];
    }[];
    onOpenUserRegister: () => void;
    refreshKey?: number;
}

interface EditSystemUserModalProps {
    isOpen: boolean;
    user: ManagedUser | null;
    farms: Farm[];
    moduleCategories: {
        title: string;
        modules: string[];
    }[];
    error?: string | null;
    onClose: () => void;
    onSubmit: (userId: string, payload: WebUserUpdatePayload) => void;
}

interface DeleteUserModalProps {
    isOpen: boolean;
    user: ManagedUser | null;
    error?: string | null;
    onClose: () => void;
    onConfirm: (userId: string) => void;
}

interface EditFieldCollaboratorModalProps {
    isOpen: boolean;
    user: ManagedUser | null;
    farms: Farm[];
    error?: string | null;
    onClose: () => void;
    onSubmit: (userId: string, payload: FieldCollaboratorUpdatePayload) => void;
}

const DesktopIcon: React.FC = () => (
    <svg className="h-4 w-4 text-[var(--eixo-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="12" rx="2" strokeWidth="1.8" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 20h8M10 16v4M14 16v4" />
    </svg>
);

const SmartphoneIcon: React.FC = () => (
    <svg className="h-4 w-4 text-[var(--eixo-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="7" y="2.5" width="10" height="19" rx="2" strokeWidth="1.8" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10 5.5h4" />
        <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
    </svg>
);

const EditIcon: React.FC = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 20h4l10-10-4-4L4 16v4z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13 7l4 4" />
    </svg>
);

const TrashIcon: React.FC = () => (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2M7 7l1 12h8l1-12" />
    </svg>
);

interface FieldCollaboratorModalProps {
    isOpen: boolean;
    farms: Farm[];
    error?: string | null;
    onClose: () => void;
    onSubmit: (payload: FieldCollaboratorCreatePayload) => void;
}

const FieldCollaboratorModal: React.FC<FieldCollaboratorModalProps> = ({
    isOpen,
    farms,
    error,
    onClose,
    onSubmit,
}) => {
    const [name, setName] = React.useState('');
    const [fieldProfile, setFieldProfile] = React.useState<'VAQUEIRO' | 'ADMIN_CAMPO'>('VAQUEIRO');
    const [defaultFarmId, setDefaultFarmId] = React.useState('');
    const [farmError, setFarmError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) {
            setName('');
            setFieldProfile('VAQUEIRO');
            setDefaultFarmId('');
            setFarmError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const inputClass =
        'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-5">
                    <div>
                        <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            App do Manejo
                        </div>
                        <h3 className="font-brand text-xl font-extrabold text-[var(--eixo-text)]">Novo colaborador de campo</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form
                    className="space-y-4 px-6 py-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!defaultFarmId) {
                            setFarmError('Selecione a fazenda do colaborador.');
                            return;
                        }
                        setFarmError(null);
                        onSubmit({ name, fieldProfile, defaultFarmId });
                    }}
                >
                    <div>
                        <label htmlFor="field-collaborator-name" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Nome do colaborador
                        </label>
                        <input
                            id="field-collaborator-name"
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className={inputClass}
                            placeholder="João do curral"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="field-collaborator-profile" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Perfil
                        </label>
                        <select
                            id="field-collaborator-profile"
                            value={fieldProfile}
                            onChange={(event) => setFieldProfile(event.target.value === 'ADMIN_CAMPO' ? 'ADMIN_CAMPO' : 'VAQUEIRO')}
                            className={inputClass}
                        >
                            <option value="VAQUEIRO">Vaqueiro</option>
                            <option value="ADMIN_CAMPO">Admin de Campo</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="field-collaborator-farm" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Fazenda
                        </label>
                        <select
                            id="field-collaborator-farm"
                            value={defaultFarmId}
                            onChange={(event) => {
                                setDefaultFarmId(event.target.value);
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
                        {farmError && <p className="mt-2 text-xs font-medium text-[var(--eixo-danger)]">{farmError}</p>}
                    </div>

                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-sm text-[var(--eixo-text-muted)]">
                        Esse colaborador entra somente por código de ativação. O sistema cria o identificador interno automaticamente.
                    </div>

                    {error && (
                        <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                            {error}
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
                            Salvar colaborador
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditFieldCollaboratorModal: React.FC<EditFieldCollaboratorModalProps> = ({
    isOpen,
    user,
    farms,
    error,
    onClose,
    onSubmit,
}) => {
    const [name, setName] = React.useState('');
    const [fieldProfile, setFieldProfile] = React.useState<'VAQUEIRO' | 'ADMIN_CAMPO'>('VAQUEIRO');
    const [defaultFarmId, setDefaultFarmId] = React.useState('');
    const [farmError, setFarmError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen || !user) {
            setName('');
            setFieldProfile('VAQUEIRO');
            setDefaultFarmId('');
            setFarmError(null);
            return;
        }
        setName(user.name || '');
        setFieldProfile(user.fieldProfile === 'ADMIN_CAMPO' ? 'ADMIN_CAMPO' : 'VAQUEIRO');
        setDefaultFarmId(user.defaultFarmId || user.lastFarmId || '');
        setFarmError(null);
    }, [isOpen, user]);

    if (!isOpen || !user) return null;

    const inputClass =
        'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-5">
                    <div>
                        <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            App do Manejo
                        </div>
                        <h3 className="font-brand text-xl font-extrabold text-[var(--eixo-text)]">Editar colaborador</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form
                    className="space-y-4 px-6 py-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!defaultFarmId) {
                            setFarmError('Selecione a fazenda do colaborador.');
                            return;
                        }
                        setFarmError(null);
                        onSubmit(user.id, { name, fieldProfile, defaultFarmId });
                    }}
                >
                    <div>
                        <label htmlFor="edit-field-collaborator-name" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Nome do colaborador
                        </label>
                        <input
                            id="edit-field-collaborator-name"
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="edit-field-collaborator-profile" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Perfil
                        </label>
                        <select
                            id="edit-field-collaborator-profile"
                            value={fieldProfile}
                            onChange={(event) => setFieldProfile(event.target.value === 'ADMIN_CAMPO' ? 'ADMIN_CAMPO' : 'VAQUEIRO')}
                            className={inputClass}
                        >
                            <option value="VAQUEIRO">Vaqueiro</option>
                            <option value="ADMIN_CAMPO">Admin de Campo</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="edit-field-collaborator-farm" className="block text-sm font-medium text-[var(--eixo-text-muted)]">
                            Fazenda
                        </label>
                        <select
                            id="edit-field-collaborator-farm"
                            value={defaultFarmId}
                            onChange={(event) => {
                                setDefaultFarmId(event.target.value);
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
                        {farmError && <p className="mt-2 text-xs font-medium text-[var(--eixo-danger)]">{farmError}</p>}
                    </div>

                    {error && (
                        <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                            {error}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose} className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]">
                            Cancelar
                        </button>
                        <button type="submit" className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]">
                            Salvar alterações
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditSystemUserModal: React.FC<EditSystemUserModalProps> = ({
    isOpen,
    user,
    farms,
    moduleCategories,
    error,
    onClose,
    onSubmit,
}) => {
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [defaultFarmId, setDefaultFarmId] = React.useState('');
    const [selectedModules, setSelectedModules] = React.useState<string[]>([]);
    const [farmError, setFarmError] = React.useState<string | null>(null);
    const [modulesError, setModulesError] = React.useState<string | null>(null);

    const allModules = React.useMemo(
        () => moduleCategories.flatMap((category) => category.modules),
        [moduleCategories],
    );

    React.useEffect(() => {
        if (!isOpen || !user) {
            setName('');
            setEmail('');
            setDefaultFarmId('');
            setSelectedModules(allModules);
            setFarmError(null);
            setModulesError(null);
            return;
        }
        setName(user.name || '');
        setEmail(user.email || '');
        setDefaultFarmId(user.defaultFarmId || user.lastFarmId || '');
        const filteredModules = user.modules.filter((module) => allModules.includes(module));
        setSelectedModules(filteredModules.length ? filteredModules : allModules);
        setFarmError(null);
        setModulesError(null);
    }, [isOpen, user, allModules]);

    if (!isOpen || !user) return null;

    const inputClass =
        'mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2.5 text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:border-[var(--eixo-green)] focus:outline-none';

    const toggleModule = (module: string) => {
        setSelectedModules((prev) =>
            prev.includes(module) ? prev.filter((item) => item !== module) : [...prev, module],
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-5">
                    <div>
                        <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                            Sistema web
                        </div>
                        <h3 className="font-brand text-xl font-extrabold text-[var(--eixo-text)]">Editar usuário</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form
                    className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!defaultFarmId) {
                            setFarmError('Selecione a fazenda padrão do usuário.');
                            return;
                        }
                        if (selectedModules.length === 0) {
                            setModulesError('Selecione pelo menos um módulo.');
                            return;
                        }
                        setFarmError(null);
                        setModulesError(null);
                        onSubmit(user.id, {
                            name,
                            email,
                            modules: selectedModules,
                            defaultFarmId,
                        });
                    }}
                >
                    <div>
                        <label htmlFor="edit-user-name" className="block text-sm font-medium text-[var(--eixo-text-muted)]">Nome completo</label>
                        <input id="edit-user-name" type="text" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required />
                    </div>

                    <div>
                        <label htmlFor="edit-user-email" className="block text-sm font-medium text-[var(--eixo-text-muted)]">E-mail</label>
                        <input id="edit-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} required />
                    </div>

                    <div>
                        <label htmlFor="edit-user-farm" className="block text-sm font-medium text-[var(--eixo-text-muted)]">Fazenda padrão</label>
                        <select
                            id="edit-user-farm"
                            value={defaultFarmId}
                            onChange={(event) => {
                                setDefaultFarmId(event.target.value);
                                setFarmError(null);
                            }}
                            className={inputClass}
                            required
                        >
                            <option value="">Selecione a fazenda</option>
                            {farms.map((farm) => (
                                <option key={farm.id} value={farm.id}>{farm.name}</option>
                            ))}
                        </select>
                        {farmError && <p className="mt-2 text-xs font-medium text-[var(--eixo-danger)]">{farmError}</p>}
                    </div>

                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-4">
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">Módulos liberados</p>
                        <div className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
                            {moduleCategories.map((category) => (
                                <div key={category.title}>
                                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b0a08a]">{category.title}</p>
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
                        {modulesError && <p className="mt-3 text-xs font-medium text-[var(--eixo-danger)]">{modulesError}</p>}
                    </div>

                    {error && (
                        <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                            {error}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose} className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]">
                            Cancelar
                        </button>
                        <button type="submit" className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]">
                            Salvar alterações
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
    isOpen,
    user,
    error,
    onClose,
    onConfirm,
}) => {
    if (!isOpen || !user) return null;

    const isFieldAccess = user.accessType !== 'WEB';
    const accessLabel = isFieldAccess ? 'colaborador' : 'usuário';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
                <div className="border-b border-[var(--eixo-border)] px-6 py-5">
                    <h3 className="font-brand text-xl font-extrabold text-[var(--eixo-text)]">Remover acesso</h3>
                    <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                        Deseja remover o acesso de <span className="font-semibold text-[var(--eixo-text)]">{user.name}</span>?
                    </p>
                </div>

                <div className="space-y-4 px-6 py-5">
                    <div className="rounded-2xl border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                        Essa ação exclui esse {accessLabel} da organização atual.
                    </div>

                    {error && (
                        <div className="rounded-xl border border-[#efc2ba] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                            {error}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3">
                        <button type="button" onClick={onClose} className="rounded-xl border border-[var(--eixo-border)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => onConfirm(user.id)}
                            className="rounded-xl bg-[var(--eixo-danger)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a4130]"
                        >
                            Excluir {accessLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface ActivationCodeModalProps {
    payload: AppActivationCodePayload | null;
    onClose: () => void;
}

const ActivationCodeModal: React.FC<ActivationCodeModalProps> = ({ payload, onClose }) => {
    if (!payload) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl">
                <div className="border-b border-[var(--eixo-border)] px-6 py-5">
                    <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                        App do Manejo
                    </div>
                    <h3 className="font-brand text-xl font-extrabold text-[var(--eixo-text)]">Código de ativação</h3>
                    <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Copie agora. Esse código não será exibido novamente.</p>
                </div>

                <div className="space-y-4 px-6 py-5">
                    <div className="rounded-2xl border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-4 py-4 text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">Código</p>
                        <p className="mt-2 font-mono text-2xl font-bold tracking-[0.18em] text-[var(--eixo-text)]">{payload.code}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-sm text-[var(--eixo-text-muted)]">
                        Válido até {new Date(payload.expiresAt).toLocaleString('pt-BR')}.
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-[var(--eixo-green)] px-5 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TeamPermissions: React.FC<TeamPermissionsProps> = ({
    farms,
    canManageUsers,
    currentUserId,
    isFreePlan,
    moduleCategories,
    onOpenUserRegister,
    refreshKey = 0,
}) => {
    const [users, setUsers] = React.useState<ManagedUser[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [isFieldModalOpen, setIsFieldModalOpen] = React.useState(false);
    const [fieldError, setFieldError] = React.useState<string | null>(null);
    const [fieldActionError, setFieldActionError] = React.useState<string | null>(null);
    const [webActionError, setWebActionError] = React.useState<string | null>(null);
    const [codeModalPayload, setCodeModalPayload] = React.useState<AppActivationCodePayload | null>(null);
    const [pendingUserId, setPendingUserId] = React.useState<string | null>(null);
    const [editingUser, setEditingUser] = React.useState<ManagedUser | null>(null);
    const [deletingUser, setDeletingUser] = React.useState<ManagedUser | null>(null);
    const [editingFieldUser, setEditingFieldUser] = React.useState<ManagedUser | null>(null);
    const [deletingFieldUser, setDeletingFieldUser] = React.useState<ManagedUser | null>(null);

    const farmNameById = React.useMemo(() => new Map(farms.map((farm) => [farm.id, farm.name])), [farms]);

    const loadUsers = React.useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const nextUsers = await listUsers();
            setUsers(nextUsers);
        } catch (loadError) {
            console.error(loadError);
            setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar usuários.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void loadUsers();
    }, [loadUsers, refreshKey]);

    const webUsers = React.useMemo(
        () => users.filter((user) => user.accessType !== 'APP_MANEJO'),
        [users],
    );
    const fieldUsers = React.useMemo(
        () => users.filter((user) => user.accessType !== 'WEB'),
        [users],
    );

    const getProfileLabel = (user: ManagedUser) => {
        if (user.fieldProfile === 'VAQUEIRO') return 'Vaqueiro';
        if (user.fieldProfile === 'ADMIN_CAMPO') return 'Admin de Campo';
        return 'Usuário web';
    };

    const getFarmLabel = (user: ManagedUser) => {
        if (!user.defaultFarmId) return 'Não definido';
        return farmNameById.get(user.defaultFarmId) || 'Fazenda vinculada';
    };

    const getStatusLabel = (user: ManagedUser) => {
        switch (user.appActivationStatus) {
            case 'ATIVO':
                return 'Ativo';
            case 'CODIGO_EXPIRADO':
                return 'Código expirado';
            case 'BLOQUEADO':
                return 'Bloqueado';
            case 'APARELHO_REVOGADO':
                return 'Aparelho revogado';
            case 'PENDENTE_ATIVACAO':
                return 'Pendente de ativação';
            default:
                return 'Sem app';
        }
    };

    const getStatusClasses = (user: ManagedUser) => {
        switch (user.appActivationStatus) {
            case 'ATIVO':
                return 'bg-[var(--eixo-green-soft)] text-[#2f6b2f]';
            case 'CODIGO_EXPIRADO':
                return 'bg-[#fff2ef] text-[var(--eixo-danger)]';
            case 'BLOQUEADO':
            case 'APARELHO_REVOGADO':
                return 'bg-[var(--eixo-text)] text-white';
            case 'PENDENTE_ATIVACAO':
                return 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text)]';
            default:
                return 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]';
        }
    };

    const getCodeLabel = (user: ManagedUser) => {
        if (!user.activeAppCode?.expiresAt) return 'Ainda não gerado';
        return `Até ${new Date(user.activeAppCode.expiresAt).toLocaleString('pt-BR')}`;
    };

    const getDeviceLabel = (user: ManagedUser) => {
        if (!user.activeAppDevice) return 'Nenhum aparelho ativo';
        const label = user.activeAppDevice.deviceLabel || 'Aparelho vinculado';
        return user.activeAppDevice.platform ? `${label} (${user.activeAppDevice.platform})` : label;
    };

    const handleCreateFieldCollaborator = async (payload: FieldCollaboratorCreatePayload) => {
        setFieldError(null);
        try {
            await createFieldCollaborator(payload);
            setIsFieldModalOpen(false);
            await loadUsers();
        } catch (createError) {
            console.error(createError);
            setFieldError(createError instanceof Error ? createError.message : 'Erro ao salvar colaborador.');
        }
    };

    const handleGenerateCode = async (userId: string) => {
        setPendingUserId(userId);
        setFieldActionError(null);
        try {
            const payload = await generateAppActivationCode(userId);
            setCodeModalPayload(payload);
            await loadUsers();
        } catch (actionError) {
            console.error(actionError);
            setFieldActionError(actionError instanceof Error ? actionError.message : 'Erro ao gerar código.');
        } finally {
            setPendingUserId(null);
        }
    };

    const handleRevokeDevice = async (userId: string) => {
        setPendingUserId(userId);
        setFieldActionError(null);
        try {
            await revokeAppDevice(userId);
            await loadUsers();
        } catch (actionError) {
            console.error(actionError);
            setFieldActionError(actionError instanceof Error ? actionError.message : 'Erro ao revogar aparelho.');
        } finally {
            setPendingUserId(null);
        }
    };

    const handleUpdateFieldCollaborator = async (userId: string, payload: FieldCollaboratorUpdatePayload) => {
        setPendingUserId(userId);
        setFieldActionError(null);
        try {
            await updateFieldCollaborator(userId, payload);
            setEditingFieldUser(null);
            await loadUsers();
        } catch (actionError) {
            console.error(actionError);
            setFieldActionError(actionError instanceof Error ? actionError.message : 'Erro ao atualizar colaborador.');
        } finally {
            setPendingUserId(null);
        }
    };

    const handleDeleteFieldCollaborator = async (userId: string) => {
        setPendingUserId(userId);
        setFieldActionError(null);
        try {
            await deleteUser(userId);
            setDeletingFieldUser(null);
            await loadUsers();
        } catch (actionError) {
            console.error(actionError);
            setFieldActionError(actionError instanceof Error ? actionError.message : 'Erro ao excluir colaborador.');
        } finally {
            setPendingUserId(null);
        }
    };

    const handleUpdateSystemUser = async (userId: string, payload: WebUserUpdatePayload) => {
        setPendingUserId(userId);
        setWebActionError(null);
        try {
            await updateUser(userId, payload);
            setEditingUser(null);
            await loadUsers();
        } catch (actionError) {
            console.error(actionError);
            setWebActionError(actionError instanceof Error ? actionError.message : 'Erro ao atualizar usuário.');
        } finally {
            setPendingUserId(null);
        }
    };

    const handleDeleteSystemUser = async (userId: string) => {
        setPendingUserId(userId);
        setWebActionError(null);
        try {
            await deleteUser(userId);
            setDeletingUser(null);
            await loadUsers();
        } catch (actionError) {
            console.error(actionError);
            setWebActionError(actionError instanceof Error ? actionError.message : 'Erro ao excluir usuário.');
        } finally {
            setPendingUserId(null);
        }
    };

    return (
        <>
            <div className="space-y-6">
                <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--eixo-green)]" />
                                Estrutura da Fazenda
                            </div>
                            <h1 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Usuários e Permissões</h1>
                            <p className="mt-1 text-sm leading-relaxed text-[var(--eixo-text-muted)]">
                                Separe o acesso do sistema web do acesso operacional no App do Manejo.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                        <div className="flex items-center gap-2">
                            <DesktopIcon />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">Acesso ao Sistema</p>
                        </div>
                        <p className="mt-2 text-3xl font-extrabold text-[var(--eixo-text)]">{webUsers.length}</p>
                        <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Acessos com e-mail, senha e módulos do sistema.</p>
                    </div>
                    <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                        <div className="flex items-center gap-2">
                            <SmartphoneIcon />
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">App do Manejo</p>
                        </div>
                        <p className="mt-2 text-3xl font-extrabold text-[var(--eixo-text)]">{fieldUsers.length}</p>
                        <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Acessos operacionais por código no celular.</p>
                    </div>
                    <div className="rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">Aparelhos ativos</p>
                        <p className="mt-2 text-3xl font-extrabold text-[var(--eixo-text)]">
                            {fieldUsers.filter((user) => Boolean(user.activeAppDevice)).length}
                        </p>
                        <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Um aparelho por colaborador de campo.</p>
                    </div>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-6 py-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <DesktopIcon />
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Acesso ao Sistema</p>
                            </div>
                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Cadastro com nome, e-mail, senha, módulos e fazenda padrão.</p>
                        </div>
                        {canManageUsers && (
                            <button
                                type="button"
                                onClick={onOpenUserRegister}
                                className="inline-flex items-center rounded-2xl border border-[var(--eixo-green)] bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                            >
                                <span className="mr-2 text-base leading-none">+</span>
                                Novo usuário
                            </button>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="px-6 py-10 text-sm text-[var(--eixo-text-muted)]">Carregando usuários...</div>
                    ) : error ? (
                        <div className="px-6 py-10 text-sm text-[var(--eixo-danger)]">{error}</div>
                    ) : webUsers.length === 0 ? (
                        <div className="px-6 py-10 text-sm text-[var(--eixo-text-muted)]">Nenhum acesso ao sistema cadastrado.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-[var(--eixo-text-muted)]">
                                <thead className="bg-[var(--eixo-surface)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                                    <tr>
                                        <th className="px-6 py-3">Usuário</th>
                                        <th className="px-6 py-3">Fazenda padrão</th>
                                        <th className="px-6 py-3">Módulos</th>
                                        <th className="px-6 py-3">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {webUsers.map((user) => (
                                        <tr key={user.id} className="border-b border-[var(--eixo-border)] align-top last:border-b-0">
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-[var(--eixo-text)]">{user.name}</div>
                                                <div className="mt-1 text-xs text-[var(--eixo-text-muted)]">{user.email}</div>
                                            </td>
                                            <td className="px-6 py-4 text-[var(--eixo-text)]">{getFarmLabel(user)}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    {user.modules.map((module) => (
                                                        <span
                                                            key={`${user.id}-${module}`}
                                                            className="rounded-full border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-1 text-xs font-medium text-[var(--eixo-text-muted)]"
                                                        >
                                                            {module}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setWebActionError(null);
                                                            setEditingUser(user);
                                                        }}
                                                        disabled={pendingUserId === user.id}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--eixo-border)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <EditIcon />
                                                        Editar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setWebActionError(null);
                                                            if (user.id === currentUserId) {
                                                                setWebActionError('Você não pode excluir o seu próprio acesso.');
                                                                return;
                                                            }
                                                            setDeletingUser(user);
                                                        }}
                                                        disabled={pendingUserId === user.id || user.id === currentUserId}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-[#d9ead0] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[var(--eixo-green-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <TrashIcon />
                                                        Excluir
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {webActionError && (
                        <div className="border-t border-[var(--eixo-border)] px-6 py-4 text-sm text-[var(--eixo-danger)]">
                            {webActionError}
                        </div>
                    )}
                </div>

                <div className="overflow-hidden rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-6 py-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <SmartphoneIcon />
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">App do Manejo</p>
                            </div>
                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Colaboradores entram só com código e ficam presos a um aparelho por vez.</p>
                        </div>
                        {!isFreePlan && canManageUsers && (
                            <button
                                type="button"
                                onClick={() => {
                                    setFieldError(null);
                                    setIsFieldModalOpen(true);
                                }}
                                className="inline-flex items-center rounded-2xl border border-[var(--eixo-green)] bg-[var(--eixo-green)] px-4 py-2.5 text-sm font-semibold text-[#1a1a1a] transition-colors duration-200 hover:bg-[var(--eixo-green-dark)]"
                            >
                                <span className="mr-2 text-base leading-none">+</span>
                                Adicionar colaborador
                            </button>
                        )}
                    </div>

                    {isFreePlan ? (
                        <div className="px-6 py-10">
                            <div className="rounded-2xl border border-dashed border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-5 py-5">
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">App do Manejo disponível apenas nos planos pagos</p>
                                <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">
                                    Faça upgrade para cadastrar vaqueiros e admins de campo, gerar códigos de ativação e controlar o aparelho vinculado.
                                </p>
                            </div>
                        </div>
                    ) : isLoading ? (
                        <div className="px-6 py-10 text-sm text-[var(--eixo-text-muted)]">Carregando colaboradores...</div>
                    ) : fieldUsers.length === 0 ? (
                        <div className="px-6 py-10 text-sm text-[var(--eixo-text-muted)]">Nenhum colaborador de campo cadastrado.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-[var(--eixo-text-muted)]">
                                <thead className="bg-[var(--eixo-surface)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                                    <tr>
                                        <th className="px-6 py-3">Colaborador</th>
                                        <th className="px-6 py-3">Perfil</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3">Fazenda</th>
                                        <th className="px-6 py-3">Código</th>
                                        <th className="px-6 py-3">Aparelho</th>
                                        <th className="px-6 py-3">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fieldUsers.map((user) => (
                                        <tr key={user.id} className="border-b border-[var(--eixo-border)] align-top last:border-b-0">
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-[var(--eixo-text)]">{user.name}</div>
                                                <div className="mt-1 text-xs text-[var(--eixo-text-muted)]">Identificador interno do app</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex rounded-full bg-[var(--eixo-green-soft)] px-3 py-1 text-xs font-semibold text-[var(--eixo-graphite)]">
                                                    {getProfileLabel(user)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(user)}`}>
                                                    {getStatusLabel(user)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-[var(--eixo-text)]">{getFarmLabel(user)}</td>
                                            <td className="px-6 py-4 text-[var(--eixo-text)]">{getCodeLabel(user)}</td>
                                            <td className="px-6 py-4 text-[var(--eixo-text)]">{getDeviceLabel(user)}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleGenerateCode(user.id)}
                                                        disabled={pendingUserId === user.id}
                                                        className="rounded-xl border border-[var(--eixo-green)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-green)] transition-colors hover:bg-[var(--eixo-green-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {user.activeAppCode?.expiresAt ? 'Gerar novo código' : 'Gerar código'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRevokeDevice(user.id)}
                                                        disabled={!user.activeAppDevice || pendingUserId === user.id}
                                                        className="rounded-xl border border-[var(--eixo-border)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        Revogar aparelho
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFieldActionError(null);
                                                            setEditingFieldUser(user);
                                                        }}
                                                        disabled={pendingUserId === user.id}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--eixo-border)] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-text)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        <EditIcon />
                                                        Editar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFieldActionError(null);
                                                            setDeletingFieldUser(user);
                                                        }}
                                                        disabled={pendingUserId === user.id}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-[#d9ead0] px-3 py-1.5 text-xs font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[var(--eixo-green-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <TrashIcon />
                                                        Excluir
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {fieldActionError && !isFreePlan && (
                        <div className="border-t border-[var(--eixo-border)] px-6 py-4 text-sm text-[var(--eixo-danger)]">
                            {fieldActionError}
                        </div>
                    )}
                </div>
            </div>

            <FieldCollaboratorModal
                isOpen={isFieldModalOpen}
                farms={farms}
                error={fieldError}
                onClose={() => {
                    setIsFieldModalOpen(false);
                    setFieldError(null);
                }}
                onSubmit={handleCreateFieldCollaborator}
            />

            <ActivationCodeModal
                payload={codeModalPayload}
                onClose={() => setCodeModalPayload(null)}
            />
            <EditFieldCollaboratorModal
                isOpen={Boolean(editingFieldUser)}
                user={editingFieldUser}
                farms={farms}
                error={fieldActionError}
                onClose={() => {
                    setEditingFieldUser(null);
                    setFieldActionError(null);
                }}
                onSubmit={handleUpdateFieldCollaborator}
            />
            <DeleteUserModal
                isOpen={Boolean(deletingFieldUser)}
                user={deletingFieldUser}
                error={fieldActionError}
                onClose={() => {
                    setDeletingFieldUser(null);
                    setFieldActionError(null);
                }}
                onConfirm={handleDeleteFieldCollaborator}
            />
            <EditSystemUserModal
                isOpen={Boolean(editingUser)}
                user={editingUser}
                farms={farms}
                moduleCategories={moduleCategories}
                error={webActionError}
                onClose={() => {
                    setEditingUser(null);
                    setWebActionError(null);
                }}
                onSubmit={handleUpdateSystemUser}
            />
            <DeleteUserModal
                isOpen={Boolean(deletingUser)}
                user={deletingUser}
                error={webActionError}
                onClose={() => {
                    setDeletingUser(null);
                    setWebActionError(null);
                }}
                onConfirm={handleDeleteSystemUser}
            />
        </>
    );
};

export default TeamPermissions;
