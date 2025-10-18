// src/pages/SearchResultsPage.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container, Typography, Box, CircularProgress, Alert, List, ListItem, ListItemText,
  Paper, Divider, Chip
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BusinessIcon from '@mui/icons-material/Business'; // <-- NEU
import apiClient from '../apiClient';

interface SearchResult {
  id: string;
  title: string;
  summary: string | null;
  published_date: string;
  type: 'scraped' | 'ai' | 'tracked_account_news'; // <-- ERWEITERT
  relevance: number;
  url: string | null; // <-- NEU
}

const SearchResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const term = searchParams.get('term');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (term && term.trim()) {
      const fetchResults = async () => {
        setLoading(true);
        setError(null);
        try {
          const response = await apiClient.get(`/api/data/search?term=${encodeURIComponent(term)}`);
          setResults(response.data || []);
        } catch (err: any) {
          setError(err?.response?.data?.message || 'Fehler bei der Suche.');
        } finally {
          setLoading(false);
        }
      };
      fetchResults();
    } else {
      setResults([]);
      setLoading(false);
    }
  }, [term]);

  const renderIcon = (type: SearchResult['type']) => {
    if (type === 'ai') {
      return <SmartToyIcon sx={{ mr: 2, color: 'secondary.main' }} />;
    }
    if (type === 'tracked_account_news') {
      return <BusinessIcon sx={{ mr: 2, color: 'primary.main' }} />;
    }
    return <ArticleIcon sx={{ mr: 2, color: 'text.secondary' }} />;
  };

  const getChipLabel = (type: SearchResult['type']) => {
    if (type === 'ai') return 'KI-Analyse';
    if (type === 'tracked_account_news') return 'Account-News';
    return 'Artikel';
  };

  const getChipColor = (type: SearchResult['type']): "primary" | "secondary" | "default" => {
    if (type === 'ai') return 'secondary';
    if (type === 'tracked_account_news') return 'primary';
    return 'default';
  };

  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>
          Suchergebnisse für: "{term}"
        </Typography>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && results.length === 0 && (
          <Typography color="text.secondary">
            Keine Ergebnisse für Ihre Suche gefunden.
          </Typography>
        )}

        {!loading && !error && results.length > 0 && (
          <List>
            {results.map((result, index) => (
              <React.Fragment key={result.id}>
                <ListItem
                  alignItems="flex-start"
                  // --- KLICKBAR MACHEN ---
                  button
                  component="a"
                  href={result.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  disabled={!result.url}
                  // --- ENDE ---
                >
                  {renderIcon(result.type)}
                  <ListItemText
                    primary={result.title}
                    secondary={
                      <>
                        <Typography
                          sx={{ display: 'inline' }}
                          component="span"
                          variant="body2"
                          color="text.primary"
                        >
                          {new Date(result.published_date).toLocaleDateString('de-DE')} - 
                          <Chip 
                            label={getChipLabel(result.type)} 
                            size="small" 
                            sx={{ mx: 1 }}
                            color={getChipColor(result.type)}
                            variant="outlined"
                          />
                        </Typography>
                        {result.summary ? `${result.summary.substring(0, 200)}...` : ''}
                      </>
                    }
                  />
                </ListItem>
                {index < results.length - 1 && <Divider variant="inset" component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>
    </Container>
  );
};

export default SearchResultsPage;