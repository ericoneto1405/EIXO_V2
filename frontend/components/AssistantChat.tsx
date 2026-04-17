import React, { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface AssistantChatProps {
  onClose: () => void;
  farmId: string | null; // Assuming chat might be context-aware
}

const AssistantChat: React.FC<AssistantChatProps> = ({ onClose, farmId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: inputMessage };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Prepare history in the format expected by Gemini (e.g., role: 'user', parts: [{text: '...'}] or role: 'model', parts: [{text: '...'}])
      // For simplicity, we'll send a flattened history as string messages to the backend,
      // and let the backend reformat for Gemini's `startChat({ history: ... })`
      const chatHistoryForBackend = messages.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }));


      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Ensure cookies are sent for authentication
        body: JSON.stringify({ message: inputMessage, history: chatHistoryForBackend }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao obter resposta do assistente.');
      }

      const data = await response.json();
      const aiMessage: ChatMessage = { role: 'model', text: data.response };
      setMessages((prevMessages) => [...prevMessages, aiMessage]);
    } catch (error) {
      console.error('Erro ao enviar mensagem para o assistente:', error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { role: 'model', text: 'Desculpe, ocorreu um erro ao se comunicar com o assistente.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Assistente Virtual</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 italic">
            Olá! Como posso ajudar você hoje?
            {farmId && <p className="text-sm mt-1">Contexto atual: Fazenda ID {farmId}</p>}
          </div>
        )}
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-xs px-4 py-2 rounded-lg bg-gray-200 text-gray-800 animate-pulse">
              Digitando...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-gray-200 flex">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Digite sua mensagem..."
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          disabled={isLoading}
        >
          Enviar
        </button>
      </div>
    </div>
  );
};

export default AssistantChat;