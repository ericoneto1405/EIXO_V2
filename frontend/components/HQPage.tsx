import React from 'react';
import { buildApiUrl } from '../api';

type TabKey = 'clientes' | 'metricas' | 'pipeline' | 'suporte' | 'cadastro';

interface HQCliente {
    id: string;
    name: string;
    slug: string;
    owner: { name: string; email: string } | null;
    plan: string;
    billingStatus: string | null;
    accessState: string;
    totalAnimals: number;
    totalFarms: number;
    createdAt: string;
}

interface HQMetricas {
    totalOrgs: number;
    totalUsers: number;
    totalAnimals: number;
    paidClients: number;
    freeClients: number;
    conversionRate: string;
    recentSignups: number;
}

interface HQPipelineItem {
    id: string;
    name: string;
    owner: { name: string; email: string; phone: string | null } | null;
    diasNoSistema: number;
    totalFarms: number;
    createdAt: string;
}

interface HQSuporteItem {
    conversationId: string;
    user: { id?: string | null; name: string | null; email: string | null } | null;
    lastMessage: string;
    lastAction: string;
    lastAt: string;
    totalMessages: number;
    humanRequested: boolean;
    assumedByAdmin: boolean;
    resolved?: boolean;
    needsReview: boolean;
    fallbackReason: string | null;
    knowledgeVersion?: string | null;
    topicIds?: string[];
    confidence?: number | null;
    responseType?: string | null;
    provider?: string | null;
    currentPath?: string | null;
    farmId?: string | null;
    organizationId?: string | null;
    organizationName?: string | null;
    knowledgeSuggestionAt?: string | null;
    farmName?: string | null;
    supportContext?: {
        planCode?: string | null;
        billingAccessState?: string | null;
        accessType?: string | null;
        allowedModules?: string[];
        entitlements?: string[];
    } | null;
}

interface HQSupportMetrics {
    rawTotalConversations: number;
    rawHumanConversations: number;
    rawHumanRate: number;
    excludedConversations: number;
    totalConversations: number;
    humanConversations: number;
    humanRate: number;
    automationRate: number;
    fallbackConversations: number;
    fallbackRate: number;
    resolvedFeedback: number;
    unresolvedFeedback: number;
    feedbackResolutionRate: number;
    repeatedConversations: number;
    repeatRate: number;
    uncoveredConversations: number;
    uncoveredRate: number;
    satisfactionResponses: number;
    satisfactionAverage: number;
    satisfactionSampleReached: boolean;
    evaluationAccuracy: number;
    linkValidityRate: number;
    targetHumanRate: number;
    targetReached: boolean;
    minimumSampleReached: boolean;
}

interface HQSupportFilterOptions {
    organizations: Array<{ id: string; name: string }>;
    farms: Array<{ id: string; name: string }>;
    topicIds: string[];
    reasons: string[];
}

const FALLBACK_REASON_LABELS: Record<string, string> = {
    low_confidence: 'IA sem certeza',
    ai_error: 'Erro técnico na IA',
    ai_unavailable: 'IA indisponível',
    invalid_link: 'Link inválido na resposta',
    uncovered: 'Dúvida sem cobertura',
    rollout_shadow: 'Comparação silenciosa',
    rollout_pilot_control: 'Fora do grupo piloto',
    human_requested: 'Cliente pediu atendimento',
};

type SupportFilter = 'todas' | 'revisao' | 'revisadas';

interface HQSuporteMessage {
    id: string;
    action: string;
    text: string;
    createdAt: string;
    farmId?: string | null;
    metadata?: {
        knowledgeVersion?: string | null;
        intent?: string | null;
        topicIds?: string[];
        confidence?: number | null;
        recommendedLink?: string | null;
        responseType?: string | null;
        provider?: string | null;
        escalationReason?: string | null;
        currentPath?: string | null;
        rating?: number | null;
        feedbackReason?: string | null;
        context?: HQSuporteItem['supportContext'];
    } | null;
    user: { id: string; name: string | null; email: string | null } | null;
}

interface HQCadastroItem {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    document: string | null;
    documentType: string | null;
    createdAt: string;
    roles: string[];
}

const TAB_LABELS: Array<{ key: TabKey; label: string }> = [
    { key: 'clientes', label: 'Clientes' },
    { key: 'metricas', label: 'Métricas' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'suporte', label: 'Suporte' },
    { key: 'cadastro', label: 'Cadastro' },
];

const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return '-';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

const getSuporteContent = (item: HQSuporteItem) => {
    if (item.lastMessage?.trim()) return item.lastMessage;
    if (item.lastAction?.trim()) return item.lastAction;
    return 'Sem conteúdo disponível.';
};

