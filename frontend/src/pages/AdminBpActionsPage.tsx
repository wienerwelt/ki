import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, Tooltip, Select, MenuItem, InputLabel, FormControl, Grid, Card, CardContent,
    TableSortLabel, InputAdornment
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';

// --- Interfaces ---
interface BusinessPartnerAction {
    id: string;
    business_partner_id: string;
    business_partner_name?: string;
    layout_type: 'layout_1' | 'layout_2';
    title: string;
    content_text: string;
    link_url: string;
    image_url: string;
    is_active: boolean;
    start_date: string | null;
    end_date: string | null;
}

interface BusinessPartner {
    id: string;
    name: string;
}

type SortDirection = 'asc' | 'desc';

const AdminBpActionsPage: React.FC = () => {
    const { user } = useAuth();
    const [actions, setActions] = useState<BusinessPartnerAction[]>([]);
    const [allBusinessPartners, setAllBusinessPartners] = useState<BusinessPartner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAction, setEditingAction] = useState<BusinessPartnerAction | null>(null);
    const [formState, setFormState] = useState<Partial<BusinessPartnerAction>>({
        title: '', content_text: '', link_url: '', image_url: '',
        layout_type: 'layout_1', is_active: true, start_date: null, end_date: null,
        business_partner_id: '',
    });

    // States für Suche und Sortierung
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: 'created_at', direction: 'desc' });

    // Debounce für die Sucheingabe
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500); // 500ms Verzögerung

        return () => {
            clearTimeout(handler);
        };
    }, [searchTerm]);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const headers = { 'x-auth-token': token };
            
            const params = {
                search: debouncedSearchTerm,
                sortBy: sortConfig.key,
                sortOrder: sortConfig.direction,
            };

            const actionsResponse = await apiClient.get('/api/admin/actions', { headers, params });
            setActions(actionsResponse.data);

            if (user.role === 'admin' && allBusinessPartners.length === 0) {
                const bpResponse = await apiClient.get('/api/admin/business-partners', { headers });
                setAllBusinessPartners(bpResponse.data);
            }

            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, [user, debouncedSearchTerm, sortConfig, allBusinessPartners.length]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSortRequest = (key: string) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleOpenDialog = (action: BusinessPartnerAction | null = null) => {
        setEditingAction(action);
        if (action) {
            setFormState({
                ...action,
                start_date: action.start_date ? new Date(action.start_date).toISOString().slice(0, 16) : '',
                end_date: action.end_date ? new Date(action.end_date).toISOString().slice(0, 16) : ''
            });
        } else {
            setFormState({
                title: '', content_text: '', link_url: '', image_url: '',
                layout_type: 'layout_1', is_active: true, start_date: null, end_date: null,
                business_partner_id: user?.role === 'admin' ? '' : (user?.business_partner_id || '')
            });
        }
        setOpenDialog(true);
    };
    
    const handleCloseDialog = () => setOpenDialog(false);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
        const { name, value, type } = e.target as HTMLInputElement;
        const checked = (e.target as HTMLInputElement).checked;
        setFormState(prev => ({ ...prev, [name as string]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = async () => {
        const token = localStorage.getItem('jwt_token');
        const data = { ...formState, start_date: formState.start_date || null, end_date: formState.end_date || null };
        try {
            if (editingAction) {
                await apiClient.put(`/api/admin/actions/${editingAction.id}`, data, { headers: { 'x-auth-token': token } });
            } else {
                await apiClient.post('/api/admin/actions', data, { headers: { 'x-auth-token': token } });
            }
            fetchData();
            handleCloseDialog();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern der Aktion.');
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Sind Sie sicher, dass Sie diese Aktion löschen möchten?')) {
            try {
                const token = localStorage.getItem('jwt_token');
                await apiClient.delete(`/api/admin/actions/${id}`, { headers: { 'x-auth-token': token } });
                fetchData();
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Löschen der Aktion.');
            }
        }
    };

    const renderLayoutPreview = (layout: 'layout_1' | 'layout_2') => (
        <Card variant="outlined"><CardContent><Typography gutterBottom variant="h6" component="div">{layout === 'layout_1' ? 'Layout 1: Bild links' : 'Layout 2: Bild oben'}</Typography>{layout === 'layout_1' ? (<Grid container spacing={2}><Grid item xs={4}><Box sx={{ height: 60, bgcolor: 'grey.300', borderRadius: 1 }} /></Grid><Grid item xs={8}><Typography variant="body2" color="text.secondary">Titel und Text stehen rechts neben dem Bild.</Typography></Grid></Grid>) : (<Box><Box sx={{ height: 60, bgcolor: 'grey.300', mb: 1, borderRadius: 1 }} /><Typography variant="body2" color="text.secondary">Titel und Text stehen unter dem Bild.</Typography></Box>)}</CardContent></Card>
    );

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">
                        Business Partner Aktionen
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField
                            variant="outlined"
                            size="small"
                            placeholder="Suchen..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>),
                            }}
                        />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neue Aktion</Button>
                    </Box>
                </Box>

                {loading && <CircularProgress />}
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {!loading && (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Status</TableCell>
                                        <TableCell sortDirection={sortConfig.key === 'title' ? sortConfig.direction : false}>
                                            <TableSortLabel active={sortConfig.key === 'title'} direction={sortConfig.direction} onClick={() => handleSortRequest('title')}>Titel</TableSortLabel>
                                        </TableCell>
                                        {user?.role === 'admin' && (
                                            <TableCell sortDirection={sortConfig.key === 'business_partner_name' ? sortConfig.direction : false}>
                                                <TableSortLabel active={sortConfig.key === 'business_partner_name'} direction={sortConfig.direction} onClick={() => handleSortRequest('business_partner_name')}>Business Partner</TableSortLabel>
                                            </TableCell>
                                        )}
                                        <TableCell sortDirection={sortConfig.key === 'start_date' ? sortConfig.direction : false}>
                                             <TableSortLabel active={sortConfig.key === 'start_date'} direction={sortConfig.direction} onClick={() => handleSortRequest('start_date')}>Gültigkeitszeitraum</TableSortLabel>
                                        </TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>{actions.map((action) => (
                                    <TableRow key={action.id}>
                                        <TableCell><Tooltip title={action.is_active ? 'Aktiv' : 'Inaktiv'}>{action.is_active ? <CheckCircleIcon color="success" /> : <CancelIcon color="disabled" />}</Tooltip></TableCell>
                                        <TableCell>{action.title}</TableCell>
                                        {user?.role === 'admin' && <TableCell>{action.business_partner_name}</TableCell>}
                                        <TableCell>{action.start_date ? new Date(action.start_date).toLocaleDateString('de-AT') : 'Ab sofort'} - {action.end_date ? new Date(action.end_date).toLocaleDateString('de-AT') : 'Unbegrenzt'}</TableCell>
                                        <TableCell>
                                            <IconButton onClick={() => handleOpenDialog(action)}><EditIcon /></IconButton>
                                            <IconButton onClick={() => handleDelete(action.id)}><DeleteIcon color="error" /></IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}</TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingAction ? 'Aktion bearbeiten' : 'Neue Aktion erstellen'}</DialogTitle>
                    <DialogContent>
                        <Grid container spacing={3} sx={{ mt: 1 }}>
                            {user?.role === 'admin' && (
                                <Grid item xs={12}><FormControl fullWidth><InputLabel>Business Partner</InputLabel><Select name="business_partner_id" value={formState.business_partner_id || ''} label="Business Partner" onChange={handleFormChange as any}>{allBusinessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}</Select></FormControl></Grid>
                            )}
                            <Grid item xs={12}><FormControl fullWidth><InputLabel>Layout-Typ</InputLabel><Select name="layout_type" value={formState.layout_type || 'layout_1'} label="Layout-Typ" onChange={handleFormChange as any}><MenuItem value="layout_1">Layout 1</MenuItem><MenuItem value="layout_2">Layout 2</MenuItem></Select></FormControl></Grid>
                            <Grid item xs={12}>{renderLayoutPreview(formState.layout_type || 'layout_1')}</Grid>
                            <Grid item xs={12}><TextField name="title" label="Titel der Aktion" fullWidth value={formState.title || ''} onChange={handleFormChange} /></Grid>
                            <Grid item xs={12}><TextField name="content_text" label="Beschreibungstext" fullWidth multiline rows={3} value={formState.content_text || ''} onChange={handleFormChange} /></Grid>
                            <Grid item xs={12}><TextField name="link_url" label="Link-URL" fullWidth value={formState.link_url || ''} onChange={handleFormChange} /></Grid>
                            <Grid item xs={12}><TextField name="image_url" label="Bild-URL" fullWidth value={formState.image_url || ''} onChange={handleFormChange} /></Grid>
                            <Grid item xs={6}><TextField name="start_date" label="Start-Datum" type="datetime-local" fullWidth value={formState.start_date || ''} onChange={handleFormChange} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={6}><TextField name="end_date" label="End-Datum" type="datetime-local" fullWidth value={formState.end_date || ''} onChange={handleFormChange} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12}><FormControlLabel control={<Switch checked={formState.is_active || false} onChange={handleFormChange} name="is_active" />} label="Diese Aktion ist aktiv" /></Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions><Button onClick={handleCloseDialog}>Abbrechen</Button><Button onClick={handleSubmit} variant="contained">Speichern</Button></DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminBpActionsPage;
