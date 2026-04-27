import React, { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../api';

interface ActivityLog {
    id: string;
    action: string | null;
    description: string;
    farmId: string | null;
    createdAt: string;
    userName: string;
    userEmail: string;
}

interface ActivityModuleProps {
    farmId?: string | null;
    farmName?: string | null;
}

const ACTION_ICON: Record<string, { icon: string; color: string }> = {
    ANIMAL_CRIADO:      { icon: '🐄', color: 'bg-[#edf4eb] text-[#16a34a]' },
    LOTE_CRIADO:        { icon: '🐄', color: 'bg-[#edf4eb] text-[#16a34a]' },
    ANIMAL_COMPRA:      { icon: '💰', color: 'bg-[#faeee8] text-[#7a2a14]' },
    ANIMAL_VENDA:       { icon: '💵', color: 'bg-[#edf4eb] text-[#16a34a]' },
    ANIMAL_MORTE:       { icon: '📋', color: 'bg-[#fef2f2] text-[#8c4d39]' },
    ANIMAL_NASCIMENTO:  { icon: '🌱', color: 'bg-[#edf4eb] text-[#16a34a]' },
    TRANSACAO_CRIADA:   { icon: '📊', color: 'bg-[#faeee8] text-[#7a2a14]' },
    TRANSACAO_PAGA:     { icon: '✅', color: 'bg-[#edf4eb] text-[#16a34a]' },
    USUARIO_CRIADO:     { icon: '👤', color: 'bg-[#f5f5f4] text-[#78716c]' },
    FAZENDA_CRIADA:     { icon: '🏡', color: 'bg-[#f5f5f4] text-[#78716c]' },
};

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (diffMin < 2) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;
    if (diffH < 24) return `hoje às ${hora}`;
    if (diffD === 1) return `ontem às ${hora}`;
    if (diffD < 7) return `${diffD} dias atrás`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ` às ${hora}`;
}

function getInitials(name: string): string {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

const ActivityModule: React.FC<ActivityModuleProps> = ({ farmId, farmName }) => {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 50;

    const loadLogs = useCallback(async (reset = false) => {
        setLoading(true);
        setError(null);
        const offset = reset ? 0 : page * PAGE_SIZE;
        try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
            if (farmId) params.set('farmId', farmId);
            const resp = await fetch(buildApiUrl(`/activity-logs?${params}`), { credentials: 'include' });
            if (!resp.ok) throw new Error('Erro ao carregar histórico.');
            const data = await resp.json();
            const newLogs: ActivityLog[] = data.logs ?? [];
            setLogs(reset ? newLogs : (prev) => [...prev, ...newLogs]);
            setHasMore(newLogs.length === PAGE_SIZE);
            if (!reset) setPage((p) => p + 1);
        } catch (e: any) {
            setError(e.message || 'Erro inesperado.');
        } finally {
            setLoading(false);
        }
    }, [farmId, page]);

    useEffect(() => {
        setPage(0);
        setLogs([]);
        loadLogs(true);
    }, [farmId]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-2xl border border-[#e7e5e4] bg-white px-6 py-5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#f0d5ca] bg-[#faeee8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a2a14]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#a8442a]" />
                            {farmName || 'Todas as fazendas'}
                        </div>
                        <h2 className="font-brand text-2xl font-extrabold leading-tight text-[#1c1917]">Registro de Atividades</h2>
                        <p className="mt-1 text-sm text-[#78716c]">Tudo que aconteceu no sistema, do mais novo ao mais antigo.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setPage(0); setLogs([]); loadLogs(true); }}
                        className="flex items-center gap-2 rounded-xl border border-[#e7e5e4] bg-[#f5f5f4] px-4 py-2 text-sm font-semibold text-[#78716c] hover:bg-[#f5f5f4]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Lista */}
            <div className="rounded-2xl border border-[#e7e5e4] bg-white overflow-hidden">
                {error && (
                    <div className="px-6 py-4 text-sm text-[#8c4d39]">{error}</div>
                )}

                {!error && logs.length === 0 && !loading && (
                    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f5f4]">
                            <svg className="h-7 w-7 text-[#78716c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-[#1c1917]">Nenhuma atividade registrada ainda.</p>
                        <p className="text-xs text-[#78716c]">As ações aparecerão aqui conforme o sistema for utilizado.</p>
                    </div>
                )}

                {logs.length > 0 && (
                    <ul className="divide-y divide-[#e7e5e4]">
                        {logs.map((log) => {
                            const iconData = ACTION_ICON[log.action ?? ''] ?? { icon: '📝', color: 'bg-[#f5f5f4] text-[#78716c]' };
                            return (
                                <li key={log.id} className="flex items-start gap-4 px-6 py-4 hover:bg-[#f5f5f4]">
                                    {/* Ícone da ação */}
                                    <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base ${iconData.color}`}>
                                        {iconData.icon}
                                    </div>

                                    {/* Conteúdo */}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-[#1c1917]">{log.description}</p>
                                        <div className="mt-1 flex items-center gap-2">
                                            {/* Avatar */}
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1c1917] text-[9px] font-bold text-white">
                                                {getInitials(log.userName)}
                                            </span>
                                            <span className="text-xs text-[#78716c]">{log.userName}</span>
                                            <span className="text-xs text-[#c4b5a0]">·</span>
                                            <span className="text-xs text-[#78716c]">{formatRelativeDate(log.createdAt)}</span>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {loading && (
                    <div className="flex items-center justify-center gap-2 px-6 py-6 text-sm text-[#78716c]">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Carregando...
                    </div>
                )}

                {!loading && hasMore && logs.length > 0 && (
                    <div className="border-t border-[#e7e5e4] px-6 py-4 text-center">
                        <button
                            type="button"
                            onClick={() => loadLogs()}
                            className="text-sm font-semibold text-[#a8442a] hover:underline"
                        >
                            Carregar mais
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityModule;
