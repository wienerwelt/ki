// frontend/src/components/useAiChat.ts
import { useState } from 'react';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export const useAiChat = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Auth und Snackbar Hooks einbinden
    const { refreshUser } = useAuth();
    const { showSnackbar } = useSnackbar();

    const sendMessage = async (question: string) => {
        setLoading(true);
        const userMsg: Message = { role: 'user', content: question };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);

        try {
            const res = await apiClient.post('/api/data/ai-ask', { 
                question, 
                history: messages 
            });
            
            const aiMsg: Message = { role: 'assistant', content: res.data.answer };
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

    return { messages, sendMessage, loading, setMessages };
};