const HQPage: React.FC = () => {
    const [activeTab, setActiveTab] = React.useState<TabKey>('clientes');
    const [clientes, setClientes] = React.useState<HQCliente[]>([]);
    const [metricas, setMetricas] = React.useState<HQMetricas | null>(null);
    const [pipeline, setPipeline] = React.useState<HQPipelineItem[]>([]);
    const [suporte, setSuporte] = React.useState<HQSuporteItem[]>([]);
    const [supportMetrics, setSupportMetrics] = React.useState<HQSupportMetrics | null>(null);
    const [supportKnowledgeVersion, setSupportKnowledgeVersion] = React.useState<string>('');
    const [supportRolloutMode, setSupportRolloutMode] = React.useState<string>('');
    const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null);
    const [supportMessages, setSupportMessages] = React.useState<HQSuporteMessage[]>([]);
    const [supportAssumed, setSupportAssumed] = React.useState(false);
    const [supportResolved, setSupportResolved] = React.useState(false);
    const [supportReply, setSupportReply] = React.useState('');
    const [supportActionLoading, setSupportActionLoading] = React.useState(false);
    const [supportFilter, setSupportFilter] = React.useState<SupportFilter>('todas');
    const [supportDays, setSupportDays] = React.useState(30);
    const [supportOrganizationId, setSupportOrganizationId] = React.useState('');
    const [supportFarmId, setSupportFarmId] = React.useState('');
    const [supportTopicId, setSupportTopicId] = React.useState('');
    const [supportReason, setSupportReason] = React.useState('');
    const [supportFilterOptions, setSupportFilterOptions] = React.useState<HQSupportFilterOptions>({
        organizations: [],
        farms: [],
        topicIds: [],
        reasons: [],
    });
    const [supportPage, setSupportPage] = React.useState(1);
    const [supportHasMore, setSupportHasMore] = React.useState(false);
    const [cadastro, setCadastro] = React.useState<HQCadastroItem[]>([]);
    const [search, setSearch] = React.useState('');
    const [loadingByTab, setLoadingByTab] = React.useState<Record<TabKey, boolean>>({
        clientes: false,
        metricas: false,
        pipeline: false,
        suporte: false,
        cadastro: false,
    });
    const [loadedByTab, setLoadedByTab] = React.useState<Record<TabKey, boolean>>({
        clientes: false,
        metricas: false,
        pipeline: false,
        suporte: false,
        cadastro: false,
    });
    const [errorByTab, setErrorByTab] = React.useState<Record<TabKey, string | null>>({
        clientes: null,
        metricas: null,
        pipeline: null,
        suporte: null,
        cadastro: null,
    });
    const [planModalOrg, setPlanModalOrg] = React.useState<HQCliente | null>(null);
    const [planForm, setPlanForm] = React.useState<{ planCode: string; billingStatus: string }>({
        planCode: 'GRATIS',
        billingStatus: 'ACTIVE',
    });
    const [planSaving, setPlanSaving] = React.useState(false);
    const [planError, setPlanError] = React.useState<string | null>(null);

    const loadTab = React.useCallback(async (tab: TabKey, force = false) => {
        if (loadingByTab[tab]) {
            return;
        }
        if (loadedByTab[tab] && !force) {
            return;
        }

        setLoadingByTab((current) => ({ ...current, [tab]: true }));
        setErrorByTab((current) => ({ ...current, [tab]: null }));

        try {
            if (tab === 'clientes') {
                const response = await fetch(buildApiUrl('/api/hq/clientes'), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar clientes.');
                setClientes(Array.isArray(payload?.clientes) ? payload.clientes : []);
            }

            if (tab === 'metricas') {
                const response = await fetch(buildApiUrl('/api/hq/metricas'), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar métricas.');
                setMetricas(payload || null);
            }

            if (tab === 'pipeline') {
                const response = await fetch(buildApiUrl('/api/hq/pipeline'), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar pipeline.');
                const rows = Array.isArray(payload?.pipeline) ? payload.pipeline : [];
                const sorted = rows
                    .slice()
                    .sort((first: HQPipelineItem, second: HQPipelineItem) => second.diasNoSistema - first.diasNoSistema);
                setPipeline(sorted);
            }

            if (tab === 'suporte') {
                const supportQuery = new URLSearchParams({
                    page: String(supportPage),
                    limit: '50',
                    days: String(supportDays),
                });
                if (supportOrganizationId) supportQuery.set('organizationId', supportOrganizationId);
                if (supportFarmId) supportQuery.set('farmId', supportFarmId);
                if (supportTopicId) supportQuery.set('topicId', supportTopicId);
                if (supportReason) supportQuery.set('reason', supportReason);
                const [supportResponse, metricsResponse, filtersResponse] = await Promise.all([
                    fetch(buildApiUrl(`/api/hq/suporte?${supportQuery.toString()}`), { credentials: 'include' }),
                    fetch(buildApiUrl(`/api/hq/suporte/metricas?days=${supportDays}`), { credentials: 'include' }),
                    fetch(buildApiUrl('/api/hq/suporte/filtros'), { credentials: 'include' }),
                ]);
                const [supportPayload, metricsPayload, filtersPayload] = await Promise.all([
                    supportResponse.json().catch(() => ({})),
                    metricsResponse.json().catch(() => ({})),
                    filtersResponse.json().catch(() => ({})),
                ]);
                if (!supportResponse.ok) throw new Error(supportPayload?.message || 'Erro ao carregar suporte.');
                if (!metricsResponse.ok) throw new Error(metricsPayload?.message || 'Erro ao carregar métricas do suporte.');
                if (!filtersResponse.ok) throw new Error(filtersPayload?.message || 'Erro ao carregar filtros do suporte.');
                setSuporte(Array.isArray(supportPayload?.suporte) ? supportPayload.suporte : []);
                setSupportHasMore(Boolean(supportPayload?.pagination?.hasMore));
                setSupportMetrics(metricsPayload?.metrics || null);
                setSupportKnowledgeVersion(String(metricsPayload?.knowledgeVersion || ''));
                setSupportRolloutMode(String(metricsPayload?.rolloutMode || ''));
                setSupportFilterOptions({
                    organizations: Array.isArray(filtersPayload?.organizations) ? filtersPayload.organizations : [],
                    farms: Array.isArray(filtersPayload?.farms) ? filtersPayload.farms : [],
                    topicIds: Array.isArray(filtersPayload?.topicIds) ? filtersPayload.topicIds : [],
                    reasons: Array.isArray(filtersPayload?.reasons) ? filtersPayload.reasons : [],
                });
            }

            if (tab === 'cadastro') {
                const response = await fetch(buildApiUrl('/api/hq/cadastro'), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar cadastro.');
                setCadastro(Array.isArray(payload?.cadastro) ? payload.cadastro : []);
            }

            setLoadedByTab((current) => ({ ...current, [tab]: true }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro ao carregar dados.';
            setErrorByTab((current) => ({ ...current, [tab]: message }));
        } finally {
            setLoadingByTab((current) => ({ ...current, [tab]: false }));
        }
    }, [loadedByTab, loadingByTab, supportDays, supportFarmId, supportOrganizationId, supportPage, supportReason, supportTopicId]);

    React.useEffect(() => {
        loadTab(activeTab);
    }, [activeTab, loadTab]);

    const loadSupportConversation = React.useCallback(async (conversationId: string) => {
        try {
            const response = await fetch(buildApiUrl(`/api/hq/suporte/${conversationId}/messages`), { credentials: 'include' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar conversa.');
            setSupportMessages(Array.isArray(payload?.messages) ? payload.messages : []);
            setSupportAssumed(Boolean(payload?.assumedByAdmin));
            setSupportResolved(Boolean(payload?.resolved));
        } catch {
            setSupportMessages([]);
            setSupportResolved(false);
        }
    }, []);

    React.useEffect(() => {
        if (activeTab !== 'suporte') return;
        const interval = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void loadTab('suporte', true);
                if (selectedConversationId) {
                    void loadSupportConversation(selectedConversationId);
                }
            }
        }, 10000);
        return () => window.clearInterval(interval);
    }, [activeTab, loadTab, selectedConversationId, loadSupportConversation]);

    const filteredCadastro = React.useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return cadastro;
        return cadastro.filter((user) => {
            const name = user.name?.toLowerCase() || '';
            const email = user.email?.toLowerCase() || '';
            return name.includes(term) || email.includes(term);
        });
    }, [cadastro, search]);

    const openPlanModal = (org: HQCliente) => {
        setPlanModalOrg(org);
        setPlanError(null);
        setPlanForm({
            planCode: String(org.plan || 'GRATIS').toUpperCase(),
            billingStatus: String(org.billingStatus || org.accessState || 'ACTIVE').toUpperCase(),
        });
    };

    const closePlanModal = () => {
        if (planSaving) return;
        setPlanModalOrg(null);
        setPlanError(null);
    };

    const savePlanForOrg = async () => {
        if (!planModalOrg) return;
        setPlanSaving(true);
        setPlanError(null);
        try {
            const response = await fetch(buildApiUrl(`/api/hq/clientes/${planModalOrg.id}/plan`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    planCode: planForm.planCode,
                    billingStatus: planForm.billingStatus,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.message || 'Não foi possível atualizar o plano.');
            await loadTab('clientes', true);
            setPlanModalOrg(null);
        } catch (error) {
            setPlanError(error instanceof Error ? error.message : 'Não foi possível atualizar o plano.');
        } finally {
            setPlanSaving(false);
        }
    };

    const renderClientes = () => (
        <div className="overflow-x-auto rounded-2xl border border-[#D7D7D7] bg-white">
            <table className="min-w-full text-sm text-[#2F2F2F]">
                <thead className="bg-[#F6F6F6] text-left text-xs font-bold uppercase tracking-wide text-[#5E5E5E]">
                    <tr>
                        <th className="px-4 py-3">Nome da org</th>
                        <th className="px-4 py-3">Dono</th>
                        <th className="px-4 py-3">Plano</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Fazendas</th>
                        <th className="px-4 py-3">Animais</th>
                        <th className="px-4 py-3">Cadastro</th>
                        <th className="px-4 py-3">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {clientes.map((org) => (
                        <tr key={org.id} className="border-t border-[#ECECEC]">
                            <td className="px-4 py-3 font-semibold">{org.name}</td>
                            <td className="px-4 py-3">
                                <p>{org.owner?.name || '-'}</p>
                                <p className="text-xs text-[#5E5E5E]">{org.owner?.email || '-'}</p>
                            </td>
                            <td className="px-4 py-3">{org.plan || 'GRATIS'}</td>
                            <td className="px-4 py-3">{org.billingStatus || org.accessState || '-'}</td>
                            <td className="px-4 py-3">{org.totalFarms}</td>
                            <td className="px-4 py-3">{org.totalAnimals}</td>
                            <td className="px-4 py-3">{formatDate(org.createdAt)}</td>
                            <td className="px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => openPlanModal(org)}
                                    className="rounded-xl border border-[#D7CAB3] bg-[#fffaf1] px-3 py-1.5 text-xs font-semibold text-[#2F3A2D] hover:bg-[#f4ead8]"
                                >
                                    Gerenciar plano
                                </button>
                            </td>
                        </tr>
                    ))}
                    {!clientes.length && (
                        <tr>
                            <td className="px-4 py-6 text-center text-[#5E5E5E]" colSpan={8}>Nenhum cliente encontrado.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderMetricas = () => {
        const cards = [
            { label: 'Total de orgs', value: metricas?.totalOrgs ?? 0 },
            { label: 'Clientes pagos', value: metricas?.paidClients ?? 0 },
            { label: 'Clientes grátis', value: metricas?.freeClients ?? 0 },
            { label: 'Taxa de conversão (%)', value: `${metricas?.conversionRate ?? '0'}%` },
            { label: 'Total de usuários', value: metricas?.totalUsers ?? 0 },
            { label: 'Total de animais', value: metricas?.totalAnimals ?? 0 },
            { label: 'Novos cadastros (últimos 6 meses)', value: metricas?.recentSignups ?? 0 },
        ];

        return (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                    <div key={card.label} className="rounded-2xl border border-[#D7D7D7] bg-white p-5">
                        <p className="text-sm font-semibold text-[#5E5E5E]">{card.label}</p>
                        <p className="mt-2 text-3xl font-extrabold text-[#2F2F2F]">{card.value}</p>
                    </div>
                ))}
            </div>
        );
    };

    const renderPipeline = () => (
        <div className="overflow-x-auto rounded-2xl border border-[#D7D7D7] bg-white">
            <table className="min-w-full text-sm text-[#2F2F2F]">
                <thead className="bg-[#F6F6F6] text-left text-xs font-bold uppercase tracking-wide text-[#5E5E5E]">
                    <tr>
                        <th className="px-4 py-3">Nome da org</th>
                        <th className="px-4 py-3">Dono</th>
                        <th className="px-4 py-3">Telefone</th>
                        <th className="px-4 py-3">Dias no sistema</th>
                        <th className="px-4 py-3">Fazendas cadastradas</th>
                        <th className="px-4 py-3">Data de entrada</th>
                    </tr>
                </thead>
                <tbody>
                    {pipeline.map((lead) => (
                        <tr key={lead.id} className="border-t border-[#ECECEC]">
                            <td className="px-4 py-3 font-semibold">{lead.name}</td>
                            <td className="px-4 py-3">
                                <p>{lead.owner?.name || '-'}</p>
                                <p className="text-xs text-[#5E5E5E]">{lead.owner?.email || '-'}</p>
                            </td>
                            <td className="px-4 py-3">{lead.owner?.phone || '-'}</td>
                            <td className="px-4 py-3">{lead.diasNoSistema}</td>
                            <td className="px-4 py-3">{lead.totalFarms}</td>
                            <td className="px-4 py-3">{formatDate(lead.createdAt)}</td>
                        </tr>
                    ))}
                    {!pipeline.length && (
                        <tr>
                            <td className="px-4 py-6 text-center text-[#5E5E5E]" colSpan={6}>Nenhum lead encontrado.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const filteredSuporte = React.useMemo(() => {
        if (supportFilter === 'revisao') return suporte.filter((item) => item.needsReview);
        if (supportFilter === 'revisadas') return suporte.filter((item) => item.fallbackReason && !item.needsReview);
        return suporte;
    }, [suporte, supportFilter]);

    const selectedSupportItem = suporte.find((item) => item.conversationId === selectedConversationId) || null;

    const changeSupportQuery = (change: () => void) => {
        change();
        setSupportPage(1);
        setSelectedConversationId(null);
        setLoadedByTab((current) => ({ ...current, suporte: false }));
    };

    const renderSuporte = () => {
        const metricCards = supportMetrics ? [
            { label: 'Autoatendimento', value: `${supportMetrics.automationRate.toFixed(2)}%`, detail: 'Meta: 99% ou mais' },
            { label: 'Atendimento humano elegível', value: `${supportMetrics.humanRate.toFixed(2)}%`, detail: `Bruto: ${supportMetrics.rawHumanRate.toFixed(2)}% · ${supportMetrics.excludedConversations} caso(s) separado(s)` },
            { label: 'Fallback da IA', value: `${supportMetrics.fallbackRate.toFixed(2)}%`, detail: `${supportMetrics.fallbackConversations} conversa(s)` },
            { label: 'Resolução confirmada', value: `${supportMetrics.feedbackResolutionRate.toFixed(2)}%`, detail: `${supportMetrics.resolvedFeedback + supportMetrics.unresolvedFeedback} avaliação(ões)` },
            { label: 'Satisfação', value: supportMetrics.satisfactionResponses ? `${supportMetrics.satisfactionAverage.toFixed(2)}/5` : '-', detail: `${supportMetrics.satisfactionResponses} avaliação(ões); meta: 4,5` },
            { label: 'Repetição', value: `${supportMetrics.repeatRate.toFixed(2)}%`, detail: `${supportMetrics.repeatedConversations} conversa(s) com nova tentativa` },
            { label: 'Sem cobertura', value: `${supportMetrics.uncoveredRate.toFixed(2)}%`, detail: `${supportMetrics.uncoveredConversations} conversa(s)` },
            { label: 'Avaliação automática', value: `${supportMetrics.evaluationAccuracy.toFixed(2)}%`, detail: `Links válidos: ${supportMetrics.linkValidityRate.toFixed(2)}%` },
        ] : [];

        const filterButtons: Array<{ key: SupportFilter; label: string }> = [
            { key: 'todas', label: 'Todas' },
            { key: 'revisao', label: `Precisa de revisão (${suporte.filter((item) => item.needsReview).length})` },
            { key: 'revisadas', label: 'Já revisadas' },
        ];
        const organizationOptions: Array<[string, string]> = supportFilterOptions.organizations.map((item) => [item.id, item.name]);
        const farmOptions: Array<[string, string]> = supportFilterOptions.farms.map((item) => [item.id, item.name]);
        const topicOptions = [...supportFilterOptions.topicIds];
        if (supportOrganizationId && !organizationOptions.some(([id]) => id === supportOrganizationId)) {
            organizationOptions.unshift([supportOrganizationId, supportOrganizationId]);
        }
        if (supportFarmId && !farmOptions.some(([id]) => id === supportFarmId)) {
            farmOptions.unshift([supportFarmId, supportFarmId]);
        }
        if (supportTopicId && !topicOptions.includes(supportTopicId)) topicOptions.unshift(supportTopicId);

        return (
            <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[#5E5E5E]">Conhecimento publicado: {supportKnowledgeVersion || '-'} · Implantação: {supportRolloutMode || '-'}</p>
                {supportMetrics && (
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${supportMetrics.targetReached ? 'bg-[#dff0b8] text-[#355000]' : 'bg-[#fff5dc] text-[#4b3500]'}`}>
                        {supportMetrics.targetReached
                            ? 'Meta de 1% atingida'
                            : supportMetrics.minimumSampleReached
                                ? supportMetrics.satisfactionSampleReached ? 'Meta completa ainda não atingida' : 'Faltam 100 avaliações de satisfação'
                                : 'Amostra abaixo de 500 conversas'}
                    </span>
                )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {metricCards.map((card) => (
                    <div key={card.label} className="rounded-2xl border border-[#D7D7D7] bg-white p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#5E5E5E]">{card.label}</p>
                        <p className="mt-2 text-2xl font-bold text-[#2F2F2F]">{card.value}</p>
                        <p className="mt-1 text-xs text-[#5E5E5E]">{card.detail}</p>
                    </div>
                ))}
            </div>
            <div className="grid gap-2 rounded-2xl border border-[#D7D7D7] bg-white p-3 sm:grid-cols-2 xl:grid-cols-5">
                <select
                    value={supportDays}
                    onChange={(event) => changeSupportQuery(() => setSupportDays(Number(event.target.value)))}
                    className="rounded-xl border border-[#D7D7D7] bg-white px-3 py-2 text-xs"
                    aria-label="Período do suporte"
                >
                    <option value={7}>Últimos 7 dias</option>
                    <option value={30}>Últimos 30 dias</option>
                    <option value={90}>Últimos 90 dias</option>
                </select>
                <select
                    value={supportOrganizationId}
                    onChange={(event) => changeSupportQuery(() => setSupportOrganizationId(event.target.value))}
                    className="rounded-xl border border-[#D7D7D7] bg-white px-3 py-2 text-xs"
                    aria-label="Organização do suporte"
                >
                    <option value="">Todas as organizações</option>
                    {organizationOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select
                    value={supportFarmId}
                    onChange={(event) => changeSupportQuery(() => setSupportFarmId(event.target.value))}
                    className="rounded-xl border border-[#D7D7D7] bg-white px-3 py-2 text-xs"
                    aria-label="Fazenda do suporte"
                >
                    <option value="">Todas as fazendas</option>
                    {farmOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select
                    value={supportTopicId}
                    onChange={(event) => changeSupportQuery(() => setSupportTopicId(event.target.value))}
                    className="rounded-xl border border-[#D7D7D7] bg-white px-3 py-2 text-xs"
                    aria-label="Assunto do suporte"
                >
                    <option value="">Todos os assuntos</option>
                    {topicOptions.map((topicId) => <option key={topicId} value={topicId}>{topicId}</option>)}
                </select>
                <select
                    value={supportReason}
                    onChange={(event) => changeSupportQuery(() => setSupportReason(event.target.value))}
                    className="rounded-xl border border-[#D7D7D7] bg-white px-3 py-2 text-xs"
                    aria-label="Motivo do suporte"
                >
                    <option value="">Todos os motivos</option>
                    {supportFilterOptions.reasons.map((value) => <option key={value} value={value}>{FALLBACK_REASON_LABELS[value] || value}</option>)}
                </select>
            </div>
            <div className="flex flex-wrap gap-2">
                {filterButtons.map((filter) => (
                    <button
                        key={filter.key}
                        type="button"
                        onClick={() => setSupportFilter(filter.key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                            supportFilter === filter.key
                                ? 'bg-[#2F2F2F] text-white'
                                : 'border border-[#D7D7D7] bg-white text-[#5E5E5E] hover:bg-[#f2f2f2]'
                        }`}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
                <div className="overflow-x-auto rounded-2xl border border-[#D7D7D7] bg-white">
                    <table className="min-w-full text-sm text-[#2F2F2F]">
                        <thead className="bg-[#F6F6F6] text-left text-xs font-bold uppercase tracking-wide text-[#5E5E5E]">
                            <tr>
                                <th className="px-4 py-3">Usuário</th>
                                <th className="px-4 py-3">Última mensagem</th>
                                <th className="px-4 py-3">Data</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!filteredSuporte.length && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-[#5E5E5E]">
                                        Nenhuma conversa nesse filtro.
                                    </td>
                                </tr>
                            )}
                            {filteredSuporte.map((item) => (
                                <tr
                                    key={item.conversationId}
                                    className={`cursor-pointer border-t border-[#ECECEC] ${item.humanRequested ? 'bg-[#fff5dc]' : selectedConversationId === item.conversationId ? 'bg-[#f5f8ef]' : ''}`}
                                    onClick={() => {
                                        setSelectedConversationId(item.conversationId);
                                        void loadSupportConversation(item.conversationId);
                                    }}
                                >
                                    <td className="px-4 py-3">
                                        <p>{item.user?.name || '-'}</p>
                                        <p className="text-xs text-[#5E5E5E]">{item.user?.email || '-'}</p>
                                        {item.humanRequested && (
                                            <span className="mt-1 inline-flex rounded-full bg-[#f5b942] px-2 py-0.5 text-[10px] font-bold uppercase text-[#4b3500]">Aguardando especialista</span>
                                        )}
                                        {item.assumedByAdmin && (
                                            <span className="mt-1 inline-flex rounded-full bg-[#dff0b8] px-2 py-0.5 text-[10px] font-bold uppercase text-[#355000]">Em atendimento</span>
                                        )}
                                        {item.resolved && (
                                            <span className="mt-1 inline-flex rounded-full bg-[#ececec] px-2 py-0.5 text-[10px] font-bold uppercase text-[#4f4f4f]">Encerrado</span>
                                        )}
                                        {item.needsReview && (
                                            <span className="mt-1 inline-flex rounded-full bg-[#f7b2a3] px-2 py-0.5 text-[10px] font-bold uppercase text-[#6b1f10]">
                                                {FALLBACK_REASON_LABELS[item.fallbackReason || ''] || 'Precisa de revisão'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">{getSuporteContent(item)}</td>
                                    <td className="px-4 py-3">{formatDate(item.lastAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="flex items-center justify-between border-t border-[#ECECEC] px-4 py-3">
                        <button
                            type="button"
                            onClick={() => {
                                setSupportPage((current) => Math.max(1, current - 1));
                                setLoadedByTab((current) => ({ ...current, suporte: false }));
                            }}
                            disabled={supportPage === 1}
                            className="rounded-lg border border-[#D7D7D7] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                        >
                            Anterior
                        </button>
                        <span className="text-xs text-[#5E5E5E]">Página {supportPage}</span>
                        <button
                            type="button"
                            onClick={() => {
                                setSupportPage((current) => current + 1);
                                setLoadedByTab((current) => ({ ...current, suporte: false }));
                            }}
                            disabled={!supportHasMore}
                            className="rounded-lg border border-[#D7D7D7] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                        >
                            Próxima
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl border border-[#D7D7D7] bg-white p-4">
                    {!selectedConversationId ? (
                        <p className="text-sm text-[#5E5E5E]">Selecione uma conversa para acompanhar ao vivo.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-[#2F2F2F]">Conversa: {selectedConversationId}</p>
                                <div className="flex items-center gap-2">
                                    {supportResolved ? (
                                        <span className="rounded-full bg-[#ececec] px-3 py-1.5 text-xs font-bold text-[#4f4f4f]">Atendimento encerrado</span>
                                    ) : !supportAssumed ? (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setSupportActionLoading(true);
                                                try {
                                                    const response = await fetch(buildApiUrl(`/api/hq/suporte/${selectedConversationId}/assume`), {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                    });
                                                    const payload = await response.json().catch(() => ({}));
                                                    if (!response.ok) throw new Error(payload?.message || 'Erro ao assumir conversa.');
                                                    await loadSupportConversation(selectedConversationId);
                                                } catch (error) {
                                                    setErrorByTab((current) => ({
                                                        ...current,
                                                        suporte: error instanceof Error ? error.message : 'Erro ao assumir conversa.',
                                                    }));
                                                } finally {
                                                    setSupportActionLoading(false);
                                                }
                                            }}
                                            disabled={supportActionLoading}
                                            className="rounded-xl bg-[#B6E23A] px-3 py-1.5 text-xs font-bold text-[#1a1a1a] hover:bg-[#a6d233] disabled:opacity-60"
                                        >
                                            Assumir conversa
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setSupportActionLoading(true);
                                                try {
                                                    const response = await fetch(buildApiUrl(`/api/hq/suporte/${selectedConversationId}/release`), {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                    });
                                                    const payload = await response.json().catch(() => ({}));
                                                    if (!response.ok) throw new Error(payload?.message || 'Erro ao liberar conversa.');
                                                    await loadSupportConversation(selectedConversationId);
                                                } catch (error) {
                                                    setErrorByTab((current) => ({
                                                        ...current,
                                                        suporte: error instanceof Error ? error.message : 'Erro ao liberar conversa.',
                                                    }));
                                                } finally {
                                                    setSupportActionLoading(false);
                                                }
                                            }}
                                            disabled={supportActionLoading}
                                            className="rounded-xl border border-[#D7D7D7] px-3 py-1.5 text-xs font-bold text-[#2F2F2F] hover:bg-[#f2f2f2] disabled:opacity-60"
                                        >
                                            Liberar para IA
                                        </button>
                                    )}
                                    {selectedSupportItem?.needsReview && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setSupportActionLoading(true);
                                                try {
                                                    const response = await fetch(buildApiUrl(`/api/hq/suporte/${selectedConversationId}/review`), {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                    });
                                                    const payload = await response.json().catch(() => ({}));
                                                    if (!response.ok) throw new Error(payload?.message || 'Erro ao marcar como revisada.');
                                                    await Promise.all([
                                                        loadSupportConversation(selectedConversationId as string),
                                                        loadTab('suporte', true),
                                                    ]);
                                                } catch (error) {
                                                    setErrorByTab((current) => ({
                                                        ...current,
                                                        suporte: error instanceof Error ? error.message : 'Erro ao marcar como revisada.',
                                                    }));
                                                } finally {
                                                    setSupportActionLoading(false);
                                                }
                                            }}
                                            disabled={supportActionLoading}
                                            className="rounded-xl border border-[#D7D7D7] bg-white px-3 py-1.5 text-xs font-bold text-[#2F2F2F] hover:bg-[#f2f2f2] disabled:opacity-60"
                                        >
                                            Marcar como revisado
                                        </button>
                                    )}
                                    {selectedSupportItem?.needsReview && !selectedSupportItem.knowledgeSuggestionAt && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setSupportActionLoading(true);
                                                try {
                                                    const response = await fetch(buildApiUrl(`/api/hq/suporte/${selectedConversationId}/knowledge-suggestion`), {
                                                        method: 'POST',
                                                        credentials: 'include',
                                                    });
                                                    const payload = await response.json().catch(() => ({}));
                                                    if (!response.ok) throw new Error(payload?.message || 'Erro ao sugerir melhoria da base.');
                                                    await loadTab('suporte', true);
                                                } catch (error) {
                                                    setErrorByTab((current) => ({
                                                        ...current,
                                                        suporte: error instanceof Error ? error.message : 'Erro ao sugerir melhoria da base.',
                                                    }));
                                                } finally {
                                                    setSupportActionLoading(false);
                                                }
                                            }}
                                            disabled={supportActionLoading}
                                            className="rounded-xl border border-[#D7CAB3] bg-[#fffaf1] px-3 py-1.5 text-xs font-bold text-[#2F3A2D] hover:bg-[#f4ead8] disabled:opacity-60"
                                        >
                                            Sugerir melhoria da base
                                        </button>
                                    )}
                                    {!supportResolved && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const reason = window.prompt('Motivo do encerramento:')?.trim();
                                                if (!reason) return;
                                                setSupportActionLoading(true);
                                                try {
                                                    const response = await fetch(buildApiUrl(`/api/hq/suporte/${selectedConversationId}/resolve`), {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        credentials: 'include',
                                                        body: JSON.stringify({ reason }),
                                                    });
                                                    const payload = await response.json().catch(() => ({}));
                                                    if (!response.ok) throw new Error(payload?.message || 'Erro ao encerrar atendimento.');
                                                    await Promise.all([
                                                        loadSupportConversation(selectedConversationId as string),
                                                        loadTab('suporte', true),
                                                    ]);
                                                } catch (error) {
                                                    setErrorByTab((current) => ({
                                                        ...current,
                                                        suporte: error instanceof Error ? error.message : 'Erro ao encerrar atendimento.',
                                                    }));
                                                } finally {
                                                    setSupportActionLoading(false);
                                                }
                                            }}
                                            disabled={supportActionLoading}
                                            className="rounded-xl border border-[#D7D7D7] bg-white px-3 py-1.5 text-xs font-bold text-[#2F2F2F] hover:bg-[#f2f2f2] disabled:opacity-60"
                                        >
                                            Encerrar atendimento
                                        </button>
                                    )}
                                </div>
                            </div>

                            {selectedSupportItem && (
                                <div className="grid gap-2 rounded-xl border border-[#EAEAEA] bg-[#fafafa] p-3 text-xs text-[#5E5E5E] sm:grid-cols-2">
                                    <p><strong>Fazenda:</strong> {selectedSupportItem.farmId || 'global'}</p>
                                    <p><strong>Tela:</strong> {selectedSupportItem.currentPath || '-'}</p>
                                    <p><strong>Tópico:</strong> {selectedSupportItem.topicIds?.join(', ') || 'sem cobertura'}</p>
                                    <p><strong>Confiança:</strong> {selectedSupportItem.confidence !== null && selectedSupportItem.confidence !== undefined ? `${Math.round(selectedSupportItem.confidence * 100)}%` : '-'}</p>
                                    <p><strong>Provedor:</strong> {selectedSupportItem.provider || '-'}</p>
                                    <p><strong>Conhecimento:</strong> {selectedSupportItem.knowledgeVersion || '-'}</p>
                                    <p><strong>Plano:</strong> {selectedSupportItem.supportContext?.planCode || '-'}</p>
                                    <p><strong>Módulos autorizados:</strong> {selectedSupportItem.supportContext?.allowedModules?.join(', ') || '-'}</p>
                                </div>
                            )}

                            <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border border-[#EAEAEA] bg-[#fafafa] p-3">
                                {supportMessages.map((item) => (
                                    <div key={item.id} className="rounded-lg border border-[#ececec] bg-white px-3 py-2">
                                        <p className="text-[11px] font-semibold text-[#5E5E5E]">
                                            {item.action} · {item.user?.name || 'Sistema'}
                                        </p>
                                        <p className="mt-1 text-sm text-[#2F2F2F]">{item.text}</p>
                                        {item.metadata && (item.metadata.intent || item.metadata.rating || item.metadata.feedbackReason) && (
                                            <p className="mt-1 text-[11px] text-[#777]">
                                                {item.metadata.intent ? `Intenção: ${item.metadata.intent}` : ''}
                                                {item.metadata.confidence !== null && item.metadata.confidence !== undefined ? ` · Confiança: ${Math.round(item.metadata.confidence * 100)}%` : ''}
                                                {item.metadata.rating ? ` · Satisfação: ${item.metadata.rating}/5` : ''}
                                                {item.metadata.feedbackReason ? ` · Motivo: ${item.metadata.feedbackReason}` : ''}
                                            </p>
                                        )}
                                    </div>
                                ))}
                                {!supportMessages.length && (
                                    <p className="text-sm text-[#5E5E5E]">Sem mensagens nessa conversa.</p>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={supportReply}
                                    onChange={(event) => setSupportReply(event.target.value)}
                                    placeholder="Responder como SUPER ADMIN..."
                                    className="w-full rounded-xl border border-[#D7D7D7] bg-white px-3 py-2 text-sm outline-none focus:border-[#B6E23A]"
                                />
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!supportReply.trim()) return;
                                        setSupportActionLoading(true);
                                        try {
                                            const response = await fetch(buildApiUrl(`/api/hq/suporte/${selectedConversationId}/reply`), {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                credentials: 'include',
                                                body: JSON.stringify({ message: supportReply.trim() }),
                                            });
                                            const payload = await response.json().catch(() => ({}));
                                            if (!response.ok) throw new Error(payload?.message || 'Erro ao responder conversa.');
                                            setSupportReply('');
                                            await loadSupportConversation(selectedConversationId);
                                        } catch (error) {
                                            setErrorByTab((current) => ({
                                                ...current,
                                                suporte: error instanceof Error ? error.message : 'Erro ao responder conversa.',
                                            }));
                                        } finally {
                                            setSupportActionLoading(false);
                                        }
                                    }}
                                    disabled={supportActionLoading || !supportReply.trim()}
                                    className="rounded-xl bg-[#2F2F2F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1f1f1f] disabled:opacity-60"
                                >
                                    Enviar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </div>
        );
    };

    const renderCadastro = () => (
        <div className="space-y-4">
            <div className="rounded-2xl border border-[#D7D7D7] bg-white p-4">
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#5E5E5E]" htmlFor="hq-search-user">
                    Buscar por nome ou e-mail
                </label>
                <input
                    id="hq-search-user"
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Ex.: João ou joao@empresa.com"
                    className="w-full rounded-2xl border border-[#CFCFCF] bg-white px-4 py-2.5 text-sm text-[#2F2F2F] outline-none focus:border-[#B6E23A]"
                />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#D7D7D7] bg-white">
                <table className="min-w-full text-sm text-[#2F2F2F]">
                    <thead className="bg-[#F6F6F6] text-left text-xs font-bold uppercase tracking-wide text-[#5E5E5E]">
                        <tr>
                            <th className="px-4 py-3">Nome</th>
                            <th className="px-4 py-3">E-mail</th>
                            <th className="px-4 py-3">Celular</th>
                            <th className="px-4 py-3">Documento (CPF/CNPJ)</th>
                            <th className="px-4 py-3">Tipo de doc</th>
                            <th className="px-4 py-3">Cadastrado em</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCadastro.map((user) => (
                            <tr key={user.id} className="border-t border-[#ECECEC]">
                                <td className="px-4 py-3 font-semibold">{user.name || '-'}</td>
                                <td className="px-4 py-3">{user.email || '-'}</td>
                                <td className="px-4 py-3">{user.phone || '-'}</td>
                                <td className="px-4 py-3">{user.document || '-'}</td>
                                <td className="px-4 py-3">{user.documentType || '-'}</td>
                                <td className="px-4 py-3">{formatDate(user.createdAt)}</td>
                            </tr>
                        ))}
                        {!filteredCadastro.length && (
                            <tr>
                                <td className="px-4 py-6 text-center text-[#5E5E5E]" colSpan={6}>Nenhum usuário encontrado para a busca.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderActiveContent = () => {
        if (loadingByTab[activeTab]) {
            return (
                <div className="rounded-2xl border border-[#D7D7D7] bg-white p-6 text-sm text-[#5E5E5E]">
                    Carregando dados...
                </div>
            );
        }

        if (errorByTab[activeTab]) {
            return (
                <div className="rounded-2xl border border-[#D7D7D7] bg-white p-6 text-sm text-[#5E5E5E]">
                    <p>{errorByTab[activeTab]}</p>
                    <button
                        type="button"
                        onClick={() => loadTab(activeTab, true)}
                        className="mt-3 rounded-2xl bg-[#B6E23A] px-4 py-2 text-xs font-bold text-[#1a1a1a]"
                    >
                        Tentar novamente
                    </button>
                </div>
            );
        }

        if (activeTab === 'clientes') return renderClientes();
        if (activeTab === 'metricas') return renderMetricas();
        if (activeTab === 'pipeline') return renderPipeline();
        if (activeTab === 'suporte') return renderSuporte();
        return renderCadastro();
    };

    return (
        <div className="h-full overflow-y-auto rounded-2xl bg-[#EDEDED] p-4 lg:p-6" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-[#2F2F2F]">EIXO HQ</h1>
                    <p className="mt-1 text-sm text-[#5E5E5E]">Painel estratégico para acompanhamento geral da operação.</p>
                </div>
                <button
                    type="button"
                    onClick={() => loadTab(activeTab, true)}
                    className="self-start rounded-2xl bg-[#B6E23A] px-4 py-2 text-xs font-bold text-[#1a1a1a]"
                >
                    Atualizar aba
                </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                {TAB_LABELS.map((tab) => {
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${active ? 'bg-[#B6E23A] text-[#1a1a1a]' : 'bg-[#EDEDED] text-[#5E5E5E]'}`}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="mt-4">{renderActiveContent()}</div>

            {planModalOrg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-[#D7CAB3] bg-[#fffaf1] shadow-2xl">
                        <div className="border-b border-[#D7CAB3] px-5 py-4">
                            <h3 className="text-base font-bold text-[#2F3A2D]">Gerenciar plano da organização</h3>
                            <p className="mt-1 text-sm text-[#6d6558]">{planModalOrg.name}</p>
                        </div>
                        <div className="space-y-4 px-5 py-4">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#6d6558]">Plano</label>
                                <select
                                    value={planForm.planCode}
                                    onChange={(event) => setPlanForm((current) => ({ ...current, planCode: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#D7CAB3] bg-white px-3 py-2 text-sm text-[#2F3A2D]"
                                >
                                    <option value="GRATIS">GRATIS</option>
                                    <option value="EIXO_GESTAO">EIXO_GESTAO</option>
                                    <option value="EIXO_DECISAO">EIXO_DECISAO</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#6d6558]">Status</label>
                                <select
                                    value={planForm.billingStatus}
                                    onChange={(event) => setPlanForm((current) => ({ ...current, billingStatus: event.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-[#D7CAB3] bg-white px-3 py-2 text-sm text-[#2F3A2D]"
                                >
                                    <option value="ACTIVE">ACTIVE (liberado)</option>
                                    <option value="BLOCKED">BLOCKED (bloqueado)</option>
                                </select>
                            </div>
                            {planError && (
                                <p className="rounded-xl bg-[#fce8e8] px-3 py-2 text-sm text-[#8c2020]">{planError}</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 border-t border-[#D7CAB3] px-5 py-4">
                            <button
                                type="button"
                                onClick={closePlanModal}
                                disabled={planSaving}
                                className="rounded-xl border border-[#D7CAB3] px-4 py-2 text-sm text-[#2F3A2D] hover:bg-[#f4ead8] disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={savePlanForOrg}
                                disabled={planSaving}
                                className="rounded-xl bg-[#9d7d4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f7144] disabled:opacity-50"
                            >
                                {planSaving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HQPage;
