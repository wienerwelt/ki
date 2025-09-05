// frontend/src/pages/AdminEventsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Container, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button,
    Alert, CircularProgress, Box, InputAdornment, TableSortLabel, Link as MuiLink, Grid,
    FormControl, InputLabel, Select, MenuItem, useTheme, alpha
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface ScrapedEvent {
    id: string;
    title: string;
    event_date: string | null;
    original_url: string;
    source_identifier: string;
    region: string | null;
    summary: string | null;
}

// NEU: Interface für Regionen
interface Region {
    name: string;
    code: string;
}

type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator<Key extends keyof any>(
    order: Order,
    orderBy: Key,
): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy)
        : (a, b) => -descendingComparator(a, b, orderBy);
}

const AdminEventsPage: React.FC = () => {
    const theme = useTheme();
    const [events, setEvents] = useState<ScrapedEvent[]>([]);
    const [regions, setRegions] = useState<Region[]>([]); // NEU: State für Regionen
    const [editingEvent, setEditingEvent] = useState<Partial<ScrapedEvent> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isCreateMode, setIsCreateMode] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [eventToDelete, setEventToDelete] = useState<ScrapedEvent | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof ScrapedEvent>('event_date');

    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear + 1];
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const headers = { headers: { 'x-auth-token': token } };
            
            // Lade Events und Regionen parallel für bessere Performance
            const [eventsRes, regionsRes] = await Promise.all([
                apiClient.get('/api/admin/scraped-content/events', headers),
                apiClient.get('/api/admin/scraped-content/regions', headers)
            ]);

            if (Array.isArray(eventsRes.data)) {
                setEvents(eventsRes.data);
            } else {
                console.error("Received non-array response for events:", eventsRes.data);
                throw new Error('Events konnten nicht geladen werden, da ein unerwartetes Datenformat empfangen wurde.');
            }

            if (Array.isArray(regionsRes.data)) {
                setRegions(regionsRes.data);
            } else {
                console.error("Received non-array response for regions:", regionsRes.data);
                // Optional: Fehler für Regionen setzen, aber App nicht blockieren
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Daten konnten nicht geladen werden.');
            setEvents([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenDialog = (event?: ScrapedEvent) => {
        if (event) {
            setIsCreateMode(false);
            setEditingEvent({
                ...event,
                event_date: event.event_date ? new Date(event.event_date).toISOString().split('T')[0] : '',
            });
        } else {
            setIsCreateMode(true);
            setEditingEvent({ title: '', event_date: '', region: '', summary: '', original_url: '' });
        }
        setDialogError(null);
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setEditingEvent(null);
    };

    const handleSave = async () => {
        if (!editingEvent) return;
        setDialogError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const dataToSend = {
                ...editingEvent,
                event_date: editingEvent.event_date || null
            };

            if (isCreateMode) {
                await apiClient.post(`/api/admin/scraped-content/events`, dataToSend, { headers: { 'x-auth-token': token } });
            } else {
                await apiClient.put(`/api/admin/scraped-content/events/${editingEvent.id}`, dataToSend, { headers: { 'x-auth-token': token } });
            }
            handleCloseDialog();
            fetchData(); // Neu laden, um Änderungen zu sehen
        } catch (err: any) {
            setDialogError(err.response?.data?.message || 'Ein unbekannter Fehler ist aufgetreten.');
        }
    };

    const handleOpenDeleteConfirm = (event: ScrapedEvent) => {
        setEventToDelete(event);
        setDeleteConfirmOpen(true);
    };

    const handleCloseDeleteConfirm = () => {
        setEventToDelete(null);
        setDeleteConfirmOpen(false);
    };

    const handleDelete = async () => {
        if (!eventToDelete) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/scraped-content/${eventToDelete.id}?dataType=content`, { headers: { 'x-auth-token': token } });
            handleCloseDeleteConfirm();
            fetchData(); // Neu laden
        } catch (err: any) {
            setError(err.response?.data?.message || 'Event konnte nicht gelöscht werden.');
            handleCloseDeleteConfirm();
        }
    };

    const handleSortRequest = (property: keyof ScrapedEvent) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredEvents = useMemo(() => {
        if (!Array.isArray(events)) return [];
        let filtered = events
            .filter(event =>
                event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.source_identifier.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (event.region || '').toLowerCase().includes(searchTerm.toLowerCase())
            )
            .filter(event => {
                if (!event.event_date) return yearFilter === 'all' && monthFilter === 'all';
                const eventDate = new Date(event.event_date);
                const yearMatch = yearFilter === 'all' || eventDate.getFullYear() === parseInt(yearFilter);
                const monthMatch = monthFilter === 'all' || (eventDate.getMonth() + 1) === parseInt(monthFilter);
                return yearMatch && monthMatch;
            });
        return filtered.sort(getComparator(order, orderBy));
    }, [events, searchTerm, order, orderBy, yearFilter, monthFilter]);

    const handleDialogChange = (field: keyof ScrapedEvent, value: any) => {
        setEditingEvent(prev => prev ? { ...prev, [field]: value } : null);
    };

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Events ({sortedAndFilteredEvents.length})</Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                        Neues Event
                    </Button>
                </Box>

                <Paper sx={{ p: 2, mb: 3 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth variant="outlined" size="small" placeholder="Events nach Titel, Quelle, Region suchen..."
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
                            />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Jahr</InputLabel>
                                <Select value={yearFilter} label="Jahr" onChange={(e) => setYearFilter(e.target.value)}>
                                    <MenuItem value="all">Alle Jahre</MenuItem>
                                    {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Monat</InputLabel>
                                <Select value={monthFilter} label="Monat" onChange={(e) => setMonthFilter(e.target.value)}>
                                    <MenuItem value="all">Alle Monate</MenuItem>
                                    {months.map(m => <MenuItem key={m} value={m}>{new Date(2000, m - 1).toLocaleString('de-AT', { month: 'long' })}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </Paper>

                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> :
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ width: '45%' }}><TableSortLabel active={orderBy === 'title'} direction={order} onClick={() => handleSortRequest('title')}>Titel</TableSortLabel></TableCell>
                                        <TableCell><TableSortLabel active={orderBy === 'region'} direction={order} onClick={() => handleSortRequest('region')}>Region</TableSortLabel></TableCell>
                                        <TableCell><TableSortLabel active={orderBy === 'event_date'} direction={order} onClick={() => handleSortRequest('event_date')}>Event-Datum</TableSortLabel></TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredEvents.map(event => (
                                        <TableRow key={event.id} hover sx={{ backgroundColor: !event.event_date ? alpha(theme.palette.warning.main, 0.15) : 'inherit' }}>
                                            <TableCell>{event.title}</TableCell>
                                            <TableCell>{event.region || '-'}</TableCell>
                                            <TableCell>
                                                <Typography color={!event.event_date ? 'error.main' : 'inherit'}>
                                                    {event.event_date ? new Date(event.event_date).toLocaleDateString('de-AT') : '- DATUM FEHLT -'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Zur Originalquelle"><IconButton component={MuiLink} href={event.original_url} target="_blank" disabled={!event.original_url}><OpenInNewIcon /></IconButton></Tooltip>
                                                <Tooltip title="Bearbeiten"><IconButton onClick={() => handleOpenDialog(event)}><EditIcon /></IconButton></Tooltip>
                                                <Tooltip title="Löschen"><IconButton onClick={() => handleOpenDeleteConfirm(event)}><DeleteIcon /></IconButton></Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                }
            </Container>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="md">
                <DialogTitle>{isCreateMode ? 'Neues Event erstellen' : 'Event bearbeiten'}</DialogTitle>
                <DialogContent>
                    {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                    <TextField autoFocus margin="dense" label="Event-Titel" fullWidth value={editingEvent?.title || ''} onChange={e => handleDialogChange('title', e.target.value)} sx={{ mt: 1 }} />
                    <TextField margin="dense" label="Event-Datum" type="date" fullWidth value={editingEvent?.event_date || ''} onChange={e => handleDialogChange('event_date', e.target.value)} InputLabelProps={{ shrink: true }} />
                    
                    <FormControl fullWidth margin="dense">
                        <InputLabel id="region-select-label">Region</InputLabel>
                        <Select
                            labelId="region-select-label"
                            value={editingEvent?.region || ''}
                            label="Region"
                            onChange={e => handleDialogChange('region', e.target.value)}
                        >
                            <MenuItem value="">
                                <em>Keine Auswahl</em>
                            </MenuItem>
                            {regions.map((region) => (
                                <MenuItem key={region.code} value={region.name}>
                                    {region.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    
                    <TextField margin="dense" label="URL" fullWidth value={editingEvent?.original_url || ''} onChange={e => handleDialogChange('original_url', e.target.value)} />
                    <TextField margin="dense" label="Zusammenfassung" fullWidth multiline rows={3} value={editingEvent?.summary || ''} onChange={e => handleDialogChange('summary', e.target.value)} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteConfirmOpen} onClose={handleCloseDeleteConfirm}>
                <DialogTitle>Löschen bestätigen</DialogTitle>
                <DialogContent>
                    <Typography>Möchten Sie das Event "{eventToDelete?.title}" wirklich endgültig löschen?</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeleteConfirm}>Abbrechen</Button>
                    <Button onClick={handleDelete} variant="contained" color="error">Löschen</Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminEventsPage;
