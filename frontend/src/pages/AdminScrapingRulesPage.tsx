import React, { useState, useEffect, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Switch, FormControlLabel, Chip, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, LinearProgress,
    SelectChangeEvent,
    Link as MuiLink
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
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
}

interface Category {
    id: string;
    name: string;
}

// --- Sortier-Logik ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    if (b[orderBy] < a[orderBy]) return -1;
    if (b[orderBy] > a[orderBy]) return 1;
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
    date_format: '',
    category_default: '',
    is_active: true,
    region: '',
};

const commonDateFormats = [
    { value: 'YYYY-MM-DD', label: '2025-06-29 (ISO 8601)' },
    { value: 'DD.MM.YYYY', label: '29.06.2025 (Deutsch)' },
    { value: 'MM/DD/YYYY', label: '06/29/2025 (Amerikanisch)' },
    { value: 'D. MMMM YYYY', label: '29. Juni 2025 (mit Monatsname)'},
    { value: 'ddd, D MMM YYYY', label: 'So, 29 Jun 2025 (RSS-Feed-Format)'}
];

const europeanCountries = ["EU", "Albanien", "Andorra", "Belgien", "Bosnien und Herzegowina", "Bulgarien", "Dänemark", "Deutschland", "Estland", "Finnland", "Frankreich", "Griechenland", "Irland", "Island", "Italien", "Kosovo", "Kroatien", "Lettland", "Liechtenstein", "Litauen", "Luxemburg", "Malta", "Moldau", "Monaco", "Montenegro", "Niederlande", "Nordmazedonien", "Norwegen", "Österreich", "Polen", "Portugal", "Rumänien", "San Marino", "Schweden", "Schweiz", "Serbien", "Slowakei", "Slowenien", "Spanien", "Tschechien", "Ukraine", "Ungarn", "Vatikanstadt", "Vereinigtes Königreich", "Weißrussland", "Zypern"];

const AdminScrapingRulesPage: React.FC = () => {
    const [rules, setRules] = useState<ScrapingRule[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRule, setEditingRule] = useState<ScrapingRule | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof ScrapingRule>('name');
    
    const [formState, setFormState] = useState(initialFormState);
    
    const [logModalOpen, setLogModalOpen] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<{ log_level: string, message: string, created_at: string }[]>([]);
    const [jobStatus, setJobStatus] = useState<string | null>(null);

    const fetchInitialData = async () => {
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
    };

    useEffect(() => { fetchInitialData(); }, []);

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
    };

    const handleOpenEditDialog = (rule: ScrapingRule) => {
        setEditingRule(rule);
        setFormState({
            name: rule.name || '',
            source_identifier: rule.source_identifier,
            url_pattern: rule.url_pattern || '',
            content_container_selector: rule.content_container_selector || '',
            title_selector: rule.title_selector || '',
            date_selector: rule.date_selector || '',
            description_selector: rule.description_selector || '',
            date_format: rule.date_format || '',
            category_default: rule.category_default || '',
            is_active: rule.is_active,
            region: rule.region || '',
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingRule(null);
        setError(null);
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('jwt_token');
        const ruleData = {
            name: formState.name || null,
            source_identifier: formState.source_identifier,
            url_pattern: formState.url_pattern || null,
            content_container_selector: formState.content_container_selector || null,
            title_selector: formState.title_selector || null,
            date_selector: formState.date_selector || null,
            description_selector: formState.description_selector || null,
            date_format: formState.date_format || null,
            category_default: formState.category_default || null,
            is_active: formState.is_active,
            region: formState.region || null,
        };
        try {
            if (editingRule) {
                await apiClient.put(`/api/admin/scraping-rules/${editingRule.id}`, ruleData, { headers: { 'x-auth-token': token } });
            } else {
                await apiClient.post('/api/admin/scraping-rules', ruleData, { headers: { 'x-auth-token': token } });
            }
            handleCloseDialog();
            fetchInitialData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        } finally {
            setLoading(false);
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
                    <Typography variant="h4" component="h1">Scraping-Regeln Verwaltung</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
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
                                        <TableCell align="center" sortDirection={orderBy === 'is_active' ? order : false}><TableSortLabel active={orderBy === 'is_active'} direction={order} onClick={() => handleSortRequest('is_active')}>Im Cronjob aktiv</TableSortLabel></TableCell>
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
                                            <TableCell align="center">{rule.is_active ? 'Ja' : 'Nein'}</TableCell>
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
                    <DialogTitle>{editingRule ? 'Scraping-Regel bearbeiten' : 'Neue Scraping-Regel hinzufügen'}</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <TextField name="name" label="Name der Regel" fullWidth value={formState.name} onChange={handleFormChange} margin="dense" />
                        <TextField name="source_identifier" label="Source Identifier" fullWidth value={formState.source_identifier} onChange={handleFormChange} margin="dense" required disabled={!!editingRule} />
                        <TextField select name="region" label="Region" fullWidth value={formState.region} onChange={handleFormChange} margin="dense">
                            <MenuItem value=""><em>Keine Region</em></MenuItem>
                            {europeanCountries.map((country) => (
                                <MenuItem key={country} value={country}>{country}</MenuItem>
                            ))}
                        </TextField>
                        <TextField 
                            name="url_pattern" 
                            label="URL" 
                            fullWidth value={formState.url_pattern} 
                            onChange={handleFormChange} 
                            margin="dense"
                            required
                            helperText="Die exakte URL der Seite oder des RSS-Feeds, z.B. https://www.beispiel.de/news" 
                        />
                        <TextField name="content_container_selector" label="Container Selektor (für HTML)" fullWidth value={formState.content_container_selector} onChange={handleFormChange} margin="dense" />
                        <TextField name="title_selector" label="Titel Selektor (für HTML)" fullWidth value={formState.title_selector} onChange={handleFormChange} margin="dense" />
                        <TextField name="date_selector" label="Datum Selektor (für HTML)" fullWidth value={formState.date_selector} onChange={handleFormChange} margin="dense" />
                        <TextField name="description_selector" label="Beschreibung Selektor (für HTML)" fullWidth value={formState.description_selector} onChange={handleFormChange} margin="dense" />
                        
                        <TextField select name="date_format" label="Datum Format (für HTML)" fullWidth value={formState.date_format} onChange={handleFormChange} margin="dense" helperText="Gibt an, wie das Datum auf der Quell-Seite formatiert ist.">
                            <MenuItem value=""><em>Automatische Erkennung</em></MenuItem>
                            {commonDateFormats.map((format) => ( <MenuItem key={format.value} value={format.value}>{format.label}</MenuItem>))}
                        </TextField>

                        <TextField select name="category_default" label="Standard-Kategorie" fullWidth value={formState.category_default} onChange={handleFormChange} margin="dense" required>
                            <MenuItem value=""><em>Wählen Sie eine Kategorie</em></MenuItem>
                            {categories.map((cat) => ( <MenuItem key={cat.id} value={cat.name}>{cat.name}</MenuItem>))}
                        </TextField>
                        
                        <FormControlLabel control={<Switch name="is_active" checked={formState.is_active} onChange={handleFormChange} />} label="Im Cronjob ausführen" />
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
            </Container>
        </DashboardLayout>
    );
};

export default AdminScrapingRulesPage;