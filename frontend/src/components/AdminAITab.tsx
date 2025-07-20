// src/components/AdminAITab.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Chip, Link as MuiLink, TextField, InputAdornment, Snackbar, Checkbox, Button, TableSortLabel, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Autocomplete, Switch
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

// Interfaces
interface ScheduledAIJob {
    id: string; // subscription ID
    user_id: string;
    user_email: string;
    business_partner_name: string | null;
    prompt_rule_id: string;
    prompt_rule_name: string;
    region: string;
    keywords: string[];
    schedule: string | null;
    is_active: boolean;
    created_at: string;
    next_run_at: string | null;
}

interface JobHistory {
    id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
}

interface Region {
    id: string;
    name: string;
}

type Order = 'asc' | 'desc';
type AIJobKey = keyof ScheduledAIJob;

// Helper to format timestamps consistently
const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('de-AT', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

// Helper to translate cron patterns to German
const formatCronToGerman = (cron: string | null): string => {
    if (!cron) return "Nicht geplant";
    try {
        const parts = cron.split(' ');
        if (parts.length !== 5) return "Ungültiges Format";
        const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
        const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const weekDays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

        if (dayOfMonth !== '*' && dayOfWeek === '*') return `Jeden ${dayOfMonth}. des Monats um ${time} Uhr`;
        if (dayOfWeek !== '*' && dayOfMonth === '*') return `Jeden ${weekDays[parseInt(dayOfWeek, 10)]} um ${time} Uhr`;
        if (dayOfMonth === '*' && dayOfWeek === '*') return `Täglich um ${time} Uhr`;
        return cron;
    } catch {
        return "Ungültiges Format";
    }
};


// Sorting helper
function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator<Key extends AIJobKey>(order: Order, orderBy: Key): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}

const headCells: { id: AIJobKey; label: string; sortable: boolean }[] = [
    { id: 'business_partner_name', label: 'Business Partner', sortable: true },
    { id: 'user_email', label: 'Benutzer', sortable: true },
    { id: 'prompt_rule_name', label: 'Prompt-Regel', sortable: true },
    { id: 'keywords', label: 'Hot Topics / Keyword', sortable: false },
    { id: 'region', label: 'Region', sortable: true },
    { id: 'created_at', label: 'Erstellt am', sortable: true },
    { id: 'schedule', label: 'Zeitplan', sortable: false },
    { id: 'next_run_at', label: 'Nächste Ausführung', sortable: false },
    { id: 'is_active', label: 'Aktiv', sortable: false },
    { id: 'id', label: 'Aktionen', sortable: false },
];


