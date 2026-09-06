// frontend/src/pages/AdminBpAccountsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, Chip, Grid, Breadcrumbs, Link as MuiLink, Stack, Avatar
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import AccountDetailDialog, { AccountDetailRecord } from '../components/AccountDetailDialog';
import { resolveAssetUrl } from '../utils/assetUrl';

const DEFAULT_ACCOUNT_LOGO = '/logos/default-company.svg';

// --- Interfaces ---
interface Region { id: string; name: string; }
interface Category { id: string; name: string; }
interface Account {
    id: string;
    business_partner_id: string;
    name: string;
    website_url: string | null;
    linkedin_url: string | null;
    logo_url: string | null;
    logo_source?: string | null;
    address: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    owner_user_id: string | null;
    owner_user_name?: string | null;
    owner_user_email?: string | null;
    owner_profile_image_url?: string | null;
    status: 'prospect' | 'active_customer' | 'churned';
    notes: string | null;
    competitor_count: string | number;
    contact_count: string | number;
    competitors: Array<{ id: string; name: string; website_url?: string | null; linkedin_url?: string | null; notes?: string | null }>;
    regions: Region[];
    categories: Category[];
}
interface BusinessPartner { id: string; name: string; sales_plan?: 'basic' | 'premium'; }
interface LogoLibraryItem { url: string; label: string; source: string; }
interface AccountTeamMember { id: string; name: string; email?: string | null; role: string; profile_image_url?: string | null; }

// --- Helper Functions & Objects ---
const statusMapping = {
    prospect: 'Interessent',
    active_customer: 'Aktiv',
    churned: 'Abgewandert'
};

const safeWebUrl = (value?: string | null) => {
    try {
        const parsed = new URL(String(value || ''));
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
        return '';
    }
};

const formatAccountOwner = (name?: string | null, email?: string | null) => {
    if (!name) return '';
    return email ? `${name} (${email})` : name;
};

type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    let valA = a[orderBy];
    let valB = b[orderBy];

    if (orderBy === 'competitor_count' || orderBy === 'contact_count') {
        valA = parseInt(valA as string || '0', 10) as any;
        valB = parseInt(valB as string || '0', 10) as any;
    } else if (orderBy === 'regions' || orderBy === 'categories') {
        valA = (valA as any[]).length as any;
        valB = (valB as any[]).length as any;
    }

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

