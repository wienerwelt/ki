// src/components/AdminAISystemTab.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Dialog, DialogTitle,
    DialogContent, Button, DialogActions, Snackbar, Checkbox,
    TableSortLabel, InputAdornment, TextField, Chip
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

// --- Interfaces ---
interface SystemAIJob {
    id: string;
    prompt_rule_name: string;
    keywords: string[];
    region: string | null;
    schedule: string | null;
    next_run_at: string | null;
}
type Order = 'asc' | 'desc';
type JobKey = keyof SystemAIJob;

// --- Helper Functions ---
const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
};
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
    } catch { return "Ungültiges Format"; }
};
function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}
function getComparator<Key extends JobKey>(order: Order, orderBy: Key): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}
const headCells: { id: JobKey; label: string }[] = [
    { id: 'prompt_rule_name', label: 'Name der KI-Regel' },
    { id: 'keywords', label: 'Keywords' },
    { id: 'region', label: 'Region' },
    { id: 'schedule', label: 'Zeitplan' },
    { id: 'next_run_at', label: 'Nächste Ausführung' },
];

const AdminAISystemTab: React.FC = () => {
    const [jobs, setJobs] = useState<SystemAIJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingJob, setEditingJob] = useState<SystemAIJob | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<JobKey>('prompt_rule_name');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const token = 'cookie-session';
            const res = await apiClient.get('/api/admin/cronjobs/system-subscriptions', { headers: { 'x-auth-token': token } });
            setJobs(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der System-Jobs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchJobs(); }, [fetchJobs]);

    const handleSaveSchedule = async () => {
        if (!editingJob) return;
        try {
            const token = 'cookie-session';
            // Annahme: Es gibt einen PUT-Endpunkt zum Aktualisieren des Zeitplans
            await apiClient.put(`/api/admin/ai-prompt-rules/${editingJob.id}`, { schedule: editingJob.schedule }, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Zeitplan erfolgreich gespeichert.' });
            fetchJobs();
        } catch (err) {
            setSnackbar({ open: true, message: 'Fehler beim Speichern des Zeitplans.' });
        }
        setOpenDialog(false);
    };
    
    // Implementiere handleSortRequest, handleSelectAllClick, handleSelectClick, handleDelete, handleTrigger
    // nach dem Vorbild von AdminScrapingTab.tsx
    
    const sortedAndFilteredJobs = useMemo(() => {
        let filtered = jobs.filter(job =>
            (job.prompt_rule_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (job.keywords.join(' ')).toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [jobs, searchTerm, order, orderBy]);

    return (
        <>
            <Paper>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="h6">Redaktionelle KI-Jobs ({jobs.length})</Typography>
                        {/* ... Delete Button ... */}
                    </Box>
                    <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                </Box>
                {loading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox"><Checkbox /></TableCell>
                                    {headCells.map(headCell => (
                                        <TableCell key={headCell.id} sortDirection={orderBy === headCell.id ? order : false}>
                                            <TableSortLabel active={orderBy === headCell.id} direction={orderBy === headCell.id ? order : 'asc'} onClick={() => { /* handleSortRequest(headCell.id) */ }}>
                                                {headCell.label}
                                            </TableSortLabel>
                                        </TableCell>
                                    ))}
                                    <TableCell>Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedAndFilteredJobs.map(job => (
                                    <TableRow key={job.id} hover>
                                        <TableCell padding="checkbox"><Checkbox /></TableCell>
                                        <TableCell>{job.prompt_rule_name}</TableCell>
                                        <TableCell><Box sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 200}}>{job.keywords.map(kw => <Chip key={kw} label={kw} size="small"/>)}</Box></TableCell>
                                        <TableCell>{job.region || '-'}</TableCell>
                                        <TableCell>
                                            <Tooltip title={formatCronToGerman(job.schedule)}>
                                                <span>{job.schedule}</span>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>{formatTimestamp(job.next_run_at)}</TableCell>
                                        <TableCell>
                                            <Tooltip title="Zeitplan bearbeiten"><IconButton onClick={() => setEditingJob(job)}><EditIcon /></IconButton></Tooltip>
                                            <Tooltip title="Jetzt ausführen"><IconButton><PlayArrowIcon /></IconButton></Tooltip>
                                            <Tooltip title="Komplette Regel bearbeiten"><IconButton component={RouterLink} to={`/admin/ai-prompt-rules`} state={{ prefillSearch: job.prompt_rule_name }}><SettingsIcon /></IconButton></Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={!!editingJob} onClose={() => setEditingJob(null)} fullWidth maxWidth="sm">
                <DialogTitle>Zeitplan bearbeiten für "{editingJob?.prompt_rule_name}"</DialogTitle>
                <DialogContent>
                    <AdminScheduleSelector
                        value={editingJob?.schedule || null}
                        onChange={(cronString) => setEditingJob(prev => prev ? { ...prev, schedule: cronString } : null)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingJob(null)}>Abbrechen</Button>
                    <Button onClick={handleSaveSchedule} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
        </>
    );
};
export default AdminAISystemTab;
