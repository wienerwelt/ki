// src/components/AdminScrapingTab.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Alert, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, Dialog, DialogTitle,
    DialogContent, Button, DialogActions, Link as MuiLink, Snackbar, Checkbox,
    TableSortLabel, InputAdornment, TextField
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import PageviewIcon from '@mui/icons-material/Pageview';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import AdminScheduleSelector from './AdminScheduleSelector';
import apiClient from '../apiClient';

// --- Interfaces ---
interface ScheduledScrapingRule {
    id: string;
    name: string | null;
    source_identifier: string;
    region: string | null;
    schedule: string | null;
    last_scraped_at: string | null;
    next_run_at: string | null;
}
type Order = 'asc' | 'desc';
type RuleKey = keyof ScheduledScrapingRule;

// --- Helper Functions ---
const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Nie';
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
function getComparator<Key extends RuleKey>(order: Order, orderBy: Key): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}
const headCells: { id: RuleKey; label: string }[] = [
    { id: 'name', label: 'Name der Regel' },
    { id: 'region', label: 'Region' },
    { id: 'schedule', label: 'Zeitplan' },
    { id: 'next_run_at', label: 'Nächste Ausführung' },
    { id: 'last_scraped_at', label: 'Letzte Ausführung' },
];

const AdminScrapingTab: React.FC = () => {
    const [rules, setRules] = useState<ScheduledScrapingRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingRule, setEditingRule] = useState<ScheduledScrapingRule | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<RuleKey>('name');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get('/api/admin/cronjobs/scraping-rules', { headers: { 'x-auth-token': token } });
            setRules(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der geplanten Scraping-Jobs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const handleSaveSchedule = async () => {
        if (!editingRule) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.put(`/api/admin/scraping-rules/${editingRule.id}/schedule`, { schedule: editingRule.schedule }, { headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: 'Zeitplan erfolgreich gespeichert.' });
            fetchRules();
        } catch (err) {
            setSnackbar({ open: true, message: 'Fehler beim Speichern des Zeitplans.' });
        }
        setOpenDialog(false);
    };

    const handleDelete = async () => {
        if (selectedIds.length === 0 || !window.confirm(`Sind Sie sicher, dass Sie ${selectedIds.length} geplante Regel(n) deaktivieren möchten? (Der Zeitplan wird entfernt)`)) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await Promise.all(selectedIds.map(id => 
                apiClient.put(`/api/admin/scraping-rules/${id}/schedule`, { schedule: null }, { headers: { 'x-auth-token': token } })
            ));
            setSnackbar({ open: true, message: `${selectedIds.length} Job(s) deaktiviert.` });
            setSelectedIds([]);
            fetchRules();
        } catch (err) {
            console.error("Error deactivating jobs:", err);
            setSnackbar({ open: true, message: 'Fehler beim Deaktivieren der Jobs.' });
        }
    };
    
    const handleSortRequest = (property: RuleKey) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            setSelectedIds(sortedAndFilteredRules.map((n) => n.id));
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
    
    const sortedAndFilteredRules = useMemo(() => {
        let filtered = rules.filter(rule =>
            (rule.name || rule.source_identifier).toLowerCase().includes(searchTerm.toLowerCase()) ||
            (rule.region || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [rules, searchTerm, order, orderBy]);

    return (
        <>
            <Paper>
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="h6">Geplante Scraping-Jobs ({rules.length})</Typography>
                        {selectedIds.length > 0 && (
                            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>
                                {selectedIds.length} Cronjob(s) deaktivieren
                            </Button>
                        )}
                    </Box>
                    <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}/>
                </Box>
                {loading ? <CircularProgress sx={{ m: 2 }} /> : error ? <Alert severity="error" sx={{ m: 2 }}>{error}</Alert> : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            indeterminate={selectedIds.length > 0 && selectedIds.length < rules.length}
                                            checked={rules.length > 0 && selectedIds.length === rules.length}
                                            onChange={handleSelectAllClick}
                                        />
                                    </TableCell>
                                    {headCells.map(headCell => (
                                        <TableCell key={headCell.id} sortDirection={orderBy === headCell.id ? order : false}>
                                            <TableSortLabel active={orderBy === headCell.id} direction={orderBy === headCell.id ? order : 'asc'} onClick={() => handleSortRequest(headCell.id as RuleKey)}>
                                                {headCell.label}
                                            </TableSortLabel>
                                        </TableCell>
                                    ))}
                                    <TableCell>Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedAndFilteredRules.map(rule => {
                                    const isItemSelected = selectedIds.indexOf(rule.id) !== -1;
                                    return (
                                        <TableRow key={rule.id} hover selected={isItemSelected}>
                                            <TableCell padding="checkbox"><Checkbox checked={isItemSelected} onChange={() => handleSelectClick(rule.id)} /></TableCell>
                                            <TableCell>{rule.name || rule.source_identifier}</TableCell>
                                            <TableCell>{rule.region || '-'}</TableCell>
                                            <TableCell>
                                                <Tooltip title={formatCronToGerman(rule.schedule)}>
                                                    <span>{rule.schedule}</span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>{formatTimestamp(rule.next_run_at)}</TableCell>
                                            <TableCell>{formatTimestamp(rule.last_scraped_at)}</TableCell>
                                            <TableCell>
                                                <Tooltip title="Zeitplan bearbeiten"><IconButton onClick={() => setEditingRule(rule)}><EditIcon /></IconButton></Tooltip>
                                                <Tooltip title="Jetzt ausführen"><IconButton onClick={() => handleTrigger(rule.id)}><PlayArrowIcon /></IconButton></Tooltip>
                                                <Tooltip title="Gescrapte Inhalte anzeigen"><IconButton component={RouterLink} to={`/admin/scraped-content?source_identifier=${rule.source_identifier}`}><PageviewIcon /></IconButton></Tooltip>
                                                <Tooltip title="Komplette Regel bearbeiten"><IconButton component={RouterLink} to={`/admin/scraping-rules`} state={{ prefillSearch: rule.name || rule.source_identifier }}><SettingsIcon /></IconButton></Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={!!editingRule} onClose={() => setEditingRule(null)} fullWidth maxWidth="sm">
                <DialogTitle>Zeitplan bearbeiten für "{editingRule?.name}"</DialogTitle>
                <DialogContent>
                    <AdminScheduleSelector
                        value={editingRule?.schedule || null}
                        onChange={(cronString) => setEditingRule(prev => prev ? { ...prev, schedule: cronString } : null)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingRule(null)}>Abbrechen</Button>
                    <Button onClick={handleSaveSchedule} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
        </>
    );
};
export default AdminScrapingTab;
