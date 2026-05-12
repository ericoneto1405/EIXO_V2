import React, { useState, useEffect, useRef } from 'react';
import { buildApiUrl } from '../api';

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

interface AssistantChatProps {
    onClose: () => void;
    farmId: string | null;
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

const MAX_CHARS = 150;

const SendIcon: React.FC = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
);

const AssistantChat: React.FC<AssistantChatProps> = ({ onClose }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const sendMessage = async (text?: string) => {
        const msgText = (text ?? inputMessage).trim();
        if (!msgText || isLoading) return;

        const userMessage: ChatMessage = { role: 'user', text: msgText };
        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setIsLoading(true);

        try {
            const history = messages.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.text }],
            }));

            const response = await fetch(buildApiUrl('/api/chat/send-message'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ message: msgText, history }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || 'Erro ao obter resposta.');
            }

            const data = await response.json();
            setMessages(prev => [...prev, { role: 'model', text: data.response }]);
        } catch (error: any) {
            setMessages(prev => [...prev, {
                role: 'model',
                text: 'Desculpe, não consegui processar sua pergunta agora. Tente novamente em instantes.',
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    };

    const renderInlineText = (value: string, keyPrefix: string) =>
        value.split(/\*\*(.*?)\*\*/g).map((part, index) =>
            index % 2 === 1 ? <strong key={`${keyPrefix}-${index}`}>{part}</strong> : part,
        );

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
                            <img src="/logo_eixo_primary.svg" alt="eixo" className="h-5 w-auto" />
                            <span className="pb-[1px] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--eixo-graphite)]">
                                Suporte
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Ajuda rápida sobre o sistema</p>
                    </div>
                </div>
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

            {/* Área de mensagens */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

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

                {/* Mensagens */}
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                            <div className="space-y-1">
                                {renderText(msg.text)}
                            </div>
                        </div>
                    </div>
                ))}

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
                <div className={`flex items-center gap-2 rounded-2xl border bg-[var(--eixo-surface-soft)] px-3 py-2 transition-colors ${inputMessage.length >= MAX_CHARS ? 'border-[#c0644a]' : 'border-[var(--eixo-border)]'}`}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value.slice(0, MAX_CHARS))}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite sua dúvida..."
                        disabled={isLoading}
                        maxLength={MAX_CHARS}
                        className="flex-1 bg-transparent text-sm text-[var(--eixo-text)] placeholder-[var(--eixo-text-soft)] focus:outline-none disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={isLoading || !inputMessage.trim()}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--eixo-text)] text-white transition-colors hover:bg-[var(--eixo-graphite)] disabled:opacity-40"
                        aria-label="Enviar"
                    >
                        <SendIcon />
                    </button>
                </div>
                <p className="mt-2 text-center text-[10px] text-[var(--eixo-text-soft)]">
                    Eixo Suporte responde dúvidas sobre o uso do sistema.
                </p>
            </div>
        </div>
    );
};

export default AssistantChat;
