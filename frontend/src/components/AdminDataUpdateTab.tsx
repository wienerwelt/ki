import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, IconButton, Tooltip, Switch,
    Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button, Snackbar, FormControlLabel
} from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

interface DataUpdateJob {
    id: string;
    name: string;
    description: string | null;
    schedule: string | null; // KORREKTUR 1: 'null' als Typ erlauben
    is_active: boolean;
    last_run_at: string | null;
    next_run_at: string | null;
}

const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Nie';
    return new Date(timestamp).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
};

const AdminDataUpdateTab: React.FC = () => {
    const [jobs, setJobs] = useState<DataUpdateJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [openDialog, setOpenDialog] = useState(false);
    const [editingJob, setEditingJob] = useState<Partial<DataUpdateJob> | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    const fetchJobs = useCallback(async () => {
        setIsLoading(true);
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

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);
    
    const handleOpenDialog = (job: DataUpdateJob) => {
        setEditingJob({ ...job });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingJob(null);
    };
    
    const handleSave = async () => {
        if (!editingJob || !editingJob.id) return;
        try {
            const token = localStorage.getItem('jwt_token');
            // 'job_name' wird im Backend aus dem 'name' Feld gelesen, also senden wir 'name'.
            await apiClient.put(`/api/admin/cronjobs/data-updates/${editingJob.id}`, editingJob, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Job erfolgreich aktualisiert!', severity: 'success' });
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

    if (isLoading) return <CircularProgress />;
    if (error) return <Alert severity="error">{error}</Alert>;

    return (
        <>
            <Paper>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6">Datenaktualisierungs-Jobs</Typography>
                </Box>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Job Name</TableCell>
                                <TableCell>Beschreibung</TableCell>
                                <TableCell>Zeitplan (Cron)</TableCell>
                                <TableCell>Nächste Ausführung</TableCell>
                                <TableCell>Letzte Ausführung</TableCell>
                                <TableCell>Aktiv</TableCell>
                                <TableCell align="right">Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {jobs.map((job) => (
                                <TableRow key={job.id}>
                                    <TableCell sx={{ fontWeight: 'bold' }}>{job.name}</TableCell>
                                    <TableCell>{job.description}</TableCell>
                                    <TableCell><code>{job.schedule || 'Nicht geplant'}</code></TableCell>
                                    <TableCell>{formatTimestamp(job.next_run_at)}</TableCell>
                                    <TableCell>{formatTimestamp(job.last_run_at)}</TableCell>
                                    {/* KORREKTUR 2: Unnötigen onChange-Handler vom deaktivierten Switch entfernt */}
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
            </Paper>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>Daten-Job bearbeiten</DialogTitle>
                <DialogContent>
                    <TextField margin="dense" label="Name des Jobs" fullWidth value={editingJob?.name || ''} onChange={(e) => setEditingJob(prev => prev ? {...prev, name: e.target.value} : null)} sx={{ mt: 1 }} />
                    <TextField margin="dense" label="Beschreibung" fullWidth multiline rows={2} value={editingJob?.description || ''} onChange={(e) => setEditingJob(prev => prev ? {...prev, description: e.target.value} : null)} />
                    <Box sx={{ mt: 2 }}>
                        <AdminScheduleSelector
                            value={editingJob?.schedule || null}
                            onChange={(cronString) => setEditingJob(prev => prev ? { ...prev, schedule: cronString } : null)}
                        />
                    </Box>
                    <FormControlLabel
                        control={<Switch checked={editingJob?.is_active ?? true} onChange={(e) => setEditingJob(prev => prev ? { ...prev, is_active: e.target.checked } : null)} />}
                        label="Job ist aktiv" sx={{mt: 2, display: 'block'}}
                    />
                </DialogContent>
                 <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(prev => ({...prev, open: false}))}>
                <Alert severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
            </Snackbar>
        </>
    );
};

export default AdminDataUpdateTab;