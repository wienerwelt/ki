// frontend/src/pages/AdminDirectoryPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Container, Typography, Box, Button, Paper, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Select, MenuItem,
    FormControl, InputLabel, Chip, FormControlLabel, Switch, Divider, Tabs, Tab, Autocomplete, Checkbox,
    TableSortLabel, Avatar, alpha, useTheme
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Close as CloseIcon,
    AddCircleOutline as AddCircleOutlineIcon,
    CloudUpload as CloudUploadIcon,
    Google as GoogleIcon,
    CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
    CheckBox as CheckBoxIcon,
    Search as SearchIcon,
    CalendarToday as CalendarTodayIcon,
    LocationOn as LocationOnIcon,
    EditNotifications as EditNotificationsIcon
} from '@mui/icons-material';

import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

// --- UTILS ---
const sanitizeEmail = (email: string) => email.toLowerCase().trim().replace(/\/+$/, '');

const formatUrl = (url: string) => {
    let cleaned = url.trim();
    if (cleaned && !/^https?:\/\//i.test(cleaned)) cleaned = 'https://' + cleaned;
    return cleaned;
};

const formatPhoneNumber = (phone: string) => {
    let cleaned = phone.replace(/[^\d+]/g, ''); 
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);
    if (!cleaned.startsWith('+')) {
        if (cleaned.startsWith('0')) {
            if (/^06(64|60|76|50|99)/.test(cleaned)) cleaned = '+43' + cleaned.substring(1);
            else cleaned = '+49' + cleaned.substring(1);
        }
    }
    return cleaned;
};

function getBackendAssetUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    let baseUrl = import.meta.env.VITE_API_URL || '';
    if (baseUrl === '/') baseUrl = '';
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    let cleanUrl = url.startsWith('/') ? url : `/${url}`;
    if (cleanUrl.startsWith('/api/')) cleanUrl = cleanUrl.substring(4);
    const apiPrefix = baseUrl.endsWith('/api') ? '' : '/api';
    return `${baseUrl}${apiPrefix}${cleanUrl}`;
}

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

// --- INTERFACES ---
interface ProviderLocation {
    address: string;
    zip_code: string;
    city: string;
    country?: string; 
    google_place_id?: string | null; 
    latitude?: number | null;
    longitude?: number | null;
    is_headquarter: boolean;
}

interface ProviderCategory {
    category_id: string;
    is_primary: boolean;
}

interface ProviderMandantSetting {
    business_partner_id: string;
    status: 'active' | 'blacklisted';
    is_recommended: boolean;
}

interface DirectoryProvider {
    id?: string;
    name: string;
    description: string;
    logo_url?: string | null;
    website_url: string;
    contact_email: string;
    contact_phone: string;
    is_public: boolean;
    subscription_tier: 'free' | 'basic' | 'premium';
    created_at?: string;
    updated_at?: string;
    locations: ProviderLocation[];
    categories: ProviderCategory[];
    tags: string[];
    mandant_settings: ProviderMandantSetting[];
}

interface TabPanelProps { children?: React.ReactNode; index: number; value: number; }
function CustomTabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && (<Box sx={{ pt: 3 }}>{children}</Box>)}
        </div>
    );
}

