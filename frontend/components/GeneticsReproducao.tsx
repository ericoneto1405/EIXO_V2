import React, { useEffect, useMemo, useState } from 'react';
import { Animal, AnimalSexo } from '../types';
import { buildApiUrl } from '../api';

type ReproMode = 'CONTINUO' | 'ESTACAO';

interface BreedingSeason {
    id: string;
    name: string;
    startAt: string;
    endAt: string;
}

interface Exposure {
    animalId: string;
    animal: Animal;
}

interface ReproKpis {
    iepDays: number | null;
    openDays: number | null;
    pregRate: number | null;
    emptyAlerts: {
        isEmpty: boolean;
        isRepeatEmpty: boolean;
    };
    lastCalvingDate: string | null;
    lastPregCheck: string | null;
}

interface GeneticsReproducaoProps {
    farmId?: string | null;
}

const GeneticsReproducao: React.FC<GeneticsReproducaoProps> = ({ farmId }) => {
    const [reproMode, setReproMode] = useState<ReproMode>('CONTINUO');
    const [modeError, setModeError] = useState<string | null>(null);
    const [isSavingMode, setIsSavingMode] = useState(false);
    const [seasons, setSeasons] = useState<BreedingSeason[]>([]);
    const [seasonError, setSeasonError] = useState<string | null>(null);
    const [seasonForm, setSeasonForm] = useState({ name: '', startAt: '', endAt: '' });
    const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
    const [animals, setAnimals] = useState<Animal[]>([]);
    const [exposures, setExposures] = useState<Exposure[]>([]);
    const [selectedExposureIds, setSelectedExposureIds] = useState<Set<string>>(new Set());
    const [exposureMessage, setExposureMessage] = useState<string | null>(null);
    const [exposureError, setExposureError] = useState<string | null>(null);
    const [eventForm, setEventForm] = useState({
        animalId: '',
        type: 'COBERTURA',
        date: '',
        status: 'PRENHE',
        notes: '',
    });
    const [eventError, setEventError] = useState<string | null>(null);
    const [isSavingEvent, setIsSavingEvent] = useState(false);
    const [kpis, setKpis] = useState<ReproKpis | null>(null);
    const [kpiError, setKpiError] = useState<string | null>(null);

    const femaleAnimals = useMemo(
        () => animals.filter((animal) => animal.sexo === AnimalSexo.FEMEA),
        [animals],
    );

    const selectedAnimal = useMemo(
        () => femaleAnimals.find((animal) => animal.id === eventForm.animalId) || null,
        [femaleAnimals, eventForm.animalId],
    );

    const loadFarmMode = async () => {
        if (!farmId) {
            return;
        }
        try {
            const response = await fetch(buildApiUrl('/farms'), { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            const farm = payload?.farms?.find((item: { id: string; reproMode?: ReproMode }) => item.id === farmId);
            if (farm?.reproMode) {
                setReproMode(farm.reproMode);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const loadAnimals = async () => {
        if (!farmId) {
            setAnimals([]);
            return;
        }
        try {
            const response = await fetch(buildApiUrl(`/animals?farmId=${farmId}`), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setAnimals([]);
                return;
            }
            setAnimals(payload.animals || []);
        } catch (error) {
            console.error(error);
            setAnimals([]);
        }
    };

    const loadSeasons = async () => {
        if (!farmId) {
            setSeasons([]);
            return;
        }
        try {
            const response = await fetch(buildApiUrl(`/seasons?farmId=${farmId}`), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSeasons([]);
                return;
            }
            const loadedSeasons = payload.seasons || [];
            setSeasons(loadedSeasons);
            if (loadedSeasons.length && !loadedSeasons.some((season: BreedingSeason) => season.id === selectedSeasonId)) {
                setSelectedSeasonId(loadedSeasons[0].id);
            }
            if (!loadedSeasons.length) {
                setSelectedSeasonId(null);
            }
        } catch (error) {
            console.error(error);
            setSeasons([]);
        }
    };

    const loadExposures = async (seasonId: string | null) => {
        if (!seasonId) {
            setExposures([]);
            setSelectedExposureIds(new Set());
            return;
        }
        try {
            const response = await fetch(buildApiUrl(`/seasons/${seasonId}/exposures`), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setExposures([]);
                setSelectedExposureIds(new Set());
                return;
            }
            const loadedExposures = payload.exposures || [];
            setExposures(loadedExposures);
            setSelectedExposureIds(new Set(loadedExposures.map((exp: Exposure) => exp.animalId)));
        } catch (error) {
            console.error(error);
            setExposures([]);
            setSelectedExposureIds(new Set());
        }
    };

    const loadKpis = async () => {
        if (!eventForm.animalId) {
            setKpis(null);
            return;
        }
        setKpiError(null);
        try {
            const query = reproMode === 'ESTACAO' && selectedSeasonId
                ? `?seasonId=${selectedSeasonId}`
                : '';
            const response = await fetch(buildApiUrl(`/animals/${eventForm.animalId}/repro-kpis${query}`), {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setKpis(null);
                setKpiError(payload?.message || 'Não foi possível carregar KPIs.');
                return;
            }
            setKpis(payload.kpis || null);
        } catch (error) {
            console.error(error);
            setKpis(null);
            setKpiError('Não foi possível carregar KPIs.');
        }
    };

    useEffect(() => {
        loadFarmMode();
        loadAnimals();
        loadSeasons();
    }, [farmId]);

    useEffect(() => {
        if (reproMode === 'ESTACAO') {
            loadSeasons();
        } else {
            setSelectedSeasonId(null);
            setSeasons([]);
            setExposures([]);
            setSelectedExposureIds(new Set());
        }
    }, [reproMode]);

    useEffect(() => {
        if (reproMode === 'ESTACAO') {
            loadExposures(selectedSeasonId);
        }
    }, [selectedSeasonId, reproMode]);

    useEffect(() => {
        if (eventForm.animalId) {
            loadKpis();
        }
    }, [eventForm.animalId, reproMode, selectedSeasonId]);

    const handleModeChange = async (mode: ReproMode) => {
        if (!farmId || mode === reproMode) {
            return;
        }
        setModeError(null);
        setIsSavingMode(true);
        try {
            const response = await fetch(buildApiUrl(`/farms/${farmId}/repro-mode`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ reproMode: mode }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setModeError(payload?.message || 'Não foi possível atualizar o modo.');
                return;
            }
            setReproMode(mode);
        } catch (error) {
            console.error(error);
            setModeError('Não foi possível atualizar o modo.');
        } finally {
            setIsSavingMode(false);
        }
    };

    const handleSeasonFormChange = (field: keyof typeof seasonForm, value: string) => {
        setSeasonForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleCreateSeason = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) {
            return;
        }
        if (!seasonForm.name.trim() || !seasonForm.startAt || !seasonForm.endAt) {
            setSeasonError('Informe nome e datas da estação.');
            return;
        }
        setSeasonError(null);
        try {
            const response = await fetch(buildApiUrl('/seasons'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    farmId,
                    name: seasonForm.name.trim(),
                    startAt: seasonForm.startAt,
                    endAt: seasonForm.endAt,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSeasonError(payload?.message || 'Não foi possível criar a estação.');
                return;
            }
            setSeasonForm({ name: '', startAt: '', endAt: '' });
            await loadSeasons();
        } catch (error) {
            console.error(error);
            setSeasonError('Não foi possível criar a estação.');
        }
    };

    const handleToggleExposure = (animalId: string) => {
        setSelectedExposureIds((prev) => {
            const next = new Set(prev);
            if (next.has(animalId)) {
                next.delete(animalId);
            } else {
                next.add(animalId);
            }
            return next;
        });
    };

    const handleSaveExposures = async () => {
        if (!selectedSeasonId) {
            return;
        }
        setExposureError(null);
        setExposureMessage(null);
        const currentIds = new Set(exposures.map((exp) => exp.animalId));
        const desiredIds = selectedExposureIds;
        const toAdd = Array.from(desiredIds).filter((id) => !currentIds.has(id));
        const toRemove = Array.from(currentIds).filter((id) => !desiredIds.has(id));

        try {
            if (toAdd.length) {
                const response = await fetch(buildApiUrl(`/seasons/${selectedSeasonId}/exposures`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ animalIds: toAdd }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    setExposureError(payload?.message || 'Não foi possível salvar expostas.');
                    return;
                }
            }
            for (const animalId of toRemove) {
                await fetch(buildApiUrl(`/seasons/${selectedSeasonId}/exposures/${animalId}`), {
                    method: 'DELETE',
                    credentials: 'include',
                });
            }
            await loadExposures(selectedSeasonId);
            setExposureMessage('Expostas atualizadas com sucesso.');
        } catch (error) {
            console.error(error);
            setExposureError('Não foi possível salvar expostas.');
        }
    };

    const handleEventFormChange = (field: keyof typeof eventForm, value: string) => {
        setEventForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleCreateEvent = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) {
            return;
        }
        if (!eventForm.animalId || !eventForm.type || !eventForm.date) {
            setEventError('Informe fêmea, tipo e data.');
            return;
        }
        if (eventForm.type === 'DIAGNOSTICO_PRENHEZ' && !eventForm.status) {
            setEventError('Informe o status do diagnóstico.');
            return;
        }
        setEventError(null);
        setIsSavingEvent(true);
        try {
            const response = await fetch(buildApiUrl('/repro-events'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    farmId,
                    animalId: eventForm.animalId,
                    type: eventForm.type,
                    date: eventForm.date,
                    seasonId: reproMode === 'ESTACAO' ? selectedSeasonId : null,
                    payload: eventForm.type === 'DIAGNOSTICO_PRENHEZ' ? { status: eventForm.status } : null,
                    notes: eventForm.notes.trim(),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setEventError(payload?.message || 'Não foi possível salvar evento.');
                return;
            }
            setEventForm((prev) => ({ ...prev, date: '', notes: '' }));
            await loadKpis();
        } catch (error) {
            console.error(error);
            setEventError('Não foi possível salvar evento.');
        } finally {
            setIsSavingEvent(false);
        }
    };

    const formatDate = (value: string | null) => {
        if (!value) {
            return '—';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '—';
        }
        return date.toLocaleDateString('pt-BR');
    };

    const formatPercent = (value: number | null) => {
        if (value === null || Number.isNaN(value)) {
            return '—';
        }
        return `${Math.round(value * 100)}%`;
    };

    return (
        <div className="space-y-6">
            <div className="rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-5 py-4">
                <h2 className="m-0 text-[20px] font-bold leading-[24px] text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">Reprodução</h2>
                <p className="mt-1 text-[13px] leading-[18px] text-[var(--eixo-text-muted)] opacity-75 dark:text-[var(--eixo-text-soft)]">
                    Configure o modo reprodutivo e acompanhe eventos das fêmeas.
                </p>
            </div>

            <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-6 space-y-4">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">Modo reprodutivo</h3>
                    <p className="text-xs text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)] mt-1">
                        Escolha como a fazenda opera o calendário reprodutivo.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => handleModeChange('CONTINUO')}
                        disabled={isSavingMode}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
                            reproMode === 'CONTINUO'
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-[var(--eixo-border)] dark:border-[var(--eixo-border)] text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]'
                        }`}
                    >
                        Contínuo
                    </button>
                    <button
                        type="button"
                        onClick={() => handleModeChange('ESTACAO')}
                        disabled={isSavingMode}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border ${
                            reproMode === 'ESTACAO'
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-[var(--eixo-border)] dark:border-[var(--eixo-border)] text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]'
                        }`}
                    >
                        Estação de monta
                    </button>
                </div>
                {modeError && <p className="text-sm text-red-600 dark:text-red-400">{modeError}</p>}
            </div>

            {reproMode === 'ESTACAO' && (
                <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">Estações de monta</h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-3">
                            {seasons.length === 0 ? (
                                <p className="text-sm text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Nenhuma estação cadastrada.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {seasons.map((season) => (
                                        <li key={season.id}>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedSeasonId(season.id)}
                                                className={`w-full text-left px-4 py-3 rounded-xl border ${
                                                    selectedSeasonId === season.id
                                                        ? 'border-primary bg-primary/10 text-primary'
                                                        : 'border-[var(--eixo-border)] dark:border-[var(--eixo-border)] text-[var(--eixo-text)] dark:text-[var(--eixo-text-soft)]'
                                                }`}
                                            >
                                                <p className="text-sm font-semibold">{season.name}</p>
                                                <p className="text-xs text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">
                                                    {formatDate(season.startAt)} - {formatDate(season.endAt)}
                                                </p>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <form className="space-y-3" onSubmit={handleCreateSeason}>
                            <div>
                                <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Nome da estação</label>
                                <input
                                    type="text"
                                    value={seasonForm.name}
                                    onChange={(event) => handleSeasonFormChange('name', event.target.value)}
                                    className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Início</label>
                                    <input
                                        type="date"
                                        value={seasonForm.startAt}
                                        onChange={(event) => handleSeasonFormChange('startAt', event.target.value)}
                                        className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Fim</label>
                                    <input
                                        type="date"
                                        value={seasonForm.endAt}
                                        onChange={(event) => handleSeasonFormChange('endAt', event.target.value)}
                                        className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full rounded-xl bg-primary text-[#1a1a1a] font-semibold py-2 hover:bg-primary-dark transition-colors"
                            >
                                Criar estação
                            </button>
                            {seasonError && <p className="text-sm text-red-600 dark:text-red-400">{seasonError}</p>}
                        </form>
                    </div>
                </div>
            )}

            {reproMode === 'ESTACAO' && (
                <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">Fêmeas expostas</h3>
                    {!selectedSeasonId ? (
                        <p className="text-sm text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Selecione uma estação para gerir as expostas.</p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {femaleAnimals.map((animal) => (
                                    <label
                                        key={animal.id}
                                        className="flex items-center gap-2 rounded-xl border border-[var(--eixo-border)] dark:border-[var(--eixo-border)] px-3 py-2 text-sm text-[var(--eixo-text)] dark:text-[var(--eixo-text)]"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedExposureIds.has(animal.id)}
                                            onChange={() => handleToggleExposure(animal.id)}
                                        />
                                        <span>{animal.brinco} • {animal.raca}</span>
                                    </label>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={handleSaveExposures}
                                className="rounded-xl bg-primary text-[#1a1a1a] font-semibold py-2 px-4 hover:bg-primary-dark transition-colors"
                            >
                                Salvar expostas
                            </button>
                            {exposureMessage && <p className="text-sm text-green-600 dark:text-green-400">{exposureMessage}</p>}
                            {exposureError && <p className="text-sm text-red-600 dark:text-red-400">{exposureError}</p>}
                        </>
                    )}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <form className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-6 space-y-4" onSubmit={handleCreateEvent}>
                    <h3 className="text-sm font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">Registrar evento</h3>
                    <div>
                        <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Fêmea</label>
                        <select
                            value={eventForm.animalId}
                            onChange={(event) => handleEventFormChange('animalId', event.target.value)}
                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                        >
                            <option value="">Selecione</option>
                            {femaleAnimals.map((animal) => (
                                <option key={animal.id} value={animal.id}>
                                    {animal.brinco} • {animal.raca}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Tipo</label>
                            <select
                                value={eventForm.type}
                                onChange={(event) => handleEventFormChange('type', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                            >
                                <option value="COBERTURA">Cobertura</option>
                                <option value="IATF">IATF</option>
                                <option value="DIAGNOSTICO_PRENHEZ">Diagnóstico de prenhez</option>
                                <option value="PARTO">Parto</option>
                                <option value="DESMAME">Desmame</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Data</label>
                            <input
                                type="date"
                                value={eventForm.date}
                                onChange={(event) => handleEventFormChange('date', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                            />
                        </div>
                    </div>
                    {eventForm.type === 'DIAGNOSTICO_PRENHEZ' && (
                        <div>
                            <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Status</label>
                            <select
                                value={eventForm.status}
                                onChange={(event) => handleEventFormChange('status', event.target.value)}
                                className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                            >
                                <option value="PRENHE">Prenhe</option>
                                <option value="VACIA">Vazia</option>
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Observações</label>
                        <textarea
                            value={eventForm.notes}
                            onChange={(event) => handleEventFormChange('notes', event.target.value)}
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm shadow-sm focus:border-[var(--eixo-text)] focus:outline-none focus:ring-2 focus:ring-[var(--eixo-graphite)]/10 dark:border-[var(--eixo-border)] dark:bg-[var(--eixo-surface)]"
                        />
                    </div>
                    {eventError && <p className="text-sm text-red-600 dark:text-red-400">{eventError}</p>}
                    <button
                        type="submit"
                        disabled={isSavingEvent}
                        className="w-full rounded-xl bg-primary text-[#1a1a1a] font-semibold py-2 hover:bg-primary-dark transition-colors disabled:opacity-70"
                    >
                        {isSavingEvent ? 'Salvando...' : 'Salvar evento'}
                    </button>
                </form>

                <div className="bg-[var(--eixo-surface)] dark:bg-[var(--eixo-surface)] rounded-xl shadow-lg p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">KPIs reprodutivos</h3>
                    {selectedAnimal ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-xl bg-[var(--eixo-surface-soft)] dark:bg-[var(--eixo-surface-soft)]/80 p-4">
                                    <p className="text-xs text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">IEP (dias)</p>
                                    <p className="text-xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">{kpis?.iepDays ?? '—'}</p>
                                </div>
                                <div className="rounded-xl bg-[var(--eixo-surface-soft)] dark:bg-[var(--eixo-surface-soft)]/80 p-4">
                                    <p className="text-xs text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Dias em aberto</p>
                                    <p className="text-xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">{kpis?.openDays ?? '—'}</p>
                                </div>
                                <div className="rounded-xl bg-[var(--eixo-surface-soft)] dark:bg-[var(--eixo-surface-soft)]/80 p-4">
                                    <p className="text-xs text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Taxa de prenhez</p>
                                    <p className="text-xl font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">{formatPercent(kpis?.pregRate ?? null)}</p>
                                </div>
                                <div className="rounded-xl bg-[var(--eixo-surface-soft)] dark:bg-[var(--eixo-surface-soft)]/80 p-4">
                                    <p className="text-xs text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">Alertas</p>
                                    <p className="text-sm font-semibold text-[var(--eixo-text)] dark:text-[var(--eixo-text)]">
                                        {kpis?.emptyAlerts?.isRepeatEmpty
                                            ? '2 diagnósticos vazia seguidos'
                                            : kpis?.emptyAlerts?.isEmpty
                                            ? 'Vazia na última avaliação'
                                            : 'Sem alertas'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4 text-xs text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">
                                <span>Último parto: {formatDate(kpis?.lastCalvingDate ?? null)}</span>
                                <span>Último diagnóstico: {formatDate(kpis?.lastPregCheck ?? null)}</span>
                            </div>
                            {kpiError && <p className="text-sm text-red-600 dark:text-red-400">{kpiError}</p>}
                        </>
                    ) : (
                        <p className="text-sm text-[var(--eixo-text-muted)] dark:text-[var(--eixo-text-soft)]">
                            Selecione uma fêmea para visualizar KPIs.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GeneticsReproducao;