const AdminBpAccountsPage: React.FC = () => {
    const { bpId } = useParams<{ bpId: string }>();
    const navigate = useNavigate();
    const { user, businessPartner: authenticatedBusinessPartner } = useAuth();
    const isTenantScoped = user?.role !== 'admin';
    const effectiveBpId = isTenantScoped ? user?.business_partner_id : bpId;

    const [businessPartner, setBusinessPartner] = useState<BusinessPartner | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [allRegions, setAllRegions] = useState<Region[]>([]);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [accountTeam, setAccountTeam] = useState<AccountTeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Account>('name');

    // Form states
    const [formName, setFormName] = useState('');
    const [formWebsite, setFormWebsite] = useState('');
    const [formLinkedinUrl, setFormLinkedinUrl] = useState('');
    const [formLogoUrl, setFormLogoUrl] = useState('');
    const [formAddress, setFormAddress] = useState('');
    const [formContactEmail, setFormContactEmail] = useState('');
    const [formContactPhone, setFormContactPhone] = useState('');
    const [formOwnerUserId, setFormOwnerUserId] = useState('');
    const [formStatus, setFormStatus] = useState<'prospect' | 'active_customer' | 'churned'>('prospect');
    const [formRegionIds, setFormRegionIds] = useState<string[]>([]);
    const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
    const [formNotes, setFormNotes] = useState('');
    const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [logoLibraryOpen, setLogoLibraryOpen] = useState(false);
    const [logoLibrary, setLogoLibrary] = useState<LogoLibraryItem[]>([]);
    const [logoLibrarySearch, setLogoLibrarySearch] = useState('');
    const [logoLibraryLoading, setLogoLibraryLoading] = useState(false);
    const [logoLibraryError, setLogoLibraryError] = useState<string | null>(null);

    const fetchData = async () => {
        if (!effectiveBpId) {
            setLoading(false);
            setError('Diesem Benutzer ist kein Mandant zugeordnet.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [accountsRes, regionsRes, categoriesRes, teamRes] = await Promise.all([
                apiClient.get(`/api/admin/accounts/for-bp/${effectiveBpId}`),
                apiClient.get('/api/data/regions'),
                apiClient.get('/api/admin/accounts/all-categories'),
                apiClient.get(`/api/admin/accounts/for-bp/${effectiveBpId}/team`)
            ]);
            if (isTenantScoped) {
                setBusinessPartner(authenticatedBusinessPartner
                    ? { id: authenticatedBusinessPartner.id, name: authenticatedBusinessPartner.name, sales_plan: authenticatedBusinessPartner.sales_plan }
                    : { id: effectiveBpId, name: user?.business_partner_name || 'Eigener Mandant', sales_plan: user?.tenant_sales_plan });
            } else {
                const bpRes = await apiClient.get(`/api/admin/business-partners/${effectiveBpId}`);
                setBusinessPartner(bpRes.data);
            }
            if (!accountsRes.res.ok) throw new Error((accountsRes.data as any)?.message || 'Accounts konnten nicht geladen werden.');
            if (!regionsRes.res.ok) throw new Error((regionsRes.data as any)?.message || 'Regionen konnten nicht geladen werden.');
            if (!categoriesRes.res.ok) throw new Error((categoriesRes.data as any)?.message || 'Kategorien konnten nicht geladen werden.');
            setAccounts(Array.isArray(accountsRes.data) ? accountsRes.data : []);
            setAllRegions(Array.isArray(regionsRes.data) ? regionsRes.data : []);
            setAllCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
            if (teamRes.res.ok) setAccountTeam(Array.isArray(teamRes.data) ? teamRes.data : []);
        } catch (err: any) {
            setError(err?.message || err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isTenantScoped && effectiveBpId && bpId !== effectiveBpId) {
            navigate(`/admin/business-partners/${effectiveBpId}/accounts`, { replace: true });
            return;
        }
        fetchData();
    }, [bpId, effectiveBpId, isTenantScoped]);
    
    const handleOpenAddDialog = () => {
        setEditingAccount(null);
        setFormName('');
        setFormWebsite('');
        setFormLinkedinUrl('');
        setFormLogoUrl('');
        setFormAddress('');
        setFormContactEmail('');
        setFormContactPhone('');
        setFormOwnerUserId(user?.id || '');
        setFormStatus('prospect');
        setFormRegionIds([]);
        setFormCategoryIds([]);
        setFormNotes('');
        setOpenDialog(true);
    };

    const handleOpenEditDialog = (acc: Account) => {
        setEditingAccount(acc);
        setFormName(acc.name);
        setFormWebsite(acc.website_url || '');
        setFormLinkedinUrl(acc.linkedin_url || '');
        setFormLogoUrl(acc.logo_url || '');
        setFormAddress(acc.address || '');
        setFormContactEmail(acc.contact_email || '');
        setFormContactPhone(acc.contact_phone || '');
        setFormOwnerUserId(acc.owner_user_id || '');
        setFormStatus(acc.status);
        setFormRegionIds(acc.regions.map(r => r.id));
        setFormCategoryIds(acc.categories.map(c => c.id));
        setFormNotes(acc.notes || '');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingAccount(null);
        setError(null);
    };

    const handleSubmit = async () => {
        if (!effectiveBpId) return;
        const accountData = {
            name: formName,
            website_url: formWebsite,
            linkedin_url: formLinkedinUrl,
            logo_url: formLogoUrl,
            address: formAddress,
            contact_email: formContactEmail,
            contact_phone: formContactPhone,
            owner_user_id: formOwnerUserId || null,
            status: formStatus,
            region_ids: formRegionIds,
            category_ids: formCategoryIds,
            notes: formNotes,
        };
        try {
            if (editingAccount) {
                const response = await apiClient.put(`/api/admin/accounts/${editingAccount.id}`, accountData);
                if (!response.res.ok) throw new Error((response.data as any)?.message || 'Account konnte nicht gespeichert werden.');
            } else {
                const response = await apiClient.post(`/api/admin/accounts/for-bp/${effectiveBpId}`, accountData);
                if (!response.res.ok) throw new Error((response.data as any)?.message || 'Account konnte nicht gespeichert werden.');
            }
            handleCloseDialog();
            fetchData();
        } catch (err: any) {
            setError(err?.message || 'Fehler beim Speichern.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher? Dieser Account wird endgültig gelöscht.')) return;
        try {
            const response = await apiClient.delete(`/api/admin/accounts/${id}`);
            if (!response.res.ok) throw new Error((response.data as any)?.message || 'Account konnte nicht gelöscht werden.');
            fetchData();
        } catch (err: any) {
            alert(err?.message || 'Fehler beim Löschen.');
        }
    };

    const handleManageCompetitors = (accountId: string) => {
        navigate(`/admin/accounts/${accountId}/competitors`);
    };

    const filteredLogoLibrary = useMemo(() => {
        const search = logoLibrarySearch.trim().toLowerCase();
        return search
            ? logoLibrary.filter((item) => `${item.label} ${item.source} ${item.url}`.toLowerCase().includes(search))
            : logoLibrary;
    }, [logoLibrary, logoLibrarySearch]);

    const openLogoLibrary = async () => {
        if (!effectiveBpId) return;
        setLogoLibraryOpen(true);
        setLogoLibrarySearch('');
        setLogoLibraryLoading(true);
        setLogoLibraryError(null);
        try {
            const response = await apiClient.get('/api/admin/actions/software-logo/library', {
                params: { businessPartnerId: effectiveBpId },
            });
            if (!response.res.ok) throw new Error((response.data as any)?.message || 'Bestehende Logos konnten nicht geladen werden.');
            setLogoLibrary((response.data as any)?.items || []);
        } catch (err: any) {
            setLogoLibraryError(err?.message || 'Bestehende Logos konnten nicht geladen werden.');
        } finally {
            setLogoLibraryLoading(false);
        }
    };

    const uploadLogo = async (file?: File) => {
        if (!file || !effectiveBpId) return;
        if (file.size > 5 * 1024 * 1024) {
            setError('Das Logo darf maximal 5 MB groß sein.');
            return;
        }
        setUploadingLogo(true);
        setError(null);
        const payload = new FormData();
        payload.append('softwareLogo', file);
        payload.append('businessPartnerId', effectiveBpId);
        try {
            const response = await apiClient.post('/api/admin/actions/software-logo/upload', payload);
            if (!response.res.ok) throw new Error((response.data as any)?.message || 'Logo konnte nicht hochgeladen werden.');
            setFormLogoUrl((response.data as any)?.filePath || '');
        } catch (err: any) {
            setError(err?.message || 'Logo konnte nicht hochgeladen werden.');
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleSortRequest = (property: keyof Account) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredAccounts = useMemo(() => {
        let filtered = [...accounts];
        if (searchTerm) {
            const needle = searchTerm.toLowerCase();
            filtered = filtered.filter(acc => `${acc.name} ${acc.website_url || ''} ${(acc.competitors || []).map((item) => item.name).join(' ')}`.toLowerCase().includes(needle));
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [accounts, searchTerm, order, orderBy]);
    const accountLimit = businessPartner?.sales_plan === 'premium' ? 5000 : 250;
    const accountLimitReached = accounts.length >= accountLimit;

    return (
        <DashboardLayout>
            <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
                <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
                    <MuiLink component={RouterLink} underline="hover" color="inherit" to="/radar">Account-Radar</MuiLink>
                    {!isTenantScoped && <MuiLink component={RouterLink} underline="hover" color="inherit" to="/admin/business-partners">Mandanten</MuiLink>}
                    <Typography color="text.primary">{businessPartner?.name || '...'}</Typography>
                </Breadcrumbs>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1">Account Management</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" color="text.secondary">Mandant: {businessPartner?.name || 'wird geladen'}</Typography>
                            {businessPartner?.sales_plan && (
                                <Chip size="small" color={businessPartner.sales_plan === 'premium' ? 'success' : 'default'} label={`Sales ${businessPartner.sales_plan === 'premium' ? 'Premium' : 'Basic'} · ${accounts.length}/${businessPartner.sales_plan === 'premium' ? '5.000' : '250'} Accounts`} />
                            )}
                        </Stack>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }} />
                        <MuiTooltip title={accountLimitReached ? `Paketlimit von ${accountLimit.toLocaleString('de-DE')} Accounts erreicht.` : ''}>
                            <span><Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog} disabled={accountLimitReached}>Account hinzufügen</Button></span>
                        </MuiTooltip>
                    </Box>
                </Box>

                {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
                : error ? <Alert severity="error">{error}</Alert>
                : (
                    <Paper>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sortDirection={orderBy === 'name' ? order : false}><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Name</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'status' ? order : false}><TableSortLabel active={orderBy === 'status'} direction={order} onClick={() => handleSortRequest('status')}>Status</TableSortLabel></TableCell>
                                        <TableCell>Account-Verantwortung</TableCell>
                                        <TableCell sortDirection={orderBy === 'regions' ? order : false}><TableSortLabel active={orderBy === 'regions'} direction={order} onClick={() => handleSortRequest('regions')}>Regionen</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'categories' ? order : false}><TableSortLabel active={orderBy === 'categories'} direction={order} onClick={() => handleSortRequest('categories')}>Branchen</TableSortLabel></TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'contact_count' ? order : false}><TableSortLabel active={orderBy === 'contact_count'} direction={order} onClick={() => handleSortRequest('contact_count')}>Kontakte</TableSortLabel></TableCell>
                                        {businessPartner?.sales_plan === 'premium' && <TableCell align="center" sortDirection={orderBy === 'competitor_count' ? order : false}><TableSortLabel active={orderBy === 'competitor_count'} direction={order} onClick={() => handleSortRequest('competitor_count')}>Wettbewerber</TableSortLabel></TableCell>}
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredAccounts.map((acc) => (
                                        <TableRow key={acc.id} hover>
                                            <TableCell>
                                                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: 220 }}>
                                                    <Box
                                                        component="img"
                                                        src={resolveAssetUrl(acc.logo_url) || DEFAULT_ACCOUNT_LOGO}
                                                        alt={`${acc.name} Logo`}
                                                        onError={(event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.onerror = null; event.currentTarget.src = DEFAULT_ACCOUNT_LOGO; }}
                                                        sx={{ width: 46, height: 40, flexShrink: 0, objectFit: 'contain', border: '1px solid', borderColor: 'divider', borderRadius: 1.2, p: 0.4, bgcolor: 'background.paper' }}
                                                    />
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Button variant="text" onClick={() => setDetailAccountId(acc.id)} sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 900, color: 'text.primary', textAlign: 'left' }}>{acc.name}</Button>
                                                        {safeWebUrl(acc.website_url) && <MuiLink href={safeWebUrl(acc.website_url)} target="_blank" rel="noopener noreferrer" variant="body2" display="block">{new URL(safeWebUrl(acc.website_url)).hostname}</MuiLink>}
                                                    </Box>
                                                </Stack>
                                            </TableCell>
                                            <TableCell><Chip label={statusMapping[acc.status]} size="small" color={acc.status === 'active_customer' ? 'success' : 'default'} /></TableCell>
                                            <TableCell>{acc.owner_user_name ? <Chip size="small" label={formatAccountOwner(acc.owner_user_name, acc.owner_user_email)} color="primary" variant="outlined" /> : <Typography variant="caption" color="text.secondary">Nicht zugewiesen</Typography>}</TableCell>
                                            <TableCell><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{acc.regions.map(r => <Chip key={r.id} label={r.name} size="small" />)}</Box></TableCell>
                                            <TableCell><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{acc.categories.map(c => <Chip key={c.id} label={c.name} size="small" variant="outlined" />)}</Box></TableCell>
                                            <TableCell align="center"><Chip size="small" label={Number(acc.contact_count || 0)} variant="outlined" /></TableCell>
                                            {businessPartner?.sales_plan === 'premium' && <TableCell align="center">
                                                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center" justifyContent="center" sx={{ minWidth: 170 }}>
                                                    {(acc.competitors || []).slice(0, 2).map((competitor) => <Chip key={competitor.id} size="small" label={competitor.name} />)}
                                                    {Number(acc.competitor_count || 0) > 2 && <Chip size="small" variant="outlined" label={`+${Number(acc.competitor_count) - 2}`} />}
                                                    {Number(acc.competitor_count || 0) === 0 && <Typography variant="caption" color="text.secondary">Keine</Typography>}
                                                    <MuiTooltip title="Wettbewerber verwalten"><IconButton size="small" color="info" onClick={() => handleManageCompetitors(acc.id)}><TrackChangesIcon fontSize="small" /></IconButton></MuiTooltip>
                                                </Stack>
                                            </TableCell>}
                                            <TableCell>
                                                <MuiTooltip title="Details"><IconButton onClick={() => setDetailAccountId(acc.id)}><VisibilityIcon /></IconButton></MuiTooltip>
                                                <MuiTooltip title="Bearbeiten"><IconButton color="primary" onClick={() => handleOpenEditDialog(acc)}><EditIcon /></IconButton></MuiTooltip>
                                                <MuiTooltip title="Löschen"><IconButton color="error" onClick={() => handleDelete(acc.id)}><DeleteIcon /></IconButton></MuiTooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
                
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
                    <DialogTitle>{editingAccount ? 'Account bearbeiten' : 'Neuen Account hinzufügen'}</DialogTitle>
                    <DialogContent dividers>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={8}><TextField label="Name des Accounts" fullWidth value={formName} onChange={(e) => setFormName(e.target.value)} required /></Grid>
                            <Grid item xs={12} md={4}>
                                <TextField select label="Status" fullWidth value={formStatus} onChange={(e) => setFormStatus(e.target.value as any)}>
                                    <MenuItem value="prospect">{statusMapping.prospect}</MenuItem>
                                    <MenuItem value="active_customer">{statusMapping.active_customer}</MenuItem>
                                    <MenuItem value="churned">{statusMapping.churned}</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField select label="Account-Verantwortung" fullWidth value={formOwnerUserId} onChange={(event) => setFormOwnerUserId(event.target.value)} helperText="Nur aktive Mitglieder des Sales-Teams dieses Mandanten">
                                    <MenuItem value="">Nicht zugewiesen</MenuItem>
                                    {accountTeam.map((member) => (
                                        <MenuItem key={member.id} value={member.id}>
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                                <Avatar src={resolveAssetUrl(member.profile_image_url) || undefined} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                                                    {member.name.trim().charAt(0).toUpperCase() || 'U'}
                                                </Avatar>
                                                <Typography variant="body2" noWrap>{formatAccountOwner(member.name, member.email)}</Typography>
                                            </Stack>
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} md={7}><TextField label="Website URL" placeholder="https://…" fullWidth value={formWebsite} onChange={(e) => setFormWebsite(e.target.value)} /></Grid>
                            <Grid item xs={12} md={5}><TextField label="LinkedIn URL" placeholder="https://…" fullWidth value={formLinkedinUrl} onChange={(e) => setFormLinkedinUrl(e.target.value)} /></Grid>
                            <Grid item xs={12} md={7}>
                                <Stack spacing={1.2}>
                                    <TextField label="Logo-URL" placeholder="https://…" fullWidth value={formLogoUrl} onChange={(e) => setFormLogoUrl(e.target.value)} />
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap={{ sm: 'wrap' }}>
                                        <Button component="label" variant="outlined" startIcon={uploadingLogo ? <CircularProgress size={18} /> : <CloudUploadOutlinedIcon />} disabled={uploadingLogo} sx={{ whiteSpace: 'nowrap' }}>
                                            {uploadingLogo ? 'Wird optimiert …' : 'Logo hochladen'}
                                            <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                                        </Button>
                                        <Button variant="outlined" startIcon={<PhotoLibraryOutlinedIcon />} onClick={openLogoLibrary} sx={{ whiteSpace: 'nowrap' }}>Bestehende Logos</Button>
                                        {formLogoUrl && <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setFormLogoUrl('')} sx={{ whiteSpace: 'nowrap' }}>Entfernen</Button>}
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">Uploads werden automatisch auf maximal 320 × 320 px verkleinert und als WebP gespeichert.</Typography>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} md={5}>
                                <Paper variant="outlined" sx={{ minHeight: 132, p: 1.5, display: 'grid', placeItems: 'center', borderRadius: 2 }}>
                                    <Box component="img" src={resolveAssetUrl(formLogoUrl) || DEFAULT_ACCOUNT_LOGO} alt="Logo-Vorschau" onError={(event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.onerror = null; event.currentTarget.src = DEFAULT_ACCOUNT_LOGO; }} sx={{ width: '100%', height: 90, objectFit: 'contain' }} />
                                </Paper>
                            </Grid>
                            <Grid item xs={12}><TextField label="Adresse" fullWidth multiline rows={2} value={formAddress} onChange={(e) => setFormAddress(e.target.value)} /></Grid>
                            <Grid item xs={12} md={6}><TextField type="email" label="Zentrale E-Mail" fullWidth value={formContactEmail} onChange={(e) => setFormContactEmail(e.target.value)} /></Grid>
                            <Grid item xs={12} md={6}><TextField label="Zentrale Telefonnummer" fullWidth value={formContactPhone} onChange={(e) => setFormContactPhone(e.target.value)} /></Grid>
                            <Grid item xs={12}>
                                <TextField select label="Regionen" fullWidth value={formRegionIds} onChange={(e) => setFormRegionIds(e.target.value as unknown as string[])} SelectProps={{ multiple: true, renderValue: (selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(selected as string[]).map(id => <Chip key={id} size="small" label={allRegions.find(r => r.id === id)?.name} />)}</Box>) }}>
                                    {allRegions.map((r) => (<MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>))}
                                </TextField>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField select label="Branchen/Kategorien" fullWidth value={formCategoryIds} onChange={(e) => setFormCategoryIds(e.target.value as unknown as string[])} SelectProps={{ multiple: true, renderValue: (selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(selected as string[]).map(id => <Chip key={id} size="small" label={allCategories.find(c => c.id === id)?.name} />)}</Box>) }}>
                                    {allCategories.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
                                </TextField>
                            </Grid>
                             <Grid item xs={12}><TextField label="Notizen" fullWidth multiline rows={3} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} /></Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog} color="secondary">Abbrechen</Button>
                        <Button onClick={handleSubmit} color="primary" disabled={loading}>{editingAccount ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>

                <Dialog open={logoLibraryOpen} onClose={() => setLogoLibraryOpen(false)} fullWidth maxWidth="md">
                    <DialogTitle>Bestehendes Logo auswählen</DialogTitle>
                    <DialogContent dividers>
                        <TextField fullWidth autoFocus size="small" label="Logos durchsuchen" value={logoLibrarySearch} onChange={(event) => setLogoLibrarySearch(event.target.value)} sx={{ mb: 2 }} />
                        {logoLibraryError && <Alert severity="error" sx={{ mb: 2 }}>{logoLibraryError}</Alert>}
                        {logoLibraryLoading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 5 }}><CircularProgress /></Box> : (
                            <Grid container spacing={1.5}>
                                {filteredLogoLibrary.map((item) => (
                                    <Grid item xs={6} sm={4} md={3} key={item.url}>
                                        <Button variant="outlined" onClick={() => { setFormLogoUrl(item.url); setLogoLibraryOpen(false); }} sx={{ width: '100%', minHeight: 128, p: 1.2, textTransform: 'none', display: 'flex', flexDirection: 'column', gap: 0.7 }}>
                                            <Box component="img" src={resolveAssetUrl(item.url) || DEFAULT_ACCOUNT_LOGO} alt={`${item.label} Logo`} onError={(event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.onerror = null; event.currentTarget.src = DEFAULT_ACCOUNT_LOGO; }} sx={{ width: '100%', height: 62, objectFit: 'contain' }} />
                                            <Typography variant="caption" fontWeight={800} noWrap sx={{ width: '100%' }}>{item.label}</Typography>
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ width: '100%' }}>{item.source}</Typography>
                                        </Button>
                                    </Grid>
                                ))}
                                {filteredLogoLibrary.length === 0 && <Grid item xs={12}><Alert severity="info">Keine passenden Logos gefunden.</Alert></Grid>}
                            </Grid>
                        )}
                    </DialogContent>
                    <DialogActions><Button onClick={() => setLogoLibraryOpen(false)}>Schließen</Button></DialogActions>
                </Dialog>

                <AccountDetailDialog
                    open={Boolean(detailAccountId)}
                    accountId={detailAccountId}
                    onClose={() => setDetailAccountId(null)}
                    onEdit={(account: AccountDetailRecord) => {
                        setDetailAccountId(null);
                        handleOpenEditDialog(account as Account);
                    }}
                    showCompetitors={businessPartner?.sales_plan === 'premium'}
                    onManageCompetitors={businessPartner?.sales_plan === 'premium' ? (account) => handleManageCompetitors(account.id) : undefined}
                    onChanged={fetchData}
                />
            </Container>
        </DashboardLayout>
    );
};

export default AdminBpAccountsPage;
