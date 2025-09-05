// src/pages/AdminScrapingRulesPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Switch, FormControlLabel, Chip, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, LinearProgress,
    SelectChangeEvent,
    Link as MuiLink,
    Snackbar,
    Autocomplete,
    Grid
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import ScheduleIcon from '@mui/icons-material/Schedule'; // NEUER IMPORT
import DashboardLayout from '../components/DashboardLayout';
import AdminScheduleSelector from '../components/AdminScheduleSelector';
import apiClient from '../apiClient';

// --- Interfaces ---
interface ScrapingRule {
    id: string;
    source_identifier: string;
    url_pattern: string | null;
    content_container_selector: string | null;
    title_selector: string | null;
    date_selector: string | null;
    description_selector: string | null;
    date_format: string | null;
    category_default: string | null;
    is_active: boolean;
    last_scraped_at: string | null;
    created_at: string;
    updated_at: string;
    name: string | null;
    current_entry_count: number;
    region: string | null;
    link_selector: string | null;
    schedule: string | null;
    scrape_after_date: string | null; // Hinzugefügt
}

interface Category {
    id: string;
    name: string;
}

// --- Sortier-Logik ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator<Key extends keyof any>(order: Order, orderBy: Key): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy)
        : (a, b) => -descendingComparator(a, b, orderBy);
}

// --- Konstanten & Initialer Zustand ---
const initialFormState = {
    name: '',
    source_identifier: '',
    url_pattern: '',
    content_container_selector: '',
    title_selector: '',
    date_selector: '',
    description_selector: '',
    link_selector: '',
    date_format: '',
    category_default: '',
    is_active: true,
    region: '',
    schedule: null as string | null,
    scrape_after_date: '', // Hinzugefügt
};

const commonDateFormats = [
    { value: 'yyyy-MM-dd', label: '2025-06-29 (ISO 8601)' },
    { value: 'dd.MM.yyyy', label: '29.06.2025 (Deutsch, Punkt)' },
    { value: 'dd-MM-yyyy', label: '29-06-2025 (Deutsch, Bindestrich)' },
    { value: 'd. MMMM yyyy', label: '29. Juni 2025 (mit Monatsname)'},
    { value: 'MM/dd/yyyy', label: '06/29/2025 (Amerikanisch)' },
    { value: 'MMMM d, yyyy', label: 'June 29, 2025 (Englisch, mit Komma)'},
    { value: 'EEE, d MMM yyyy', label: 'So, 29 Jun 2025 (RSS-Feed-Format)'}
];

const europeanCountries = ["EU", "Albanien", "Andorra", "Belgien", "Bosnien und Herzegowina", "Bulgarien", "Dänemark", "Deutschland", "Estland", "Finnland", "Frankreich", "Griechenland", "Irland", "Island", "Italien", "Kosovo", "Kroatien", "Lettland", "Liechtenstein", "Litauen", "Luxemburg", "Malta", "Moldau", "Monaco", "Montenegro", "Niederlande", "Nordmazedonien", "Norwegen", "Österreich", "Polen", "Portugal", "Rumänien", "San Marino", "Schweden", "Schweiz", "Serbien", "Slowakei", "Slowenien", "Spanien", "Tschechien", "Ukraine", "Ungarn", "Vatikanstadt", "Vereinigtes Königreich", "Weißrussland", "Zypern"];

