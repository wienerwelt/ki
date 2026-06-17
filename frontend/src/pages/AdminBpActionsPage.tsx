import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, Tooltip, Select, MenuItem, InputLabel, FormControl, Grid,
    TableSortLabel, InputAdornment, styled, Autocomplete, SelectChangeEvent, Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SearchIcon from '@mui/icons-material/Search';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageIcon from '@mui/icons-material/Image';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { Region, WidgetTypeMeta } from '../types/dashboard.types';

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
    target_widget_category?: string;
    target_region?: string;
    is_click_tracking_enabled?: boolean;
}

interface BusinessPartner {
    id: string;
    name: string;
}

type SortDirection = 'asc' | 'desc';

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
    const [allRegions, setAllRegions] = useState<Region[]>([]);
    const [allWidgetTypes, setAllWidgetTypes] = useState<WidgetTypeMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAction, setEditingAction] = useState<BusinessPartnerAction | null>(null);
    const [formState, setFormState] = useState<Partial<BusinessPartnerAction>>({
        title: '', content_text: '', link_url: '', image_url: '',
        layout_type: 'layout_1', is_active: true, start_date: null, end_date: null,
        business_partner_id: '', target_widget_category: '', target_region: 'all', is_click_tracking_enabled: false,
    });
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: 'created_at', direction: 'desc' });

    const isAssistant = user?.role === 'assistenz';

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Hilfsfunktion zur Erkennung und Einbettung von YouTube-Videos
    const renderMedia = (url: string, height: string | number = '100%', width: string | number = '100%') => {
        if (!url) return <ImageIcon color="disabled" />;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        const videoId = (match && match[2].length === 11) ? match[2] : null;

        if (videoId) {
            return (
                <iframe
                    width={width}
                    height={height}
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ borderRadius: '4px', display: 'block' }}
                />
            );
        }
        return <img src={url} alt="Medien Vorschau" style={{ width: width, height: height, objectFit: 'cover', borderRadius: '4px', display: 'block' }} />;
    };

    // Prüft, ob es sich bei der URL um ein YouTube-Video handelt (für Tabellen-Icons)
    const isYouTubeUrl = (url: string) => {
        if (!url) return false;
        return url.includes('youtube.com') || url.includes('youtu.be');
    };

    // "Mediathek": Holt alle einzigartigen Bild-URLs aus bestehenden Aktionen zur Wiederverwendung
    const existingImages = useMemo(() => {
        const urls = actions.map(a => a.image_url).filter(Boolean);
        return Array.from(new Set(urls));
    }, [actions]);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const params: any = { 
                search: debouncedSearchTerm, 
                sortBy: sortConfig.key, 
                sortOrder: sortConfig.direction 
            };
            
            if (isAssistant && user.business_partner_id) {
                params.business_partner_id = user.business_partner_id;
            }

            const actionsResponse = await apiClient.get('/api/admin/actions', { params });
            setActions(actionsResponse.data);

            const [bpRes, regionsRes, widgetsRes] = await Promise.all([
                apiClient.get('/api/admin/business-partners'),
                apiClient.get('/api/data/regions'),
                apiClient.get('/api/widgets/types')
            ]);
            setAllBusinessPartners(bpRes.data);
            setAllRegions(regionsRes.data);
            setAllWidgetTypes(widgetsRes.data.filter((w: WidgetTypeMeta) => w.config?.category));
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    }, [user, debouncedSearchTerm, sortConfig, isAssistant]);

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
                business_partner_id: user?.role === 'admin' ? '' : (user?.business_partner_id || ''),
                target_widget_category: '', target_region: 'all', is_click_tracking_enabled: false,
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

    const handleSubmit = async () => {
        setUploadError(null);

        // Validierung: End-Datum darf nicht vor dem Start-Datum liegen
        if (formState.start_date && formState.end_date && new Date(formState.end_date) < new Date(formState.start_date)) {
            setUploadError('Das End-Datum darf nicht zeitlich vor dem Start-Datum liegen.');
            return;
        }

        const data = { ...formState, start_date: formState.start_date || null, end_date: formState.end_date || null };
        try {
            if (editingAction) {
                await apiClient.put(`/api/admin/actions/${editingAction.id}`, data);
            } else {
                await apiClient.post('/api/admin/actions', data);
            }
            fetchData();
            handleCloseDialog();
        } catch (err: any) { 
            setUploadError(err.response?.data?.message || 'Fehler beim Speichern.'); 
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Sind Sie sicher, dass Sie diese Aktion löschen möchten?')) {
            try {
                await apiClient.delete(`/api/admin/actions/${id}`);
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
            start_date: action.start_date ? new Date(action.start_date).toISOString().slice(0, 16) : '',
            end_date: action.end_date ? new Date(action.end_date).toISOString().slice(0, 16) : ''
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
            const response = await apiClient.post('/api/admin/actions/upload', formData);
            const { filePath } = response.data;
            setFormState(prev => ({ ...prev, image_url: filePath }));
        } catch (err: any) {
            setUploadError(err.response?.data?.message || 'Upload fehlgeschlagen.');
        }
    };

    return (
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
                        <TableCell>Vorschau</TableCell>
                        <TableCell><TableSortLabel active={sortConfig.key === 'title'} direction={sortConfig.direction} onClick={() => handleSortRequest('title')}>Titel</TableSortLabel></TableCell>
                        {user?.role === 'admin' && <TableCell><TableSortLabel active={sortConfig.key === 'business_partner_name'} direction={sortConfig.direction} onClick={() => handleSortRequest('business_partner_name')}>Business Partner</TableSortLabel></TableCell>}
                        <TableCell><TableSortLabel active={sortConfig.key === 'start_date'} direction={sortConfig.direction} onClick={() => handleSortRequest('start_date')}>Gültigkeit</TableSortLabel></TableCell>
                        <TableCell align="right">Aktionen</TableCell>
                    </TableRow></TableHead>
                    <TableBody>{actions.map((action) => (
                        <TableRow key={action.id}>
                            <TableCell><Tooltip title={action.is_active ? 'Aktiv' : 'Inaktiv'}>{action.is_active ? <CheckCircleIcon color="success" /> : <CancelIcon color="disabled" />}</Tooltip></TableCell>
                            <TableCell>
                                <Box sx={{ width: '80px', height: '50px', position: 'relative', borderRadius: '4px', overflow: 'hidden', bgcolor: 'grey.100' }}>
                                    {action.image_url ? (
                                        <>
                                            {isYouTubeUrl(action.image_url) ? (
                                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'text.primary', color: 'white' }}>
                                                    <PlayCircleOutlineIcon />
                                                </Box>
                                            ) : (
                                                <img src={action.image_url} alt="Vorschau" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            )}
                                        </>
                                    ) : (
                                        <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <ImageIcon color="disabled" />
                                        </Box>
                                    )}
                                </Box>
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
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        {user?.role === 'admin' && (
                            <Grid item xs={12}><FormControl fullWidth size="small"><InputLabel>Business Partner</InputLabel><Select name="business_partner_id" value={formState.business_partner_id || ''} label="Business Partner" onChange={handleSelectChange}>{allBusinessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}</Select></FormControl></Grid>
                        )}
                        <Grid item xs={12}><TextField size="small" name="title" label="Titel der Aktion" fullWidth value={formState.title || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12}><TextField size="small" name="content_text" label="Beschreibungstext" fullWidth multiline rows={3} value={formState.content_text || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12}><TextField size="small" name="link_url" label="Ziel-Link-URL (z.B. https://...)" fullWidth value={formState.link_url || ''} onChange={handleInputChange} /></Grid>       
                        
                        {/* Optimierter Medien-Auswahlbereich mit Autocomplete (Mediathek-Wiederverwendung) */}
                        <Grid item xs={12} md={8}>
                            <Autocomplete
                                freeSolo
                                size="small"
                                options={existingImages}
                                value={formState.image_url || ''}
                                onChange={(_, newValue) => setFormState(prev => ({ ...prev, image_url: newValue || '' }))}
                                onInputChange={(_, newInputValue) => setFormState(prev => ({ ...prev, image_url: newInputValue || '' }))}
                                renderInput={(params) => (
                                    <TextField 
                                        {...params} 
                                        name="image_url" 
                                        label="Grafik- oder YouTube-Video-URL" 
                                        fullWidth 
                                        helperText="Füge einen Bild-Link, YouTube-Link ein oder wähle ein vorhandenes Bild aus der Liste."
                                    />
                                )}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Button component="label" fullWidth variant="outlined" startIcon={<UploadFileIcon />} sx={{ height: '40px' }}>Grafik hochladen<VisuallyHiddenInput type="file" onChange={handleFileUpload} /></Button>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Ziel-Widget (Kategorie)</InputLabel>
                                <Select name="target_widget_category" value={formState.target_widget_category || ''} label="Ziel-Widget (Kategorie)" onChange={handleSelectChange}>
                                    <MenuItem value=""><em>Keine Zuordnung (Überall anzeigen)</em></MenuItem>
                                    {allWidgetTypes.map(wt => <MenuItem key={wt.type_key} value={wt.config.category}>{wt.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Ziel-Region</InputLabel>
                                <Select name="target_region" value={formState.target_region || 'all'} label="Ziel-Region" onChange={handleSelectChange}>
                                    <MenuItem value="all"><em>Alle Regionen</em></MenuItem>
                                    {allRegions.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12}><FormControl fullWidth size="small"><InputLabel>Layout-Typ</InputLabel><Select name="layout_type" value={formState.layout_type || 'layout_1'} label="Layout-Typ" onChange={handleSelectChange}><MenuItem value="layout_1">Layout 1: Bild/Video links</MenuItem><MenuItem value="layout_2">Layout 2: Bild/Video oben</MenuItem></Select></FormControl></Grid>
                        
                        <Grid item xs={6}><TextField size="small" name="start_date" label="Start-Datum" type="datetime-local" fullWidth value={formState.start_date || ''} onChange={handleInputChange} InputLabelProps={{ shrink: true }} /></Grid>
                        <Grid item xs={6}><TextField size="small" name="end_date" label="End-Datum" type="datetime-local" fullWidth value={formState.end_date || ''} onChange={handleInputChange} InputLabelProps={{ shrink: true }} /></Grid>
                        
                        <Grid item xs={12} sx={{ py: 0 }}>
                            <FormControlLabel control={<Switch checked={formState.is_active || false} onChange={handleInputChange} name="is_active" />} label="Diese Aktion ist aktiv" />
                            {user?.role === 'admin' && (
                                <FormControlLabel 
                                    control={<Switch checked={formState.is_click_tracking_enabled || false} onChange={handleInputChange} name="is_click_tracking_enabled" />} 
                                    label="Klick-Tracking aktivieren (via PostHog)" 
                                    sx={{ ml: 3 }}
                                />
                            )}
                        </Grid>

                        {uploadError && <Grid item xs={12}><Alert severity="error">{uploadError}</Alert></Grid>}

                        {/* --- NEU: HOCHWERTIGE LIVE-VORSCHAU DIREKT IM DIALOG --- */}
                        <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'text.secondary' }}>Live-Vorschau der Kampagne:</Typography>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                                <Box sx={{ 
                                    display: 'flex', 
                                    flexDirection: formState.layout_type === 'layout_2' ? 'column' : { xs: 'column', sm: 'row' }, 
                                    gap: 2, 
                                    alignItems: 'start' 
                                }}>
                                    <Box sx={{ 
                                        width: formState.layout_type === 'layout_2' ? '100%' : { xs: '100%', sm: '200px' }, 
                                        height: '130px', 
                                        flexShrink: 0,
                                        bgcolor: 'grey.200', 
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {formState.image_url ? renderMedia(formState.image_url, '130px', '100%') : <ImageIcon color="disabled" />}
                                    </Box>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle1" fontWeight="bold" sx={{ wordBreak: 'break-word' }}>
                                            {formState.title || 'Titel der Aktion'}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {formState.content_text || 'Hier wird Ihr Beschreibungstext stehen...'}
                                        </Typography>
                                        {formState.link_url && (
                                            <Button size="small" variant="contained" sx={{ mt: 1.5, textTransform: 'none' }} disabled>
                                                Mehr erfahren
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions><Button onClick={handleCloseDialog}>Abbrechen</Button><Button onClick={handleSubmit} variant="contained">Speichern</Button></DialogActions>
            </Dialog>
        </Container>
    );
};

export default AdminBpActionsPage;