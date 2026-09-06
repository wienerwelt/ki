// frontend/src/pages/AdminBusinessPartnersPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Autocomplete, Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Stack,
    TextField, MenuItem, Switch, FormControlLabel, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, Chip,
    Tabs, Tab, Grid, LinearProgress, ToggleButtonGroup, ToggleButton, Divider
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import SearchIcon from '@mui/icons-material/Search';
import WidgetsIcon from '@mui/icons-material/Widgets';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';
import UploadIcon from '@mui/icons-material/Upload';
import LinkIcon from '@mui/icons-material/Link'; 
import QrCodeIcon from '@mui/icons-material/QrCode';
import PaletteIcon from '@mui/icons-material/Palette';
import ColorLensIcon from '@mui/icons-material/ColorLens';

import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

interface Region { id: string; name: string; is_default?: boolean; }
interface Category { id: string; name: string; }
type StorageTier = 'free' | 'standard' | 'premium';

const CONTENT_STORAGE_PACKAGES: Record<StorageTier, { label: string; shortLabel: string; limitLabel: string }> = {
    free: { label: 'Kein Cloud-Speicher', shortLabel: 'Ohne Speicher', limitLabel: '0 MB' },
    standard: { label: 'Content Standard', shortLabel: 'Standard', limitLabel: '100 MB' },
    premium: { label: 'Content Premium', shortLabel: 'Premium', limitLabel: '1 GB' }
};

interface ColorScheme {
    id: string;
    name: string;
    primary_color: string;
    secondary_color: string;
    text_color_light: string;
    background_color_light: string;
    paper_color_light: string;
    primary_text_color: string;
}

interface BusinessPartner {
    id: string;
    name: string;
    slug: string | null;
    dashboard_title: string | null;
    address: string | null;
    email: string | null;
    logo_url: string | null;
    subscription_start_date: string;
    subscription_end_date: string;
    color_scheme_id: string | null;
    color_scheme_name: string | null;
    primary_color: string | null;
    is_active: boolean;
    user_count: string;
    widget_count: string;
    url_businesspartner: string | null;
    regions: Region[];
    level_1_name: string | null;
    level_2_name: string | null;
    level_3_name: string | null;
    storage_tier: StorageTier;
    storage_usage_bytes: string;
    storage_limit_bytes: string;
    file_count: string;
    allow_automated_newsletter: boolean;
    account_count: string;
    industries: Category[];
    dashboard_focus: 'information' | 'sales';
    enabled_modules: Array<'content' | 'sales'>;
    default_workspace: 'content' | 'sales';
    sales_plan: 'basic' | 'premium';
    sales_subscription_status: 'active' | 'trial' | 'paused';
    sales_trial_ends_on: string | null;
    sales_trial_days_remaining: number | null;
    sales_access_active: boolean;
    sales_monthly_price_eur: string | number | null;
    sales_billing_cycle: 'monthly' | 'annual';
    newsletter_delivery_mode: 'mobiliti' | 'export' | 'external';
    newsletter_export_email: string | null;
    newsletter_external_signup_url: string | null;
    newsletter_recipient_limit: number;
}

type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    let valA = a[orderBy]; let valB = b[orderBy];
    if (orderBy === 'user_count' || orderBy === 'widget_count') {
        valA = parseInt(valA as string || '0', 10) as any; valB = parseInt(valB as string || '0', 10) as any;
    }
    if (orderBy === 'subscription_end_date') {
        valA = (valA ? new Date(valA as string).getTime() : 0) as any; valB = (valB ? new Date(valB as string).getTime() : 0) as any;
    }
    if (valB < valA) return -1; if (valB > valA) return 1; return 0;
}

function getComparator<Key extends keyof any>(order: Order, orderBy: Key): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}

const formatFileSize = (bytes: number | string | null | undefined) => {
    const numBytes = Number(bytes);
    if (numBytes == null || isNaN(numBytes) || numBytes === 0) return '0 Bytes';
    const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getDefaultSalesTrialEnd = () => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
};

// --- HILFSKOMPONENTE FÜR DEN COLOR PICKER ---
const ColorPickerInput = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => (
    <TextField
        label={label}
        size="small"
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value)}
        InputProps={{
            startAdornment: (
                <InputAdornment position="start">
                    <input
                        type="color"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4, backgroundColor: 'transparent' }}
                    />
                </InputAdornment>
            )
        }}
    />
);

