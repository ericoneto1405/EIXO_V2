import React from 'react';
import { buildApiUrl } from '../api';
import {
    approveNutritionExecution,
    approveNutritionFabrication,
    approveNutritionTroughReading,
    cancelNutritionExecution,
    cancelNutritionFabrication,
    createNutritionAssignment,
    createNutritionExecution,
    createNutritionFabrication,
    createNutritionIngredient,
    createNutritionPhase,
    createNutritionPlan,
    createNutritionPreparedFeed,
    createNutritionTroughReading,
    createNutritionUnit,
    getNutritionDashboard,
    getNutritionSettings,
    listNutritionAssignments,
    listNutritionExecutions,
    listNutritionFabrications,
    listNutritionIngredients,
    listNutritionPhases,
    listNutritionPlans,
    listNutritionPreparedFeeds,
    listNutritionTroughReadings,
    listNutritionUnits,
    rejectNutritionExecution,
    rejectNutritionTroughReading,
    saveNutritionSettings,
} from '../adapters/nutritionApi';

interface FeedsUser {
    name?: string;
    roles?: string[];
    membershipRole?: string | null;
}

interface NutritionModuleProps {
    farmId?: string | null;
    currentUser?: FeedsUser | null;
}

const OFFLINE_PREFIX = 'eixo:nutrition:offline-readings:';
const VIEWS = ['Hoje', 'Gestão', 'Configuração'] as const;

type ModuleView = (typeof VIEWS)[number];

type OfflineReading = {
    tempId: string;
    unitId: string;
    date: string;
    readingType: string;
    score: string;
    supplyObservation: string;
    observedDryMatterPercent: string;
    animalBehavior: string;
    notes: string;
};

const formatNumber = (value: number | null | undefined, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '-';
    }
    return Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
};

const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return '-';
    }
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const formatDateTime = (value: string | null | undefined) => {
    if (!value) {
        return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }
    return date.toLocaleString('pt-BR');
};

const getSeverityClasses = (severity?: string) => {
    switch (severity) {
        case 'critical':
            return 'border-red-200 bg-red-50 text-red-700';
        case 'warning':
            return 'border-amber-200 bg-amber-50 text-amber-700';
        case 'info':
            return 'border-sky-200 bg-sky-50 text-sky-700';
        default:
            return 'border-gray-200 bg-white text-gray-700';
    }
};

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode; }> = ({ title, description, children }) => (
    <section className="rounded-2xl border border-[#d8d2c7] bg-[#fffdf8] p-5 shadow-sm">
        <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#28352c]">{title}</h2>
            {description && <p className="mt-1 text-sm text-[#6b7280]">{description}</p>}
        </div>
        {children}
    </section>
);

const StatCard: React.FC<{ title: string; value: string; helper?: string; }> = ({ title, value, helper }) => (
    <div className="rounded-2xl border border-[#d8d2c7] bg-white p-4 shadow-sm">
        <p className="text-sm text-[#6b7280]">{title}</p>
        <p className="mt-2 text-2xl font-semibold text-[#28352c]">{value}</p>
        {helper && <p className="mt-2 text-xs text-[#8a8f87]">{helper}</p>}
    </div>
);

const Field: React.FC<{
    label: string;
    children: React.ReactNode;
    helper?: string;
}> = ({ label, children, helper }) => (
    <label className="flex flex-col gap-1 text-sm text-[#374151]">
        <span className="font-medium">{label}</span>
        {children}
        {helper && <span className="text-xs text-[#8a8f87]">{helper}</span>}
    </label>
);

