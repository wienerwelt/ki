// src/components/AdminAISystemTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Autocomplete, Switch
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

// --- Interfaces ---
interface SystemSubscription {
    id: string;
    ai_prompt_rule_id: string;
    prompt_rule_name?: string; // Wird per JOIN geholt
    keywords: string[];
    region: string;
    schedule: string;
    is_active: boolean;
}
interface AIPromptRule { id: string; name: string; }
interface Region { id: string; name: string; }

const AdminAISystemTab: React.FC = () => {
    const [jobs, setJobs] = useState<SystemSubscription[]>([]);
    const [promptRules, setPromptRules] = useState<AIPromptRule[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingJob, setEditingJob] = useState<Partial<SystemSubscription> | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const [jobsRes, rulesRes, regionsRes] = await Promise.all([
                apiClient.get('/api/admin/cronjobs/system-subscriptions', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/ai-prompt-rules', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/data/regions', { headers: { 'x-auth-token': token } })
            ]);
            setJobs(jobsRes.data);
            setPromptRules(rulesRes.data);
            setRegions(regionsRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der System-Jobs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleOpenDialog = (job: Partial<SystemSubscription> | null = null) => {
        setEditingJob(job || {
            ai_prompt_rule_id: '',
            keywords: [],
            region: '',
            schedule: '0 9 * * 1', // Standard: Jeden Montag um 9 Uhr
            is_active: true,
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingJob(null);
    };

    const handleSave = async () => {
        if (!editingJob) return;
        const isNew = !editingJob.id;
        const url = isNew ? '/api/admin/cronjobs/system-subscriptions' : `/api/admin/cronjobs/system-subscriptions/${editingJob.id}`;
        const method = isNew ? 'post' : 'put';

        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient[method](url, editingJob, { headers: { 'x-auth-token': token } });
            fetchData();
        } catch (err) {
            alert('Fehler beim Speichern.');
            console.error(err);
        }
        handleCloseDialog();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Diesen System-Job wirklich löschen?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/cronjobs/system-subscriptions/${id}`, { headers: { 'x-auth-token': token } });
            fetchData();
        } catch (err) {
            alert('Fehler beim Löschen.');
        }
    };

    return (
        <>
            <Paper>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Redaktionelle System-Jobs ({jobs.length})</Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                        Neuer System-Job
                    </Button>
                </Box>
                {loading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>KI-Regel</TableCell>
                                    <TableCell>Keywords</TableCell>
                                    <TableCell>Region</TableCell>
                                    <TableCell>Zeitplan</TableCell>
                                    <TableCell>Aktiv</TableCell>
                                    <TableCell>Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {jobs.map(job => (
                                    <TableRow key={job.id} hover>
                                        <TableCell>{job.prompt_rule_name || job.ai_prompt_rule_id}</TableCell>
                                        <TableCell><Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{job.keywords.map(kw => <Chip key={kw} label={kw} size="small" />)}</Box></TableCell>
                                        <TableCell>{job.region}</TableCell>
                                        <TableCell>{job.schedule}</TableCell>
                                        <TableCell><Switch checked={job.is_active} disabled /></TableCell>
                                        <TableCell>
                                            <Tooltip title="Bearbeiten"><IconButton onClick={() => handleOpenDialog(job)}><EditIcon /></IconButton></Tooltip>
                                            <Tooltip title="Löschen"><IconButton onClick={() => handleDelete(job.id)}><DeleteIcon color="error" /></IconButton></Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>{editingJob?.id ? 'System-Job bearbeiten' : 'Neuen System-Job erstellen'}</DialogTitle>
                <DialogContent>
                    <TextField select fullWidth margin="normal" label="KI-Regel" value={editingJob?.ai_prompt_rule_id || ''} onChange={(e) => setEditingJob(prev => prev ? { ...prev, ai_prompt_rule_id: e.target.value } : null)}>
                        {promptRules.map(rule => <MenuItem key={rule.id} value={rule.id}>{rule.name}</MenuItem>)}
                    </TextField>
                    <Autocomplete
                        multiple freeSolo options={[]} value={editingJob?.keywords || []}
                        onChange={(e, newValue) => setEditingJob(prev => prev ? { ...prev, keywords: newValue } : null)}
                        renderTags={(val, props) => val.map((opt, i) => <Chip label={opt} {...props({ index: i })} />)}
                        renderInput={(params) => <TextField {...params} label="Keywords" margin="normal" />}
                    />
                    <TextField select fullWidth margin="normal" label="Region" value={editingJob?.region || ''} onChange={(e) => setEditingJob(prev => prev ? { ...prev, region: e.target.value } : null)}>
                        {regions.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}
                    </TextField>
                    <AdminScheduleSelector
                        value={editingJob?.schedule || null}
                        onChange={(cron) => setEditingJob(prev => prev ? { ...prev, schedule: cron } : null)}
                    />
                    <Switch checked={editingJob?.is_active || false} onChange={(e) => setEditingJob(prev => prev ? { ...prev, is_active: e.target.checked } : null)} /> Aktiv
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AdminAISystemTab;
