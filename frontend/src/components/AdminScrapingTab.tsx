// src/components/AdminScrapingTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Dialog, DialogTitle,
    DialogContent, Button, DialogActions, Link as MuiLink, Snackbar
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import PageviewIcon from '@mui/icons-material/Pageview';
import SettingsIcon from '@mui/icons-material/Settings';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

interface ScheduledScrapingRule {
    id: string;
    name: string | null;
    source_identifier: string;
    region: string | null;
    schedule: string | null;
    last_scraped_at: string | null;
    next_run_at: string | null;
}

const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Nie';
    return new Date(timestamp).toLocaleString('de-AT');
};

const AdminScrapingTab: React.FC = () => {
    const [rules, setRules] = useState<ScheduledScrapingRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRule, setEditingRule] = useState<ScheduledScrapingRule | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            // NEU: Dieser Endpunkt liefert nur Regeln mit einem Zeitplan
            const res = await apiClient.get('/api/admin/cronjobs/scraping-rules', { headers: { 'x-auth-token': token } });
            setRules(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der geplanten Scraping-Jobs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const handleOpenEditDialog = (rule: ScheduledScrapingRule) => {
        setEditingRule(rule);
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingRule(null);
    };

    const handleSaveSchedule = async () => {
        if (!editingRule) return;
        try {
            const token = localStorage.getItem('jwt_token');
            // NEU: Ruft den dedizierten Endpunkt zum Aktualisieren des Zeitplans auf
            await apiClient.put(`/api/admin/scraping-rules/${editingRule.id}/schedule`, { schedule: editingRule.schedule }, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Zeitplan erfolgreich gespeichert.' });
            fetchRules(); // Daten neu laden, um Änderungen (z.B. nächste Ausführung) zu sehen
        } catch (err) {
            setSnackbar({ open: true, message: 'Fehler beim Speichern des Zeitplans.' });
        }
        handleCloseDialog();
    };
    
    const handleTrigger = async (id: string) => {
        setSnackbar({ open: true, message: 'Job wird manuell gestartet...' });
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post(`/api/admin/scraping-rules/${id}/trigger-scrape`, {}, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Job wurde erfolgreich zur Warteschlange hinzugefügt.' });
        } catch (err) {
             setSnackbar({ open: true, message: 'Fehler beim Starten des Jobs.' });
        }
    };

    return (
        <>
            <Paper>
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6">Geplante Scraping-Jobs ({rules.length})</Typography>
                </Box>
                {loading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name der Regel</TableCell>
                                    <TableCell>Region</TableCell>
                                    <TableCell>Zeitplan</TableCell>
                                    <TableCell>Nächste Ausführung</TableCell>
                                    <TableCell>Letzte Ausführung</TableCell>
                                    <TableCell>Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rules.map(rule => (
                                    <TableRow key={rule.id} hover>
                                        <TableCell>{rule.name || rule.source_identifier}</TableCell>
                                        <TableCell>{rule.region || '-'}</TableCell>
                                        <TableCell>{rule.schedule}</TableCell>
                                        <TableCell>{formatTimestamp(rule.next_run_at)}</TableCell>
                                        <TableCell>{formatTimestamp(rule.last_scraped_at)}</TableCell>
                                        <TableCell>
                                            <Tooltip title="Zeitplan bearbeiten"><IconButton onClick={() => handleOpenEditDialog(rule)}><EditIcon /></IconButton></Tooltip>
                                            <Tooltip title="Jetzt ausführen"><IconButton onClick={() => handleTrigger(rule.id)}><PlayArrowIcon /></IconButton></Tooltip>
                                            <Tooltip title="Gescrapte Inhalte anzeigen">
                                                <IconButton component={RouterLink} to={`/admin/scraped-content?source_identifier=${rule.source_identifier}`}><PageviewIcon /></IconButton>
                                            </Tooltip>
                                            <Tooltip title="Komplette Regel bearbeiten">
                                                <IconButton component={RouterLink} to={`/admin/scraping-rules`} state={{ prefillSearch: rule.name || rule.source_identifier }}><SettingsIcon /></IconButton>
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
                <DialogTitle>Zeitplan bearbeiten für "{editingRule?.name}"</DialogTitle>
                <DialogContent>
                    <AdminScheduleSelector
                        value={editingRule?.schedule || null}
                        onChange={(cronString) => setEditingRule(prev => prev ? { ...prev, schedule: cronString } : null)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSaveSchedule} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
        </>
    );
};

export default AdminScrapingTab;
