// src/components/AdminEmailTab.tsx
import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Button, IconButton, Tooltip, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, Switch
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

    const fetchJobs = async () => {
        // Annahme: /api/admin/cronjobs/emails existiert und liefert die Daten
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get('/api/admin/cronjobs/emails', { headers: { 'x-auth-token': token } });
            setJobs(res.data);
        } catch (err) { console.error(err); }
    };
    
    useEffect(() => { fetchJobs(); }, []);

    const handleOpenDialog = (job: Partial<EmailJob> | null = null) => {
        setEditingJob(job || { name: '', recipient_group: '', schedule: null, is_active: true });
        setOpenDialog(true);
    };
    
    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingJob(null);
    };

    const handleSave = async () => {
        if (!editingJob) return;
        // Logik zum Speichern oder Erstellen des E-Mail-Jobs
        console.log("Speichere E-Mail-Job:", editingJob);
        // ... await apiClient.post(...) oder apiClient.put(...)
        handleCloseDialog();
        fetchJobs();
    };

    return (
        <>
            <Paper>
                 <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="h6">Geplante E-Mail-Versände</Typography>
                    <Button startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neuer E-Mail-Job</Button>
                </Box>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Job-Name</TableCell>
                                <TableCell>Empfängergruppe</TableCell>
                                <TableCell>Zeitplan</TableCell>
                                <TableCell>Aktiv</TableCell>
                                <TableCell>Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {jobs.map(job => (
                                <TableRow key={job.id}>
                                    <TableCell>{job.name}</TableCell>
                                    <TableCell>{job.recipient_group}</TableCell>
                                    <TableCell>{formatCron(job.schedule)}</TableCell>
                                    <TableCell><Switch checked={job.is_active} /></TableCell>
                                    <TableCell>
                                        <Tooltip title="Job bearbeiten"><IconButton onClick={() => handleOpenDialog(job)}><EditIcon /></IconButton></Tooltip>
                                        <Tooltip title="Jetzt senden"><IconButton><PlayArrowIcon /></IconButton></Tooltip>
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
                </DialogContent>
                 <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AdminEmailTab;