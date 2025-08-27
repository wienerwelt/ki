// frontend/src/pages/AdminEventsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Container, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button, 
    Alert, CircularProgress, Box, InputAdornment, TableSortLabel, Link as MuiLink
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

interface ScrapedEvent {
    id: string;
    title: string;
    event_date: string | null;
    original_url: string;
    source_identifier: string;
    category_id: string | null;
}

// --- Sortier-Helferfunktionen ---
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
// --- Ende ---

const AdminEventsPage: React.FC = () => {
    const [events, setEvents] = useState<ScrapedEvent[]>([]);
    const [editingEvent, setEditingEvent] = useState<ScrapedEvent | null>(null);
    const [formState, setFormState] = useState({ title: '', event_date: '' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    
    // NEU: States für Suche und Sortierung
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof ScrapedEvent>('event_date');

    const fetchEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get('/api/admin/scraped-content/events', { headers: { 'x-auth-token': token } });
            setEvents(res.data);
        } catch(err: any) {
            setError(err.response?.data?.message || 'Events konnten nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const handleOpenDialog = (event: ScrapedEvent) => {
        setEditingEvent(event);
        const formattedDate = event.event_date ? new Date(event.event_date).toISOString().split('T')[0] : '';
        setFormState({ title: event.title, event_date: formattedDate });
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
                title: formState.title,
                event_date: formState.event_date || null
            };
            await apiClient.put(`/api/admin/scraped-content/events/${editingEvent.id}`, dataToSend, { headers: { 'x-auth-token': token } });
            handleCloseDialog();
            fetchEvents();
        } catch(err: any) {
            setDialogError(err.response?.data?.message || 'Ein unbekannter Fehler ist aufgetreten.');
        }
    };

    // NEU: Handler für Sortierung
    const handleSortRequest = (property: keyof ScrapedEvent) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    // NEU: Memoized List für gefilterte und sortierte Daten
    const sortedAndFilteredEvents = useMemo(() => {
        let filtered = events.filter(event =>
            event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            event.source_identifier.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [events, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Event-Kuratierung</Typography>
                    <TextField
                        variant="outlined"
                        size="small"
                        placeholder="Events suchen..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>)
                        }}
                    />
                </Box>
                
                {loading ? <CircularProgress /> : error ? <Alert severity="error">{error}</Alert> :
                <Paper>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{width: '50%'}} sortDirection={orderBy === 'title' ? order : false}>
                                        <TableSortLabel active={orderBy === 'title'} direction={order} onClick={() => handleSortRequest('title')}>
                                            Titel
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell sortDirection={orderBy === 'source_identifier' ? order : false}>
                                        <TableSortLabel active={orderBy === 'source_identifier'} direction={order} onClick={() => handleSortRequest('source_identifier')}>
                                            Quelle
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell sortDirection={orderBy === 'event_date' ? order : false}>
                                        <TableSortLabel active={orderBy === 'event_date'} direction={order} onClick={() => handleSortRequest('event_date')}>
                                            Event-Datum
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell align="right">Aktionen</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedAndFilteredEvents.map(event => (
                                    <TableRow key={event.id} hover sx={{ backgroundColor: !event.event_date ? '#fff8e1' : 'inherit' }}>
                                        <TableCell>{event.title}</TableCell>
                                        <TableCell>{event.source_identifier}</TableCell>
                                        <TableCell>
                                            <Typography color={!event.event_date ? 'error' : 'inherit'}>
                                                {event.event_date ? new Date(event.event_date).toLocaleDateString('de-AT') : '- KEIN DATUM -'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Zur Originalquelle">
                                                <IconButton component={MuiLink} href={event.original_url} target="_blank" rel="noopener noreferrer">
                                                    <OpenInNewIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Datum / Titel korrigieren">
                                                <IconButton onClick={() => handleOpenDialog(event)}>
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
                }
            </Container>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth>
                <DialogTitle>Event bearbeiten</DialogTitle>
                <DialogContent>
                    {dialogError && <Alert severity="error" sx={{mb: 2}}>{dialogError}</Alert>}
                    <TextField autoFocus margin="dense" label="Event-Titel" fullWidth value={formState.title} onChange={e => setFormState({...formState, title: e.target.value})} sx={{mt: 1}} />
                    <TextField margin="dense" label="Event-Datum" type="date" fullWidth value={formState.event_date} onChange={e => setFormState({...formState, event_date: e.target.value})} InputLabelProps={{ shrink: true }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminEventsPage;
