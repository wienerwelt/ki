// frontend/src/components/BrowseSourcesList.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box, Paper, Typography, CircularProgress, Alert, Rating, Link as MuiLink,
    TextField, InputAdornment, Grid, Autocomplete, Chip, Avatar
} from '@mui/material';
import apiClient from '../apiClient';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import { resolveAssetUrl } from '../utils/assetUrl';

// --- Interfaces ---
interface ApprovedSource {
    id: string;
    url: string;
    description: string | null;
    average_rating: number;
    vote_count: number;
    category_name: string | null;
    category_name_lang: string | null;
    logo_url: string | null; 
    created_at: string;
}

interface Category {
    id: string;
    name: string;
    name_lang: string | null;
}

// Hilfsfunktion zur Bildgenerierung (inkl. Fallback-Port)
const getImageUrl = (url: string | null) => {
    return resolveAssetUrl(url);
};

// Hilfsfunktion für den Fallback-Avatar (Erster Buchstabe der Domain)
const getDomainInitial = (url: string) => {
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        return domain.charAt(0).toUpperCase();
    } catch {
        return url.charAt(0).toUpperCase();
    }
};

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
            
            const matchesCategory = !selectedCategory || 
                (source.category_name_lang === selectedCategory.name_lang) || 
                (source.category_name === selectedCategory.name);

            return matchesSearch && matchesCategory;
        });
    }, [sources, searchTerm, selectedCategory]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;

    return (
        <Box>
            <Paper variant="outlined" sx={{ p: 2, mb: 4, borderRadius: 2, bgcolor: 'background.default' }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={7}>
                        <TextField 
                            fullWidth
                            variant="outlined" 
                            placeholder="Suchen nach Domain, Name oder Beschreibung..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{ 
                                startAdornment: (<InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>), 
                                sx: { bgcolor: 'background.paper' }
                            }} 
                        />
                    </Grid>
                    <Grid item xs={12} md={5}>
                        <Autocomplete
                            fullWidth
                            options={allCategories}
                            getOptionLabel={(option) => option.name_lang || option.name}
                            value={selectedCategory}
                            // KORREKTUR: Unterstrich vor _event hinzugefügt
                            onChange={(_event, newValue) => setSelectedCategory(newValue)}
                            renderInput={(params) => <TextField {...params} label="Nach Kategorie filtern" sx={{ bgcolor: 'background.paper' }} />}
                        />
                    </Grid>
                </Grid>
            </Paper>

            <Grid container spacing={3}>
                {filteredSources.length > 0 ? filteredSources.map(source => (
                    <Grid item xs={12} sm={6} lg={4} key={source.id}>
                        <Paper elevation={2} sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 3, transition: 'transform 0.2s, box-shadow 0.2s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 6 } }}>
                            
                            {/* Header: Logo & URL */}
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 2 }}>
                                {source.logo_url ? (
                                    <Box 
                                        component="img" 
                                        src={getImageUrl(source.logo_url)} 
                                        alt="Logo" 
                                        onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                            event.currentTarget.onerror = null;
                                            event.currentTarget.src = '/logos/default-company.svg';
                                        }}
                                        sx={{ width: 48, height: 48, objectFit: 'contain', bgcolor: 'grey.50', p: 0.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }} 
                                    />
                                ) : (
                                    <Avatar variant="rounded" sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontWeight: 'bold' }}>
                                        {getDomainInitial(source.url)}
                                    </Avatar>
                                )}
                                
                                <Box sx={{ overflow: 'hidden' }}>
                                    <MuiLink href={source.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', color: 'text.primary', mb: 0.5 }}>
                                        <Typography noWrap sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                            {source.url.replace(/^https?:\/\//, '')}
                                        </Typography>
                                        <OpenInNewIcon sx={{ ml: 0.5, fontSize: '1rem', color: 'primary.main', flexShrink: 0 }} />
                                    </MuiLink>
                                    {(source.category_name_lang || source.category_name) && (
                                        <Chip label={source.category_name_lang || source.category_name} size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                                    )}
                                </Box>
                            </Box>

                            {/* Body: Description */}
                            <Box sx={{ flexGrow: 1, mb: 2 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {source.description || 'Keine Beschreibung vorhanden.'}
                                </Typography>
                            </Box>

                            {/* Footer: Rating */}
                            <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Community-Trust</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Rating value={source.average_rating} precision={0.1} readOnly size="small" />
                                    </Box>
                                </Box>
                                <Typography variant="body2" fontWeight="bold" color="text.secondary">
                                    {source.vote_count} {source.vote_count === 1 ? 'Stimme' : 'Stimmen'}
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>
                )) : (
                    <Grid item xs={12}>
                        <Alert severity="info" sx={{ borderRadius: 2 }}>Keine Quellen für deine Filterauswahl gefunden.</Alert>
                    </Grid>
                )}
            </Grid>
        </Box>
    );
};
