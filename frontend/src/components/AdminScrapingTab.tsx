// src/components/AdminScrapingTab.tsx
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, CircularProgress, Alert, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, Button, DialogActions
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import AdminScheduleSelector from './AdminScheduleSelector'; // Import der neuen Komponente
import apiClient from '../apiClient';

interface ScrapingRule {
    id: string;
    name: string | null;
    source_identifier: string;
    region: string | null;
    schedule: string | null;
    current_entry_count: number;
}

const formatCron = (cron: string | null): string => {
    if (!cron) return "Nicht geplant";
    // Hier wäre eine Bibliothek wie 'cron-parser' oder eine custom Logik ideal
    return cron;
};

const AdminScrapingTab: React.FC = () => {
    const [rules, setRules] = useState<ScrapingRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRule, setEditingRule] = useState<Partial<ScrapingRule> | null>(null);

    const fetchRules = async () => {
        // Annahme: Es gibt einen Endpunkt, der die Scraping-Regeln mit den benötigten Feldern zurückgibt.
        // Dieser Endpunkt muss im Backend (z.B. in adminCronjobsController.js) erstellt werden.
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get('/api/admin/scraping-rules', { headers: { 'x-auth-token': token } });
            setRules(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Scraping-Regeln.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleOpenEditDialog = (rule: ScrapingRule) => {
        setEditingRule(rule);
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingRule(null);
    };
    
    const handleSave = async () => {
        if (!editingRule) return;
        // Logik zum Speichern der Regel (PUT-Request an /api/admin/scraping-rules/:id)
        // Der Body enthält das `editingRule`-Objekt mit dem neuen `schedule`-String.
        console.log("Speichere Regel:", editingRule);
        // ... await apiClient.put(...)
        handleCloseDialog();
        fetchRules();
    };


    return (
        <>
            <Paper>
                <TableContainer>
                    {/* ... Tabellen-Code ähnlich zu AdminAITab ... */}
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Source ID</TableCell>
                                <TableCell>Region</TableCell>
                                <TableCell>Zeitplan</TableCell>
                                <TableCell>Einträge</TableCell>
                                <TableCell>Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rules.map(rule => (
                                <TableRow key={rule.id}>
                                    <TableCell>{rule.name || '-'}</TableCell>
                                    <TableCell>{rule.source_identifier}</TableCell>
                                    <TableCell>{rule.region || '-'}</TableCell>
                                    <TableCell>{formatCron(rule.schedule)}</TableCell>
                                    <TableCell align="center">{rule.current_entry_count}</TableCell>
                                    <TableCell>
                                        <Tooltip title="Regel bearbeiten"><IconButton onClick={() => handleOpenEditDialog(rule)}><EditIcon /></IconButton></Tooltip>
                                        <Tooltip title="Jetzt ausführen"><IconButton><PlayArrowIcon /></IconButton></Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                <DialogTitle>Zeitplan bearbeiten für "{editingRule?.name}"</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 3 }}>
                        Konfigurieren Sie hier, wann der Scraping-Job für diese Regel automatisch ausgeführt werden soll.
                    </Typography>
                    <AdminScheduleSelector
                        value={editingRule?.schedule || null}
                        onChange={(cronString) => setEditingRule(prev => prev ? { ...prev, schedule: cronString } : null)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AdminScrapingTab;