const AdminBusinessPartnersPage: React.FC = () => {
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [colorSchemes, setColorSchemes] = useState<ColorScheme[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingBp, setEditingBp] = useState<BusinessPartner | null>(null);
    const [allIndustries, setAllIndustries] = useState<Category[]>([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof BusinessPartner>('name');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    // Form States
    const [formName, setFormName] = useState('');
    const [formSlug, setFormSlug] = useState('');
    const [formDashboardTitle, setFormDashboardTitle] = useState('');
    const [formAddress, setFormAddress] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formLogoUrl, setFormLogoUrl] = useState('');
    const [formSubscriptionStartDate, setFormSubscriptionStartDate] = useState('');
    const [formSubscriptionEndDate, setFormSubscriptionEndDate] = useState('');
    const [formRegionIds, setFormRegionIds] = useState<string[]>([]);
    const [formDefaultRegionId, setFormDefaultRegionId] = useState<string | null>(null);
    const [formIsActive, setFormIsActive] = useState(true);
    const [formUrlBusinessPartner, setFormUrlBusinessPartner] = useState('');
    const [formLevel1Name, setFormLevel1Name] = useState('');
    const [formLevel2Name, setFormLevel2Name] = useState('');
    const [formLevel3Name, setFormLevel3Name] = useState('');
    const [formStorageTier, setFormStorageTier] = useState<StorageTier>('free');
    const [formAllowNewsletter, setFormAllowNewsletter] = useState(false);
    const [formNewsletterDeliveryMode, setFormNewsletterDeliveryMode] = useState<'mobiliti' | 'export' | 'external'>('mobiliti');
    const [formNewsletterExportEmail, setFormNewsletterExportEmail] = useState('');
    const [formNewsletterExternalUrl, setFormNewsletterExternalUrl] = useState('');
    const [formNewsletterRecipientLimit, setFormNewsletterRecipientLimit] = useState(250);
    const [formEnabledModules, setFormEnabledModules] = useState<Array<'content' | 'sales'>>(['content']);
    const [formDefaultWorkspace, setFormDefaultWorkspace] = useState<'content' | 'sales'>('content');
    const [formSalesPlan, setFormSalesPlan] = useState<'basic' | 'premium'>('basic');
    const [formSalesSubscriptionStatus, setFormSalesSubscriptionStatus] = useState<'active' | 'trial' | 'paused'>('active');
    const [formSalesTrialEndsOn, setFormSalesTrialEndsOn] = useState('');
    const [formSalesMonthlyPrice, setFormSalesMonthlyPrice] = useState('');
    const [formSalesBillingCycle, setFormSalesBillingCycle] = useState<'monthly' | 'annual'>('monthly');
    const [formIndustryIds, setFormIndustryIds] = useState<string[]>([]);

    // --- NEUE FORM STATES FÜR FARBEN ---
    const [formColorMode, setFormColorMode] = useState<'select' | 'custom'>('select');
    const [formColorSchemeId, setFormColorSchemeId] = useState<string>('');
    const [formCustomColors, setFormCustomColors] = useState({
        primary_color: '#2196f3',
        secondary_color: '#ff9800',
        background_color_light: '#f4f6f8',
        paper_color_light: '#ffffff',
        text_color_light: '#333333',
        primary_text_color: '#ffffff'
    });

    const navigate = useNavigate();
    const { showSnackbar } = useSnackbar();

    const fetchData = async () => {
        setLoading(true); setError(null);
        try {
            const token = 'cookie-session';
            const [bpRes, csRes, regRes, indRes] = await Promise.all([
                apiClient.get('/api/admin/business-partners', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners/colorschemes/all', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners/regions', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/categories/industries', { headers: { 'x-auth-token': token } })
            ]);
            setBusinessPartners(bpRes.data); setColorSchemes(csRes.data); setRegions(regRes.data); setAllIndustries(indRes.data);
        } catch (err: any) { setError(err.response?.data?.message || 'Fehler beim Laden der Daten.'); } 
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);
    
    const handleOpenAddDialog = () => {
        setEditingBp(null); setFormName(''); setFormSlug(''); setFormDashboardTitle(''); setFormAddress(''); setFormEmail(''); setFormLogoUrl('');
        setFormSubscriptionStartDate(''); setFormSubscriptionEndDate(''); setFormRegionIds([]); setFormDefaultRegionId(null);
        setFormIsActive(true); setFormUrlBusinessPartner(''); setFormLevel1Name(''); setFormLevel2Name(''); setFormLevel3Name('');
        setFormStorageTier('free'); setFormAllowNewsletter(false); setFormIndustryIds([]);
        setFormEnabledModules(['content']); setFormDefaultWorkspace('content'); setFormSalesPlan('basic');
        setFormSalesSubscriptionStatus('active'); setFormSalesTrialEndsOn(''); setFormSalesMonthlyPrice(''); setFormSalesBillingCycle('monthly');
        setFormNewsletterDeliveryMode('mobiliti'); setFormNewsletterExportEmail(''); setFormNewsletterExternalUrl(''); setFormNewsletterRecipientLimit(250);
        
        // Farben Reset
        setFormColorMode('select');
        setFormColorSchemeId('');
        setFormCustomColors({ primary_color: '#2196f3', secondary_color: '#ff9800', background_color_light: '#f4f6f8', paper_color_light: '#ffffff', text_color_light: '#333333', primary_text_color: '#ffffff' });
        
        setOpenDialog(true);
    };

    const handleOpenEditDialog = (bp: BusinessPartner) => {
        setEditingBp(bp); setFormName(bp.name); setFormSlug(bp.slug || ''); setFormDashboardTitle(bp.dashboard_title || ''); setFormAddress(bp.address || '');
        setFormEmail(bp.email || ''); setFormLogoUrl(bp.logo_url || ''); setFormSubscriptionStartDate(bp.subscription_start_date ? bp.subscription_start_date.split('T')[0] : '');
        setFormSubscriptionEndDate(bp.subscription_end_date ? bp.subscription_end_date.split('T')[0] : ''); setFormRegionIds(bp.regions.map(r => r.id));
        const defaultRegion = bp.regions.find(r => r.is_default); setFormDefaultRegionId(defaultRegion?.id || bp.regions[0]?.id || null);
        setFormIsActive(bp.is_active); setFormUrlBusinessPartner(bp.url_businesspartner || ''); setFormLevel1Name(bp.level_1_name || '');
        setFormLevel2Name(bp.level_2_name || ''); setFormLevel3Name(bp.level_3_name || ''); setFormStorageTier(bp.storage_tier || 'free');
        setFormAllowNewsletter(bp.allow_automated_newsletter); setFormIndustryIds(bp.industries.map(ind => ind.id));
        const enabledModules = bp.enabled_modules?.length ? bp.enabled_modules : ['content'];
        setFormEnabledModules(enabledModules);
        setFormDefaultWorkspace(enabledModules.includes(bp.default_workspace) ? bp.default_workspace : enabledModules[0]);
        setFormSalesPlan(bp.sales_plan || 'basic');
        setFormSalesSubscriptionStatus(bp.sales_subscription_status || 'active');
        setFormSalesTrialEndsOn(bp.sales_trial_ends_on ? bp.sales_trial_ends_on.split('T')[0] : '');
        setFormSalesMonthlyPrice(bp.sales_monthly_price_eur == null ? '' : String(bp.sales_monthly_price_eur));
        setFormSalesBillingCycle(bp.sales_billing_cycle || 'monthly');
        setFormNewsletterDeliveryMode(bp.newsletter_delivery_mode || 'mobiliti');
        setFormNewsletterExportEmail(bp.newsletter_export_email || '');
        setFormNewsletterExternalUrl(bp.newsletter_external_signup_url || '');
        setFormNewsletterRecipientLimit(Number(bp.newsletter_recipient_limit) || 250);
        
        // Farben setzen
        if (bp.color_scheme_id) {
            const existingScheme = colorSchemes.find(cs => cs.id === bp.color_scheme_id);
            if (existingScheme && existingScheme.name.startsWith('Custom -')) {
                setFormColorMode('custom');
                setFormCustomColors({
                    primary_color: existingScheme.primary_color || '#2196f3',
                    secondary_color: existingScheme.secondary_color || '#ff9800',
                    background_color_light: existingScheme.background_color_light || '#f4f6f8',
                    paper_color_light: existingScheme.paper_color_light || '#ffffff',
                    text_color_light: existingScheme.text_color_light || '#333333',
                    primary_text_color: existingScheme.primary_text_color || '#ffffff'
                });
            } else {
                setFormColorMode('select');
                setFormColorSchemeId(bp.color_scheme_id);
                // Lade trotzdem die Farben in den Custom-State, falls der User auf "Individuell" wechselt
                if (existingScheme) {
                    setFormCustomColors({
                        primary_color: existingScheme.primary_color, secondary_color: existingScheme.secondary_color,
                        background_color_light: existingScheme.background_color_light, paper_color_light: existingScheme.paper_color_light,
                        text_color_light: existingScheme.text_color_light, primary_text_color: existingScheme.primary_text_color || '#ffffff'
                    });
                }
            }
        } else {
            setFormColorMode('select'); setFormColorSchemeId('');
        }
        
        setOpenDialog(true);
    };

    const handleCloseDialog = () => { setOpenDialog(false); setEditingBp(null); setError(null); };

    const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        setIsUploadingLogo(true); setError(null); const formData = new FormData(); formData.append('logo', file);
        try {
            const token = 'cookie-session';
            const response = await apiClient.post('/api/admin/business-partners/logo-upload', formData, { headers: { 'x-auth-token': token } });
            setFormLogoUrl(response.data.url);
        } catch (err: any) { setError(err.response?.data?.message || 'Fehler beim Logo-Upload.'); } 
        finally { setIsUploadingLogo(false); }
    };

    const handleSubmit = async () => {
        const token = 'cookie-session';
        const bpData = {
            name: formName, slug: formSlug || null, dashboard_title: formDashboardTitle || null, address: formAddress || null, email: formEmail || null,
            logo_url: formLogoUrl || null, subscription_start_date: formSubscriptionStartDate, subscription_end_date: formSubscriptionEndDate,
            region_ids: formRegionIds, default_region_id: formDefaultRegionId, is_active: formIsActive, url_businesspartner: formUrlBusinessPartner || null,
            level_1_name: formLevel1Name || null, level_2_name: formLevel2Name || null, level_3_name: formLevel3Name || null,
            storage_tier: formStorageTier, allow_automated_newsletter: formAllowNewsletter, category_ids: formIndustryIds,
            dashboard_focus: formDefaultWorkspace === 'sales' ? 'sales' : 'information',
            enabled_modules: formEnabledModules,
            default_workspace: formDefaultWorkspace,
            sales_plan: formSalesPlan,
            sales_subscription_status: formSalesSubscriptionStatus,
            sales_trial_ends_on: formSalesSubscriptionStatus === 'trial' ? formSalesTrialEndsOn : null,
            sales_monthly_price_eur: formSalesMonthlyPrice === '' ? null : Number(formSalesMonthlyPrice),
            sales_billing_cycle: formSalesBillingCycle,
            newsletter_delivery_mode: formNewsletterDeliveryMode,
            newsletter_export_email: formNewsletterExportEmail || null,
            newsletter_external_signup_url: formNewsletterExternalUrl || null,
            newsletter_recipient_limit: formNewsletterRecipientLimit,
            // NEU: Übermittlung der Farbdaten
            color_mode: formColorMode,
            color_scheme_id: formColorMode === 'select' ? (formColorSchemeId || null) : null,
            custom_colors: formColorMode === 'custom' ? formCustomColors : null
        };

        try {
            const response = editingBp
                ? await apiClient.put(`/api/admin/business-partners/${editingBp.id}`, bpData, { headers: { 'x-auth-token': token } })
                : await apiClient.post('/api/admin/business-partners', bpData, { headers: { 'x-auth-token': token } });
            if (!response.res.ok) throw new Error(response.data?.message || 'Fehler beim Speichern.');
            handleCloseDialog(); fetchData(); showSnackbar('Erfolgreich gespeichert', 'success');
        } catch (err: any) { setError(err.message || err.response?.data?.message || 'Fehler beim Speichern.'); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher?')) return;
        try {
            const token = 'cookie-session';
            await apiClient.delete(`/api/admin/business-partners/${id}`, { headers: { 'x-auth-token': token } });
            fetchData(); showSnackbar('Partner gelöscht', 'info');
        } catch (err: any) { alert(err.response?.data?.message || 'Fehler beim Löschen.'); }
    };

    const handleCopyPartnerLink = (bpId: string) => {
        const voucherCode = bpId.slice(-8); const link = `${window.location.origin}/register?partner=${voucherCode}`;
        navigator.clipboard.writeText(link).then(() => { showSnackbar('Registrierungs-Link kopiert!', 'success'); })
        .catch(() => { showSnackbar('Fehler beim Kopieren des Links.', 'error'); });
    };

    const getDaysRemaining = (endDateString: string | null) => {
        if (!endDateString) return { text: 'Unbefristet', color: 'text.secondary' };
        const diffDays = Math.ceil((new Date(endDateString).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return { text: `${diffDays} Tage`, color: 'error.main' };
        if (diffDays <= 30) return { text: `+${diffDays} Tage`, color: 'warning.main' };
        return { text: `+${diffDays} Tage`, color: 'success.main' };
    };

    const handleSortRequest = (property: keyof BusinessPartner) => {
        setOrder(orderBy === property && order === 'asc' ? 'desc' : 'asc'); setOrderBy(property);
    };

    const sortedAndFilteredPartners = useMemo(() => {
        let filtered = [...businessPartners];
        if (statusFilter !== 'all') filtered = filtered.filter(bp => bp.is_active === (statusFilter === 'active'));
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(bp => bp.name.toLowerCase().includes(lower) || (bp.address?.toLowerCase() || '').includes(lower) || (bp.email?.toLowerCase() || '').includes(lower));
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [businessPartners, searchTerm, order, orderBy, statusFilter]);

    return (
        <DashboardLayout>
            <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Business Partner</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }} />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Hinzufügen</Button>
                    </Box>
                </Box>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tabs value={statusFilter} onChange={(_, val) => setStatusFilter(val)}>
                        <Tab label={`Alle (${businessPartners.length})`} value="all" />
                        <Tab label={`Aktiv (${businessPartners.filter(bp => bp.is_active).length})`} value="active" />
                        <Tab label={`Inaktiv (${businessPartners.filter(bp => !bp.is_active).length})`} value="inactive" />
                    </Tabs>
                </Box>

                {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
                : error ? <Alert severity="error">{error}</Alert>
                : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Logo</TableCell>
                                        <TableCell sortDirection={orderBy === 'name' ? order : false} sx={{ width: '20%' }}><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Name</TableSortLabel></TableCell>
                                        <TableCell>Regionen</TableCell>
                                        <TableCell sx={{ width: '20%' }}>Speicher</TableCell>
                                        <TableCell sortDirection={orderBy === 'subscription_end_date' ? order : false}><TableSortLabel active={orderBy === 'subscription_end_date'} direction={order} onClick={() => handleSortRequest('subscription_end_date')}>Abo</TableSortLabel></TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'user_count' ? order : false}><TableSortLabel active={orderBy === 'user_count'} direction={order} onClick={() => handleSortRequest('user_count')}>Nutzer</TableSortLabel></TableCell>
                                        <TableCell align="center">Accounts</TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'widget_count' ? order : false}><TableSortLabel active={orderBy === 'widget_count'} direction={order} onClick={() => handleSortRequest('widget_count')}>Widgets</TableSortLabel></TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredPartners.map((bp) => {
                                        const usagePercent = Number(bp.storage_limit_bytes) > 0 ? (Number(bp.storage_usage_bytes) / Number(bp.storage_limit_bytes)) * 100 : 0;
                                        return (
                                            <TableRow key={bp.id} hover sx={{ '& > *': { verticalAlign: 'top' } }}>
                                                <TableCell sx={{ p: 1 }}><img src={bp.logo_url || 'https://placehold.co/60x40/eee/ccc?text=Logo'} alt="Logo" style={{ height: '40px', width: '60px', objectFit: 'contain', borderRadius: '4px' }} /></TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                        <MuiTooltip title={bp.allow_automated_newsletter ? "Newsletter erlaubt" : "Newsletter nicht erlaubt"}><Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: bp.allow_automated_newsletter ? 'success.main' : 'error.main', mr: 1.5, flexShrink: 0 }} /></MuiTooltip>
                                                        <Box>
                                                            <Typography component="span" sx={{ fontWeight: 'bold' }}>{bp.name}</Typography>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                                <Typography variant="body2" color="text.secondary" component="span" sx={{ fontFamily: 'monospace' }}>...<Box component="span" sx={{ color: 'primary.main', fontWeight: 'bold' }}>{bp.id.slice(-8)}</Box></Typography>
                                                                <MuiTooltip title="Registrierungs-Link kopieren"><IconButton size="small" onClick={() => handleCopyPartnerLink(bp.id)} sx={{ padding: '2px' }}><LinkIcon fontSize="small" /></IconButton></MuiTooltip>
                                                                <MuiTooltip title="Einladungskarte öffnen (QR-Code)"><IconButton size="small" onClick={() => window.open(`/invite/${bp.id}`, '_blank')} sx={{ padding: '2px', ml: 0.5 }}><QrCodeIcon fontSize="small" /></IconButton></MuiTooltip>
                                                            </Box>
                                                            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.7rem', mt: 0.2 }}>{bp.id}</Typography>
                                                            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                                                                {(bp.enabled_modules || ['content']).includes('content') && (
                                                                    <Chip
                                                                        size="small"
                                                                        variant={bp.storage_tier === 'premium' ? 'filled' : 'outlined'}
                                                                        color={bp.storage_tier === 'premium' ? 'success' : bp.storage_tier === 'standard' ? 'info' : 'default'}
                                                                        label={`Content · ${CONTENT_STORAGE_PACKAGES[bp.storage_tier]?.shortLabel || bp.storage_tier}`}
                                                                        sx={{ fontWeight: 850 }}
                                                                    />
                                                                )}
                                                                {bp.enabled_modules?.includes('sales') && (
                                                                    <Chip
                                                                        size="small"
                                                                        color={bp.sales_plan === 'premium' ? 'success' : 'primary'}
                                                                        variant={bp.sales_plan === 'premium' ? 'filled' : 'outlined'}
                                                                        label={`Sales · ${bp.sales_plan === 'premium' ? 'Premium' : 'Basic'}`}
                                                                        sx={{ fontWeight: 850 }}
                                                                    />
                                                                )}
                                                                {bp.enabled_modules?.includes('sales') && (
                                                                    <Chip
                                                                        size="small"
                                                                        color={bp.sales_access_active ? (bp.sales_subscription_status === 'trial' ? 'warning' : 'success') : 'error'}
                                                                        variant="outlined"
                                                                        label={bp.sales_subscription_status === 'trial'
                                                                            ? (bp.sales_access_active ? `Test · ${bp.sales_trial_days_remaining ?? 0} Tage` : 'Test abgelaufen')
                                                                            : bp.sales_subscription_status === 'paused' ? 'Pausiert' : 'Aktiv'}
                                                                    />
                                                                )}
                                                            </Stack>
                                                        </Box>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    {bp.regions.find(r => r.is_default) && <Chip label={bp.regions.find(r => r.is_default)?.name} size="small" sx={{ fontWeight: 'bold' }} />}
                                                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>{bp.regions.length > 1 ? `+${bp.regions.length - 1} weitere` : (bp.regions.length === 0 ? 'Keine' : '')}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {(bp.enabled_modules?.length ? bp.enabled_modules : ['content']).includes('content') ? (
                                                        <>
                                                            <Chip label={`Content ${CONTENT_STORAGE_PACKAGES[bp.storage_tier]?.shortLabel || bp.storage_tier}`} size="small" variant="outlined" />
                                                            <Box sx={{ mt: 1 }}>
                                                                <LinearProgress variant="determinate" value={usagePercent} sx={{ height: 8, borderRadius: 4, mb: 0.5 }} />
                                                                <Typography variant="caption" color="text.secondary">{`${formatFileSize(bp.storage_usage_bytes)} / ${formatFileSize(bp.storage_limit_bytes)}`}</Typography>
                                                            </Box>
                                                        </>
                                                    ) : (
                                                        <Chip label="Kein Content-Modul" size="small" variant="outlined" color="default" />
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" display="block">{bp.subscription_end_date ? new Date(bp.subscription_end_date).toLocaleDateString('de-DE') : 'N/A'}</Typography>
                                                    <Typography variant="body2" display="block" sx={{ color: getDaysRemaining(bp.subscription_end_date).color, fontWeight: 'bold' }}>{getDaysRemaining(bp.subscription_end_date).text}</Typography>
                                                </TableCell>
                                                <TableCell align="center"><IconButton color="info" onClick={() => navigate(`/admin/users/${bp.id}`)}><GroupIcon /> {bp.user_count}</IconButton></TableCell>
                                                <TableCell align="center"><IconButton color="primary" disabled={!bp.enabled_modules?.includes('sales')} onClick={() => navigate(`/admin/business-partners/${bp.id}/accounts`)}><SwitchAccountIcon /> {bp.account_count}</IconButton></TableCell>
                                                <TableCell align="center"><IconButton color="secondary" onClick={() => navigate(`/admin/bp-widget-access/${bp.id}`)}><WidgetsIcon /> {bp.widget_count}</IconButton></TableCell>
                                                <TableCell>
                                                    <MuiTooltip title="Bearbeiten"><IconButton color="primary" onClick={() => handleOpenEditDialog(bp)}><EditIcon /></IconButton></MuiTooltip>
                                                    <MuiTooltip title="Löschen"><IconButton color="error" onClick={() => handleDelete(bp.id)}><DeleteIcon /></IconButton></MuiTooltip>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
                
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingBp ? 'Business Partner bearbeiten' : 'Neuen Business Partner hinzufügen'}</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
<Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12}>
                                <Typography variant="h6">Stammdaten &amp; Auftritt</Typography>
                                <Typography variant="body2" color="text.secondary">Öffentliche Angaben, Logo und Bezeichnungen des Mandanten.</Typography>
                            </Grid>
                            <Grid item xs={12} sm={7}><TextField label="Name" fullWidth value={formName} onChange={(e) => setFormName(e.target.value)} required /></Grid>
                            <Grid item xs={12} sm={5}>
                                <TextField 
                                    label="Kürzel (Slug)" 
                                    fullWidth 
                                    value={formSlug} 
                                    onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} 
                                    helperText="z.B. vfa" 
                                />
                            </Grid>
                            <Grid item xs={12}><TextField label="Dashboard-Titel" fullWidth value={formDashboardTitle} onChange={(e) => setFormDashboardTitle(e.target.value)} helperText="Dieser Titel wird im Dashboard angezeigt." /></Grid>
                            <Grid item xs={12}><TextField label="Adresse" fullWidth value={formAddress} onChange={(e) => setFormAddress(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="E-Mail" type="email" fullWidth value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Homepage URL" type="url" fullWidth value={formUrlBusinessPartner} onChange={(e) => setFormUrlBusinessPartner(e.target.value)} /></Grid>
                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <TextField label="Logo URL" fullWidth value={formLogoUrl} onChange={(e) => setFormLogoUrl(e.target.value)} InputProps={{ endAdornment: formLogoUrl && (<InputAdornment position="end"><img src={formLogoUrl} alt="Logo" style={{ height: '25px', borderRadius: '4px' }} /></InputAdornment>) }} />
                                    <Button component="label" variant="outlined" startIcon={isUploadingLogo ? <CircularProgress size={20} /> : <UploadIcon />} disabled={isUploadingLogo}>Upload<input type="file" hidden accept="image/*" onChange={handleLogoUpload} /></Button>
                                </Box>
                            </Grid>
                            
                            <Grid item xs={12}>
                                <Divider sx={{ mt: 1, mb: 2 }} />
                                <Typography variant="h6">Mitgliedschaft &amp; Branchen</Typography>
                                <Typography variant="body2" color="text.secondary">Bezeichnungen der Mitgliedsstufen und fachliche Zuordnung des Mandanten.</Typography>
                            </Grid>
                            <Grid item xs={12}><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Mitgliedslevel-Bezeichnungen</Typography></Grid>
                            <Grid item xs={12} sm={4}><TextField label="Level 1 Name" fullWidth value={formLevel1Name} onChange={(e) => setFormLevel1Name(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={4}><TextField label="Level 2 Name" fullWidth value={formLevel2Name} onChange={(e) => setFormLevel2Name(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={4}><TextField label="Level 3 Name" fullWidth value={formLevel3Name} onChange={(e) => setFormLevel3Name(e.target.value)} /></Grid>
                            
                            <Grid item xs={12}>
                                <Autocomplete multiple options={allIndustries} getOptionLabel={(option) => option.name} value={allIndustries.filter(ind => formIndustryIds.includes(ind.id))} onChange={(_, newValue) => { setFormIndustryIds(newValue.map(v => v.id)); }} isOptionEqualToValue={(option, value) => option.id === value.id} renderInput={(params) => <TextField {...params} label="Branchen" placeholder="Branchen auswählen" />} />
                            </Grid>
                            <Grid item xs={12}>
                                <Divider sx={{ mt: 1, mb: 2 }} />
                                <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2 }}>
                                    <Typography variant="h6">Produkte &amp; Arbeitsbereiche</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Content-Paket und Sales-Paket werden unabhängig voneinander verwaltet.
                                    </Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="subtitle2" sx={{ mb: 0.7, fontWeight: 800 }}>Gebuchte Arbeitsbereiche</Typography>
                                            <ToggleButtonGroup
                                                value={formEnabledModules}
                                                onChange={(_, value: Array<'content' | 'sales'>) => {
                                                    if (!value.length) return;
                                                    setFormEnabledModules(value);
                                                    if (!value.includes(formDefaultWorkspace)) setFormDefaultWorkspace(value[0]);
                                                }}
                                                size="small"
                                                fullWidth
                                            >
                                                <ToggleButton value="content">Content</ToggleButton>
                                                <ToggleButton value="sales">Sales</ToggleButton>
                                            </ToggleButtonGroup>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField select label="Standard-Arbeitsbereich" fullWidth value={formDefaultWorkspace} onChange={(e) => {
                                                const workspace = e.target.value as 'content' | 'sales';
                                                setFormDefaultWorkspace(workspace);
                                            }} helperText="Startseite für neue und noch nicht konfigurierte Nutzer.">
                                                {formEnabledModules.includes('content') && <MenuItem value="content">Content-Dashboard</MenuItem>}
                                                {formEnabledModules.includes('sales') && <MenuItem value="sales">Account-Radar</MenuItem>}
                                            </TextField>
                                        </Grid>

                                        {formEnabledModules.includes('content') && (
                                            <>
                                                <Grid item xs={12}>
                                                    <Divider sx={{ my: 0.5 }} />
                                                    <Typography variant="subtitle1" sx={{ mt: 1.5, fontWeight: 900 }}>Content-Paket &amp; Cloud-Speicher</Typography>
                                                    <Typography variant="body2" color="text.secondary">Das Paket bestimmt den Speicher für hochgeladene Mandantendateien.</Typography>
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        select
                                                        label="Content-Paket"
                                                        fullWidth
                                                        value={formStorageTier}
                                                        onChange={(e) => setFormStorageTier(e.target.value as StorageTier)}
                                                        helperText={editingBp ? `Aktuell belegt: ${formatFileSize(editingBp.storage_usage_bytes)}` : 'Die Paketgrenze wird beim Speichern automatisch gesetzt.'}
                                                    >
                                                        {(Object.entries(CONTENT_STORAGE_PACKAGES) as Array<[StorageTier, typeof CONTENT_STORAGE_PACKAGES[StorageTier]]>).map(([tier, definition]) => (
                                                            <MenuItem key={tier} value={tier}>{definition.label} · {definition.limitLabel}</MenuItem>
                                                        ))}
                                                    </TextField>
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <Alert severity={formStorageTier === 'free' ? 'warning' : 'info'} sx={{ height: '100%', alignItems: 'center' }}>
                                                        {formStorageTier === 'free'
                                                            ? 'Dateiverwaltung aktiv, aber ohne Speicher für neue Uploads.'
                                                            : `${CONTENT_STORAGE_PACKAGES[formStorageTier].label}: ${CONTENT_STORAGE_PACKAGES[formStorageTier].limitLabel} Cloud-Speicher.`}
                                                    </Alert>
                                                </Grid>
                                            </>
                                        )}

                                        {formEnabledModules.includes('sales') && (
                                            <>
                                                <Grid item xs={12}>
                                                    <Divider sx={{ my: 0.5 }} />
                                                    <Typography variant="subtitle1" sx={{ mt: 1.5, fontWeight: 900 }}>Sales-Paket &amp; Zugriff</Typography>
                                                    <Alert severity={formSalesSubscriptionStatus === 'paused' ? 'warning' : 'info'} sx={{ mt: 1 }}>
                                                        Paket, Testphase und Aktivierung werden durch den Mobiliti-Admin gesteuert. Ein Interessent erhält durch das Anfrageformular noch keinen automatischen Zugang.
                                                    </Alert>
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        select
                                                        label="Sales-Paket"
                                                        fullWidth
                                                        value={formSalesPlan}
                                                        onChange={(e) => setFormSalesPlan(e.target.value as 'basic' | 'premium')}
                                                        helperText={formSalesPlan === 'premium'
                                                            ? '5.000 Accounts, 25 Report-Empfänger, Import, täglicher Radar, Wettbewerber, Analytics, Management-PDF und API (5 Tokens).'
                                                            : '250 Accounts, 3 Report-Empfänger, wöchentlicher Radar, Workflows, CSV-Export und Datenqualitätsprüfung.'}
                                                    >
                                                        <MenuItem value="basic">Sales Basic</MenuItem>
                                                        <MenuItem value="premium">Sales Premium</MenuItem>
                                                    </TextField>
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        select
                                                        label="Sales-Status"
                                                        fullWidth
                                                        value={formSalesSubscriptionStatus}
                                                        onChange={(e) => {
                                                            const status = e.target.value as 'active' | 'trial' | 'paused';
                                                            setFormSalesSubscriptionStatus(status);
                                                            if (status === 'trial' && !formSalesTrialEndsOn) setFormSalesTrialEndsOn(getDefaultSalesTrialEnd());
                                                        }}
                                                        helperText={formSalesSubscriptionStatus === 'active' ? 'Paket ist freigeschaltet.' : formSalesSubscriptionStatus === 'trial' ? 'Zugriff bis einschließlich Enddatum.' : 'Sales-Zugriff gesperrt; Daten bleiben erhalten.'}
                                                    >
                                                        <MenuItem value="active">Aktiv</MenuItem>
                                                        <MenuItem value="trial">Testphase</MenuItem>
                                                        <MenuItem value="paused">Pausiert</MenuItem>
                                                    </TextField>
                                                </Grid>
                                                {formSalesSubscriptionStatus === 'trial' && (
                                                    <Grid item xs={12} sm={4}>
                                                        <TextField
                                                            label="Testphase endet am"
                                                            type="date"
                                                            fullWidth
                                                            required
                                                            InputLabelProps={{ shrink: true }}
                                                            value={formSalesTrialEndsOn}
                                                            onChange={(e) => setFormSalesTrialEndsOn(e.target.value)}
                                                            helperText="Der Zugriff endet automatisch nach diesem Tag."
                                                        />
                                                    </Grid>
                                                )}
                                                <Grid item xs={12} sm={formSalesSubscriptionStatus === 'trial' ? 4 : 6}>
                                                    <TextField
                                                        label="Vereinbarter Preis"
                                                        type="number"
                                                        fullWidth
                                                        value={formSalesMonthlyPrice}
                                                        onChange={(e) => setFormSalesMonthlyPrice(e.target.value)}
                                                        inputProps={{ min: 0, step: '0.01' }}
                                                        InputProps={{ endAdornment: <InputAdornment position="end">€</InputAdornment> }}
                                                        helperText="Optional, nur intern."
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={formSalesSubscriptionStatus === 'trial' ? 4 : 6}>
                                                    <TextField select label="Abrechnung" fullWidth value={formSalesBillingCycle} onChange={(e) => setFormSalesBillingCycle(e.target.value as 'monthly' | 'annual')} helperText="Vereinbarter Zyklus.">
                                                        <MenuItem value="monthly">Monatlich</MenuItem>
                                                        <MenuItem value="annual">Jährlich</MenuItem>
                                                    </TextField>
                                                </Grid>
                                            </>
                                        )}
                                    </Grid>
                                </Paper>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="h6" sx={{ mt: 1 }}>Vertrag &amp; Betrieb</Typography>
                                <Typography variant="body2" color="text.secondary">Regionen, Laufzeit und aktive Dienste.</Typography>
                            </Grid>
                            <Grid item xs={12}><TextField select label="Regionen" fullWidth value={formRegionIds} onChange={(e) => setFormRegionIds(e.target.value as unknown as string[])} SelectProps={{ multiple: true, renderValue: (selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(selected as string[]).map(id => <Chip key={id} size="small" label={regions.find(r => r.id === id)?.name} />)}</Box>) }} > {regions.map((r) => (<MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>))} </TextField></Grid>
                            <Grid item xs={12}><TextField select label="Standard-Region" fullWidth value={formDefaultRegionId || ''} onChange={(e) => setFormDefaultRegionId(e.target.value)} disabled={formRegionIds.length === 0} helperText="Diese Region wird als Voreinstellung in den Widgets verwendet." > <MenuItem value=""><em>Keine</em></MenuItem> {regions.filter(r => formRegionIds.includes(r.id)).map((r) => (<MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>))} </TextField></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Abo Startdatum" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formSubscriptionStartDate} onChange={(e) => setFormSubscriptionStartDate(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Abo Enddatum" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formSubscriptionEndDate} onChange={(e) => setFormSubscriptionEndDate(e.target.value)} /></Grid>
                            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} color="primary" />} label="Partner-Account aktiv" /></Grid>
                            <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={formAllowNewsletter} onChange={(e) => setFormAllowNewsletter(e.target.checked)} color="primary" />} label="Automatisierte Newsletter erlaubt" /></Grid>

                            <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="h6" sx={{ mb: 1 }}>Newsletter-Versand</Typography>
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    Mobiliti versendet direkt bis zum festgelegten Limit. Export sendet ein fertiges HTML-Paket nur an die zentrale Adresse. Extern übergibt Anmeldung und Versand vollständig an das Newsletter-System des Mandanten.
                                </Alert>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField select fullWidth label="Versandmodus" value={formNewsletterDeliveryMode} onChange={(e) => setFormNewsletterDeliveryMode(e.target.value as 'mobiliti' | 'export' | 'external')}>
                                    <MenuItem value="mobiliti">Direkt über Mobiliti</MenuItem>
                                    <MenuItem value="export">Export an Mandantenadresse</MenuItem>
                                    <MenuItem value="external">Externes Newsletter-System</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="number" label="Max. direkte Empfänger" value={formNewsletterRecipientLimit} onChange={(e) => setFormNewsletterRecipientLimit(Math.max(1, Number(e.target.value) || 250))} inputProps={{ min: 1, max: 100000 }} disabled={formNewsletterDeliveryMode !== 'mobiliti'} helperText="Empfehlung: höchstens 250; darüber automatischer Export." />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="email" label="Zentrale Newsletter-Adresse" value={formNewsletterExportEmail} onChange={(e) => setFormNewsletterExportEmail(e.target.value)} helperText="Für Export und als sichere Rückfalladresse." />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth type="url" label="Externe Newsletter-Anmeldung" value={formNewsletterExternalUrl} onChange={(e) => setFormNewsletterExternalUrl(e.target.value)} required={formNewsletterDeliveryMode === 'external'} disabled={formNewsletterDeliveryMode !== 'external'} placeholder="https://…" />
                            </Grid>

                            {/* --- NEUER BEREICH: BRANDING & FARBSCHEMA --- */}
                            <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PaletteIcon color="primary" /> Branding & Farbschema
                                </Typography>
                                
                                <ToggleButtonGroup
                                    color="primary"
                                    value={formColorMode}
                                    exclusive
                                    onChange={(_, newMode) => { if (newMode) setFormColorMode(newMode); }}
                                    fullWidth
                                    sx={{ mb: 3 }}
                                >
                                    <ToggleButton value="select"><ColorLensIcon sx={{ mr: 1 }}/> Vordefiniertes Schema</ToggleButton>
                                    <ToggleButton value="custom"><PaletteIcon sx={{ mr: 1 }}/> Individuelles Branding</ToggleButton>
                                </ToggleButtonGroup>

                                {formColorMode === 'select' ? (
                                    <TextField select label="Farbschema auswählen" fullWidth value={formColorSchemeId} onChange={(e) => setFormColorSchemeId(e.target.value)}>
                                        <MenuItem value=""><em>Kein Farbschema (Standard nutzen)</em></MenuItem>
                                        {colorSchemes.filter(cs => !cs.name.startsWith('Custom -')).map((cs) => (
                                            <MenuItem key={cs.id} value={cs.id}>
                                                {cs.name} <Box sx={{ width: 20, height: 20, bgcolor: cs.primary_color, border: '1px solid grey', ml: 1, display: 'inline-block', verticalAlign: 'middle' }} />
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                ) : (
                                    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.default' }}>
                                        <Grid container spacing={3}>
                                            {/* Linke Seite: Farbauswahl */}
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Hauptfarben (Branding)</Typography>
                                                <Stack spacing={2} sx={{ mb: 3 }}>
                                                    <ColorPickerInput label="Primärfarbe (Buttons, Header)" value={formCustomColors.primary_color} onChange={(val) => setFormCustomColors(p => ({ ...p, primary_color: val }))} />
                                                    <ColorPickerInput label="Sekundärfarbe (Highlights)" value={formCustomColors.secondary_color} onChange={(val) => setFormCustomColors(p => ({ ...p, secondary_color: val }))} />
                                                    <ColorPickerInput label="Textfarbe auf Primärfarbe (z.B. Button-Text)" value={formCustomColors.primary_text_color} onChange={(val) => setFormCustomColors(p => ({ ...p, primary_text_color: val }))} />
                                                </Stack>

                                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Hintergründe & Text</Typography>
                                                <Stack spacing={2}>
                                                    <ColorPickerInput label="Seiten-Hintergrund" value={formCustomColors.background_color_light} onChange={(val) => setFormCustomColors(p => ({ ...p, background_color_light: val }))} />
                                                    <ColorPickerInput label="Karten-Hintergrund (Widgets)" value={formCustomColors.paper_color_light} onChange={(val) => setFormCustomColors(p => ({ ...p, paper_color_light: val }))} />
                                                    <ColorPickerInput label="Allgemeine Textfarbe" value={formCustomColors.text_color_light} onChange={(val) => setFormCustomColors(p => ({ ...p, text_color_light: val }))} />
                                                </Stack>
                                            </Grid>

                                            {/* Rechte Seite: Live Preview */}
                                            <Grid item xs={12} md={6}>
                                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', textAlign: 'center' }}>Live Vorschau</Typography>
                                                <Box sx={{ 
                                                    p: 3, 
                                                    borderRadius: 2, 
                                                    bgcolor: formCustomColors.background_color_light,
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    height: '100%',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 2
                                                }}>
                                                    {/* Fake Widget */}
                                                    <Paper elevation={3} sx={{ 
                                                        p: 3, 
                                                        bgcolor: formCustomColors.paper_color_light, 
                                                        color: formCustomColors.text_color_light,
                                                        borderRadius: 3
                                                    }}>
                                                        <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2, color: formCustomColors.text_color_light }}>
                                                            {formDashboardTitle || formName || 'Mein Dashboard'}
                                                        </Typography>
                                                        <Typography variant="body2" sx={{ mb: 3, opacity: 0.8 }}>
                                                            So wird das Dashboard mit diesen Farben für die Kunden aussehen.
                                                        </Typography>
                                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                                            <Button variant="contained" sx={{ bgcolor: formCustomColors.primary_color, color: formCustomColors.primary_text_color, '&:hover': { bgcolor: formCustomColors.primary_color, opacity: 0.9 } }}>
                                                                Primär
                                                            </Button>
                                                            <Button variant="outlined" sx={{ borderColor: formCustomColors.secondary_color, color: formCustomColors.secondary_color, '&:hover': { borderColor: formCustomColors.secondary_color, bgcolor: formCustomColors.secondary_color + '10' } }}>
                                                                Sekundär
                                                            </Button>
                                                        </Box>
                                                    </Paper>
                                                </Box>
                                            </Grid>
                                        </Grid>
                                    </Box>
                                )}
                            </Grid>

                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog} color="secondary">Abbrechen</Button>
                        <Button onClick={handleSubmit} color="primary" disabled={loading}>{editingBp ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminBusinessPartnersPage;
