import React, { useState, useEffect, useCallback } from 'react';
import {
    Container, Typography, Box, Grid, TextField, CircularProgress, Alert,
    Paper, FormControl, InputLabel, Select, MenuItem, Button, Dialog,
    DialogTitle, DialogContent, DialogContentText, DialogActions, IconButton,
    ListItemText, Checkbox, OutlinedInput, ListSubheader, ListItemIcon, Switch, FormControlLabel,
    ToggleButtonGroup, ToggleButton, useTheme, useMediaQuery
} from '@mui/material';
import { format } from 'date-fns';
import { de } from 'date-fns/locale/de';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import TimelineIcon from '@mui/icons-material/Timeline';
import StarIcon from '@mui/icons-material/Star';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

// KORREKTUR: Dieser Import hat gefehlt
import { Link as RouterLink } from 'react-router-dom';

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useDebounce } from 'use-debounce';

import DashboardLayout from '../components/DashboardLayout';
import FundingResultCard from '../components/FundingResultCard';
import TimelineView from '../components/TimelineView';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

interface FundingResult {
  id: string;
  title: string;
  summary_ai: string;
  deadline_end: string | null;
  region: string;
  funding_amount_max?: number;
  original_url: string;
  categories?: string[];
  match_score: number;
  latitude?: number;
  longitude?: number;
  user_status: 'favorited' | 'hidden' | 'applied' | null;
}

interface FundingCategory {
    id: number;
    name: string;
}

interface Aggregations {
    byCategory?: Record<string, number>;
    byRegion?: Record<string, number>;
    byUserStatus?: Record<string, number>;
}

interface SavedSearch {
    id: string;
    search_name: string;
    search_criteria: any;
    notifications_enabled: boolean;
}

interface SearchResponse {
    results: FundingResult[];
    aggregations: Aggregations;
    profile_incomplete?: boolean;
}

