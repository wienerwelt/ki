// frontend/src/components/AdminDataUpdateTab.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, IconButton, Tooltip, Switch,
    Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button, Snackbar, FormControlLabel,
    TableSortLabel, InputAdornment
} from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

interface DataUpdateJob {
    id: string;
    name: string;
    schedule: string | null;
    is_active: boolean;
    last_run_at: string | null;
    next_run_at: string | null;
    // Die 'recipient_group' wird für die Logik benötigt, aber nicht in der Tabelle angezeigt
    recipient_group: string;
}

type Order = 'asc' | 'desc';
type JobKey = keyof DataUpdateJob;

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
    { id: 'schedule', label: 'Zeitplan' },
    { id: 'next_run_at', label: 'Nächste Ausführung' },
    { id: 'last_run_at', label: 'Letzte Ausführung' },
    { id: 'is_active', label: 'Aktiv' },
];

const AdminDataUpdateTab: React.FC = () => {
    const [jobs, setJobs] = useState<DataUpdateJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingJob, setEditingJob] = useState<Partial<DataUpdateJob> | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<JobKey>('name');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchJobs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/admin/cronjobs/data-updates', { headers: { 'x-auth-token': token } });
            setJobs(response.data);
        } catch (err) {
            setError('Fehler beim Laden der Daten-Update-Jobs.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchJobs(); }, [fetchJobs]);

const handleOpenDialog = (job: DataUpdateJob | null = null) => {
    setEditingJob(job ? { ...job } : {
        name: '',
        schedule: '0 2 * * *',
        is_active: true,
        recipient_group: 'data-update' 
    });
    setOpenDialog(true);
};

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingJob(null);
    };

    const handleSave = async () => {
        if (!editingJob) return;
        try {
            const token = localStorage.getItem('jwt_token');
            const headers = { 'x-auth-token': token };
            
            if (editingJob.id) { // Update existing job
                await apiClient.put(`/api/admin/cronjobs/data-updates/${editingJob.id}`, editingJob, { headers });
                setSnackbar({ open: true, message: 'Job erfolgreich aktualisiert!', severity: 'success' });
            } else { // Create new job
                await apiClient.post('/api/admin/cronjobs/data-updates', editingJob, { headers });
                setSnackbar({ open: true, message: 'Neuer Job erfolgreich erstellt!', severity: 'success' });
            }
            handleCloseDialog();
            fetchJobs();
        } catch (err) {
            setSnackbar({ open: true, message: 'Fehler beim Speichern des Jobs.', severity: 'error' });
        }
    };

    const handleTriggerJob = async (jobName: string) => {
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post('/api/admin/cronjobs/data-updates/trigger', { job_name: jobName }, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: `Job '${jobName}' wurde zur Ausführung in die Warteschlange gestellt.`, severity: 'success' });
        } catch (err) {
            setSnackbar({ open: true, message: `Fehler beim Starten des Jobs '${jobName}'.`, severity: 'error' });
        }
    };

    const handleSortRequest = (property: JobKey) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };
    
    const sortedAndFilteredJobs = useMemo(() => {
        let filtered = jobs.filter(job =>
            job.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [jobs, searchTerm, order, orderBy]);


    return (
        <>
            <Paper>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Datenaktualisierungs-Jobs ({jobs.length})</Typography>
                     <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <TextField variant="outlined" size="small" placeholder="Jobs durchsuchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neuer Job</Button>
                    </Box>
                </Box>
                 {isLoading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
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
                                {sortedAndFilteredJobs.map((job) => (
                                    <TableRow key={job.id} hover>
                                        <TableCell sx={{ fontWeight: 'bold' }}>{job.name}</TableCell>
                                        <TableCell><code>{job.schedule || 'Nicht geplant'}</code></TableCell>
                                        <TableCell>{formatTimestamp(job.next_run_at)}</TableCell>
                                        <TableCell>{formatTimestamp(job.last_run_at)}</TableCell>
                                        <TableCell><Switch checked={job.is_active} disabled /></TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Jetzt ausführen">
                                                <IconButton onClick={() => handleTriggerJob(job.name)}>
                                                    <PlayCircleOutlineIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Bearbeiten">
                                                <IconButton onClick={() => handleOpenDialog(job)}>
                                                    <EditIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>{editingJob?.id ? 'Daten-Job bearbeiten' : 'Neuen Daten-Job erstellen'}</DialogTitle>
                <DialogContent>
                    <TextField autoFocus margin="dense" label="Name des Jobs" fullWidth value={editingJob?.name || ''} onChange={(e) => setEditingJob(prev => prev ? { ...prev, name: e.target.value } : null)} sx={{ mt: 1 }} />
                    <TextField disabled margin="dense" label="Empfängergruppe" fullWidth value={editingJob?.recipient_group || 'data-update'} />
                    
                    <Box sx={{ mt: 2 }}>
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

export default AdminDataUpdateTab;