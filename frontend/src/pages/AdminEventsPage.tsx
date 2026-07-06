// frontend/src/pages/AdminEventsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Container, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Button,
    Alert, CircularProgress, Box, InputAdornment, TableSortLabel, Link as MuiLink, Grid,
    MenuItem, useTheme, alpha, Chip, Divider, Avatar
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event'; 
import ClearIcon from '@mui/icons-material/Clear'; 
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
    thumbnail_url?: string | null;
    businessPartnerId?: string | null;
    category_id?: string | null;     
    category_name?: string | null;   
}

interface Region { name: string; code: string; }
interface BusinessPartner { id: string; name: string; }
interface Category { id: string; name: string; category_type?: string; }

type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator<Key extends keyof ScrapedEvent>(
    order: Order,
    orderBy: Key,
): (a: ScrapedEvent, b: ScrapedEvent) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy)
        : (a, b) => -descendingComparator(a, b, orderBy);
}

const AdminEventsPage: React.FC = () => {
    const theme = useTheme();
    const [events, setEvents] = useState<ScrapedEvent[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]); 
    const [categories, setCategories] = useState<Category[]>([]); 
    
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
    const [bpFilter, setBpFilter] = useState<string>('all'); 
    
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof ScrapedEvent>('event_date');

    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear + 1, currentYear + 2];
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const headers = { headers: { 'x-auth-token': token } };
            
            const [eventsRes, regionsRes, bpRes, catRes] = await Promise.all([
                apiClient.get('/api/admin/scraped-content/events', headers),
                apiClient.get('/api/admin/scraped-content/regions', headers),
                apiClient.get('/api/admin/business-partners', headers),
                apiClient.get('/api/admin/categories', headers) 
            ]);

            setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
            setRegions(Array.isArray(regionsRes.data) ? regionsRes.data : []);
            setBusinessPartners(Array.isArray(bpRes.data) ? bpRes.data : []);
            setCategories(Array.isArray(catRes.data) ? catRes.data : []);
            
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Daten konnten nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const getBpNameFromSource = (sourceIdentifier: string) => {
        if (!sourceIdentifier || sourceIdentifier === 'global_events') return 'Global';
        const bpId = sourceIdentifier.split('_')[0];
        const bp = businessPartners.find(b => b.id === bpId);
        return bp ? bp.name : 'Unbekannter Mandant';
    };

    const handleOpenDialog = (event?: ScrapedEvent) => {
        if (event) {
            setIsCreateMode(false);
            const isGlobal = event.source_identifier === 'global_events';
            const bpId = isGlobal ? '' : event.source_identifier.split('_')[0];

            setEditingEvent({
                ...event,
                event_date: event.event_date ? new Date(event.event_date).toISOString().split('T')[0] : '',
                businessPartnerId: bpId,
                category_id: event.category_id || '',
                source_identifier: event.source_identifier || '', // NEU
            });
        } else {
            setIsCreateMode(true);
            setEditingEvent({ 
                title: '', event_date: '', region: '', summary: '', 
                original_url: '', thumbnail_url: '', businessPartnerId: '', 
                category_id: '', source_identifier: 'global_events' // Standardwert
            });
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
            fetchData(); 
        } catch (err: any) {
            setDialogError(err.response?.data?.message || 'Ein unbekannter Fehler ist aufgetreten.');
        }
    };

    const handleOpenDeleteConfirm = (event: ScrapedEvent) => { setEventToDelete(event); setDeleteConfirmOpen(true); };
    const handleCloseDeleteConfirm = () => { setEventToDelete(null); setDeleteConfirmOpen(false); };

    const handleDelete = async () => {
        if (!eventToDelete) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/scraped-content/${eventToDelete.id}?dataType=content`, { headers: { 'x-auth-token': token } });
            handleCloseDeleteConfirm();
            fetchData();
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

    const handleClearFilters = () => {
        setSearchTerm('');
        setYearFilter('all');
        setMonthFilter('all');
        setBpFilter('all');
    };

    const sortedAndFilteredEvents = useMemo(() => {
        if (!Array.isArray(events)) return [];
        let filtered = events
            .filter(event => {
                const searchLower = searchTerm.toLowerCase();
                const bpName = getBpNameFromSource(event.source_identifier).toLowerCase();
                return (
                    event.title.toLowerCase().includes(searchLower) ||
                    (event.region || '').toLowerCase().includes(searchLower) ||
                    (event.summary || '').toLowerCase().includes(searchLower) || 
                    (event.category_name || '').toLowerCase().includes(searchLower) || 
                    (event.source_identifier || '').toLowerCase().includes(searchLower) || 
                    bpName.includes(searchLower) 
                );
            })
            .filter(event => {
                if (!event.event_date) return yearFilter === 'all' && monthFilter === 'all';
                const eventDate = new Date(event.event_date);
                const yearMatch = yearFilter === 'all' || eventDate.getFullYear() === parseInt(yearFilter);
                const monthMatch = monthFilter === 'all' || (eventDate.getMonth() + 1) === parseInt(monthFilter);
                return yearMatch && monthMatch;
            })
            .filter(event => {
                if (bpFilter === 'all') return true;
                if (bpFilter === 'global') return event.source_identifier === 'global_events';
                return event.source_identifier.startsWith(bpFilter);
            });
            
        return filtered.sort(getComparator(order, orderBy));
    }, [events, searchTerm, order, orderBy, yearFilter, monthFilter, bpFilter, businessPartners]); 

    const handleDialogChange = (field: string, value: any) => {
        setEditingEvent(prev => prev ? { ...prev, [field]: value } : null);
    };

    const eventCategories = useMemo(() => {
        return categories.filter(c => 
            c.name.toLowerCase().includes('event') || 
            (c.category_type && c.category_type.toLowerCase().includes('event'))
        );
    }, [categories]);

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Events verwalten ({sortedAndFilteredEvents.length})</Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ borderRadius: 2 }}>
                        Neues Event
                    </Button>
                </Box>

                <Paper sx={{ p: 2, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }} elevation={0}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6} md={4}>
                            <TextField
                                fullWidth variant="outlined" size="small" placeholder="Suchen (Titel, Ort, Mandant, Kategorie...)"
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
                            />
                        </Grid>
                        <Grid item xs={6} sm={6} md={3}>
                            <TextField 
                                select fullWidth size="small" label="Zuweisung (Mandant)" 
                                value={bpFilter} onChange={(e) => setBpFilter(e.target.value)}
                            >
                                <MenuItem value="all">Alle anzeigen</MenuItem>
                                <MenuItem value="global">Nur Globale Events</MenuItem>
                                <Divider />
                                {businessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={6} sm={3} md={2}>
                            <TextField select fullWidth size="small" label="Jahr" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                                <MenuItem value="all">Alle Jahre</MenuItem>
                                {years.map(y => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={6} sm={3} md={2}>
                            <TextField select fullWidth size="small" label="Monat" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                                <MenuItem value="all">Alle Monate</MenuItem>
                                {months.map(m => <MenuItem key={m} value={String(m)}>{new Date(2000, m - 1).toLocaleString('de-AT', { month: 'long' })}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6} md={1} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <Tooltip title="Filter zurücksetzen">
                                <IconButton onClick={handleClearFilters} color="default" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    <ClearIcon />
                                </IconButton>
                            </Tooltip>
                        </Grid>
                    </Grid>
                </Paper>

                {loading ? <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box> : error ? <Alert severity="error">{error}</Alert> :
                    <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                        <TableContainer>
                            <Table size="small">
                                <TableHead sx={{ bgcolor: 'action.hover' }}>
                                    <TableRow>
                                        <TableCell>Bild</TableCell>
                                        <TableCell sx={{ width: '40%' }}><TableSortLabel active={orderBy === 'title'} direction={order} onClick={() => handleSortRequest('title')}>Beitrag & Zuweisung</TableSortLabel></TableCell>
                                        <TableCell><TableSortLabel active={orderBy === 'category_name'} direction={order} onClick={() => handleSortRequest('category_name')}>Kategorie</TableSortLabel></TableCell>
                                        <TableCell><TableSortLabel active={orderBy === 'region'} direction={order} onClick={() => handleSortRequest('region')}>Region</TableSortLabel></TableCell>
                                        <TableCell><TableSortLabel active={orderBy === 'event_date'} direction={order} onClick={() => handleSortRequest('event_date')}>Datum</TableSortLabel></TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredEvents.map(event => {
                                        const isGlobal = event.source_identifier === 'global_events';
                                        return (
                                        <TableRow key={event.id} hover sx={{ backgroundColor: !event.event_date ? alpha(theme.palette.warning.main, 0.05) : 'inherit' }}>
                                            <TableCell>
                                                {event.thumbnail_url ? (
                                                    <Avatar variant="rounded" src={event.thumbnail_url} sx={{ width: 48, height: 48 }} />
                                                ) : (
                                                    <Avatar variant="rounded" sx={{ width: 48, height: 48, bgcolor: 'action.hover' }}>
                                                        <EventIcon color="action" />
                                                    </Avatar>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {event.title}
                                                </Typography>
                                                <Tooltip title={`Source ID: ${event.source_identifier}`}>
                                                    <Chip 
                                                        label={getBpNameFromSource(event.source_identifier)} 
                                                        size="small" 
                                                        color={isGlobal ? 'primary' : 'secondary'}
                                                        variant={isGlobal ? 'outlined' : 'filled'}
                                                        sx={{ height: 20, fontSize: '0.7rem' }}
                                                    />
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={event.category_name || '-'} size="small" variant="outlined" />
                                            </TableCell>
                                            <TableCell>{event.region || '-'}</TableCell>
                                            <TableCell>
                                                <Typography color={!event.event_date ? 'error.main' : 'inherit'} variant="body2">
                                                    {event.event_date ? new Date(event.event_date).toLocaleDateString('de-AT') : '- DATUM FEHLT -'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                                <Tooltip title="Zur Originalquelle">
                                                    <span><IconButton component={MuiLink} href={event.original_url} target="_blank" disabled={!event.original_url} size="small"><OpenInNewIcon fontSize="small" /></IconButton></span>
                                                </Tooltip>
                                                <Tooltip title="Bearbeiten">
                                                    <IconButton color="primary" onClick={() => handleOpenDialog(event)} size="small"><EditIcon fontSize="small" /></IconButton>
                                                </Tooltip>
                                                <Tooltip title="Löschen">
                                                    <IconButton color="error" onClick={() => handleOpenDeleteConfirm(event)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                }
            </Container>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 800 }}>{isCreateMode ? 'Neues Event anlegen' : 'Event bearbeiten'}</DialogTitle>
                <DialogContent dividers>
                    {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                        <Grid item xs={12}>
                            <TextField autoFocus label="Event-Titel*" fullWidth value={editingEvent?.title || ''} onChange={e => handleDialogChange('title', e.target.value)} size="small" />
                        </Grid>
                        
                        {/* Zuweisung Mandant -> Füllt automatisch den Source Identifier */}
                        <Grid item xs={12} md={6}>
                            <TextField 
                                select
                                fullWidth 
                                size="small"
                                label="Zuweisung (Mandant)*"
                                value={editingEvent?.businessPartnerId || ''}
                                onChange={e => {
                                    const bpId = e.target.value;
                                    handleDialogChange('businessPartnerId', bpId);
                                    // Automatischer Fallback für den Identifier (kann händisch überschrieben werden)
                                    handleDialogChange('source_identifier', bpId ? `${bpId}_events` : 'global_events');
                                }}
                            >
                                <MenuItem value=""><b>Global (Für alle sichtbar)</b></MenuItem>
                                <Divider />
                                {businessPartners.map((bp) => (
                                    <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        
                        {/* NEU: Manuell editierbarer Source Identifier */}
                        <Grid item xs={12} md={6}>
                            <TextField 
                                label="Source Identifier*" 
                                fullWidth 
                                size="small" 
                                value={editingEvent?.source_identifier || ''} 
                                onChange={e => handleDialogChange('source_identifier', e.target.value)} 
                                required 
                            />
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <TextField 
                                select 
                                fullWidth 
                                size="small" 
                                label="Kategorie" 
                                value={editingEvent?.category_id || ''} 
                                onChange={e => handleDialogChange('category_id', e.target.value)}
                            >
                                <MenuItem value=""><em>Keine Auswahl</em></MenuItem>
                                {eventCategories.map((cat) => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
                            </TextField>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField select fullWidth size="small" label="Region" value={editingEvent?.region || ''} onChange={e => handleDialogChange('region', e.target.value)}>
                                <MenuItem value=""><em>Keine Auswahl (Global)</em></MenuItem>
                                {regions.map((region) => <MenuItem key={region.code} value={region.name}>{region.name}</MenuItem>)}
                            </TextField>
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField label="Event-Datum*" type="date" fullWidth size="small" value={editingEvent?.event_date || ''} onChange={e => handleDialogChange('event_date', e.target.value)} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <TextField label="Bild URL (Thumbnail)" fullWidth size="small" value={editingEvent?.thumbnail_url || ''} onChange={e => handleDialogChange('thumbnail_url', e.target.value)} placeholder="https://..." />
                        </Grid>

                        <Grid item xs={12}>
                            <TextField label="Ticket/Info URL" fullWidth size="small" value={editingEvent?.original_url || ''} onChange={e => handleDialogChange('original_url', e.target.value)} placeholder="https://..." />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label="Zusammenfassung" fullWidth multiline rows={4} value={editingEvent?.summary || ''} onChange={e => handleDialogChange('summary', e.target.value)} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 3, bgcolor: 'action.hover' }}>
                    <Button onClick={handleCloseDialog} color="inherit">Abbrechen</Button>
                    <Button onClick={handleSave} variant="contained" sx={{ borderRadius: 2 }}>{isCreateMode ? 'Hinzufügen' : 'Speichern'}</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteConfirmOpen} onClose={handleCloseDeleteConfirm} PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle>Löschen bestätigen</DialogTitle>
                <DialogContent dividers>
                    <Typography>Möchten Sie das Event <b>"{eventToDelete?.title}"</b> wirklich unwiderruflich löschen?</Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={handleCloseDeleteConfirm} color="inherit">Abbrechen</Button>
                    <Button onClick={handleDelete} variant="contained" color="error" sx={{ borderRadius: 2 }}>Endgültig Löschen</Button>
                </DialogActions>
            </Dialog>
        </DashboardLayout>
    );
};

export default AdminEventsPage;