const FundingSearchPage: React.FC = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    
    const [results, setResults] = useState<FundingResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [categories, setCategories] = useState<FundingCategory[]>([]);
    const [sortBy, setSortBy] = useState('deadline_end');
    const { showSnackbar } = useSnackbar();
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [viewMode, setViewMode] = useState<'card' | 'timeline'>('card');
    const [availableRegions, setAvailableRegions] = useState<string[]>([]);
    const [userStatusFilter, setUserStatusFilter] = useState<string | null>(null);
    const [aggregations, setAggregations] = useState<Aggregations>({});
    const [profileIncomplete, setProfileIncomplete] = useState(false);

    const [filters, setFilters] = useState({
        q: '',
        selectedCategories: [] as number[],
        regions: '',
        deadlineBefore: null as Date | null,
    });
    const [debouncedFilters] = useDebounce(filters, 500);

    const [draftModalOpen, setDraftModalOpen] = useState(false);
    const [draftContent, setDraftContent] = useState('');
    const [draftLoading, setDraftLoading] = useState(false);
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [searchName, setSearchName] = useState('');

    const searchFunding = useCallback(async () => {
        setLoading(true);
        setError(null);
        setProfileIncomplete(false);
        try {
            const params: any = {
                q: debouncedFilters.q || undefined,
                regions: debouncedFilters.regions || undefined,
                categories: debouncedFilters.selectedCategories.join(',') || undefined,
                deadlineBefore: debouncedFilters.deadlineBefore
                    ? format(debouncedFilters.deadlineBefore, 'yyyy-MM-dd')
                    : undefined,
                sortBy,
                order: sortBy === 'match_score' ? 'desc' : 'asc',
                userStatus: userStatusFilter || undefined,
                includeHidden: userStatusFilter ? undefined : 'true',
            };
            const { data } = await apiClient.get<SearchResponse>('/api/funding/search', { params });
            if (data) {
                if (data.profile_incomplete) {
                    setProfileIncomplete(true);
                    setResults([]);
                } else {
                    setResults(data.results || []);
                }
                setAggregations(data.aggregations || {});
            } else {
                setResults([]);
                setAggregations({});
            }
        } catch (err) {
            setError('Fehler bei der Suche.');
            setResults([]);
            setAggregations({});
        } finally {
            setLoading(false);
        }
    }, [debouncedFilters, sortBy, userStatusFilter]);

    const fetchSavedSearches = useCallback(async () => {
        try {
            const { data } = await apiClient.get('/api/funding/saved-searches');
            setSavedSearches(data || []);
        } catch (error) {
            console.error('Gespeicherte Suchen konnten nicht geladen werden', error);
        }
    }, []);

    useEffect(() => {
        apiClient.get('/api/funding/categories').then(({ data }) => setCategories(data || []));
        apiClient.get('/api/funding/used-regions').then(({ data }) => setAvailableRegions(data || []));
        fetchSavedSearches();
    }, [fetchSavedSearches]);

    useEffect(() => {
        searchFunding();
    }, [searchFunding]);

    const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
        const { name, value } = event.target as any;
        setFilters(prev => ({ ...prev, [name as string]: value }));
    };

    const handleDateChange = (newDate: Date | null) => {
        setFilters(prev => ({ ...prev, deadlineBefore: newDate }));
    };

    const handleCategoryChange = (event: any) => {
        const { target: { value } } = event;
        setFilters(prev => ({ ...prev, selectedCategories: typeof value === 'string' ? value.split(',') : value }));
    };

    const handleSaveSearch = () => {
        if (!filters.q && !filters.regions && filters.selectedCategories.length === 0 && !filters.deadlineBefore) {
            showSnackbar('Bitte wenden Sie zuerst Filter an, um eine Suche zu speichern.', 'info');
            return;
        }
        setSaveModalOpen(true);
    };

    const handleConfirmSaveSearch = async () => {
        if (!searchName.trim()) {
            showSnackbar('Bitte geben Sie einen Namen für Ihre Suche ein.', 'warning');
            return;
        }
        try {
            await apiClient.post('/api/funding/saved-searches', { searchName: searchName.trim(), searchCriteria: filters });
            showSnackbar(`Suche "${searchName.trim()}" wurde erfolgreich gespeichert!`, 'success');
            setSaveModalOpen(false);
            setSearchName('');
            fetchSavedSearches();
        } catch (error) {
            showSnackbar('Fehler beim Speichern der Suche.', 'error');
        }
    };

    const handleLoadSearch = (searchId: string) => {
        const searchToLoad = savedSearches.find(s => s.id === searchId);
        if (searchToLoad) {
            const criteria = searchToLoad.search_criteria;
            const filtersToSet = { ...criteria, deadlineBefore: criteria.deadlineBefore ? new Date(criteria.deadlineBefore) : null };
            setFilters(filtersToSet);
            setUserStatusFilter(null);
            showSnackbar(`Suche "${searchToLoad.search_name}" geladen.`, 'info');
        }
    };

    const handleDeleteSearch = async (searchId: string, searchName: string) => {
        if (window.confirm(`Möchten Sie die Suche "${searchName}" wirklich löschen?`)) {
            try {
                await apiClient.delete(`/api/funding/saved-searches/${searchId}`);
                showSnackbar(`Suche "${searchName}" gelöscht.`, 'success');
                fetchSavedSearches();
            } catch (error) {
                showSnackbar('Fehler beim Löschen der Suche.', 'error');
            }
        }
    };

    const handleToggleNotifications = async (search: SavedSearch) => {
        setSavedSearches(prev => prev.map(s => s.id === search.id ? { ...s, notifications_enabled: !s.notifications_enabled } : s));
        try {
            await apiClient.put(`/api/funding/saved-searches/${search.id}/toggle-notifications`);
        } catch (error) {
            showSnackbar('Fehler beim Ändern der Benachrichtigungseinstellung.', 'error');
            setSavedSearches(prev => prev.map(s => s.id === search.id ? { ...s, notifications_enabled: search.notifications_enabled } : s));
        }
    };

    const handleFindSimilar = (item: FundingResult) => {
        setFilters({ q: '', regions: item.region, selectedCategories: categories.filter(c => item.categories?.includes(c.name)).map(c => c.id), deadlineBefore: null });
        showSnackbar(`Suche nach Förderungen ähnlich zu "${item.title}"`, 'info');
    };

    const handleGenerateDraft = async (item: FundingResult) => {
        setDraftModalOpen(true);
        setDraftLoading(true);
        setDraftContent('');
        try {
            const { data } = await apiClient.post('/api/funding/generate-draft', { fundingId: item.id });
            setDraftContent(data.draft);
        } catch (error) {
            setDraftContent('Entschuldigung, der Entwurf konnte nicht erstellt werden.');
        } finally {
            setDraftLoading(false);
        }
    };

    const handleSetStatus = async (opportunityId: string, status: FundingResult['user_status'] | null) => {
        try {
            await apiClient.post('/api/funding/status', { opportunityId, status });
            searchFunding();
        } catch (error) {
            showSnackbar('Status konnte nicht aktualisiert werden.', 'error');
        }
    };

    const totalCount = (() => {
        const byUS = aggregations.byUserStatus || {};
        return Object.values(byUS).reduce((a, b) => a + (b || 0), 0);
    })();

    return (
        <DashboardLayout>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={de}>
                <Container maxWidth="xl" sx={{ mt: isMobile ? 2 : 4, mb: 4, px: isMobile ? 1 : 3 }}>
                    <Typography variant={isMobile ? "h5" : "h4"} component="h1" gutterBottom>
                        Förder-Assistent {results.length > 0 && `(${results.length} Treffer)`}
                    </Typography>
                    
                    <Paper sx={{ p: isMobile ? 2 : 3, mb: 3 }}>
                        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}>
                            <Typography variant="h6" gutterBottom>Persönliche Filter</Typography>
                            {savedSearches.length > 0 && (
                                <FormControl fullWidth sx={{ mb: 2 }} size="small">
                                    <InputLabel>Gespeicherte Suche laden</InputLabel>
                                    <Select label="Gespeicherte Suche laden" defaultValue="" onChange={(e) => { if (e.target.value) handleLoadSearch(e.target.value as string)}}>
                                        {savedSearches.map((search) => (
                                            <MenuItem key={search.id} value={search.id}>
                                                <ListItemText primary={search.search_name} />
                                                <FormControlLabel sx={{ mr: 1, ml: 'auto' }} control={ <Switch checked={search.notifications_enabled} onClick={(e) => { e.stopPropagation(); handleToggleNotifications(search); }} /> } label={<Typography variant="caption">E-Mail</Typography>} labelPlacement="start" />
                                                <ListItemIcon sx={{ minWidth: 'auto' }}>
                                                    <IconButton edge="end" aria-label="delete" onClick={(e) => { e.stopPropagation(); handleDeleteSearch(search.id, search.search_name); }}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </ListItemIcon>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}
                            <ToggleButtonGroup
                                value={userStatusFilter || 'all'}
                                exclusive
                                onChange={(_, newValue) => {
                                    if (!newValue) return;
                                    setUserStatusFilter(newValue === 'all' ? null : newValue);
                                }}
                                aria-label="Status-Filter"
                                size="small"
                                fullWidth={isMobile}
                                orientation={isMobile ? 'vertical' : 'horizontal'}
                            >
                                <ToggleButton value="all" aria-label="alle">
                                    Alle ({totalCount || 0})
                                </ToggleButton>
                                <ToggleButton value="favorited" aria-label="favoriten">
                                    <StarIcon sx={{ mr: 1 }} /> Gemerkt ({(aggregations.byUserStatus || {}).favorited || 0})
                                </ToggleButton>
                                <ToggleButton value="applied" aria-label="beworben">
                                    <CheckCircleIcon sx={{ mr: 1 }} /> Beworben ({(aggregations.byUserStatus || {}).applied || 0})
                                </ToggleButton>
                                <ToggleButton
                                    value="hidden"
                                    aria-label="ausgeblendet"
                                    sx={{ '&.Mui-selected': { color: 'error.main', borderColor: 'error.main', '&:hover': { backgroundColor: 'rgba(211, 47, 47, 0.08)'}}}}
                                >
                                    <VisibilityOffIcon sx={{ mr: 1 }} /> Ausgeblendet ({(aggregations.byUserStatus || {}).hidden || 0})
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                        
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                            <Typography variant="h6">Allgemeine Filter</Typography>
                            <ToggleButtonGroup 
                                value={viewMode} 
                                exclusive 
                                onChange={(_, newView) => { if (newView) setViewMode(newView as 'card' | 'timeline'); }} 
                                aria-label="Ansichtsmodus"
                                size="small"
                            >
                                <ToggleButton value="card" aria-label="Kartenansicht"><ViewModuleIcon /></ToggleButton>
                                <ToggleButton value="timeline" aria-label="Timeline-Ansicht"><TimelineIcon /></ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} md={3}>
                                <TextField fullWidth size="small" name="q" label="Stichwortsuche" value={filters.q} onChange={handleFilterChange} />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Region</InputLabel>
                                    <Select name="regions" value={filters.regions} label="Region" onChange={handleFilterChange as any}>
                                        <MenuItem value=""><em>Alle Regionen</em>{totalCount ? ` (${totalCount})` : ''}</MenuItem>
                                        {availableRegions.length > 0 && <ListSubheader>Österreich</ListSubheader>}
                                        {availableRegions
                                            .filter(r => !['EU', 'Deutschland'].includes(r))
                                            .map(r => (
                                                <MenuItem key={r} value={r}>{`${r} (${(aggregations.byRegion || {})[r] || 0})`}</MenuItem>
                                            ))}
                                        {availableRegions.filter(r => r === 'Deutschland').length > 0 && <ListSubheader>Deutschland</ListSubheader>}
                                        {availableRegions
                                            .filter(r => r === 'Deutschland')
                                            .map(r => (
                                                <MenuItem key={r} value={r}>{`${r} (${(aggregations.byRegion || {})[r] || 0})`}</MenuItem>
                                            ))}
                                        {availableRegions.filter(r => r === 'EU').length > 0 && <ListSubheader>Europa</ListSubheader>}
                                        {availableRegions
                                            .filter(r => r === 'EU')
                                            .map(r => (
                                                <MenuItem key={r} value={r}>{`${r} (${(aggregations.byRegion || {})[r] || 0})`}</MenuItem>
                                            ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Kategorien</InputLabel>
                                    <Select
                                        multiple
                                        name="selectedCategories"
                                        value={filters.selectedCategories}
                                        onChange={handleCategoryChange}
                                        input={<OutlinedInput label="Kategorien" />}
                                        renderValue={(selected) => categories.filter(c => (selected as number[]).includes(c.id)).map(c => c.name).join(', ')}
                                    >
                                        {categories.map((cat) => (
                                            <MenuItem key={cat.id} value={cat.id}>
                                                <Checkbox checked={filters.selectedCategories.indexOf(cat.id) > -1} />
                                                <ListItemText primary={`${cat.name} (${(aggregations.byCategory as any)?.[cat.id] || 0})`} />
                                            </MenuItem>
                                        ))}
                                        {(aggregations.byCategory as any)?.['Sonstige'] && (
                                            <MenuItem value="Sonstige">
                                                <Checkbox disabled />
                                                <ListItemText primary={`Sonstige (${(aggregations.byCategory as any)['Sonstige']})`} />
                                            </MenuItem>
                                        )}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                                <DatePicker label="Einreichfrist bis" value={filters.deadlineBefore} onChange={handleDateChange} slotProps={{ textField: { fullWidth: true, size: 'small' } }}/>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Sortieren nach</InputLabel>
                                    <Select value={sortBy} label="Sortieren nach" onChange={(e) => setSortBy(e.target.value)}>
                                        <MenuItem value="deadline_end">Einreichfrist</MenuItem>
                                        <MenuItem value="funding_amount_max">Förderhöhe</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                                <Button variant="contained" onClick={handleSaveSearch} fullWidth>Suche speichern</Button>
                            </Grid>
                        </Grid>
                    </Paper>
                    <Box>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
                        ) : error ? (
                            <Alert severity="error">{error}</Alert>
                        ) : profileIncomplete ? (
                            <Paper sx={{ p: 4, textAlign: 'center' }}>
                                <Typography variant="h6" gutterBottom>Bitte Profil vervollständigen</Typography>
                                <Typography color="text.secondary" sx={{ mb: 2 }}>
                                    Um passende Förderungen für Sie zu finden, hinterlegen Sie bitte Ihre Interessen (Kategorien) in Ihrem Profil.
                                </Typography>
                                <Button component={RouterLink} to="/profile" variant="contained">Zum Profil</Button>
                            </Paper>
                        ) : results.length === 0 ? (
                            <Typography sx={{ textAlign: 'center', p: 5 }}>Keine Förderungen für Ihre Kriterien gefunden.</Typography>
                        ) : (
                            viewMode === 'card' ? (
                                <Grid container spacing={3}>
                                    {results.map(item => (
                                        <FundingResultCard
                                            key={item.id}
                                            item={item}
                                            allCategories={categories}
                                            selectedCategoryIds={filters.selectedCategories}
                                            onFindSimilar={handleFindSimilar}
                                            onGenerateDraft={handleGenerateDraft}
                                            onSetStatus={handleSetStatus}
                                        />
                                    ))}
                                </Grid>
                            ) : (
                                <TimelineView data={results} />
                            )
                        )}
                    </Box>
                </Container>
            </LocalizationProvider>
            <Dialog open={draftModalOpen} onClose={() => setDraftModalOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>
                    KI-Anschreiben-Entwurf
                    <IconButton onClick={() => setDraftModalOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {draftLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
                    ) : (
                        <DialogContentText sx={{ whiteSpace: 'pre-wrap' }}>{draftContent}</DialogContentText>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => navigator.clipboard.writeText(draftContent)} disabled={draftLoading}>Text kopieren</Button>
                </DialogActions>
            </Dialog>
            <Dialog open={saveModalOpen} onClose={() => setSaveModalOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>Suche speichern</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        Geben Sie dieser Filterkombination einen Namen, um sie später wiederzuverwenden und Benachrichtigungen über neue Treffer zu erhalten.
                    </DialogContentText>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="search-name"
                        label="Name der Suche (z.B. 'Umweltförderungen Wien')"
                        type="text"
                        fullWidth
                        variant="standard"
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirmSaveSearch()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSaveModalOpen(false)}>Abbrechen</Button>
                    <Button onClick={handleConfirmSaveSearch} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default FundingSearchPage;