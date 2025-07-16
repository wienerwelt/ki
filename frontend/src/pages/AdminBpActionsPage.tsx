import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, Tooltip, Select, MenuItem, InputLabel, FormControl, Grid, Card, CardContent,
    TableSortLabel, InputAdornment, styled, Autocomplete, SelectChangeEvent
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageIcon from '@mui/icons-material/Image'; // Icon für Platzhalter
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

// Styled Component für den Upload-Bereich
const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

const AdminBpActionsPage: React.FC = () => {
    const { user } = useAuth();
    const [actions, setActions] = useState<BusinessPartnerAction[]>([]);
    const [allBusinessPartners, setAllBusinessPartners] = useState<BusinessPartner[]>([]);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAction, setEditingAction] = useState<BusinessPartnerAction | null>(null);
    const [formState, setFormState] = useState<Partial<BusinessPartnerAction>>({
        title: '', content_text: '', link_url: '', image_url: '',
        layout_type: 'layout_1', is_active: true, start_date: null, end_date: null,
        business_partner_id: '',
    });
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: 'created_at', direction: 'desc' });

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const headers = { 'x-auth-token': token };
            
            const params = { search: debouncedSearchTerm, sortBy: sortConfig.key, sortOrder: sortConfig.direction };

            const [actionsResponse, imagesResponse] = await Promise.all([
                apiClient.get('/api/admin/actions', { headers, params }),
                apiClient.get('/api/admin/actions/images', { headers })
            ]);
            
            setActions(actionsResponse.data);
            setUploadedImages(imagesResponse.data);

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

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSortRequest = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const handleOpenDialog = (action: BusinessPartnerAction | null = null) => {
        setEditingAction(action);
        setUploadError(null);
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormState(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    
    const handleSelectChange = (e: SelectChangeEvent<string>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
    };

    const handleAutocompleteChange = (event: React.SyntheticEvent, newValue: string | null) => {
        setFormState(prev => ({ ...prev, image_url: newValue || '' }));
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
        } catch (err: any) { setError(err.response?.data?.message || 'Fehler beim Speichern.'); }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Sind Sie sicher, dass Sie diese Aktion löschen möchten?')) {
            try {
                await apiClient.delete(`/api/admin/actions/${id}`, { headers: { 'x-auth-token': localStorage.getItem('jwt_token') } });
                fetchData();
            } catch (err: any) { setError(err.response?.data?.message || 'Fehler beim Löschen.'); }
        }
    };

    const handleCopy = (action: BusinessPartnerAction) => {
        setEditingAction(null);
        setUploadError(null);
        setFormState({
            ...action,
            id: undefined,
            title: `Kopie von: ${action.title}`,
        });
        setOpenDialog(true);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setUploadError('Ungültiges Dateiformat. Bitte nur JPG, PNG, GIF oder WEBP hochladen.');
            return;
        }

        const maxSizeInBytes = 2 * 1024 * 1024; 
        if (file.size > maxSizeInBytes) {
            setUploadError('Datei ist zu groß. Maximum ist 2MB.');
            return;
        }
        
        setUploadError(null);
        const formData = new FormData();
        formData.append('actionImage', file);
        const bpName = allBusinessPartners.find(bp => bp.id === formState.business_partner_id)?.name || 'Global';
        formData.append('businessPartnerName', bpName);
        formData.append('startDate', formState.start_date || '');
        formData.append('endDate', formState.end_date || '');

        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.post('/api/admin/actions/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data', 'x-auth-token': token }
            });
            const { filePath } = response.data;
            setFormState(prev => ({ ...prev, image_url: filePath }));
            setUploadedImages(prev => [filePath, ...prev]);
        } catch (err: any) {
            setUploadError(err.response?.data?.message || 'Upload fehlgeschlagen.');
        }
    };

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Business Partner Aktionen</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }} />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neue Aktion</Button>
                    </Box>
                </Box>

                {loading && <CircularProgress />}
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {!loading && (
                    <Paper><TableContainer><Table>
                        <TableHead><TableRow>
                            <TableCell>Status</TableCell>
                            {/* NEU: Spalte für die Vorschau */}
                            <TableCell>Vorschau</TableCell>
                            <TableCell><TableSortLabel active={sortConfig.key === 'title'} direction={sortConfig.direction} onClick={() => handleSortRequest('title')}>Titel</TableSortLabel></TableCell>
                            {user?.role === 'admin' && <TableCell><TableSortLabel active={sortConfig.key === 'business_partner_name'} direction={sortConfig.direction} onClick={() => handleSortRequest('business_partner_name')}>Business Partner</TableSortLabel></TableCell>}
                            <TableCell><TableSortLabel active={sortConfig.key === 'start_date'} direction={sortConfig.direction} onClick={() => handleSortRequest('start_date')}>Gültigkeit</TableSortLabel></TableCell>
                            <TableCell align="right">Aktionen</TableCell>
                        </TableRow></TableHead>
                        <TableBody>{actions.map((action) => (
                            <TableRow key={action.id}>
                                <TableCell><Tooltip title={action.is_active ? 'Aktiv' : 'Inaktiv'}>{action.is_active ? <CheckCircleIcon color="success" /> : <CancelIcon color="disabled" />}</Tooltip></TableCell>
                                {/* NEU: Zelle für die Vorschau */}
                                <TableCell>
                                    {action.image_url ? (
                                        <img 
                                            src={action.image_url} 
                                            alt="Vorschau" 
                                            style={{ width: '80px', height: '50px', objectFit: 'cover', borderRadius: '4px', verticalAlign: 'middle' }} 
                                        />
                                    ) : (
                                        <Box sx={{ width: '80px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.100', borderRadius: '4px' }}>
                                            <ImageIcon color="disabled" />
                                        </Box>
                                    )}
                                </TableCell>
                                <TableCell>{action.title}</TableCell>
                                {user?.role === 'admin' && <TableCell>{action.business_partner_name}</TableCell>}
                                <TableCell>{action.start_date ? new Date(action.start_date).toLocaleDateString('de-AT') : 'Ab sofort'} - {action.end_date ? new Date(action.end_date).toLocaleDateString('de-AT') : 'Unbegrenzt'}</TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Aktion kopieren"><IconButton onClick={() => handleCopy(action)}><ContentCopyIcon /></IconButton></Tooltip>
                                    <Tooltip title="Bearbeiten"><IconButton onClick={() => handleOpenDialog(action)}><EditIcon /></IconButton></Tooltip>
                                    <Tooltip title="Löschen"><IconButton onClick={() => handleDelete(action.id)}><DeleteIcon color="error" /></IconButton></Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}</TableBody>
                    </Table></TableContainer></Paper>
                )}

                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingAction ? 'Aktion bearbeiten' : 'Neue Aktion erstellen'}</DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            {user?.role === 'admin' && (
                                <Grid item xs={12}><FormControl fullWidth><InputLabel>Business Partner</InputLabel><Select name="business_partner_id" value={formState.business_partner_id || ''} label="Business Partner" onChange={handleSelectChange}>{allBusinessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}</Select></FormControl></Grid>
                            )}
                            <Grid item xs={12}><TextField name="title" label="Titel der Aktion" fullWidth value={formState.title || ''} onChange={handleInputChange} /></Grid>
                            <Grid item xs={12}><TextField name="content_text" label="Beschreibungstext" fullWidth multiline rows={3} value={formState.content_text || ''} onChange={handleInputChange} /></Grid>
                            <Grid item xs={12}><TextField name="link_url" label="Link-URL" fullWidth value={formState.link_url || ''} onChange={handleInputChange} /></Grid>
                            
                            <Grid item xs={12} md={8}>
                                <Autocomplete
                                    freeSolo
                                    options={uploadedImages}
                                    value={formState.image_url || ''}
                                    onChange={handleAutocompleteChange}
                                    renderInput={(params) => <TextField {...params} name="image_url" label="Bild URL oder Auswahl" />}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Button component="label" fullWidth variant="outlined" startIcon={<UploadFileIcon />}>Grafik hochladen<VisuallyHiddenInput type="file" onChange={handleFileUpload} /></Button>
                            </Grid>
                            {uploadError && <Grid item xs={12}><Alert severity="error">{uploadError}</Alert></Grid>}

                            <Grid item xs={12}><FormControl fullWidth><InputLabel>Layout-Typ</InputLabel><Select name="layout_type" value={formState.layout_type || 'layout_1'} label="Layout-Typ" onChange={handleSelectChange}><MenuItem value="layout_1">Layout 1: Bild links</MenuItem><MenuItem value="layout_2">Layout 2: Bild oben</MenuItem></Select></FormControl></Grid>
                            
                            <Grid item xs={6}><TextField name="start_date" label="Start-Datum" type="datetime-local" fullWidth value={formState.start_date || ''} onChange={handleInputChange} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={6}><TextField name="end_date" label="End-Datum" type="datetime-local" fullWidth value={formState.end_date || ''} onChange={handleInputChange} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12}><FormControlLabel control={<Switch checked={formState.is_active || false} onChange={handleInputChange} name="is_active" />} label="Diese Aktion ist aktiv" /></Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions><Button onClick={handleCloseDialog}>Abbrechen</Button><Button onClick={handleSubmit} variant="contained">Speichern</Button></DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminBpActionsPage;
