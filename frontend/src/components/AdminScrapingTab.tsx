import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Dialog, DialogTitle,
    DialogContent, Button, DialogActions, Snackbar, Checkbox,
    TableSortLabel, InputAdornment, TextField
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import PageviewIcon from '@mui/icons-material/Pageview';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

// --- Interfaces ---
interface UnifiedJob {
    id: string;
    name: string;
    region: string | null;
    schedule: string | null;
    last_run_at: string | null;
    next_run_at: string | null;
    type: 'rule' | 'system';
    source_identifier?: string;
    rule_type?: 'content' | 'funding';
}

type Order = 'asc' | 'desc';
type RuleKey = keyof UnifiedJob;

// --- Helper Functions ---
const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Nie';
    return new Date(timestamp).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
};

function descendingComparator(a: UnifiedJob, b: UnifiedJob, orderBy: RuleKey) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

// KORREKTUR: Die Signatur dieser Funktion wurde angepasst, um den Typfehler zu beheben.
function getComparator(order: Order, orderBy: RuleKey): (a: UnifiedJob, b: UnifiedJob) => number {
    return order === 'desc' 
        ? (a, b) => descendingComparator(a, b, orderBy) 
        : (a, b) => -descendingComparator(a, b, orderBy);
}

const headCells: { id: RuleKey; label: string; }[] = [
    { id: 'name', label: 'Name des Jobs' },
    { id: 'region', label: 'Region' },
    { id: 'schedule', label: 'Zeitplan' },
    { id: 'next_run_at', label: 'Nächste Ausführung' },
    { id: 'last_run_at', label: 'Letzte Ausführung' },
];