const AdminAITab: React.FC = () => {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<ScheduledAIJob[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<AIJobKey>('created_at');
    const [editingJob, setEditingJob] = useState<ScheduledAIJob | null>(null);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [history, setHistory] = useState<JobHistory[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const [jobsRes, regionsRes] = await Promise.all([
                apiClient.get('/api/admin/cronjobs/ai-subscriptions', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/regions', { headers: { 'x-auth-token': token } })
            ]);
            setJobs(jobsRes.data);
            setRegions(regionsRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveChanges = async () => {
        if (!editingJob) return;
        try {
            const token = localStorage.getItem('jwt_token');
            const { id, region, keywords, schedule } = editingJob;
            await apiClient.put(`/api/admin/cronjobs/ai-subscriptions/${id}`, { region, keywords, schedule }, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Abonnement erfolgreich aktualisiert.' });
            fetchData();
        } catch (err: any) {
            console.error("Error saving changes:", err);
            setSnackbar({ open: true, message: 'Fehler beim Speichern der Änderungen.' });
        }
        setEditingJob(null);
    };

    const handleToggleActive = async (job: ScheduledAIJob) => {
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.put(`/api/admin/cronjobs/ai-subscriptions/${job.id}`, { is_active: !job.is_active }, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Status erfolgreich geändert.' });
            fetchData();
        } catch (err: any) {
            console.error("Error toggling active status:", err);
            setSnackbar({ open: true, message: 'Fehler beim Ändern des Status.' });
        }
    };

    const handleShowHistory = async (subscriptionId: string) => {
        setHistoryModalOpen(true);
        setHistoryLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get(`/api/admin/cronjobs/ai-subscriptions/${subscriptionId}/history`, { headers: { 'x-auth-token': token } });
            setHistory(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleDelete = async () => {
        if (selectedIds.length === 0 || !window.confirm(`Sind Sie sicher, dass Sie ${selectedIds.length} Abonnement(s) endgültig löschen möchten?`)) return;
        
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/cronjobs/ai-subscriptions`, { 
                headers: { 'x-auth-token': token },
                data: { ids: selectedIds }
            });
            setJobs(prevJobs => prevJobs.filter(job => !selectedIds.includes(job.id)));
            setSnackbar({ open: true, message: `${selectedIds.length} Abonnement(s) gelöscht.` });
            setSelectedIds([]);
        } catch (err: any) {
            console.error("Error deleting jobs:", err);
            setSnackbar({ open: true, message: 'Fehler beim Löschen der Abonnements.' });
        }
    };
    
    const handleTrigger = async (jobId: string) => {
        setSnackbar({ open: true, message: 'Starte Job...' });
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/admin/cronjobs/ai-subscriptions/${jobId}/trigger`, {}, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Job wurde manuell zur Warteschlange hinzugefügt.' });
        } catch (err: any) {
            const errorMessage = (err as any).response?.data?.message || 'Unbekannter Fehler';
            setSnackbar({ open: true, message: `Fehler beim Starten: ${errorMessage}` });
            console.error("Error triggering job:", err);
        }
    };

    const handleSortRequest = (property: AIJobKey) => {
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

    const sortedAndFilteredJobs = useMemo(() => {
        let filtered = jobs.filter(job =>
            job.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.prompt_rule_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (job.business_partner_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.keywords.some(kw => kw.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [jobs, searchTerm, order, orderBy]);

    const isSelected = (id: string) => selectedIds.indexOf(id) !== -1;

    return (
        <>
            <Paper>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="h6">Geplante KI-Jobs ({jobs.length})</Typography>
                        {selectedIds.length > 0 && (
                            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>
                                {selectedIds.length} löschen
                            </Button>
                        )}
                    </Box>
                    <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                </Box>
                {loading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <TableContainer>
                        <Table stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            indeterminate={selectedIds.length > 0 && selectedIds.length < sortedAndFilteredJobs.length}
                                            checked={sortedAndFilteredJobs.length > 0 && selectedIds.length === sortedAndFilteredJobs.length}
                                            onChange={handleSelectAllClick}
                                        />
                                    </TableCell>
                                    {headCells.map((headCell) => (
                                        <TableCell key={headCell.id} sortDirection={orderBy === headCell.id ? order : false}>
                                            {headCell.sortable ? (
                                                <TableSortLabel active={orderBy === headCell.id} direction={orderBy === headCell.id ? order : 'asc'} onClick={() => handleSortRequest(headCell.id)}>
                                                    {headCell.label}
                                                </TableSortLabel>
                                            ) : headCell.label}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedAndFilteredJobs.map(job => {
                                    const isItemSelected = isSelected(job.id);
                                    return (
                                        <TableRow key={job.id} hover role="checkbox" tabIndex={-1} selected={isItemSelected}>
                                            <TableCell padding="checkbox">
                                                <Checkbox checked={isItemSelected} onChange={() => handleSelectClick(job.id)} />
                                            </TableCell>
                                            <TableCell>{job.business_partner_name || '-'}</TableCell>
                                            <TableCell>
                                                <MuiLink component={RouterLink} to={`/admin/users`} state={{ prefillSearch: job.user_email }}>
                                                    {job.user_email}
                                                </MuiLink>
                                            </TableCell>
                                            <TableCell><MuiLink component={RouterLink} to={`/admin/ai-prompt-rules?ruleId=${job.prompt_rule_id}`} underline="hover">{job.prompt_rule_name}</MuiLink></TableCell>
                                            <TableCell><Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 200 }}>{job.keywords.map(kw => <Chip key={kw} label={kw} size="small" />)}</Box></TableCell>
                                            <TableCell>{job.region}</TableCell>
                                            <TableCell>{formatTimestamp(job.created_at)}</TableCell>
                                            <TableCell>
                                                <Tooltip title={formatCronToGerman(job.schedule)}>
                                                    <span>{job.schedule || 'Nicht geplant'}</span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>{formatTimestamp(job.next_run_at)}</TableCell>
                                            <TableCell><Switch checked={job.is_active} onChange={() => handleToggleActive(job)} /></TableCell>
                                            <TableCell>
                                                <Tooltip title="Abonnement bearbeiten"><IconButton onClick={() => setEditingJob(job)}><EditIcon /></IconButton></Tooltip>
                                                <Tooltip title="Job-Verlauf anzeigen"><IconButton onClick={() => handleShowHistory(job.id)}><HistoryIcon /></IconButton></Tooltip>
                                                <Tooltip title="Jetzt ausführen"><IconButton onClick={() => handleTrigger(job.id)}><PlayArrowIcon /></IconButton></Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={!!editingJob} onClose={() => setEditingJob(null)} fullWidth maxWidth="sm">
                <DialogTitle>Abonnement bearbeiten</DialogTitle>
                <DialogContent>
                    <Typography variant="subtitle1" gutterBottom>{editingJob?.user_email}</Typography>
                    <Autocomplete
                        multiple freeSolo options={[]} value={editingJob?.keywords || []}
                        onChange={(event, newValue) => setEditingJob(prev => prev ? { ...prev, keywords: newValue } : null)}
                        renderTags={(value, getTagProps) => value.map((option, index) => (<Chip variant="outlined" label={option} {...getTagProps({ index })} />))}
                        renderInput={(params) => (<TextField {...params} variant="outlined" label="Hot Topic / Keyword" margin="normal" />)}
                    />
                    <TextField select fullWidth margin="normal" label="Region" value={editingJob?.region || ''} onChange={(e) => setEditingJob(prev => prev ? { ...prev, region: e.target.value } : null)}>
                        {regions.map((option) => (<MenuItem key={option.id} value={option.name}>{option.name}</MenuItem>))}
                    </TextField>
                    <AdminScheduleSelector
                        value={editingJob?.schedule || null}
                        onChange={(cronString) => {
                            if (editingJob && editingJob.schedule !== cronString) {
                                setEditingJob(prev => prev ? { ...prev, schedule: cronString } : null);
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingJob(null)}>Abbrechen</Button>
                    <Button onClick={handleSaveChanges} variant="contained">Änderungen speichern</Button>
                </DialogActions>
            </Dialog>
            
            <Dialog open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Job-Verlauf</DialogTitle>
                <DialogContent>
                    {historyLoading ? <CircularProgress /> : (
                        <Table>
                            <TableHead><TableRow><TableCell>Status</TableCell><TableCell>Gestartet am</TableCell><TableCell>Beendet am</TableCell></TableRow></TableHead>
                            <TableBody>
                                {history.map(run => (
                                    <TableRow key={run.id}>
                                        <TableCell><Chip label={run.status} color={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'error' : 'default'} /></TableCell>
                                        <TableCell>{formatTimestamp(run.started_at)}</TableCell>
                                        <TableCell>{formatTimestamp(run.completed_at)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setHistoryModalOpen(false)}>Schließen</Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
        </>
    );
};

export default AdminAITab;
