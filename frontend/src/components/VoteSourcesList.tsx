// frontend/src/components/VoteSourcesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, CircularProgress, Alert, Rating, List, Link as MuiLink } from '@mui/material';
import apiClient from '../apiClient';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface PendingSource {
    id: string;
    url: string;
    description: string | null;
    category_name: string | null;
    category_name_lang: string | null; // NEU
}

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

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Box>
            <Typography variant="h6" gutterBottom>Stimme jetzt ab und verdiene Punkte!</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Bewerte die Vertrauenswürdigkeit der von anderen Nutzern vorgeschlagenen Quellen. Für jede Bewertung erhältst du +1 Punkt.
            </Typography>
            {sources.length > 0 ? (
                <List>
                    {sources.map((source) => (
                        <React.Fragment key={source.id}>
                            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                                    {source.url}
                                     <MuiLink href={source.url} target="_blank" rel="noopener noreferrer" sx={{ ml: 1, verticalAlign: 'middle' }}>
                                        <OpenInNewIcon fontSize="small" />
                                    </MuiLink>
                                </Typography>
                                {/* HIER DIE ÄNDERUNG: Nutze name_lang für die Anzeige */}
                                {(source.category_name_lang || source.category_name) && <Typography variant="caption" color="text.secondary">Kategorie: {source.category_name_lang || source.category_name}</Typography>}
                                <Typography variant="body2" sx={{ my: 1 }}>{source.description || 'Keine Beschreibung vorhanden.'}</Typography>
                                
                                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                    <Typography variant="body2" sx={{ mr: 2 }}>Deine Bewertung:</Typography>
                                    <Rating name={`rating-${source.id}`} onChange={(event, newValue) => handleVote(source.id, newValue)} />
                                </Box>
                            </Paper>
                        </React.Fragment>
                    ))}
                </List>
            ) : (
                <Alert severity="info">Derzeit gibt es keine neuen Vorschläge zum Abstimmen. Schau bald wieder vorbei!</Alert>
            )}
        </Box>
    );
};