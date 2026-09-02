import React, { useState, useEffect, useRef } from 'react';
import { buildApiUrl } from '../api';

interface ChatMessage {
    id?: string;
    role: 'user' | 'model';
    text: string;
    source?: 'user' | 'ai' | 'specialist' | 'system';
}

interface RecentConversation {
    conversationId: string;
    lastAt: string;
    preview: string;
    farmId: string | null;
}

interface AssistantChatProps {
    onClose: () => void;
    farmId: string | null;
    onNavigateToView?: (view: string, options?: { herdTab?: 'overview' | 'animals' | 'lots' | 'weighings' | 'settings' }) => void;
    initialDraft?: string | null;
}

const SUGESTOES = [
    'Como importar/trazer meus animais para o sistema?',
    'Como cadastrar minha fazenda?',
    'Como registrar uma pesagem?',
    'Como registrar compra ou venda de animais?',
    'Como lançar uma despesa?',
    'Como criar lotes e grupos?',
    'O que significa o cadeado nos módulos?',
    'Como acompanhar o financeiro da minha fazenda?',
];

const MAX_CHARS = 1000;

const formatConversationDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
    });
};

const SendIcon: React.FC = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
);

const AssistantChat: React.FC<AssistantChatProps> = ({ onClose, farmId, onNavigateToView, initialDraft }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState('');
    const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([]);
    const [humanStatus, setHumanStatus] = useState<'none' | 'requested' | 'assumed'>('none');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, 'resolved' | 'unresolved'>>({});
    const [satisfactionByMessage, setSatisfactionByMessage] = useState<Record<string, number>>({});
    const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null);
    const [satisfactionLoading, setSatisfactionLoading] = useState<string | null>(null);
    const [ratingPromptMessageId, setRatingPromptMessageId] = useState<string | null>(null);
    const [unresolvedReasonMessageId, setUnresolvedReasonMessageId] = useState<string | null>(null);
    const [unresolvedReason, setUnresolvedReason] = useState('');
    const [feedbackPrompt, setFeedbackPrompt] = useState<string | null>(null);
    const [humanRequestLoading, setHumanRequestLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!initialDraft) return;
        const created = crypto.randomUUID();
        setConversationId(created);
        setMessages([]);
        setHumanStatus('none');
        setFeedbackByMessage({});
        setSatisfactionByMessage({});
        setRatingPromptMessageId(null);
        setUnresolvedReasonMessageId(null);
        setUnresolvedReason('');
        setFeedbackPrompt(null);
        setInputMessage(initialDraft);
        window.localStorage.setItem(`eixo_support_conversation_${farmId || 'global'}`, created);
    }, [initialDraft, farmId]);

    useEffect(() => {
        if (initialDraft) return;
        const storageKey = `eixo_support_conversation_${farmId || 'global'}`;
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
            setConversationId(stored);
            return;
        }
        const created = crypto.randomUUID();
        setConversationId(created);
        window.localStorage.setItem(storageKey, created);
    }, [farmId, initialDraft]);

    const loadRecentConversations = async () => {
        try {
            const query = new URLSearchParams();
            query.set('limit', '3');
            if (farmId) query.set('farmId', farmId);

            const response = await fetch(buildApiUrl(`/api/chat/conversations?${query.toString()}`), {
                credentials: 'include',
            });
            if (!response.ok) return;
            const data = await response.json().catch(() => ({}));
            const fetched = Array.isArray(data?.conversations) ? data.conversations : [];
            setRecentConversations(fetched);
            setLoadError(null);
        } catch {
            setLoadError('Não foi possível carregar as conversas recentes.');
        }
    };

    const loadConversationMessages = async (targetConversationId: string) => {
        if (!targetConversationId) return;
        try {
            const response = await fetch(buildApiUrl(`/api/chat/conversations/${targetConversationId}/messages`), {
                credentials: 'include',
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 404) return;
            if (!response.ok) throw new Error(data?.message || 'Erro ao carregar conversa.');
            const fetched = Array.isArray(data?.messages) ? data.messages : [];
            const fetchedFeedback = data?.feedbackByMessage && typeof data.feedbackByMessage === 'object'
                ? data.feedbackByMessage
                : {};
            const fetchedSatisfaction = data?.satisfactionByMessage && typeof data.satisfactionByMessage === 'object'
                ? data.satisfactionByMessage
                : {};
            const latestAiMessage = [...fetched]
                .reverse()
                .find((msg: any) => msg?.source === 'ai' && msg?.id);
            setHumanStatus(data?.assumedByAdmin ? 'assumed' : data?.humanRequested ? 'requested' : 'none');
            setFeedbackByMessage(fetchedFeedback);
            setSatisfactionByMessage(fetchedSatisfaction);
            setRatingPromptMessageId(
                latestAiMessage?.id
                && fetchedFeedback[latestAiMessage.id]
                && !fetchedSatisfaction[latestAiMessage.id]
                    ? latestAiMessage.id
                    : null,
            );
            setUnresolvedReasonMessageId(null);
            setUnresolvedReason('');
            setMessages(
                fetched.map((msg: any) => ({
                    id: msg.id,
                    role: msg.role === 'user' ? 'user' : 'model',
                    text: msg.text || '',
                    source: msg.source || (msg.role === 'user' ? 'user' : 'ai'),
                })),
            );
            setLoadError(null);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar a conversa.');
        }
    };

    useEffect(() => {
        void loadRecentConversations();
    }, [farmId]);

    useEffect(() => {
        if (!conversationId) return;
        void loadConversationMessages(conversationId);
        const interval = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void loadConversationMessages(conversationId);
            }
        }, humanStatus === 'requested' || humanStatus === 'assumed' ? 5000 : 15000);
        return () => window.clearInterval(interval);
    }, [conversationId, humanStatus]);

    const sendMessage = async (text?: string) => {
        const msgText = (text ?? inputMessage).trim();
        if (!msgText || isLoading || !conversationId) return;

        const optimisticId = `local-${Date.now()}`;
        const userMessage: ChatMessage = { id: optimisticId, role: 'user', text: msgText };
        setMessages((prev) => [...prev, userMessage]);
        setInputMessage('');
        setIsLoading(true);

        try {
            const response = await fetch(buildApiUrl('/api/chat/send-message'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    message: msgText,
                    conversationId,
                    farmId,
                    currentPath: window.location.pathname,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || 'Erro ao obter resposta.');
            }

            const data = await response.json();
            if (data?.conversationId && data.conversationId !== conversationId) {
                setConversationId(data.conversationId);
                window.localStorage.setItem(`eixo_support_conversation_${farmId || 'global'}`, data.conversationId);
            }
            setHumanStatus(data?.assumedByAdmin ? 'assumed' : data?.humanRequested ? 'requested' : 'none');
            setLoadError(null);
            setFeedbackPrompt(null);
            await loadConversationMessages(data?.conversationId || conversationId);
            await loadRecentConversations();
        } catch (error: any) {
            const message = error instanceof Error ? error.message : 'Não foi possível processar sua pergunta.';
            setLoadError(message);
            setMessages(prev => [...prev, {
                role: 'model',
                text: 'Desculpe, não consegui processar sua pergunta agora. Confira sua conexão e tente novamente.',
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNewConversation = () => {
        const created = crypto.randomUUID();
        setConversationId(created);
        setMessages([]);
        setHumanStatus('none');
        setLoadError(null);
        setFeedbackByMessage({});
        setSatisfactionByMessage({});
        setRatingPromptMessageId(null);
        setUnresolvedReasonMessageId(null);
        setUnresolvedReason('');
        setFeedbackPrompt(null);
        window.localStorage.setItem(`eixo_support_conversation_${farmId || 'global'}`, created);
        setRecentConversations((prev) => {
            const next = [
                {
                    conversationId: created,
                    lastAt: new Date().toISOString(),
                    preview: 'Nova conversa',
                    farmId,
                },
                ...prev.filter((item) => item.conversationId !== created),
            ];
            return next.slice(0, 3);
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    };

    const sendFeedback = async (messageId: string, resolved: boolean, reason = '') => {
        if (!messageId || feedbackLoading) return;
        setFeedbackLoading(messageId);
        try {
            const response = await fetch(buildApiUrl('/api/chat/feedback'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ conversationId, messageId, resolved, reason: reason.trim() }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.message || 'Erro ao registrar avaliação.');
            setFeedbackByMessage((previous) => ({
                ...previous,
                [messageId]: resolved ? 'resolved' : 'unresolved',
            }));
            setHumanStatus(data?.humanRequested ? 'requested' : humanStatus);
            setFeedbackPrompt(
                resolved
                    ? 'Que bom! Fico feliz em ter ajudado.'
                    : data?.humanRequested
                        ? 'Entendi. A Equipe EIXO continuará o atendimento por aqui.'
                        : data?.message || 'Conte o que aconteceu ou em qual etapa você parou. Vou tentar de outro jeito.',
            );
            setRatingPromptMessageId(messageId);
            setUnresolvedReasonMessageId(null);
            setUnresolvedReason('');
            if (!resolved && !data?.humanRequested) inputRef.current?.focus();
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Não foi possível registrar sua avaliação.');
        } finally {
            setFeedbackLoading(null);
        }
    };

    const sendSatisfaction = async (messageId: string, rating: number) => {
        if (!messageId || satisfactionLoading) return;
        setSatisfactionLoading(messageId);
        try {
            const response = await fetch(buildApiUrl('/api/chat/satisfaction'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ conversationId, messageId, rating }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.message || 'Erro ao registrar satisfação.');
            setSatisfactionByMessage((previous) => ({ ...previous, [messageId]: Number(data.rating) }));
            setRatingPromptMessageId(null);
            setFeedbackPrompt('Obrigado pela avaliação. Ela ajuda a melhorar o EIXO Suporte.');
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Não foi possível registrar sua satisfação.');
        } finally {
            setSatisfactionLoading(null);
        }
    };

    const requestHumanSupport = async () => {
        if (!conversationId || humanRequestLoading || humanStatus !== 'none') return;
        setHumanRequestLoading(true);
        try {
            const response = await fetch(buildApiUrl('/api/chat/request-human'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    conversationId,
                    farmId,
                    currentPath: window.location.pathname,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.message || 'Erro ao solicitar atendimento da Equipe EIXO.');
            setHumanStatus(data?.assumedByAdmin ? 'assumed' : 'requested');
            setLoadError(null);
            await loadConversationMessages(data?.conversationId || conversationId);
            await loadRecentConversations();
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Não foi possível chamar a Equipe EIXO.');
        } finally {
            setHumanRequestLoading(false);
        }
    };

    const lastAiMessageId = [...messages]
        .reverse()
        .find((message) => message.role === 'model' && message.source === 'ai' && message.id)?.id;

    const handleInternalLinkClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        if (!href.startsWith('eixo:view:')) return;
        event.preventDefault();
        const rawTarget = href.replace('eixo:view:', '');
        const [encodedView, queryString = ''] = rawTarget.split('?');
        const targetView = decodeURIComponent(encodedView || '');
        if (!targetView) return;
        const query = new URLSearchParams(queryString);
        const herdTab = query.get('tab');
        const allowedHerdTabs = ['overview', 'animals', 'lots', 'weighings', 'settings'];
        onNavigateToView?.(
            targetView,
            herdTab && allowedHerdTabs.includes(herdTab)
                ? { herdTab: herdTab as 'overview' | 'animals' | 'lots' | 'weighings' | 'settings' }
                : undefined,
        );
        onClose();
    };

    const renderInlineText = (value: string, keyPrefix: string) => {
        const parts = value.split(/(\*\*.*?\*\*|\[.*?\]\((?:eixo:view:[^)]+|\/[^)]*)\))/g);
        return parts.map((part, index) => {
            const bold = part.match(/^\*\*(.*?)\*\*$/);
            if (bold) {
                return <strong key={`${keyPrefix}-bold-${index}`}>{bold[1]}</strong>;
            }

            const link = part.match(/^\[(.*?)\]\((eixo:view:[^)]+|\/[^)]*)\)$/);
            if (link) {
                const label = link[1];
                const href = link[2];
                return (
                    <a
                        key={`${keyPrefix}-link-${index}`}
                        href={href}
                        onClick={(event) => handleInternalLinkClick(event, href)}
                        className="font-semibold text-[#2563eb] underline decoration-[#93c5fd] underline-offset-2 hover:text-[#1d4ed8]"
                    >
                        {label}
                    </a>
                );
            }

            return part;
        });
    };

    // Converte markdown básico (**negrito**, listas numeradas e com bullet)
    const renderText = (text: string) => {
        const lines = text.split('\n');
        return lines.map((line, i) => {
            // Lista numerada
            const numbered = line.match(/^(\d+)\.\s(.+)/);
            if (numbered) {
                return (
                    <li key={i} className="ml-4 list-decimal">
                        {renderInlineText(numbered[2], `numbered-${i}`)}
                    </li>
                );
            }
            // Lista com traço/bullet
            const bulleted = line.match(/^[-•]\s(.+)/);
            if (bulleted) {
                return (
                    <li key={i} className="ml-4 list-disc">
                        {renderInlineText(bulleted[1], `bulleted-${i}`)}
                    </li>
                );
            }
            // Linha vazia
            if (!line.trim()) return <br key={i} />;
            return <p key={i}>{renderInlineText(line, `paragraph-${i}`)}</p>;
        });
    };

    return (
        <div className="flex flex-col h-full rounded-[24px] border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--eixo-text)]">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                        </svg>
                    </div>
                    <div>
                        <div className="flex items-end gap-2">
                            <img src="/logo_eixo_official.svg" alt="eixo" className="h-5 w-auto" />
                            <span className="pb-[1px] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                Suporte
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Ajuda rápida sobre o sistema</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-text)]"
                        aria-label="Fechar"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Área de mensagens */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                <div className="mb-1 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-2.5">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--eixo-text-muted)]">
                            Conversas recentes
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {recentConversations.map((item) => (
                            <button
                                key={item.conversationId}
                                type="button"
                                onClick={() => {
                                    setConversationId(item.conversationId);
                                    window.localStorage.setItem(`eixo_support_conversation_${farmId || 'global'}`, item.conversationId);
                                }}
                                className={`max-w-full truncate rounded-lg border px-2.5 py-1 text-[11px] ${
                                    conversationId === item.conversationId
                                        ? 'border-[var(--eixo-text)] bg-[var(--eixo-text)] text-white'
                                        : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)] text-[var(--eixo-text)] hover:bg-[#eedfc8]'
                                }`}
                                title={item.preview || item.conversationId}
                            >
                                <span className="block truncate text-left">
                                    Assunto: {(item.preview || 'Sem texto').slice(0, 24)}
                                </span>
                                <span className={`block text-left text-[10px] ${conversationId === item.conversationId ? 'text-white/80' : 'text-[var(--eixo-text-muted)]'}`}>
                                    Data: {formatConversationDate(item.lastAt)}
                                </span>
                            </button>
                        ))}
                        {!recentConversations.length && (
                            <span className="text-[11px] text-[var(--eixo-text-muted)]">
                                Sem conversas recentes.
                            </span>
                        )}
                    </div>
                </div>

                {/* Estado vazio — boas-vindas + sugestões */}
                {messages.length === 0 && (
                    <div className="flex flex-col items-center pt-4 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--eixo-surface-soft)] mb-4">
                            <svg className="w-7 h-7 text-[var(--eixo-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-[var(--eixo-text)]">Olá! Sou o Eixo Suporte.</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)] max-w-[220px]">
                            Tire suas dúvidas sobre como usar o sistema EIXO.
                        </p>
                        <div className="mt-5 flex flex-col gap-2 w-full">
                            {SUGESTOES.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => void sendMessage(s)}
                                    className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-left text-xs font-medium text-[var(--eixo-text)] transition-colors hover:bg-[#eedfc8] hover:text-[var(--eixo-text)]"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {loadError && (
                    <div role="alert" className="rounded-xl border border-[var(--eixo-danger)] bg-red-50 px-3 py-2 text-xs text-[var(--eixo-danger)]">
                        <p>{loadError}</p>
                        <button
                            type="button"
                            onClick={() => {
                                setLoadError(null);
                                void loadRecentConversations();
                                if (conversationId) void loadConversationMessages(conversationId);
                            }}
                            className="mt-2 rounded-lg border border-current px-2.5 py-1 font-semibold"
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

                {/* Mensagens */}
                {messages.map((msg, index) => (
                    <div key={msg.id || index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'model' && (
                            <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--eixo-text)]">
                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                                </svg>
                            </div>
                        )}
                        <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            msg.role === 'user'
                                ? 'bg-[var(--eixo-text)] text-white rounded-br-sm'
                                : 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text)] rounded-bl-sm'
                        }`}>
                            {(msg.source === 'specialist' || msg.source === 'ai') && (
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--eixo-success)]">
                                    {msg.source === 'specialist' ? 'Equipe EIXO' : 'Eixo Suporte automático'}
                                </p>
                            )}
                            <div className="space-y-1">
                                {renderText(msg.text)}
                            </div>
                            {msg.id && msg.id === lastAiMessageId && !feedbackByMessage[msg.id] && humanStatus === 'none' && (
                                <div className="mt-3 border-t border-[var(--eixo-border)] pt-2">
                                    <p className="mb-1.5 text-[11px] font-medium text-[var(--eixo-text-muted)]">Isso resolveu sua dúvida?</p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void sendFeedback(msg.id as string, true)}
                                            disabled={feedbackLoading === msg.id}
                                            className="rounded-lg border border-[var(--eixo-border)] bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--eixo-green-soft)] disabled:opacity-50"
                                        >
                                            Sim, resolveu
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setUnresolvedReasonMessageId(msg.id as string);
                                                setUnresolvedReason('');
                                            }}
                                            disabled={feedbackLoading === msg.id}
                                            className="rounded-lg border border-[var(--eixo-border)] bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--eixo-surface)] disabled:opacity-50"
                                        >
                                            Ainda não
                                        </button>
                                    </div>
                                    {unresolvedReasonMessageId === msg.id && (
                                        <div className="mt-2 space-y-2">
                                            <label className="block text-[11px] text-[var(--eixo-text-muted)]" htmlFor={`support-reason-${msg.id}`}>
                                                Em qual etapa você parou?
                                            </label>
                                            <textarea
                                                id={`support-reason-${msg.id}`}
                                                value={unresolvedReason}
                                                onChange={(event) => setUnresolvedReason(event.target.value.slice(0, 300))}
                                                maxLength={300}
                                                rows={2}
                                                placeholder="Descreva o motivo em uma frase curta."
                                                className="w-full resize-none rounded-lg border border-[var(--eixo-border)] bg-white px-2.5 py-2 text-xs text-[var(--eixo-text)] outline-none focus:border-[var(--eixo-success)]"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void sendFeedback(msg.id as string, false, unresolvedReason)}
                                                disabled={feedbackLoading === msg.id || unresolvedReason.trim().length < 3}
                                                className="rounded-lg bg-[var(--eixo-text)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                            >
                                                Enviar motivo
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {msg.id
                                && msg.id === lastAiMessageId
                                && feedbackByMessage[msg.id]
                                && !satisfactionByMessage[msg.id]
                                && ratingPromptMessageId === msg.id && (
                                <div className="mt-3 border-t border-[var(--eixo-border)] pt-2">
                                    <p className="mb-1.5 text-[11px] font-medium text-[var(--eixo-text-muted)]">Como você avalia este atendimento?</p>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((rating) => (
                                            <button
                                                key={rating}
                                                type="button"
                                                onClick={() => void sendSatisfaction(msg.id as string, rating)}
                                                disabled={satisfactionLoading === msg.id}
                                                aria-label={`${rating} de 5`}
                                                className="h-7 w-7 rounded-lg border border-[var(--eixo-border)] bg-white text-xs font-bold hover:bg-[var(--eixo-green-soft)] disabled:opacity-50"
                                            >
                                                {rating}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {feedbackPrompt && (
                    <p role="status" className="rounded-xl bg-[var(--eixo-green-soft)] px-3 py-2 text-xs text-[var(--eixo-text)]">
                        {feedbackPrompt}
                    </p>
                )}

                {humanStatus !== 'none' && (
                    <p role="status" className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-3 py-2 text-xs text-[var(--eixo-text)]">
                        {humanStatus === 'assumed'
                            ? 'A Equipe EIXO está acompanhando esta conversa.'
                            : 'A conversa foi encaminhada para a Equipe EIXO.'}
                    </p>
                )}

                {/* Indicador de digitando */}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--eixo-text)]">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                            </svg>
                        </div>
                        <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-[var(--eixo-surface-soft)] px-4 py-3">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--eixo-text-muted)]" style={{ animationDelay: '0ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--eixo-text-muted)]" style={{ animationDelay: '150ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--eixo-text-muted)]" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-3">
                <button
                    type="button"
                    onClick={handleCreateNewConversation}
                    className="mb-2 w-full rounded-xl bg-[var(--eixo-text)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--eixo-graphite)]"
                >
                    Iniciar nova conversa
                </button>
                <div className={`flex items-end gap-2 rounded-2xl border bg-[var(--eixo-surface-soft)] px-3 py-2 transition-colors ${inputMessage.length >= MAX_CHARS ? 'border-[#c0644a]' : 'border-[var(--eixo-border)]'}`}>
                    <textarea
                        ref={inputRef}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value.slice(0, MAX_CHARS))}
                        onKeyDown={handleKeyDown}
                        placeholder={conversationId ? 'Digite sua dúvida...' : 'Escolha um histórico ou inicie nova conversa'}
                        disabled={isLoading || !conversationId}
                        maxLength={MAX_CHARS}
                        rows={2}
                        className="max-h-28 min-h-10 flex-1 resize-none bg-transparent text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:outline-none disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={isLoading || !inputMessage.trim() || !conversationId}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--eixo-text)] text-white transition-colors hover:bg-[var(--eixo-graphite)] disabled:opacity-40"
                        aria-label="Enviar"
                    >
                        <SendIcon />
                    </button>
                </div>
                <p className="mt-1 text-right text-[10px] text-[var(--eixo-text-soft)]">{inputMessage.length}/{MAX_CHARS}</p>
                {humanStatus === 'none' && (
                    <button
                        type="button"
                        onClick={() => void requestHumanSupport()}
                        disabled={humanRequestLoading || !conversationId}
                        className="mt-1 w-full text-center text-[11px] font-semibold text-[var(--eixo-text-muted)] underline underline-offset-2 hover:text-[var(--eixo-text)] disabled:opacity-50"
                    >
                        {humanRequestLoading ? 'Chamando a Equipe EIXO...' : 'Preciso falar com a Equipe EIXO'}
                    </button>
                )}
                <p className="mt-2 text-center text-[10px] text-[var(--eixo-text-soft)]">
                    Eixo Suporte responde com base na versão atual do sistema.
                </p>
            </div>
        </div>
    );
};

export default AssistantChat;
