// frontend/src/components/AdminEmailTab.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Box, Paper, Typography, Button, IconButton, Tooltip, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, Switch, FormControlLabel, Snackbar,
    Alert, TableSortLabel, InputAdornment, CircularProgress
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

interface EmailJob {
    id: string;
    name: string;
    recipient_group: string;
    schedule: string | null;
    is_active: boolean;
    last_run_at: string | null;
    next_run_at: string | null;
}

type Order = 'asc' | 'desc';
type JobKey = keyof EmailJob;

// Hilfsfunktionen für die Sortierung und Formatierung
const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Nie';
    return new Date(timestamp).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
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

const headCells: { id: JobKey; label: string; }[] = [
    { id: 'name', label: 'Job-Name' },
    { id: 'recipient_group', label: 'Empfängergruppe' },
    { id: 'schedule', label: 'Zeitplan' },
    { id: 'next_run_at', label: 'Nächste Ausführung' },
    { id: 'last_run_at', label: 'Letzte Ausführung' },
    { id: 'is_active', label: 'Aktiv' },
];

const AdminEmailTab: React.FC = () => {
    const [jobs, setJobs] = useState<EmailJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingJob, setEditingJob] = useState<Partial<EmailJob> | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<JobKey>('name');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = 'cookie-session';
            const res = await apiClient.get('/api/admin/cronjobs/emails', { headers: { 'x-auth-token': token } });
            setJobs(res.data);
        } catch (err) {
            console.error("Could not fetch email jobs:", err);
            setError("E-Mail-Jobs konnten nicht geladen werden.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchJobs(); }, [fetchJobs]);

    const handleOpenDialog = (job: EmailJob | null = null) => {
        // Erzeugt ein leeres Formular für einen neuen Job
        setEditingJob(job ? { ...job } : { name: '', recipient_group: '', schedule: '0 8 * * *', is_active: true });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingJob(null);
    };

    const handleSave = async () => {
        if (!editingJob) return;
        try {
            const token = 'cookie-session';
            const headers = { 'x-auth-token': token };

            if (editingJob.id) {
                await apiClient.put(`/api/admin/cronjobs/emails/${editingJob.id}`, editingJob, { headers });
                setSnackbar({ open: true, message: 'Job erfolgreich aktualisiert!', severity: 'success' });
            } else {
                await apiClient.post('/api/admin/cronjobs/emails', editingJob, { headers });
                setSnackbar({ open: true, message: 'Neuer Job erfolgreich erstellt!', severity: 'success' });
            }
            handleCloseDialog();
            fetchJobs();
        } catch (err) {
            console.error("Failed to save email job:", err);
            setSnackbar({ open: true, message: 'Fehler beim Speichern des Jobs.', severity: 'error' });
        }
    };

    const handleTrigger = async (id: string) => {
        if (window.confirm('Möchten Sie diesen Job jetzt manuell ausführen?')) {
            try {
                const token = 'cookie-session';
                await apiClient.post(`/api/admin/cronjobs/emails/${id}/trigger`, {}, { headers: { 'x-auth-token': token } });
                setSnackbar({ open: true, message: 'Job wurde zur Ausführung in die Warteschlange gestellt.', severity: 'success' });
            } catch (err) {
                console.error("Failed to trigger job:", err);
                setSnackbar({ open: true, message: 'Job konnte nicht gestartet werden.', severity: 'error' });
            }
        }
    };

    const handleSortRequest = (property: JobKey) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredJobs = useMemo(() => {
        let filtered = jobs.filter(job =>
            (job.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (job.recipient_group.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [jobs, searchTerm, order, orderBy]);

    return (
        <>
            <Paper>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Geplante E-Mail-Versände ({jobs.length})</Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                         <TextField variant="outlined" size="small" placeholder="Jobs durchsuchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neuer E-Mail-Job</Button>
                    </Box>
                </Box>
                {loading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    {headCells.map(headCell => (
                                        <TableCell key={headCell.id} sortDirection={orderBy === headCell.id ? order : false}>
                                            <TableSortLabel active={orderBy === headCell.id} direction={orderBy === headCell.id ? order : 'asc'} onClick={() => handleSortRequest(headCell.id as JobKey)}>
                                                {headCell.label}
                                            </TableSortLabel>
                                        </TableCell>
                                    ))}
                                    <TableCell align="right">Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedAndFilteredJobs.map(job => (
                                    <TableRow key={job.id} hover>
                                        <TableCell>{job.name}</TableCell>
                                        <TableCell>{job.recipient_group}</TableCell>
                                        <TableCell>{job.schedule || "Nicht geplant"}</TableCell>
                                        <TableCell>{formatTimestamp(job.next_run_at)}</TableCell>
                                        <TableCell>{formatTimestamp(job.last_run_at)}</TableCell>
                                        <TableCell><Switch checked={job.is_active} disabled /></TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Job bearbeiten"><IconButton onClick={() => handleOpenDialog(job)}><EditIcon /></IconButton></Tooltip>
                                            <Tooltip title="Jetzt senden"><IconButton onClick={() => handleTrigger(job.id)}><PlayArrowIcon /></IconButton></Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>{editingJob?.id ? 'E-Mail-Job bearbeiten' : 'Neuen E-Mail-Job erstellen'}</DialogTitle>
                <DialogContent>
                    <TextField autoFocus margin="dense" label="Name des Jobs" fullWidth value={editingJob?.name || ''} onChange={(e) => setEditingJob(prev => prev ? { ...prev, name: e.target.value } : null)} />
                    <TextField margin="dense" label="Empfängergruppe" fullWidth value={editingJob?.recipient_group || ''} onChange={(e) => setEditingJob(prev => prev ? { ...prev, recipient_group: e.target.value } : null)} />
                    <Box sx={{ mt: 3 }}>
                        <AdminScheduleSelector
                            value={editingJob?.schedule || null}
                            onChange={(cronString) => setEditingJob(prev => prev ? { ...prev, schedule: cronString } : null)}
                        />
                    </Box>
                    <FormControlLabel
                        control={<Switch checked={editingJob?.is_active ?? true} onChange={(e) => setEditingJob(prev => prev ? { ...prev, is_active: e.target.checked } : null)} />}
                        label="Job ist aktiv" sx={{ mt: 2, display: 'block' }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
                <Alert severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
            </Snackbar>
        </>
    );
};

export default AdminEmailTab;