const AdminScrapingTab: React.FC = () => {
    const [jobs, setJobs] = useState<UnifiedJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingRule, setEditingRule] = useState<UnifiedJob | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<RuleKey>('name');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const headers = { 'x-auth-token': token };

            const [rulesRes, cronjobsRes] = await Promise.all([
                apiClient.get('/api/admin/cronjobs/scraping-rules', { headers }),
                apiClient.get('/api/admin/cronjobs/scraping/cronjobs', { headers })
            ]);

            const ruleJobs: UnifiedJob[] = rulesRes.data.map((r: any) => ({
                id: r.id,
                name: r.name || r.source_identifier,
                region: r.region,
                schedule: r.schedule,
                last_run_at: r.last_scraped_at,
                next_run_at: r.next_run_at,
                type: 'rule',
                source_identifier: r.source_identifier,
                rule_type: r.rule_type
            }));

            const systemJobs: UnifiedJob[] = cronjobsRes.data.map((j: any) => ({
                id: j.id,
                name: j.name,
                region: 'Systemweit',
                schedule: j.schedule,
                last_run_at: j.last_run_at,
                next_run_at: j.next_run_at,
                type: 'system'
            }));

            setJobs([...ruleJobs, ...systemJobs]);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Scraping-Jobs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchJobs(); }, [fetchJobs]);

    const handleSaveSchedule = async () => {
        if (!editingRule) return;
        try {
            const token = localStorage.getItem('jwt_token');
            let endpoint = '';
            let payload = { schedule: editingRule.schedule, is_active: true }; // Annahme für is_active

            // NEU: Unterscheiden, welcher Endpunkt aufgerufen wird
            if (editingRule.type === 'rule') {
                endpoint = `/api/admin/scraping-rules/${editingRule.id}/schedule`;
            } else if (editingRule.type === 'system') {
                endpoint = `/api/admin/cronjobs/${editingRule.id}`;
            }

            if (!endpoint) return;

            await apiClient.put(endpoint, payload, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Zeitplan erfolgreich gespeichert.' });
            fetchJobs();
        } catch (err) {
            setSnackbar({ open: true, message: 'Fehler beim Speichern des Zeitplans.' });
        }
        setEditingRule(null);
    };

    const handleDelete = async () => {
        const ruleIdsToDelete = selectedIds.filter(id => jobs.find(j => j.id === id)?.type === 'rule');
        if (ruleIdsToDelete.length === 0 || !window.confirm(`Sind Sie sicher, dass Sie ${ruleIdsToDelete.length} geplante Regel(n) deaktivieren möchten? (Der Zeitplan wird entfernt)`)) return;
        
        try {
            const token = localStorage.getItem('jwt_token');
            await Promise.all(ruleIdsToDelete.map(id => 
                apiClient.put(`/api/admin/scraping-rules/${id}/schedule`, { schedule: null }, { headers: { 'x-auth-token': token } })
            ));
            setSnackbar({ open: true, message: `${ruleIdsToDelete.length} Job(s) deaktiviert.` });
            setSelectedIds([]);
            fetchJobs();
        } catch (err) {
            console.error("Error deactivating jobs:", err);
            setSnackbar({ open: true, message: 'Fehler beim Deaktivieren der Jobs.' });
        }
    };
    
    const handleSortRequest = (property: RuleKey) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            setSelectedIds(sortedAndFilteredJobs.map((n) => n.id));
            return;
        }
        setSelectedIds([]);
    };

    const handleSelectClick = (id: string) => {
        const selectedIndex = selectedIds.indexOf(id);
        let newSelected: string[] = [];
        if (selectedIndex === -1) newSelected = newSelected.concat(selectedIds, id);
        else if (selectedIndex === 0) newSelected = newSelected.concat(selectedIds.slice(1));
        else if (selectedIndex === selectedIds.length - 1) newSelected = newSelected.concat(selectedIds.slice(0, -1));
        else if (selectedIndex > 0) newSelected = newSelected.concat(selectedIds.slice(0, selectedIndex), selectedIds.slice(selectedIndex + 1));
        setSelectedIds(newSelected);
    };

    const handleTrigger = async (job: UnifiedJob) => {
        let endpoint = '';
        if (job.type === 'rule') {
            endpoint = `/api/admin/scraping-rules/${job.id}/trigger-scrape`;
        } else if (job.type === 'system') {
            endpoint = '/api/admin/cronjobs/scraping/trigger-account-intelligence';
        }

        if (!endpoint) return;

        setSnackbar({ open: true, message: `Job '${job.name}' wird gestartet...` });
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(endpoint, {}, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Job wurde erfolgreich zur Warteschlange hinzugefügt.' });
        } catch (err) {
             setSnackbar({ open: true, message: 'Fehler beim Starten des Jobs.' });
        }
    };
    
    const sortedAndFilteredJobs = useMemo(() => {
        let filtered = jobs.filter(job =>
            (job.name || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [jobs, searchTerm, order, orderBy]);

    return (
        <>
            <Paper>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="h6">Geplante Scraping-Jobs ({jobs.length})</Typography>
                        {selectedIds.length > 0 && (
                            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>
                                {selectedIds.length} Cronjob(s) deaktivieren
                            </Button>
                        )}
                    </Box>
                    <TextField variant="outlined" size="small" placeholder="Quelle suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                </Box>
                {loading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            indeterminate={selectedIds.length > 0 && selectedIds.length < jobs.length}
                                            checked={jobs.length > 0 && selectedIds.length === jobs.length}
                                            onChange={handleSelectAllClick}
                                        />
                                    </TableCell>
                                    {headCells.map(headCell => (
                                        <TableCell key={headCell.id} sortDirection={orderBy === headCell.id ? order : false}>
                                            <TableSortLabel active={orderBy === headCell.id} direction={orderBy === headCell.id ? order : 'asc'} onClick={() => handleSortRequest(headCell.id as RuleKey)}>
                                                {headCell.label}
                                            </TableSortLabel>
                                        </TableCell>
                                    ))}
                                    <TableCell>Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedAndFilteredJobs.map(job => {
                                    const isItemSelected = selectedIds.indexOf(job.id) !== -1;
                                    const viewContentLink = job.rule_type === 'funding'
                                        ? '/admin/funding'
                                        : `/admin/scraped-content?source_identifier=${job.source_identifier}`;
                                    
                                    const linkState = job.rule_type === 'funding'
                                        ? { prefillSource: job.id }
                                        : {};                                    
                                    
                                    return (
                                        <TableRow key={job.id} hover selected={isItemSelected}>
                                            <TableCell padding="checkbox"><Checkbox checked={isItemSelected} onChange={() => handleSelectClick(job.id)} /></TableCell>
                                            <TableCell>{job.name}</TableCell>
                                            <TableCell>{job.region || '-'}</TableCell>
                                            <TableCell><code>{job.schedule}</code></TableCell>
                                            <TableCell>{formatTimestamp(job.next_run_at)}</TableCell>
                                            <TableCell>{formatTimestamp(job.last_run_at)}</TableCell>
                                            <TableCell>
                                                <Tooltip title="Jetzt ausführen"><IconButton onClick={() => handleTrigger(job)}><PlayArrowIcon /></IconButton></Tooltip>
                                                
                                                {/* KORREKTUR: Bearbeiten-Button für beide Typen verfügbar */}
                                                <Tooltip title="Zeitplan bearbeiten"><IconButton onClick={() => setEditingRule(job)}><EditIcon /></IconButton></Tooltip>

                                                {job.type === 'rule' ? (
                                                    <>
                                                        <Tooltip title="Gefundene Inhalte anzeigen (Regel)">
                                                            <IconButton component={RouterLink} to={viewContentLink} state={linkState}><PageviewIcon /></IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Komplette Regel bearbeiten">
                                                          <IconButton component={RouterLink} to={`/admin/scraping-rules`} state={{ prefillSearch: job.name }}><SettingsIcon /></IconButton>
                                                        </Tooltip>
                                                    </>
                                                ) : (
                                                    <Tooltip title="Gefundene Inhalte anzeigen (System-Job)">
                                                        <IconButton component={RouterLink} to="/admin/tracked-articles"><PageviewIcon /></IconButton>
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={!!editingRule} onClose={() => setEditingRule(null)} fullWidth maxWidth="sm">
                <DialogTitle>Zeitplan bearbeiten für "{editingRule?.name}"</DialogTitle>
                <DialogContent>
                    <AdminScheduleSelector
                        value={editingRule?.schedule || null}
                        onChange={(cronString) => setEditingRule(prev => prev ? { ...prev, schedule: cronString } : null)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingRule(null)}>Abbrechen</Button>
                    <Button onClick={handleSaveSchedule} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
        </>
    );
};

export default AdminScrapingTab;