import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../utils/assetUrl';

const DEFAULT_SOFTWARE_LOGO = '/logos/default-company.svg';
const PRICING_MODEL_OPTIONS = [
    'Kostenlos',
    'Freemium',
    'Abonnement',
    'Einmalkauf / Lizenz',
    'Nutzungsabhängig',
    'Auf Anfrage',
] as const;

interface BusinessPartner { id: string; name: string; }
interface ProviderOption { id: string; name: string; logo_url?: string; }
interface CategoryOption { id: string; slug: string; name: string; }
interface RegionOption { id: string; name: string; code: string; }
interface LogoLibraryItem {
    url: string;
    label: string;
    source: string;
    usageCount?: number;
    usedBy?: string[];
    deletable?: boolean;
    storageKind?: 's3' | 'directory';
    storageKey?: string;
}

interface SoftwareCatalogAdminPanelProps {
    partnerEntryCounts?: Record<string, number>;
    totalEntryCount?: number;
    onCatalogChanged?: () => void | Promise<void>;
}

interface SoftwareEntry {
    id: string;
    business_partner_id: string;
    provider_id: string;
    provider_name: string;
    provider_logo_url?: string;
    name: string;
    short_description?: string;
    description?: string;
    product_url?: string;
    logo_url?: string;
    coverage_scope: 'country' | 'europe' | 'worldwide';
    country_codes: string[];
    deployment_model?: string;
    pricing_model?: string;
    target_group?: string;
    status: 'draft' | 'published' | 'archived';
    is_active: boolean;
    is_public: boolean;
    is_featured: boolean;
    categories: CategoryOption[];
    experience_count: number;
    average_rating: number;
}

type SoftwareForm = Omit<SoftwareEntry, 'id' | 'provider_name' | 'categories' | 'experience_count' | 'average_rating'> & {
    id?: string;
    category_ids: string[];
};

const emptyForm = (businessPartnerId = ''): SoftwareForm => ({
    business_partner_id: businessPartnerId,
    provider_id: '',
    name: '',
    short_description: '',
    description: '',
    product_url: '',
    logo_url: '',
    coverage_scope: 'country',
    country_codes: ['AT'],
    deployment_model: '',
    pricing_model: '',
    target_group: '',
    status: 'draft',
    is_active: true,
    is_public: false,
    is_featured: false,
    category_ids: [],
});