const NutritionModule: React.FC<NutritionModuleProps> = ({ farmId, currentUser }) => {
    const [view, setView] = React.useState<ModuleView>('Hoje');
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [success, setSuccess] = React.useState<string | null>(null);
    const [settings, setSettings] = React.useState<any | null>(null);
    const [dashboard, setDashboard] = React.useState<any | null>(null);
    const [ingredients, setIngredients] = React.useState<any[]>([]);
    const [phases, setPhases] = React.useState<any[]>([]);
    const [units, setUnits] = React.useState<any[]>([]);
    const [preparedFeeds, setPreparedFeeds] = React.useState<any[]>([]);
    const [plans, setPlans] = React.useState<any[]>([]);
    const [fabrications, setFabrications] = React.useState<any[]>([]);
    const [executions, setExecutions] = React.useState<any[]>([]);
    const [troughReadings, setTroughReadings] = React.useState<any[]>([]);
    const [lots, setLots] = React.useState<any[]>([]);
    const [offlineReadings, setOfflineReadings] = React.useState<OfflineReading[]>([]);
    const [ingredientForm, setIngredientForm] = React.useState({
        name: '',
        category: '',
        unit: 'kg',
        cost: '',
        supplier: '',
        dryMatterPercent: '',
        stockNatural: '',
        minStockNatural: '',
    });
    const [phaseForm, setPhaseForm] = React.useState({
        name: '',
        targetIntakeDryKgHead: '',
        targetGmd: '',
        targetFeedConversion: '',
        targetCostPerHeadDay: '',
        notes: '',
    });
    const [unitForm, setUnitForm] = React.useState({
        type: 'LOTE',
        lotId: '',
        phaseId: '',
        name: '',
        currentHeadCount: '',
        notes: '',
    });
    const [preparedFeedForm, setPreparedFeedForm] = React.useState({
        name: '',
        expectedYieldNaturalKg: '',
        notes: '',
        items: [{ ingredientId: '', proportionPercent: '' }],
    });
    const [planForm, setPlanForm] = React.useState({
        nome: '',
        objetivo: '',
        fase: '',
        phaseId: '',
        preparedFeedId: '',
        feedingSlot: '',
        startAt: new Date().toISOString().slice(0, 16),
        endAt: '',
        metaGmd: '',
        plannedIntakeNaturalKgPerHead: '',
        plannedIntakeNaturalKgTotal: '',
        estimatedCostPerHeadDay: '',
        observacoes: '',
    });
    const [assignmentForm, setAssignmentForm] = React.useState({
        planId: '',
        unitId: '',
        startAt: new Date().toISOString().slice(0, 16),
        endAt: '',
    });
    const [fabricationForm, setFabricationForm] = React.useState({
        preparedFeedId: '',
        batchCode: '',
        producedAt: new Date().toISOString().slice(0, 16),
        outputNaturalKg: '',
        notes: '',
    });
    const [executionForm, setExecutionForm] = React.useState({
        unitId: '',
        preparedFeedId: '',
        fabricationId: '',
        date: new Date().toISOString().slice(0, 16),
        feedingSlot: '',
        actualNaturalKg: '',
        actualDryMatterKg: '',
        notes: '',
    });
    const [readingForm, setReadingForm] = React.useState({
        unitId: '',
        date: new Date().toISOString().slice(0, 16),
        readingType: 'DIURNA',
        score: '2',
        supplyObservation: '',
        observedDryMatterPercent: '',
        animalBehavior: 'NORMAL',
        notes: '',
    });
    const [settingsForm, setSettingsForm] = React.useState({
        operationContext: 'PASTO',
        adjustmentMode: 'SUGESTAO',
        indicatorsApprovedOnly: false,
        requireFabricationApproval: true,
        requireExecutionApproval: true,
        requireTroughApproval: true,
        predictiveSafeDays: 7,
        predictiveWarningDays: 3,
        diffWarningPercent: 3,
        diffCriticalPercent: 7,
        manualReviewThresholdPercent: 5,
    });

    const canReview = React.useMemo(() => {
        if (!currentUser) {
            return false;
        }
        if (currentUser.membershipRole === 'OWNER' || currentUser.membershipRole === 'ADMIN') {
            return true;
        }
        const roles = Array.isArray(currentUser.roles) ? currentUser.roles : [];
        return roles.some((role) => ['admin', 'manager', 'gerente', 'tech', 'tecnico', 'técnico'].includes(String(role).toLowerCase()));
    }, [currentUser]);

    const offlineStorageKey = React.useMemo(() => `${OFFLINE_PREFIX}${farmId || 'none'}`, [farmId]);

    const loadLots = React.useCallback(async () => {
        if (!farmId) {
            setLots([]);
            return;
        }
        const response = await fetch(buildApiUrl(`/lots?farmId=${farmId}`), { credentials: 'include' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.message || 'Erro ao listar lotes.');
        }
        setLots(payload?.lots || []);
    }, [farmId]);

    const loadOfflineReadings = React.useCallback(() => {
        if (!farmId) {
            setOfflineReadings([]);
            return;
        }
        const raw = window.localStorage.getItem(offlineStorageKey);
        if (!raw) {
            setOfflineReadings([]);
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            setOfflineReadings(Array.isArray(parsed) ? parsed : []);
        } catch {
            setOfflineReadings([]);
        }
    }, [farmId, offlineStorageKey]);

    const saveOfflineReadings = React.useCallback((items: OfflineReading[]) => {
        window.localStorage.setItem(offlineStorageKey, JSON.stringify(items));
        setOfflineReadings(items);
    }, [offlineStorageKey]);

    const loadAll = React.useCallback(async () => {
        if (!farmId) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [settingsPayload, dashboardPayload, ingredientPayload, phasePayload, unitPayload, preparedFeedPayload, planPayload, fabricationPayload, executionPayload, readingPayload] = await Promise.all([
                getNutritionSettings(farmId),
                getNutritionDashboard(farmId),
                listNutritionIngredients(farmId),
                listNutritionPhases(farmId),
                listNutritionUnits(farmId),
                listNutritionPreparedFeeds(farmId),
                listNutritionPlans(farmId),
                listNutritionAssignments(farmId),
                listNutritionFabrications(farmId),
                listNutritionExecutions(farmId),
                listNutritionTroughReadings(farmId),
            ]);
            await loadLots();
            setSettings(settingsPayload?.settings || null);
            setDashboard(dashboardPayload || null);
            setIngredients(ingredientPayload?.items || []);
            setPhases(phasePayload?.items || []);
            setUnits(unitPayload?.items || []);
            setPreparedFeeds(preparedFeedPayload?.items || []);
            setPlans(planPayload?.items || []);
            setFabrications(fabricationPayload?.items || []);
            setExecutions(executionPayload?.items || []);
            setTroughReadings(readingPayload?.items || []);
            if (settingsPayload?.settings) {
                setSettingsForm({
                    operationContext: settingsPayload.settings.operationContext,
                    adjustmentMode: settingsPayload.settings.adjustmentMode,
                    indicatorsApprovedOnly: Boolean(settingsPayload.settings.indicatorsApprovedOnly),
                    requireFabricationApproval: Boolean(settingsPayload.settings.requireFabricationApproval),
                    requireExecutionApproval: Boolean(settingsPayload.settings.requireExecutionApproval),
                    requireTroughApproval: Boolean(settingsPayload.settings.requireTroughApproval),
                    predictiveSafeDays: Number(settingsPayload.settings.predictiveSafeDays || 7),
                    predictiveWarningDays: Number(settingsPayload.settings.predictiveWarningDays || 3),
                    diffWarningPercent: Number(settingsPayload.settings.diffWarningPercent || 3),
                    diffCriticalPercent: Number(settingsPayload.settings.diffCriticalPercent || 7),
                    manualReviewThresholdPercent: Number(settingsPayload.settings.manualReviewThresholdPercent || 5),
                });
            }
        } catch (err: any) {
            setError(err?.message || 'Erro ao carregar o módulo de nutrição.');
        } finally {
            setLoading(false);
        }
    }, [farmId, loadLots]);

    React.useEffect(() => {
        loadOfflineReadings();
    }, [loadOfflineReadings]);

    React.useEffect(() => {
        if (farmId) {
            loadAll();
        }
    }, [farmId, loadAll]);

    const runAction = async (action: () => Promise<void>, message: string) => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await action();
            setSuccess(message);
            await loadAll();
        } catch (err: any) {
            setError(err?.message || 'Erro na operação.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSettings = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await saveNutritionSettings({ farmId, ...settingsForm });
        }, 'Parâmetros salvos.');
    };

    const handleCreateIngredient = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionIngredient({ farmId, ...ingredientForm });
            setIngredientForm({ name: '', category: '', unit: 'kg', cost: '', supplier: '', dryMatterPercent: '', stockNatural: '', minStockNatural: '' });
        }, 'Ingrediente salvo.');
    };

    const handleCreatePhase = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionPhase({ farmId, ...phaseForm });
            setPhaseForm({ name: '', targetIntakeDryKgHead: '', targetGmd: '', targetFeedConversion: '', targetCostPerHeadDay: '', notes: '' });
        }, 'Fase salva.');
    };

    const handleCreateUnit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionUnit({ farmId, ...unitForm });
            setUnitForm({ type: settings?.operationContext === 'CONFINAMENTO' ? 'BAIA' : 'LOTE', lotId: '', phaseId: '', name: '', currentHeadCount: '', notes: '' });
        }, 'Unidade operacional salva.');
    };

    const handlePreparedFeedItemChange = (index: number, field: string, value: string) => {
        setPreparedFeedForm((current) => ({
            ...current,
            items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
        }));
    };

    const handleCreatePreparedFeed = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionPreparedFeed({
                farmId,
                name: preparedFeedForm.name,
                expectedYieldNaturalKg: preparedFeedForm.expectedYieldNaturalKg,
                notes: preparedFeedForm.notes,
                items: preparedFeedForm.items,
            });
            setPreparedFeedForm({ name: '', expectedYieldNaturalKg: '', notes: '', items: [{ ingredientId: '', proportionPercent: '' }] });
        }, 'Ração preparada salva.');
    };

    const handleCreatePlan = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionPlan({ farmId, ...planForm });
            setPlanForm({ nome: '', objetivo: '', fase: '', phaseId: '', preparedFeedId: '', feedingSlot: '', startAt: new Date().toISOString().slice(0, 16), endAt: '', metaGmd: '', plannedIntakeNaturalKgPerHead: '', plannedIntakeNaturalKgTotal: '', estimatedCostPerHeadDay: '', observacoes: '' });
        }, 'Plano de trato salvo.');
    };

    const handleCreateAssignment = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionAssignment({ farmId, ...assignmentForm });
            setAssignmentForm({ planId: '', unitId: '', startAt: new Date().toISOString().slice(0, 16), endAt: '' });
        }, 'Vínculo de trato salvo.');
    };

    const handleCreateFabrication = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionFabrication({ farmId, ...fabricationForm });
            setFabricationForm({ preparedFeedId: '', batchCode: '', producedAt: new Date().toISOString().slice(0, 16), outputNaturalKg: '', notes: '' });
        }, 'Fabricação registrada.');
    };

    const handleCreateExecution = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionExecution({ farmId, ...executionForm });
            setExecutionForm({ unitId: '', preparedFeedId: '', fabricationId: '', date: new Date().toISOString().slice(0, 16), feedingSlot: '', actualNaturalKg: '', actualDryMatterKg: '', notes: '' });
        }, 'Trato realizado registrado.');
    };

    const handleCreateReading = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        await runAction(async () => {
            await createNutritionTroughReading({ farmId, ...readingForm });
            setReadingForm({ unitId: '', date: new Date().toISOString().slice(0, 16), readingType: 'DIURNA', score: '2', supplyObservation: '', observedDryMatterPercent: '', animalBehavior: 'NORMAL', notes: '' });
        }, 'Leitura de cocho registrada.');
    };

    const handleSaveReadingOffline = (event: React.FormEvent) => {
        event.preventDefault();
        if (!farmId) return;
        const item: OfflineReading = {
            tempId: crypto.randomUUID(),
            unitId: readingForm.unitId,
            date: readingForm.date,
            readingType: readingForm.readingType,
            score: readingForm.score,
            supplyObservation: readingForm.supplyObservation,
            observedDryMatterPercent: readingForm.observedDryMatterPercent,
            animalBehavior: readingForm.animalBehavior,
            notes: readingForm.notes,
        };
        const nextItems = [...offlineReadings, item];
        saveOfflineReadings(nextItems);
        setSuccess('Leitura salva offline.');
        setReadingForm({ unitId: '', date: new Date().toISOString().slice(0, 16), readingType: 'DIURNA', score: '2', supplyObservation: '', observedDryMatterPercent: '', animalBehavior: 'NORMAL', notes: '' });
    };

    const handleSyncOffline = async () => {
        if (!farmId || !offlineReadings.length) return;
        await runAction(async () => {
            const pending: OfflineReading[] = [];
            for (const item of offlineReadings) {
                try {
                    await createNutritionTroughReading({ farmId, ...item, syncSource: 'OFFLINE' });
                } catch {
                    pending.push(item);
                }
            }
            saveOfflineReadings(pending);
        }, 'Leituras offline sincronizadas.');
    };

    const askReason = (title: string) => {
        const reason = window.prompt(title);
        return typeof reason === 'string' ? reason.trim() : '';
    };

    const exceptions = React.useMemo(() => {
        const items = Array.isArray(dashboard?.exceptions) ? [...dashboard.exceptions] : [];
        if (offlineReadings.length) {
            items.unshift({
                id: 'offline-readings',
                type: 'offline_pending',
                severity: 'info',
                title: 'Há leituras offline ainda não sincronizadas',
                description: `${offlineReadings.length} leitura(s) aguardando envio.`,
                action: 'Sincronizar agora',
            });
        }
        return items;
    }, [dashboard, offlineReadings]);

    if (!farmId) {
        return (
            <div className="rounded-2xl border border-[#d8d2c7] bg-[#fffdf8] p-10 text-center text-[#6b7280]">
                Selecione uma fazenda para usar o módulo de nutrição.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-[#28352c]">Nutrição</h1>
                    <p className="text-sm text-[#6b7280]">Controle do dia, custo, consumo, diferenças e estrutura do trato.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {VIEWS.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setView(item)}
                            className={`rounded-full px-4 py-2 text-sm font-medium transition ${view === item ? 'bg-[#64704f] text-white' : 'border border-[#d8d2c7] bg-white text-[#28352c]'}`}
                        >
                            {item}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={loadAll}
                        className="rounded-full border border-[#d8d2c7] bg-white px-4 py-2 text-sm font-medium text-[#28352c]"
                    >
                        Atualizar
                    </button>
                </div>
            </div>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
            {loading && <div className="text-sm text-[#6b7280]">Carregando nutrição...</div>}

            {view === 'Hoje' && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                        <StatCard title="Planejado do dia" value={`${formatNumber(dashboard?.summary?.plannedNaturalKg)} kg`} helper={`MS ${formatNumber(dashboard?.summary?.plannedDryKg)} kg`} />
                        <StatCard title="Entregue do dia" value={`${formatNumber(dashboard?.summary?.deliveredNaturalKg)} kg`} helper={`MS ${formatNumber(dashboard?.summary?.deliveredDryKg)} kg`} />
                        <StatCard title="Custo do dia" value={formatCurrency(dashboard?.summary?.totalCostDay)} helper={dashboard?.summary?.averageCostPerHeadDay ? `${formatCurrency(dashboard.summary.averageCostPerHeadDay)} por cabeça` : 'Sem cálculo por cabeça'} />
                        <StatCard title="Pendências" value={String((dashboard?.summary?.pendingApprovals?.fabrications || 0) + (dashboard?.summary?.pendingApprovals?.executions || 0) + (dashboard?.summary?.pendingApprovals?.troughReadings || 0))} helper="Registros aguardando conferência" />
                    </div>

                    <SectionCard title="Central de Atenção" description="Tudo que precisa de ação agora.">
                        <div className="space-y-3">
                            {exceptions.length === 0 && <p className="text-sm text-[#6b7280]">Nenhum alerta aberto neste momento.</p>}
                            {exceptions.map((item: any) => (
                                <div key={item.id} className={`rounded-xl border px-4 py-3 ${getSeverityClasses(item.severity)}`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold">{item.title}</p>
                                            <p className="mt-1 text-sm">{item.description}</p>
                                        </div>
                                        {item.type === 'offline_pending' ? (
                                            <button type="button" onClick={handleSyncOffline} className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-[#28352c]">
                                                {item.action}
                                            </button>
                                        ) : (
                                            <span className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-[#28352c]">{item.action}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <SectionCard title="Registrar fabricação" description="Lançamento simples para o responsável pela mistura.">
                            <form className="grid gap-3" onSubmit={handleCreateFabrication}>
                                <Field label="Ração preparada">
                                    <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={fabricationForm.preparedFeedId} onChange={(event) => setFabricationForm((current) => ({ ...current, preparedFeedId: event.target.value }))}>
                                        <option value="">Selecione</option>
                                        {preparedFeeds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Lote da fabricação">
                                    <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={fabricationForm.batchCode} onChange={(event) => setFabricationForm((current) => ({ ...current, batchCode: event.target.value }))} placeholder="Ex.: Batida manhã" />
                                </Field>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Field label="Data e hora">
                                        <input type="datetime-local" className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={fabricationForm.producedAt} onChange={(event) => setFabricationForm((current) => ({ ...current, producedAt: event.target.value }))} />
                                    </Field>
                                    <Field label="Quantidade fabricada (kg matéria natural)">
                                        <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={fabricationForm.outputNaturalKg} onChange={(event) => setFabricationForm((current) => ({ ...current, outputNaturalKg: event.target.value }))} placeholder="Ex.: 1200" />
                                    </Field>
                                </div>
                                <Field label="Observação">
                                    <textarea className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={fabricationForm.notes} onChange={(event) => setFabricationForm((current) => ({ ...current, notes: event.target.value }))} rows={2} />
                                </Field>
                                <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar fabricação</button>
                            </form>
                        </SectionCard>

                        <SectionCard title="Registrar trato realizado" description="Tela curta para o operador lançar o que foi entregue.">
                            <form className="grid gap-3" onSubmit={handleCreateExecution}>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Field label="Baia, lote ou ponto de trato">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.unitId} onChange={(event) => setExecutionForm((current) => ({ ...current, unitId: event.target.value }))}>
                                            <option value="">Selecione</option>
                                            {units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Horário do trato">
                                        <input type="datetime-local" className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.date} onChange={(event) => setExecutionForm((current) => ({ ...current, date: event.target.value }))} />
                                    </Field>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <Field label="Ração preparada">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.preparedFeedId} onChange={(event) => setExecutionForm((current) => ({ ...current, preparedFeedId: event.target.value }))}>
                                            <option value="">Automático pelo plano</option>
                                            {preparedFeeds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Fabricação usada">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.fabricationId} onChange={(event) => setExecutionForm((current) => ({ ...current, fabricationId: event.target.value }))}>
                                            <option value="">Automática pelo saldo</option>
                                            {fabrications.filter((item) => item.remainingNaturalKg > 0).map((item) => <option key={item.id} value={item.id}>{item.batchCode}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Trato">
                                        <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.feedingSlot} onChange={(event) => setExecutionForm((current) => ({ ...current, feedingSlot: event.target.value }))} placeholder="Ex.: Trato 1" />
                                    </Field>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Field label="Quantidade entregue (kg matéria natural)">
                                        <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.actualNaturalKg} onChange={(event) => setExecutionForm((current) => ({ ...current, actualNaturalKg: event.target.value }))} placeholder="Ex.: 580" />
                                    </Field>
                                    <Field label="Quantidade entregue (kg matéria seca)">
                                        <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.actualDryMatterKg} onChange={(event) => setExecutionForm((current) => ({ ...current, actualDryMatterKg: event.target.value }))} placeholder="Ex.: 340" />
                                    </Field>
                                </div>
                                <Field label="Observação">
                                    <textarea className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={executionForm.notes} onChange={(event) => setExecutionForm((current) => ({ ...current, notes: event.target.value }))} rows={2} />
                                </Field>
                                <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar trato</button>
                            </form>
                        </SectionCard>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <SectionCard title="Leitura de cocho" description="Pode salvar online ou guardar offline para sincronizar depois.">
                            <form className="grid gap-3">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Field label="Baia, lote ou ponto de trato">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.unitId} onChange={(event) => setReadingForm((current) => ({ ...current, unitId: event.target.value }))}>
                                            <option value="">Selecione</option>
                                            {units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Data e hora">
                                        <input type="datetime-local" className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.date} onChange={(event) => setReadingForm((current) => ({ ...current, date: event.target.value }))} />
                                    </Field>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                    <Field label="Leitura">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.readingType} onChange={(event) => setReadingForm((current) => ({ ...current, readingType: event.target.value }))}>
                                            <option value="DIURNA">Diurna</option>
                                            <option value="NOTURNA">Noturna</option>
                                        </select>
                                    </Field>
                                    <Field label="Score do cocho" helper="0 = faltou comida | 2 = ideal | 5 = excesso forte">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.score} onChange={(event) => setReadingForm((current) => ({ ...current, score: event.target.value }))}>
                                            <option value="0">0 - Faltou comida</option>
                                            <option value="1">1 - Quase sem sobra</option>
                                            <option value="2">2 - Ideal</option>
                                            <option value="3">3 - Sobra leve</option>
                                            <option value="4">4 - Sobra alta</option>
                                            <option value="5">5 - Excesso forte</option>
                                        </select>
                                    </Field>
                                    <Field label="Comportamento animal">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.animalBehavior} onChange={(event) => setReadingForm((current) => ({ ...current, animalBehavior: event.target.value }))}>
                                            <option value="RUMINANDO">Ruminando</option>
                                            <option value="NORMAL">Normal</option>
                                            <option value="INQUIETO">Inquieto</option>
                                            <option value="APATICO">Apático</option>
                                            <option value="OUTRO">Outro</option>
                                        </select>
                                    </Field>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Field label="Sobra ou falta">
                                        <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.supplyObservation} onChange={(event) => setReadingForm((current) => ({ ...current, supplyObservation: event.target.value }))} placeholder="Ex.: sobra leve no lado esquerdo" />
                                    </Field>
                                    <Field label="Matéria seca observada (%)" helper="Parte realmente nutritiva do alimento.">
                                        <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.observedDryMatterPercent} onChange={(event) => setReadingForm((current) => ({ ...current, observedDryMatterPercent: event.target.value }))} placeholder="Ex.: 58" />
                                    </Field>
                                </div>
                                <Field label="Observação">
                                    <textarea className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={readingForm.notes} onChange={(event) => setReadingForm((current) => ({ ...current, notes: event.target.value }))} rows={2} />
                                </Field>
                                <div className="flex flex-wrap gap-3">
                                    <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" onClick={handleCreateReading} type="submit">Salvar leitura</button>
                                    <button disabled={saving} className="rounded-xl border border-[#d8d2c7] bg-white px-4 py-2 text-sm font-medium text-[#28352c]" onClick={handleSaveReadingOffline} type="button">Salvar offline</button>
                                    {offlineReadings.length > 0 && <button disabled={saving} className="rounded-xl border border-[#d8d2c7] bg-white px-4 py-2 text-sm font-medium text-[#28352c]" onClick={handleSyncOffline} type="button">Sincronizar {offlineReadings.length}</button>}
                                </div>
                            </form>
                        </SectionCard>

                        <SectionCard title="Ingredientes com risco de falta" description="Previsão pela média de consumo dos últimos 3 dias.">
                            <div className="space-y-3">
                                {(dashboard?.ingredientsAtRisk || []).length === 0 && <p className="text-sm text-[#6b7280]">Nenhum ingrediente com risco calculado.</p>}
                                {(dashboard?.ingredientsAtRisk || []).map((item: any) => (
                                    <div key={item.ingredientId} className={`rounded-xl border px-4 py-3 ${getSeverityClasses(item.level === 'safe' ? 'normal' : item.level)}`}>
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-semibold">{item.ingredientName}</p>
                                                <p className="mt-1 text-sm">{item.message}</p>
                                            </div>
                                            <div className="text-right text-sm">
                                                <p>{formatNumber(item.currentStockNatural)} kg</p>
                                                <p>{item.daysRemaining === null ? 'Sem previsão' : `${formatNumber(item.daysRemaining, 1)} dias`}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    </div>
                </div>
            )}

            {view === 'Gestão' && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                        <StatCard title="Fabricado" value={`${formatNumber(dashboard?.summary?.fabricatedNaturalKg)} kg`} helper={`MS ${formatNumber(dashboard?.summary?.fabricatedDryKg)} kg`} />
                        <StatCard title="Diferença geral" value={`${formatNumber((dashboard?.summary?.deliveredNaturalKg || 0) - (dashboard?.summary?.plannedNaturalKg || 0))} kg`} helper="Planejado x entregue no dia" />
                        <StatCard title="Ingredientes em risco" value={String(dashboard?.summary?.ingredientRiskCount || 0)} helper="Itens com alerta de falta" />
                        <StatCard title="Registros rejeitados" value={String((dashboard?.summary?.rejectedCount?.executions || 0) + (dashboard?.summary?.rejectedCount?.troughReadings || 0))} helper="Precisam de correção" />
                    </div>

                    <SectionCard title="Diferenças e resultado da alimentação" description="Comparação entre planejado, entregue, custo e score do cocho.">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#e5e7eb] text-left text-[#6b7280]">
                                        <th className="py-2 pr-4">Unidade</th>
                                        <th className="py-2 pr-4">Planejado</th>
                                        <th className="py-2 pr-4">Entregue</th>
                                        <th className="py-2 pr-4">Diferença</th>
                                        <th className="py-2 pr-4">Score</th>
                                        <th className="py-2 pr-4">Consumo/cab.</th>
                                        <th className="py-2 pr-4">Conversão</th>
                                        <th className="py-2 pr-4">Custo/cab.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(dashboard?.today?.units || []).map((item: any) => (
                                        <tr key={item.unit.id} className="border-b border-[#f0ede6] align-top text-[#28352c]">
                                            <td className="py-3 pr-4">
                                                <p className="font-medium">{item.unit.name}</p>
                                                <p className="text-xs text-[#8a8f87]">{item.unit.type.toLowerCase()}</p>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <p>{formatNumber(item.plannedNaturalKg)} kg</p>
                                                <p className="text-xs text-[#8a8f87]">MS {formatNumber(item.plannedDryKg)} kg</p>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <p>{formatNumber(item.deliveredNaturalKg)} kg</p>
                                                <p className="text-xs text-[#8a8f87]">MS {formatNumber(item.deliveredDryKg)} kg</p>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getSeverityClasses(item.diffSeverity)}`}>{formatNumber(item.diffNaturalKg)} kg / {formatNumber(item.diffPercent)}%</span>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getSeverityClasses(item.troughSeverity)}`}>{item.latestScore ?? '-'}</span>
                                            </td>
                                            <td className="py-3 pr-4">{formatNumber(item.intakeDryPerHead)} kg MS</td>
                                            <td className="py-3 pr-4">{formatNumber(item.conversion)}</td>
                                            <td className="py-3 pr-4">{formatCurrency(item.costPerHeadDay)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

                    {canReview && (
                        <SectionCard title="Conferência" description="Fila para aprovar, rejeitar ou cancelar registros do dia.">
                            <div className="space-y-4">
                                <div>
                                    <h3 className="mb-2 text-sm font-semibold text-[#28352c]">Fabricações pendentes</h3>
                                    <div className="space-y-2">
                                        {fabrications.filter((item) => item.status === 'PENDING').map((item) => (
                                            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3">
                                                <div>
                                                    <p className="text-sm font-medium text-[#28352c]">{item.batchCode}</p>
                                                    <p className="text-xs text-[#6b7280]">{item.preparedFeed?.name} • {formatNumber(item.outputNaturalKg)} kg</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="button" className="rounded-lg bg-[#64704f] px-3 py-2 text-xs font-medium text-white" onClick={() => runAction(async () => { await approveNutritionFabrication(item.id); }, 'Fabricação aprovada.')}>Aprovar</button>
                                                    <button type="button" className="rounded-lg border border-[#d8d2c7] bg-white px-3 py-2 text-xs font-medium text-[#28352c]" onClick={() => {
                                                        const reason = askReason('Motivo do cancelamento da fabricação');
                                                        if (reason) {
                                                            runAction(async () => { await cancelNutritionFabrication(item.id, reason); }, 'Fabricação cancelada.');
                                                        }
                                                    }}>Cancelar</button>
                                                </div>
                                            </div>
                                        ))}
                                        {fabrications.filter((item) => item.status === 'PENDING').length === 0 && <p className="text-sm text-[#6b7280]">Nenhuma fabricação pendente.</p>}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="mb-2 text-sm font-semibold text-[#28352c]">Tratos pendentes ou rejeitados</h3>
                                    <div className="space-y-2">
                                        {executions.filter((item) => item.reviewStatus === 'PENDING' || item.rejectedAt).map((item) => (
                                            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3">
                                                <div>
                                                    <p className="text-sm font-medium text-[#28352c]">{item.unit?.name || 'Unidade'}</p>
                                                    <p className="text-xs text-[#6b7280]">{formatNumber(item.actualNaturalKg)} kg • {formatDateTime(item.date)}</p>
                                                    {item.rejectionReason && <p className="text-xs text-red-600">Rejeição: {item.rejectionReason}</p>}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="button" className="rounded-lg bg-[#64704f] px-3 py-2 text-xs font-medium text-white" onClick={() => runAction(async () => { await approveNutritionExecution(item.id); }, 'Trato aprovado.')}>Aprovar</button>
                                                    <button type="button" className="rounded-lg border border-[#d8d2c7] bg-white px-3 py-2 text-xs font-medium text-[#28352c]" onClick={() => {
                                                        const reason = askReason('Motivo da rejeição do trato');
                                                        if (reason) {
                                                            runAction(async () => { await rejectNutritionExecution(item.id, reason); }, 'Trato rejeitado.');
                                                        }
                                                    }}>Rejeitar</button>
                                                    <button type="button" className="rounded-lg border border-[#d8d2c7] bg-white px-3 py-2 text-xs font-medium text-[#28352c]" onClick={() => {
                                                        const reason = askReason('Motivo do cancelamento do trato');
                                                        if (reason) {
                                                            runAction(async () => { await cancelNutritionExecution(item.id, reason); }, 'Trato cancelado.');
                                                        }
                                                    }}>Cancelar</button>
                                                </div>
                                            </div>
                                        ))}
                                        {executions.filter((item) => item.reviewStatus === 'PENDING' || item.rejectedAt).length === 0 && <p className="text-sm text-[#6b7280]">Nenhum trato pendente ou rejeitado.</p>}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="mb-2 text-sm font-semibold text-[#28352c]">Leituras pendentes ou rejeitadas</h3>
                                    <div className="space-y-2">
                                        {troughReadings.filter((item) => item.reviewStatus === 'PENDING' || item.rejectedAt).map((item) => (
                                            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3">
                                                <div>
                                                    <p className="text-sm font-medium text-[#28352c]">{item.unit?.name || 'Unidade'}</p>
                                                    <p className="text-xs text-[#6b7280]">Score {item.score} • {formatDateTime(item.date)}</p>
                                                    {item.rejectionReason && <p className="text-xs text-red-600">Rejeição: {item.rejectionReason}</p>}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="button" className="rounded-lg bg-[#64704f] px-3 py-2 text-xs font-medium text-white" onClick={() => runAction(async () => { await approveNutritionTroughReading(item.id); }, 'Leitura aprovada.')}>Aprovar</button>
                                                    <button type="button" className="rounded-lg border border-[#d8d2c7] bg-white px-3 py-2 text-xs font-medium text-[#28352c]" onClick={() => {
                                                        const reason = askReason('Motivo da rejeição da leitura');
                                                        if (reason) {
                                                            runAction(async () => { await rejectNutritionTroughReading(item.id, reason); }, 'Leitura rejeitada.');
                                                        }
                                                    }}>Rejeitar</button>
                                                </div>
                                            </div>
                                        ))}
                                        {troughReadings.filter((item) => item.reviewStatus === 'PENDING' || item.rejectedAt).length === 0 && <p className="text-sm text-[#6b7280]">Nenhuma leitura pendente ou rejeitada.</p>}
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    )}
                </div>
            )}

            {view === 'Configuração' && (
                <div className="space-y-6">
                    <SectionCard title="Parâmetros" description="Regra operacional da fazenda, aprovação e limites de alerta.">
                        <form className="grid gap-4 lg:grid-cols-3" onSubmit={handleSaveSettings}>
                            <Field label="Contexto operacional">
                                <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.operationContext} onChange={(event) => setSettingsForm((current) => ({ ...current, operationContext: event.target.value }))}>
                                    <option value="CONFINAMENTO">Confinamento</option>
                                    <option value="PASTO">Pasto</option>
                                    <option value="SEMI_CONFINAMENTO">Semi-confinamento</option>
                                </select>
                            </Field>
                            <Field label="Modo de ajuste">
                                <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.adjustmentMode} onChange={(event) => setSettingsForm((current) => ({ ...current, adjustmentMode: event.target.value }))}>
                                    <option value="SUGESTAO">Sugestão</option>
                                    <option value="REVISAO_OBRIGATORIA">Revisão obrigatória</option>
                                    <option value="AUTOMATICO">Automático</option>
                                </select>
                            </Field>
                            <Field label="Indicador oficial">
                                <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.indicatorsApprovedOnly ? 'APPROVED' : 'ALL'} onChange={(event) => setSettingsForm((current) => ({ ...current, indicatorsApprovedOnly: event.target.value === 'APPROVED' }))}>
                                    <option value="ALL">Considerar tudo</option>
                                    <option value="APPROVED">Só dados aprovados</option>
                                </select>
                            </Field>
                            <Field label="Dias seguros de estoque">
                                <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.predictiveSafeDays} onChange={(event) => setSettingsForm((current) => ({ ...current, predictiveSafeDays: Number(event.target.value) }))} />
                            </Field>
                            <Field label="Dias de atenção">
                                <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.predictiveWarningDays} onChange={(event) => setSettingsForm((current) => ({ ...current, predictiveWarningDays: Number(event.target.value) }))} />
                            </Field>
                            <Field label="Limite de revisão humana (%)">
                                <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.manualReviewThresholdPercent} onChange={(event) => setSettingsForm((current) => ({ ...current, manualReviewThresholdPercent: Number(event.target.value) }))} />
                            </Field>
                            <Field label="Diferença de atenção (%)">
                                <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.diffWarningPercent} onChange={(event) => setSettingsForm((current) => ({ ...current, diffWarningPercent: Number(event.target.value) }))} />
                            </Field>
                            <Field label="Diferença crítica (%)">
                                <input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={settingsForm.diffCriticalPercent} onChange={(event) => setSettingsForm((current) => ({ ...current, diffCriticalPercent: Number(event.target.value) }))} />
                            </Field>
                            <div className="flex items-end">
                                <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar parâmetros</button>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-[#374151]">
                                <input type="checkbox" checked={settingsForm.requireFabricationApproval} onChange={(event) => setSettingsForm((current) => ({ ...current, requireFabricationApproval: event.target.checked }))} />
                                Fabricação nasce pendente
                            </label>
                            <label className="flex items-center gap-2 text-sm text-[#374151]">
                                <input type="checkbox" checked={settingsForm.requireExecutionApproval} onChange={(event) => setSettingsForm((current) => ({ ...current, requireExecutionApproval: event.target.checked }))} />
                                Trato nasce pendente
                            </label>
                            <label className="flex items-center gap-2 text-sm text-[#374151]">
                                <input type="checkbox" checked={settingsForm.requireTroughApproval} onChange={(event) => setSettingsForm((current) => ({ ...current, requireTroughApproval: event.target.checked }))} />
                                Leitura de cocho nasce pendente
                            </label>
                        </form>
                    </SectionCard>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <SectionCard title="Ingredientes" description="Item comprado, como milho ou farelo.">
                            <form className="grid gap-3" onSubmit={handleCreateIngredient}>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Field label="Nome"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.name} onChange={(event) => setIngredientForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                                    <Field label="Categoria"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.category} onChange={(event) => setIngredientForm((current) => ({ ...current, category: event.target.value }))} /></Field>
                                    <Field label="Unidade"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.unit} onChange={(event) => setIngredientForm((current) => ({ ...current, unit: event.target.value }))} /></Field>
                                    <Field label="Custo por unidade"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.cost} onChange={(event) => setIngredientForm((current) => ({ ...current, cost: event.target.value }))} /></Field>
                                    <Field label="Matéria seca (%)" helper="Parte realmente nutritiva do alimento."><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.dryMatterPercent} onChange={(event) => setIngredientForm((current) => ({ ...current, dryMatterPercent: event.target.value }))} /></Field>
                                    <Field label="Fornecedor"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.supplier} onChange={(event) => setIngredientForm((current) => ({ ...current, supplier: event.target.value }))} /></Field>
                                    <Field label="Estoque atual (kg matéria natural)"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.stockNatural} onChange={(event) => setIngredientForm((current) => ({ ...current, stockNatural: event.target.value }))} /></Field>
                                    <Field label="Estoque mínimo (kg matéria natural)"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={ingredientForm.minStockNatural} onChange={(event) => setIngredientForm((current) => ({ ...current, minStockNatural: event.target.value }))} /></Field>
                                </div>
                                <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar ingrediente</button>
                            </form>
                            <div className="mt-4 space-y-2">
                                {ingredients.slice(0, 8).map((item) => (
                                    <div key={item.id} className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#28352c]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-xs text-[#6b7280]">{item.category} • MS {formatNumber(item.currentDryMatterPercent)}%</p>
                                            </div>
                                            <div className="text-right">
                                                <p>{formatNumber(item.currentStockNatural)} kg</p>
                                                <p className="text-xs text-[#6b7280]">{formatCurrency(item.currentCost)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>

                        <SectionCard title="Ração preparada" description="Mistura feita com ingredientes.">
                            <form className="grid gap-3" onSubmit={handleCreatePreparedFeed}>
                                <Field label="Nome"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={preparedFeedForm.name} onChange={(event) => setPreparedFeedForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                                <Field label="Rendimento total (kg matéria natural)"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={preparedFeedForm.expectedYieldNaturalKg} onChange={(event) => setPreparedFeedForm((current) => ({ ...current, expectedYieldNaturalKg: event.target.value }))} /></Field>
                                <div className="space-y-2">
                                    {preparedFeedForm.items.map((item, index) => (
                                        <div key={index} className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
                                            <Field label={`Ingrediente ${index + 1}`}>
                                                <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={item.ingredientId} onChange={(event) => handlePreparedFeedItemChange(index, 'ingredientId', event.target.value)}>
                                                    <option value="">Selecione</option>
                                                    {ingredients.filter((ingredient) => ingredient.active).map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
                                                </select>
                                            </Field>
                                            <Field label="Proporção (%)"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={item.proportionPercent} onChange={(event) => handlePreparedFeedItemChange(index, 'proportionPercent', event.target.value)} /></Field>
                                            <div className="flex items-end">
                                                <button type="button" className="rounded-xl border border-[#d8d2c7] bg-white px-3 py-2 text-sm text-[#28352c]" onClick={() => setPreparedFeedForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) || [] }))}>Remover</button>
                                            </div>
                                        </div>
                                    ))}
                                    <button type="button" className="rounded-xl border border-[#d8d2c7] bg-white px-3 py-2 text-sm text-[#28352c]" onClick={() => setPreparedFeedForm((current) => ({ ...current, items: [...current.items, { ingredientId: '', proportionPercent: '' }] }))}>Adicionar ingrediente</button>
                                </div>
                                <Field label="Observação"><textarea className="rounded-xl border border-[#d8d2c7] px-3 py-2" rows={2} value={preparedFeedForm.notes} onChange={(event) => setPreparedFeedForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
                                <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar ração preparada</button>
                            </form>
                            <div className="mt-4 space-y-2">
                                {preparedFeeds.slice(0, 8).map((item) => (
                                    <div key={item.id} className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#28352c]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className="text-xs text-[#6b7280]">MS {formatNumber(item.currentDryMatterPercent)}% • custo {formatCurrency(item.currentTotalCost)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p>{formatNumber(item.currentStockNatural)} kg</p>
                                                <p className="text-xs text-[#6b7280]">{formatCurrency(item.currentCostPerNaturalKg)}/kg</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <SectionCard title="Fase do lote e unidade operacional" description="No confinamento a unidade principal é a baia. No pasto e semi-confinamento, o lote ou ponto de trato.">
                            <div className="grid gap-6 lg:grid-cols-2">
                                <form className="grid gap-3" onSubmit={handleCreatePhase}>
                                    <Field label="Nome da fase"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={phaseForm.name} onChange={(event) => setPhaseForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                                    <Field label="Meta de consumo MS/cabeça"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={phaseForm.targetIntakeDryKgHead} onChange={(event) => setPhaseForm((current) => ({ ...current, targetIntakeDryKgHead: event.target.value }))} /></Field>
                                    <Field label="Meta de GMD"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={phaseForm.targetGmd} onChange={(event) => setPhaseForm((current) => ({ ...current, targetGmd: event.target.value }))} /></Field>
                                    <Field label="Meta de conversão"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={phaseForm.targetFeedConversion} onChange={(event) => setPhaseForm((current) => ({ ...current, targetFeedConversion: event.target.value }))} /></Field>
                                    <Field label="Custo-alvo por cabeça/dia"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={phaseForm.targetCostPerHeadDay} onChange={(event) => setPhaseForm((current) => ({ ...current, targetCostPerHeadDay: event.target.value }))} /></Field>
                                    <Field label="Observação"><textarea className="rounded-xl border border-[#d8d2c7] px-3 py-2" rows={2} value={phaseForm.notes} onChange={(event) => setPhaseForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
                                    <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar fase</button>
                                </form>
                                <form className="grid gap-3" onSubmit={handleCreateUnit}>
                                    <Field label="Tipo da unidade">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={unitForm.type} onChange={(event) => setUnitForm((current) => ({ ...current, type: event.target.value }))}>
                                            {settingsForm.operationContext === 'CONFINAMENTO' ? <option value="BAIA">Baia</option> : <>
                                                <option value="LOTE">Lote</option>
                                                <option value="PONTO_TRATO">Ponto de trato</option>
                                            </>}
                                        </select>
                                    </Field>
                                    <Field label="Lote vinculado">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={unitForm.lotId} onChange={(event) => setUnitForm((current) => ({ ...current, lotId: event.target.value }))}>
                                            <option value="">Sem vínculo</option>
                                            {lots.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Fase do lote">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={unitForm.phaseId} onChange={(event) => setUnitForm((current) => ({ ...current, phaseId: event.target.value }))}>
                                            <option value="">Sem fase</option>
                                            {phases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Nome exibido"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Baia 01" /></Field>
                                    <Field label="Cabeças informadas"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={unitForm.currentHeadCount} onChange={(event) => setUnitForm((current) => ({ ...current, currentHeadCount: event.target.value }))} /></Field>
                                    <Field label="Observação"><textarea className="rounded-xl border border-[#d8d2c7] px-3 py-2" rows={2} value={unitForm.notes} onChange={(event) => setUnitForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
                                    <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar unidade</button>
                                </form>
                            </div>
                        </SectionCard>

                        <SectionCard title="Plano de trato e vínculo" description="Define o que cada unidade deve receber.">
                            <div className="grid gap-6 lg:grid-cols-2">
                                <form className="grid gap-3" onSubmit={handleCreatePlan}>
                                    <Field label="Nome do plano"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.nome} onChange={(event) => setPlanForm((current) => ({ ...current, nome: event.target.value }))} /></Field>
                                    <Field label="Objetivo"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.objetivo} onChange={(event) => setPlanForm((current) => ({ ...current, objetivo: event.target.value }))} /></Field>
                                    <Field label="Ração preparada principal">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.preparedFeedId} onChange={(event) => setPlanForm((current) => ({ ...current, preparedFeedId: event.target.value }))}>
                                            <option value="">Selecione</option>
                                            {preparedFeeds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Fase do lote">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.phaseId} onChange={(event) => setPlanForm((current) => ({ ...current, phaseId: event.target.value }))}>
                                            <option value="">Sem fase</option>
                                            {phases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <Field label="Início"><input type="datetime-local" className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.startAt} onChange={(event) => setPlanForm((current) => ({ ...current, startAt: event.target.value }))} /></Field>
                                        <Field label="Fim"><input type="datetime-local" className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.endAt} onChange={(event) => setPlanForm((current) => ({ ...current, endAt: event.target.value }))} /></Field>
                                    </div>
                                    <Field label="Trato"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.feedingSlot} onChange={(event) => setPlanForm((current) => ({ ...current, feedingSlot: event.target.value }))} placeholder="Ex.: Trato 1" /></Field>
                                    <Field label="Consumo por cabeça (kg matéria natural)"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.plannedIntakeNaturalKgPerHead} onChange={(event) => setPlanForm((current) => ({ ...current, plannedIntakeNaturalKgPerHead: event.target.value }))} /></Field>
                                    <Field label="Consumo por unidade (kg matéria natural)"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.plannedIntakeNaturalKgTotal} onChange={(event) => setPlanForm((current) => ({ ...current, plannedIntakeNaturalKgTotal: event.target.value }))} /></Field>
                                    <Field label="Custo estimado por cabeça/dia"><input className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={planForm.estimatedCostPerHeadDay} onChange={(event) => setPlanForm((current) => ({ ...current, estimatedCostPerHeadDay: event.target.value }))} /></Field>
                                    <Field label="Observação"><textarea className="rounded-xl border border-[#d8d2c7] px-3 py-2" rows={2} value={planForm.observacoes} onChange={(event) => setPlanForm((current) => ({ ...current, observacoes: event.target.value }))} /></Field>
                                    <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar plano</button>
                                </form>
                                <form className="grid gap-3" onSubmit={handleCreateAssignment}>
                                    <Field label="Plano de trato">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={assignmentForm.planId} onChange={(event) => setAssignmentForm((current) => ({ ...current, planId: event.target.value }))}>
                                            <option value="">Selecione</option>
                                            {plans.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Baia, lote ou ponto de trato">
                                        <select className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={assignmentForm.unitId} onChange={(event) => setAssignmentForm((current) => ({ ...current, unitId: event.target.value }))}>
                                            <option value="">Selecione</option>
                                            {units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Início"><input type="datetime-local" className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={assignmentForm.startAt} onChange={(event) => setAssignmentForm((current) => ({ ...current, startAt: event.target.value }))} /></Field>
                                    <Field label="Fim"><input type="datetime-local" className="rounded-xl border border-[#d8d2c7] px-3 py-2" value={assignmentForm.endAt} onChange={(event) => setAssignmentForm((current) => ({ ...current, endAt: event.target.value }))} /></Field>
                                    <button disabled={saving} className="rounded-xl bg-[#64704f] px-4 py-2 text-sm font-medium text-white" type="submit">Salvar vínculo</button>
                                </form>
                            </div>
                        </SectionCard>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NutritionModule;
