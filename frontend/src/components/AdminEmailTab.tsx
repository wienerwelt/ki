// frontend/src/components/AdminEmailTab.tsx
import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Button, IconButton, Tooltip, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, Switch, FormControlLabel, Snackbar, Alert
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

interface EmailJob {
    id: string;
    name: string;
    recipient_group: string;
    schedule: string | null;
    is_active: boolean;
}

const formatCron = (cron: string | null): string => {
    if (!cron) return "Nicht geplant";
    return cron;
};

const AdminEmailTab: React.FC = () => {
    const [jobs, setJobs] = useState<EmailJob[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingJob, setEditingJob] = useState<Partial<EmailJob> | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    const fetchJobs = async () => {
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get('/api/admin/cronjobs/emails', { headers: { 'x-auth-token': token } });
            setJobs(res.data);
        } catch (err) { console.error("Could not fetch email jobs:", err); }
    };
    
    useEffect(() => { fetchJobs(); }, []);

    const handleOpenDialog = (job: EmailJob | null = null) => {
        setEditingJob(job ? {...job} : { name: 'Daily Admin Report', recipient_group: 'Admins', schedule: '0 7 * * *', is_active: true });
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
                const token = localStorage.getItem('jwt_token');
                // KORREKTUR: Deine Routenstruktur wird hier verwendet
                await apiClient.post(`/api/admin/cronjobs/emails/${id}/trigger`, {}, { headers: { 'x-auth-token': token } });
                setSnackbar({ open: true, message: 'Job wurde zur Ausführung in die Warteschlange gestellt.', severity: 'success' });
            } catch (err) {
                console.error("Failed to trigger job:", err);
                setSnackbar({ open: true, message: 'Job konnte nicht gestartet werden.', severity: 'error' });
            }
        }
    };

    return (
        <>
            <Paper>
                 <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Geplante E-Mail-Versände</Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neuer E-Mail-Job</Button>
                </Box>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Job-Name</TableCell>
                                <TableCell>Empfängergruppe</TableCell>
                                <TableCell>Zeitplan (Cron)</TableCell>
                                <TableCell>Aktiv</TableCell>
                                <TableCell align="right">Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {jobs.map(job => (
                                <TableRow key={job.id}>
                                    <TableCell>{job.name}</TableCell>
                                    <TableCell>{job.recipient_group}</TableCell>
                                    <TableCell>{formatCron(job.schedule)}</TableCell>
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
            </Paper>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>{editingJob?.id ? 'E-Mail-Job bearbeiten' : 'Neuen E-Mail-Job erstellen'}</DialogTitle>
                <DialogContent>
                    <TextField autoFocus margin="dense" label="Name des Jobs" fullWidth value={editingJob?.name || ''} onChange={(e) => setEditingJob(prev => prev ? {...prev, name: e.target.value} : null)} />
                    <TextField margin="dense" label="Empfängergruppe" fullWidth value={editingJob?.recipient_group || ''} onChange={(e) => setEditingJob(prev => prev ? {...prev, recipient_group: e.target.value} : null)} />
                    <Box sx={{ mt: 3 }}>
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

export default AdminEmailTab;