const SoftwareCatalogAdminPanel: React.FC<SoftwareCatalogAdminPanelProps> = ({
    partnerEntryCounts = {},
    totalEntryCount,
    onCatalogChanged,
}) => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [entries, setEntries] = useState<SoftwareEntry[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [selectedBusinessPartnerId, setSelectedBusinessPartnerId] = useState(isAdmin ? '' : (user?.business_partner_id || ''));
    const [providers, setProviders] = useState<ProviderOption[]>([]);
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [regions, setRegions] = useState<RegionOption[]>([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<SoftwareForm>(emptyForm(user?.business_partner_id || ''));
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [logoLibraryOpen, setLogoLibraryOpen] = useState(false);
    const [logoLibrary, setLogoLibrary] = useState<LogoLibraryItem[]>([]);
    const [logoLibrarySearch, setLogoLibrarySearch] = useState('');
    const [visibleLogoCount, setVisibleLogoCount] = useState(80);
    const [logoLibraryLoading, setLogoLibraryLoading] = useState(false);
    const [logoLibraryError, setLogoLibraryError] = useState<string | null>(null);
    const [unavailableLogoUrls, setUnavailableLogoUrls] = useState<Set<string>>(() => new Set());
    const [catalogSearch, setCatalogSearch] = useState('');
    const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState('');
    const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
    const logoPreviewUrlRef = useRef('');
    const [error, setError] = useState<string | null>(null);

    const replaceLogoPreview = useCallback((nextUrl = '') => {
        if (logoPreviewUrlRef.current) URL.revokeObjectURL(logoPreviewUrlRef.current);
        logoPreviewUrlRef.current = nextUrl;
        setLogoPreviewUrl(nextUrl);
    }, []);

    useEffect(() => () => {
        if (logoPreviewUrlRef.current) URL.revokeObjectURL(logoPreviewUrlRef.current);
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedCatalogSearch(catalogSearch.trim()), 350);
        return () => window.clearTimeout(timeout);
    }, [catalogSearch]);

    const loadEntries = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const response = await apiClient.get('/api/admin/actions/software', {
                params: {
                    ...(selectedBusinessPartnerId ? { businessPartnerId: selectedBusinessPartnerId } : {}),
                    ...(debouncedCatalogSearch ? { search: debouncedCatalogSearch } : {}),
                },
            });
            if (!response.res.ok) throw new Error(response.data?.message || 'Software-Katalog konnte nicht geladen werden.');
            setEntries(response.data || []);
            setError(null);
        } catch (err: any) {
            setError(err?.message || err.response?.data?.message || 'Software-Katalog konnte nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, [debouncedCatalogSearch, selectedBusinessPartnerId, user]);

    useEffect(() => {
        loadEntries();
    }, [loadEntries]);

    useEffect(() => {
        if (!isAdmin) return;
        apiClient.get('/api/admin/business-partners')
            .then((response) => {
                if (!response.res.ok) throw new Error(response.data?.message || 'Business Partner konnten nicht geladen werden.');
                setBusinessPartners(response.data || []);
            })
            .catch(() => setError('Business Partner konnten nicht geladen werden.'));
    }, [isAdmin]);

    useEffect(() => {
        if (!open || !form.business_partner_id) {
            setProviders([]);
            return;
        }
        apiClient.get('/api/admin/actions/catalog/options', { params: { businessPartnerId: form.business_partner_id } })
            .then((response) => {
                if (!response.res.ok) throw new Error(response.data?.message || 'Katalog-Optionen konnten nicht geladen werden.');
                setProviders(response.data.providers || []);
                setCategories(response.data.categories || []);
                setRegions(response.data.regions || []);
            })
            .catch((err) => setError(err?.message || err.response?.data?.message || 'Katalog-Optionen konnten nicht geladen werden.'));
    }, [open, form.business_partner_id]);

    const openCreate = () => {
        setError(null);
        replaceLogoPreview('');
        setForm(emptyForm(selectedBusinessPartnerId || user?.business_partner_id || ''));
        setOpen(true);
    };

    const openEdit = (entry: SoftwareEntry) => {
        setError(null);
        replaceLogoPreview('');
        setForm({
            ...emptyForm(entry.business_partner_id),
            ...entry,
            category_ids: (entry.categories || []).map((category) => category.id),
        });
        setOpen(true);
    };

    const closeFormDialog = () => {
        replaceLogoPreview('');
        setOpen(false);
    };

    const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
    const selectedProvider = useMemo(
        () => providers.find((provider) => provider.id === form.provider_id),
        [form.provider_id, providers]
    );
    const formLogoUrl = logoPreviewUrl || resolveAssetUrl(form.logo_url || selectedProvider?.logo_url || form.provider_logo_url) || DEFAULT_SOFTWARE_LOGO;
    const formLogoLabel = logoPreviewUrl
        ? 'Neue Datei – Vorschau vor dem Speichern'
        : form.logo_url
        ? 'Software-Logo'
        : (selectedProvider?.logo_url || form.provider_logo_url) ? 'Anbieterlogo aus dem Branchenverzeichnis' : 'Standardlogo';
    const formProductUrl = useMemo(() => {
        try {
            const parsed = new URL(form.product_url || '');
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
        } catch {
            return '';
        }
    }, [form.product_url]);
    const filteredLogoLibrary = useMemo(() => {
        const needle = logoLibrarySearch.trim().toLowerCase();
        if (!needle) return logoLibrary;
        return logoLibrary.filter((item) => `${item.label} ${item.source} ${item.url}`.toLowerCase().includes(needle));
    }, [logoLibrary, logoLibrarySearch]);
    const visibleLogoLibrary = useMemo(
        () => filteredLogoLibrary.slice(0, visibleLogoCount),
        [filteredLogoLibrary, visibleLogoCount]
    );

    useEffect(() => {
        setVisibleLogoCount(80);
    }, [logoLibraryOpen, logoLibrarySearch]);

    const openLogoLibrary = async () => {
        if (!form.business_partner_id) {
            setError('Bitte zuerst einen Business Partner auswählen.');
            return;
        }

        setLogoLibraryOpen(true);
        setLogoLibrarySearch('');
        setLogoLibraryLoading(true);
        setLogoLibraryError(null);
        try {
            const response = await apiClient.get('/api/admin/actions/software-logo/library', {
                params: { businessPartnerId: form.business_partner_id },
            });
            if (!response.res.ok) throw new Error(response.data?.message || 'Bestehende Logos konnten nicht geladen werden.');
            setLogoLibrary(response.data?.items || []);
            setUnavailableLogoUrls(new Set());
        } catch (err: any) {
            setLogoLibraryError(err?.message || err.response?.data?.message || 'Bestehende Logos konnten nicht geladen werden.');
        } finally {
            setLogoLibraryLoading(false);
        }
    };

    const uploadLogo = async (file?: File) => {
        if (!file) return;
        if (!form.business_partner_id) return setError('Bitte zuerst einen Business Partner auswählen.');
        if (file.size > 5 * 1024 * 1024) return setError('Das Logo darf maximal 5 MB groß sein.');

        const localPreviewUrl = URL.createObjectURL(file);
        replaceLogoPreview(localPreviewUrl);
        setUploadingLogo(true);
        setError(null);
        try {
            const payload = new FormData();
            payload.append('softwareLogo', file);
            payload.append('businessPartnerId', form.business_partner_id);
            const response = await apiClient.post('/api/admin/actions/software-logo/upload', payload);
            if (!response.res.ok) throw new Error(response.data?.message || 'Logo konnte nicht hochgeladen werden.');
            setForm((current) => ({ ...current, logo_url: response.data.filePath }));
        } catch (err: any) {
            replaceLogoPreview('');
            setError(err?.message || err.response?.data?.message || 'Logo konnte nicht hochgeladen werden.');
        } finally {
            setUploadingLogo(false);
        }
    };

    const deleteLogoFromLibrary = async (item: LogoLibraryItem) => {
        if (!item.deletable || !item.storageKind || !item.storageKey) return;
        if (!window.confirm(`„${item.label}“ dauerhaft aus dem Logo-Archiv löschen?`)) return;

        setLogoLibraryError(null);
        try {
            const response = await apiClient.delete('/api/admin/actions/software-logo/library', {
                body: JSON.stringify({
                    businessPartnerId: form.business_partner_id,
                    storageKind: item.storageKind,
                    storageKey: item.storageKey,
                    url: item.url,
                }),
            });
            if (!response.res.ok) throw new Error(response.data?.message || 'Logo konnte nicht gelöscht werden.');
            setLogoLibrary((current) => current.filter((candidate) => candidate.url !== item.url));
            setUnavailableLogoUrls((current) => {
                const next = new Set(current);
                next.delete(item.url);
                return next;
            });
            if (form.logo_url === item.url) setForm((current) => ({ ...current, logo_url: '' }));
        } catch (err: any) {
            setLogoLibraryError(err?.message || err.response?.data?.message || 'Logo konnte nicht gelöscht werden.');
        }
    };

    const save = async () => {
        if (!form.business_partner_id) return setError('Bitte einen Business Partner auswählen.');
        if (!form.provider_id) return setError('Bitte zuerst einen Anbieter aus dem Branchenverzeichnis auswählen.');
        if (!form.name.trim()) return setError('Bitte einen Software-Namen eingeben.');
        if (form.category_ids.length === 0) return setError('Bitte mindestens eine Kategorie auswählen.');

        if (form.coverage_scope === 'country' && form.country_codes.length === 0) {
            return setError('Bei landesspezifischer Abdeckung mindestens ein Land auswählen.');
        }

        setSaving(true);
        setError(null);
        const payload = { ...form, country_codes: form.country_codes };
        try {
            const response = form.id
                ? await apiClient.put(`/api/admin/actions/software/${form.id}`, payload)
                : await apiClient.post('/api/admin/actions/software', payload);
            if (!response.res.ok) throw new Error(response.data?.message || 'Software konnte nicht gespeichert werden.');
            closeFormDialog();
            await loadEntries();
            await onCatalogChanged?.();
        } catch (err: any) {
            setError(err?.message || err.response?.data?.message || 'Software konnte nicht gespeichert werden.');
        } finally {
            setSaving(false);
        }
    };

    const archive = async (entry: SoftwareEntry) => {
        if (!window.confirm(`„${entry.name}“ archivieren? Bestehende Actions bleiben erhalten, der Eintrag wird aber nicht mehr ausgespielt.`)) return;
        try {
            const response = await apiClient.delete(`/api/admin/actions/software/${entry.id}`);
            if (!response.res.ok) throw new Error(response.data?.message || 'Software konnte nicht archiviert werden.');
            await loadEntries();
            await onCatalogChanged?.();
        } catch (err: any) {
            setError(err?.message || err.response?.data?.message || 'Software konnte nicht archiviert werden.');
        }
    };

    const removePermanently = async (entry: SoftwareEntry) => {
        const confirmed = window.confirm(
            `„${entry.name}“ endgültig löschen?\n\nBewertungen und Kategoriezuordnungen werden gelöscht. ` +
            'Bestehende Actions und Community-Beiträge bleiben erhalten, werden aber von der Software entkoppelt. Dieser Schritt kann nicht rückgängig gemacht werden.'
        );
        if (!confirmed) return;

        try {
            const response = await apiClient.delete(`/api/admin/actions/software/${entry.id}/permanent`);
            if (!response.res.ok) throw new Error(response.data?.message || 'Software konnte nicht gelöscht werden.');
            const detachedActions = Number(response.data?.detachedActions || 0);
            const detachedPosts = Number(response.data?.detachedCommunityPosts || 0);
            setError(null);
            await loadEntries();
            await onCatalogChanged?.();
            if (detachedActions > 0 || detachedPosts > 0) {
                window.alert(`Software gelöscht. ${detachedActions} Action(s) und ${detachedPosts} Community-Beitrag/Beiträge wurden entkoppelt.`);
            }
        } catch (err: any) {
            setError(err?.message || err.response?.data?.message || 'Software konnte nicht gelöscht werden.');
        }
    };

    return (
        <Box sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h5" fontWeight={900}>Software-Lexikon</Typography>
                    <Typography variant="body2" color="text.secondary">Software ist mandantenspezifisch und benötigt immer einen aktiven Anbieter im Branchenverzeichnis.</Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' } }}>
                    <TextField
                        size="small"
                        label="Software suchen"
                        placeholder="Name, Anbieter oder Beschreibung"
                        value={catalogSearch}
                        onChange={(event) => setCatalogSearch(event.target.value)}
                        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                        sx={{ minWidth: { xs: '100%', sm: 280 } }}
                    />
                    {isAdmin && (
                        <FormControl size="small" sx={{ minWidth: 240 }}>
                            <InputLabel>Business Partner</InputLabel>
                            <Select value={selectedBusinessPartnerId} label="Business Partner" onChange={(event) => setSelectedBusinessPartnerId(event.target.value)}>
                                <MenuItem value=""><em>Alle Business Partner ({totalEntryCount ?? entries.length})</em></MenuItem>
                                {businessPartners.map((partner) => (
                                    <MenuItem key={partner.id} value={partner.id}>
                                        {partner.name} ({partnerEntryCounts[partner.id] || 0})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Software eintragen</Button>
                </Stack>
            </Stack>

            {error && !open && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {loading ? <Typography color="text.secondary">Lädt …</Typography> : (
                <Grid container spacing={2}>
                    {entries.map((entry) => (
                        <Grid item xs={12} md={6} lg={4} key={entry.id}>
                            <Paper variant="outlined" sx={{ p: 2.2, borderRadius: 3, height: '100%' }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                    <Stack direction="row" spacing={1.2} sx={{ minWidth: 0 }}>
                                        <Box
                                            component="img"
                                            src={resolveAssetUrl(entry.logo_url || entry.provider_logo_url) || DEFAULT_SOFTWARE_LOGO}
                                            alt={`${entry.name} Logo`}
                                            onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                                event.currentTarget.onerror = null;
                                                event.currentTarget.src = DEFAULT_SOFTWARE_LOGO;
                                            }}
                                            sx={{ width: 48, height: 48, flexShrink: 0, objectFit: 'contain', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 0.5, bgcolor: 'background.paper' }}
                                        />
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography fontWeight={900}>{entry.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{entry.provider_name}</Typography>
                                        </Box>
                                    </Stack>
                                    <Stack direction="row" spacing={0.2}>
                                        <Tooltip title="Bearbeiten"><IconButton size="small" onClick={() => openEdit(entry)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                        {entry.product_url && <Tooltip title="Produktseite"><IconButton size="small" href={entry.product_url} target="_blank" rel="noopener noreferrer"><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>}
                                        {entry.status !== 'archived' && <Tooltip title="Archivieren"><IconButton size="small" onClick={() => archive(entry)}><ArchiveOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
                                        <Tooltip title="Endgültig löschen"><IconButton size="small" color="error" onClick={() => removePermanently(entry)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                                    </Stack>
                                </Stack>
                                <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ my: 1.3 }}>
                                    <Chip size="small" label={entry.status === 'published' ? 'Veröffentlicht' : entry.status === 'archived' ? 'Archiviert' : 'Entwurf'} color={entry.status === 'published' ? 'success' : 'default'} />
                                    {entry.is_public && <Chip size="small" label="Public" variant="outlined" />}
                                    {entry.is_featured && <Chip size="small" label="Empfohlen" color="primary" variant="outlined" />}
                                    {(entry.categories || []).slice(0, 2).map((category) => <Chip size="small" key={category.id} label={category.name} />)}
                                </Stack>
                                <Typography variant="body2" color="text.secondary">{entry.short_description || 'Noch keine Kurzbeschreibung.'}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                                    {entry.experience_count || 0} Erfahrungsbeiträge · Bewertung {Number(entry.average_rating || 0).toFixed(1)} / 5
                                </Typography>
                            </Paper>
                        </Grid>
                    ))}
                    {entries.length === 0 && <Grid item xs={12}><Alert severity="info">Noch keine Software-Einträge vorhanden.</Alert></Grid>}
                </Grid>
            )}

            <Dialog open={open} onClose={closeFormDialog} fullWidth maxWidth="md">
                <DialogTitle>{form.id ? 'Software bearbeiten' : 'Software eintragen'}</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        {isAdmin && (
                            <Grid item xs={12}>
                                <FormControl fullWidth size="small" required>
                                    <InputLabel>Business Partner *</InputLabel>
                                    <Select value={form.business_partner_id} label="Business Partner *" onChange={(event) => setForm((current) => ({ ...current, business_partner_id: event.target.value, provider_id: '' }))}>
                                        {businessPartners.map((partner) => (
                                            <MenuItem key={partner.id} value={partner.id}>
                                                {partner.name} ({partnerEntryCounts[partner.id] || 0})
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth size="small" required disabled={!form.business_partner_id}>
                                <InputLabel>Anbieter aus Branchenverzeichnis *</InputLabel>
                                <Select value={form.provider_id} label="Anbieter aus Branchenverzeichnis *" onChange={(event) => {
                                    const provider = providers.find((option) => option.id === event.target.value);
                                    setForm((current) => ({ ...current, provider_id: event.target.value, provider_logo_url: provider?.logo_url }));
                                }}>
                                    {providers.map((provider) => <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={6}><TextField fullWidth required size="small" label="Software / Produktname" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Grid>
                        {form.business_partner_id && providers.length === 0 && <Grid item xs={12}><Alert severity="warning">Zuerst einen Anbieter im Branchenverzeichnis anlegen und diesem Mandanten aktiv zuordnen.</Alert></Grid>}
                        <Grid item xs={12}><TextField fullWidth size="small" label="Kurzbeschreibung" inputProps={{ maxLength: 500 }} helperText={`${form.short_description?.length || 0}/500`} value={form.short_description || ''} onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))} /></Grid>
                        <Grid item xs={12}><TextField fullWidth size="small" multiline rows={4} label="Ausführliche Beschreibung" value={form.description || ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Grid>
                        <Grid item xs={12} md={7}>
                            <TextField
                                fullWidth
                                required
                                size="small"
                                label="Produkt-URL"
                                placeholder="https://…"
                                value={form.product_url || ''}
                                onChange={(event) => setForm((current) => ({ ...current, product_url: event.target.value }))}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <Tooltip title={formProductUrl ? 'Produkt-URL öffnen' : 'Gültige http(s)-URL eingeben'}>
                                                <span>
                                                    <IconButton component="a" href={formProductUrl || undefined} target="_blank" rel="noopener noreferrer" size="small" disabled={!formProductUrl} aria-label="Produkt-URL öffnen">
                                                        <OpenInNewIcon fontSize="small" />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <Stack spacing={1}>
                                <Button
                                    component="label"
                                    variant="outlined"
                                    startIcon={uploadingLogo ? <CircularProgress size={18} /> : <CloudUploadOutlinedIcon />}
                                    disabled={uploadingLogo || !form.business_partner_id}
                                    sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                                >
                                    {uploadingLogo ? 'Logo wird optimiert …' : 'Logo hochladen & verkleinern'}
                                    <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => {
                                        void uploadLogo(event.target.files?.[0]);
                                        event.target.value = '';
                                    }} />
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={<PhotoLibraryOutlinedIcon />}
                                    disabled={!form.business_partner_id}
                                    onClick={openLogoLibrary}
                                    sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                                >
                                    Bestehende Logos durchsuchen
                                </Button>
                                <TextField fullWidth size="small" label="Logo-URL (alternativ)" placeholder="https://…" value={form.logo_url || ''} onChange={(event) => {
                                    replaceLogoPreview('');
                                    setForm((current) => ({ ...current, logo_url: event.target.value }));
                                }} />
                                <Stack direction="row" spacing={1.25} alignItems="center">
                                    <Box component="img" src={formLogoUrl} alt="Logo-Vorschau" onError={(event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.onerror = null; event.currentTarget.src = DEFAULT_SOFTWARE_LOGO; }} sx={{ width: 100, height: 56, objectFit: 'contain', flexShrink: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5, bgcolor: 'background.paper' }} />
                                    <Typography variant="caption" color="text.secondary">{formLogoLabel}</Typography>
                                </Stack>
                                {form.logo_url && (
                                    <Button
                                        color="error"
                                        size="small"
                                        startIcon={<DeleteOutlineIcon />}
                                        onClick={() => {
                                            replaceLogoPreview('');
                                            setForm((current) => ({ ...current, logo_url: '' }));
                                        }}
                                        sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                                    >
                                        Software-Logo entfernen
                                    </Button>
                                )}
                                <Typography variant="caption" color="text.secondary">Automatisch max. 320 × 320 px, WebP. SVG wird aus Sicherheitsgründen nicht angenommen.</Typography>
                            </Stack>
                        </Grid>
                        <Grid item xs={12}>
                            <FormControl fullWidth size="small" required>
                                <InputLabel>Kategorien *</InputLabel>
                                <Select
                                    multiple
                                    value={form.category_ids}
                                    label="Kategorien *"
                                    onChange={(event) => setForm((current) => ({ ...current, category_ids: typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value }))}
                                    renderValue={(selected) => selected.map((id) => categoryNames.get(id) || id).join(', ')}
                                >
                                    {categories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={5}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Abdeckung</InputLabel>
                                <Select value={form.coverage_scope} label="Abdeckung" onChange={(event) => setForm((current) => ({ ...current, coverage_scope: event.target.value as SoftwareForm['coverage_scope'] }))}>
                                    <MenuItem value="country">Landesspezifisch</MenuItem>
                                    <MenuItem value="europe">Europaweit</MenuItem>
                                    <MenuItem value="worldwide">Weltweit</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={7}>
                            <Autocomplete
                                multiple
                                size="small"
                                options={regions}
                                value={regions.filter((region) => form.country_codes.includes(region.code))}
                                getOptionLabel={(option) => `${option.name} (${option.code})`}
                                isOptionEqualToValue={(option, value) => option.code === value.code}
                                onChange={(_, selected) => setForm((current) => ({
                                    ...current,
                                    country_codes: selected.map((region) => region.code),
                                }))}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Länder"
                                        required={form.coverage_scope === 'country'}
                                        helperText="Aus der hinterlegten ISO-Länderliste auswählen. Bei Europa/Welt optional."
                                    />
                                )}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Bereitstellung" placeholder="Cloud / SaaS / On-Premise" value={form.deployment_model || ''} onChange={(event) => setForm((current) => ({ ...current, deployment_model: event.target.value }))} /></Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                select
                                fullWidth
                                size="small"
                                label="Preismodell"
                                value={form.pricing_model || ''}
                                onChange={(event) => setForm((current) => ({ ...current, pricing_model: event.target.value }))}
                                helperText="Einheitliche Auswahl für Suche und Vergleich"
                            >
                                <MenuItem value=""><em>Nicht angegeben</em></MenuItem>
                                {PRICING_MODEL_OPTIONS.map((model) => <MenuItem key={model} value={model}>{model}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Zielgruppe" placeholder="KMU, Großflotten, Kommunen …" value={form.target_group || ''} onChange={(event) => setForm((current) => ({ ...current, target_group: event.target.value }))} /></Grid>
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Status</InputLabel>
                                <Select value={form.status} label="Status" onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SoftwareForm['status'], ...(event.target.value !== 'published' ? { is_public: false } : {}) }))}>
                                    <MenuItem value="draft">Entwurf</MenuItem>
                                    <MenuItem value="published">Veröffentlicht</MenuItem>
                                    <MenuItem value="archived">Archiviert</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <FormControlLabel control={<Switch checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />} label="Aktiv" />
                            <FormControlLabel control={<Switch checked={form.is_public} disabled={form.status !== 'published'} onChange={(event) => setForm((current) => ({ ...current, is_public: event.target.checked }))} />} label="Auf Public Page" />
                            <FormControlLabel control={<Switch checked={form.is_featured} onChange={(event) => setForm((current) => ({ ...current, is_featured: event.target.checked }))} />} label="Empfohlen" />
                        </Grid>
                        <Grid item xs={12}><Alert severity="info">Bewertungen und Hinweise entstehen als Beiträge in „Software & Tools“ in der internen Mandanten-Community. Öffentlich werden nur Durchschnitt und Anzahl gezeigt.</Alert></Grid>
                        {error && <Grid item xs={12}><Alert severity="error">{error}</Alert></Grid>}
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeFormDialog}>Abbrechen</Button>
                    <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={logoLibraryOpen} onClose={() => setLogoLibraryOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>Bestehendes Logo auswählen</DialogTitle>
                <DialogContent dividers>
                    <TextField
                        fullWidth
                        autoFocus
                        size="small"
                        label="Logos durchsuchen"
                        placeholder="Name, Herkunft oder URL"
                        value={logoLibrarySearch}
                        onChange={(event) => setLogoLibrarySearch(event.target.value)}
                        sx={{ mb: 2 }}
                    />
                    {logoLibraryError && <Alert severity="error" sx={{ mb: 2 }}>{logoLibraryError}</Alert>}
                    {logoLibraryLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box>
                    ) : (
                        <>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                                {visibleLogoLibrary.length} von {filteredLogoLibrary.length} Treffern angezeigt · insgesamt {logoLibrary.length} Logos
                                {isAdmin ? ' · mandantenübergreifendes Admin-Archiv' : ' · Archiv des eigenen Mandanten'}
                            </Typography>
                            <Grid container spacing={1.5}>
                                {visibleLogoLibrary.map((item) => (
                                    <Grid item xs={6} sm={4} md={3} key={item.url}>
                                        <Box sx={{ position: 'relative', height: '100%' }}>
                                            <Button
                                                variant="outlined"
                                                onClick={() => {
                                                    replaceLogoPreview('');
                                                    setForm((current) => ({ ...current, logo_url: item.url }));
                                                    setLogoLibraryOpen(false);
                                                }}
                                                sx={{ width: '100%', height: '100%', minHeight: 168, p: 1.2, textTransform: 'none', display: 'flex', flexDirection: 'column', gap: 0.65, alignItems: 'stretch' }}
                                            >
                                                <Box
                                                    component="img"
                                                    src={resolveAssetUrl(item.url) || DEFAULT_SOFTWARE_LOGO}
                                                    alt={`${item.label} Logo`}
                                                    onError={(event: React.SyntheticEvent<HTMLImageElement>) => {
                                                        setUnavailableLogoUrls((current) => new Set(current).add(item.url));
                                                        event.currentTarget.onerror = null;
                                                        event.currentTarget.src = DEFAULT_SOFTWARE_LOGO;
                                                    }}
                                                    sx={{ width: '100%', height: 64, objectFit: 'contain', bgcolor: 'background.paper', borderRadius: 1 }}
                                                />
                                                <Typography variant="caption" fontWeight={800} noWrap title={item.label}>{item.label}</Typography>
                                                <Typography variant="caption" color="text.secondary" noWrap title={item.source}>{item.source}</Typography>
                                                {Number(item.usageCount || 0) > 0 ? (
                                                    <Tooltip title={`Verwendet in: ${(item.usedBy || []).join(', ')}`}>
                                                        <Chip size="small" color="success" variant="outlined" icon={<CheckCircleOutlineIcon />} label={`Verwendet (${item.usageCount})`} />
                                                    </Tooltip>
                                                ) : (
                                                    <Chip size="small" variant="outlined" label="Unbenutzt" />
                                                )}
                                                {Number(item.usageCount || 0) > 0 && (
                                                    <Typography variant="caption" color="success.main" noWrap title={(item.usedBy || []).join(', ')}>
                                                        {(item.usedBy || []).join(', ')}
                                                    </Typography>
                                                )}
                                                {unavailableLogoUrls.has(item.url) && (
                                                    <Chip size="small" color="warning" variant="outlined" label="Datei nicht erreichbar" />
                                                )}
                                            </Button>
                                            {item.storageKind && item.storageKey && (
                                                <Tooltip title={item.deletable ? 'Unbenutztes Logo löschen' : 'Logo wird verwendet und kann nicht gelöscht werden'}>
                                                    <span style={{ position: 'absolute', top: 4, right: 4 }}>
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            disabled={!item.deletable}
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                deleteLogoFromLibrary(item);
                                                            }}
                                                            aria-label={`${item.label} löschen`}
                                                            sx={{ bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}
                                                        >
                                                            <DeleteOutlineIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            )}
                                        </Box>
                                    </Grid>
                                ))}
                                {filteredLogoLibrary.length === 0 && (
                                    <Grid item xs={12}><Alert severity="info">Keine passenden bestehenden Logos gefunden.</Alert></Grid>
                                )}
                                {visibleLogoLibrary.length < filteredLogoLibrary.length && (
                                    <Grid item xs={12}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            onClick={() => setVisibleLogoCount((current) => current + 80)}
                                        >
                                            Weitere Logos laden
                                        </Button>
                                    </Grid>
                                )}
                            </Grid>
                        </>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={() => setLogoLibraryOpen(false)}>Schließen</Button></DialogActions>
            </Dialog>
        </Box>
    );
};

export default SoftwareCatalogAdminPanel;
