import React, { useState, useEffect } from 'react';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import {
  Container, Typography, Box, CircularProgress, Alert, List, ListItem, ListItemText,
  Paper, Divider, Chip, Avatar
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ReactMarkdown from 'react-markdown';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';

interface AiSource {
  id: string;
  title: string;
  type: 'scraped' | 'ai' | 'tracked_account_news';
  url: string;
}

// Interface für die Backend-Antwort
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

  const { refreshUser } = useAuth();
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    if (question && question.trim()) {
      // --- NEU: AbortController erstellen ---
      const controller = new AbortController();

      const fetchAiAnswer = async () => {
        setLoading(true);
        setError(null);
        setResponse(null);
        
        try {
          // POST-Request an den neuen Endpunkt
          const res = await apiClient.post(
            '/api/data/ai-ask', 
            { question },
            { signal: controller.signal } // <-- NEU: Signal übergeben
          );
          
          setResponse(res.data);
          refreshUser(); 
          showSnackbar('KI-Anfrage: -2 Punkte', 'info'); 

        } catch (err: any) {
          // --- NEU: Abgebrochene Anfragen ignorieren ---
          if (err.name === 'AbortError') {
            console.log('Fetch aborted');
            return;
          }
          // --- ENDE ---

          setError(err?.response?.data?.message || 'Fehler bei der KI-Anfrage.');
          setResponse(null); 
        } finally {
          setLoading(false);
        }
      };

      fetchAiAnswer();

      // --- NEU: Cleanup-Funktion ---
      // Diese Funktion wird aufgerufen, wenn der Hook neu läuft ODER die Komponente unmountet
      return () => {
        controller.abort();
      };
      // --- ENDE ---

    } else {
      setLoading(false);
      setError('Keine Frage gestellt.');
      setResponse(null);
    }
  }, [question, refreshUser, showSnackbar]); // Abhängigkeiten bleiben gleich

  // ... (Die gesamte JSX-Render-Logik bleibt unverändert) ...
  return (
    <Container maxWidth="md">
      <Paper sx={{ p: { xs: 2, sm: 4 }, mt: 3, bgcolor: 'background.default' }}>
        
        {/* Die Frage des Nutzers */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Avatar sx={{ bgcolor: 'primary.main' }}><AccountCircleIcon /></Avatar>
          <Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
              Sie
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>{question}</Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Die Antwort der KI */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <Avatar sx={{ bgcolor: 'secondary.main' }}><AutoAwesomeIcon /></Avatar>
          <Box sx={{ width: '100%' }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
              KI-Assistent
            </Typography>
            
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress size={40} />
                <Typography sx={{ ml: 2, color: 'text.secondary' }}>Analysiere interne Daten und generiere eine Antwort...</Typography>
              </Box>
            )}

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {response && (
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