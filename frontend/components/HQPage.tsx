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
    id: string;
    action?: string | null;
    description?: string | null;
    requestMeta?: unknown;
    createdAt: string;
    user: { name: string | null; email: string | null };
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
    if (item.description?.trim()) {
        return item.description;
    }
    if (item.action?.trim()) {
        return item.action;
    }
    if (item.requestMeta && typeof item.requestMeta === 'object') {
        const requestMeta = item.requestMeta as Record<string, unknown>;
        const value = requestMeta.message ?? requestMeta.content ?? requestMeta.prompt ?? requestMeta.text;
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }
    return 'Sem conteúdo disponível.';
};

const HQPage: React.FC = () => {
    const [activeTab, setActiveTab] = React.useState<TabKey>('clientes');
    const [clientes, setClientes] = React.useState<HQCliente[]>([]);
    const [metricas, setMetricas] = React.useState<HQMetricas | null>(null);
    const [pipeline, setPipeline] = React.useState<HQPipelineItem[]>([]);
    const [suporte, setSuporte] = React.useState<HQSuporteItem[]>([]);
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
                const response = await fetch(buildApiUrl('/api/hq/suporte'), { credentials: 'include' });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload?.message || 'Erro ao carregar suporte.');
                setSuporte(Array.isArray(payload?.suporte) ? payload.suporte : []);
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
    }, [loadedByTab, loadingByTab]);

    React.useEffect(() => {
        loadTab(activeTab);
    }, [activeTab, loadTab]);

    const filteredCadastro = React.useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return cadastro;
        return cadastro.filter((user) => {
            const name = user.name?.toLowerCase() || '';
            const email = user.email?.toLowerCase() || '';
            return name.includes(term) || email.includes(term);
        });
    }, [cadastro, search]);

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
                        </tr>
                    ))}
                    {!clientes.length && (
                        <tr>
                            <td className="px-4 py-6 text-center text-[#5E5E5E]" colSpan={7}>Nenhum cliente encontrado.</td>
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

    const renderSuporte = () => {
        if (!suporte.length) {
            return (
                <div className="rounded-2xl border border-[#D7D7D7] bg-white p-6 text-sm text-[#5E5E5E]">
                    Nenhuma mensagem de suporte registrada ainda.
                </div>
            );
        }

        return (
            <div className="overflow-x-auto rounded-2xl border border-[#D7D7D7] bg-white">
                <table className="min-w-full text-sm text-[#2F2F2F]">
                    <thead className="bg-[#F6F6F6] text-left text-xs font-bold uppercase tracking-wide text-[#5E5E5E]">
                        <tr>
                            <th className="px-4 py-3">Usuário</th>
                            <th className="px-4 py-3">Descrição/conteúdo</th>
                            <th className="px-4 py-3">Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        {suporte.map((item) => (
                            <tr key={item.id} className="border-t border-[#ECECEC]">
                                <td className="px-4 py-3">
                                    <p>{item.user?.name || '-'}</p>
                                    <p className="text-xs text-[#5E5E5E]">{item.user?.email || '-'}</p>
                                </td>
                                <td className="px-4 py-3">{getSuporteContent(item)}</td>
                                <td className="px-4 py-3">{formatDate(item.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
        </div>
    );
};

export default HQPage;
