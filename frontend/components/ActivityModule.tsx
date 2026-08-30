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

// Mapa exato pras ações mais comuns — o que não estiver aqui cai no
// reconhecimento por palavra-chave logo abaixo (getActionIcon), pra nunca
// mais ficar "desatualizado" quando uma ação nova for registrada.
const ACTION_ICON: Record<string, { icon: string; color: string }> = {
    ANIMAL_CRIADO:              { icon: '🐄', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    ANIMAL_NASCIMENTO:          { icon: '🌱', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    ANIMAL_COMPRA:              { icon: '💰', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    ANIMAL_VENDA:               { icon: '💵', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    ANIMAL_MORTE:               { icon: '📋', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' },
    ANIMAL_LOTE_ALTERADO:       { icon: '🔀', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    NASCIMENTO_REGISTRADO:      { icon: '🌱', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    IDENTIFICACAO_DEFINITIVA:   { icon: '🏷️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    DESMAMA_REGISTRADA:         { icon: '🐮', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    LOTE_CRIADO:                { icon: '🐄', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    FAZENDA_CRIADA:             { icon: '🏡', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    HERD_IMPORT:                { icon: '📥', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    TRANSACAO_CRIADA:           { icon: '📊', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    TRANSACAO_EDITADA:          { icon: '✏️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    TRANSACAO_PAGA:             { icon: '✅', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    USUARIO_CRIADO:             { icon: '👤', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    USUARIO_EDITADO:            { icon: '✏️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    USUARIO_EXCLUIDO:           { icon: '🗑️', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' },
    COLABORADOR_APP_EDITADO:    { icon: '✏️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    OCORRENCIA_CAMPO_CRIADA:    { icon: '📍', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    PESAGEM_REGISTRADA:         { icon: '⚖️', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    PESAGEM_LOTE_REGISTRADA:    { icon: '⚖️', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    PESAGEM_PO_REGISTRADA:      { icon: '⚖️', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    PESAGEM_PO_LOTE_REGISTRADA: { icon: '⚖️', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    AVALIACAO_REPRODUTIVA_REGISTRADA: { icon: '🩺', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    PARTO_REGISTRADO:           { icon: '🌱', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    PARTO_EXCLUIDO:             { icon: '🗑️', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' },
    DESMAMA_REPRO_REGISTRADA:   { icon: '🐮', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    TRANSFERENCIA_EMBRIAO_REGISTRADA: { icon: '🧬', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    PLANO_NUTRICAO_CRIADO:      { icon: '🌾', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' },
    PLANO_NUTRICAO_EDITADO:     { icon: '✏️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
    PLANO_NUTRICAO_EXCLUIDO:    { icon: '🗑️', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' },
    PLANO_NUTRICAO_ATRIBUIDO:  { icon: '🌾', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' },
    HQ_ORG_PLAN_UPDATED:        { icon: '⚙️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' },
};

const DEFAULT_ICON = { icon: '📝', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' };

// Palavras-chave em ordem de prioridade — cobre ações dinâmicas (que têm um
// pedaço variável no nome, tipo `SANITARIO_${tipo}` ou `REPRO_${evento}`)
// sem precisar listar cada combinação possível uma por uma.
const KEYWORD_ICON: [string, { icon: string; color: string }][] = [
    ['EXCLU', { icon: '🗑️', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' }],
    ['MORTE', { icon: '📋', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' }],
    ['BLOQUE', { icon: '🚫', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' }],
    ['SENHA', { icon: '🔒', color: 'bg-[#fff2ef] text-[var(--eixo-danger)]' }],
    ['VACINA', { icon: '💉', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['VERMIFUGO', { icon: '💊', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['TRATAMENTO', { icon: '🩹', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['SANITARIO', { icon: '💉', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['PESAGEM', { icon: '⚖️', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['NUTRICAO', { icon: '🌾', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['REPRO', { icon: '🩺', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['PARTO', { icon: '🌱', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['NASCIMENTO', { icon: '🌱', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['DESMAMA', { icon: '🐮', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['VENDA', { icon: '💵', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['COMPRA', { icon: '💰', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['PAG', { icon: '✅', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['TRANSACAO', { icon: '📊', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['FINANCEIR', { icon: '📊', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['FARMACIA', { icon: '🧴', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-graphite)]' }],
    ['USUARIO', { icon: '👤', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' }],
    ['COLABORADOR', { icon: '👤', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' }],
    ['FAZENDA', { icon: '🏡', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' }],
    ['LOTE', { icon: '🐄', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['ANIMAL', { icon: '🐄', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['EDITAD', { icon: '✏️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' }],
    ['ALTERAD', { icon: '✏️', color: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)]' }],
    ['CRIAD', { icon: '➕', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['REGISTRAD', { icon: '➕', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
    ['ATRIBUID', { icon: '➕', color: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-success)]' }],
];

function getActionIcon(action: string | null): { icon: string; color: string } {
    if (!action) return DEFAULT_ICON;
    if (ACTION_ICON[action]) return ACTION_ICON[action];
    const found = KEYWORD_ICON.find(([keyword]) => action.includes(keyword));
    return found ? found[1] : DEFAULT_ICON;
}

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
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-6 py-5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#d9ead0] bg-[var(--eixo-green-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--eixo-graphite)]">
                            {farmName || 'Todas as fazendas'}
                        </div>
                        <h2 className="font-brand text-2xl font-extrabold leading-tight text-[var(--eixo-text)]">Registro de Atividades</h2>
                        <p className="mt-1 text-sm text-[var(--eixo-text-muted)]">Tudo que aconteceu no sistema, do mais novo ao mais antigo.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setPage(0); setLogs([]); loadLogs(true); }}
                        className="flex items-center gap-2 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--eixo-text-muted)] hover:bg-[var(--eixo-surface-soft)]"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Atualizar
                    </button>
                </div>
            </div>

            {/* Lista */}
            <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] overflow-hidden">
                {error && (
                    <div className="px-6 py-4 text-sm text-[var(--eixo-danger)]">{error}</div>
                )}

                {!error && logs.length === 0 && !loading && (
                    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--eixo-surface-soft)]">
                            <svg className="h-7 w-7 text-[var(--eixo-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">Nenhuma atividade registrada ainda.</p>
                        <p className="text-xs text-[var(--eixo-text-muted)]">As ações aparecerão aqui conforme o sistema for utilizado.</p>
                    </div>
                )}

                {logs.length > 0 && (
                    <ul className="divide-y divide-[var(--eixo-border)]">
                        {logs.map((log) => {
                            const iconData = getActionIcon(log.action);
                            return (
                                <li key={log.id} className="flex items-start gap-4 px-6 py-4 hover:bg-[var(--eixo-surface-soft)]">
                                    {/* Ícone da ação */}
                                    <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base ${iconData.color}`}>
                                        {iconData.icon}
                                    </div>

                                    {/* Conteúdo */}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-[var(--eixo-text)]">{log.description}</p>
                                        <div className="mt-1 flex items-center gap-2">
                                            {/* Avatar */}
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--eixo-text)] text-[9px] font-bold text-white">
                                                {getInitials(log.userName)}
                                            </span>
                                            <span className="text-xs text-[var(--eixo-text-muted)]">{log.userName}</span>
                                            <span className="text-xs text-[var(--eixo-text-soft)]">·</span>
                                            <span className="text-xs text-[var(--eixo-text-muted)]">{formatRelativeDate(log.createdAt)}</span>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {loading && (
                    <div className="flex items-center justify-center gap-2 px-6 py-6 text-sm text-[var(--eixo-text-muted)]">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Carregando...
                    </div>
                )}

                {!loading && hasMore && logs.length > 0 && (
                    <div className="border-t border-[var(--eixo-border)] px-6 py-4 text-center">
                        <button
                            type="button"
                            onClick={() => loadLogs()}
                            className="text-sm font-semibold text-[var(--eixo-green)] hover:underline"
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
