import React from 'react';
import TeamPermissions, { TeamPermissionsProps } from './TeamPermissions';
import FieldOccurrences from './FieldOccurrences';

interface AppEixoCampoProps extends TeamPermissionsProps {
    farmId: string | null;
    canViewCollaborators: boolean;
    canViewOccurrences: boolean;
    initialOccurrences?: boolean;
}

const AppEixoCampo: React.FC<AppEixoCampoProps> = ({
    farmId, canViewCollaborators, canViewOccurrences, initialOccurrences = false, ...teamProps
}) => {
    const [section, setSection] = React.useState(initialOccurrences ? 'occurrences' : 'team');
    const showTeam = canViewCollaborators && (section === 'team' || !canViewOccurrences);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-brand text-2xl font-extrabold text-[var(--eixo-text)]">APP EIXO CAMPO</h1>
                <p className="mt-2 text-sm text-[var(--eixo-text-muted)]">Gestão do aplicativo e acompanhamento dos registros de campo.</p>
            </div>
            <nav aria-label="Seções do APP EIXO CAMPO" className="flex flex-wrap gap-3">
                {[
                    { id: 'team', label: 'Colaboradores e aparelhos', allowed: canViewCollaborators, active: showTeam },
                    { id: 'occurrences', label: 'Ocorrências', allowed: canViewOccurrences, active: !showTeam },
                ].filter((item) => item.allowed).map((item) => (
                    <button key={item.id} type="button" aria-pressed={item.active} onClick={() => setSection(item.id)}
                        className={`rounded-xl border px-4 py-2 text-sm font-semibold ${item.active ? 'border-[var(--eixo-green)] bg-[var(--eixo-green-soft)] text-[var(--eixo-text)]' : 'border-[var(--eixo-border)] text-[var(--eixo-text-muted)]'}`}>
                        {item.label}
                    </button>
                ))}
            </nav>
            {showTeam ? <TeamPermissions {...teamProps} mode="field" /> : canViewOccurrences ? <FieldOccurrences farmId={farmId} /> : (
                <p className="text-sm text-[var(--eixo-text-muted)]">Você não possui permissão para acessar este módulo.</p>
            )}
        </div>
    );
};

export default AppEixoCampo;
