// frontend/src/pages/AiAskPage.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container, Typography, Box, CircularProgress, Alert, List, ListItem, ListItemText,
  Paper, Divider, Chip, Avatar
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ReactMarkdown from 'react-markdown';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';

// KI Konfiguration importieren
import { AI_CONFIG } from '../components/aiConfig';
import AiContentLabel from '../components/AiContentLabel';

interface AiSource {
  id: string;
  title: string;
  type: 'scraped' | 'ai' | 'tracked_account_news';
  url: string;
}

interface AiAskResponse {
  answer: string;
  sources: AiSource[];
}

const AiAskPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const question = searchParams.get('question');
  const [response, setResponse] = useState<AiAskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User für das Profilbild abgreifen
  const { user, refreshUser } = useAuth();
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    if (question && question.trim()) {
      const controller = new AbortController();

      const fetchAiAnswer = async () => {
        setLoading(true);
        setError(null);
        setResponse(null);
        
        try {
          const res = await apiClient.post(
            '/api/data/ai-ask', 
            { question },
            { signal: controller.signal }
          );
          
          setResponse(res.data);
          
          // Live Punkte-Update
          refreshUser(); 
          showSnackbar('KI-Anfrage: -2 Punkte', 'info'); 

        } catch (err: any) {
          if (err.name === 'AbortError') return;
          setError(err?.response?.data?.message || 'Fehler bei der KI-Anfrage.');
          setResponse(null); 
        } finally {
          setLoading(false);
        }
      };

      fetchAiAnswer();

      return () => {
        controller.abort();
      };

    } else {
      setLoading(false);
      setError('Keine Frage gestellt.');
      setResponse(null);
    }
  }, [question, refreshUser, showSnackbar]);

  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 2, sm: 4 }, mt: 3, bgcolor: 'background.default' }}>
        
        {/* User Part */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Avatar 
            src={user?.profile_image_url || undefined} 
            sx={{ bgcolor: 'primary.main' }}
          >
            {!user?.profile_image_url && <AccountCircleIcon />}
          </Avatar>
          <Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
              Ich
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>{question}</Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* AI Part */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          
          <Avatar 
            src={AI_CONFIG.avatarUrl}
            sx={{ 
              bgcolor: 'transparent',
              animation: loading ? 'pulse 1.5s infinite ease-in-out' : 'none',
              '@keyframes pulse': {
                '0%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.1)', opacity: 0.7 },
                '100%': { transform: 'scale(1)', opacity: 1 },
              }
            }}
          />

          <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
                {AI_CONFIG.name} (KI-Assistent)
              </Typography>
              <AiContentLabel kind="generated" size={17} />
            </Box>
            
            {loading && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <CircularProgress size={24} color="secondary" />
                <Typography variant="body2" color="text.secondary">
                    Analysiere Daten und generiere Antwort...
                </Typography>
              </Box>
            )}

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {response && !loading && (
              <Box sx={{ mt: 1.5 }}>
                <Box className="markdown-content" sx={{ 
                  '& p': { margin: '0 0 16px 0' },
                  '& ul, & ol': { pl: '24px', m: '0 0 16px 0' },
                  '& li': { mb: 0.5 },
                  '& a': { color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }
                }}>
                  <ReactMarkdown>{response.answer}</ReactMarkdown>
                </Box>
                
                {response.sources && response.sources.length > 0 && (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 4, fontWeight: 'bold' }}>
                      Verwendete interne Quellen:
                    </Typography>
                    <List dense>
                      {response.sources.map((source) => (
                        <ListItem 
                          key={source.id}
                          button 
                          component="a" 
                          href={source.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          disabled={!source.url}
                        >
                          <ListItemText 
                            primary={source.title} 
                            secondary={
                              <Chip 
                                label={source.type} 
                                size="small" 
                                variant="outlined" 
                                sx={{ mt: 0.5 }}
                              />
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default AiAskPage;
