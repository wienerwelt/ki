import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    SelectChangeEvent,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
    styled,
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

interface ActionInfo {
    contact?: {
        name?: string;
        role?: string;
        email?: string;
        phone?: string;
    };
    highlights?: string[];
    legalNote?: string;
}

interface BusinessPartnerAction {
    id: string;
    business_partner_id: string;
    business_partner_name?: string;
    layout_type: 'layout_1' | 'layout_2' | 'layout_3' | 'layout_compact' | string;
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
    promotion_label?: string;
    promotion_type?: string;
    cta_label?: string;
    secondary_image_url?: string;
    secondary_link_url?: string;
    secondary_cta_label?: string;
    priority?: number | string;
    info?: ActionInfo;
}

interface BusinessPartner {
    id: string;
    name: string;
}

type SortDirection = 'asc' | 'desc';

type UploadTargetField = 'image_url' | 'secondary_image_url';

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

const DEFAULT_FORM_STATE: Partial<BusinessPartnerAction> = {
    title: '',
    content_text: '',
    link_url: '',
    image_url: '',
    secondary_image_url: '',
    secondary_link_url: '',
    layout_type: 'layout_1',
    is_active: true,
    start_date: null,
    end_date: null,
    business_partner_id: '',
    target_widget_category: '',
    target_region: 'all',
    is_click_tracking_enabled: false,
    promotion_label: '',
    promotion_type: '',
    cta_label: 'Mehr erfahren',
    secondary_cta_label: 'Kontakt aufnehmen',
    priority: 0,
    info: {
        contact: { name: '', role: '', email: '', phone: '' },
        highlights: [],
        legalNote: '',
    },
};

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
    const [formState, setFormState] = useState<Partial<BusinessPartnerAction>>({ ...DEFAULT_FORM_STATE });
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [selectedBusinessPartnerId, setSelectedBusinessPartnerId] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: 'created_at', direction: 'desc' });

    const isAssistant = user?.role === 'assistenz';

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    const getInitialInfo = (action?: BusinessPartnerAction | null): ActionInfo => ({
        contact: {
            name: action?.info?.contact?.name || '',
            role: action?.info?.contact?.role || '',
            email: action?.info?.contact?.email || '',
            phone: action?.info?.contact?.phone || '',
        },
        highlights: action?.info?.highlights || [],
        legalNote: action?.info?.legalNote || '',
    });

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
        return <img src={url} alt="Medien Vorschau" style={{ width, height, objectFit: 'cover', borderRadius: '4px', display: 'block' }} />;
    };

    // Prüft, ob es sich bei der URL um ein YouTube-Video handelt (für Tabellen-Icons)
    const isYouTubeUrl = (url: string) => {
        if (!url) return false;
        return url.includes('youtube.com') || url.includes('youtu.be');
    };

    const isActionExpired = (action: BusinessPartnerAction) => !!action.end_date && new Date(action.end_date) < new Date();

    // Mediathek: Holt alle einzigartigen Bild-URLs aus bestehenden Aktionen zur Wiederverwendung
    const existingImages = useMemo(() => {
        const urls = actions.reduce<string[]>((acc, action) => {
            if (action.image_url) acc.push(action.image_url);
            if (action.secondary_image_url) acc.push(action.secondary_image_url);
            return acc;
        }, []);
        return Array.from(new Set(urls));
    }, [actions]);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const params: any = {
                search: debouncedSearchTerm,
                sortBy: sortConfig.key,
                sortOrder: sortConfig.direction,
            };

            if (user.role === 'admin' && selectedBusinessPartnerId) {
                params.businessPartnerId = selectedBusinessPartnerId;
            }

            if (isAssistant && user.business_partner_id) {
                params.business_partner_id = user.business_partner_id;
            }

            const actionsResponse = await apiClient.get('/api/admin/actions', { params });
            setActions(actionsResponse.data);

            const [bpRes, regionsRes, widgetsRes] = await Promise.all([
                apiClient.get('/api/admin/business-partners'),
                apiClient.get('/api/data/regions'),
                apiClient.get('/api/widgets/types'),
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
    }, [user, debouncedSearchTerm, sortConfig, isAssistant, selectedBusinessPartnerId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSortRequest = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const handleOpenDialog = (action: BusinessPartnerAction | null = null) => {
        setEditingAction(action);
        setUploadError(null);
        if (action) {
            setFormState({
                ...DEFAULT_FORM_STATE,
                ...action,
                cta_label: action.cta_label || 'Mehr erfahren',
                secondary_cta_label: action.secondary_cta_label || 'Kontakt aufnehmen',
                priority: action.priority ?? 0,
                info: getInitialInfo(action),
                start_date: action.start_date ? new Date(action.start_date).toISOString().slice(0, 16) : '',
                end_date: action.end_date ? new Date(action.end_date).toISOString().slice(0, 16) : '',
            });
        } else {
            setFormState({
                ...DEFAULT_FORM_STATE,
                business_partner_id: user?.role === 'admin' ? (selectedBusinessPartnerId || '') : (user?.business_partner_id || ''),
                info: getInitialInfo(null),
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

    const handleInfoContactChange = (field: keyof NonNullable<ActionInfo['contact']>, value: string) => {
        setFormState(prev => ({
            ...prev,
            info: {
                ...(prev.info || {}),
                contact: {
                    ...(prev.info?.contact || {}),
                    [field]: value,
                },
            },
        }));
    };

    const handleHighlightsChange = (value: string) => {
        const highlights = value.split('\n').map(item => item.trim()).filter(Boolean);
        setFormState(prev => ({
            ...prev,
            info: {
                ...(prev.info || {}),
                highlights,
            },
        }));
    };

    const handleLegalNoteChange = (value: string) => {
        setFormState(prev => ({
            ...prev,
            info: {
                ...(prev.info || {}),
                legalNote: value,
            },
        }));
    };

    const handleSubmit = async () => {
        setUploadError(null);

        if (!formState.business_partner_id) {
            setUploadError('Bitte wählen Sie einen Business Partner aus.');
            return;
        }

        if (formState.start_date && formState.end_date && new Date(formState.end_date) < new Date(formState.start_date)) {
            setUploadError('Das End-Datum darf nicht zeitlich vor dem Start-Datum liegen.');
            return;
        }

        const endDateIsPast = formState.end_date ? new Date(formState.end_date) < new Date() : false;
        const data = {
            ...formState,
            priority: Number(formState.priority || 0),
            is_active: endDateIsPast ? false : !!formState.is_active,
            start_date: formState.start_date || null,
            end_date: formState.end_date || null,
            info: {
                contact: {
                    name: formState.info?.contact?.name?.trim() || undefined,
                    role: formState.info?.contact?.role?.trim() || undefined,
                    email: formState.info?.contact?.email?.trim() || undefined,
                    phone: formState.info?.contact?.phone?.trim() || undefined,
                },
                highlights: formState.info?.highlights || [],
                legalNote: formState.info?.legalNote?.trim() || undefined,
            },
        };

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
            ...DEFAULT_FORM_STATE,
            ...action,
            id: undefined,
            title: `Kopie von: ${action.title}`,
            is_active: false,
            info: getInitialInfo(action),
            cta_label: action.cta_label || 'Mehr erfahren',
            secondary_cta_label: action.secondary_cta_label || 'Kontakt aufnehmen',
            start_date: action.start_date ? new Date(action.start_date).toISOString().slice(0, 16) : '',
            end_date: action.end_date ? new Date(action.end_date).toISOString().slice(0, 16) : '',
        });
        setOpenDialog(true);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, targetField: UploadTargetField = 'image_url') => {
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
        formData.append('businessPartnerId', formState.business_partner_id || '');

        try {
            const response = await apiClient.post('/api/admin/actions/upload', formData);
            const { filePath } = response.data;
            setFormState(prev => ({ ...prev, [targetField]: filePath }));
        } catch (err: any) {
            setUploadError(err.response?.data?.message || 'Upload fehlgeschlagen.');
        } finally {
            event.target.value = '';
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" component="h1">Business Partner Aktionen</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ width: { xs: '100%', md: 'auto' } }}>
                    {user?.role === 'admin' && (
                        <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 260 } }}>
                            <InputLabel>Business Partner</InputLabel>
                            <Select
                                value={selectedBusinessPartnerId}
                                label="Business Partner"
                                onChange={(e) => setSelectedBusinessPartnerId(e.target.value)}
                            >
                                <MenuItem value=""><em>Alle Business Partner</em></MenuItem>
                                {allBusinessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}
                            </Select>
                        </FormControl>
                    )}
                    <TextField
                        variant="outlined"
                        size="small"
                        placeholder="Suchen..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
                    />
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Neue Aktion</Button>
                </Stack>
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
                        <TableCell><TableSortLabel active={sortConfig.key === 'priority'} direction={sortConfig.direction} onClick={() => handleSortRequest('priority')}>Priorität</TableSortLabel></TableCell>
                        <TableCell><TableSortLabel active={sortConfig.key === 'start_date'} direction={sortConfig.direction} onClick={() => handleSortRequest('start_date')}>Gültigkeit</TableSortLabel></TableCell>
                        <TableCell align="right">Aktionen</TableCell>
                    </TableRow></TableHead>
                    <TableBody>{actions.map((action) => {
                        const expired = isActionExpired(action);
                        const effectivelyActive = action.is_active && !expired;
                        return (
                            <TableRow key={action.id}>
                                <TableCell>
                                    <Tooltip title={expired ? 'Abgelaufen und wird als inaktiv behandelt' : effectivelyActive ? 'Aktiv' : 'Inaktiv'}>
                                        {effectivelyActive ? <CheckCircleIcon color="success" /> : <CancelIcon color={expired ? 'warning' : 'disabled'} />}
                                    </Tooltip>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ width: '80px', height: '50px', position: 'relative', borderRadius: '4px', overflow: 'hidden', bgcolor: 'grey.100' }}>
                                        {action.image_url ? (
                                            isYouTubeUrl(action.image_url) ? (
                                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'text.primary', color: 'white' }}>
                                                    <PlayCircleOutlineIcon />
                                                </Box>
                                            ) : (
                                                <img src={action.image_url} alt="Vorschau" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            )
                                        ) : (
                                            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <ImageIcon color="disabled" />
                                            </Box>
                                        )}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Stack spacing={0.5}>
                                        <Typography variant="body2" fontWeight={800}>{action.title}</Typography>
                                        {action.promotion_label && <Chip size="small" label={action.promotion_label} sx={{ alignSelf: 'flex-start', fontWeight: 800 }} />}
                                    </Stack>
                                </TableCell>
                                {user?.role === 'admin' && <TableCell>{action.business_partner_name}</TableCell>}
                                <TableCell>{Number(action.priority || 0)}</TableCell>
                                <TableCell>
                                    {action.start_date ? new Date(action.start_date).toLocaleDateString('de-AT') : 'Ab sofort'} - {action.end_date ? new Date(action.end_date).toLocaleDateString('de-AT') : 'Unbegrenzt'}
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Aktion kopieren"><IconButton onClick={() => handleCopy(action)}><ContentCopyIcon /></IconButton></Tooltip>
                                    <Tooltip title="Bearbeiten"><IconButton onClick={() => handleOpenDialog(action)}><EditIcon /></IconButton></Tooltip>
                                    <Tooltip title="Löschen"><IconButton onClick={() => handleDelete(action.id)}><DeleteIcon color="error" /></IconButton></Tooltip>
                                </TableCell>
                            </TableRow>
                        );
                    })}</TableBody>
                </Table></TableContainer></Paper>
            )}

            <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                <DialogTitle>{editingAction ? 'Aktion bearbeiten' : 'Neue Aktion erstellen'}</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>Basisdaten</Typography>
                        </Grid>

                        {user?.role === 'admin' && (
                            <Grid item xs={12}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Business Partner</InputLabel>
                                    <Select name="business_partner_id" value={formState.business_partner_id || ''} label="Business Partner" onChange={handleSelectChange}>
                                        {allBusinessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}

                        <Grid item xs={12}><TextField size="small" name="title" label="Titel der Aktion" fullWidth required value={formState.title || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12}><TextField size="small" name="content_text" label="Beschreibungstext" fullWidth multiline rows={3} value={formState.content_text || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12} md={7}><TextField size="small" name="link_url" label="Primäre Ziel-Link-URL" fullWidth value={formState.link_url || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12} md={5}><TextField size="small" name="cta_label" label="Primärer Button-Text" fullWidth value={formState.cta_label || ''} onChange={handleInputChange} /></Grid>

                        <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>Medien</Typography>
                        </Grid>

                        <Grid item xs={12} md={8}>
                            <Autocomplete
                                freeSolo
                                size="small"
                                options={existingImages}
                                value={formState.image_url || ''}
                                onChange={(_, newValue) => setFormState(prev => ({ ...prev, image_url: newValue || '' }))}
                                onInputChange={(_, newInputValue) => setFormState(prev => ({ ...prev, image_url: newInputValue || '' }))}
                                renderInput={(params) => (
                                    <TextField {...params} name="image_url" label="Hauptbild- oder YouTube-URL" fullWidth helperText="Bild-Link, YouTube-Link oder bestehendes Bild aus der Mediathek." />
                                )}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Button component="label" fullWidth variant="outlined" startIcon={<UploadFileIcon />} sx={{ height: '40px' }}>
                                Hauptbild hochladen
                                <VisuallyHiddenInput type="file" onChange={(e) => handleFileUpload(e, 'image_url')} />
                            </Button>
                        </Grid>

                        <Grid item xs={12} md={8}>
                            <Autocomplete
                                freeSolo
                                size="small"
                                options={existingImages}
                                value={formState.secondary_image_url || ''}
                                onChange={(_, newValue) => setFormState(prev => ({ ...prev, secondary_image_url: newValue || '' }))}
                                onInputChange={(_, newInputValue) => setFormState(prev => ({ ...prev, secondary_image_url: newInputValue || '' }))}
                                renderInput={(params) => (
                                    <TextField {...params} name="secondary_image_url" label="Zweitbild-URL" fullWidth helperText="Optional: Produktfoto, Logo, Zertifikat oder Ansprechpartnerbild." />
                                )}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Button component="label" fullWidth variant="outlined" startIcon={<UploadFileIcon />} sx={{ height: '40px' }}>
                                Zweitbild hochladen
                                <VisuallyHiddenInput type="file" onChange={(e) => handleFileUpload(e, 'secondary_image_url')} />
                            </Button>
                        </Grid>

                        <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>Marketing</Typography>
                        </Grid>
                        <Grid item xs={12} md={4}><TextField size="small" name="promotion_label" label="Promotion-Kennzeichnung" placeholder="z.B. Angebot, Neu, Vorteil" fullWidth value={formState.promotion_label || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Promotion-Typ</InputLabel>
                                <Select name="promotion_type" value={formState.promotion_type || ''} label="Promotion-Typ" onChange={handleSelectChange}>
                                    <MenuItem value=""><em>Kein Typ</em></MenuItem>
                                    <MenuItem value="offer">Angebot</MenuItem>
                                    <MenuItem value="event">Event</MenuItem>
                                    <MenuItem value="product">Produkt</MenuItem>
                                    <MenuItem value="contact">Kontakt/Lead</MenuItem>
                                    <MenuItem value="sponsored">Sponsored</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={4}><TextField size="small" name="priority" label="Priorität" type="number" fullWidth value={formState.priority ?? 0} onChange={handleInputChange} helperText="Höher = weiter vorne" /></Grid>

                        <Grid item xs={12} md={7}><TextField size="small" name="secondary_link_url" label="Sekundäre URL" fullWidth value={formState.secondary_link_url || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12} md={5}><TextField size="small" name="secondary_cta_label" label="Sekundärer Button-Text" fullWidth value={formState.secondary_cta_label || ''} onChange={handleInputChange} /></Grid>
                        <Grid item xs={12}>
                            <TextField
                                size="small"
                                label="Highlights / Benefits"
                                fullWidth
                                multiline
                                rows={3}
                                value={(formState.info?.highlights || []).join('\n')}
                                onChange={(e) => handleHighlightsChange(e.target.value)}
                                helperText="Ein Vorteil pro Zeile. Wird im Widget als kurze Benefit-Liste angezeigt."
                            />
                        </Grid>

                        <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>Ansprechpartner / Kontaktinfos</Typography>
                        </Grid>
                        <Grid item xs={12} md={6}><TextField size="small" label="Ansprechpartner" fullWidth value={formState.info?.contact?.name || ''} onChange={(e) => handleInfoContactChange('name', e.target.value)} /></Grid>
                        <Grid item xs={12} md={6}><TextField size="small" label="Rolle/Funktion" fullWidth value={formState.info?.contact?.role || ''} onChange={(e) => handleInfoContactChange('role', e.target.value)} /></Grid>
                        <Grid item xs={12} md={6}><TextField size="small" label="Kontakt-E-Mail" fullWidth value={formState.info?.contact?.email || ''} onChange={(e) => handleInfoContactChange('email', e.target.value)} /></Grid>
                        <Grid item xs={12} md={6}><TextField size="small" label="Telefon" fullWidth value={formState.info?.contact?.phone || ''} onChange={(e) => handleInfoContactChange('phone', e.target.value)} /></Grid>
                        <Grid item xs={12}><TextField size="small" label="Rechtlicher Hinweis / Kleingedrucktes" fullWidth multiline rows={2} value={formState.info?.legalNote || ''} onChange={(e) => handleLegalNoteChange(e.target.value)} /></Grid>

                        <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.secondary' }}>Ausspielung</Typography>
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
                        <Grid item xs={12}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Layout-Typ</InputLabel>
                                <Select name="layout_type" value={formState.layout_type || 'layout_1'} label="Layout-Typ" onChange={handleSelectChange}>
                                    <MenuItem value="layout_1">Layout 1: Bild/Video links</MenuItem>
                                    <MenuItem value="layout_2">Layout 2: Bild/Video oben</MenuItem>
                                    <MenuItem value="layout_3">Layout 3: Promotion Hero</MenuItem>
                                    <MenuItem value="layout_compact">Layout Kompakt</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={6}><TextField size="small" name="start_date" label="Start-Datum" type="datetime-local" fullWidth value={formState.start_date || ''} onChange={handleInputChange} InputLabelProps={{ shrink: true }} /></Grid>
                        <Grid item xs={6}><TextField size="small" name="end_date" label="End-Datum" type="datetime-local" fullWidth value={formState.end_date || ''} onChange={handleInputChange} InputLabelProps={{ shrink: true }} /></Grid>

                        <Grid item xs={12} sx={{ py: 0 }}>
                            <FormControlLabel control={<Switch checked={!!formState.is_active} onChange={handleInputChange} name="is_active" />} label="Diese Aktion ist aktiv" />
                            {user?.role === 'admin' && (
                                <FormControlLabel
                                    control={<Switch checked={!!formState.is_click_tracking_enabled} onChange={handleInputChange} name="is_click_tracking_enabled" />}
                                    label="Klick-Tracking aktivieren (via PostHog)"
                                    sx={{ ml: { xs: 0, md: 3 } }}
                                />
                            )}
                            {formState.end_date && new Date(formState.end_date) < new Date() && (
                                <Alert severity="warning" sx={{ mt: 1 }}>Das End-Datum liegt in der Vergangenheit. Beim Speichern wird diese Aktion automatisch inaktiv.</Alert>
                            )}
                        </Grid>

                        {uploadError && <Grid item xs={12}><Alert severity="error">{uploadError}</Alert></Grid>}

                        <Grid item xs={12}>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'text.secondary' }}>Live-Vorschau der Kampagne:</Typography>
                            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: formState.layout_type === 'layout_2' || formState.layout_type === 'layout_3' ? 'column' : { xs: 'column', sm: 'row' },
                                    gap: 2,
                                    alignItems: 'start',
                                }}>
                                    <Box sx={{
                                        width: formState.layout_type === 'layout_2' || formState.layout_type === 'layout_3' ? '100%' : { xs: '100%', sm: '200px' },
                                        height: formState.layout_type === 'layout_3' ? '170px' : '130px',
                                        flexShrink: 0,
                                        bgcolor: 'grey.200',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative',
                                    }}>
                                        {formState.image_url ? renderMedia(formState.image_url, '100%', '100%') : <ImageIcon color="disabled" />}
                                        {formState.promotion_label && <Chip size="small" label={formState.promotion_label} color="primary" sx={{ position: 'absolute', top: 8, left: 8, fontWeight: 900 }} />}
                                    </Box>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle1" fontWeight="bold" sx={{ wordBreak: 'break-word' }}>
                                            {formState.title || 'Titel der Aktion'}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {formState.content_text || 'Hier wird Ihr Beschreibungstext stehen...'}
                                        </Typography>
                                        {(formState.info?.highlights || []).length > 0 && (
                                            <Stack spacing={0.25} sx={{ mt: 1 }}>
                                                {(formState.info?.highlights || []).slice(0, 3).map(item => <Typography key={item} variant="caption">• {item}</Typography>)}
                                            </Stack>
                                        )}
                                        {formState.secondary_image_url && (
                                            <Box component="img" src={formState.secondary_image_url} alt="Zweitbild" sx={{ mt: 1, width: 78, height: 52, objectFit: 'cover', borderRadius: 1 }} />
                                        )}
                                        {(formState.info?.contact?.name || formState.info?.contact?.email) && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                                Kontakt: {formState.info?.contact?.name || formState.info?.contact?.email}
                                            </Typography>
                                        )}
                                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                                            {formState.link_url && <Button size="small" variant="contained" disabled>{formState.cta_label || 'Mehr erfahren'}</Button>}
                                            {formState.secondary_link_url && <Button size="small" variant="outlined" disabled>{formState.secondary_cta_label || 'Kontakt aufnehmen'}</Button>}
                                        </Stack>
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Abbrechen</Button>
                    <Button onClick={handleSubmit} variant="contained">Speichern</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default AdminBpActionsPage;
