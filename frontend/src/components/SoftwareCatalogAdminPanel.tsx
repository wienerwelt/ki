import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
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
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../utils/assetUrl';

const DEFAULT_SOFTWARE_LOGO = '/logos/default-company.svg';

interface BusinessPartner { id: string; name: string; }
interface ProviderOption { id: string; name: string; logo_url?: string; }
interface CategoryOption { id: string; slug: string; name: string; }

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
    country_codes_input: string;
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
    country_codes_input: 'AT',
    deployment_model: '',
    pricing_model: '',
    target_group: '',
    status: 'draft',
    is_active: true,
    is_public: false,
    is_featured: false,
    category_ids: [],
});

const SoftwareCatalogAdminPanel: React.FC = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [entries, setEntries] = useState<SoftwareEntry[]>([]);
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [selectedBusinessPartnerId, setSelectedBusinessPartnerId] = useState(isAdmin ? '' : (user?.business_partner_id || ''));
    const [providers, setProviders] = useState<ProviderOption[]>([]);
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<SoftwareForm>(emptyForm(user?.business_partner_id || ''));
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadEntries = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const response = await apiClient.get('/api/admin/actions/software', {
                params: selectedBusinessPartnerId ? { businessPartnerId: selectedBusinessPartnerId } : {},
            });
            setEntries(response.data || []);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Software-Katalog konnte nicht geladen werden.');
        } finally {
            setLoading(false);
        }
    }, [selectedBusinessPartnerId, user]);

    useEffect(() => {
        loadEntries();
    }, [loadEntries]);

    useEffect(() => {
        if (!isAdmin) return;
        apiClient.get('/api/admin/business-partners')
            .then((response) => setBusinessPartners(response.data || []))
            .catch(() => setError('Business Partner konnten nicht geladen werden.'));
    }, [isAdmin]);

    useEffect(() => {
        if (!open || !form.business_partner_id) {
            setProviders([]);
            return;
        }
        apiClient.get('/api/admin/actions/catalog/options', { params: { businessPartnerId: form.business_partner_id } })
            .then((response) => {
                setProviders(response.data.providers || []);
                setCategories(response.data.categories || []);
            })
            .catch((err) => setError(err.response?.data?.message || 'Katalog-Optionen konnten nicht geladen werden.'));
    }, [open, form.business_partner_id]);

    const openCreate = () => {
        setError(null);
        setForm(emptyForm(selectedBusinessPartnerId || user?.business_partner_id || ''));
        setOpen(true);
    };

    const openEdit = (entry: SoftwareEntry) => {
        setError(null);
        setForm({
            ...emptyForm(entry.business_partner_id),
            ...entry,
            category_ids: (entry.categories || []).map((category) => category.id),
            country_codes_input: (entry.country_codes || []).join(', '),
        });
        setOpen(true);
    };

    const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

    const uploadLogo = async (file?: File) => {
        if (!file) return;
        if (!form.business_partner_id) return setError('Bitte zuerst einen Business Partner auswählen.');
        if (file.size > 5 * 1024 * 1024) return setError('Das Logo darf maximal 5 MB groß sein.');

        setUploadingLogo(true);
        setError(null);
        try {
            const payload = new FormData();
            payload.append('softwareLogo', file);
            payload.append('businessPartnerId', form.business_partner_id);
            const response = await apiClient.post('/api/admin/actions/software-logo/upload', payload);
            setForm((current) => ({ ...current, logo_url: response.data.filePath }));
        } catch (err: any) {
            setError(err.response?.data?.message || 'Logo konnte nicht hochgeladen werden.');
        } finally {
            setUploadingLogo(false);
        }
    };

    const save = async () => {
        if (!form.business_partner_id) return setError('Bitte einen Business Partner auswählen.');
        if (!form.provider_id) return setError('Bitte zuerst einen Anbieter aus dem Branchenverzeichnis auswählen.');
        if (!form.name.trim()) return setError('Bitte einen Software-Namen eingeben.');
        if (form.category_ids.length === 0) return setError('Bitte mindestens eine Kategorie auswählen.');

        const countryCodes = form.country_codes_input
            .split(',')
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);
        if (form.coverage_scope === 'country' && countryCodes.length === 0) {
            return setError('Bei landesspezifischer Abdeckung mindestens einen ISO-Code angeben, z. B. AT oder DE.');
        }

        setSaving(true);
        setError(null);
        const payload = { ...form, country_codes: countryCodes };
        try {
            if (form.id) {
                await apiClient.put(`/api/admin/actions/software/${form.id}`, payload);
            } else {
                await apiClient.post('/api/admin/actions/software', payload);
            }
            setOpen(false);
            await loadEntries();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Software konnte nicht gespeichert werden.');
        } finally {
            setSaving(false);
        }
    };

    const archive = async (entry: SoftwareEntry) => {
        if (!window.confirm(`„${entry.name}“ archivieren? Bestehende Actions bleiben erhalten, der Eintrag wird aber nicht mehr ausgespielt.`)) return;
        try {
            await apiClient.delete(`/api/admin/actions/software/${entry.id}`);
            await loadEntries();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Software konnte nicht archiviert werden.');
        }
    };

    return (
        <Box sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h5" fontWeight={900}>Software-Lexikon</Typography>
                    <Typography variant="body2" color="text.secondary">Software ist mandantenspezifisch und benötigt immer einen aktiven Anbieter im Branchenverzeichnis.</Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    {isAdmin && (
                        <FormControl size="small" sx={{ minWidth: 240 }}>
                            <InputLabel>Business Partner</InputLabel>
                            <Select value={selectedBusinessPartnerId} label="Business Partner" onChange={(event) => setSelectedBusinessPartnerId(event.target.value)}>
                                <MenuItem value=""><em>Alle Business Partner</em></MenuItem>
                                {businessPartners.map((partner) => <MenuItem key={partner.id} value={partner.id}>{partner.name}</MenuItem>)}
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

            <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>{form.id ? 'Software bearbeiten' : 'Software eintragen'}</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        {isAdmin && (
                            <Grid item xs={12}>
                                <FormControl fullWidth size="small" required>
                                    <InputLabel>Business Partner *</InputLabel>
                                    <Select value={form.business_partner_id} label="Business Partner *" onChange={(event) => setForm((current) => ({ ...current, business_partner_id: event.target.value, provider_id: '' }))}>
                                        {businessPartners.map((partner) => <MenuItem key={partner.id} value={partner.id}>{partner.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth size="small" required disabled={!form.business_partner_id}>
                                <InputLabel>Anbieter aus Branchenverzeichnis *</InputLabel>
                                <Select value={form.provider_id} label="Anbieter aus Branchenverzeichnis *" onChange={(event) => setForm((current) => ({ ...current, provider_id: event.target.value }))}>
                                    {providers.map((provider) => <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={6}><TextField fullWidth required size="small" label="Software / Produktname" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Grid>
                        {form.business_partner_id && providers.length === 0 && <Grid item xs={12}><Alert severity="warning">Zuerst einen Anbieter im Branchenverzeichnis anlegen und diesem Mandanten aktiv zuordnen.</Alert></Grid>}
                        <Grid item xs={12}><TextField fullWidth size="small" label="Kurzbeschreibung" inputProps={{ maxLength: 500 }} helperText={`${form.short_description?.length || 0}/500`} value={form.short_description || ''} onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))} /></Grid>
                        <Grid item xs={12}><TextField fullWidth size="small" multiline rows={4} label="Ausführliche Beschreibung" value={form.description || ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Grid>
                        <Grid item xs={12} md={7}><TextField fullWidth required size="small" label="Produkt-URL" placeholder="https://…" value={form.product_url || ''} onChange={(event) => setForm((current) => ({ ...current, product_url: event.target.value }))} /></Grid>
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
                                    <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                                </Button>
                                <TextField fullWidth size="small" label="Logo-URL (alternativ)" placeholder="https://…" value={form.logo_url || ''} onChange={(event) => setForm((current) => ({ ...current, logo_url: event.target.value }))} />
                                {form.logo_url && <Box component="img" src={resolveAssetUrl(form.logo_url)} alt="Logo-Vorschau" onError={(event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.onerror = null; event.currentTarget.src = DEFAULT_SOFTWARE_LOGO; }} sx={{ width: 100, height: 56, objectFit: 'contain', alignSelf: 'flex-start', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5 }} />}
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
                        <Grid item xs={12} md={7}><TextField fullWidth size="small" label="ISO-Ländercodes" placeholder="AT, DE, CH" value={form.country_codes_input} onChange={(event) => setForm((current) => ({ ...current, country_codes_input: event.target.value }))} helperText="Für landesspezifische Einträge Pflicht; bei Europa/Welt optional." /></Grid>
                        <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Bereitstellung" placeholder="Cloud / SaaS / On-Premise" value={form.deployment_model || ''} onChange={(event) => setForm((current) => ({ ...current, deployment_model: event.target.value }))} /></Grid>
                        <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Preismodell" placeholder="Abo / pro Fahrzeug / auf Anfrage" value={form.pricing_model || ''} onChange={(event) => setForm((current) => ({ ...current, pricing_model: event.target.value }))} /></Grid>
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
                    <Button onClick={() => setOpen(false)}>Abbrechen</Button>
                    <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SoftwareCatalogAdminPanel;
