import React from 'react';
import {
    FieldOccurrence,
    FieldOccurrenceStatus,
    FieldOccurrenceType,
    listFieldOccurrences,
} from '../adapters/fieldOccurrencesApi';

interface FieldOccurrencesProps {
    farmId?: string | null;
}

const TYPE_LABEL: Record<FieldOccurrenceType, string> = {
    COCHO: 'Cocho',
    AGUA: 'Água',
    DOENTE: 'Doente',
    AVARIA: 'Avaria',
    NASCEU: 'Nasceu',
    MORREU: 'Morreu',
};

const STATUS_LABEL: Record<FieldOccurrenceStatus, string> = {
    PENDENTE: 'Pendente',
    CONFIRMADO: 'Confirmado',
    CANCELADO: 'Cancelado',
};

const STATUS_CLASS: Record<FieldOccurrenceStatus, string> = {
    PENDENTE: 'bg-[#fff6dc] text-[#8a5f00] border-[#eed99b]',
    CONFIRMADO: 'bg-[var(--eixo-green-soft)] text-[#2f6b2f] border-[#cfe5c4]',
    CANCELADO: 'bg-[#fff2ef] text-[var(--eixo-danger)] border-[#f1d1ca]',
};

const formatDate = (value?: string | null) => {
    if (!value) return 'Data não informada';
    return new Date(value).toLocaleString('pt-BR');
};

const getAnimalLabel = (occurrence: FieldOccurrence) => {
    const animal = occurrence.animal;
    if (!animal) return 'Sem animal';
    return animal.brinco || animal.identificacao || animal.name || animal.nome || 'Animal sem identificação';
};

const FieldOccurrences: React.FC<FieldOccurrencesProps> = ({ farmId = null }) => {
    const [statusFilter, setStatusFilter] = React.useState<FieldOccurrenceStatus | ''>('PENDENTE');
    const [typeFilter, setTypeFilter] = React.useState<FieldOccurrenceType | ''>('');
    const [items, setItems] = React.useState<FieldOccurrence[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const loadOccurrences = React.useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const occurrences = await listFieldOccurrences({
                farmId,
                status: statusFilter,
                type: typeFilter,
                limit: 80,
            });
            setItems(occurrences);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar ocorrências.');
        } finally {
            setIsLoading(false);
        }
    }, [farmId, statusFilter, typeFilter]);

    React.useEffect(() => {
        void loadOccurrences();
    }, [loadOccurrences]);

    return (
        <div>
            <p className="mb-6 text-[var(--eixo-text-muted)]">
                Registros enviados pelo EIXO Campo para análise da base.
            </p>

            <div className="rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--eixo-border)] px-6 py-5">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--eixo-text-muted)]">
                            Ocorrências do EIXO Campo
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-[var(--eixo-text)]">
                            Central de análise do supervisor
                        </h2>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <label className="block">
                            <span className="text-xs font-semibold text-[var(--eixo-text-muted)]">Status</span>
                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value as FieldOccurrenceStatus | '')}
                                className="mt-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-sm text-[var(--eixo-text)] outline-none"
                            >
                                <option value="">Todos</option>
                                <option value="PENDENTE">Pendentes</option>
                                <option value="CONFIRMADO">Confirmadas</option>
                                <option value="CANCELADO">Canceladas</option>
                            </select>
                        </label>

                        <label className="block">
                            <span className="text-xs font-semibold text-[var(--eixo-text-muted)]">Tipo</span>
                            <select
                                value={typeFilter}
                                onChange={(event) => setTypeFilter(event.target.value as FieldOccurrenceType | '')}
                                className="mt-1 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-sm text-[var(--eixo-text)] outline-none"
                            >
                                <option value="">Todos</option>
                                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="button"
                            onClick={() => void loadOccurrences()}
                            className="self-end rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text)]"
                        >
                            Atualizar
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mx-6 mt-5 rounded-2xl border border-[#f1d1ca] bg-[#fff2ef] px-4 py-3 text-sm text-[var(--eixo-danger)]">
                        {error}
                    </div>
                )}

                <div className="p-6">
                    {isLoading ? (
                        <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-5 py-8 text-sm text-[var(--eixo-text-muted)]">
                            Carregando ocorrências...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-5 py-8 text-sm text-[var(--eixo-text-muted)]">
                            Nenhuma ocorrência encontrada para os filtros selecionados.
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-[var(--eixo-border)]">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[var(--eixo-surface-soft)] text-xs font-bold uppercase tracking-[0.12em] text-[var(--eixo-text-muted)]">
                                    <tr>
                                        <th className="px-4 py-3">Ocorrência</th>
                                        <th className="px-4 py-3">Local</th>
                                        <th className="px-4 py-3">Animal</th>
                                        <th className="px-4 py-3">Vaqueiro</th>
                                        <th className="px-4 py-3">Fotos</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((occurrence) => (
                                        <tr key={occurrence.id} className="border-t border-[var(--eixo-border)] align-top">
                                            <td className="px-4 py-4">
                                                <div className="font-semibold text-[var(--eixo-text)]">{TYPE_LABEL[occurrence.type]}</div>
                                                <div className="mt-1 text-xs text-[var(--eixo-text-muted)]">{formatDate(occurrence.occurredAt || occurrence.createdAt)}</div>
                                                {occurrence.description && (
                                                    <div className="mt-2 max-w-xs text-xs leading-5 text-[var(--eixo-text-muted)]">
                                                        {occurrence.description}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-[var(--eixo-text-muted)]">
                                                {occurrence.paddock?.name || 'Sem pasto'}
                                                {occurrence.lat !== null && occurrence.lat !== undefined && occurrence.lng !== null && occurrence.lng !== undefined && (
                                                    <div className="mt-1 text-xs">
                                                        {occurrence.lat.toFixed(5)}, {occurrence.lng.toFixed(5)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-[var(--eixo-text-muted)]">{getAnimalLabel(occurrence)}</td>
                                            <td className="px-4 py-4 text-[var(--eixo-text-muted)]">{occurrence.createdByName || 'Não informado'}</td>
                                            <td className="px-4 py-4 text-[var(--eixo-text-muted)]">{occurrence.attachments.length}</td>
                                            <td className="px-4 py-4">
                                                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_CLASS[occurrence.status]}`}>
                                                    {STATUS_LABEL[occurrence.status]}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FieldOccurrences;