const AdminScrapingRulesPage: React.FC = () => {
    const location = useLocation();
    const [rules, setRules] = useState<ScrapingRule[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRule, setEditingRule] = useState<Partial<ScrapingRule> | null>(null);
    const [searchTerm, setSearchTerm] = useState(location.state?.prefillSearch || '');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof ScrapingRule>('name');
    
    const [formState, setFormState] = useState(initialFormState);
    
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<{ log_level: string, message: string, created_at: string }[]>([]);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    
    const [suggesting, setSuggesting] = useState(false);
    const [suggestionAlert, setSuggestionAlert] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });

    const [testDateString, setTestDateString] = useState('');
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const fetchInitialData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [rulesRes, categoriesRes] = await Promise.all([
                apiClient.get('/api/admin/scraping-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories', { headers: { 'x-auth-token': token } })
            ]);
            setRules(rulesRes.data);
            setCategories(categoriesRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

    useEffect(() => {
        if (!currentJobId || !logModalOpen || (jobStatus !== 'running' && jobStatus !== 'pending')) return;
        const interval = setInterval(async () => {
            try {
                const token = localStorage.getItem('jwt_token');
                const res = await apiClient.get(`/api/admin/scraping-rules/logs/${currentJobId}`, { headers: { 'x-auth-token': token } });
                setJobLogs(res.data.logs);
                setJobStatus(res.data.status);
            } catch (e) {
                console.error("Fehler beim Log-Polling:", e);
                setJobStatus('failed');
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [currentJobId, logModalOpen, jobStatus]);
    
    const handleFormChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
        const target = event.target as HTMLInputElement;
        const name = target.name;
        const value = target.type === 'checkbox' ? target.checked : target.value;
        setFormState(prevState => ({ ...prevState, [name]: value }));
    };
    
    const handleOpenAddDialog = () => {
        setEditingRule(null);
        setFormState(initialFormState);
        setOpenDialog(true);
        setSuggestionAlert(null);
        setTestDateString('');
        setTestResult(null);
    };

    const handleOpenEditDialog = (rule: ScrapingRule) => {
        setEditingRule(rule);
        setFormState({
            name: rule.name ?? '',
            source_identifier: rule.source_identifier ?? '',
            url_pattern: rule.url_pattern ?? '',
            content_container_selector: rule.content_container_selector ?? '',
            title_selector: rule.title_selector ?? '',
            date_selector: rule.date_selector ?? '',
            description_selector: rule.description_selector ?? '',
            link_selector: rule.link_selector ?? '',
            date_format: rule.date_format ?? '',
            category_default: rule.category_default ?? '',
            is_active: rule.is_active,
            region: rule.region ?? '',
            schedule: rule.schedule ?? null,
            scrape_after_date: rule.scrape_after_date ? rule.scrape_after_date.split('T')[0] : '', // Hinzugefügt
        });
        setOpenDialog(true);
        setSuggestionAlert(null);
        setTestDateString('');
        setTestResult(null);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingRule(null);
        setError(null);
        setSuggestionAlert(null);
        setTestDateString('');
        setTestResult(null);
    };

    const handleSubmit = async () => {
        setError(null);
        const token = localStorage.getItem('jwt_token');
        try {
            // Stelle sicher, dass ein leerer String als null gesendet wird
            const ruleData = { 
                ...formState,
                scrape_after_date: formState.scrape_after_date || null
            };
            const method = editingRule?.id ? 'put' : 'post';
            const url = editingRule?.id ? `/api/admin/scraping-rules/${editingRule.id}` : '/api/admin/scraping-rules';
            
            const response = await apiClient[method](url, ruleData, { headers: { 'x-auth-token': token } });
            const savedRule = response.data;

            await apiClient.put(`/api/admin/scraping-rules/${savedRule.id}/schedule`, { schedule: savedRule.schedule }, { headers: { 'x-auth-token': token } });
            
            setSnackbar({ open: true, message: 'Regel erfolgreich gespeichert und geplant.' });
            handleCloseDialog();
            fetchInitialData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diese Regel löschen möchten?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/scraping-rules/${id}`, { headers: { 'x-auth-token': token } });
            fetchInitialData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };
    
    const handleTriggerScrape = async (ruleId: string, sourceIdentifier: string) => {
        setJobLogs([{ log_level: 'INFO', message: `Starte Scraping-Job für "${sourceIdentifier}"...`, created_at: new Date().toISOString() }]);
        setJobStatus('pending');
        setCurrentJobId(null);
        setLogModalOpen(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.post(`/api/admin/scraping-rules/${ruleId}/trigger-scrape`, {}, { headers: { 'x-auth-token': token } });
            setCurrentJobId(res.data.jobId);
            setJobStatus('running');
        } catch (err: any) {
            const errorMessage = err.response?.data?.message || 'Fehler beim Auslösen des Jobs.';
            setJobLogs(prev => [...prev, { log_level: 'ERROR', message: errorMessage, created_at: new Date().toISOString() }]);
            setJobStatus('failed');
        }
    };

    const handleCloseLogModal = () => {
        setLogModalOpen(false);
        setCurrentJobId(null);
        setJobLogs([]);
        setJobStatus(null);
        fetchInitialData();
    };

    const handleSortRequest = (property: keyof ScrapingRule) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };
    
    const handleSuggestSelectors = async () => {
        if (!formState.url_pattern) {
            setError('Bitte geben Sie zuerst eine URL ein.');
            return;
        }
        setSuggesting(true);
        setError(null);
        setSuggestionAlert(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post(
                '/api/admin/scraping-rules/suggest',
                { url: formState.url_pattern },
                { headers: { 'x-auth-token': token } }
            );
            
            const data = response.data;

            if (data && data.format && data.rules) {
                if (data.format === 'html') {
                    if (typeof data.rules === 'object' && data.rules !== null) {
                        setFormState(prevState => ({
                            ...prevState,
                            content_container_selector: data.rules.content_container_selector || '',
                            title_selector: data.rules.title_selector || '',
                            date_selector: data.rules.date_selector || '',
                            description_selector: data.rules.description_selector || '',
                            link_selector: data.rules.link_selector || '',
                            date_format: data.rules.date_format || prevState.date_format,
                        }));
                         setSuggestionAlert('Selektoren wurden erfolgreich analysiert und eingefügt!');
                    } else {
                         setError('Die KI hat ein ungültiges Regel-Format für HTML zurückgegeben.');
                    }
                } else if (data.format === 'rss' || data.format === 'atom' || data.format === 'xml' || data.format === 'unknown') {
                    setSuggestionAlert(data.rules.message || 'RSS/Atom/XML-Feed erkannt. Keine Selektoren notwendig.');
                } else {
                    setError(`Unbekanntes Format "${data.format}" von der KI empfangen.`);
                }
            } else {
                setError('Die KI hat eine ungültige oder leere Antwortstruktur zurückgegeben.');
            }

        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Abrufen der Vorschläge.');
        } finally {
            setSuggesting(false);
        }
    };

    const handleFindDateFormat = async () => {
        setTestResult(null);
        if (!testDateString) return;

        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post(
                '/api/admin/scraping-rules/infer-date-format',
                { dateString: testDateString },
                { headers: { 'x-auth-token': token } }
            );
            
            setFormState(prev => ({ ...prev, date_format: response.data.format }));

            setTestResult({
                success: true,
                message: `Format gefunden und eingefügt: ${response.data.format}`
            });
        } catch (err: any) {
            setTestResult({
                success: false,
                message: err.response?.data?.message || 'Format konnte nicht bestimmt werden.'
            });
        }
    };

    const sortedAndFilteredRules = useMemo(() => {
        let filtered = [...rules];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = rules.filter(rule =>
                (rule.name?.toLowerCase() || '').includes(lowercasedFilter) ||
                rule.source_identifier.toLowerCase().includes(lowercasedFilter) ||
                (rule.region?.toLowerCase() || '').includes(lowercasedFilter) ||
                (rule.url_pattern?.toLowerCase() || '').includes(lowercasedFilter)
            );
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [rules, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    {/* ===== ÄNDERUNG 1: ANZAHL HINZUGEFÜGT ===== */}
                    <Typography variant="h4" component="h1">Scraping-Regeln Verwaltung ({sortedAndFilteredRules.length})</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                        {/* ===== ÄNDERUNG 2: LINK ZU CRONJOBS HINZUGEFÜGT ===== */}
                        <Button
                            variant="outlined"
                            component={RouterLink}
                            to="/admin/cronjobs"
                            state={{ tab: 2 }} // 2 ist der Index für "Content Scraping"
                            startIcon={<ScheduleIcon />}
                        >
                            Cronjobs
                        </Button>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Regel hinzufügen</Button>
                    </Box>
                </Box>
                {loading && rules.length === 0 ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> : (
                    <Paper>
                        <TableContainer sx={{ maxHeight: '70vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sortDirection={orderBy === 'name' ? order : false}><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Name</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'source_identifier' ? order : false}><TableSortLabel active={orderBy === 'source_identifier'} direction={order} onClick={() => handleSortRequest('source_identifier')}>Source ID</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'region' ? order : false}><TableSortLabel active={orderBy === 'region'} direction={order} onClick={() => handleSortRequest('region')}>Region</TableSortLabel></TableCell>
                                        <TableCell>URL</TableCell>
                                        <TableCell sortDirection={orderBy === 'category_default' ? order : false}><TableSortLabel active={orderBy === 'category_default'} direction={order} onClick={() => handleSortRequest('category_default')}>Kategorie</TableSortLabel></TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'current_entry_count' ? order : false}><TableSortLabel active={orderBy === 'current_entry_count'} direction={order} onClick={() => handleSortRequest('current_entry_count')}>Einträge</TableSortLabel></TableCell>
                                        <TableCell align="center">Im Cronjob aktiv</TableCell>
                                        <TableCell sortDirection={orderBy === 'last_scraped_at' ? order : false}><TableSortLabel active={orderBy === 'last_scraped_at'} direction={order} onClick={() => handleSortRequest('last_scraped_at')}>Zuletzt gescrapt</TableSortLabel></TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredRules.map((rule) => (
                                        <TableRow key={rule.id} hover>
                                            <TableCell>{rule.name || '-'}</TableCell>
                                            <TableCell>{rule.source_identifier}</TableCell>
                                            <TableCell>{rule.region || '-'}</TableCell>
                                            <TableCell sx={{ wordBreak: 'break-all', maxWidth: 200 }}>
                                                <MuiLink href={rule.url_pattern || '#'} target="_blank" rel="noopener noreferrer" underline="hover">
                                                    {rule.url_pattern ? rule.url_pattern.substring(0, 30) + '...' : '-'}
                                                </MuiLink>
                                            </TableCell>
                                            <TableCell><Chip label={rule.category_default || '-'} size="small" /></TableCell>
                                            <TableCell align="center">
                                                <MuiLink component={RouterLink} to={`/admin/scraped-content?source_identifier=${rule.source_identifier}`} underline="hover">
                                                    {rule.current_entry_count}
                                                </MuiLink>
                                            </TableCell>
                                            <TableCell align="center">
                                                {rule.schedule ? (
                                                    <Button
                                                        component={RouterLink}
                                                        to="/admin/cronjobs"
                                                        state={{ tab: 2, prefillSearch: rule.name || rule.source_identifier }}
                                                        size="small"
                                                        variant="outlined"
                                                    >
                                                        Anzeigen
                                                    </Button>
                                                ) : (
                                                    'Nein'
                                                )}
                                            </TableCell>
                                            <TableCell>{rule.last_scraped_at ? new Date(rule.last_scraped_at).toLocaleString('de-AT') : '-'}</TableCell>
                                            <TableCell>
                                                <IconButton size="small" color="primary" onClick={() => handleOpenEditDialog(rule)}><EditIcon /></IconButton>
                                                <IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}><DeleteIcon /></IconButton>
                                                <MuiTooltip title="Scraping jetzt starten"><IconButton size="small" color="secondary" onClick={() => handleTriggerScrape(rule.id, rule.source_identifier)}><PlayArrowIcon /></IconButton></MuiTooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
                
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingRule?.id ? 'Scraping-Regel bearbeiten' : 'Neue Scraping-Regel hinzufügen'}</DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12}>
                                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                                {suggestionAlert && <Alert severity="info" sx={{ mb: 2 }}>{suggestionAlert}</Alert>}
                            </Grid>

                            <Grid item xs={12} sm={8}>
                                <TextField name="name" label="Name der Regel" fullWidth value={formState.name} onChange={handleFormChange} margin="dense" />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField name="source_identifier" label="Source Identifier" fullWidth value={formState.source_identifier} onChange={handleFormChange} margin="dense" required disabled={!!editingRule} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField 
                                    name="url_pattern" 
                                    label="URL der Übersichtsseite oder des Feeds" 
                                    fullWidth value={formState.url_pattern} 
                                    onChange={handleFormChange} 
                                    margin="dense"
                                    required
                                    helperText="URL der Seite, die eine Liste von Artikeln enthält."
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <Button 
                                                    onClick={handleSuggestSelectors} 
                                                    disabled={suggesting || !formState.url_pattern}
                                                    startIcon={suggesting ? <CircularProgress size={20} /> : <TipsAndUpdatesIcon />}
                                                    sx={{ mr: -1 }}
                                                >
                                                    {suggesting ? 'Analysiere...' : 'Vorschlagen'}
                                                </Button>
                                            </InputAdornment>
                                        )
                                    }}
                                />
                            </Grid>
                            
                            <Grid item xs={12}><Typography variant="subtitle2" sx={{ mt: 1 }}>HTML-Selektoren</Typography></Grid>
                            <Grid item xs={12}><TextField name="content_container_selector" label="Container Selektor (einzelner Artikel)" fullWidth value={formState.content_container_selector} onChange={handleFormChange} margin="dense" /></Grid>
                            <Grid item xs={12} sm={6}><TextField name="title_selector" label="Titel Selektor (relativ zum Container)" fullWidth value={formState.title_selector} onChange={handleFormChange} margin="dense" /></Grid>
                            <Grid item xs={12} sm={6}><TextField name="link_selector" label="Link Selektor (relativ zum Container)" fullWidth value={formState.link_selector} onChange={handleFormChange} margin="dense" /></Grid>
                            <Grid item xs={12} sm={6}><TextField name="date_selector" label="Datum Selektor (relativ zum Container)" fullWidth value={formState.date_selector} onChange={handleFormChange} margin="dense" /></Grid>
                            <Grid item xs={12} sm={6}><TextField name="description_selector" label="Beschreibung Selektor (relativ zum Container)" fullWidth value={formState.description_selector} onChange={handleFormChange} margin="dense" /></Grid>

                            <Grid item xs={12}><Typography variant="subtitle2" sx={{ mt: 1 }}>Einstellungen</Typography></Grid>
                            
                            <Grid item xs={12}>
                                <Autocomplete
                                    freeSolo
                                    options={commonDateFormats.map(option => option.value)}
                                    getOptionLabel={(option) => {
                                        const found = commonDateFormats.find(o => o.value === option);
                                        return found ? `${found.label} (${found.value})` : option;
                                    }}
                                    value={formState.date_format || ''}
                                    onInputChange={(event, newValue) => {
                                        setFormState(prev => ({ ...prev, date_format: newValue }));
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Datum Format (optional)"
                                            margin="dense"
                                            helperText="Automatisch erkennen, aus der Liste wählen oder manuell eingeben."
                                        />
                                    )}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1, mb: 1, p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                                    <TextField
                                        label="Beispiel-Datum von Webseite"
                                        size="small"
                                        value={testDateString}
                                        onChange={(e) => {
                                            setTestDateString(e.target.value);
                                            setTestResult(null);
                                        }}
                                        helperText="Datum von der Webseite kopieren und hier einfügen"
                                        sx={{ flexGrow: 1 }}
                                    />
                                    <Button
                                        variant="contained"
                                        onClick={handleFindDateFormat}
                                        disabled={!testDateString}
                                        sx={{ mt: '8px' }}
                                    >
                                        Format finden
                                    </Button>
                                </Box>
                                {testResult && (
                                    <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mb: 1 }}>
                                        {testResult.message}
                                    </Alert>
                                )}
                            </Grid>

                            <Grid item xs={12} sm={6}>
                                <TextField select name="category_default" label="Standard-Kategorie" fullWidth value={formState.category_default} onChange={handleFormChange} margin="dense" required>
                                    <MenuItem value=""><em>Wählen Sie eine Kategorie</em></MenuItem>
                                    {categories.map((cat) => ( <MenuItem key={cat.id} value={cat.name}>{cat.name}</MenuItem>))}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select name="region" label="Region" fullWidth value={formState.region} onChange={handleFormChange} margin="dense">
                                    <MenuItem value=""><em>Keine Region</em></MenuItem>
                                    {europeanCountries.map((country) => ( <MenuItem key={country} value={country}>{country}</MenuItem>))}
                                </TextField>
                            </Grid>

                            {/* === NEUES DATUMSFELD === */}
                            <Grid item xs={12}>
                                <TextField
                                    name="scrape_after_date"
                                    label="Inhalte nur nach diesem Datum scrapen (optional)"
                                    type="date"
                                    fullWidth
                                    value={formState.scrape_after_date || ''}
                                    onChange={handleFormChange}
                                    InputLabelProps={{ shrink: true }}
                                    helperText="Wenn gesetzt, werden nur Artikel importiert, die nach diesem Datum veröffentlicht wurden. Ideal für den ersten Import."
                                    margin="dense"
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <FormControlLabel control={<Switch name="is_active" checked={formState.is_active} onChange={handleFormChange} />} label="Regel für Scraping aktiv" />
                            </Grid>

                            <Grid item xs={12}>
                                <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    <Typography variant="subtitle1" gutterBottom>Automatisierung (Cronjob)</Typography>
                                    <AdminScheduleSelector
                                        value={formState.schedule || null}
                                        onChange={(cronString) => setFormState(prev => ({ ...prev, schedule: cronString }))}
                                    />
                                </Box>
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Abbrechen</Button>
                        <Button onClick={handleSubmit} disabled={loading}>{editingRule ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>

                <Dialog open={logModalOpen} onClose={handleCloseLogModal} fullWidth maxWidth="md">
                    <DialogTitle>Scraping-Fortschritt</DialogTitle>
                    <DialogContent>
                        {(jobStatus === 'running' || jobStatus === 'pending') && <LinearProgress sx={{ mb: 2 }} />}
                        <Box component="pre" sx={{ maxHeight: 400, overflowY: 'auto', bgcolor: '#f5f5f5', p: 2, borderRadius: 1, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                            {jobLogs.map((log, index) => (
                                <Typography key={index} component="div" variant="body2" sx={{ color: log.log_level === 'ERROR' ? 'red' : 'inherit' }}>
                                    <span style={{ color: 'gray' }}>[{new Date(log.created_at).toLocaleTimeString('de-AT')}]</span>
                                    <span style={{ fontWeight: 'bold', margin: '0 8px' }}>[{log.log_level}]</span>
                                    {log.message}
                                </Typography>
                            ))}
                        </Box>
                        {jobStatus === 'completed' && <Alert severity="success" sx={{mt: 2}}>Job erfolgreich abgeschlossen.</Alert>}
                        {jobStatus === 'failed' && <Alert severity="error" sx={{mt: 2}}>Job mit Fehlern abgebrochen.</Alert>}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseLogModal}>Schließen</Button>
                    </DialogActions>
                </Dialog>
                <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
            </Container>
        </DashboardLayout>
    );
};

export default AdminScrapingRulesPage;