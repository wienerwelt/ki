// frontend/src/pages/SearchResultsPage.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Box, CircularProgress, Alert, List, ListItem, ListItemText,
  Paper, Divider, Chip, ListItemButton, Button
} from '@mui/material';

import ArticleIcon from '@mui/icons-material/Article';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BusinessIcon from '@mui/icons-material/Business';
import FolderIcon from '@mui/icons-material/Folder';
import ForumIcon from '@mui/icons-material/Forum';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PodcastsIcon from '@mui/icons-material/Podcasts';
import YouTubeIcon from '@mui/icons-material/YouTube';

import apiClient from '../apiClient';
import AiContentLabel from '../components/AiContentLabel';

interface SearchResult {
  id: string;
  title: string;
  summary: string | null;
  published_date: string;
  type: 'scraped' | 'ai' | 'tracked_account_news' | 'file' | 'community_post'; 
  // ✅ NEU: Category Feld
  category: string | null;
  relevance: number;
  url: string | null;
}

const SearchResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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

  // HILFSFUNKTION: Medien-Typ erkennen
  const getMediaType = (category: string | null) => {
    if (!category) return 'text';
    const cat = category.toLowerCase();
    if (cat.includes('podcast') || cat.includes('audio')) return 'podcast';
    if (cat.includes('video') || cat.includes('movie') || cat.includes('tv') || cat.includes('youtube')) return 'video';
    return 'text';
  };

  // ✅ LOGIK: Icon basierend auf Typ UND Kategorie wählen
  const renderIcon = (result: SearchResult) => {
    // Spezial-Typen zuerst
    if (result.type === 'ai') return <SmartToyIcon sx={{ mr: 2, color: 'secondary.main', fontSize: 30 }} />;
    if (result.type === 'tracked_account_news') return <BusinessIcon sx={{ mr: 2, color: 'primary.main', fontSize: 30 }} />;
    if (result.type === 'file') return <FolderIcon sx={{ mr: 2, color: 'info.main', fontSize: 30 }} />;
    if (result.type === 'community_post') return <ForumIcon sx={{ mr: 2, color: 'warning.main', fontSize: 30 }} />;
    
    // Für 'scraped' Inhalte den Medientyp prüfen
    const mediaType = getMediaType(result.category);
    if (mediaType === 'podcast') return <PodcastsIcon sx={{ mr: 2, color: 'purple', fontSize: 30 }} />;
    if (mediaType === 'video') return <YouTubeIcon sx={{ mr: 2, color: 'red', fontSize: 30 }} />;
    
    // Standard Artikel
    return <ArticleIcon sx={{ mr: 2, color: 'text.secondary', fontSize: 30 }} />;
  };

  // ✅ LOGIK: Label dynamisch anpassen
  const getChipLabel = (result: SearchResult) => {
    switch (result.type) {
      case 'ai': return 'KI-Analyse';
      case 'tracked_account_news': return 'Account-News';
      case 'file': return 'Datei';
      case 'community_post': return 'Community';
      case 'scraped':
        const mediaType = getMediaType(result.category);
        if (mediaType === 'podcast') return 'Podcast';
        if (mediaType === 'video') return 'Video';
        return 'Artikel';
      default: return 'Inhalt';
    }
  };

  const getChipColor = (type: SearchResult['type']): "primary" | "secondary" | "default" | "info" | "warning" => {
    switch (type) {
      case 'ai': return 'secondary';
      case 'tracked_account_news': return 'primary';
      case 'file': return 'info';
      case 'community_post': return 'warning';
      default: return 'default';
    }
  };

  const handleResultClick = (url: string | null) => {
    if (!url) return;
    if (url.startsWith('/')) {
      navigate(url);
    } else {
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
          <Box sx={{ textAlign: 'center', py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="body1" color="text.secondary" paragraph>
              Keine direkten Treffer für "{term}" gefunden.
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Möchten Sie stattdessen die KI fragen, um eine Antwort aus unseren internen Dokumenten zu generieren?
            </Typography>
            <Button
              variant="contained"
              // ✅ Button ist jetzt 'primary' (wie die anderen Buttons)
              color="primary" 
              size="large"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => navigate(`/ask?question=${encodeURIComponent(term || '')}`)}
            >
              KI-Assistent fragen
            </Button>
          </Box>
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
                    {/* Render Icon entscheidet jetzt intelligent */}
                    {renderIcon(result)}
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
                            {/* Chip zeigt jetzt Podcast/Video direkt an */}
                            <Chip 
                              label={getChipLabel(result)} 
                              size="small" 
                              color={getChipColor(result.type)}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                            {result.type === 'ai' && <AiContentLabel kind="generated" size={14} />}
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
