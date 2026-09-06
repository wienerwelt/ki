// frontend/src/components/useAiChat.ts
import { useState } from 'react';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';

export interface AiChatSource {
    id: string;
    title: string;
    type: string;
    url: string;
}

export interface AiChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: AiChatSource[];
}

export const useAiChat = () => {
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    
    // Auth und Snackbar Hooks einbinden
    const { refreshUser } = useAuth();
    const { showSnackbar } = useSnackbar();

    const sendMessage = async (question: string) => {
        setLoading(true);
        const userMsg: AiChatMessage = { role: 'user', content: question };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);

        try {
            const res = await apiClient.post('/api/data/ai-ask', { 
                question, 
                history: messages,
                sessionId,
            });
            if (res.data?.sessionId) setSessionId(String(res.data.sessionId));
            
            const aiMsg: AiChatMessage = {
                role: 'assistant',
                content: res.data.answer,
                sources: Array.isArray(res.data.sources) ? res.data.sources : [],
            };
            setMessages(prev => [...prev, aiMsg]);
            
            // LÖSUNG: Nutzerdaten live neu laden und Snackbar anzeigen
            refreshUser();
            showSnackbar('KI-Anfrage: -2 Punkte', 'info');
            
            return res.data;
        } catch (err) {
            console.error("Chat-Fehler", err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const clearConversation = async () => {
        if (!sessionId) {
            setMessages([]);
            return true;
        }

        try {
            await apiClient.delete(`/api/data/ai-chat-sessions/${encodeURIComponent(sessionId)}`);
            setMessages([]);
            setSessionId(null);
            showSnackbar('KI-Unterhaltung gelöscht', 'success');
            return true;
        } catch (err) {
            console.error('KI-Unterhaltung konnte nicht gelöscht werden', err);
            showSnackbar('KI-Unterhaltung konnte nicht gelöscht werden', 'error');
            return false;
        }
    };

    return { messages, sendMessage, clearConversation, loading, setMessages, sessionId };
};
