// frontend/src/components/BrowseSourcesList.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Paper, Typography, CircularProgress, Alert, Rating, Link as MuiLink,
    TextField, InputAdornment, Grid, Autocomplete, Chip
} from '@mui/material';
import apiClient from '../apiClient';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';

// --- Interfaces ---
interface ApprovedSource {
    id: string;
    url: string;
    description: string | null;
    average_rating: number;
    vote_count: number;
    category_name: string | null;
    category_name_lang: string | null; // NEU
    created_at: string;
}

interface Category {
    id: string;
    name: string;
    name_lang: string | null; // NEU
}

export const BrowseSourcesList: React.FC = () => {
    const [sources, setSources] = useState<ApprovedSource[]>([]);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [sourcesRes, categoriesRes] = await Promise.all([
                    apiClient.get('/api/sources'),
                    apiClient.get('/api/sources/categories')
                ]);
                setSources(sourcesRes.data);
                setAllCategories(categoriesRes.data);
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Laden der Quellen.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);
    
    const filteredSources = useMemo(() => {
        return sources.filter(source => {
            const matchesSearch = searchTerm === '' || 
                source.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (source.description && source.description.toLowerCase().includes(searchTerm.toLowerCase()));
            
            // Filterlogik nutzt jetzt den Namen der ausgewählten Kategorie
            const matchesCategory = !selectedCategory || (source.category_name_lang === selectedCategory.name_lang) || (source.category_name === selectedCategory.name);

            return matchesSearch && matchesCategory;
        });
    }, [sources, searchTerm, selectedCategory]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <Box>
            <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField 
                    variant="outlined" 
                    size="small" 
                    placeholder="Suche nach URL oder Beschreibung..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)}
                    sx={{ flexGrow: 1, minWidth: '250px' }}
                    InputProps={{ 
                        startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), 
                    }} 
                />
                <Autocomplete
                    options={allCategories}
                    // HIER DIE ÄNDERUNG: Nutze name_lang für die Anzeige im Filter
                    getOptionLabel={(option) => option.name_lang || option.name}
                    value={selectedCategory}
                    onChange={(event, newValue) => setSelectedCategory(newValue)}
                    sx={{ width: 250 }}
                    renderInput={(params) => <TextField {...params} label="Kategorie filtern" size="small" />}
                />
            </Paper>

            <Grid container spacing={2}>
                {filteredSources.length > 0 ? filteredSources.map(source => (
                    <Grid item xs={12} sm={6} md={4} key={source.id}>
                        <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ flexGrow: 1 }}>
                                {/* HIER DIE ÄNDERUNG: Nutze name_lang für die Anzeige im Chip */}
                                {(source.category_name_lang || source.category_name) && <Chip label={source.category_name_lang || source.category_name} size="small" sx={{ mb: 1 }} />}
                                <Typography variant="body1" sx={{ fontWeight: 'bold', wordBreak: 'break-all' }}>
                                    {source.url}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
                                    {source.description || 'Keine Beschreibung.'}
                                </Typography>
                            </Box>
                            <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Rating value={source.average_rating} precision={0.1} readOnly size="small" />
                                        <Typography variant="body2" sx={{ ml: 1 }}>({source.vote_count} Stimmen)</Typography>
                                    </Box>
                                    <MuiLink href={source.url} target="_blank" rel="noopener noreferrer">
                                        <OpenInNewIcon fontSize="small" />
                                    </MuiLink>
                                </Box>
                            </Box>
                        </Paper>
                    </Grid>
                )) : (
                    <Grid item xs={12}>
                        <Alert severity="info">Keine Quellen für deine Filterauswahl gefunden.</Alert>
                    </Grid>
                )}
            </Grid>
        </Box>
    );
};