const AdminDirectoryPage: React.FC = () => {
    const { showSnackbar } = useSnackbar();
    const theme = useTheme();
    const [providers, setProviders] = useState<any[]>([]);
    const [businessPartners, setBusinessPartners] = useState<any[]>([]);
    const [categories, setCategories] = useState<{id: string, name: string, name_lang?: string}[]>([]);
    const [tags, setTags] = useState<{id: string, name: string}[]>([]); 
    
    const [loading, setLoading] = useState(true);
    const [googleLoading, setGoogleLoading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [bpFilter, setBpFilter] = useState('all');
    const [orderBy, setOrderBy] = useState<string>('created_at');
    const [order, setOrder] = useState<'asc' | 'desc'>('desc');

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogTab, setDialogTab] = useState(0); 
    const [isEditMode, setIsEditMode] = useState(false);

    // NEU: Wir merken uns den originalen Zustand für den Dirty-Check!
    const [originalProvider, setOriginalProvider] = useState<DirectoryProvider | null>(null);

    const [currentProvider, setCurrentProvider] = useState<DirectoryProvider>({
        name: '', description: '', website_url: '', contact_email: '', contact_phone: '',
        is_public: false, subscription_tier: 'free',
        locations: [], categories: [], tags: [], mandant_settings: []
    });
    
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [deleteLogo, setDeleteLogo] = useState(false);

    const [addressSearchLoading, setAddressSearchLoading] = useState(false);
    const [addressOptions, setAddressOptions] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [provRes, bpRes, catRes] = await Promise.all([
                apiClient.get('/api/admin/directory').catch(() => ({ data: [] })),
                apiClient.get('/api/admin/business-partners').catch(() => ({ data: [] })),
                apiClient.get('/api/data/categories?type=directory_service').catch(() => ({ data: [] }))
            ]);
            setProviders(provRes.data);
            setBusinessPartners(bpRes.data?.partners || bpRes.data || []);
            setCategories(catRes.data);
            const tagRes = await apiClient.get('/api/admin/tags').catch(() => ({ data: [] })); 
            setTags(tagRes.data);
        } catch {
            showSnackbar('Fehler beim Laden der Daten.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showSnackbar]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleGoogleImport = async () => {
        if (!(currentProvider.name || '').trim() || (currentProvider.name || '').trim().length < 3) {
            showSnackbar('Bitte Firmennamen eingeben.', 'warning');
            return;
        }
        setGoogleLoading(true);
        try {
            const res = await apiClient.get(`/api/admin/directory/google-fill?companyName=${encodeURIComponent(currentProvider.name)}`);
            const gData = res.data;

            setCurrentProvider(prev => {
                let newLocations = [...(prev.locations || [])];
                
                // KORREKTUR: Überschreiben des ersten Standorts statt stumpfem Anhängen
                if (gData.location) {
                    if (newLocations.length === 0) {
                        newLocations.push({ ...gData.location, is_headquarter: true });
                    } else {
                        // Wir überschreiben nur die Felder, die Google gefunden hat, behalten den Rest
                        newLocations[0] = {
                            ...newLocations[0],
                            address: gData.location.address || newLocations[0].address,
                            zip_code: gData.location.zip_code || newLocations[0].zip_code,
                            city: gData.location.city || newLocations[0].city,
                            country: gData.location.country || newLocations[0].country,
                            latitude: gData.location.latitude || newLocations[0].latitude,
                            longitude: gData.location.longitude || newLocations[0].longitude,
                        };
                    }
                }

                return {
                    ...prev,
                    name: gData.name || prev.name || '',
                    website_url: formatUrl(gData.website_url || prev.website_url || ''),
                    contact_phone: formatPhoneNumber(gData.contact_phone || prev.contact_phone || ''),
                    locations: newLocations
                };
            });
            showSnackbar('Daten aus Google geladen und eingefügt.', 'success');
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || 'Fehler bei der Google-Suche.';
            showSnackbar(errorMsg, 'error');
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleGeocodeManual = async (idx: number) => {
        const loc = currentProvider.locations[idx];
        const queryStr = `${loc.address || ''}, ${loc.zip_code || ''} ${loc.city || ''}, ${loc.country || ''}`.trim();
        
        if (queryStr.length < 5) {
            showSnackbar('Bitte erst Straße, PLZ und Stadt eintragen.', 'warning');
            return;
        }

        try {
            const res = await apiClient.get(`/api/admin/directory/geocode?query=${encodeURIComponent(queryStr)}`);
            if (res.data.lat && res.data.lng) {
                const newLocs = [...currentProvider.locations];
                newLocs[idx].latitude = res.data.lat;
                newLocs[idx].longitude = res.data.lng;
                setCurrentProvider({...currentProvider, locations: newLocs});
                showSnackbar('Koordinaten erfolgreich ermittelt.', 'success');
            }
        } catch(e) {
            showSnackbar('Keine genauen Koordinaten zu dieser Adresse gefunden.', 'error');
        }
    };

    const handleSubmit = async () => {
        const formData = new FormData();
        const finalEmail = sanitizeEmail(currentProvider.contact_email || '');
        const finalPhone = formatPhoneNumber(currentProvider.contact_phone || '');
        const finalUrl = formatUrl(currentProvider.website_url || '');

        formData.append('name', (currentProvider.name || '').trim());
        formData.append('description', (currentProvider.description || '').trim());
        formData.append('website_url', finalUrl);
        formData.append('contact_email', finalEmail);
        formData.append('contact_phone', finalPhone);
        formData.append('is_public', String(currentProvider.is_public));
        formData.append('subscription_tier', currentProvider.subscription_tier || 'free');
        formData.append('locations', JSON.stringify(currentProvider.locations || []));
        formData.append('categories', JSON.stringify(currentProvider.categories || []));
        formData.append('tags', JSON.stringify(currentProvider.tags || []));
        formData.append('mandant_settings', JSON.stringify(currentProvider.mandant_settings || []));

        if (logoFile) {
            URL.revokeObjectURL(URL.createObjectURL(logoFile));
            formData.append('logo', logoFile); // NEU: Fehlendes 'logo' Append ergänzt
        }
        if (deleteLogo) formData.append('delete_logo', 'true');

        try {
            if (isEditMode && currentProvider.id) {
                await apiClient.put(`/api/admin/directory/${currentProvider.id}`, formData);
            } else {
                await apiClient.post('/api/admin/directory', formData);
            }
            setDialogOpen(false);
            fetchData();
            showSnackbar('Dienstleister erfolgreich gespeichert.', 'success');
        } catch (err: any) {
            showSnackbar('Fehler beim Speichern des Dienstleisters.', 'error');
        }
    };

    const handleSort = (property: string) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    // --- DIRTY STATE CHECKER ---
    // Vergleicht den aktuellen Feldwert mit dem Original, um Änderungen farblich hervorzuheben
    const getDirtySx = (field: keyof DirectoryProvider) => {
        if (!isEditMode || !originalProvider) return {};
        const isDirty = JSON.stringify(currentProvider[field]) !== JSON.stringify(originalProvider[field]);
        if (isDirty) {
            return {
                bgcolor: 'rgba(255, 152, 0, 0.05)',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#ff9800', borderWidth: 2 },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#ed6c02', borderWidth: 2 },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#e65100', borderWidth: 2 }
            };
        }
        return {};
    };

    const getLocationDirtySx = (idx: number, field: keyof ProviderLocation) => {
        if (!isEditMode || !originalProvider) return {};
        const origLoc = originalProvider.locations?.[idx];
        const currLoc = currentProvider.locations?.[idx];
        
        // Neuer Standort, der noch nicht in der DB existiert = grün (Neu)
        if (!origLoc && currLoc) {
            return { 
                bgcolor: 'rgba(76, 175, 80, 0.05)', 
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#4caf50', borderWidth: 2 } 
            };
        }
        if (!currLoc) return {};

        // Geänderter Standort = orange
        if (origLoc[field] !== currLoc[field]) {
            return {
                bgcolor: 'rgba(255, 152, 0, 0.05)',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#ff9800', borderWidth: 2 }
            };
        }
        return {};
    };

    const isLogoDirty = !!logoFile || deleteLogo;

    const filteredAndSortedProviders = useMemo(() => {
        let result = [...providers];
        if (searchTerm) result = result.filter(p => (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
        if (bpFilter !== 'all') result = result.filter(p => p.mandant_settings?.some((m: any) => m.business_partner_id === bpFilter));
        result.sort((a, b) => {
            let valA = a[orderBy] || ''; let valB = b[orderBy] || '';
            if (valA < valB) return order === 'asc' ? -1 : 1;
            if (valA > valB) return order === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }, [providers, searchTerm, bpFilter, order, orderBy]);

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Branchenverzeichnis</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => {
                    setIsEditMode(false);
                    const emptyState: DirectoryProvider = { name: '', description: '', website_url: '', contact_email: '', contact_phone: '', is_public: false, subscription_tier: 'free', locations: [], categories: [], tags: [], mandant_settings: [] };
                    setCurrentProvider(emptyState);
                    setOriginalProvider(null); // Bei Neu-Anlage gibt es keinen Dirty-State
                    setLogoFile(null);
                    setDeleteLogo(false);
                    setDialogTab(0);
                    setDialogOpen(true);
                }}>Anlegen</Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <TextField 
                    size="small" 
                    placeholder="Suchen..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    InputProps={{ 
                        startAdornment: (
                            <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                                <SearchIcon color="action" />
                            </Box>
                        ) 
                    }} 
                />
                <FormControl size="small" sx={{ minWidth: 250 }}>
                    <InputLabel>Nach Partner filtern</InputLabel>
                    <Select value={bpFilter} label="Nach Partner filtern" onChange={e => setBpFilter(e.target.value)}>
                        <MenuItem value="all">Alle Partner</MenuItem>
                        {businessPartners.map(bp => {
                            const pCount = providers.filter(p => p.mandant_settings?.some((m: any) => m.business_partner_id === bp.id)).length;
                            return <MenuItem key={bp.id} value={bp.id}>{bp.name} ({pCount})</MenuItem>;
                        })}
                    </Select>
                </FormControl>
            </Box>

            {loading ? <CircularProgress /> : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell onClick={() => handleSort('name')} sx={{ cursor: 'pointer' }}>
                                    <TableSortLabel active={orderBy === 'name'} direction={order}>Name</TableSortLabel>
                                </TableCell>
                                <TableCell>Kategorien</TableCell>
                                <TableCell>Mandanten</TableCell>
                                <TableCell>Abo</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredAndSortedProviders.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
<Avatar 
    variant="rounded" 
    src={getBackendAssetUrl(p.logo_url)} 
    children={!p.logo_url ? p.name.charAt(0) : undefined}
    sx={{ width: 40, height: 40, bgcolor: '#f0f0f0' }}
/>
                                            <Typography variant="body2" fontWeight="bold">{p.name}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {(p.categories || []).map((catItem: any, i: number) => {
                                                const matchedCat = categories.find(c => c.id === catItem.category_id);
                                                if (!matchedCat) return null;
                                                return (
                                                    <Chip
                                                        key={i}
                                                        label={matchedCat.name_lang || matchedCat.name}
                                                        size="small"
                                                        variant={catItem.is_primary ? "filled" : "outlined"}
                                                        color="primary"
                                                        sx={{ fontSize: '0.7rem' }}
                                                    />
                                                );
                                            })}
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {(p.mandant_settings || []).map((ms: any, i: number) => {
                                                const matchedBp = businessPartners.find(bp => bp.id === ms.business_partner_id);
                                                if (!matchedBp) return null;
                                                const isBlocked = ms.status === 'blacklisted';
                                                return (
                                                    <Tooltip key={i} title={isBlocked ? "Gesperrt" : (ms.is_recommended ? "Empfohlen" : "Aktiv")}>
                                                        <Chip
                                                            label={matchedBp.name}
                                                            size="small"
                                                            color={isBlocked ? "error" : (ms.is_recommended ? "success" : "default")}
                                                            variant={ms.is_recommended ? "filled" : "outlined"}
                                                            sx={{ fontSize: '0.7rem' }}
                                                        />
                                                    </Tooltip>
                                                );
                                            })}
                                            {(!p.mandant_settings || p.mandant_settings.length === 0) && (
                                                <Typography variant="caption" color="text.secondary">-</Typography>
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell><Chip label={p.subscription_tier || 'free'} size="small" color={p.subscription_tier === 'premium' ? 'primary' : 'default'} /></TableCell>
                                    <TableCell><Chip label={p.is_public ? 'Öffentlich' : 'Intern'} size="small" color={p.is_public ? 'success' : 'default'} /></TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                        <Tooltip title="Bearbeiten">
                                            <IconButton onClick={() => {
                                                setIsEditMode(true);
                                                apiClient.get(`/api/admin/directory/${p.id}`).then(res => {
                                                    const formattedData: DirectoryProvider = {
                                                        ...res.data,
                                                        name: res.data.name || '',
                                                        description: res.data.description || '',
                                                        website_url: res.data.website_url || '',
                                                        contact_email: res.data.contact_email || '',
                                                        contact_phone: res.data.contact_phone || '',
                                                        locations: res.data.locations || [],
                                                        categories: res.data.categories || [],
                                                        tags: res.data.tags || [],
                                                        mandant_settings: res.data.mandant_settings || []
                                                    };
                                                    setCurrentProvider(formattedData);
                                                    setOriginalProvider(JSON.parse(JSON.stringify(formattedData))); // Tiefenkopie für Dirty Check
                                                    setLogoFile(null);
                                                    setDeleteLogo(false);
                                                    setDialogTab(0);
                                                    setDialogOpen(true);
                                                });
                                            }}><EditIcon /></IconButton>
                                        </Tooltip>
                                        <Tooltip title="Löschen">
                                            <IconButton color="error" onClick={() => {
                                                if(window.confirm('Dienstleister wirklich löschen?')) apiClient.delete(`/api/admin/directory/${p.id}`).then(() => fetchData());
                                            }}><DeleteIcon /></IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredAndSortedProviders.length === 0 && (
                                <TableRow><TableCell colSpan={6} align="center">Keine Dienstleister gefunden.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="lg">
                <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        {isEditMode ? 'Dienstleister bearbeiten' : 'Neuer Dienstleister'}
                        {isEditMode && currentProvider.created_at && (
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <CalendarTodayIcon fontSize="inherit" /> 
                                Erstellt: {new Date(currentProvider.created_at).toLocaleString()}
                            </Typography>
                        )}
                    </Box>
                    <IconButton onClick={() => setDialogOpen(false)}><CloseIcon /></IconButton>
                </DialogTitle>
                
                <Tabs value={dialogTab} onChange={(_, v) => setDialogTab(v)} sx={{ px: 2, mt: 1 }}>
                    <Tab label="1. Stammdaten" />
                    <Tab label={`2. Standorte (${(currentProvider.locations || []).length})`} />
                    <Tab label="3. Kategorien & Tags" />
                    <Tab label={`4. Mandanten (${(currentProvider.mandant_settings || []).length})`} />
                </Tabs>

                <DialogContent sx={{ minHeight: '50vh' }}>
                    {/* INFO-TEXT FÜR ADMINS ZUM DIRTY-STATE */}
                    {isEditMode && (
                        <Box sx={{ mb: 3, p: 1.5, bgcolor: alpha(theme.palette.warning.main, 0.1), borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EditNotificationsIcon color="warning" fontSize="small" />
                            <Typography variant="caption" color="warning.dark">
                                Ungespeicherte Änderungen werden farblich orange hervorgehoben.
                            </Typography>
                        </Box>
                    )}

                    <CustomTabPanel value={dialogTab} index={0}>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={8}>
                                <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                                    <TextField 
                                        fullWidth 
                                        label="Firmenname *" 
                                        value={currentProvider.name || ''} 
                                        onChange={e => setCurrentProvider({...currentProvider, name: e.target.value})} 
                                        onBlur={e => setCurrentProvider({...currentProvider, name: e.target.value.trim()})}
                                        sx={getDirtySx('name')}
                                    />
                                    <Tooltip title="Sucht auf Google Maps nach Adresse, Webseite & Telefon">
                                        <span>
                                            <Button 
                                                variant="contained" 
                                                color="info" 
                                                onClick={handleGoogleImport} 
                                                disabled={googleLoading || (currentProvider.name || '').length < 3} 
                                                sx={{ whiteSpace: 'nowrap', height: '100%' }}
                                            >
                                                {googleLoading ? <CircularProgress size={24} color="inherit" /> : <><GoogleIcon sx={{ mr: 1 }}/> Suche</>}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                </Box>

                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <TextField 
                                            fullWidth 
                                            label="E-Mail" 
                                            value={currentProvider.contact_email || ''} 
                                            onChange={e => setCurrentProvider({...currentProvider, contact_email: e.target.value})}
                                            onBlur={e => setCurrentProvider({...currentProvider, contact_email: sanitizeEmail(e.target.value)})}
                                            sx={getDirtySx('contact_email')}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField 
                                            fullWidth 
                                            label="Telefon" 
                                            value={currentProvider.contact_phone || ''} 
                                            onChange={e => setCurrentProvider({...currentProvider, contact_phone: e.target.value})}
                                            onBlur={e => setCurrentProvider({...currentProvider, contact_phone: formatPhoneNumber(e.target.value)})}
                                            sx={getDirtySx('contact_phone')}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <TextField 
                                                fullWidth 
                                                label="Webseite" 
                                                value={currentProvider.website_url || ''} 
                                                onChange={e => setCurrentProvider({...currentProvider, website_url: e.target.value})} 
                                                onBlur={e => setCurrentProvider({...currentProvider, website_url: formatUrl(e.target.value)})}
                                                sx={getDirtySx('website_url')}
                                            />
                                            {currentProvider.website_url && (
                                            <Button 
                                                variant="outlined" 
                                                href={currentProvider.website_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                sx={{ height: 56, whiteSpace: 'nowrap' }} 
                                            >
                                                Öffnen
                                            </Button>
                                            )}
                                        </Box>
                                    </Grid>
                                    
                                    <Grid item xs={12}>
                                        <Paper sx={{ p: 2, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', border: '1px solid #e2e8f0', ...((JSON.stringify(currentProvider.is_public) !== JSON.stringify(originalProvider?.is_public) && isEditMode) ? { borderColor: 'orange', bgcolor: 'rgba(255, 152, 0, 0.05)' } : {}) }}>
                                            <FormControlLabel control={<Switch checked={currentProvider.is_public || false} onChange={e => setCurrentProvider({...currentProvider, is_public: e.target.checked})} />} label="Öffentlich sichtbar" />
                                            <FormControl size="small" sx={{ minWidth: 200, ...getDirtySx('subscription_tier') }}>
                                                <InputLabel>Abo-Stufe</InputLabel>
                                                <Select value={currentProvider.subscription_tier || 'free'} label="Abo-Stufe" onChange={e => setCurrentProvider({...currentProvider, subscription_tier: e.target.value as any})}>
                                                    <MenuItem value="free">Free</MenuItem>
                                                    <MenuItem value="basic">Basic</MenuItem>
                                                    <MenuItem value="premium">Premium</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Paper>
                                    </Grid>

                                    <Grid item xs={12}>
                                        <TextField fullWidth multiline rows={3} label="Kurzbeschreibung" value={currentProvider.description || ''} 
                                            onChange={e => setCurrentProvider({...currentProvider, description: e.target.value.substring(0, 200)})} 
                                            onBlur={e => setCurrentProvider({...currentProvider, description: e.target.value.trim()})}
                                            helperText={`${(currentProvider.description || '').length}/200`} 
                                            sx={getDirtySx('description')}
                                        />
                                    </Grid>
                                </Grid>
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${isLogoDirty ? 'orange' : '#ccc'}`, bgcolor: isLogoDirty ? 'rgba(255, 152, 0, 0.05)' : 'transparent', p: 3, borderRadius: 2, height: '100%', minHeight: 250 }}>
                                    {logoFile || (currentProvider.logo_url && !deleteLogo) ? (
                                        <Box sx={{ textAlign: 'center' }}>
                                            <img 
                                                src={logoFile ? URL.createObjectURL(logoFile) : getBackendAssetUrl(currentProvider.logo_url)} 
                                                alt="Logo" 
                                                style={{ maxHeight: 120, maxWidth: '100%', marginBottom: 16, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} 
                                            />
                                            <Button size="small" color="error" onClick={() => { setDeleteLogo(true); setLogoFile(null); }}>Logo entfernen</Button>
                                        </Box>
                                    ) : (
                                        <>
                                            <CloudUploadIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                                            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>Kein Logo hinterlegt</Typography>
                                        </>
                                    )}
                                    <Button component="label" variant="outlined" sx={{ mt: 2 }}>
                                        {logoFile || (currentProvider.logo_url && !deleteLogo) ? 'Anderes Logo wählen' : 'Logo hochladen'}
                                        <input type="file" hidden accept="image/*" onChange={e => {
                                            setLogoFile(e.target.files?.[0] || null);
                                            setDeleteLogo(false);
                                        }} />
                                    </Button>
                                </Box>
                            </Grid>
                        </Grid>
                    </CustomTabPanel>

                    <CustomTabPanel value={dialogTab} index={1}>
                        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-start' }}>
                             <Button variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={() => {
                                 setCurrentProvider({...currentProvider, locations: [...(currentProvider.locations || []), { address: '', zip_code: '', city: '', country: 'DE', is_headquarter: (currentProvider.locations || []).length === 0 }]})
                             }}>Standort hinzufügen</Button>
                        </Box>
                        
                        {(currentProvider.locations || []).map((loc, idx) => (
                            <Paper key={idx} sx={{ p: 2, mb: 2, border: '1px solid #e2e8f0', position: 'relative' }} elevation={0}>
                                <Typography variant="subtitle2" sx={{ mb: 2, color: 'primary.main' }}>Standort {idx + 1} {loc.is_headquarter && '(Hauptsitz)'}</Typography>
                                <IconButton color="error" size="small" sx={{ position: 'absolute', top: 8, right: 8 }} onClick={() => {
                                    const l = (currentProvider.locations || []).filter((_, i) => i !== idx);
                                    setCurrentProvider({...currentProvider, locations: l});
                                }}><DeleteIcon /></IconButton>

                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={12} md={12}>
                                        <Autocomplete
                                            freeSolo
                                            options={Array.isArray(addressOptions) ? addressOptions : []}
                                            loading={addressSearchLoading}
                                            getOptionLabel={(opt: any) => typeof opt === 'string' ? opt : (opt?.description || '')}
                                            onInputChange={async (_, val) => {
                                                if(val.length < 3) {
                                                    setAddressOptions([]);
                                                    return;
                                                }
                                                setAddressSearchLoading(true);
                                                try {
                                                    const res = await apiClient.get(`/api/admin/directory/address-search?query=${encodeURIComponent(val)}`);
                                                    setAddressOptions(Array.isArray(res.data) ? res.data : []);
                                                } catch(e) {
                                                    setAddressOptions([]);
                                                } finally {
                                                    setAddressSearchLoading(false);
                                                }
                                            }}
                                            onChange={async (_, val: any) => {
                                                if (val && val.place_id) {
                                                    try {
                                                        const detail = await apiClient.get(`/api/admin/directory/address-detail?placeId=${val.place_id}`);
                                                        const { address, zip, city, lat, lng } = detail.data;
                                                        const newLocs = [...(currentProvider.locations || [])];
                                                        newLocs[idx] = { ...newLocs[idx], address, zip_code: zip, city, latitude: lat, longitude: lng };
                                                        setCurrentProvider({...currentProvider, locations: newLocs});
                                                    } catch(e) {
                                                        showSnackbar('Details konnten nicht geladen werden.', 'error');
                                                    }
                                                }
                                            }}
                                            renderInput={(params) => (
                                                <TextField 
                                                    {...params} 
                                                    label="Adresse über Google Maps suchen..." 
                                                    // NEU: Platzhalter mit konkreten Beispielen für Adressen und Firmennamen
                                                    placeholder="z.B. Stephansplatz 1, Wien oder Siemens Energy Berlin"
                                                    size="small" 
                                                    InputProps={{ 
                                                        ...params.InputProps, 
                                                        startAdornment: <LocationOnIcon color="action" sx={{ ml: 1, mr: -0.5 }} />,
                                                        endAdornment: (
                                                            <React.Fragment>
                                                                {addressSearchLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                                                {params.InputProps.endAdornment}
                                                            </React.Fragment>
                                                        )
                                                    }} 
                                                />
                                            )}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <TextField fullWidth label="Manuelle Straße & Hausnummer" size="small" value={loc.address || ''} 
                                            sx={getLocationDirtySx(idx, 'address')}
                                            onChange={e => {
                                                const l = [...(currentProvider.locations || [])]; l[idx].address = e.target.value;
                                                setCurrentProvider({...currentProvider, locations: l});
                                            }} onBlur={e => {
                                                const l = [...(currentProvider.locations || [])]; l[idx].address = e.target.value.trim();
                                                setCurrentProvider({...currentProvider, locations: l});
                                            }} />
                                    </Grid>
                                    <Grid item xs={4} md={2}>
                                        <TextField label="PLZ" size="small" value={loc.zip_code || ''} 
                                            sx={getLocationDirtySx(idx, 'zip_code')}
                                            onChange={e => {
                                                const l = [...(currentProvider.locations || [])]; l[idx].zip_code = e.target.value.trim();
                                                setCurrentProvider({...currentProvider, locations: l});
                                        }} />
                                    </Grid>
                                    <Grid item xs={8} md={4}>
                                        <TextField label="Stadt" size="small" fullWidth value={loc.city || ''} 
                                            sx={getLocationDirtySx(idx, 'city')}
                                            onChange={e => {
                                                const l = [...(currentProvider.locations || [])]; l[idx].city = e.target.value;
                                                setCurrentProvider({...currentProvider, locations: l});
                                            }} onBlur={e => {
                                                const l = [...(currentProvider.locations || [])]; l[idx].city = e.target.value.trim();
                                                setCurrentProvider({...currentProvider, locations: l});
                                        }} />
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <TextField label="Land (z.B. DE)" size="small" fullWidth value={loc.country || ''} 
                                            sx={getLocationDirtySx(idx, 'country')}
                                            onChange={e => {
                                            const l = [...(currentProvider.locations || [])]; l[idx].country = e.target.value.trim();
                                            setCurrentProvider({...currentProvider, locations: l});
                                        }} />
                                    </Grid>
                                    <Grid item xs={6} md={4}>
                                        <Tooltip title="Wird für die Kartendarstellung benötigt. Bei Google Maps per Rechtsklick kopierbar." placement="top">
                                            <TextField label="Latitude (Breitengrad)" size="small" fullWidth type="number" inputProps={{ step: "any" }} value={loc.latitude || ''} 
                                                sx={getLocationDirtySx(idx, 'latitude')}
                                                onChange={e => {
                                                const l = [...(currentProvider.locations || [])]; l[idx].latitude = parseFloat(e.target.value) || null;
                                                setCurrentProvider({...currentProvider, locations: l});
                                            }} />
                                        </Tooltip>
                                    </Grid>
                                    <Grid item xs={6} md={4}>
                                        <Tooltip title="Wird für die Kartendarstellung benötigt. Bei Google Maps per Rechtsklick kopierbar." placement="top">
                                            <TextField label="Longitude (Längengrad)" size="small" fullWidth type="number" inputProps={{ step: "any" }} value={loc.longitude || ''} 
                                                sx={getLocationDirtySx(idx, 'longitude')}
                                                onChange={e => {
                                                const l = [...(currentProvider.locations || [])]; l[idx].longitude = parseFloat(e.target.value) || null;
                                                setCurrentProvider({...currentProvider, locations: l});
                                            }} />
                                        </Tooltip>
                                    </Grid>

                                    <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1 }}>
                                        <Button size="small" color="secondary" onClick={() => handleGeocodeManual(idx)}>
                                            📍 Koordinaten automatisch ermitteln
                                        </Button>
                                    </Grid>

                                    <Grid item xs={12}>
                                        <FormControlLabel control={<Switch checked={loc.is_headquarter || false} onChange={e => {
                                            const l = (currentProvider.locations || []).map((item, i) => ({...item, is_headquarter: i === idx ? e.target.checked : (e.target.checked ? false : item.is_headquarter)}));
                                            setCurrentProvider({...currentProvider, locations: l});
                                        }} />} label="Dies ist der Hauptsitz" />
                                    </Grid>
                                </Grid>
                            </Paper>
                        ))}
                    </CustomTabPanel>

                    <CustomTabPanel value={dialogTab} index={2}>
                        <Typography variant="subtitle2" gutterBottom>Branchen (Service-Kategorien)</Typography>
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={categories}
                            getOptionLabel={(option) => option.name_lang || option.name}
                            value={categories.filter(c => (currentProvider.categories || []).some(pc => pc.category_id === c.id))}
                            onChange={(_, newValue) => {
                                const newCategories = newValue.map((c, index) => ({
                                    category_id: c.id,
                                    is_primary: index === 0 
                                }));
                                setCurrentProvider(p => ({...p, categories: newCategories}));
                            }}
                            renderOption={(props, option, { selected }) => (
                                <li {...props}>
                                    <Checkbox icon={icon} checkedIcon={checkedIcon} style={{ marginRight: 8 }} checked={selected} />
                                    {option.name_lang || option.name}
                                </li>
                            )}
                            renderInput={(params) => <TextField {...params} label="Branchen auswählen" placeholder="Suchen..." sx={getDirtySx('categories')} />}
                            sx={{ mb: 4 }}
                        />

                        <Divider sx={{ my: 3 }} />

                        <Typography variant="subtitle2" gutterBottom>Spezifische Schlagwörter (Tags)</Typography>
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={tags}
                            getOptionLabel={(option) => option.name}
                            value={tags.filter(t => (currentProvider.tags || []).includes(t.id))}
                            onChange={(_, newValue) => {
                                setCurrentProvider(p => ({...p, tags: newValue.map(t => t.id)}));
                            }}
                            renderOption={(props, option, { selected }) => (
                                <li {...props}>
                                    <Checkbox icon={icon} checkedIcon={checkedIcon} style={{ marginRight: 8 }} checked={selected} />
                                    {option.name}
                                </li>
                            )}
                            renderInput={(params) => <TextField {...params} label="Tags auswählen" placeholder="Suchen..." sx={getDirtySx('tags')} />}
                        />
                    </CustomTabPanel>

                    <CustomTabPanel value={dialogTab} index={3}>
                        <Typography variant="subtitle2" gutterBottom>Mandanten-Sichtbarkeit und Empfehlungen</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Hier legst du fest, ob ein Anbieter für einen bestimmten Mandant gesperrt oder empfohlen ist.
                        </Typography>
                        
                        <Button size="small" variant="outlined" startIcon={<AddCircleOutlineIcon />} sx={{ mb: 3 }} onClick={() => setCurrentProvider(p => ({...p, mandant_settings: [...(p.mandant_settings || []), { business_partner_id: '', status: 'active', is_recommended: false }]}))}>
                            Spezifische Regel hinzufügen
                        </Button>
                        
                        {(currentProvider.mandant_settings || []).map((ms, idx) => {
                            const selectedBp = businessPartners.find(bp => bp.id === ms.business_partner_id);
                            const bpLabel = selectedBp ? `${selectedBp.name} Empfohlen` : 'Als Empfohlen markieren';
                            
                            // Check ob dieser Mandant-Eintrag schmutzig ist (grob über existenz im original)
                            const origMs = originalProvider?.mandant_settings?.[idx];
                            const isMsDirty = isEditMode && (!origMs || JSON.stringify(origMs) !== JSON.stringify(ms));

                            return (
                                <Box key={idx} sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, p: 2, bgcolor: isMsDirty ? 'rgba(255, 152, 0, 0.05)' : '#f8fafc', borderRadius: 1, border: isMsDirty ? '2px solid orange' : '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                                    <FormControl sx={{ minWidth: 200, flexGrow: 1 }} size="small">
                                        <InputLabel>Mandant (Business Partner)</InputLabel>
                                        <Select value={ms.business_partner_id || ''} label="Mandant (Business Partner)" onChange={e => {
                                            const newMs = [...(currentProvider.mandant_settings || [])];
                                            newMs[idx].business_partner_id = e.target.value;
                                            setCurrentProvider(p => ({...p, mandant_settings: newMs}));
                                        }}>
                                            {businessPartners.map(bp => <MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                    <FormControl size="small" sx={{ minWidth: 150 }}>
                                        <InputLabel>Status</InputLabel>
                                        <Select value={ms.status || 'active'} label="Status" onChange={e => {
                                            const newMs = [...(currentProvider.mandant_settings || [])];
                                            newMs[idx].status = e.target.value as any;
                                            setCurrentProvider(p => ({...p, mandant_settings: newMs}));
                                        }}>
                                            <MenuItem value="active">Sichtbar (Aktiv)</MenuItem>
                                            <MenuItem value="blacklisted">Gesperrt (Unsichtbar)</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <FormControlLabel 
                                        control={<Switch checked={ms.is_recommended || false} disabled={ms.status === 'blacklisted'} onChange={e => {
                                            const newMs = [...(currentProvider.mandant_settings || [])];
                                            newMs[idx].is_recommended = e.target.checked;
                                            setCurrentProvider(p => ({...p, mandant_settings: newMs}));
                                        }} />} 
                                        label={bpLabel} 
                                        sx={{ whiteSpace: 'nowrap' }} 
                                    />
                                    <IconButton color="error" onClick={() => setCurrentProvider(p => ({...p, mandant_settings: (p.mandant_settings || []).filter((_, i) => i !== idx)}))}><DeleteIcon /></IconButton>
                                </Box>
                            );
                        })}
                    </CustomTabPanel>

                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                    <Button onClick={() => setDialogOpen(false)} color="inherit">Abbrechen</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={!(currentProvider.name || '').trim()}>Dienstleister speichern</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default AdminDirectoryPage;