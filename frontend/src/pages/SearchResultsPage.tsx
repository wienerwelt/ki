import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Box, CircularProgress, Alert, List, ListItem, ListItemText,
  Paper, Divider, Chip, ListItemButton // ListItemButton ist besser als ListItem button
} from '@mui/material';

// Icons
import ArticleIcon from '@mui/icons-material/Article';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BusinessIcon from '@mui/icons-material/Business';
import FolderIcon from '@mui/icons-material/Folder'; // ✅ NEU
import ForumIcon from '@mui/icons-material/Forum';   // ✅ NEU

import apiClient from '../apiClient';

interface SearchResult {
  id: string;
  title: string;
  summary: string | null;
  published_date: string;
  // ✅ ERWEITERT: file und community_post hinzugefügt
  type: 'scraped' | 'ai' | 'tracked_account_news' | 'file' | 'community_post'; 
  relevance: number;
  url: string | null;
}

const SearchResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate(); // ✅ NEU: Für interne Navigation
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

  // ✅ ICON-LOGIK ERWEITERT
  const renderIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'ai':
        return <SmartToyIcon sx={{ mr: 2, color: 'secondary.main', fontSize: 30 }} />;
      case 'tracked_account_news':
        return <BusinessIcon sx={{ mr: 2, color: 'primary.main', fontSize: 30 }} />;
      case 'file':
        return <FolderIcon sx={{ mr: 2, color: 'info.main', fontSize: 30 }} />;
      case 'community_post':
        return <ForumIcon sx={{ mr: 2, color: 'warning.main', fontSize: 30 }} />;
      default:
        return <ArticleIcon sx={{ mr: 2, color: 'text.secondary', fontSize: 30 }} />;
    }
  };

  // ✅ LABELS ERWEITERT
  const getChipLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'ai': return 'KI-Analyse';
      case 'tracked_account_news': return 'Account-News';
      case 'file': return 'Datei';
      case 'community_post': return 'Community';
      default: return 'Artikel';
    }
  };

  // ✅ FARBEN ERWEITERT
  const getChipColor = (type: SearchResult['type']): "primary" | "secondary" | "default" | "info" | "warning" => {
    switch (type) {
      case 'ai': return 'secondary';
      case 'tracked_account_news': return 'primary';
      case 'file': return 'info';
      case 'community_post': return 'warning';
      default: return 'default';
    }
  };

  // ✅ Navigation Handler
  const handleResultClick = (url: string | null) => {
    if (!url) return;
    // Wenn URL mit '/' beginnt, ist es eine interne Route -> SPA Navigation
    if (url.startsWith('/')) {
      navigate(url);
    } else {
      // Sonst externer Link -> Neuer Tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
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
                <ListItem disablePadding>
                  <ListItemButton 
                    alignItems="flex-start"
                    onClick={() => handleResultClick(result.url)}
                    disabled={!result.url}
                  >
                    {renderIcon(result.type)}
                    <ListItemText
                      primary={
                        <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 'bold' }}>
                          {result.title}
                        </Typography>
                      }
                      secondary={
                        <>
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(result.published_date).toLocaleDateString('de-DE')}
                            </Typography>
                            <Chip 
                              label={getChipLabel(result.type)} 
                              size="small" 
                              color={getChipColor(result.type)}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </Box>
                          <Typography variant="body2" color="text.primary">
                            {result.summary ? (result.summary.length > 250 ? `${result.summary.substring(0, 250)}...` : result.summary) : ''}
                          </Typography>
                        </>
                      }
                    />
                  </ListItemButton>
                </ListItem>
                {index < results.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>
    </Container>
  );
};

export default SearchResultsPage;