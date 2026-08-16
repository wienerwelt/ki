// frontend/src/components/VoteSourcesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, CircularProgress, Alert, Rating, List, Link as MuiLink, Avatar, Chip } from '@mui/material';
import apiClient from '../apiClient';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { resolveAssetUrl } from '../utils/assetUrl';

interface PendingSource {
    id: string;
    url: string;
    description: string | null;
    category_name: string | null;
    category_name_lang: string | null;
    logo_url: string | null; // NEU: Logo Unterstützung
}

// Hilfsfunktion zur Bildgenerierung
const getImageUrl = (url: string | null) => {
    return resolveAssetUrl(url);
};

// Hilfsfunktion für den Fallback-Avatar
const getDomainInitial = (url: string) => {
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        return domain.charAt(0).toUpperCase();
    } catch {
        return url.charAt(0).toUpperCase();
    }
};

export const VoteSourcesList: React.FC = () => {
    const [sources, setSources] = useState<PendingSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPendingSources = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/sources/pending', { headers: { 'x-auth-token': token } });
            setSources(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Vorschläge.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPendingSources();
    }, [fetchPendingSources]);

    const handleVote = async (sourceId: string, rating: number | null) => {
        if (!rating) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/sources/${sourceId}/vote`, { rating }, { headers: { 'x-auth-token': token } });
            setSources(prev => prev.filter(s => s.id !== sourceId));
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler bei der Abstimmung.');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;

    return (
        <Box maxWidth="md" mx="auto">
            <Box sx={{ mb: 4, textAlign: 'center' }}>
                <Typography variant="h5" gutterBottom fontWeight="bold" color="primary.main">Stimme jetzt ab und verdiene Punkte!</Typography>
                <Typography variant="body1" color="text.secondary">
                    Bewerte die Vertrauenswürdigkeit der von anderen Nutzern vorgeschlagenen Quellen. Für jede Bewertung erhältst du <strong>+1 Punkt</strong> für dein Community-Konto.
                </Typography>
            </Box>

            {sources.length > 0 ? (
                <List sx={{ p: 0 }}>
                    {sources.map((source) => (
                        <Paper key={source.id} elevation={1} sx={{ p: { xs: 2, sm: 3 }, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                            <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }}>
                                
                                {/* Linke Spalte: Logo & Info */}
                                <Box sx={{ flexGrow: 1, display: 'flex', gap: 2, alignItems: 'flex-start', width: '100%' }}>
                                    {source.logo_url ? (
                                        <Box 
                                            component="img" 
                                            src={getImageUrl(source.logo_url)} 
                                            alt="Logo" 
                                            onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                                event.currentTarget.onerror = null;
                                                event.currentTarget.src = '/logos/default-company.svg';
                                            }}
                                            sx={{ width: 64, height: 64, objectFit: 'contain', bgcolor: 'grey.50', p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider', flexShrink: 0 }} 
                                        />
                                    ) : (
                                        <Avatar variant="rounded" sx={{ width: 64, height: 64, bgcolor: 'secondary.main', fontSize: '1.5rem', fontWeight: 'bold', flexShrink: 0 }}>
                                            {getDomainInitial(source.url)}
                                        </Avatar>
                                    )}
                                    
                                    <Box>
                                        <MuiLink href={source.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', alignItems: 'center', color: 'text.primary', mb: 0.5 }}>
                                            <Typography variant="h6" component="span" sx={{ fontWeight: 'bold', wordBreak: 'break-all' }}>
                                                {source.url.replace(/^https?:\/\//, '')}
                                            </Typography>
                                            <OpenInNewIcon sx={{ ml: 1, fontSize: '1.2rem', color: 'primary.main' }} />
                                        </MuiLink>
                                        
                                        {(source.category_name_lang || source.category_name) && (
                                            <Chip label={source.category_name_lang || source.category_name} size="small" sx={{ mb: 1.5, bgcolor: 'action.hover' }} />
                                        )}
                                        
                                        <Typography variant="body2" color="text.secondary">
                                            {source.description || 'Keine Beschreibung vorhanden.'}
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Rechte Spalte: Voting Bereich */}
                                <Box sx={{ 
                                    minWidth: { sm: '200px' }, 
                                    width: { xs: '100%', sm: 'auto' }, 
                                    bgcolor: 'background.default', 
                                    p: 2, 
                                    borderRadius: 2, 
                                    textAlign: 'center',
                                    border: '1px dashed',
                                    borderColor: 'primary.light'
                                }}>
                                    <Typography variant="subtitle2" color="primary.main" sx={{ mb: 1, fontWeight: 'bold' }}>
                                        Wie vertrauenswürdig?
                                    </Typography>
                                    <Rating 
                                        name={`rating-${source.id}`} 
                                        size="large"
                                        onChange={(event, newValue) => handleVote(source.id, newValue)} 
                                    />
                                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                                        1 Stern = Spam/Fake <br/> 5 Sterne = Exzellent
                                    </Typography>
                                </Box>

                            </Box>
                        </Paper>
                    ))}
                </List>
            ) : (
                <Alert severity="info" sx={{ borderRadius: 2 }}>Derzeit gibt es keine neuen Vorschläge zum Abstimmen. Schau bald wieder vorbei!</Alert>
            )}
        </Box>
    );
};
